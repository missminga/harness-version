import { describe, expect, it } from 'vitest';

import { FIRST_CONTEXT, PROMPT, SECOND_CONTEXT, TOOL_RESULT, TOOL_USAGE } from './fixtures';
import { E, N, edges, states } from './graph';
import { scenarios } from './scenarios';
import {
  calculateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
  estimateUsedContextTokens,
} from './tokens';

const banned = [
  'turn.abort',
  'input.abort',
  'input.pause',
  'turn.pause',
  'input.steer',
  'llm.retrying',
  'llm.recovering',
  'llm.failed',
  'tool.failed',
  'tool.aborted',
  'tool.abort',
  'turn.failed',
  '"denied"',
];

describe('context tokens', () => {
  it('counts ascii in groups of four and non-ascii per character', () => {
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('你')).toBe(1);
    expect(estimateTextTokens('a你')).toBe(2);
  });

  it('adds the role token to a user message', () => {
    expect(estimateMessageTokens({ role: 'user', content: [{ type: 'text', text: 'abcd' }] })).toBe(2);
  });

  it('keeps the first assembly equal to the sum of its breakdown', () => {
    const sum = FIRST_CONTEXT.breakdown.reduce((total, row) => total + row.tokens, 0);
    expect(FIRST_CONTEXT.usedContextTokens).toBe(sum);
    expect(FIRST_CONTEXT.anchor).toBe('prefix');
    expect(FIRST_CONTEXT.messages[0]?.text).toBe(PROMPT);
  });

  it('anchors the second assembly on assistant usage plus the tool message', () => {
    const toolTokens = estimateMessageTokens({
      role: 'tool',
      content: [{ type: 'text', text: TOOL_RESULT }],
    });
    expect(SECOND_CONTEXT.anchor).toBe('assistant-usage');
    expect(SECOND_CONTEXT.usedContextTokens).toBe(calculateContextTokens(TOOL_USAGE) + toolTokens);
    expect(SECOND_CONTEXT.usedContextTokens).not.toBe(FIRST_CONTEXT.usedContextTokens);
  });

  it('matches estimateUsedContextTokens for a prefix without usage', () => {
    const tokens = estimateUsedContextTokens(
      [{ message: { role: 'user', content: [{ type: 'text', text: 'abcd' }] } }],
      { systemPrompt: 'abcd', tools: [{ name: 'read_file' }] },
    );
    expect(tokens).toBe(
      estimateTextTokens('abcd') +
        estimateTextTokens(JSON.stringify([{ name: 'read_file' }])) +
        estimateMessageTokens({ role: 'user', content: [{ type: 'text', text: 'abcd' }] }),
    );
  });
});

describe('graph', () => {
  it('connects every edge to a known state', () => {
    const ids = new Set(states.map((state) => state.id));
    expect(new Set(states.map((state) => state.id)).size).toBe(states.length);
    for (const edge of edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });
});

describe('happy path', () => {
  it('walks the tool round trip and the empty notify', () => {
    const steps = scenarios.tools.steps;
    const hot = steps.flatMap((step) => step.hot);
    expect(hot).toContain(N.gating);
    expect(hot.filter((id) => id === N.gating)).toHaveLength(2);
    const tools = steps
      .flatMap((step) => step.hot)
      .filter((id) => id.startsWith('tool.'))
      .filter((id, index, all) => all[index - 1] !== id);
    expect(tools).toEqual([N.preparing, N.executing, N.finishing, N.succeeded]);
    expect(steps.find((step) => step.id === 'submit')?.snapshot.queue).toHaveLength(1);
    expect(steps.find((step) => step.id === 'spawn')?.snapshot.queue).toHaveLength(0);
    expect(steps.find((step) => step.id === 'notify')?.events[0]?.payload).toMatchObject({
      type: 'turn.notify',
      messages: [],
    });
    expect(steps.at(-1)?.snapshot.agentMessages).toHaveLength(4);
    expect(steps.at(-1)?.snapshot.turnId).toBe(1);
    expect(steps.find((step) => step.id === 'allow')?.events[0]?.payload).toMatchObject({
      type: 'proceed',
    });
    expect(steps.some((step) => step.pulseEdges.includes(E.thinkAct))).toBe(true);
    expect(steps.some((step) => step.pulseEdges.includes(E.thinkDone))).toBe(true);
  });

  it('skips acting, draining, and tools when the model returns text', () => {
    const steps = scenarios.text.steps;
    const live = new Set(steps.flatMap((step) => step.live));
    expect(live.has(N.acting)).toBe(false);
    expect(live.has(N.draining)).toBe(false);
    expect([...live].some((id) => id.startsWith('tool.'))).toBe(false);
    expect(steps.some((step) => step.hot.includes(N.done) && step.pulseEdges.includes(E.thinkDone))).toBe(
      true,
    );
    expect(steps.at(-1)?.snapshot.agentMessages).toEqual([
      'user · 读取 README.md，并用一句话总结…',
      'assistant · 一句话总结',
    ]);
  });

  it('keeps session active and stays on the happy path', () => {
    for (const scenario of Object.values(scenarios)) {
      expect(new Set(scenario.steps.map((step) => step.id)).size).toBe(scenario.steps.length);
      for (const step of scenario.steps) {
        expect(step.live).toContain(N.session);
        for (const edgeId of step.pulseEdges) {
          expect(edges.some((edge) => edge.id === edgeId)).toBe(true);
        }
        for (const event of step.events) {
          const blob = `${event.type} ${JSON.stringify(event.payload)}`;
          for (const word of banned) expect(blob).not.toContain(word);
        }
      }
    }
  });
});
