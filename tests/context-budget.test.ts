import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  buildContext,
} from "../src/agent/context.js";

describe("Context budget logic", () => {
  describe("estimateTokens", () => {
    it("should estimate ~1 token per 4 characters", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("abcd")).toBe(1);
      expect(estimateTokens("hello world!")).toBe(3);
      expect(estimateTokens("a".repeat(100))).toBe(25);
    });
  });

  describe("estimateMessageTokens", () => {
    it("should include overhead for role", () => {
      const tokens = estimateMessageTokens({ role: "user", content: "hi" });
      // "hi" = 1 token + 4 overhead = 5
      expect(tokens).toBeGreaterThanOrEqual(5);
    });

    it("should handle empty content", () => {
      const tokens = estimateMessageTokens({ role: "user", content: "" });
      // 0 + 4 overhead
      expect(tokens).toBe(4);
    });
  });

  describe("buildContext", () => {
    const systemPrompt = "You are a helpful assistant.";
    const userMessage = "Update my roadmap.";

    it("should always include system prompt and user message", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [],
        toolResults: [],
        tokenBudget: 100,
        step: 1,
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[1].role).toBe("user");
      expect(result.trace.included).toContain("system_prompt");
      expect(result.trace.included).toContain("user_message");
    });

    it("should include session history when budget allows", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there" },
        ],
        toolResults: [],
        tokenBudget: 500,
        step: 1,
      });

      expect(result.trace.included).toContain("history_0");
      expect(result.trace.included).toContain("history_1");
    });

    it("should evict low-priority items when budget is tight", () => {
      // Very tight budget — only system + user should fit
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "A very long message ".repeat(50) },
          { role: "assistant", content: "Another long response ".repeat(50) },
        ],
        toolResults: [],
        tokenBudget: 40,
        step: 1,
      });

      expect(result.trace.included).toContain("system_prompt");
      expect(result.trace.included).toContain("user_message");
      expect(result.trace.evicted.length).toBeGreaterThan(0);
    });

    it("should prioritize tool results over session history", () => {
      // Budget enough for system + user + tool result but not history
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "x".repeat(200) },
        ],
        toolResults: [
          {
            role: "tool" as const,
            tool_call_id: "tc_1",
            content: JSON.stringify({ success: true, data: "result" }),
          },
        ],
        tokenBudget: 50,
        step: 2,
      });

      // Tool results are high priority, history is medium
      const toolIncluded = result.trace.included.some((l) =>
        l.startsWith("tool_result_")
      );
      const historyEvicted = result.trace.evicted.some((l) =>
        l.startsWith("history_")
      );

      expect(toolIncluded).toBe(true);
      expect(historyEvicted).toBe(true);
    });

    it("should record budget and total_tokens in trace", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [],
        toolResults: [],
        tokenBudget: 500,
        step: 3,
      });

      expect(result.trace.budget).toBe(500);
      expect(result.trace.total_tokens).toBeGreaterThan(0);
      expect(result.trace.total_tokens).toBeLessThanOrEqual(500);
      expect(result.trace.step).toBe(3);
    });

    it("should maintain correct message order: system → history → tools → user", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "earlier message" },
        ],
        toolResults: [
          {
            role: "tool" as const,
            tool_call_id: "tc_1",
            content: "tool output",
          },
        ],
        tokenBudget: 500,
        step: 2,
      });

      expect(result.messages[0].role).toBe("system");
      expect(result.messages[result.messages.length - 1].role).toBe("user");
    });
  });
});
