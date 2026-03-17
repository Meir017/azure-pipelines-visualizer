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
  getEffectiveRepoAlias,
  buildAdoFileUrl,
  resolveExpressionPath,
  extractParameterDefaults,
  extractDeclaredParameterNames,
  pathHasExpressions,
  type TemplateReference,
  type ResourceRepository,
} from '@apv/core';

import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileByRepoName } from '../services/api-client.js';
import { getLayoutedElements } from './diagram-layout.js';
import FileNode, { type FileNodeData, type RepoInfo } from './FileNode.js';

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
    setSelectedNodeDetail,
  } = usePipelineStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Keep a ref to current edges so expansion callbacks always read the latest
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Track which nodes are being loaded to prevent double-clicks
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());

  // Track which nodes we've already attempted auto-expansion on
  const autoExpandAttempted = useRef<Set<string>>(new Set());

  // Auto-expand all nodes recursively when enabled
  const [autoExpandAll, setAutoExpandAll] = useState(false);

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
    const rootPath = selectedPipeline.definition?.path ?? '';
    const refs = detectTemplateReferences(raw ?? {}, { sourcePath: rootPath });
    const rootName =
      selectedPipeline.definition?.name ??
      rootPath.split('/').pop() ??
      'Pipeline';
    const rootBaseDir = dirOf(rootPath);

    // Extract root pipeline's parameter defaults for expression path resolution
    const rootParamDefaults = extractParameterDefaults(raw ?? {});

    // Build ADO URL for root node
    const rootRepoName = selectedPipeline.definition?.repository?.name ?? '';
    const rootBranch = selectedPipeline.definition?.repository?.defaultBranch?.replace(/^refs\/heads\//, '');
    const rootAdoUrl = org && project && rootRepoName
      ? buildAdoFileUrl({ org, project, repoName: rootRepoName, filePath: rootPath, branch: rootBranch })
      : undefined;

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
        adoUrl: rootAdoUrl,
      } satisfies FileNodeData,
    };

    const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
      'root',
      refs,
      rootBaseDir,
      org,
      project,
      defaultRepoName,
      rootResources,
      rootParamDefaults,
    );

    const allNodes = [rootNode, ...templateNodes];
    const allEdges = [...templateEdges];
    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(
      allNodes,
      allEdges,
    );

    setNodes(layouted);
    setEdges(layoutedEdges);
    autoExpandAttempted.current = new Set();
  }, [selectedPipeline, setNodes, setEdges]);

  // Auto-expand collapsed nodes in the background.
  // - Always: detect leaf templates (0 nested refs) and mark as expanded.
  // - When autoExpandAll: fully expand non-leaf nodes too (add child nodes/edges).
  useEffect(() => {
    const collapsedNodes = nodes.filter(
      (n) =>
        (n.data as unknown as FileNodeData).status === 'collapsed' &&
        !autoExpandAttempted.current.has(n.id) &&
        !loadingNodes.has(n.id),
    );
    if (collapsedNodes.length === 0) return;

    // Mark as attempted so we don't retry
    for (const n of collapsedNodes) {
      autoExpandAttempted.current.add(n.id);
    }

    // Fire off parallel fetches for all collapsed nodes
    for (const node of collapsedNodes) {
      const d = node.data as unknown as FileNodeData;
      // Skip nodes with unresolved dynamic paths — can't auto-expand
      if (d.dynamicPath && !d.expressionResolved) continue;

      (async () => {
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
          const parentRef = (d as unknown as Record<string, unknown>)._ref as
            | TemplateReference
            | undefined;
          const nestedRefs = detectTemplateReferences(parsed, {
            contextRepoAlias: getEffectiveRepoAlias(parentRef ?? {}),
            sourcePath: d.filePath,
          });

          const declaredParamNames = extractDeclaredParameterNames(parsed);

          if (nestedRefs.length === 0) {
            // Leaf node — mark as expanded with no children
            setNodes((nds) =>
              nds.map((n) =>
                n.id === node.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'expanded',
                        templateCount: 0,
                        totalParameterCount: declaredParamNames.length || undefined,
                        declaredParameterNames: declaredParamNames.length ? declaredParamNames : undefined,
                      },
                    }
                  : n,
              ),
            );
          } else if (autoExpandAll) {
            // Non-leaf with auto-expand enabled — fully expand
            const fileDefaults = extractParameterDefaults(parsed);
            const callerParams = parentRef?.parameters as Record<string, unknown> | undefined;
            const paramContext = { ...fileDefaults, ...callerParams };
            const expandedFileDir = dirOf(d.filePath);

            const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
              node.id,
              nestedRefs,
              expandedFileDir,
              org,
              project,
              defaultRepoName,
              rootResources,
              paramContext,
            );

            setNodes((currentNodes) => {
              const updated = currentNodes.map((n) =>
                n.id === node.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'expanded',
                        templateCount: nestedRefs.length,
                        totalParameterCount: declaredParamNames.length || undefined,
                        declaredParameterNames: declaredParamNames.length ? declaredParamNames : undefined,
                      },
                    }
                  : n,
              );
              const allNodes = [...updated, ...templateNodes];
              const allEdges = [...edgesRef.current, ...templateEdges];
              return getLayoutedElements(allNodes, allEdges).nodes;
            });

            setEdges((currentEdges) => [...currentEdges, ...templateEdges]);
          }
        } catch {
          // Silently ignore — user can still click to expand manually
        }
      })();
    }
  }, [nodes, org, project, defaultRepoName, rootResources, expandedTemplates, setExpandedTemplate, loadingNodes, setNodes, setEdges, autoExpandAll]);

  // Handle clicking a node:
  // - Root/expanded node → show details in panel
  // - Collapsed node → expand (fetch) then show details
  const onNodeClick: NodeMouseHandler = useCallback(
    async (_event, node) => {
      const d = node.data as unknown as FileNodeData;

      // Root node: show its YAML in detail panel
      if (d.status === 'root' && selectedPipeline?.yaml) {
        setSelectedNodeDetail({
          nodeId: node.id,
          label: d.label,
          filePath: d.filePath,
          yaml: selectedPipeline.yaml,
        });
        return;
      }

      // Already expanded: just show its cached content
      if (d.status === 'expanded') {
        const ref = (d as unknown as Record<string, unknown>)._ref as
          | TemplateReference
          | undefined;
        const cacheKey = `${getEffectiveRepoAlias(ref ?? {}) || ''}:${d.filePath}`;
        const cached = expandedTemplates.get(cacheKey);
        if (cached) {
          setSelectedNodeDetail({
            nodeId: node.id,
            label: d.label,
            filePath: d.filePath,
            yaml: cached,
            repoAlias: d.repoAlias,
          });
        }
        return;
      }

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
        const parentRef = (d as unknown as Record<string, unknown>)._ref as
          | TemplateReference
          | undefined;
        const nestedRefs = detectTemplateReferences(parsed, {
          contextRepoAlias: getEffectiveRepoAlias(parentRef ?? {}),
          sourcePath: d.filePath,
        });

        // Build parameter context for resolving expression paths in nested refs:
        // File's own parameter defaults, overridden by caller-passed parameter values
        const fileDefaults = extractParameterDefaults(parsed);
        const callerParams = parentRef?.parameters as Record<string, unknown> | undefined;
        const paramContext = { ...fileDefaults, ...callerParams };
        const declaredParamNames = extractDeclaredParameterNames(parsed);

        // Determine the baseDir for this expanded template
        const expandedFileDir = dirOf(d.filePath);

        // Update this node to expanded and add child nodes
        const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
          node.id,
          nestedRefs,
          expandedFileDir,
          org,
          project,
          defaultRepoName,
          rootResources,
          paramContext,
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
                    totalParameterCount: declaredParamNames.length || undefined,
                    declaredParameterNames: declaredParamNames.length ? declaredParamNames : undefined,
                  },
                }
              : n,
          );
          const allNodes = [...updated, ...templateNodes];
          const allEdges = [...edgesRef.current, ...templateEdges];
          return getLayoutedElements(allNodes, allEdges).nodes;
        });

        setEdges((currentEdges) => [...currentEdges, ...templateEdges]);

        // Show the expanded content in the detail panel
        setSelectedNodeDetail({
          nodeId: node.id,
          label: d.label,
          filePath: d.filePath,
          yaml: content,
          repoAlias: d.repoAlias,
        });
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
      selectedPipeline,
      rootResources,
      expandedTemplates,
      setExpandedTemplate,
      setSelectedNodeDetail,
      loadingNodes,
      setNodes,
      setEdges,
    ],
  );

  const handleAutoExpandToggle = useCallback(() => {
    setAutoExpandAll((prev) => {
      if (!prev) {
        // Turning ON: reset attempted set so existing collapsed nodes get expanded
        autoExpandAttempted.current = new Set();
      }
      return !prev;
    });
  }, []);

  if (selectedPipelineLoading) {
    return (
      <div className="pipeline-tree__empty">
        <div className="loading-indicator">
          <span className="loading-indicator__spinner">⏳</span>
          <span>Loading pipeline...</span>
        </div>
      </div>
    );
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
      <label className="auto-expand-toggle">
        <input
          type="checkbox"
          checked={autoExpandAll}
          onChange={handleAutoExpandToggle}
        />
        <span>Auto-expand all</span>
      </label>
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
  org: string,
  project: string,
  defaultRepoName: string,
  repositories: ResourceRepository[],
  /** Parameter context of the file containing these refs (merged caller + file defaults) */
  parameterContext?: Record<string, unknown>,
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

    // Attempt to resolve expression paths (e.g. ${{parameters.buildType}})
    let pathForNode = ref.normalizedPath;
    let dynamicPath = false;
    let originalPath: string | undefined;
    let expressionResolved = false;
    let unresolvedExpressions: string[] | undefined;

    if (pathHasExpressions(ref.normalizedPath)) {
      dynamicPath = true;
      originalPath = ref.normalizedPath;
      const resolution = resolveExpressionPath(
        ref.normalizedPath,
        parameterContext,
      );
      pathForNode = resolution.resolvedPath;
      expressionResolved = resolution.isFullyResolved;
      unresolvedExpressions = resolution.unresolved.length
        ? resolution.unresolved
        : undefined;
    }

    // For same-repo templates, resolve the full path relative to parent directory
    const effectiveRepoAlias = getEffectiveRepoAlias(ref);
    const resolvedPath = ref.repoAlias
      ? pathForNode
      : resolvePath(parentBaseDir, pathForNode);

    const label =
      pathForNode.length > 40
        ? `...${pathForNode.slice(-37)}`
        : pathForNode;

    // Resolve repo info and ADO URL
    const { repoInfo, adoUrl } = resolveNodeMetadata(
      ref,
      effectiveRepoAlias,
      resolvedPath,
      org,
      project,
      defaultRepoName,
      repositories,
    );

    // Extract parameter names
    const parameterNames = ref.parameters
      ? Object.keys(ref.parameters)
      : undefined;

    templateNodes.push({
      id: nodeId,
      type: 'fileNode',
      position: { x: 0, y: 0 },
      data: {
        label,
        filePath: resolvedPath,
        repoAlias: effectiveRepoAlias,
        templateCount: 0,
        status: 'collapsed',
        isRoot: false,
        baseDir: dirOf(resolvedPath),
        adoUrl,
        repoInfo,
        templateLocation: ref.location,
        conditional: ref.conditional || undefined,
        parameterNames,
        dynamicPath: dynamicPath || undefined,
        originalPath,
        expressionResolved: dynamicPath ? expressionResolved : undefined,
        unresolvedExpressions,
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

    const isExternalEdge = !!getEffectiveRepoAlias(ref);

    templateEdges.push({
      id: `${parentId}->${nodeId}`,
      source: parentId,
      target: nodeId,
      label: edgeLabel,
      labelStyle: { fill: 'var(--text)', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: 'var(--surface)', fillOpacity: 0.95 },
      labelBgPadding: [6, 3] as [number, number],
      style: isExternalEdge
        ? { stroke: 'var(--badge-resources)', strokeWidth: 2, strokeDasharray: '6 3' }
        : undefined,
      markerEnd: isExternalEdge
        ? { type: MarkerType.ArrowClosed, color: 'var(--badge-resources)' }
        : undefined,
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
  const effectiveRepoAlias = getEffectiveRepoAlias(ref);
  const cacheKey = `${effectiveRepoAlias || ''}:${fetchPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Resolve the repo alias
  let targetProject = project;
  let targetRepo = defaultRepoName;
  let targetRef: string | undefined;

  if (effectiveRepoAlias && repositories.length) {
    const source = resolveTemplateSource(effectiveRepoAlias, repositories);
    if (source) {
      targetProject = source.project || project;
      targetRepo = source.repoName;
      targetRef = source.ref;
    } else {
      targetRepo = effectiveRepoAlias;
    }
  } else if (effectiveRepoAlias) {
    targetRepo = effectiveRepoAlias;
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

/** Resolve ADO URL and repo info for a template reference node. */
function resolveNodeMetadata(
  ref: TemplateReference,
  effectiveRepoAlias: string | undefined,
  resolvedPath: string,
  org: string,
  project: string,
  defaultRepoName: string,
  repositories: ResourceRepository[],
): { repoInfo?: RepoInfo; adoUrl?: string } {
  let targetProject = project;
  let targetRepo = defaultRepoName;
  let targetRef: string | undefined;
  let repoInfo: RepoInfo | undefined;

  if (effectiveRepoAlias && repositories.length) {
    const source = resolveTemplateSource(effectiveRepoAlias, repositories);
    const repoResource = repositories.find((r) => r.repository === effectiveRepoAlias);
    if (source) {
      targetProject = source.project || project;
      targetRepo = source.repoName;
      targetRef = source.ref;
    } else {
      targetRepo = effectiveRepoAlias;
    }
    if (repoResource) {
      repoInfo = {
        alias: effectiveRepoAlias,
        fullName: repoResource.name,
        type: repoResource.type,
        ref: repoResource.ref,
        project: source?.project,
      };
    }
  } else if (effectiveRepoAlias) {
    targetRepo = effectiveRepoAlias;
  }

  // Build ADO URL
  const cleanRef = targetRef?.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
  const adoUrl = org && targetProject && targetRepo
    ? buildAdoFileUrl({
        org,
        project: targetProject,
        repoName: targetRepo,
        filePath: resolvedPath,
        branch: cleanRef,
      })
    : undefined;

  return { repoInfo, adoUrl };
}
