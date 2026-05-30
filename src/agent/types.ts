import { z } from "zod";

// ── Tool argument schemas ──

export const GetUserProfileArgs = z.object({});

export const GetRoadmapArgs = z.object({
  roadmap_id: z.string(),
});

export const SearchKbArgs = z.object({
  query: z.string(),
});

export const UpdateRoadmapMonthArgs = z.object({
  roadmap_id: z.string(),
  month: z.number().int().min(1).max(12),
  title: z.string(),
  activities: z.array(z.string()),
  confirmed: z.boolean(),
});

export const FinishArgs = z.object({
  message: z.string(),
});

// ── Action schema (per step) ──

export const ActionSchema = z.object({
  type: z.enum(["tool_call", "finish", "guardrail_block", "error"]),
  tool: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  result_summary: z.string().optional(),
});

export type Action = z.infer<typeof ActionSchema>;

// ── Context decision schema ──

export const ContextDecisionSchema = z.object({
  reason: z.string(),
  block: z.string().optional(),
});

export type ContextDecision = z.infer<typeof ContextDecisionSchema>;

// ── Step schema (matches run_report.schema.json) ──

export const StepSchema = z.object({
  step_index: z.number().int(),
  tokens_used: z.number().int(),
  token_budget: z.number().int(),
  context_included: z.array(z.string()),
  context_evicted: z.array(z.string()),
  context_decisions: z.array(ContextDecisionSchema).optional(),
  action: ActionSchema,
});

export type Step = z.infer<typeof StepSchema>;

// ── Final response schema (matches run_report.schema.json + assignment fields) ──

export const AgentResponseSchema = z.object({
  scenario_id: z.string(),
  mode: z.literal("live"),
  success: z.boolean(),
  final_answer: z.string(),
  final_message: z.string(),
  roadmap_updated: z.boolean(),
  slug: z.string(),
  steps: z.array(StepSchema),
  provider: z.string(),
  model: z.string(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ── Request schema ──

export const SessionMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  estimated_tokens: z.number().optional(),
});

export const RunRequestSchema = z.object({
  user_message: z.string(),
  session_history: z.array(SessionMessageSchema).default([]),
  token_budget_per_model_call: z.number().int().min(256).default(3500),
  max_steps: z.number().int().min(1).max(20).default(8),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;

// ── Tool definition for LLM ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
