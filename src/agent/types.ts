import { z } from "zod";

// ── Tool argument schemas ──

export const GetUserProfileArgs = z.object({
  user_id: z.string(),
});

export const GetRoadmapArgs = z.object({
  user_id: z.string(),
  slug: z.string(),
});

export const SearchKbArgs = z.object({
  query: z.string(),
  top_k: z.number().int().min(1).max(10).default(3),
});

export const UpdateRoadmapMonthArgs = z.object({
  user_id: z.string(),
  slug: z.string(),
  month: z.number().int().min(1),
  goals: z.array(z.string()),
  resources: z.array(z.string()),
  confirmed: z.boolean(),
});

export const FinishArgs = z.object({
  final_message: z.string(),
  roadmap_updated: z.boolean(),
});

// ── Agent step schema ──

export const StepSchema = z.object({
  step: z.number(),
  action: z.string(),
  tool: z.string().nullable(),
  tool_args: z.record(z.unknown()).nullable(),
  result_summary: z.string(),
  tokens_used: z.number().optional(),
});

export type Step = z.infer<typeof StepSchema>;

// ── Context trace schema ──

export const ContextTraceEntrySchema = z.object({
  step: z.number(),
  included: z.array(z.string()),
  evicted: z.array(z.string()),
  total_tokens: z.number(),
  budget: z.number(),
});

export type ContextTraceEntry = z.infer<typeof ContextTraceEntrySchema>;

// ── Final response schema ──

export const AgentResponseSchema = z.object({
  success: z.boolean(),
  final_message: z.string(),
  roadmap_updated: z.boolean(),
  slug: z.string(),
  steps: z.array(StepSchema),
  context_trace: z.array(ContextTraceEntrySchema),
  provider: z.string(),
  model: z.string(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ── Request schema ──

export const SessionMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const RunRequestSchema = z.object({
  user_message: z.string(),
  session_history: z.array(SessionMessageSchema).default([]),
  token_budget_per_model_call: z.number().int().min(256).default(4096),
  max_steps: z.number().int().min(1).max(20).default(10),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;

// ── Tool definition for LLM ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
