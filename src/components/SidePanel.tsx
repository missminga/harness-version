import { useState } from 'react';

import { stateById } from '../model/graph';
import type { ContextAssembly, Snapshot, StoryEvent, StoryStep } from '../model/types';

type Tab = 'step' | 'log' | 'node';

interface SidePanelProps {
  step: StoryStep;
  index: number;
  total: number;
  log: { stepTitle: string; event: StoryEvent }[];
  nodeId: string;
  pinned: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onUnpin: () => void;
}

const anchorCopy: Record<ContextAssembly['anchor'], string> = {
  prefix: '历史里还没有带 usage 的 assistant，于是把 systemPrompt、tools JSON 和已有消息一起估算。',
  'assistant-usage':
    '以上一条非零 usage 为锚，只估算它后面的消息。更早的用户原文已经包含在那次 usage 里。',
};

export function SidePanel({
  step,
  index,
  total,
  log,
  nodeId,
  pinned,
  tab,
  onTab,
  onUnpin,
}: SidePanelProps) {
  return (
    <aside className="panel">
      <div className="tabs" role="tablist">
        {(
          [
            ['step', '这一步'],
            ['log', '事件'],
            ['node', '节点'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-on' : ''}
            onClick={() => onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'step' && (
        <div className="panel-body">
          <p className="step-index">
            {index + 1} / {total}
          </p>
          <h2>{step.title}</h2>
          <p className="summary">{step.summary}</p>
          <SnapshotView snapshot={step.snapshot} />
          {step.context && <ContextView context={step.context} />}
          <h3>本步事件</h3>
          {step.events.length === 0 ? (
            <p className="empty">还没有新事件。</p>
          ) : (
            step.events.map((event) => <EventCard key={event.id} event={event} open />)
          )}
        </div>
      )}
      {tab === 'log' && (
        <div className="panel-body">
          <h2>到这一步为止</h2>
          {log.length === 0 ? (
            <p className="empty">播放或单步之后，事件会出现在这里。</p>
          ) : (
            log.map((item) => (
              <EventCard key={item.event.id} event={item.event} kicker={item.stepTitle} />
            ))
          )}
        </div>
      )}
      {tab === 'node' && <NodeView nodeId={nodeId} pinned={pinned} onUnpin={onUnpin} />}
    </aside>
  );
}

function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <dl className="snapshot">
      <div>
        <dt>queue</dt>
        <dd>{snapshot.queue.length === 0 ? '空' : snapshot.queue.join('、')}</dd>
      </div>
      <div>
        <dt>notifications / reminders</dt>
        <dd>
          {snapshot.notifications} / {snapshot.reminders}
        </dd>
      </div>
      <div>
        <dt>Agent messages</dt>
        <dd>{snapshot.agentMessages.length === 0 ? '空' : snapshot.agentMessages.join(' → ')}</dd>
      </div>
      <div>
        <dt>Turn produced</dt>
        <dd>{snapshot.turnProduced.length === 0 ? '空' : snapshot.turnProduced.join(' → ')}</dd>
      </div>
      <div>
        <dt>pending tools</dt>
        <dd>{snapshot.pendingTools.length === 0 ? '空' : snapshot.pendingTools.join('、')}</dd>
      </div>
      <div>
        <dt>step / steps / turnId</dt>
        <dd>
          {snapshot.turnStep ?? '—'} / {snapshot.turnSteps ?? '—'} / {snapshot.turnId}
          {snapshot.activeTurnId !== null ? `（active ${snapshot.activeTurnId}）` : ''}
        </dd>
      </div>
    </dl>
  );
}

function ContextView({ context }: { context: ContextAssembly }) {
  return (
    <section className="context">
      <h3>上下文装配 · step {context.step}</h3>
      <p>{anchorCopy[context.anchor]}</p>
      <p className="token-total">
        usedContextTokens <strong>{context.usedContextTokens}</strong>
      </p>
      <ul>
        {context.breakdown.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span>{row.tokens}</span>
          </li>
        ))}
      </ul>
      <ol className="messages">
        {context.messages.map((message, index) => (
          <li key={`${message.role}-${index}`}>
            <span>{message.role}</span>
            {message.text}
          </li>
        ))}
      </ol>
      <p className="tools-line">tools · {context.toolNames.join('、')}</p>
    </section>
  );
}

function EventCard({ event, open = false, kicker }: { event: StoryEvent; open?: boolean; kicker?: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(event.payload, null, 2);
  return (
    <details className="event" open={open}>
      <summary>
        {kicker && <span className="event-step">{kicker}</span>}
        <span className={`chip layer-${event.layer}`}>{event.layer}</span>
        <code>{event.type}</code>
      </summary>
      <p>{event.summary}</p>
      <p className="source">{event.source}</p>
      <div className="payload-bar">
        <span>payload</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="payload">{text}</pre>
    </details>
  );
}

function NodeView({
  nodeId,
  pinned,
  onUnpin,
}: {
  nodeId: string;
  pinned: boolean;
  onUnpin: () => void;
}) {
  const spec = stateById.get(nodeId);
  if (!spec) return null;
  return (
    <div className="panel-body">
      <p className="step-index">
        <span className={`chip layer-${spec.layer}`}>{spec.layer}</span>
        {pinned ? '已固定' : '跟随当前'}
      </p>
      <h2>{spec.stateId}</h2>
      <p className="summary">{spec.title}</p>
      <p>{spec.doc}</p>
      <h3>快乐路径出口</h3>
      <ul className="exits">
        {spec.exits.map((exit) => (
          <li key={exit}>{exit}</li>
        ))}
      </ul>
      <p className="source">{spec.file}</p>
      {pinned && (
        <button type="button" className="text-button" onClick={onUnpin}>
          改回跟随当前
        </button>
      )}
    </div>
  );
}
