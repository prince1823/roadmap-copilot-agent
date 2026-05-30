# Roadmap Copilot Agent API

A structured AI agent endpoint that runs a tool-using roadmap copilot for a student and returns strict JSON.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set your LLM_API_KEY

# 3. Start the server
npm start
```

The server runs at `http://localhost:3000`.

## API

### `POST /ai/roadmap-copilot/run`

```bash
curl -X POST http://localhost:3000/ai/roadmap-copilot/run \
  -H "Content-Type: application/json" \
  -d @examples/request.json
```

See `examples/request.json` for the request format and `examples/response.json` for a real LLM-generated response.

### `GET /health`

Health check endpoint.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM provider name | `openrouter` |
| `LLM_API_KEY` | API key for the provider | *required* |
| `LLM_MODEL` | Model identifier | `openai/gpt-4o-mini` |
| `PORT` | Server port | `3000` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with hot-reload |
| `npm test` | Run all tests |
| `npm run check` | Validate `examples/response.json` against schema + eval rules |
| `npm run generate-response` | Generate `examples/response.json` from a live LLM call |

## Project Structure

```
src/
├── index.ts                  # Express server
├── routes/
│   └── roadmapCopilot.ts     # POST /ai/roadmap-copilot/run
├── agent/
│   ├── loop.ts               # ReAct agent loop
│   ├── context.ts            # Token-budgeted context builder with compaction
│   └── types.ts              # Zod schemas (matches run_report.schema.json)
├── tools/
│   └── registry.ts           # Tool definitions & mock implementations
├── llm/
│   └── client.ts             # OpenRouter/OpenAI client
├── mock/
│   └── data.ts               # Mock data (from starter-pack)
└── prompts/
    └── system.ts             # System prompt + strict retry prompt

tests/
├── response-validation.test.ts  # Valid live run — response.json passes schema
├── context-budget.test.ts       # Context budget, compaction, noise eviction
├── guardrail.test.ts            # Confirm-before-write + argument validation
└── agent-errors.test.ts         # Retry/fallback, timeout, malformed args

scripts/
├── check.ts                     # Schema + eval rules validator
└── generate-response.ts         # Generates response.json via live LLM

starter-pack/                    # Original starter-pack files (reference)
```

## Architecture

See [DESIGN.md](./DESIGN.md) for details on:
- Agent loop design
- Context prioritization policy (noise detection, compaction, eviction)
- Guardrail design (confirm-before-write)
- Failure modes and fallback behavior
- What was intentionally not built

## Fallback Behavior

When the model's output is invalid:
1. **Retry** with a stricter system prompt (`STRICT_RETRY_PROMPT`) that demands exactly one tool call
2. If still invalid, return a **deterministic rules-based response** with `success: false` and a standard error message

The fallback response conforms to the same `AgentResponseSchema` so consumers never receive unstructured errors.

## Testing

```bash
npm test
```

33 tests across 4 files:

- **response-validation** — Committed `response.json` passes `AgentResponseSchema`
- **context-budget** — Priority-based eviction, noise deprioritization, compaction, token tracking, message ordering
- **guardrail** — `update_roadmap_month` blocked without `confirmed=true`, argument validation for all tools
- **agent-errors** — LLM retry + fallback, timeout handling, malformed tool arguments

## Hours Spent

~7 hours on core implementation.

## Hardest Tradeoff

**Context compaction vs. fidelity.** The eval rules require compacting the roadmap after `get_roadmap` so it doesn't dominate later calls, but the model still needs enough detail to make good update decisions. I chose to compact to month titles + activity counts, which gives the model the structure without burning budget on the full activity arrays. A production system might use semantic summarization, but the heuristic approach is reliable and deterministic.

## Bonus: Web UI

As an extra, I built a web UI to interact with the agent visually. After starting the server, open `http://localhost:3000` in your browser.

Features:
- Chat interface to send messages to the copilot
- Live agent step timeline showing each tool call and result
- Run stats panel (status, steps taken, roadmap updated, model used)
- Adjustable token budget and max steps settings
- Session history carried across messages within a session
