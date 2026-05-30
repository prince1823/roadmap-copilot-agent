import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/agent/loop.js";
import type OpenAI from "openai";

// ── Helper to create a mock OpenAI client ──

function createMockClient(
  responses: Array<{
    message: Partial<OpenAI.Chat.Completions.ChatCompletionMessage>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  } | Error>
): OpenAI {
  let callIndex = 0;

  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const response = responses[callIndex++];
          if (!response) {
            throw new Error("No more mock responses");
          }
          if (response instanceof Error) {
            throw response;
          }
          return {
            choices: [{ message: response.message }],
            usage: response.usage ?? {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          };
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("Agent error handling — invalid model output with retry and fallback", () => {
  it("should fall back after LLM repeatedly fails", async () => {
    const client = createMockClient([
      new Error("API rate limit exceeded"),
      new Error("API rate limit exceeded"),
    ]);

    const result = await runAgentLoop({
      client,
      model: "test-model",
      provider: "test",
      request: {
        user_message: "Update my roadmap",
        session_history: [],
        token_budget_per_model_call: 4096,
        max_steps: 5,
      },
    });

    expect(result.success).toBe(false);
    expect(result.final_message).toContain("encountered an issue");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.action === "fallback")).toBe(true);
    expect(result.provider).toBe("test");
    expect(result.model).toBe("test-model");
  });

  it("should recover after first LLM call fails but retry succeeds", async () => {
    const client = createMockClient([
      new Error("Temporary error"),
      // Retry succeeds with a finish tool call
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "tc_1",
              type: "function" as const,
              function: {
                name: "finish",
                arguments: JSON.stringify({
                  final_message: "Recovered successfully!",
                  roadmap_updated: false,
                }),
              },
            },
          ],
        },
      },
    ]);

    const result = await runAgentLoop({
      client,
      model: "test-model",
      provider: "test",
      request: {
        user_message: "Test retry",
        session_history: [],
        token_budget_per_model_call: 4096,
        max_steps: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(result.final_message).toBe("Recovered successfully!");
  });
});

describe("Agent error handling — timeout", () => {
  it("should return structured error on timeout without crashing", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "AbortError";

    const client = createMockClient([timeoutError, timeoutError]);

    const result = await runAgentLoop({
      client,
      model: "test-model",
      provider: "test",
      request: {
        user_message: "This will timeout",
        session_history: [],
        token_budget_per_model_call: 4096,
        max_steps: 5,
      },
      timeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.final_message).toContain("encountered an issue");
    expect(result.slug).toBeDefined();
    expect(result.steps).toBeDefined();
    expect(result.context_trace).toBeDefined();
    expect(result.provider).toBe("test");
    expect(result.model).toBe("test-model");

    // Verify it's a proper timeout step
    const timeoutStep = result.steps.find((s) => s.action === "timeout");
    expect(timeoutStep).toBeDefined();
  });
});

describe("Agent error handling — invalid tool arguments from model", () => {
  it("should handle malformed JSON in tool arguments gracefully", async () => {
    const client = createMockClient([
      // Model returns garbage JSON in tool args
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "tc_bad",
              type: "function" as const,
              function: {
                name: "get_user_profile",
                arguments: "{ not valid json !!!",
              },
            },
          ],
        },
      },
      // Then model recovers with finish
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "tc_finish",
              type: "function" as const,
              function: {
                name: "finish",
                arguments: JSON.stringify({
                  final_message: "Recovered from bad tool call",
                  roadmap_updated: false,
                }),
              },
            },
          ],
        },
      },
    ]);

    const result = await runAgentLoop({
      client,
      model: "test-model",
      provider: "test",
      request: {
        user_message: "Test bad args",
        session_history: [],
        token_budget_per_model_call: 4096,
        max_steps: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(result.final_message).toBe("Recovered from bad tool call");
    // First step should record the parse error
    const errorStep = result.steps.find(
      (s) => s.action === "tool_call_parse_error"
    );
    expect(errorStep).toBeDefined();
  });
});
