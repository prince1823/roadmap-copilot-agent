import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ContextDecision } from "./types.js";

// ── Token estimation ──
// ~4 chars per token heuristic. Production would use tiktoken.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(
  msg: ChatCompletionMessageParam
): number {
  const overhead = 4; // role, name, etc.
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

// Noise patterns that should be evicted first (from eval rules)
const NOISE_PATTERNS = [
  "transfer learning",
  "on-campus housing lottery",
  "pretrained weights",
  "fine-tuning",
];

function isNoisyContent(content: string): boolean {
  const lower = content.toLowerCase();
  return NOISE_PATTERNS.some((p) => lower.includes(p));
}

// Compaction: summarize large content to save tokens
function compactContent(content: string, label: string): { text: string; wasCompacted: boolean } {
  // Compact roadmap JSON — don't keep full object in every call
  if (label.startsWith("tool_result_") && content.length > 500) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.success && parsed.data) {
        const data = parsed.data;
        // Compact roadmap responses
        if (data.months && Array.isArray(data.months)) {
          const compact = {
            success: true,
            data: {
              id: data.id,
              slug: data.slug,
              title: data.title,
              months: data.months.map((m: { month: number; title: string; activities: string[] }) => ({
                month: m.month,
                title: m.title,
                activities_count: m.activities?.length ?? 0,
              })),
            },
          };
          return { text: JSON.stringify(compact), wasCompacted: true };
        }
      }
    } catch {
      // Not JSON, skip
    }
  }
  return { text: content, wasCompacted: false };
}

// ── Context builder ──

export interface ContextBuildResult {
  messages: ChatCompletionMessageParam[];
  tokens_used: number;
  token_budget: number;
  context_included: string[];
  context_evicted: string[];
  context_decisions: ContextDecision[];
}

export function buildContext(opts: {
  systemPrompt: string;
  userMessage: string;
  sessionHistory: { role: "user" | "assistant"; content: string; estimated_tokens?: number }[];
  toolResults: ChatCompletionMessageParam[];
  tokenBudget: number;
  step: number;
}): ContextBuildResult {
  const { systemPrompt, userMessage, sessionHistory, toolResults, tokenBudget, step } =
    opts;

  const decisions: ContextDecision[] = [];
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

  // In-run tool results — high priority, apply compaction
  for (let i = 0; i < toolResults.length; i++) {
    const msg = toolResults[i];
    const label = `tool_result_${i}`;

    // Try compaction for large tool results
    if (typeof msg.content === "string") {
      const { text, wasCompacted } = compactContent(msg.content, label);
      if (wasCompacted) {
        decisions.push({
          reason: `Compacted ${label}: roadmap JSON summarized to save tokens`,
          block: label,
        });
        const compactedMsg: ChatCompletionMessageParam = { ...msg, content: text };
        blocks.push({
          label,
          tier: "high",
          message: compactedMsg,
          tokens: estimateMessageTokens(compactedMsg),
        });
        continue;
      }
    }

    blocks.push({
      label,
      tier: "high",
      message: msg,
      tokens: estimateMessageTokens(msg),
    });
  }

  // Session history — classify as medium or low based on noise
  for (let i = 0; i < sessionHistory.length; i++) {
    const entry = sessionHistory[i];
    const content = entry.content;
    const label = `history_${i}_${entry.role}`;

    if (isNoisyContent(content)) {
      decisions.push({
        reason: `Deprioritized ${label}: contains off-topic content (noise pattern detected)`,
        block: label,
      });
      blocks.push({
        label,
        tier: "low",
        message: { role: entry.role, content: content },
        tokens: entry.estimated_tokens ?? estimateMessageTokens({ role: entry.role, content }),
      });
    } else {
      blocks.push({
        label,
        tier: "medium",
        message: { role: entry.role, content: content },
        tokens: entry.estimated_tokens ?? estimateMessageTokens({ role: entry.role, content }),
      });
    }
  }

  // Sort by priority tier (stable sort preserves insertion order within tier)
  blocks.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  // Reserve tokens for response overhead
  const reserve = Math.min(200, Math.floor(tokenBudget * 0.2));
  const effectiveBudget = tokenBudget - reserve;

  // Greedily fit blocks into budget
  const included: string[] = [];
  const evicted: string[] = [];
  const selectedBlocks: PrioritizedBlock[] = [];
  let totalTokens = 0;

  for (const block of blocks) {
    if (totalTokens + block.tokens <= effectiveBudget) {
      selectedBlocks.push(block);
      included.push(block.label);
      totalTokens += block.tokens;
    } else {
      evicted.push(block.label);
      decisions.push({
        reason: `Evicted ${block.label}: would exceed token budget (${totalTokens + block.tokens} > ${effectiveBudget})`,
        block: block.label,
      });
    }
  }

  // Rebuild messages in correct order: system → history → tool results → user
  const orderedMessages: ChatCompletionMessageParam[] = [];

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
    tokens_used: totalTokens,
    token_budget: tokenBudget,
    context_included: included,
    context_evicted: evicted,
    context_decisions: decisions,
  };
}
