import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import type { Layer } from '../model/types';

export type NodeMode = 'hot' | 'live' | 'seen' | 'waiting' | 'skipped';

export interface StateData extends Record<string, unknown> {
  layer: Layer;
  stateId: string;
  title: string;
  mode: NodeMode;
  dimmed: boolean;
}

export interface LaneData extends Record<string, unknown> {
  layer: Layer;
  index: string;
  title: string;
  file: string;
  dimmed: boolean;
}

export type StateFlowNode = Node<StateData, 'state'>;
export type LaneFlowNode = Node<LaneData, 'lane'>;

const layerName: Record<Layer, string> = {
  session: '会话',
  agent: 'Agent',
  turn: 'Turn',
  tool: 'Tool',
};

const modeName: Record<NodeMode, string> = {
  hot: '当前',
  live: '在场',
  seen: '经过',
  waiting: '未到',
  skipped: '跳过',
};

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in-l" />
      <Handle type="source" position={Position.Right} id="out-r" />
      <Handle type="target" position={Position.Top} id="in-t" style={{ left: '32%' }} />
      <Handle type="target" position={Position.Top} id="in-t2" style={{ left: '68%' }} />
      <Handle type="source" position={Position.Top} id="out-t" />
      <Handle type="source" position={Position.Bottom} id="out-b" style={{ left: '32%' }} />
      <Handle type="source" position={Position.Bottom} id="out-b2" style={{ left: '68%' }} />
      <Handle type="target" position={Position.Bottom} id="in-b" />
    </>
  );
}

export function StateNodeView({ data, selected }: NodeProps<StateFlowNode>) {
  const className = [
    'state',
    `layer-${data.layer}`,
    `is-${data.mode}`,
    data.dimmed ? 'is-dim' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <Handles />
      <span className="state-kicker">{layerName[data.layer]}</span>
      <strong>{data.stateId}</strong>
      <em>{data.title}</em>
      {(data.mode === 'hot' || data.mode === 'live' || data.mode === 'skipped') && (
        <span className="state-mode">{modeName[data.mode]}</span>
      )}
    </div>
  );
}

export function LaneNodeView({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div className={`lane layer-${data.layer} ${data.dimmed ? 'is-dim' : ''}`}>
      <div>
        <span>{data.index}</span>
        <strong>{data.title}</strong>
      </div>
      <code>{data.file}</code>
    </div>
  );
}

export const nodeTypes = {
  state: StateNodeView,
  lane: LaneNodeView,
};
