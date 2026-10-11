import { useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';

import { edges, lanes, layerOf, STATE_H, STATE_W, states } from '../model/graph';
import type { Focus, StoryStep } from '../model/types';
import { nodeTypes, type LaneData, type NodeMode, type StateData } from './nodes';

interface FlowCanvasProps {
  step: StoryStep;
  used: Set<string>;
  seen: Set<string>;
  seenEdges: Set<string>;
  focus: Focus;
  onPick: (id: string) => void;
}

function modeOf(id: string, step: StoryStep, used: Set<string>, seen: Set<string>): NodeMode {
  if (!used.has(id)) return 'skipped';
  if (step.hot.includes(id)) return 'hot';
  if (step.live.includes(id)) return 'live';
  if (seen.has(id)) return 'seen';
  return 'waiting';
}

export function FlowCanvas({ step, used, seen, seenEdges, focus, onPick }: FlowCanvasProps) {
  const nodes = useMemo<Node[]>(() => {
    const laneNodes: Node<LaneData, 'lane'>[] = lanes.map((lane) => ({
      id: lane.id,
      type: 'lane',
      position: { x: lane.x, y: lane.y },
      data: {
        layer: lane.layer,
        index: lane.index,
        title: lane.title,
        file: lane.file,
        dimmed: focus !== 'all' && focus !== lane.layer,
      },
      style: { width: lane.width, height: lane.height, pointerEvents: 'none' },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
    }));
    const stateNodes: Node<StateData, 'state'>[] = states.map((state) => ({
      id: state.id,
      type: 'state',
      position: { x: state.x, y: state.y },
      data: {
        layer: state.layer,
        stateId: state.stateId,
        title: state.title,
        mode: modeOf(state.id, step, used, seen),
        dimmed: focus !== 'all' && focus !== state.layer,
      },
      style: { width: STATE_W, height: STATE_H },
      draggable: false,
      connectable: false,
      zIndex: 2,
    }));
    return [...laneNodes, ...stateNodes];
  }, [focus, seen, step, used]);

  const flowEdges = useMemo<Edge[]>(() => {
    const pulsed = new Set(step.pulseEdges);
    return edges.map((edge) => {
      const sourceLayer = layerOf(edge.source);
      const targetLayer = layerOf(edge.target);
      const dimmed = focus !== 'all' && sourceLayer !== focus && targetLayer !== focus;
      const hot = pulsed.has(edge.id);
      const traveled = seenEdges.has(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
        type: 'smoothstep',
        animated: hot,
        className: [
          `edge-${edge.kind}`,
          hot ? 'edge-hot' : traveled ? 'edge-seen' : 'edge-idle',
          dimmed ? 'edge-dim' : '',
        ]
          .filter(Boolean)
          .join(' '),
        zIndex: hot ? 3 : 1,
        pathOptions: edge.pathOptions,
        labelStyle: {
          fill: hot ? '#f7f3ea' : '#c9c2b6',
          fontSize: 11,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        },
        labelBgStyle: { fill: '#171a22', fillOpacity: 0.94 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
      };
    });
  }, [focus, seenEdges, step.pulseEdges]);

  return (
    <div className="flow-wrap">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.14 }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnDoubleClick={false}
        colorMode="dark"
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => {
          if (node.type === 'state') onPick(node.id);
        }}
      >
        <Background gap={22} size={1.1} color="#2a3142" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
