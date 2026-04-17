import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo } from 'react';
import type { ArtifactBuild } from './ArtifactLineagePage.js';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;

// ─── Custom node ──────────────────────────────────────────────

export interface ArtifactNodeData {
  pipelineName: string;
  buildNumber: string;
  status: string;
  result: string | null;
  artifactCount: number;
  artifactNames: string[];
  projectName: string;
  isRoot: boolean;
}

function statusIcon(status: string, result: string | null): string {
  if (status === 'inProgress') return '⏳';
  if (status === 'notStarted') return '⏸️';
  if (result === 'succeeded') return '✅';
  if (result === 'partiallySucceeded') return '⚠️';
  if (result === 'failed') return '❌';
  if (result === 'canceled') return '🚫';
  return '❓';
}

function resultClass(status: string, result: string | null): string {
  if (status === 'inProgress') return 'artifact-node--in-progress';
  if (result === 'succeeded') return 'artifact-node--succeeded';
  if (result === 'partiallySucceeded') return 'artifact-node--partial';
  if (result === 'failed') return 'artifact-node--failed';
  if (result === 'canceled') return 'artifact-node--canceled';
  return '';
}

function ArtifactNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ArtifactNodeData;
  return (
    <div className={`artifact-node ${resultClass(d.status, d.result)}`}>
      <div className="artifact-node__header">
        <span className="artifact-node__status">
          {statusIcon(d.status, d.result)}
        </span>
        <span className="artifact-node__name" title={d.pipelineName}>
          {d.pipelineName}
        </span>
      </div>
      {d.projectName && (
        <div className="artifact-node__project">📁 {d.projectName}</div>
      )}
      <div className="artifact-node__number">#{d.buildNumber}</div>
      <div className="artifact-node__artifacts">
        📦 {d.artifactCount} artifact{d.artifactCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

const ArtifactNode = memo(ArtifactNodeComponent);

// ─── Custom edge ──────────────────────────────────────────────

function ArtifactEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps) {
  const label = (data as { artifactNames?: string[] })?.artifactNames?.join(
    ', ',
  );
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <g>
      <path
        id={id}
        className="react-flow__edge-path"
        d={`M${sourceX},${sourceY} C${midX},${sourceY} ${midX},${targetY} ${targetX},${targetY}`}
        style={style}
        fill="none"
      />
      {label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            className="artifact-edge__label"
          >
            {label.length > 30 ? `${label.slice(0, 27)}…` : label}
          </textPath>
        </text>
      )}
    </g>
  );
}

const ArtifactEdge = memo(ArtifactEdgeComponent);

// ─── Graph builder ────────────────────────────────────────────

const nodeTypes = { artifactBuild: ArtifactNode };
const edgeTypes = { artifact: ArtifactEdge };

function buildGraph(artifactBuilds: ArtifactBuild[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const byId = new Map<number, ArtifactBuild>();
  for (const ab of artifactBuilds) byId.set(ab.build.id, ab);

  // Determine child IDs (builds triggered by another build in the set)
  const childIds = new Set<number>();
  for (const ab of artifactBuilds) {
    if (ab.build.upstreamBuildId && byId.has(ab.build.upstreamBuildId)) {
      childIds.add(ab.build.id);
    }
  }

  const nodes: Node[] = artifactBuilds.map((ab) => ({
    id: String(ab.build.id),
    type: 'artifactBuild',
    position: { x: 0, y: 0 },
    data: {
      pipelineName: ab.build.definition.name,
      buildNumber: ab.build.buildNumber,
      status: ab.build.status,
      result: ab.build.result,
      artifactCount: ab.artifacts.length,
      artifactNames: ab.artifacts.map((a) => a.name),
      projectName: ab.build.project.name,
      isRoot: !childIds.has(ab.build.id),
    } satisfies ArtifactNodeData,
  }));

  const edges: Edge[] = [];
  for (const ab of artifactBuilds) {
    if (ab.build.upstreamBuildId && byId.has(ab.build.upstreamBuildId)) {
      const upstream = byId.get(ab.build.upstreamBuildId)!;
      const artifactNames = upstream.artifacts.map((a) => a.name);
      edges.push({
        id: `e-${ab.build.upstreamBuildId}-${ab.build.id}`,
        source: String(ab.build.upstreamBuildId),
        target: String(ab.build.id),
        type: 'artifact',
        animated: ab.build.status === 'inProgress',
        style: { stroke: '#94e2d5', strokeWidth: 2 },
        data: { artifactNames },
      });
    }
  }

  return layoutGraph(nodes, edges);
}

function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 40 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  const laid = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: laid, edges };
}

// ─── Component ────────────────────────────────────────────────

interface ArtifactLineageGraphProps {
  artifactBuilds: ArtifactBuild[];
  onNodeClick: (ab: ArtifactBuild) => void;
}

export default function ArtifactLineageGraph({
  artifactBuilds,
  onNodeClick,
}: ArtifactLineageGraphProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildGraph(artifactBuilds),
    [artifactBuilds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const buildById = useMemo(() => {
    const map = new Map<number, ArtifactBuild>();
    for (const ab of artifactBuilds) map.set(ab.build.id, ab);
    return map;
  }, [artifactBuilds]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const ab = buildById.get(Number(node.id));
      if (ab) onNodeClick(ab);
    },
    [buildById, onNodeClick],
  );

  return (
    <div className="artifact-lineage-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
