/**
 * Validation script: checks examples/response.json against the AgentResponseSchema.
 *
 * Usage: npm run check
 */

import { readFileSync, existsSync } from "fs";
import { AgentResponseSchema } from "../src/agent/types.js";

const RESPONSE_PATH = "examples/response.json";

function main() {
  console.log("── Roadmap Copilot Response Validator ──\n");

  // 1. Check file exists
  if (!existsSync(RESPONSE_PATH)) {
    console.error(`FAIL: ${RESPONSE_PATH} not found.`);
    console.error("Run 'npm run generate-response' to create it from a live LLM call.");
    process.exit(1);
  }

  // 2. Parse JSON
  let raw: unknown;
  try {
    const content = readFileSync(RESPONSE_PATH, "utf-8");
    raw = JSON.parse(content);
    console.log("  JSON parse ........... OK");
  } catch (err) {
    console.error(`FAIL: ${RESPONSE_PATH} is not valid JSON.`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 3. Validate schema
  const result = AgentResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error("  Schema validation .... FAIL\n");
    console.error("Validation errors:");
    for (const err of result.error.errors) {
      console.error(`  - ${err.path.join(".")}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log("  Schema validation .... OK");

  const data = result.data;

  // 4. Content checks
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  checks.push({
    name: "success field",
    pass: typeof data.success === "boolean",
    detail: `success=${data.success}`,
  });

  checks.push({
    name: "final_message present",
    pass: data.final_message.length > 0,
    detail: `${data.final_message.length} chars`,
  });

  checks.push({
    name: "slug present",
    pass: data.slug.length > 0,
    detail: `slug=${data.slug}`,
  });

  checks.push({
    name: "steps non-empty",
    pass: data.steps.length > 0,
    detail: `${data.steps.length} steps`,
  });

  checks.push({
    name: "context_trace non-empty",
    pass: data.context_trace.length > 0,
    detail: `${data.context_trace.length} entries`,
  });

  checks.push({
    name: "provider present",
    pass: data.provider.length > 0,
    detail: `provider=${data.provider}`,
  });

  checks.push({
    name: "model present",
    pass: data.model.length > 0,
    detail: `model=${data.model}`,
  });

  // Check that at least some tools were called
  const toolCalls = data.steps.filter((s) => s.tool !== null);
  checks.push({
    name: "has tool calls",
    pass: toolCalls.length > 0,
    detail: `${toolCalls.length} tool calls: ${toolCalls.map((s) => s.tool).join(", ")}`,
  });

  // Check context_trace has budget tracking
  const hasBudget = data.context_trace.every((t) => t.budget > 0);
  checks.push({
    name: "budget tracked in context_trace",
    pass: hasBudget,
    detail: `all entries have budget > 0`,
  });

  // Check for finish tool (soft check — implicit text finish is valid)
  const hasFinish = data.steps.some((s) => s.tool === "finish");
  const hasTextFinish = data.steps.some(
    (s) => s.action === "text_response" && s.step > 1
  );
  checks.push({
    name: "finish tool called",
    pass: hasFinish || hasTextFinish,
    detail: hasFinish
      ? "yes (explicit)"
      : hasTextFinish
        ? "yes (implicit text finish)"
        : "no",
  });

  console.log("\n  Content checks:");
  let allPass = true;
  for (const check of checks) {
    const status = check.pass ? "OK" : "WARN";
    if (!check.pass) allPass = false;
    console.log(`    ${check.name.padEnd(35)} ${status}  (${check.detail})`);
  }

  console.log(
    `\n${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS HAD WARNINGS (review above)"}\n`
  );

  // Exit 0 as long as schema validation passed — content checks are advisory
  if (!allPass) {
    process.exit(0);
  }
}

main();
