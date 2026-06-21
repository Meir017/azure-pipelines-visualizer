import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  state: string;
}

interface PipelineInfo {
  id: number;
  name: string;
  folder: string;
}

interface ProjectPipelines {
  project: ProjectInfo;
  pipelines: PipelineInfo[];
  folders: Record<string, PipelineInfo[]>;
}

const PROJECT_COLORS = [
  '#89b4fa20',
  '#cba6f720',
  '#a6e3a120',
  '#f9e2af20',
  '#f38ba820',
  '#fab38720',
  '#94e2d520',
  '#74c7ec20',
];

const PROJECT_BORDER_COLORS = [
  '#89b4fa',
  '#cba6f7',
  '#a6e3a1',
  '#f9e2af',
  '#f38ba8',
  '#fab387',
  '#94e2d5',
  '#74c7ec',
];

const PIPELINE_NODE_WIDTH = 200;
const PIPELINE_NODE_HEIGHT = 36;
const FOLDER_HEADER_HEIGHT = 28;
const FOLDER_PADDING = 10;
const FOLDER_GAP = 16;
const PROJECT_PADDING = 20;
const PROJECT_HEADER_HEIGHT = 44;
const PROJECT_GAP = 40;
const PIPELINES_PER_ROW = 3;
const PIPELINE_GAP_X = 12;
const PIPELINE_GAP_Y = 8;

function buildGraph(
  data: ProjectPipelines[],
  searchFilter: string,
  projectFilter: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let projectX = 40;

  const filtered = data.filter(
    (d) => !projectFilter || d.project.name === projectFilter,
  );

  for (let pi = 0; pi < filtered.length; pi++) {
    const { project, folders } = filtered[pi];
    const colorIdx = pi % PROJECT_COLORS.length;

    // Filter pipelines by search
    const filteredFolders: Record<string, PipelineInfo[]> = {};
    for (const [folder, pips] of Object.entries(folders)) {
      const matches = searchFilter
        ? pips.filter((p) =>
            p.name.toLowerCase().includes(searchFilter.toLowerCase()),
          )
        : pips;
      if (matches.length > 0) filteredFolders[folder] = matches;
    }

    const folderEntries = Object.entries(filteredFolders);
    if (folderEntries.length === 0) continue;

    // Calculate project dimensions
    let folderY = PROJECT_HEADER_HEIGHT;
    let maxFolderWidth = 0;

    for (const [folder, pips] of folderEntries) {
      const rows = Math.ceil(pips.length / PIPELINES_PER_ROW);
      const cols = Math.min(pips.length, PIPELINES_PER_ROW);
      const folderWidth =
        cols * PIPELINE_NODE_WIDTH +
        (cols - 1) * PIPELINE_GAP_X +
        FOLDER_PADDING * 2;
      const folderHeight =
        FOLDER_HEADER_HEIGHT +
        rows * PIPELINE_NODE_HEIGHT +
        (rows - 1) * PIPELINE_GAP_Y +
        FOLDER_PADDING * 2;

      if (folderWidth > maxFolderWidth) maxFolderWidth = folderWidth;

      // Folder group node
      const folderId = `folder-${project.id}-${folder}`;
      nodes.push({
        id: folderId,
        position: { x: PROJECT_PADDING, y: folderY },
        data: { label: folder === '\\' ? '(root)' : folder },
        type: 'group',
        style: {
          width: folderWidth,
          height: folderHeight,
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 6,
          fontSize: 11,
          color: '#a6adc8',
          padding: 0,
        },
        parentId: `project-${project.id}`,
      });

      // Pipeline nodes inside this folder
      for (let i = 0; i < pips.length; i++) {
        const pip = pips[i];
        const col = i % PIPELINES_PER_ROW;
        const row = Math.floor(i / PIPELINES_PER_ROW);
        nodes.push({
          id: `pipeline-${project.id}-${pip.id}`,
          position: {
            x: FOLDER_PADDING + col * (PIPELINE_NODE_WIDTH + PIPELINE_GAP_X),
            y:
              FOLDER_HEADER_HEIGHT +
              FOLDER_PADDING +
              row * (PIPELINE_NODE_HEIGHT + PIPELINE_GAP_Y),
          },
          data: { label: pip.name },
          parentId: folderId,
          style: {
            width: PIPELINE_NODE_WIDTH,
            height: PIPELINE_NODE_HEIGHT,
            background: '#282840',
            border: `1px solid ${PROJECT_BORDER_COLORS[colorIdx]}40`,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#cdd6f4',
            cursor: 'default',
          },
        });
      }

      folderY += folderHeight + FOLDER_GAP;
    }

    const projectWidth = maxFolderWidth + PROJECT_PADDING * 2;
    const projectHeight = folderY + PROJECT_PADDING;

    // Project group node
    nodes.push({
      id: `project-${project.id}`,
      position: { x: projectX, y: 40 },
      data: { label: project.name },
      type: 'group',
      style: {
        width: projectWidth,
        height: projectHeight,
        background: PROJECT_COLORS[colorIdx],
        border: `2px solid ${PROJECT_BORDER_COLORS[colorIdx]}`,
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        color: PROJECT_BORDER_COLORS[colorIdx],
        padding: 0,
      },
    });

    projectX += projectWidth + PROJECT_GAP;
  }

  return { nodes, edges };
}

interface OrgTopologyGraphProps {
  data: ProjectPipelines[];
  loading: boolean;
}

export default function OrgTopologyGraph({
  data,
  loading,
}: OrgTopologyGraphProps) {
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => buildGraph(data, search, projectFilter),
    [data, search, projectFilter],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const totalPipelines = data.reduce((s, d) => s + d.pipelines.length, 0);
  const projectNames = data.map((d) => d.project.name);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {data.length} project{data.length !== 1 ? 's' : ''} · {totalPipelines}{' '}
          pipeline{totalPipelines !== 1 ? 's' : ''}
          {loading && ' · loading…'}
        </span>
        <input
          type="text"
          placeholder="Search pipelines…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '4px 8px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            fontSize: 13,
            width: 200,
          }}
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          style={{
            padding: '4px 8px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            fontSize: 13,
          }}
        >
          <option value="">All projects</option>
          {projectNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export type { ProjectPipelines, ProjectInfo, PipelineInfo };
