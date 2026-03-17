import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  parseYaml,
  detectTemplateReferences,
  resolveTemplateSource,
  type TemplateReference,
  type ResourceRepository,
} from '@apv/core';

import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileByRepoName } from '../services/api-client.js';
import { getLayoutedElements } from './diagram-layout.js';
import FileNode, { type FileNodeData } from './FileNode.js';

const nodeTypes = { fileNode: FileNode };

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: 'var(--accent)', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
};

export default function PipelineDiagram() {
  const {
    org,
    project,
    selectedPipeline,
    selectedPipelineLoading,
    selectedPipelineError,
    expandedTemplates,
    setExpandedTemplate,
  } = usePipelineStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Keep a ref to current edges so expansion callbacks always read the latest
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Track which nodes are being loaded to prevent double-clicks
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());

  // The default repo name for same-repo template lookups
  const defaultRepoName = selectedPipeline?.definition?.repository?.name ?? '';

  // Extract resources from the root pipeline YAML for alias resolution
  const rootResources: ResourceRepository[] = useMemo(() => {
    if (!selectedPipeline?.yaml) return [];
    try {
      const raw = parseYaml(selectedPipeline.yaml) as Record<string, unknown>;
      const resources = raw?.resources as Record<string, unknown> | undefined;
      return (resources?.repositories as ResourceRepository[]) ?? [];
    } catch {
      return [];
    }
  }, [selectedPipeline?.yaml]);

  // Build initial graph when a pipeline is selected
  useEffect(() => {
    if (!selectedPipeline?.yaml) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const raw = parseYaml(selectedPipeline.yaml) as Record<string, unknown>;
    const refs = detectTemplateReferences(raw ?? {});
    const rootPath = selectedPipeline.definition?.path ?? '';
    const rootName =
      selectedPipeline.definition?.name ??
      rootPath.split('/').pop() ??
      'Pipeline';
    const rootBaseDir = dirOf(rootPath);

    const rootNode: Node = {
      id: 'root',
      type: 'fileNode',
      position: { x: 0, y: 0 },
      data: {
        label: rootName,
        filePath: rootPath,
        templateCount: refs.length,
        status: 'root',
        isRoot: true,
        baseDir: rootBaseDir,
      } satisfies FileNodeData,
    };

    const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
      'root',
      refs,
      rootBaseDir,
    );

    const allNodes = [rootNode, ...templateNodes];
    const allEdges = [...templateEdges];
    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(
      allNodes,
      allEdges,
    );

    setNodes(layouted);
    setEdges(layoutedEdges);
  }, [selectedPipeline, setNodes, setEdges]);

  // Handle clicking a collapsed template node to expand it
  const onNodeClick: NodeMouseHandler = useCallback(
    async (_event, node) => {
      const d = node.data as unknown as FileNodeData;
      if (d.status !== 'collapsed') return;
      if (loadingNodes.has(node.id)) return;

      // Mark as loading
      setLoadingNodes((prev) => new Set(prev).add(node.id));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, status: 'loading' } }
            : n,
        ),
      );

      try {
        const content = await fetchTemplateContent(
          org,
          project,
          defaultRepoName,
          d,
          rootResources,
          expandedTemplates,
          setExpandedTemplate,
        );

        const parsed = (parseYaml(content) ?? {}) as Record<string, unknown>;
        const nestedRefs = detectTemplateReferences(parsed);

        // Determine the baseDir for this expanded template
        const expandedFileDir = dirOf(d.filePath);

        // Update this node to expanded and add child nodes
        const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
          node.id,
          nestedRefs,
          expandedFileDir,
        );

        // Atomic update: add new nodes with layout, then add new edges
        setNodes((currentNodes) => {
          const updated = currentNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'expanded',
                    templateCount: nestedRefs.length,
                  },
                }
              : n,
          );
          const allNodes = [...updated, ...templateNodes];
          const allEdges = [...edgesRef.current, ...templateEdges];
          return getLayoutedElements(allNodes, allEdges).nodes;
        });

        setEdges((currentEdges) => [...currentEdges, ...templateEdges]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: { ...n.data, status: 'error', errorMessage: msg },
                }
              : n,
          ),
        );
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      }
    },
    [
      org,
      project,
      defaultRepoName,
      rootResources,
      expandedTemplates,
      setExpandedTemplate,
      loadingNodes,
      setNodes,
      setEdges,
    ],
  );

  if (selectedPipelineLoading) {
    return <div className="pipeline-tree__empty">⏳ Loading pipeline...</div>;
  }

  if (selectedPipelineError) {
    return <div className="error">{selectedPipelineError}</div>;
  }

  if (!selectedPipeline) {
    return (
      <div className="pipeline-tree__empty">Select a pipeline to visualize</div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build node + edge arrays from a set of template references attached to a parent. */
function buildTemplateNodesAndEdges(
  parentId: string,
  refs: TemplateReference[],
  parentBaseDir: string,
): { templateNodes: Node[]; templateEdges: Edge[] } {
  // De-duplicate by rawPath to avoid duplicate nodes for the same template
  const seen = new Set<string>();
  const templateNodes: Node[] = [];
  const templateEdges: Edge[] = [];

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const nodeId = `${parentId}__${ref.normalizedPath}__${i}`;

    if (seen.has(ref.rawPath)) continue;
    seen.add(ref.rawPath);

    // For same-repo templates, resolve the full path relative to parent directory
    const resolvedPath = ref.repoAlias
      ? ref.normalizedPath // cross-repo: path is relative to target repo root
      : resolvePath(parentBaseDir, ref.normalizedPath);

    const label =
      ref.normalizedPath.length > 40
        ? `...${ref.normalizedPath.slice(-37)}`
        : ref.normalizedPath;

    templateNodes.push({
      id: nodeId,
      type: 'fileNode',
      position: { x: 0, y: 0 },
      data: {
        label,
        filePath: resolvedPath,
        repoAlias: ref.repoAlias,
        templateCount: 0,
        status: 'collapsed',
        isRoot: false,
        baseDir: dirOf(resolvedPath),
        // Stash the full ref for expansion
        _ref: ref,
      },
    });

    const edgeLabel =
      ref.location === 'extends'
        ? 'extends'
        : ref.location === 'extends-parameters'
          ? 'extends param'
          : ref.location;

    templateEdges.push({
      id: `${parentId}->${nodeId}`,
      source: parentId,
      target: nodeId,
      label: edgeLabel,
      labelStyle: { fill: 'var(--text-muted)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--surface)', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
    });
  }

  return { templateNodes, templateEdges };
}

/** Fetch template content, using cache or API. */
async function fetchTemplateContent(
  org: string,
  project: string,
  defaultRepoName: string,
  nodeData: FileNodeData,
  repositories: ResourceRepository[],
  cache: Map<string, string>,
  setCache: (key: string, content: string) => void,
): Promise<string> {
  // Retrieve the stashed ref from node data
  const ref = (nodeData as unknown as Record<string, unknown>)._ref as
    | TemplateReference
    | undefined;
  if (!ref) throw new Error('No template reference on this node');

  // Use the resolved filePath from node data (already resolved relative to parent dir)
  const fetchPath = nodeData.filePath;
  const cacheKey = `${ref.repoAlias || ''}:${fetchPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Resolve the repo alias
  let targetProject = project;
  let targetRepo = defaultRepoName;
  let targetRef: string | undefined;

  if (ref.repoAlias && repositories.length) {
    const source = resolveTemplateSource(ref.repoAlias, repositories);
    if (source) {
      targetProject = source.project || project;
      targetRepo = source.repoName;
      targetRef = source.ref;
    } else {
      targetRepo = ref.repoAlias;
    }
  } else if (ref.repoAlias) {
    targetRepo = ref.repoAlias;
  }

  const resp = await fetchFileByRepoName(
    org,
    targetProject,
    targetRepo,
    fetchPath,
    targetRef,
  );

  setCache(cacheKey, resp.content);
  return resp.content;
}

/** Extract directory from a file path. e.g. "/.pipelines/a.yml" → "/.pipelines" */
function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
}

/**
 * Resolve a relative template path against a base directory.
 * If the path starts with "/" it's absolute (repo root). Otherwise, join with baseDir.
 */
function resolvePath(baseDir: string, templatePath: string): string {
  if (templatePath.startsWith('/')) return templatePath;
  if (!baseDir) return templatePath;
  return `${baseDir}/${templatePath}`;
}
