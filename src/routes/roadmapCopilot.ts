import { Router, type Request, type Response } from "express";
import { RunRequestSchema } from "../agent/types.js";
import { runAgentLoop } from "../agent/loop.js";
import { createLLMClient, loadLLMConfig } from "../llm/client.js";

const router = Router();

router.post("/run", async (req: Request, res: Response) => {
  // ── 1. Validate request body ──
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

  // ── 2. Initialize LLM client ──
  let config;
  try {
    config = loadLLMConfig();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "LLM configuration error",
      details: err instanceof Error ? err.message : "Unknown error",
    });
    return;
  }

  const client = createLLMClient(config);

  // ── 3. Run agent loop ──
  try {
    const result = await runAgentLoop({
      client,
      model: config.model,
      provider: config.provider,
      request: parsed.data,
      timeoutMs: 30000,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("Unhandled agent error:", err);
    res.status(500).json({
      success: false,
      final_message:
        "I encountered an issue processing your request. Please try again, and I'll do my best to help with your roadmap.",
      roadmap_updated: false,
      slug: "mlops-fundamentals",
      steps: [
        {
          step: 1,
          action: "fatal_error",
          tool: null,
          tool_args: null,
          result_summary: err instanceof Error ? err.message : "Unknown error",
        },
      ],
      context_trace: [],
      provider: config.provider,
      model: config.model,
    });
  }
});

export default router;
