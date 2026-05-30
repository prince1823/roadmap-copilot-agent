import { describe, it, expect } from "vitest";
import { executeTool, resetToolState, wasRoadmapUpdated } from "../src/tools/registry.js";

describe("Confirm-before-write guardrail", () => {
  beforeEach(() => {
    resetToolState();
  });

  it("should REJECT update_roadmap_month when confirmed=false", () => {
    const result = executeTool("update_roadmap_month", {
      user_id: "usr_8a3f1b",
      slug: "mlops-fundamentals",
      month: 3,
      goals: ["New goal"],
      resources: ["New resource"],
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("GUARDRAIL");
    expect(result.error).toContain("confirmed=true");
    expect(wasRoadmapUpdated()).toBe(false);
  });

  it("should ACCEPT update_roadmap_month when confirmed=true", () => {
    const result = executeTool("update_roadmap_month", {
      user_id: "usr_8a3f1b",
      slug: "mlops-fundamentals",
      month: 3,
      goals: ["Updated goal 1", "Updated goal 2"],
      resources: ["Resource A", "Resource B"],
      confirmed: true,
    });

    expect(result.success).toBe(true);
    expect(wasRoadmapUpdated()).toBe(true);
  });

  it("should REJECT when confirmed field is missing", () => {
    const result = executeTool("update_roadmap_month", {
      user_id: "usr_8a3f1b",
      slug: "mlops-fundamentals",
      month: 3,
      goals: ["Goal"],
      resources: ["Resource"],
      // confirmed is missing
    });

    expect(result.success).toBe(false);
    expect(wasRoadmapUpdated()).toBe(false);
  });

  it("should REJECT when user_id does not match", () => {
    const result = executeTool("update_roadmap_month", {
      user_id: "usr_wrong",
      slug: "mlops-fundamentals",
      month: 3,
      goals: ["Goal"],
      resources: ["Resource"],
      confirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should REJECT when month is out of range", () => {
    const result = executeTool("update_roadmap_month", {
      user_id: "usr_8a3f1b",
      slug: "mlops-fundamentals",
      month: 99,
      goals: ["Goal"],
      resources: ["Resource"],
      confirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Month 99 not found");
  });
});

describe("Tool argument validation", () => {
  it("should reject unknown tools", () => {
    const result = executeTool("nonexistent_tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("should reject invalid arguments for get_user_profile", () => {
    const result = executeTool("get_user_profile", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid arguments");
  });

  it("should reject invalid arguments for search_kb", () => {
    const result = executeTool("search_kb", { query: 123 });
    expect(result.success).toBe(false);
  });

  it("should accept valid get_user_profile call", () => {
    const result = executeTool("get_user_profile", { user_id: "usr_8a3f1b" });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("should accept valid search_kb call", () => {
    const result = executeTool("search_kb", { query: "mlflow", top_k: 2 });
    expect(result.success).toBe(true);
  });

  it("should accept valid finish call", () => {
    const result = executeTool("finish", {
      final_message: "Done!",
      roadmap_updated: false,
    });
    expect(result.success).toBe(true);
  });
});
