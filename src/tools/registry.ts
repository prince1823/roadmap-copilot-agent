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
  MOCK_KB_ARTICLES,
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

function getUserProfile(args: z.infer<typeof GetUserProfileArgs>): ToolResult {
  if (args.user_id !== MOCK_USER_PROFILE.user_id) {
    return { success: false, error: `User not found: ${args.user_id}` };
  }
  return { success: true, data: MOCK_USER_PROFILE };
}

function getRoadmap(args: z.infer<typeof GetRoadmapArgs>): ToolResult {
  if (args.user_id !== MOCK_ROADMAP.user_id || args.slug !== MOCK_ROADMAP.slug) {
    return {
      success: false,
      error: `Roadmap not found for user=${args.user_id}, slug=${args.slug}`,
    };
  }
  return { success: true, data: updatedRoadmap };
}

function searchKb(args: z.infer<typeof SearchKbArgs>): ToolResult {
  const query = args.query.toLowerCase();
  const scored = MOCK_KB_ARTICLES.map((article) => {
    let score = article.relevance_score;
    const titleMatch = article.title.toLowerCase().includes(query);
    const contentMatch = article.content.toLowerCase().includes(query);
    const tagMatch = article.tags.some((t) => query.includes(t));
    if (titleMatch) score += 0.3;
    if (contentMatch) score += 0.2;
    if (tagMatch) score += 0.15;
    return { ...article, computed_score: Math.min(score, 1.0) };
  });

  scored.sort((a, b) => b.computed_score - a.computed_score);
  const results = scored.slice(0, args.top_k);

  return { success: true, data: { query: args.query, results } };
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

  if (args.user_id !== MOCK_ROADMAP.user_id || args.slug !== MOCK_ROADMAP.slug) {
    return {
      success: false,
      error: `Roadmap not found for user=${args.user_id}, slug=${args.slug}`,
    };
  }

  const monthEntry = updatedRoadmap.months.find((m) => m.month === args.month);
  if (!monthEntry) {
    return {
      success: false,
      error: `Month ${args.month} not found in roadmap (valid: 1-${updatedRoadmap.total_months})`,
    };
  }

  monthEntry.goals = args.goals;
  monthEntry.resources = args.resources;
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
      final_message: args.final_message,
      roadmap_updated: args.roadmap_updated,
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

// ── OpenAI-format tool definitions for the LLM ──

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Retrieve the student's profile including name, enrollment, interests, and completed courses.",
      parameters: {
        type: "object",
        required: ["user_id"],
        properties: {
          user_id: { type: "string", description: "The student's user ID" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_roadmap",
      description:
        "Retrieve the student's learning roadmap by slug. Returns all months with goals, resources, and status.",
      parameters: {
        type: "object",
        required: ["user_id", "slug"],
        properties: {
          user_id: { type: "string", description: "The student's user ID" },
          slug: { type: "string", description: "The roadmap slug identifier" },
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
        "Search the knowledge base for articles related to a query. Returns ranked results with titles and content.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Search query for knowledge base articles",
          },
          top_k: {
            type: "number",
            description: "Number of results to return (1-10, default 3)",
          },
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
        "Update goals and resources for a specific month in the student's roadmap. IMPORTANT: requires confirmed=true or the call will be rejected.",
      parameters: {
        type: "object",
        required: ["user_id", "slug", "month", "goals", "resources", "confirmed"],
        properties: {
          user_id: { type: "string", description: "The student's user ID" },
          slug: { type: "string", description: "The roadmap slug identifier" },
          month: { type: "number", description: "Month number to update (1-based)" },
          goals: {
            type: "array",
            items: { type: "string" },
            description: "Updated list of goals for this month",
          },
          resources: {
            type: "array",
            items: { type: "string" },
            description: "Updated list of resources for this month",
          },
          confirmed: {
            type: "boolean",
            description:
              "Must be true to execute the update. If the user has not confirmed, set to false and the tool will return an error prompting confirmation.",
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
        "Signal that the agent is done. Provide the final message to the user and whether the roadmap was updated.",
      parameters: {
        type: "object",
        required: ["final_message", "roadmap_updated"],
        properties: {
          final_message: {
            type: "string",
            description: "The final response message to send to the student",
          },
          roadmap_updated: {
            type: "boolean",
            description: "Whether the roadmap was modified during this session",
          },
        },
        additionalProperties: false,
      },
    },
  },
];
