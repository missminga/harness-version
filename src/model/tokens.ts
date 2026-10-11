/**
 * 与 packages/agent-core-v2/src/human/agent/context-usage.ts 相同的估算：
 * ASCII 每 4 个字符 1 token，非 ASCII 每个字符 1 token，媒体部分按 2000 计。
 * 尚无带 usage 的 assistant 时，把 systemPrompt 与 tools JSON 计入；
 * 否则以最近一条非零 usage 为锚，只估算它之后的消息。
 */

export interface TokenUsage {
  inputOther: number;
  output: number;
  inputCacheRead: number;
  inputCacheCreation: number;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ThinkPart {
  type: 'think';
  think: string;
}

export interface MediaPart {
  type: 'image_url' | 'audio_url' | 'video_url';
}

export type ContentPart = TextPart | ThinkPart | MediaPart;

export interface ToolCallShape {
  name: string;
  arguments: string | null;
}

export interface AsmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ContentPart[];
  toolCalls?: ToolCallShape[];
}

export interface AsmEntry {
  message: AsmMessage;
  meta?: { usage?: TokenUsage; source?: string };
}

export interface ContextPrefix {
  systemPrompt?: string;
  tools?: readonly object[];
}

const MEDIA_TOKEN_ESTIMATE = 2000;

export function calculateContextTokens(usage: TokenUsage): number {
  return usage.inputOther + usage.inputCacheRead + usage.inputCacheCreation + usage.output;
}

export function estimateTextTokens(text: string): number {
  let asciiCount = 0;
  let nonAsciiCount = 0;
  for (const char of text) {
    if ((char.codePointAt(0) as number) <= 127) asciiCount += 1;
    else nonAsciiCount += 1;
  }
  return Math.ceil(asciiCount / 4) + nonAsciiCount;
}

export function estimateMessageTokens(message: AsmMessage): number {
  let total = estimateTextTokens(message.role);
  for (const part of message.content) {
    switch (part.type) {
      case 'text':
        total += estimateTextTokens(part.text);
        break;
      case 'think':
        total += estimateTextTokens(part.think);
        break;
      case 'image_url':
      case 'audio_url':
      case 'video_url':
        total += MEDIA_TOKEN_ESTIMATE;
        break;
      default:
        break;
    }
  }
  if (message.role === 'assistant') {
    for (const call of message.toolCalls ?? []) {
      total += estimateTextTokens(call.name);
      total += estimateTextTokens(call.arguments ?? '');
    }
  }
  return total;
}

export function estimateUsedContextTokens(
  history: readonly AsmEntry[],
  prefix?: ContextPrefix,
): number {
  let lastUsageIndex = -1;
  let usageTokens = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i] as AsmEntry;
    if (entry.message.role !== 'assistant') continue;
    const tokens = calculateContextTokens(
      entry.meta?.usage ?? {
        inputOther: 0,
        output: 0,
        inputCacheRead: 0,
        inputCacheCreation: 0,
      },
    );
    if (tokens > 0) {
      lastUsageIndex = i;
      usageTokens = tokens;
      break;
    }
  }
  let tokens = usageTokens;
  for (let i = lastUsageIndex + 1; i < history.length; i += 1) {
    tokens += estimateMessageTokens((history[i] as AsmEntry).message);
  }
  if (lastUsageIndex === -1 && prefix !== undefined) {
    if (prefix.systemPrompt !== undefined) {
      tokens += estimateTextTokens(prefix.systemPrompt);
    }
    if (prefix.tools !== undefined && prefix.tools.length > 0) {
      tokens += estimateTextTokens(JSON.stringify(prefix.tools));
    }
  }
  return tokens;
}
