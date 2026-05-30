import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/agent/loop.js";
import type OpenAI from "openai";

function createMockClient(
  responses: Array<
    | {
        message: Partial<OpenAI.Chat.Completions.ChatCompletionMessage>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      }
    | Error
  >
): OpenAI {
  let callIndex = 0;

  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const response = responses[callIndex++];
          if (!response) throw new Error("No more mock responses");
          if (response instanceof Error) throw response;
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

describe("Invalid model output — retry with strict prompt and fallback", () => {
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
        user_message: "Add MLOps to month 4",
        session_history: [],
        token_budget_per_model_call: 3500,
        max_steps: 8,
      },
    });

    expect(result.success).toBe(false);
    expect(result.final_message).toContain("encountered an issue");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.action.type === "error")).toBe(true);
    expect(result.provider).toBe("test");
    expect(result.model).toBe("test-model");
    expect(result.scenario_id).toBe("roadmap_mlops_save");
  });

  it("should recover after first LLM call fails but retry succeeds", async () => {
    const client = createMockClient([
      new Error("Temporary error"),
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
                  message: "Recovered! Updated month 4 with MLOps and saved roadmap priya-ds-2026.",
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
        token_budget_per_model_call: 3500,
        max_steps: 8,
      },
    });

    expect(result.success).toBe(true);
    expect(result.final_message).toContain("Recovered");
  });
});

describe("Timeout handling — structured response, no crash", () => {
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
        token_budget_per_model_call: 3500,
        max_steps: 8,
      },
      timeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.final_message).toBeDefined();
    expect(result.slug).toBe("priya-ds-2026");
    expect(result.steps).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.provider).toBe("test");
    expect(result.model).toBe("test-model");
    expect(result.scenario_id).toBe("roadmap_mlops_save");
    expect(result.mode).toBe("live");
  });
});

describe("Malformed tool arguments from model", () => {
  it("should handle invalid JSON in tool arguments and continue", async () => {
    const client = createMockClient([
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
                  message: "Recovered from bad tool call. Updated month 4 with MLOps and saved roadmap priya-ds-2026.",
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
        token_budget_per_model_call: 3500,
        max_steps: 8,
      },
    });

    expect(result.success).toBe(true);
    const errorStep = result.steps.find((s) => s.action.type === "error");
    expect(errorStep).toBeDefined();
  });
});
