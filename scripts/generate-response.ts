/**
 * Generates examples/response.json by making a real LLM call.
 *
 * Usage: npm run generate-response
 * Requires: .env file with LLM_API_KEY set
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createLLMClient, loadLLMConfig } from "../src/llm/client.js";
import { runAgentLoop } from "../src/agent/loop.js";
import { RunRequestSchema } from "../src/agent/types.js";

async function main() {
  console.log("── Generating examples/response.json ──\n");

  // Load request
  const requestRaw = JSON.parse(
    readFileSync("examples/request.json", "utf-8")
  );
  const request = RunRequestSchema.parse(requestRaw);

  // Init LLM
  const config = loadLLMConfig();
  const client = createLLMClient(config);

  console.log(`Provider: ${config.provider}`);
  console.log(`Model:    ${config.model}`);
  console.log(`Message:  "${request.user_message.slice(0, 80)}..."\n`);

  // Run agent
  const result = await runAgentLoop({
    client,
    model: config.model,
    provider: config.provider,
    request,
    timeoutMs: 60000,
  });

  // Write output
  writeFileSync("examples/response.json", JSON.stringify(result, null, 2));

  console.log("\nResult:");
  console.log(`  success:         ${result.success}`);
  console.log(`  roadmap_updated: ${result.roadmap_updated}`);
  console.log(`  steps:           ${result.steps.length}`);
  console.log(`  tools used:      ${result.steps.filter((s) => s.tool).map((s) => s.tool).join(", ")}`);
  console.log(`\nWritten to examples/response.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
