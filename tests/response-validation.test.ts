import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { AgentResponseSchema } from "../src/agent/types.js";

describe("Valid live run — examples/response.json", () => {
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

  it("should contain all required response fields", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    expect(data.scenario_id).toBe("roadmap_mlops_save");
    expect(data.mode).toBe("live");
    expect(typeof data.success).toBe("boolean");
    expect(data.final_answer.length).toBeGreaterThan(0);
    expect(data.final_message.length).toBeGreaterThan(0);
    expect(data.slug).toBe("priya-ds-2026");
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.provider.length).toBeGreaterThan(0);
    expect(data.model.length).toBeGreaterThan(0);
  });

  it("should include tool actions in steps", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    const toolActions = data.steps.filter(
      (s) => s.action.tool !== undefined
    );
    expect(toolActions.length).toBeGreaterThan(0);
  });

  it("should track token budget in every step", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    for (const step of data.steps) {
      expect(step.token_budget).toBeGreaterThan(0);
      expect(step.tokens_used).toBeGreaterThanOrEqual(0);
      expect(step.context_included.length).toBeGreaterThan(0);
    }
  });

  it("should have context_included and context_evicted arrays in steps", () => {
    const data = AgentResponseSchema.parse(
      JSON.parse(readFileSync(RESPONSE_PATH, "utf-8"))
    );
    for (const step of data.steps) {
      expect(Array.isArray(step.context_included)).toBe(true);
      expect(Array.isArray(step.context_evicted)).toBe(true);
    }
  });
});
