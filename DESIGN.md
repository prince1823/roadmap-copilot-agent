# Design Document — Roadmap Copilot Agent

## Agent Loop Design

The agent uses a **ReAct-style loop** with a configurable `max_steps` ceiling (default 8):

```
for step_index 0 → max_steps-1:
  1. Build context within token_budget_per_model_call
  2. Call LLM with tool definitions
  3. If LLM returns tool_calls → validate args with Zod, execute tool, record step
  4. If tool is `finish` → exit loop with final message
  5. If LLM returns text only (after step 0) → treat as implicit finish
```

Each LLM call has **one retry**. On the first failure, the retry swaps in `STRICT_RETRY_PROMPT` (a tighter system prompt that demands a single tool call). If both attempts fail, the loop exits with a deterministic fallback response that still conforms to `run_report.schema.json`.

The `finish` tool is the canonical exit signal. If the model exhausts `max_steps` without calling `finish`, a synthetic final message is generated.

## Context Prioritization Policy

Before each LLM call, context blocks are bucketed into priority tiers and greedily packed:

| Tier | Content | Rationale |
|------|---------|-----------|
| **Critical** | System prompt, current user message | Always included — defines task and identity |
| **High** | In-run tool results (compacted if large) | The model needs its own prior tool outputs to reason |
| **Medium** | Session history (non-noisy entries) | Relevant conversational context |
| **Low** | Session history (noisy entries) | Off-topic content detected by pattern matching |

### Noise detection

Session history entries containing known off-topic patterns (e.g. "transfer learning", "on-campus housing lottery") are automatically demoted to **low** priority. This is logged in `context_decisions`.

### Compaction

Large tool results (>500 chars) — specifically full roadmap JSON — are compacted to a summary form (month titles + activity counts, no full arrays). This is required by the eval rule `context_must_compact_at_least_once` and prevents the full roadmap from dominating every subsequent model call.

### Eviction

When blocks don't fit the budget, low-priority blocks are evicted first. Every eviction is logged in `context_evicted` with the reason in `context_decisions`. Nothing is silently truncated.

## Guardrail Design

### Confirm-before-write (`update_roadmap_month`)

The `confirmed` boolean is required in the tool schema and validated with Zod before execution:

- `confirmed=false` or missing → tool returns a structured error: `GUARDRAIL: update_roadmap_month requires confirmed=true...`
- This error is fed back to the model as a tool result, giving it the chance to retry correctly
- The system prompt treats the user saying "save it" as implicit confirmation

### Argument validation

All tool arguments pass through Zod schemas. Invalid arguments produce clear error messages visible to the model.

### Output validation

The final response is validated against `AgentResponseSchema` (Zod, matching `run_report.schema.json`). If validation fails, a deterministic fallback is returned.

## Failure Modes

| Failure | Handling |
|---------|----------|
| LLM call fails (network, rate limit) | Retry once with strict prompt; if retry fails, return fallback |
| LLM call times out | AbortController enforces 30s deadline per call; 60s overall request timeout |
| LLM returns invalid JSON in tool args | Parse error recorded as step; error fed back to model |
| LLM returns empty response | Retry with strict prompt |
| LLM returns no tool calls on step 0 | Content added to context; loop continues |
| LLM exhausts max_steps without finish | Synthetic final message; success=true with gathered data |
| Output fails schema validation | Deterministic fallback response; success=false |
| Missing LLM_API_KEY | Structured 500 before loop starts |
| Invalid request body | Structured 400 with Zod error details |

### Fallback behavior

When the model's output is invalid:
1. First retry uses `STRICT_RETRY_PROMPT` — a minimal system prompt that demands exactly one tool call
2. If still invalid, return a deterministic rules-based response with `success: false` and a standard error message

## What I Intentionally Chose Not to Build

- **Streaming responses** — The spec requires strict JSON, not SSE
- **Persistent database** — Mutations happen in-memory against mock data; production would use MongoDB
- **Parallel tool execution** — Sequential is simpler and avoids race conditions
- **Semantic tokenizer (tiktoken)** — Swapped for 4-chars-per-token heuristic to avoid WASM overhead; budgeting logic is identical
- **Authentication / rate limiting** — Out of scope
- **Multi-turn persistence** — Each POST is self-contained; session history is passed in the request
- **LangChain / framework dependencies** — Direct OpenAI SDK for transparency and control
