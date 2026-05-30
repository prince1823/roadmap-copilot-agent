import { describe, it, expect, beforeEach } from "vitest";
import { executeTool, resetToolState, wasRoadmapUpdated } from "../src/tools/registry.js";

describe("Confirm-before-write guardrail", () => {
  beforeEach(() => {
    resetToolState();
  });

  it("should REJECT update_roadmap_month when confirmed=false", () => {
    const result = executeTool("update_roadmap_month", {
      roadmap_id: "rdmp_9f2a",
      month: 4,
      title: "MLOps",
      activities: ["mlflow", "ci_pipeline"],
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("GUARDRAIL");
    expect(result.error).toContain("confirmed=true");
    expect(wasRoadmapUpdated()).toBe(false);
  });

  it("should ACCEPT update_roadmap_month when confirmed=true", () => {
    const result = executeTool("update_roadmap_month", {
      roadmap_id: "rdmp_9f2a",
      month: 4,
      title: "MLOps & Deployment",
      activities: ["mlflow_tracking", "model_registry", "ci_pipeline"],
      confirmed: true,
    });

    expect(result.success).toBe(true);
    expect(wasRoadmapUpdated()).toBe(true);
  });

  it("should REJECT when confirmed field is missing", () => {
    const result = executeTool("update_roadmap_month", {
      roadmap_id: "rdmp_9f2a",
      month: 4,
      title: "MLOps",
      activities: ["mlflow"],
    });

    expect(result.success).toBe(false);
    expect(wasRoadmapUpdated()).toBe(false);
  });

  it("should REJECT when roadmap_id does not match", () => {
    const result = executeTool("update_roadmap_month", {
      roadmap_id: "wrong_id",
      month: 4,
      title: "MLOps",
      activities: ["mlflow"],
      confirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should REJECT when month is out of range", () => {
    const result = executeTool("update_roadmap_month", {
      roadmap_id: "rdmp_9f2a",
      month: 99,
      title: "Invalid",
      activities: [],
      confirmed: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("Tool argument validation", () => {
  it("should reject unknown tools", () => {
    const result = executeTool("nonexistent_tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("should accept valid get_user_profile call (no args)", () => {
    const result = executeTool("get_user_profile", {});
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("should accept valid get_roadmap call", () => {
    const result = executeTool("get_roadmap", { roadmap_id: "rdmp_9f2a" });
    expect(result.success).toBe(true);
  });

  it("should reject get_roadmap with missing roadmap_id", () => {
    const result = executeTool("get_roadmap", {});
    expect(result.success).toBe(false);
  });

  it("should accept valid search_kb call", () => {
    const result = executeTool("search_kb", { query: "mlops month 4" });
    expect(result.success).toBe(true);
  });

  it("should accept valid finish call", () => {
    const result = executeTool("finish", {
      message: "Done! Updated month 4 with MLOps and saved roadmap priya-ds-2026.",
    });
    expect(result.success).toBe(true);
  });
});
