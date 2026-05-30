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
      expect(tokens).toBeGreaterThanOrEqual(5);
    });

    it("should handle empty content", () => {
      const tokens = estimateMessageTokens({ role: "user", content: "" });
      expect(tokens).toBe(4); // just overhead
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
        step: 0,
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[result.messages.length - 1].role).toBe("user");
      expect(result.context_included).toContain("system_prompt");
      expect(result.context_included).toContain("user_message");
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
        step: 0,
      });

      expect(result.context_included).toContain("history_0_user");
      expect(result.context_included).toContain("history_1_assistant");
    });

    it("should evict low-priority items when budget is tight", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "A very long message ".repeat(50) },
          { role: "assistant", content: "Another long response ".repeat(50) },
        ],
        toolResults: [],
        tokenBudget: 40,
        step: 0,
      });

      expect(result.context_included).toContain("system_prompt");
      expect(result.context_included).toContain("user_message");
      expect(result.context_evicted.length).toBeGreaterThan(0);
    });

    it("should prioritize tool results over session history", () => {
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
        step: 1,
      });

      const toolIncluded = result.context_included.some((l) =>
        l.startsWith("tool_result_")
      );
      const historyEvicted = result.context_evicted.some((l) =>
        l.startsWith("history_")
      );

      expect(toolIncluded).toBe(true);
      expect(historyEvicted).toBe(true);
    });

    it("should deprioritize noisy content (transfer learning)", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [
          { role: "user", content: "What is transfer learning?" },
          {
            role: "assistant",
            content:
              "Transfer learning is a technique using pretrained weights and fine-tuning for new tasks...",
          },
          { role: "user", content: "Show me month 3" },
          { role: "assistant", content: "Month 3 covers regression." },
        ],
        toolResults: [],
        tokenBudget: 150,
        step: 0,
      });

      // The transfer learning content should be deprioritized
      const decisions = result.context_decisions;
      const noiseDecision = decisions.find((d) =>
        d.reason.toLowerCase().includes("off-topic") || d.reason.toLowerCase().includes("noise")
      );
      expect(noiseDecision).toBeDefined();
    });

    it("should compact large roadmap JSON in tool results", () => {
      const largeRoadmap = JSON.stringify({
        success: true,
        data: {
          id: "rdmp_9f2a",
          slug: "priya-ds-2026",
          title: "6-month Data Science Path",
          months: [
            { month: 1, title: "Python", activities: ["a", "b", "c"] },
            { month: 2, title: "Stats", activities: ["d", "e", "f"] },
            { month: 3, title: "ML", activities: ["g", "h", "i"] },
            { month: 4, title: "Tuning", activities: ["j", "k", "l", "m"] },
            { month: 5, title: "Project", activities: ["n", "o"] },
            { month: 6, title: "Portfolio", activities: ["p", "q"] },
          ],
          revision_history: [
            { at: "2026-02-01", note: "x".repeat(200) },
          ],
        },
      });

      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [],
        toolResults: [
          {
            role: "tool" as const,
            tool_call_id: "tc_roadmap",
            content: largeRoadmap,
          },
        ],
        tokenBudget: 500,
        step: 1,
      });

      const compactDecision = result.context_decisions.find((d) =>
        d.reason.toLowerCase().includes("compact")
      );
      expect(compactDecision).toBeDefined();
    });

    it("should record budget and tokens_used", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [],
        toolResults: [],
        tokenBudget: 500,
        step: 0,
      });

      expect(result.token_budget).toBe(500);
      expect(result.tokens_used).toBeGreaterThan(0);
      expect(result.tokens_used).toBeLessThanOrEqual(500);
    });

    it("should maintain correct message order", () => {
      const result = buildContext({
        systemPrompt,
        userMessage,
        sessionHistory: [{ role: "user", content: "earlier" }],
        toolResults: [
          { role: "tool" as const, tool_call_id: "tc_1", content: "output" },
        ],
        tokenBudget: 500,
        step: 1,
      });

      expect(result.messages[0].role).toBe("system");
      expect(result.messages[result.messages.length - 1].role).toBe("user");
    });
  });
});
