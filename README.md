# Roadmap Copilot Agent API

A structured AI agent endpoint that runs a tool-using roadmap copilot for students, with validated JSON responses, context management, and guardrails.

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

Send a request to the copilot agent:

```bash
curl -X POST http://localhost:3000/ai/roadmap-copilot/run \
  -H "Content-Type: application/json" \
  -d @examples/request.json
```

See `examples/request.json` for the full request format and `examples/response.json` for a real LLM-generated response.

### `GET /health`

Health check endpoint.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM provider name | `openrouter` |
| `LLM_API_KEY` | API key for the LLM provider | *required* |
| `LLM_MODEL` | Model identifier | `openai/gpt-4o-mini` |
| `PORT` | Server port | `3000` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with hot-reload |
| `npm test` | Run all tests |
| `npm run check` | Validate `examples/response.json` against schema |
| `npm run generate-response` | Generate `examples/response.json` from a live LLM call |

## Project Structure

```
src/
├── index.ts                  # Express server
├── routes/
│   └── roadmapCopilot.ts     # POST /ai/roadmap-copilot/run
├── agent/
│   ├── loop.ts               # ReAct agent loop
│   ├── context.ts            # Token-budgeted context builder
│   └── types.ts              # Zod schemas
├── tools/
│   └── registry.ts           # Tool definitions & implementations
├── llm/
│   └── client.ts             # OpenRouter/OpenAI client
├── mock/
│   └── data.ts               # Mock student/roadmap/KB data
└── prompts/
    └── system.ts             # System prompt template

tests/
├── response-validation.test.ts  # Validates committed response.json
├── context-budget.test.ts       # Context management unit tests
├── guardrail.test.ts            # Confirm-before-write tests
└── agent-errors.test.ts         # Retry, fallback, timeout tests

scripts/
├── check.ts                     # Schema validator for response.json
└── generate-response.ts         # Generates response.json via live LLM

examples/
├── request.json                 # Sample request payload
└── response.json                # Real LLM-generated response

scenarios/
└── roadmap_mlops_save.json      # Full scenario definition
```

## Architecture

See [DESIGN.md](./DESIGN.md) for details on:
- Agent loop design
- Context prioritization policy
- Guardrail design
- Failure modes
- Intentional scope limits

## Testing

```bash
npm test
```

Tests cover:
- **Response validation:** Committed `response.json` conforms to schema
- **Context budget:** Priority-based eviction, token tracking, message ordering
- **Guardrails:** `update_roadmap_month` blocked without `confirmed=true`
- **Error paths:** LLM retry + fallback, timeout handling, invalid tool arguments

## Bonus: Web UI

As an extra, I built a web UI to interact with the agent visually. After starting the server, open `http://localhost:3000` in your browser.

Features:
- Chat interface to send messages to the copilot
- Live agent step timeline showing each tool call and result
- Run stats panel (status, steps taken, roadmap updated, model used)
- Adjustable token budget and max steps settings
- Session history carried across messages within a session
