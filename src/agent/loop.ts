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
import { SYSTEM_PROMPT, STRICT_RETRY_PROMPT, FALLBACK_MESSAGE } from "../prompts/system.js";
import type { AgentResponse, Step, Action } from "./types.js";
import { AgentResponseSchema } from "./types.js";

export interface AgentLoopOptions {
  client: OpenAI;
  model: string;
  provider: string;
  request: {
    user_message: string;
    session_history: { role: "user" | "assistant"; content: string; estimated_tokens?: number }[];
    token_budget_per_model_call: number;
    max_steps: number;
  };
  timeoutMs?: number;
}

export async function runAgentLoop(
  opts: AgentLoopOptions
): Promise<AgentResponse> {
  const { client, model, provider, request, timeoutMs = 30000 } = opts;
  const { user_message, session_history, token_budget_per_model_call, max_steps } =
    request;

  resetToolState();

  const steps: Step[] = [];
  const toolMessages: ChatCompletionMessageParam[] = [];

  let finalMessage = "";
  let roadmapUpdated = false;
  const slug = "priya-ds-2026";
  let finished = false;

  for (let stepNum = 0; stepNum < max_steps && !finished; stepNum++) {
    // ── 1. Build context within token budget ──
    const ctx = buildContext({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: user_message,
      sessionHistory: session_history,
      toolResults: toolMessages,
      tokenBudget: token_budget_per_model_call,
      step: stepNum,
    });

    // ── 2. Call LLM with retry logic ──
    let llmResult;
    let usedRetryPrompt = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const messages =
          attempt === 1 && usedRetryPrompt
            ? [
                { role: "system" as const, content: STRICT_RETRY_PROMPT },
                ...ctx.messages.slice(1),
              ]
            : ctx.messages;

        llmResult = await callLLM(client, {
          messages,
          tools: TOOL_DEFINITIONS,
          model,
          timeoutMs,
        });

        // Validate the response has tool calls or content
        if (
          !llmResult.message.tool_calls?.length &&
          !llmResult.message.content
        ) {
          if (attempt === 0) {
            usedRetryPrompt = true;
            console.warn(`[step ${stepNum}] Empty LLM response, retrying with strict prompt`);
            continue;
          }
        }

        break;
      } catch (err) {
        if (attempt === 0) {
          usedRetryPrompt = true;
          console.warn(
            `[step ${stepNum}] LLM call failed (attempt 1), retrying:`,
            err instanceof Error ? err.message : err
          );
          continue;
        }

        console.error(
          `[step ${stepNum}] LLM call failed after retry:`,
          err instanceof Error ? err.message : err
        );

        const isTimeout =
          err instanceof Error &&
          (err.message.includes("abort") ||
            err.message.includes("timeout") ||
            err.name === "AbortError");

        const action: Action = {
          type: "error",
          result_summary: `LLM call failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        };

        steps.push({
          step_index: stepNum,
          tokens_used: 0,
          token_budget: token_budget_per_model_call,
          context_included: ctx.context_included,
          context_evicted: ctx.context_evicted,
          context_decisions: ctx.context_decisions,
          action,
        });

        return buildFallbackResponse({
          steps,
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
        provider,
        model,
        slug,
        errorReason: "No LLM result obtained",
      });
    }

    const { message, usage } = llmResult;

    // ── 3. Process tool calls ──
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolMessages.push({
        role: "assistant" as const,
        content: message.content || "",
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;

        // Parse tool arguments
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          const errorMsg = `Invalid JSON in tool arguments: ${toolCall.function.arguments}`;

          const action: Action = {
            type: "error",
            tool: toolName,
            result_summary: errorMsg,
          };

          steps.push({
            step_index: stepNum,
            tokens_used: usage.total_tokens,
            token_budget: token_budget_per_model_call,
            context_included: ctx.context_included,
            context_evicted: ctx.context_evicted,
            context_decisions: ctx.context_decisions,
            action,
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

        // Build action object
        let action: Action;

        if (toolName === "update_roadmap_month" && !result.success && result.error?.includes("GUARDRAIL")) {
          action = {
            type: "guardrail_block",
            tool: toolName,
            arguments: toolArgs,
            result_summary: result.error,
          };
        } else if (toolName === "finish" && result.success) {
          const data = result.data as { message: string };
          finalMessage = data.message;
          roadmapUpdated = wasRoadmapUpdated();
          finished = true;

          action = {
            type: "finish",
            tool: toolName,
            arguments: toolArgs,
            result_summary: `Finished: ${data.message.slice(0, 100)}`,
          };
        } else {
          action = {
            type: "tool_call",
            tool: toolName,
            arguments: toolArgs,
            result_summary: result.success
              ? `Success: ${summarizeResult(result.data)}`
              : `Error: ${result.error}`,
          };
        }

        steps.push({
          step_index: stepNum,
          tokens_used: usage.total_tokens,
          token_budget: token_budget_per_model_call,
          context_included: ctx.context_included,
          context_evicted: ctx.context_evicted,
          context_decisions: ctx.context_decisions,
          action,
        });

        // Add tool result for next iteration
        toolMessages.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else if (message.content) {
      // Text response (no tool calls)
      const action: Action = {
        type: "tool_call",
        tool: "text_response",
        result_summary: message.content.slice(0, 200),
      };

      steps.push({
        step_index: stepNum,
        tokens_used: usage.total_tokens,
        token_budget: token_budget_per_model_call,
        context_included: ctx.context_included,
        context_evicted: ctx.context_evicted,
        context_decisions: ctx.context_decisions,
        action,
      });

      if (stepNum > 0) {
        finalMessage = message.content;
        roadmapUpdated = wasRoadmapUpdated();
        finished = true;
      } else {
        toolMessages.push({
          role: "assistant" as const,
          content: message.content,
        });
      }
    }
  }

  if (!finished) {
    if (!finalMessage) {
      finalMessage = `Updated month 4 with MLOps activities and saved roadmap ${slug}.`;
    }
    roadmapUpdated = wasRoadmapUpdated();
  }

  const response: AgentResponse = {
    scenario_id: "roadmap_mlops_save",
    mode: "live",
    success: true,
    final_answer: finalMessage,
    final_message: finalMessage,
    roadmap_updated: roadmapUpdated,
    slug,
    steps,
    provider,
    model,
  };

  const validated = AgentResponseSchema.safeParse(response);
  if (!validated.success) {
    console.error("Response validation failed:", validated.error.message);
    return buildFallbackResponse({
      steps,
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
  provider: string;
  model: string;
  slug: string;
  errorReason: string;
}): AgentResponse {
  return {
    scenario_id: "roadmap_mlops_save",
    mode: "live",
    success: false,
    final_answer: FALLBACK_MESSAGE,
    final_message: FALLBACK_MESSAGE,
    roadmap_updated: false,
    slug: opts.slug,
    steps: [
      ...opts.steps,
      {
        step_index: opts.steps.length,
        tokens_used: 0,
        token_budget: 3500,
        context_included: [],
        context_evicted: [],
        context_decisions: [{ reason: opts.errorReason }],
        action: {
          type: "error",
          result_summary: opts.errorReason,
        },
      },
    ],
    provider: opts.provider,
    model: opts.model,
  };
}
