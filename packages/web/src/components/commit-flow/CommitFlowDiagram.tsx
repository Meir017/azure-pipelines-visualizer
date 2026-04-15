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

const nodeTypes = { build: BuildNode };

interface CommitFlowDiagramProps {
  builds: BuildInfo[];
  onNodeClick: (build: BuildInfo) => void;
}

function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
      };
    }),
    edges,
  };
}

function buildGraph(builds: BuildInfo[]): { nodes: Node[]; edges: Edge[] } {
  const buildById = new Map<number, BuildInfo>();
  for (const b of builds) {
    buildById.set(b.id, b);
  }

  // Determine root nodes: builds not triggered by another build in the set
  const childIds = new Set<number>();
  for (const b of builds) {
    if (b.triggeredByBuild && buildById.has(b.triggeredByBuild.id)) {
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
    if (b.triggeredByBuild && buildById.has(b.triggeredByBuild.id)) {
      edges.push({
        id: `e-${b.triggeredByBuild.id}-${b.id}`,
        source: String(b.triggeredByBuild.id),
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
