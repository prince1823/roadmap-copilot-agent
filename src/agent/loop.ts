import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type OpenAI from "openai";
import { callLLM } from "../llm/client.js";
import { buildContext } from "./context.js";
import {
  executeTool,
  TOOL_DEFINITIONS,
  resetToolState,
  wasRoadmapUpdated,
} from "../tools/registry.js";
import { SYSTEM_PROMPT, FALLBACK_MESSAGE } from "../prompts/system.js";
import type {
  AgentResponse,
  Step,
  ContextTraceEntry,
  RunRequest,
} from "./types.js";
import { AgentResponseSchema } from "./types.js";

export interface AgentLoopOptions {
  client: OpenAI;
  model: string;
  provider: string;
  request: RunRequest;
  timeoutMs?: number;
}

export async function runAgentLoop(
  opts: AgentLoopOptions
): Promise<AgentResponse> {
  const { client, model, provider, request, timeoutMs = 30000 } = opts;
  const { user_message, session_history, token_budget_per_model_call, max_steps } =
    request;

  // Reset tool state for each run
  resetToolState();

  const steps: Step[] = [];
  const contextTrace: ContextTraceEntry[] = [];
  const toolMessages: ChatCompletionMessageParam[] = [];

  let finalMessage = "";
  let roadmapUpdated = false;
  let slug = "mlops-fundamentals"; // default from mock
  let finished = false;

  for (let stepNum = 1; stepNum <= max_steps && !finished; stepNum++) {
    // ── 1. Build context within token budget ──
    const { messages, trace } = buildContext({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: user_message,
      sessionHistory: session_history,
      toolResults: toolMessages,
      tokenBudget: token_budget_per_model_call,
      step: stepNum,
    });
    contextTrace.push(trace);

    // ── 2. Call LLM with retry logic ──
    let llmResult;
    let retried = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        llmResult = await callLLM(client, {
          messages,
          tools: TOOL_DEFINITIONS,
          model,
          timeoutMs,
        });
        break;
      } catch (err) {
        if (attempt === 0) {
          retried = true;
          console.warn(
            `[step ${stepNum}] LLM call failed (attempt 1), retrying:`,
            err instanceof Error ? err.message : err
          );
          continue;
        }
        // Second attempt failed → deterministic fallback
        console.error(
          `[step ${stepNum}] LLM call failed after retry:`,
          err instanceof Error ? err.message : err
        );

        const isTimeout =
          err instanceof Error &&
          (err.message.includes("abort") ||
            err.message.includes("timeout") ||
            err.name === "AbortError");

        steps.push({
          step: stepNum,
          action: isTimeout ? "timeout" : "error",
          tool: null,
          tool_args: null,
          result_summary: `LLM call failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });

        return buildFallbackResponse({
          steps,
          contextTrace,
          provider,
          model,
          slug,
          errorReason: isTimeout
            ? "LLM call timed out after retry"
            : "LLM call failed after retry",
        });
      }
    }

    if (!llmResult) {
      return buildFallbackResponse({
        steps,
        contextTrace,
        provider,
        model,
        slug,
        errorReason: "No LLM result obtained",
      });
    }

    const { message, usage } = llmResult;

    // ── 3. Process tool calls ──
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Add the assistant message with tool calls
      toolMessages.push({
        role: "assistant" as const,
        content: message.content || "",
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;

        // Parse and validate tool arguments
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          // Invalid JSON from model — record step and add error as tool result
          const errorMsg = `Invalid JSON in tool arguments: ${toolCall.function.arguments}`;
          steps.push({
            step: stepNum,
            action: "tool_call_parse_error",
            tool: toolName,
            tool_args: null,
            result_summary: errorMsg,
            tokens_used: usage.total_tokens,
          });

          toolMessages.push({
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: errorMsg }),
          });
          continue;
        }

        // Execute the tool
        const result = executeTool(toolName, toolArgs);

        // Handle finish tool
        if (toolName === "finish" && result.success) {
          const data = result.data as {
            final_message: string;
            roadmap_updated: boolean;
          };
          finalMessage = data.final_message;
          roadmapUpdated = data.roadmap_updated || wasRoadmapUpdated();
          finished = true;
        }

        steps.push({
          step: stepNum,
          action: `tool_call`,
          tool: toolName,
          tool_args: toolArgs,
          result_summary: result.success
            ? `Success: ${summarizeResult(result.data)}`
            : `Error: ${result.error}`,
          tokens_used: usage.total_tokens,
        });

        // Add tool result message for next iteration
        toolMessages.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else if (message.content) {
      // Model responded with text only (no tool calls)
      // This could be the final response if it decided not to use tools
      steps.push({
        step: stepNum,
        action: "text_response",
        tool: null,
        tool_args: null,
        result_summary: message.content.slice(0, 200),
        tokens_used: usage.total_tokens,
      });

      // If the model doesn't call any tools, treat as implicit finish
      if (stepNum > 1) {
        finalMessage = message.content;
        roadmapUpdated = wasRoadmapUpdated();
        finished = true;
      } else {
        // On the first step without tool calls, add as context and continue
        toolMessages.push({
          role: "assistant" as const,
          content: message.content,
        });
      }
    }
  }

  // If loop exhausted without finish, use last available content
  if (!finished) {
    if (!finalMessage) {
      finalMessage =
        "I've gathered the information but ran out of steps. Here's what I found based on your roadmap and the knowledge base.";
    }
    roadmapUpdated = wasRoadmapUpdated();
  }

  const response: AgentResponse = {
    success: true,
    final_message: finalMessage,
    roadmap_updated: roadmapUpdated,
    slug,
    steps,
    context_trace: contextTrace,
    provider,
    model,
  };

  // Validate our own output
  const validated = AgentResponseSchema.safeParse(response);
  if (!validated.success) {
    console.error("Response validation failed:", validated.error.message);
    return buildFallbackResponse({
      steps,
      contextTrace,
      provider,
      model,
      slug,
      errorReason: `Output validation failed: ${validated.error.message}`,
    });
  }

  return validated.data;
}

// ── Helpers ──

function summarizeResult(data: unknown): string {
  if (!data) return "no data";
  const str = JSON.stringify(data);
  return str.length > 150 ? str.slice(0, 150) + "..." : str;
}

function buildFallbackResponse(opts: {
  steps: Step[];
  contextTrace: ContextTraceEntry[];
  provider: string;
  model: string;
  slug: string;
  errorReason: string;
}): AgentResponse {
  return {
    success: false,
    final_message: FALLBACK_MESSAGE,
    roadmap_updated: false,
    slug: opts.slug,
    steps: [
      ...opts.steps,
      {
        step: opts.steps.length + 1,
        action: "fallback",
        tool: null,
        tool_args: null,
        result_summary: opts.errorReason,
      },
    ],
    context_trace: opts.contextTrace,
    provider: opts.provider,
    model: opts.model,
  };
}
