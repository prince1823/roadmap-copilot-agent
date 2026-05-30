import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { AgentResponseSchema } from "../src/agent/types.js";

describe("Response validation — examples/response.json", () => {
  const RESPONSE_PATH = "examples/response.json";

  it("should exist on disk", () => {
    expect(existsSync(RESPONSE_PATH)).toBe(true);
  });

  it("should be valid JSON", () => {
    const raw = readFileSync(RESPONSE_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should conform to AgentResponseSchema", () => {
    const raw = JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"));
    const result = AgentResponseSchema.safeParse(raw);
    if (!result.success) {
      console.error(result.error.errors);
    }
    expect(result.success).toBe(true);
  });

  it("should contain required fields with valid values", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    expect(typeof data.success).toBe("boolean");
    expect(data.final_message.length).toBeGreaterThan(0);
    expect(data.slug.length).toBeGreaterThan(0);
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.context_trace.length).toBeGreaterThan(0);
    expect(data.provider.length).toBeGreaterThan(0);
    expect(data.model.length).toBeGreaterThan(0);
  });

  it("should include tool calls in steps", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    const toolCalls = data.steps.filter((s) => s.tool !== null);
    expect(toolCalls.length).toBeGreaterThan(0);
  });

  it("should track token budget in context_trace", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    for (const entry of data.context_trace) {
      expect(entry.budget).toBeGreaterThan(0);
      expect(entry.total_tokens).toBeGreaterThan(0);
      expect(entry.total_tokens).toBeLessThanOrEqual(entry.budget);
    }
  });
});
