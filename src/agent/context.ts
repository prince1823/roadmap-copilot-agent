import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ContextTraceEntry } from "./types.js";

// ── Token estimation ──
// Using a conservative ~4 chars per token heuristic.
// For production, swap in tiktoken. This avoids the WASM load overhead in tests.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(
  msg: ChatCompletionMessageParam
): number {
  // overhead for role, name, etc.
  const overhead = 4;
  if (typeof msg.content === "string") {
    return estimateTokens(msg.content) + overhead;
  }
  if (Array.isArray(msg.content)) {
    return (
      msg.content.reduce((sum, part) => {
        if ("text" in part) return sum + estimateTokens(part.text);
        return sum;
      }, 0) + overhead
    );
  }
  // tool call messages, etc.
  return estimateTokens(JSON.stringify(msg)) + overhead;
}

// ── Priority tiers ──

type PriorityTier = "critical" | "high" | "medium" | "low";

interface PrioritizedBlock {
  label: string;
  tier: PriorityTier;
  message: ChatCompletionMessageParam;
  tokens: number;
}

const TIER_ORDER: Record<PriorityTier, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ── Context builder ──

export interface ContextBuildResult {
  messages: ChatCompletionMessageParam[];
  trace: ContextTraceEntry;
}

export function buildContext(opts: {
  systemPrompt: string;
  userMessage: string;
  sessionHistory: { role: "user" | "assistant"; content: string }[];
  toolResults: ChatCompletionMessageParam[];
  tokenBudget: number;
  step: number;
}): ContextBuildResult {
  const { systemPrompt, userMessage, sessionHistory, toolResults, tokenBudget, step } =
    opts;

  // Build prioritized blocks
  const blocks: PrioritizedBlock[] = [];

  // System prompt — always included
  const sysMsg: ChatCompletionMessageParam = {
    role: "system",
    content: systemPrompt,
  };
  blocks.push({
    label: "system_prompt",
    tier: "critical",
    message: sysMsg,
    tokens: estimateMessageTokens(sysMsg),
  });

  // Current user message — always included
  const userMsg: ChatCompletionMessageParam = {
    role: "user",
    content: userMessage,
  };
  blocks.push({
    label: "user_message",
    tier: "critical",
    message: userMsg,
    tokens: estimateMessageTokens(userMsg),
  });

  // In-run tool results — high priority (most recent first)
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const msg = toolResults[i];
    blocks.push({
      label: `tool_result_${i}`,
      tier: "high",
      message: msg,
      tokens: estimateMessageTokens(msg),
    });
  }

  // Session history — medium priority (most recent first)
  for (let i = sessionHistory.length - 1; i >= 0; i--) {
    const entry = sessionHistory[i];
    const msg: ChatCompletionMessageParam = {
      role: entry.role,
      content: entry.content,
    };
    blocks.push({
      label: `history_${i}`,
      tier: "medium",
      message: msg,
      tokens: estimateMessageTokens(msg),
    });
  }

  // Sort by priority tier (stable sort preserves insertion order within tier)
  blocks.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  // Greedily fit blocks into budget
  const included: string[] = [];
  const evicted: string[] = [];
  const selectedBlocks: PrioritizedBlock[] = [];
  let totalTokens = 0;

  // Reserve tokens for the model's response and tool-calling overhead
  // Cap the reserve at 20% of budget so small budgets still fit critical content
  const reserve = Math.min(200, Math.floor(tokenBudget * 0.2));
  const effectiveBudget = tokenBudget - reserve;

  for (const block of blocks) {
    if (totalTokens + block.tokens <= effectiveBudget) {
      selectedBlocks.push(block);
      included.push(block.label);
      totalTokens += block.tokens;
    } else {
      evicted.push(block.label);
    }
  }

  // Rebuild messages in correct conversational order:
  // system → history (chronological) → tool results (chronological) → user message
  const orderedMessages: ChatCompletionMessageParam[] = [];

  // System prompt first
  const sys = selectedBlocks.find((b) => b.label === "system_prompt");
  if (sys) orderedMessages.push(sys.message);

  // Session history in chronological order
  const historyBlocks = selectedBlocks
    .filter((b) => b.label.startsWith("history_"))
    .sort((a, b) => {
      const aIdx = parseInt(a.label.split("_")[1]);
      const bIdx = parseInt(b.label.split("_")[1]);
      return aIdx - bIdx;
    });
  for (const hb of historyBlocks) {
    orderedMessages.push(hb.message);
  }

  // Tool results in chronological order
  const toolBlocks = selectedBlocks
    .filter((b) => b.label.startsWith("tool_result_"))
    .sort((a, b) => {
      const aIdx = parseInt(a.label.split("_")[2]);
      const bIdx = parseInt(b.label.split("_")[2]);
      return aIdx - bIdx;
    });
  for (const tb of toolBlocks) {
    orderedMessages.push(tb.message);
  }

  // User message last
  const usr = selectedBlocks.find((b) => b.label === "user_message");
  if (usr) orderedMessages.push(usr.message);

  return {
    messages: orderedMessages,
    trace: {
      step,
      included,
      evicted,
      total_tokens: totalTokens,
      budget: tokenBudget,
    },
  };
}
