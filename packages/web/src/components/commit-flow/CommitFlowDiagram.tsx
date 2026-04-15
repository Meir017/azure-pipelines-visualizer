import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo } from 'react';
import type { BuildInfo } from '../../services/api-client.js';
import BuildNode, { type BuildNodeData } from './BuildNode.js';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 130;
const ROW_GAP = 20;

const nodeTypes = { build: BuildNode };

interface CommitFlowDiagramProps {
  builds: BuildInfo[];
  onNodeClick: (build: BuildInfo) => void;
}

/**
 * Timeline layout: X axis = time, Y axis = swim lanes.
 * Connected nodes use dagre LR for the trigger tree;
 * disconnected nodes are placed in rows below, sorted by start time.
 */
function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Separate connected (have edges) from isolated nodes
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const isolatedNodes = nodes.filter((n) => !connectedIds.has(n.id));
  const connectedNodes = nodes.filter((n) => connectedIds.has(n.id));

  let laid: Node[] = [];

  if (connectedNodes.length > 0) {
    // Layout connected nodes with dagre LR (left-to-right timeline)
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 30 });
    for (const node of connectedNodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }
    dagre.layout(g);

    laid = connectedNodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      };
    });
  }

  // Place isolated nodes in rows below the tree, sorted by start time
  if (isolatedNodes.length > 0) {
    let maxY = 0;
    for (const n of laid) maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    const startY = laid.length > 0 ? maxY + 60 : 0;

    const sorted = [...isolatedNodes].sort((a, b) => {
      const aTime = (a.data as BuildNodeData).startTime ?? '';
      const bTime = (b.data as BuildNodeData).startTime ?? '';
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

    // Compute time-based X positions for isolated nodes
    const times = sorted
      .map((n) => {
        const t = (n.data as BuildNodeData).startTime;
        return t ? new Date(t).getTime() : null;
      })
      .filter((t): t is number => t !== null);

    if (times.length > 0) {
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const span = maxTime - minTime || 1;
      // Scale to a reasonable width (at least 2 node widths per node)
      const totalWidth = Math.max(sorted.length * (NODE_WIDTH + ROW_GAP), 1200);

      let row = 0;
      for (const node of sorted) {
        const t = (node.data as BuildNodeData).startTime;
        const ms = t ? new Date(t).getTime() : minTime;
        const x = ((ms - minTime) / span) * totalWidth;
        node.position = {
          x,
          y: startY + row * (NODE_HEIGHT + ROW_GAP),
        };
        row++;
      }
    } else {
      // No timestamps — stack vertically
      sorted.forEach((node, i) => {
        node.position = { x: 0, y: startY + i * (NODE_HEIGHT + ROW_GAP) };
      });
    }

    laid = [...laid, ...sorted];
  }

  return { nodes: laid, edges };
}

function buildGraph(builds: BuildInfo[]): { nodes: Node[]; edges: Edge[] } {
  const buildById = new Map<number, BuildInfo>();
  for (const b of builds) {
    buildById.set(b.id, b);
  }

  // Determine root nodes: builds not triggered by another build in the set
  const childIds = new Set<number>();
  for (const b of builds) {
    if (b.upstreamBuildId && buildById.has(b.upstreamBuildId)) {
      childIds.add(b.id);
    }
  }

  const nodes: Node[] = builds.map((b) => ({
    id: String(b.id),
    type: 'build',
    position: { x: 0, y: 0 },
    data: {
      buildId: b.id,
      pipelineName: b.definition.name,
      buildNumber: b.buildNumber,
      status: b.status,
      result: b.result,
      startTime: b.startTime,
      finishTime: b.finishTime,
      sourceBranch: b.sourceBranch,
      webUrl: b._links?.web?.href ?? null,
      isRoot: !childIds.has(b.id),
    } satisfies BuildNodeData,
  }));

  const edges: Edge[] = [];
  for (const b of builds) {
    if (b.upstreamBuildId && buildById.has(b.upstreamBuildId)) {
      edges.push({
        id: `e-${b.upstreamBuildId}-${b.id}`,
        source: String(b.upstreamBuildId),
        target: String(b.id),
        animated: b.status === 'inProgress',
        style: { stroke: '#89b4fa', strokeWidth: 2 },
      });
    }
  }

  return layoutGraph(nodes, edges);
}

export default function CommitFlowDiagram({
  builds,
  onNodeClick,
}: CommitFlowDiagramProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildGraph(builds),
    [builds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const buildById = useMemo(() => {
    const map = new Map<number, BuildInfo>();
    for (const b of builds) map.set(b.id, b);
    return map;
  }, [builds]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const build = buildById.get(Number(node.id));
      if (build) onNodeClick(build);
    },
    [buildById, onNodeClick],
  );

  return (
    <div className="commit-flow-diagram">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
