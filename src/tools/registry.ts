import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import {
  GetUserProfileArgs,
  GetRoadmapArgs,
  SearchKbArgs,
  UpdateRoadmapMonthArgs,
  FinishArgs,
} from "../agent/types.js";
import {
  MOCK_USER_PROFILE,
  MOCK_ROADMAP,
  MOCK_KB_CHUNKS,
} from "../mock/data.js";

// ── Tool result type ──

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ── State tracker for roadmap mutations ──

let roadmapUpdated = false;
let updatedRoadmap = structuredClone(MOCK_ROADMAP);

export function resetToolState(): void {
  roadmapUpdated = false;
  updatedRoadmap = structuredClone(MOCK_ROADMAP);
}

export function wasRoadmapUpdated(): boolean {
  return roadmapUpdated;
}

// ── Tool implementations ──

function getUserProfile(_args: z.infer<typeof GetUserProfileArgs>): ToolResult {
  return { success: true, data: MOCK_USER_PROFILE };
}

function getRoadmap(args: z.infer<typeof GetRoadmapArgs>): ToolResult {
  if (args.roadmap_id !== MOCK_ROADMAP.id) {
    return {
      success: false,
      error: `Roadmap not found: ${args.roadmap_id}`,
    };
  }
  return { success: true, data: updatedRoadmap };
}

function searchKb(args: z.infer<typeof SearchKbArgs>): ToolResult {
  const query = args.query.toLowerCase();
  const results = MOCK_KB_CHUNKS.filter((chunk) =>
    chunk.keywords.some((kw) => query.includes(kw.toLowerCase()))
  );

  if (results.length === 0) {
    // Fallback: return all chunks ranked by keyword overlap
    const scored = MOCK_KB_CHUNKS.map((chunk) => {
      const score = chunk.keywords.filter((kw) =>
        query.split(/\s+/).some((w) => kw.toLowerCase().includes(w))
      ).length;
      return { ...chunk, score };
    })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    return { success: true, data: scored.length > 0 ? scored : MOCK_KB_CHUNKS };
  }

  return { success: true, data: results };
}

function updateRoadmapMonth(
  args: z.infer<typeof UpdateRoadmapMonthArgs>
): ToolResult {
  // ── GUARDRAIL: block unless confirmed is true ──
  if (!args.confirmed) {
    return {
      success: false,
      error:
        "GUARDRAIL: update_roadmap_month requires confirmed=true. " +
        "The user must explicitly confirm before any roadmap modification. " +
        "Please ask the user to confirm the changes, then retry with confirmed=true.",
    };
  }

  if (args.roadmap_id !== MOCK_ROADMAP.id) {
    return {
      success: false,
      error: `Roadmap not found: ${args.roadmap_id}`,
    };
  }

  const monthEntry = updatedRoadmap.months.find((m) => m.month === args.month);
  if (!monthEntry) {
    return {
      success: false,
      error: `Month ${args.month} not found in roadmap (valid: 1-${updatedRoadmap.months.length})`,
    };
  }

  monthEntry.title = args.title;
  monthEntry.activities = args.activities;
  roadmapUpdated = true;

  return {
    success: true,
    data: {
      message: `Month ${args.month} updated successfully`,
      updated_month: monthEntry,
    },
  };
}

function finish(args: z.infer<typeof FinishArgs>): ToolResult {
  return {
    success: true,
    data: {
      message: args.message,
    },
  };
}

// ── Tool dispatcher ──

const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  get_user_profile: GetUserProfileArgs,
  get_roadmap: GetRoadmapArgs,
  search_kb: SearchKbArgs,
  update_roadmap_month: UpdateRoadmapMonthArgs,
  finish: FinishArgs,
};

const TOOL_HANDLERS: Record<string, (args: unknown) => ToolResult> = {
  get_user_profile: (a) => getUserProfile(a as z.infer<typeof GetUserProfileArgs>),
  get_roadmap: (a) => getRoadmap(a as z.infer<typeof GetRoadmapArgs>),
  search_kb: (a) => searchKb(a as z.infer<typeof SearchKbArgs>),
  update_roadmap_month: (a) =>
    updateRoadmapMonth(a as z.infer<typeof UpdateRoadmapMonthArgs>),
  finish: (a) => finish(a as z.infer<typeof FinishArgs>),
};

export function executeTool(name: string, rawArgs: unknown): ToolResult {
  const schema = TOOL_SCHEMAS[name];
  const handler = TOOL_HANDLERS[name];

  if (!schema || !handler) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid arguments for ${name}: ${parsed.error.message}`,
    };
  }

  return handler(parsed.data);
}

// ── OpenAI-format tool definitions for the LLM (from starter-pack catalog) ──

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Load the current user's profile (goal track, roadmap id, preferences).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_roadmap",
      description:
        "Load the full roadmap JSON for the user's active roadmap. Response is large.",
      parameters: {
        type: "object",
        required: ["roadmap_id"],
        properties: {
          roadmap_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_kb",
      description:
        "Search platform knowledge base for curriculum guidance.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_roadmap_month",
      description:
        "Update a single month on the roadmap. Persist only when confirmed is true. If confirmed is false the call will be rejected with a guardrail error.",
      parameters: {
        type: "object",
        required: ["roadmap_id", "month", "title", "activities", "confirmed"],
        properties: {
          roadmap_id: { type: "string" },
          month: { type: "integer", minimum: 1, maximum: 12 },
          title: { type: "string" },
          activities: {
            type: "array",
            items: { type: "string" },
          },
          confirmed: {
            type: "boolean",
            description:
              "Must be true to persist the update. The user saying 'save it' counts as confirmation.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "End the run and return the final user-visible message. Include what changed and the roadmap slug.",
      parameters: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
];
