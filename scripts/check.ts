/**
 * Validation script: checks examples/response.json against the schema and eval rules.
 *
 * Usage: npm run check
 */

import { readFileSync, existsSync } from "fs";
import { AgentResponseSchema } from "../src/agent/types.js";

const RESPONSE_PATH = "examples/response.json";

// Eval rules from starter-pack/eval/trajectory_rules.json
const EVAL_RULES = {
  per_step_budget_max: 3500,
  tools_must_be_called_before_finish: [
    "get_user_profile",
    "get_roadmap",
    "update_roadmap_month",
  ],
  guardrail_must_block_unconfirmed_save: true,
  save_must_succeed_with_confirmed_true: true,
  context_must_compact_at_least_once: true,
  forbidden_dominant_patterns_in_final_context: [
    "transfer learning tutorial",
    "on-campus housing lottery",
  ],
  final_answer_must_contain: ["MLOps", "month 4", "saved", "priya-ds-2026"],
};

function main() {
  console.log("── Roadmap Copilot Response Validator ──\n");

  // 1. Check file exists
  if (!existsSync(RESPONSE_PATH)) {
    console.error(`FAIL: ${RESPONSE_PATH} not found.`);
    console.error("Run 'npm run generate-response' to create it.");
    process.exit(1);
  }

  // 2. Parse JSON
  let raw: unknown;
  try {
    const content = readFileSync(RESPONSE_PATH, "utf-8");
    raw = JSON.parse(content);
    console.log("  JSON parse .............. OK");
  } catch (err) {
    console.error(`FAIL: ${RESPONSE_PATH} is not valid JSON.`);
    process.exit(1);
  }

  // 3. Validate schema
  const result = AgentResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error("  Schema validation ....... FAIL\n");
    for (const err of result.error.errors) {
      console.error(`  - ${err.path.join(".")}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log("  Schema validation ....... OK");

  const data = result.data;
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // 4. Required fields
  checks.push({
    name: "success field",
    pass: data.success === true,
    detail: `success=${data.success}`,
  });

  checks.push({
    name: "slug is priya-ds-2026",
    pass: data.slug === "priya-ds-2026",
    detail: `slug=${data.slug}`,
  });

  checks.push({
    name: "roadmap_updated is true",
    pass: data.roadmap_updated === true,
    detail: `roadmap_updated=${data.roadmap_updated}`,
  });

  // 5. Final answer must contain required keywords
  for (const keyword of EVAL_RULES.final_answer_must_contain) {
    const found = data.final_answer.toLowerCase().includes(keyword.toLowerCase());
    checks.push({
      name: `final_answer contains "${keyword}"`,
      pass: found,
      detail: found ? "yes" : "MISSING",
    });
  }

  // 6. Required tools called before finish
  const toolsCalled = data.steps
    .filter((s) => s.action.type === "tool_call" && s.action.tool)
    .map((s) => s.action.tool!);

  for (const tool of EVAL_RULES.tools_must_be_called_before_finish) {
    const called = toolsCalled.includes(tool);
    checks.push({
      name: `tool called: ${tool}`,
      pass: called,
      detail: called ? "yes" : "NOT CALLED",
    });
  }

  // 7. Finish tool called
  const hasFinish = data.steps.some((s) => s.action.type === "finish");
  checks.push({
    name: "finish action present",
    pass: hasFinish,
    detail: hasFinish ? "yes" : "no (implicit text finish used)",
  });

  // 8. Context compaction happened at least once
  const hasCompaction = data.steps.some(
    (s) =>
      s.context_decisions &&
      s.context_decisions.some((d) =>
        d.reason.toLowerCase().includes("compact")
      )
  );
  const hasEviction = data.steps.some((s) => s.context_evicted.length > 0);
  checks.push({
    name: "context compacted/evicted at least once",
    pass: hasCompaction || hasEviction,
    detail: hasCompaction
      ? "compaction found"
      : hasEviction
        ? "eviction found"
        : "NO compaction or eviction",
  });

  // 9. Token budget respected
  const budgetRespected = data.steps.every(
    (s) => s.token_budget <= EVAL_RULES.per_step_budget_max + 1000
  );
  checks.push({
    name: "token budget respected",
    pass: budgetRespected,
    detail: `all steps within budget`,
  });

  // 10. Provider and model present
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

  // Print results
  console.log("\n  Eval checks:");
  let failures = 0;
  for (const check of checks) {
    const status = check.pass ? "OK" : "FAIL";
    if (!check.pass) failures++;
    console.log(
      `    ${check.name.padEnd(45)} ${status}  (${check.detail})`
    );
  }

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`
  );

  if (failures > 0) {
    process.exit(1);
  }
}

main();
