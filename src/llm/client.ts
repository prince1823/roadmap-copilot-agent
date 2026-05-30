import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

export interface LLMConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export function loadLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER || "openrouter";
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "anthropic/claude-sonnet-4-20250514";

  if (!apiKey) {
    throw new Error("LLM_API_KEY environment variable is required");
  }

  return { provider, apiKey, model };
}

function getBaseURL(provider: string): string {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://openrouter.ai/api/v1"; // use openrouter for anthropic models too
    default:
      return "https://openrouter.ai/api/v1";
  }
}

export function createLLMClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: getBaseURL(config.provider),
    defaultHeaders: {
      "HTTP-Referer": "https://roadmap-copilot-agent.local",
      "X-Title": "Roadmap Copilot Agent",
    },
  });
}

export interface LLMCallOptions {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  model: string;
  timeoutMs?: number;
}

export interface LLMCallResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callLLM(
  client: OpenAI,
  options: LLMCallOptions
): Promise<LLMCallResult> {
  const { messages, tools, model, timeoutMs = 30000 } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        temperature: 0.3,
      },
      { signal: controller.signal }
    );

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No completion choice returned from LLM");
    }

    return {
      message: choice.message,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
