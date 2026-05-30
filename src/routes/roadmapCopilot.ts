import { Router, type Request, type Response } from "express";
import { RunRequestSchema } from "../agent/types.js";
import { runAgentLoop } from "../agent/loop.js";
import { createLLMClient, loadLLMConfig } from "../llm/client.js";

const router = Router();

router.post("/run", async (req: Request, res: Response) => {
  // ── 1. Validate request body (structured 400) ──
  const parsed = RunRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid request body",
      details: parsed.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // ── 2. Initialize LLM client (structured 500) ──
  let config;
  try {
    config = loadLLMConfig();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "LLM configuration error",
      details: err instanceof Error ? err.message : "Missing LLM_API_KEY",
    });
    return;
  }

  const client = createLLMClient(config);

  // ── 3. Run agent loop with overall timeout ──
  const overallTimeout = 60000; // 60s overall request timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Overall request timeout")), overallTimeout)
  );

  try {
    const result = await Promise.race([
      runAgentLoop({
        client,
        model: config.model,
        provider: config.provider,
        request: parsed.data,
        timeoutMs: 30000,
      }),
      timeoutPromise,
    ]);

    res.status(200).json(result);
  } catch (err) {
    console.error("Unhandled agent error:", err);
    res.status(500).json({
      scenario_id: "roadmap_mlops_save",
      mode: "live",
      success: false,
      final_answer:
        "I encountered an issue processing your request. Your roadmap was not modified. Please try again.",
      final_message:
        "I encountered an issue processing your request. Your roadmap was not modified. Please try again.",
      roadmap_updated: false,
      slug: "priya-ds-2026",
      steps: [
        {
          step_index: 0,
          tokens_used: 0,
          token_budget: parsed.data.token_budget_per_model_call,
          context_included: [],
          context_evicted: [],
          context_decisions: [
            { reason: err instanceof Error ? err.message : "Unknown error" },
          ],
          action: {
            type: "error",
            result_summary: err instanceof Error ? err.message : "Unknown error",
          },
        },
      ],
      provider: config.provider,
      model: config.model,
    });
  }
});

export default router;
