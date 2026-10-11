import {
  ASSISTANT_FINAL_WIRE,
  ASSISTANT_TEXT_WIRE,
  ASSISTANT_TOOL_WIRE,
  FIRST_CONTEXT,
  LINE,
  MODEL,
  PROMPT,
  SECOND_CONTEXT,
  SRC,
  STAMP,
  SYSTEM_PROMPT,
  TOOL_CALL,
  TOOL_RESULT,
  TOOL_RESULT_BODY,
  TOOL_WIRE,
  TOOLS,
  USER_ENTRY,
  llmActorInput,
} from './fixtures';
import { E, N } from './graph';
import type { Layer, Scenario, Snapshot, StoryEvent, StoryStep } from './types';

const idleLive = [N.session, N.idle];

function turnLive(turn: string, tool?: string): string[] {
  return tool ? [N.session, N.running, turn, tool] : [N.session, N.running, turn];
}

function snap(partial: Partial<Snapshot> & Pick<Snapshot, 'turnId'>): Snapshot {
  return {
    queue: [],
    notifications: 0,
    reminders: 0,
    agentMessages: [],
    turnProduced: [],
    pendingTools: [],
    turnStep: null,
    turnSteps: null,
    activeTurnId: null,
    ...partial,
  };
}

let eventSerial = 0;

function ev(
  layer: Layer,
  type: string,
  summary: string,
  payload: unknown,
  source: string,
): StoryEvent {
  eventSerial += 1;
  return { id: `ev-${eventSerial}`, layer, type, summary, payload, source };
}

const queued = snap({
  turnId: 0,
  queue: [LINE.user],
});

const turnBase = {
  turnId: 0,
  activeTurnId: 0,
  agentMessages: [LINE.user],
  turnSteps: 1,
  turnStep: 0,
};

const pending = ['read_file · call_read'];

const producedTool = [LINE.assistantTool];
const producedWithResult = [LINE.assistantTool, LINE.tool];
const producedDone = [LINE.assistantTool, LINE.tool, LINE.assistantFinal];

const storeUser = {
  type: 'store.append',
  event: [{ type: 'message.appended', time: STAMP, message: USER_ENTRY }],
};

const turnStarted = {
  type: 'turn.started',
  turnId: 0,
  branchId: 'main',
  queueItemId: 'prompt-1',
  entry: USER_ENTRY,
};

function stepStarted(step: number) {
  return { type: 'step.started', step };
}

function toolDoneEvent() {
  return { type: 'tool.done', toolCallId: TOOL_CALL.id, result: TOOL_RESULT_BODY };
}

const prefix: StoryStep[] = [
  {
    id: 'ready',
    title: '就绪',
    summary:
      'Session 停在 active，Agent coder 已完成 linking 与 restoring，停在 idle.ready。branch 是 main，队列为空。快乐路径从下一条用户消息开始。',
    hot: [N.idle],
    live: idleLive,
    pulseEdges: [],
    events: [],
    snapshot: snap({ turnId: 0 }),
  },
  {
    id: 'submit',
    title: '提交入队',
    summary:
      'Session 用 agent.send 把 input.submit 转给 Agent。Agent 只把 UserEntry 追加进 queue，source 标为 input。这一拍还没写 event store，也还没 spawn turn。真实机器随后会立刻重算 always，这里拆成下一帧。',
    hot: [N.session, N.idle],
    live: idleLive,
    pulseEdges: [E.send],
    events: [
      ev(
        'session',
        'agent.send',
        '转发给 agentId coder。',
        {
          type: 'agent.send',
          agentId: 'coder',
          event: { type: 'input.submit', entry: USER_ENTRY },
        },
        SRC.session,
      ),
      ev(
        'agent',
        'input.submit',
        'queue 追加一条 source 为 input 的用户消息。',
        { type: 'input.submit', entry: USER_ENTRY },
        SRC.agent,
      ),
    ],
    snapshot: queued,
  },
  {
    id: 'spawn',
    title: '出队并启动 Turn',
    summary:
      'idle.ready 看到 queue 非空且未暂停，进入 running。commitPendingToHistory 把队首写入历史并清空 queue，entry 发出 turn.started，spawn 的子 actor id 是 turn，初态 gating。',
    hot: [N.running, N.gating],
    live: turnLive(N.gating),
    pulseEdges: [E.commit, E.spawnTurn],
    events: [
      ev('agent', 'store.append', '把 notifications（空）和队首用户消息写入 store。', storeUser, SRC.events),
      ev('agent', 'turn.started', 'activeTurnId 记为 0，并带上 queueItemId。', turnStarted, SRC.agent),
      ev(
        'agent',
        'store.append',
        'store 再追加一条 turn.started。',
        { type: 'store.append', event: [{ ...turnStarted, time: STAMP }] },
        SRC.events,
      ),
      ev(
        'turn',
        'spawn',
        '子 actor id 固定为 turn。tools 已滤掉 deferred，本例两件工具都直接进入请求。',
        {
          id: 'turn',
          input: {
            request: { model: MODEL, systemPrompt: SYSTEM_PROMPT, tools: TOOLS },
            history: [USER_ENTRY],
          },
        },
        SRC.agent,
      ),
    ],
    snapshot: snap(turnBase),
  },
  {
    id: 'think',
    title: '门控进入思考',
    summary:
      '没有 onBeforeStep，gating 的 always 同步进入 thinking。entry 把 step 加到 1，向父级发送 step.started，并按 history 加 produced 装配 llmActor 的输入。',
    hot: [N.thinking],
    live: turnLive(N.thinking),
    pulseEdges: [E.gateThink],
    events: [
      ev('turn', 'step.started', 'Agent 会把这条信号再 emit 并转发给 Session。', stepStarted(1), SRC.turn),
      ev(
        'session',
        'step.started',
        'Session 根上的空处理器收下，active 不变。',
        stepStarted(1),
        SRC.session,
      ),
      ev(
        'turn',
        'llmActor',
        '第一次请求还没有带 usage 的 assistant，token 估算含 systemPrompt、tools JSON 和用户消息。',
        llmActorInput(FIRST_CONTEXT),
        SRC.context,
      ),
    ],
    snapshot: snap({ ...turnBase, turnStep: 1 }),
    context: FIRST_CONTEXT,
  },
  {
    id: 'sent',
    title: '发出 LLM 请求',
    summary:
      'llm.sent 仍停在 thinking。Turn 把事件转给父级，并丢掉这一次尝试里已经积下的流（discardAttemptStream），准备接收正文。',
    hot: [N.thinking],
    live: turnLive(N.thinking),
    pulseEdges: [],
    events: [
      ev(
        'turn',
        'llm.sent',
        '快乐路径没有 recovery，appliedRecoveries 为空。',
        { type: 'llm.sent', recovery: undefined },
        SRC.turn,
      ),
      ev(
        'session',
        'llm.sent',
        'Session 收下 llm.sent，状态仍是 active。',
        { type: 'llm.sent' },
        SRC.session,
      ),
    ],
    snapshot: snap({ ...turnBase, turnStep: 1 }),
    context: FIRST_CONTEXT,
  },
];

const toolTail: StoryStep[] = [
  {
    id: 'stream-tool',
    title: '流式工具调用',
    summary:
      'thinking 收下 llm.streaming.part：先是一句说明，再是 read_file。shell 在工具表里，但模型这次没有调用它。状态仍是 thinking。',
    hot: [N.thinking],
    live: turnLive(N.thinking),
    pulseEdges: [],
    events: [
      ev(
        'turn',
        'llm.streaming.part',
        '文本片段推进 accumulator，并转发给父级。',
        { type: 'llm.streaming.part', part: { type: 'text', text: '我先读取 README.md。' } },
        SRC.turn,
      ),
      ev(
        'turn',
        'llm.streaming.part',
        '函数调用片段。id 在这次响应里不需要重写。',
        { type: 'llm.streaming.part', part: TOOL_CALL },
        SRC.turn,
      ),
    ],
    snapshot: snap({ ...turnBase, turnStep: 1 }),
    context: FIRST_CONTEXT,
  },
  {
    id: 'acting',
    title: '有工具则进入 acting',
    summary:
      'llm.done 时 toolCalls 非空，进入 acting。父级收到带 source llm 的 assistant entry；entry 发出 turn.spawn_tools。Agent 下一帧才真正 spawn 工具。',
    hot: [N.acting],
    live: turnLive(N.acting),
    pulseEdges: [E.thinkAct],
    events: [
      ev(
        'turn',
        'llm.done',
        'sendToParent 的是 AssistantEntry，不是请求器原始事件。finishReason 为 tool_calls。',
        { type: 'llm.done', entry: ASSISTANT_TOOL_WIRE },
        SRC.turn,
      ),
      ev(
        'session',
        'llm.done',
        'Session 的空处理器收下 llm.done。',
        { type: 'llm.done', entry: ASSISTANT_TOOL_WIRE },
        SRC.session,
      ),
      ev(
        'turn',
        'turn.spawn_tools',
        'acting 的 entry 把 pendingToolCalls 交给 Agent。',
        { type: 'turn.spawn_tools', toolCalls: [TOOL_CALL] },
        SRC.turn,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'spawn-tool',
    title: '拉起 Tool',
    summary:
      'Agent 在 running.active 上执行 spawnTurnTools。每个 toolCall 一个子 actor，id 就是 toolCall.id，初态 preparing。',
    hot: [N.preparing],
    live: turnLive(N.acting, N.preparing),
    pulseEdges: [E.spawnTools],
    events: [
      ev(
        'tool',
        'spawn',
        'input 带上 toolCall、父级 signal 派生的 AbortSignal，以及 waitForTasks。',
        {
          id: TOOL_CALL.id,
          input: { toolCall: TOOL_CALL, signal: 'AbortSignal', waitForTasks: 'bound' },
        },
        SRC.agent,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'allow',
    title: '权限允许',
    summary:
      'preparingActor 返回 proceed，这就是交互式权限允许（allow）。默认实现直接放行，toolCall 原样进入 executing。',
    hot: [N.executing],
    live: turnLive(N.acting, N.executing),
    pulseEdges: [E.prepExec],
    events: [
      ev(
        'tool',
        'preparingActor',
        '决议 type 为 proceed。允许路径不改写参数。',
        { type: 'proceed', toolCall: TOOL_CALL },
        SRC.tool,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'update',
    title: '工具执行中',
    summary: 'executeActor 调用 read_file。tool.update 从 executing 转发给父级，状态不变。',
    hot: [N.executing],
    live: turnLive(N.acting, N.executing),
    pulseEdges: [],
    events: [
      ev(
        'tool',
        'tool.update',
        'Agent 与 Session 都会转发这条更新。',
        {
          type: 'tool.update',
          toolCallId: TOOL_CALL.id,
          update: { key: 'stdout', text: '# harness-version\n', percent: 40 },
        },
        SRC.tool,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'exec-done',
    title: '执行完成，进入收尾',
    summary:
      '执行器 sendBack tool.done，executing 进入 finishing 并记下 result。这一拍还不 emit 给父级。',
    hot: [N.finishing],
    live: turnLive(N.acting, N.finishing),
    pulseEdges: [E.execFin],
    events: [
      ev(
        'tool',
        'tool.done',
        '这是 executeActor 的内部 sendBack，父级要等 finishing 结束。',
        { type: 'tool.done', toolCallId: TOOL_CALL.id, result: { content: [{ type: 'text', text: TOOL_RESULT }] } },
        SRC.tool,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'finish-ok',
    title: '收尾成功',
    summary:
      'finishingActor 原样返回 result，进入 succeeded。这时才 emit tool.done 并送给父级 Agent。',
    hot: [N.succeeded],
    live: turnLive(N.acting, N.succeeded),
    pulseEdges: [E.finOk],
    events: [
      ev('tool', 'tool.done', 'emit，并 self._parent.send 给 Agent。', toolDoneEvent(), SRC.tool),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedTool,
      pendingTools: pending,
    }),
  },
  {
    id: 'drain',
    title: '结果齐，进入排空',
    summary:
      'Agent 把 tool.done sendTo turn。outcomes 到齐后 always 进入 draining，工具消息收进 produced，entry 发出 turn.drain。',
    hot: [N.draining],
    live: turnLive(N.draining, N.succeeded),
    pulseEdges: [E.toolBack, E.actDrain],
    events: [
      ev('agent', 'tool.done', 'turnTools 里的调用转发给 turn，并继续冒泡到 Session。', toolDoneEvent(), SRC.agent),
      ev(
        'turn',
        'tool.done',
        'outcomes[call_read] 记为 succeeded。',
        { toolCallId: TOOL_CALL.id, outcome: { type: 'succeeded', result: TOOL_RESULT_BODY } },
        SRC.turn,
      ),
      ev('turn', 'turn.drain', 'draining 的 entry 通知 Agent 排空通知和提醒。', { type: 'turn.drain' }, SRC.turn),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: producedWithResult,
      pendingTools: [],
    }),
  },
  {
    id: 'notify',
    title: '空通知，回到门控',
    summary:
      'Agent 把 notifications 和 reminders 拼成 turn.notify。两者都空，所以不发 turn.reminders_consumed，steps 从 1 加到 2，回到 gating。',
    hot: [N.gating],
    live: turnLive(N.gating, N.succeeded),
    pulseEdges: [E.drainGate],
    events: [
      ev(
        'agent',
        'turn.notify',
        'messages 为空数组。非空时才会清空 notifications 与 reminders，并把 steps 重置为 1。',
        { type: 'turn.notify', messages: [] },
        SRC.agent,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnSteps: 2,
      turnProduced: producedWithResult,
    }),
  },
  {
    id: 'think-2',
    title: '第二步思考',
    summary:
      'gating 再次进入 thinking。step 加到 2。这次上下文以第一条 assistant 的 usage 为锚，只追加它后面的 tool 消息。',
    hot: [N.thinking],
    live: turnLive(N.thinking, N.succeeded),
    pulseEdges: [E.gateThink],
    events: [
      ev('turn', 'step.started', '第二步。steps 仍是 2，和 step 不是同一个计数。', stepStarted(2), SRC.turn),
      ev(
        'turn',
        'llmActor',
        'usage 锚点是 420 + 36。用户原文已经含在那次 usage 里，不再单独估算。',
        llmActorInput(SECOND_CONTEXT),
        SRC.context,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 2,
      turnSteps: 2,
      turnProduced: producedWithResult,
    }),
    context: SECOND_CONTEXT,
  },
  {
    id: 'answer',
    title: '无工具，Turn 完成',
    summary:
      '第二条 llm.done 没有 toolCalls，也不是空响应，直接进入 done，跳过 acting 和 draining。',
    hot: [N.done],
    live: turnLive(N.done, N.succeeded),
    pulseEdges: [E.thinkDone],
    events: [
      ev(
        'turn',
        'llm.done',
        '守卫顺序：有 toolCalls 才去 acting；空响应不走快乐路径；否则 done。',
        { type: 'llm.done', entry: ASSISTANT_FINAL_WIRE },
        SRC.turn,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 2,
      turnSteps: 2,
      turnProduced: producedDone,
    }),
  },
  {
    id: 'settle',
    title: 'Agent 回到空闲',
    summary:
      'xstate.done.actor.turn 把 produced 并入 Agent 历史，发出 turn.done，并写入 turn.ended。随后 turn 与 tool 子 actor 被停掉，turnId 加到 1。队列仍空，停在 idle.ready。',
    hot: [N.idle],
    live: idleLive,
    pulseEdges: [E.turnDone],
    events: [
      ev(
        'agent',
        'xstate.done.actor.turn',
        'output.type 为 done。',
        {
          type: 'xstate.done.actor.turn',
          output: {
            type: 'done',
            produced: [ASSISTANT_TOOL_WIRE, TOOL_WIRE, ASSISTANT_FINAL_WIRE],
          },
        },
        SRC.agent,
      ),
      ev(
        'agent',
        'turn.done',
        'messages 已是并入 produced 之后的完整历史。',
        {
          type: 'turn.done',
          branchId: 'main',
          messages: [USER_ENTRY, ASSISTANT_TOOL_WIRE, TOOL_WIRE, ASSISTANT_FINAL_WIRE],
        },
        SRC.agent,
      ),
      ev(
        'agent',
        'store.append',
        'produced 各写一条 message.appended，再写 turn.ended。',
        {
          type: 'store.append',
          event: [
            { type: 'message.appended', time: STAMP, message: ASSISTANT_TOOL_WIRE },
            { type: 'message.appended', time: STAMP, message: TOOL_WIRE },
            { type: 'message.appended', time: STAMP, message: ASSISTANT_FINAL_WIRE },
            { type: 'turn.ended', time: STAMP, turnId: 0, outcome: 'done' },
          ],
        },
        SRC.events,
      ),
    ],
    snapshot: snap({
      turnId: 1,
      activeTurnId: 0,
      agentMessages: [LINE.user, LINE.assistantTool, LINE.tool, LINE.assistantFinal],
    }),
  },
];

const textTail: StoryStep[] = [
  {
    id: 'stream-text',
    title: '流式文本',
    summary: '模型直接给出回答，没有工具调用。thinking 只累积文本片段。',
    hot: [N.thinking],
    live: turnLive(N.thinking),
    pulseEdges: [],
    events: [
      ev(
        'turn',
        'llm.streaming.part',
        '片段进入 accumulator，并转发给父级。',
        {
          type: 'llm.streaming.part',
          part: { type: 'text', text: 'README 说明这个仓库用来可视化 harness 的内部流程。' },
        },
        SRC.turn,
      ),
    ],
    snapshot: snap({ ...turnBase, turnStep: 1 }),
    context: FIRST_CONTEXT,
  },
  {
    id: 'answer-text',
    title: '无工具，直接完成',
    summary:
      'llm.done 的 toolCalls 为空，且回答不是空响应，于是从 thinking 直接进入 done。acting、draining 和 Tool 都不会出现。',
    hot: [N.done],
    live: turnLive(N.done),
    pulseEdges: [E.thinkDone],
    events: [
      ev(
        'turn',
        'llm.done',
        '跳过 acting 与 draining。finishReason 为 completed。',
        { type: 'llm.done', entry: ASSISTANT_TEXT_WIRE },
        SRC.turn,
      ),
      ev(
        'session',
        'llm.done',
        'Session 收下后仍停在 active。',
        { type: 'llm.done', entry: ASSISTANT_TEXT_WIRE },
        SRC.session,
      ),
    ],
    snapshot: snap({
      ...turnBase,
      turnStep: 1,
      turnProduced: [LINE.assistantFinal],
    }),
  },
  {
    id: 'settle-text',
    title: 'Agent 回到空闲',
    summary: 'Turn 的 done 输出并入 Agent 历史。没有工具消息。turnId 加到 1，回到 idle.ready。',
    hot: [N.idle],
    live: idleLive,
    pulseEdges: [E.turnDone],
    events: [
      ev(
        'agent',
        'xstate.done.actor.turn',
        'produced 只有一条 assistant 文本。',
        { type: 'xstate.done.actor.turn', output: { type: 'done', produced: [ASSISTANT_TEXT_WIRE] } },
        SRC.agent,
      ),
      ev(
        'agent',
        'turn.done',
        '历史是用户消息加上这条回答。',
        {
          type: 'turn.done',
          branchId: 'main',
          messages: [USER_ENTRY, ASSISTANT_TEXT_WIRE],
        },
        SRC.agent,
      ),
      ev(
        'agent',
        'store.append',
        '一条 message.appended，加上 outcome 为 done 的 turn.ended。',
        {
          type: 'store.append',
          event: [
            { type: 'message.appended', time: STAMP, message: ASSISTANT_TEXT_WIRE },
            { type: 'turn.ended', time: STAMP, turnId: 0, outcome: 'done' },
          ],
        },
        SRC.events,
      ),
    ],
    snapshot: snap({
      turnId: 1,
      activeTurnId: 0,
      agentMessages: [LINE.user, LINE.assistantFinal],
    }),
  },
];

export const scenarios: Record<Scenario['id'], Scenario> = {
  tools: {
    id: 'tools',
    title: '带工具调用',
    blurb: `${PROMPT} 模型先调用 read_file，排空空的通知后做第二步，再以纯文本结束。`,
    steps: [...prefix, ...toolTail],
  },
  text: {
    id: 'text',
    title: '无工具结束',
    blurb: '同一条 prompt，模型直接回答。llm.done 没有 toolCalls，跳过 acting、draining 和 Tool。',
    steps: [...prefix, ...textTail],
  },
};

export function usedNodeIds(scenario: Scenario): Set<string> {
  const ids = new Set<string>();
  for (const step of scenario.steps) {
    for (const id of step.live) ids.add(id);
  }
  return ids;
}

export function seenNodeIds(scenario: Scenario, index: number): Set<string> {
  const ids = new Set<string>();
  for (const step of scenario.steps.slice(0, index + 1)) {
    for (const id of step.live) ids.add(id);
  }
  return ids;
}

export function seenEdgeIds(scenario: Scenario, index: number): Set<string> {
  const ids = new Set<string>();
  for (const step of scenario.steps.slice(0, index + 1)) {
    for (const id of step.pulseEdges) ids.add(id);
  }
  return ids;
}
