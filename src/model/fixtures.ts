import type { ContextAssembly } from './types';
import {
  calculateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
  estimateUsedContextTokens,
  type AsmEntry,
  type AsmMessage,
  type TokenUsage,
} from './tokens';

export const PROMPT = '读取 README.md，并用一句话总结它在做什么。';
export const SYSTEM_PROMPT = '你是 Kimi Code，在当前仓库里阅读代码并回答。';
export const MODEL = { provider: 'moonshot', model: 'kimi-k2' } as const;
export const STAMP = 1_710_000_000_000;

export const TOOLS = [
  {
    name: 'read_file',
    description: '读取工作区里的文本文件',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '相对路径' } },
      required: ['path'],
    },
  },
  {
    name: 'shell',
    description: '在工作区执行一条 shell 命令',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
] as const;

export const TOOL_USAGE: TokenUsage = {
  inputOther: 420,
  output: 36,
  inputCacheRead: 0,
  inputCacheCreation: 0,
};

export const FINAL_USAGE: TokenUsage = {
  inputOther: 510,
  output: 22,
  inputCacheRead: 0,
  inputCacheCreation: 0,
};

export const TEXT_USAGE: TokenUsage = {
  inputOther: 418,
  output: 24,
  inputCacheRead: 0,
  inputCacheCreation: 0,
};

const userMessage: AsmMessage = {
  role: 'user',
  content: [{ type: 'text', text: PROMPT }],
};

export const TOOL_CALL = {
  type: 'function' as const,
  id: 'call_read',
  name: 'read_file',
  arguments: '{"path":"README.md"}',
};

const assistantToolMessage: AsmMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: '我先读取 README.md。' }],
  toolCalls: [{ name: TOOL_CALL.name, arguments: TOOL_CALL.arguments }],
};

export const TOOL_RESULT = '# harness-version\n可视化 harness 框架的内部流程\n';

const toolMessage: AsmMessage = {
  role: 'tool',
  content: [{ type: 'text', text: TOOL_RESULT }],
};

const assistantFinalMessage: AsmMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'README 说明这个仓库用来可视化 harness 的内部流程。' }],
  toolCalls: [],
};

export const USER_ENTRY = {
  message: userMessage,
  meta: { source: 'input', promptId: 'prompt-1', origin: { kind: 'user' } },
};

export const ASSISTANT_TOOL_ENTRY: AsmEntry = {
  message: assistantToolMessage,
  meta: {
    usage: TOOL_USAGE,
  },
};

export const TOOL_ENTRY: AsmEntry = { message: toolMessage };

export const ASSISTANT_FINAL_ENTRY: AsmEntry = {
  message: assistantFinalMessage,
  meta: { usage: FINAL_USAGE },
};

export const ASSISTANT_TEXT_ENTRY: AsmEntry = {
  message: assistantFinalMessage,
  meta: { usage: TEXT_USAGE },
};

export const LINE = {
  user: 'user · 读取 README.md，并用一句话总结…',
  assistantTool: 'assistant · toolCalls: read_file',
  tool: 'tool · read_file 的结果',
  assistantFinal: 'assistant · 一句话总结',
} as const;

export const SRC = {
  session: 'packages/agent-core-v2/src/human/session/machine.ts',
  agent: 'packages/agent-core-v2/src/human/agent/machine.ts',
  turn: 'packages/agent-core-v2/src/human/agent/turn.ts',
  tool: 'packages/agent-core-v2/src/human/tool/machine.ts',
  context: 'packages/agent-core-v2/src/human/agent/context-usage.ts',
  events: 'packages/agent-core-v2/src/human/agent/events.ts',
} as const;

function assistantWire(
  message: AsmMessage,
  usage: TokenUsage,
  finishReason: 'tool_calls' | 'completed',
) {
  return {
    message: {
      role: 'assistant' as const,
      content: message.content,
      toolCalls: (message.toolCalls ?? []).map((call) =>
        call.name === TOOL_CALL.name ? TOOL_CALL : { type: 'function' as const, id: 'call', ...call },
      ),
    },
    meta: {
      source: 'llm',
      model: MODEL,
      usage,
      finish: { finishReason, rawFinishReason: finishReason },
    },
  };
}

export const ASSISTANT_TOOL_WIRE = assistantWire(assistantToolMessage, TOOL_USAGE, 'tool_calls');
export const ASSISTANT_FINAL_WIRE = assistantWire(assistantFinalMessage, FINAL_USAGE, 'completed');
export const ASSISTANT_TEXT_WIRE = assistantWire(assistantFinalMessage, TEXT_USAGE, 'completed');

export const TOOL_WIRE = {
  message: {
    role: 'tool' as const,
    toolCallId: TOOL_CALL.id,
    content: toolMessage.content,
  },
  meta: { source: 'tool' },
};

export const TOOL_RESULT_BODY = { content: toolMessage.content };

function prefixOf() {
  return { systemPrompt: SYSTEM_PROMPT, tools: TOOLS };
}

export function firstContext(): ContextAssembly {
  const history = [USER_ENTRY];
  const usedContextTokens = estimateUsedContextTokens(history, prefixOf());
  return {
    step: 1,
    anchor: 'prefix',
    usedContextTokens,
    breakdown: [
      { label: 'systemPrompt', tokens: estimateTextTokens(SYSTEM_PROMPT) },
      { label: 'tools JSON', tokens: estimateTextTokens(JSON.stringify(TOOLS)) },
      { label: 'user 消息', tokens: estimateMessageTokens(userMessage) },
    ],
    messages: [{ role: 'user', text: PROMPT }],
    toolNames: TOOLS.map((tool) => tool.name),
  };
}

export function secondContext(): ContextAssembly {
  const history: AsmEntry[] = [USER_ENTRY, ASSISTANT_TOOL_ENTRY, TOOL_ENTRY];
  const usedContextTokens = estimateUsedContextTokens(history, prefixOf());
  return {
    step: 2,
    anchor: 'assistant-usage',
    usedContextTokens,
    breakdown: [
      { label: 'assistant usage 锚点', tokens: calculateContextTokens(TOOL_USAGE) },
      { label: '其后的 tool 消息', tokens: estimateMessageTokens(toolMessage) },
    ],
    messages: [
      { role: 'user', text: PROMPT },
      { role: 'assistant', text: '我先读取 README.md。' },
      { role: 'tool', text: TOOL_RESULT.trim() },
    ],
    toolNames: TOOLS.map((tool) => tool.name),
  };
}

export function llmActorInput(assembly: ContextAssembly) {
  const messages =
    assembly.step === 1
      ? [userMessage]
      : [
          userMessage,
          {
            role: 'assistant' as const,
            content: assistantToolMessage.content,
            toolCalls: [TOOL_CALL],
          },
          {
            role: 'tool' as const,
            toolCallId: TOOL_CALL.id,
            content: toolMessage.content,
          },
        ];
  return {
    config: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      tools: TOOLS,
    },
    content: {
      messages,
      usedContextTokens: assembly.usedContextTokens,
    },
  };
}

export const FIRST_CONTEXT = firstContext();
export const SECOND_CONTEXT = secondContext();
