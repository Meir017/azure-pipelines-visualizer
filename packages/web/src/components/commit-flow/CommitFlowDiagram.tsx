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
const GRID_GAP_X = 20;
const GRID_GAP_Y = 20;

const nodeTypes = { build: BuildNode };

interface CommitFlowDiagramProps {
  builds: BuildInfo[];
  onNodeClick: (build: BuildInfo) => void;
}

/** Layout connected components with dagre (tree), disconnected nodes in a grid. */
function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (edges.length === 0) {
    return { nodes: gridLayout(nodes), edges };
  }

  // Find connected components
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp = new Set<string>();
    const stack = [n.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      comp.add(id);
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) stack.push(nb);
      }
    }
    components.push(comp);
  }

  // Separate connected (have edges) from isolated nodes
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const isolatedNodes = nodes.filter((n) => !connectedIds.has(n.id));
  const connectedNodes = nodes.filter((n) => connectedIds.has(n.id));

  // Layout connected nodes with dagre
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
  for (const node of connectedNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const dagreNodes = connectedNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  // Find bounding box of dagre-laid-out nodes to place grid below
  let maxY = 0;
  for (const n of dagreNodes) {
    maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
  }

  // Grid layout for isolated nodes, placed below the tree
  const gridStartY = dagreNodes.length > 0 ? maxY + 60 : 0;
  const gridded = gridLayout(isolatedNodes, gridStartY);

  return { nodes: [...dagreNodes, ...gridded], edges };
}

/** Arrange nodes in a grid, sorted by start time. */
function gridLayout(nodes: Node[], startY = 0): Node[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

  // Sort by start time so the grid reads chronologically
  const sorted = [...nodes].sort((a, b) => {
    const aTime = (a.data as BuildNodeData).startTime ?? '';
    const bTime = (b.data as BuildNodeData).startTime ?? '';
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });

  return sorted.map((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...node,
      position: {
        x: col * (NODE_WIDTH + GRID_GAP_X),
        y: startY + row * (NODE_HEIGHT + GRID_GAP_Y),
      },
    };
  });
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
