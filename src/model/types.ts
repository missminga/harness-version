export type Layer = 'session' | 'agent' | 'turn' | 'tool';

export type ScenarioId = 'tools' | 'text';

export type Focus = Layer | 'all';

export interface StoryEvent {
  id: string;
  layer: Layer;
  type: string;
  summary: string;
  payload: unknown;
  source: string;
}

export interface ContextAssembly {
  step: number;
  anchor: 'prefix' | 'assistant-usage';
  usedContextTokens: number;
  breakdown: { label: string; tokens: number }[];
  messages: { role: string; text: string }[];
  toolNames: string[];
}

export interface Snapshot {
  queue: string[];
  notifications: number;
  reminders: number;
  agentMessages: string[];
  turnProduced: string[];
  pendingTools: string[];
  /** thinking 入口累加的 step。Turn 未启动时为 null。 */
  turnStep: number | null;
  /** 面向 maxSteps 的 steps 计数。Turn 未启动时为 null。 */
  turnSteps: number | null;
  turnId: number;
  activeTurnId: number | null;
}

export interface StoryStep {
  id: string;
  title: string;
  summary: string;
  hot: string[];
  live: string[];
  pulseEdges: string[];
  events: StoryEvent[];
  snapshot: Snapshot;
  context?: ContextAssembly;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  blurb: string;
  steps: StoryStep[];
}
