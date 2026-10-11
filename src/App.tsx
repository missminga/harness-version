import { useEffect, useMemo, useState } from 'react';

import { FlowCanvas } from './components/FlowCanvas';
import { SidePanel } from './components/SidePanel';
import { Timeline } from './components/Timeline';
import { PROMPT } from './model/fixtures';
import { seenEdgeIds, seenNodeIds, usedNodeIds, scenarios } from './model/scenarios';
import type { Focus, Layer, ScenarioId } from './model/types';

const layers: { id: Focus; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'session', label: '会话' },
  { id: 'agent', label: 'Agent' },
  { id: 'turn', label: 'Turn' },
  { id: 'tool', label: 'Tool' },
];

const speeds = [
  { id: 900, label: '快' },
  { id: 1500, label: '中' },
  { id: 2400, label: '慢' },
];

export function App() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('tools');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const [focus, setFocus] = useState<Focus>('all');
  const [pinned, setPinned] = useState<string | null>(null);
  const [tab, setTab] = useState<'step' | 'log' | 'node'>('step');

  const scenario = scenarios[scenarioId];
  const step = scenario.steps[index] ?? scenario.steps[0]!;
  const used = useMemo(() => usedNodeIds(scenario), [scenario]);
  const seen = useMemo(() => seenNodeIds(scenario, index), [scenario, index]);
  const seenEdges = useMemo(() => seenEdgeIds(scenario, index), [scenario, index]);
  const nodeId = pinned ?? step.hot[step.hot.length - 1] ?? step.live[0] ?? 'session.active';
  const log = useMemo(
    () =>
      scenario.steps.slice(0, index + 1).flatMap((item) =>
        item.events.map((event) => ({ stepTitle: item.title, event })),
      ),
    [index, scenario.steps],
  );

  useEffect(() => {
    if (!playing) return;
    if (index >= scenario.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, scenario.steps.length - 1));
    }, speed);
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, scenario.steps.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setIndex((current) => Math.min(current + 1, scenario.steps.length - 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setIndex((current) => Math.max(current - 1, 0));
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.key === 'Home') {
        setPlaying(false);
        setIndex(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scenario.steps.length]);

  function chooseScenario(id: ScenarioId) {
    setScenarioId(id);
    setIndex(0);
    setPlaying(false);
    setPinned(null);
    setTab('step');
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="kicker">agent-core-v2 · human harness</p>
            <h1>快乐路径</h1>
          </div>
        </div>
        <p className="limit">
          只演示 happy path。不含 abort、pause、retry / recovery、maxSteps 失败、用户中断、steer 回注。
        </p>
        <p className="prompt-line">
          <span>Prompt</span>
          <q>{PROMPT}</q>
        </p>
        <div className="controls">
          <div className="seg" role="group" aria-label="场景">
            {(Object.values(scenarios)).map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === scenarioId ? 'is-on' : ''}
                aria-pressed={item.id === scenarioId}
                onClick={() => chooseScenario(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
          <div className="transport">
            <button type="button" onClick={() => { setPlaying(false); setIndex(0); }}>
              重置
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setIndex((current) => Math.max(current - 1, 0));
              }}
            >
              上一步
            </button>
            <button
              type="button"
              className="primary"
              aria-pressed={playing}
              onClick={() => {
                if (index >= scenario.steps.length - 1) setIndex(0);
                setPlaying((current) => !current);
              }}
            >
              {playing ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setIndex((current) => Math.min(current + 1, scenario.steps.length - 1));
              }}
            >
              单步
            </button>
          </div>
          <div className="seg" role="group" aria-label="层">
            {layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`layer-btn ${layer.id === 'all' ? '' : `layer-${layer.id as Layer}`} ${focus === layer.id ? 'is-on' : ''}`}
                aria-pressed={focus === layer.id}
                onClick={() => setFocus(layer.id)}
              >
                {layer.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="速度">
            {speeds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={speed === item.id ? 'is-on' : ''}
                aria-pressed={speed === item.id}
                onClick={() => setSpeed(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="hint">空格播放 · ← → 单步</p>
        </div>
        <p className="blurb">{scenario.blurb}</p>
      </header>
      <div className="workspace">
        <FlowCanvas
          step={step}
          used={used}
          seen={seen}
          seenEdges={seenEdges}
          focus={focus}
          onPick={(id) => {
            setPinned(id);
            setTab('node');
          }}
        />
        <SidePanel
          step={step}
          index={index}
          total={scenario.steps.length}
          log={log}
          nodeId={nodeId}
          pinned={pinned !== null}
          tab={tab}
          onTab={setTab}
          onUnpin={() => setPinned(null)}
        />
      </div>
      <Timeline
        steps={scenario.steps}
        index={index}
        onPick={(next) => {
          setPlaying(false);
          setIndex(next);
        }}
      />
    </div>
  );
}
