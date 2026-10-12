import type { Layer } from './types';
import { SRC } from './fixtures';

export const N = {
  session: 'session.active',
  idle: 'agent.idle',
  running: 'agent.running',
  gating: 'turn.gating',
  thinking: 'turn.thinking',
  acting: 'turn.acting',
  draining: 'turn.draining',
  done: 'turn.done',
  preparing: 'tool.preparing',
  executing: 'tool.executing',
  finishing: 'tool.finishing',
  succeeded: 'tool.succeeded',
} as const;

export const E = {
  send: 'e-send',
  commit: 'e-commit',
  turnDone: 'e-turn-done',
  spawnTurn: 'e-spawn-turn',
  gateThink: 'e-gate-think',
  thinkAct: 'e-think-act',
  thinkDone: 'e-think-done',
  actDrain: 'e-act-drain',
  drainGate: 'e-drain-gate',
  spawnTools: 'e-spawn-tools',
  prepExec: 'e-prep-exec',
  execFin: 'e-exec-fin',
  finOk: 'e-fin-ok',
  toolBack: 'e-tool-back',
} as const;

export interface StateSpec {
  id: string;
  layer: Layer;
  stateId: string;
  title: string;
  file: string;
  x: number;
  y: number;
  doc: string;
  exits: string[];
}

export interface LaneSpec {
  id: string;
  layer: Layer;
  index: string;
  title: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeSpec {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  label: string;
  kind: 'flow' | 'couple' | 'fork';
  pathOptions?: { offset: number; borderRadius: number };
}

export const STATE_W = 168;
export const STATE_H = 78;

const laneWidth = 1360;

export const lanes: LaneSpec[] = [
  {
    id: 'lane-session',
    layer: 'session',
    index: '01',
    title: 'Session',
    file: 'session/machine.ts',
    x: 0,
    y: 0,
    width: laneWidth,
    height: 118,
  },
  {
    id: 'lane-agent',
    layer: 'agent',
    index: '02',
    title: 'Agent',
    file: 'agent/machine.ts',
    x: 0,
    y: 130,
    width: laneWidth,
    height: 168,
  },
  {
    id: 'lane-turn',
    layer: 'turn',
    index: '03',
    title: 'Turn',
    file: 'agent/turn.ts',
    x: 0,
    y: 310,
    width: laneWidth,
    height: 230,
  },
  {
    id: 'lane-tool',
    layer: 'tool',
    index: '04',
    title: 'Tool',
    file: 'tool/machine.ts',
    x: 0,
    y: 556,
    width: laneWidth,
    height: 156,
  },
];

export const states: StateSpec[] = [
  {
    id: N.session,
    layer: 'session',
    stateId: 'active',
    title: '活跃',
    file: SRC.session,
    x: 592,
    y: 26,
    doc: 'Session 只有 active 一个业务状态。agent.send 把事件转给子 agent；冒泡上来的 llm.* 与 tool.* 在根上是空处理器，状态保持不变。创建 agent、linking 和 restoring 在这条 prompt 之前已经完成。',
    exits: ['agent.send → 转发给 agent', 'llm.* / tool.* → 空处理，留在 active'],
  },
  {
    id: N.idle,
    layer: 'agent',
    stateId: 'idle.ready',
    title: '空闲',
    file: SRC.agent,
    x: 160,
    y: 176,
    doc: 'input.submit 只把 UserEntry 追加进 queue，并把 source 标成 input。本例没有 promptGate，也没有暂停。queue 或 notifications 非空时，idle.ready 的 always 进入 running，并执行 commitPendingToHistory。',
    exits: ['有待处理且未暂停 → running + commitPendingToHistory'],
  },
  {
    id: N.running,
    layer: 'agent',
    stateId: 'running.active',
    title: '运行中',
    file: SRC.agent,
    x: 680,
    y: 176,
    doc: 'entry 记下 activeTurnId，发出 turn.started，spawn 的子 actor id 固定为 turn。请求里的 tools 会滤掉 deferred。turn.spawn_tools 调用 spawnTurnTools；turn.drain 把 notifications 和 reminders 合成 turn.notify。Turn 正常结束后回到 idle。离开本状态时会停掉 turn 与仍在场的 tool 子 actor，并把 turnId 加一。',
    exits: ['xstate.done.actor.turn → idle，emit turn.done'],
  },
  {
    id: N.gating,
    layer: 'turn',
    stateId: 'gating',
    title: '门控',
    file: SRC.turn,
    x: 36,
    y: 392,
    doc: 'Turn 的初态。本例没有 onBeforeStep，always 会同步进入 thinking。若配置了 onBeforeStep，则先跑 onBeforeStepActor，onDone 后再进入 thinking。图上单独停一帧，是为了把这道门看清楚。',
    exits: ['无 onBeforeStep → thinking', 'onBeforeStep onDone → thinking'],
  },
  {
    id: N.thinking,
    layer: 'turn',
    stateId: 'thinking',
    title: '思考',
    file: SRC.turn,
    x: 250,
    y: 392,
    doc: 'entry 更换 accumulator，step 加一，向父级发送 step.started，然后 invoke llmActor。messages 来自 history 加 produced；systemPrompt 与 tools 在 request 上，usedContextTokens 按 context-usage 估算。llm.done 带着 toolCalls 就去 acting；没有工具且不是空响应，就去 done。',
    exits: ['llm.done 且有 toolCalls → acting', 'llm.done 且无工具、非空响应 → done'],
  },
  {
    id: N.acting,
    layer: 'turn',
    stateId: 'acting',
    title: '执行工具',
    file: SRC.turn,
    x: 520,
    y: 392,
    doc: 'entry 向父级发送 turn.spawn_tools。每个 tool.done 写入 outcomes。pending 全部有结果时，always 进入 draining，并把对应的 tool 消息收进 produced。',
    exits: ['outcomes 齐 → draining + collectToolOutcomes'],
  },
  {
    id: N.draining,
    layer: 'turn',
    stateId: 'draining',
    title: '排空',
    file: SRC.turn,
    x: 790,
    y: 392,
    doc: 'entry 发送 turn.drain。Agent 回 turn.notify。消息为空时 steps 加一，回到 gating；消息非空时把它们并入 produced，并把 steps 重置为 1。本例 notifications 和 reminders 都空，因此不会发出 turn.reminders_consumed。',
    exits: ['turn.notify 且消息为空 → gating（steps + 1）', 'turn.notify 且消息非空 → gating（steps = 1）'],
  },
  {
    id: N.done,
    layer: 'turn',
    stateId: 'done',
    title: '完成',
    file: SRC.turn,
    x: 1080,
    y: 392,
    doc: '终态。output 是 { type: "done", produced }。Agent 在 xstate.done.actor.turn 里把 produced 并入 messages，发出 turn.done，并向 store 追加 message.appended 与 turn.ended。',
    exits: ['output done → Agent 回到 idle'],
  },
  {
    id: N.preparing,
    layer: 'tool',
    stateId: 'preparing',
    title: '准备',
    file: SRC.tool,
    x: 520,
    y: 596,
    doc: 'invoke preparingActor。Happy path 的决议是 { type: "proceed" }，对应交互式权限允许（allow）。默认实现直接放行，也可以改写 toolCall。本例原样进入 executing。',
    exits: ['proceed → executing'],
  },
  {
    id: N.executing,
    layer: 'tool',
    stateId: 'executing',
    title: '执行',
    file: SRC.tool,
    x: 730,
    y: 596,
    doc: 'invoke executeActor，调用 ToolExecutor.execute。tool.update 转发给父级。执行器 sendBack tool.done 后进入 finishing；这一下只保存 result，还不通知父级。',
    exits: ['tool.done → finishing'],
  },
  {
    id: N.finishing,
    layer: 'tool',
    stateId: 'finishing',
    title: '收尾',
    file: SRC.tool,
    x: 940,
    y: 596,
    doc: 'finishingActor 默认把 result 原样返回。onDone 进入 succeeded，这时才 emit tool.done，并 send 给父级 Agent。Agent 再把它 sendTo 给 turn。',
    exits: ['finishingActor onDone → succeeded + tool.done'],
  },
  {
    id: N.succeeded,
    layer: 'tool',
    stateId: 'succeeded',
    title: '成功',
    file: SRC.tool,
    x: 1150,
    y: 596,
    doc: '终态。output 是 { type: "succeeded", result }。Turn 把这份结果写入 outcomes；全部到齐后才会离开 acting。',
    exits: ['父级收到 tool.done → Turn.acting 记账'],
  },
];

export const edges: EdgeSpec[] = [
  {
    id: E.send,
    source: N.session,
    target: N.idle,
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    label: 'agent.send',
    kind: 'couple',
  },
  {
    id: E.commit,
    source: N.idle,
    target: N.running,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'commitPendingToHistory',
    kind: 'flow',
  },
  {
    id: E.turnDone,
    source: N.running,
    target: N.idle,
    sourceHandle: 'out-b',
    targetHandle: 'in-b',
    label: 'turn.done',
    kind: 'flow',
    pathOptions: { offset: 28, borderRadius: 14 },
  },
  {
    id: E.spawnTurn,
    source: N.running,
    target: N.gating,
    sourceHandle: 'out-b2',
    targetHandle: 'in-t',
    label: "spawn id 'turn'",
    kind: 'couple',
  },
  {
    id: E.gateThink,
    source: N.gating,
    target: N.thinking,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'always',
    kind: 'flow',
  },
  {
    id: E.thinkAct,
    source: N.thinking,
    target: N.acting,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: '有 toolCalls',
    kind: 'flow',
  },
  {
    id: E.thinkDone,
    source: N.thinking,
    target: N.done,
    sourceHandle: 'out-t',
    targetHandle: 'in-t',
    label: 'llm.done 无工具',
    kind: 'fork',
    pathOptions: { offset: 22, borderRadius: 12 },
  },
  {
    id: E.actDrain,
    source: N.acting,
    target: N.draining,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'outcomes 齐',
    kind: 'flow',
  },
  {
    id: E.drainGate,
    source: N.draining,
    target: N.gating,
    sourceHandle: 'out-b',
    targetHandle: 'in-b',
    label: 'turn.notify',
    kind: 'flow',
    pathOptions: { offset: 36, borderRadius: 16 },
  },
  {
    id: E.spawnTools,
    source: N.acting,
    target: N.preparing,
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    label: 'turn.spawn_tools',
    kind: 'couple',
  },
  {
    id: E.prepExec,
    source: N.preparing,
    target: N.executing,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'allow',
    kind: 'flow',
  },
  {
    id: E.execFin,
    source: N.executing,
    target: N.finishing,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'tool.done',
    kind: 'flow',
  },
  {
    id: E.finOk,
    source: N.finishing,
    target: N.succeeded,
    sourceHandle: 'out-r',
    targetHandle: 'in-l',
    label: 'emit',
    kind: 'flow',
  },
  {
    id: E.toolBack,
    source: N.succeeded,
    target: N.acting,
    sourceHandle: 'out-t',
    targetHandle: 'in-b',
    label: 'parent tool.done',
    kind: 'couple',
    pathOptions: { offset: 20, borderRadius: 12 },
  },
];

export const stateById = new Map(states.map((state) => [state.id, state]));

export function layerOf(nodeId: string): Layer | undefined {
  return stateById.get(nodeId)?.layer;
}
