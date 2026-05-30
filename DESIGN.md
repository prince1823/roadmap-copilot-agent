# Design Document — Roadmap Copilot Agent

## Agent Loop Design

The agent uses a **ReAct-style loop** with a configurable `max_steps` ceiling:

```
for each step (1 → max_steps):
  1. Build context within token budget
  2. Call LLM with tools available
  3. If LLM returns tool_calls → validate args, execute tools, record results
  4. If LLM calls `finish` → exit loop with final message
  5. If LLM returns text with no tools (after step 1) → treat as implicit finish
```

Each LLM call has **one retry**. If both attempts fail, the loop exits with a deterministic fallback response that still conforms to the output schema.

The `finish` tool is the canonical exit signal — it lets the model explicitly declare the final message and whether it mutated the roadmap. If the model never calls `finish` and exhausts `max_steps`, a synthetic final message is generated.

## Context Prioritization Policy

Before each LLM call, messages are bucketed into priority tiers and greedily packed into the token budget:

| Tier | Content | Rationale |
|------|---------|-----------|
| **Critical** | System prompt, current user message | Always included — defines task and identity |
| **High** | In-run tool results (most-recent-first) | The model needs its own prior tool outputs to reason |
| **Medium** | Session history (most-recent-first) | Background context, but dispensable under pressure |

Within each tier, items are ordered most-recent-first so the greedy packer keeps the freshest context when budget is tight.

**What gets logged:** Every call records an entry in `context_trace` listing what was `included`, what was `evicted`, `total_tokens` used, and the `budget`. Nothing is silently dropped.

**Token estimation:** Uses a 4-chars-per-token heuristic. Accurate enough for budgeting (real tokenizers add ~200ms per call from WASM overhead). A 200-token reserve is held back for response/tool-call overhead.

## Guardrail Design

### Confirm-before-write (`update_roadmap_month`)

The `confirmed` field is **required** in the tool schema and validated with Zod before execution. If `confirmed !== true`, the tool returns a structured error:

```json
{
  "success": false,
  "error": "GUARDRAIL: update_roadmap_month requires confirmed=true..."
}
```

This error is fed back to the model as a tool result, giving it the chance to ask the user for confirmation or retry with `confirmed=true`. The system prompt instructs the model to treat an explicit save request as confirmation.

### Argument validation

All tool arguments are parsed through Zod schemas before execution. Invalid arguments produce a clear error message that the model sees as a tool result, allowing self-correction.

### Output validation

The agent's final response is validated against `AgentResponseSchema` (Zod). If validation fails, a deterministic fallback response is returned instead.

## Failure Modes

| Failure | Handling |
|---------|----------|
| LLM returns invalid JSON in tool args | Parse error recorded as step; error fed back as tool result; model can self-correct on next step |
| LLM call fails (network, rate limit) | Retry once; if retry fails, exit with fallback response |
| LLM call times out | AbortController enforces deadline; treated like a failed call with retry |
| LLM returns no tool calls on step 1 | Content added to context; loop continues |
| LLM exhausts `max_steps` without `finish` | Synthetic final message returned; `success: true` with whatever was gathered |
| Output fails schema validation | Deterministic fallback response returned with `success: false` |
| Missing `LLM_API_KEY` | 500 error before the loop starts |

## What I Intentionally Chose Not to Build

- **Streaming responses:** The spec asks for a structured JSON endpoint, not SSE. Streaming would add complexity without matching the deliverable.
- **Persistent state / database:** Roadmap mutations happen in-memory against mock data. A production system would write to MongoDB, but the mock-tool contract doesn't require it.
- **Parallel tool execution:** The model can return multiple tool_calls in one response, and they're executed sequentially. Parallel execution adds race-condition risk for a marginal latency gain.
- **Semantic token counting (tiktoken):** Swapped for a char-based heuristic to avoid WASM load times. The budgeting logic is identical — only the estimator would change.
- **Authentication / rate limiting:** Out of scope for a take-home. The endpoint is unauthenticated.
- **Multi-turn persistence:** Each POST is a self-contained run. Session history is passed in the request body, not stored server-side.
