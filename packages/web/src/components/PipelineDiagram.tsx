import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';

import {
  buildAdoFileUrl,
  detectTemplateReferences,
  evaluateExpression,
  extractDeclaredParameterNames,
  extractParameterDefaults,
  extractVariableValues,
  getEffectiveRepoAlias,
  parseTemplatePath,
  parseYaml,
  pathHasExpressions,
  type ResourceRepository,
  resolveAllExpressions,
  resolveExpressionPath,
  resolveTemplateRefPaths,
  resolveTemplateSource,
  type TemplateReference,
} from '@meirblachman/azure-pipelines-visualizer-core';
import type { FetchFileByRepoNameFn }from '../services/file-fetch-context.js';
import { useFileFetch } from '../services/file-fetch-context.js';
import { usePipelineStore } from '../store/pipeline-store.js';
import { getLayoutedElements } from './diagram-layout.js';
import FileNode, { type FileNodeData, type RepoInfo } from './FileNode.js';
import TemplateEdge, { type TemplateEdgeData } from './TemplateEdge.js';

const nodeTypes = { fileNode: FileNode };
const edgeTypes = { templateEdge: TemplateEdge };

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

  const fetchFileByRepoName = useFileFetch();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const autoFitRequestRef = useRef<number | null>(null);
  const lastAutoFitSignature = useRef('');

  // Keep a ref to current edges so expansion callbacks always read the latest
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

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

  // Extract variables from the root pipeline YAML for expression resolution
  const rootVariables: Record<string, string> = useMemo(() => {
    if (!selectedPipeline?.yaml) return {};
    try {
      const raw = parseYaml(selectedPipeline.yaml) as Record<string, unknown>;
      return extractVariableValues(raw ?? {});
    } catch {
      return {};
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
    const rootBranch =
      selectedPipeline.definition?.repository?.defaultBranch?.replace(
        /^refs\/heads\//,
        '',
      );
    const rootAdoUrl =
      org && project && rootRepoName
        ? buildAdoFileUrl({
            org,
            project,
            repoName: rootRepoName,
            filePath: rootPath,
            branch: rootBranch,
          })
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
      org,
      project,
      defaultRepoName,
      rootResources,
      rootParamDefaults,
      undefined, // existingNodeIds
      rootVariables,
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
  // Uses a sequential queue to avoid race conditions from concurrent setNodes calls.
  const autoExpandRunning = useRef(false);

  useEffect(() => {
    if (!autoExpandAll || !reactFlowRef.current || nodes.length === 0) return;

    const signature = `${nodes.length}:${edges.length}`;
    if (signature === lastAutoFitSignature.current) return;
    lastAutoFitSignature.current = signature;

    if (autoFitRequestRef.current != null) {
      cancelAnimationFrame(autoFitRequestRef.current);
    }

    autoFitRequestRef.current = requestAnimationFrame(() => {
      reactFlowRef.current?.fitView({
        padding: 0.2,
        duration: 300,
      });
      autoFitRequestRef.current = null;
    });

    return () => {
      if (autoFitRequestRef.current != null) {
        cancelAnimationFrame(autoFitRequestRef.current);
        autoFitRequestRef.current = null;
      }
    };
  }, [autoExpandAll, nodes.length, edges.length]);

  useEffect(() => {
    if (autoExpandRunning.current) return;

    const collapsedNodes = nodes.filter((n) => {
      const d = n.data as unknown as FileNodeData;
      if (d.status !== 'collapsed') return false;
      if (autoExpandAttempted.current.has(n.id)) return false;
      if (loadingNodes.has(n.id)) return false;

      // Skip conditional template refs whose condition evaluated to false.
      // When the condition couldn't be fully resolved (unknown params/vars),
      // _conditionResult is 'unknown' — still attempt expansion when autoExpandAll
      // is enabled (user explicitly requested full expansion), but skip otherwise.
      const condResult = (d as unknown as Record<string, unknown>)
        ._conditionResult;
      if (condResult === false) return false;
      if (condResult === 'unknown' && !autoExpandAll) return false;

      return true;
    });
    if (collapsedNodes.length === 0) return;

    // Prioritize variable template nodes — their variables may be needed by siblings
    collapsedNodes.sort((a, b) => {
      const aIsVar =
        (a.data as unknown as FileNodeData).templateLocation === 'variables'
          ? 0
          : 1;
      const bIsVar =
        (b.data as unknown as FileNodeData).templateLocation === 'variables'
          ? 0
          : 1;
      return aIsVar - bIsVar;
    });

    // Mark as attempted so we don't retry — but defer unresolved dynamic-path
    // nodes so they can be retried after variable templates provide new values
    for (const n of collapsedNodes) {
      const nd = n.data as unknown as FileNodeData;
      if (nd.dynamicPath && !nd.expressionResolved) continue;
      autoExpandAttempted.current.add(n.id);
    }

    autoExpandRunning.current = true;

    (async () => {
      // Process nodes sequentially to avoid race conditions
      for (const node of collapsedNodes) {
        const d = node.data as unknown as FileNodeData;
        if (d.dynamicPath && !d.expressionResolved) continue;

        try {
          const { content, actualPath } = await fetchTemplateContent(
            org,
            project,
            defaultRepoName,
            d,
            rootResources,
            expandedTemplates,
            setExpandedTemplate,
            fetchFileByRepoName,
          );

          const parsed = (parseYaml(content) ?? {}) as Record<string, unknown>;
          const parentRef = (d as unknown as Record<string, unknown>)._ref as
            | TemplateReference
            | undefined;
          const nestedRefs = detectTemplateReferences(parsed, {
            contextRepoAlias: getEffectiveRepoAlias(parentRef ?? {}),
            sourcePath: actualPath,
          });

          const declaredParamNames = extractDeclaredParameterNames(parsed);

          if (nestedRefs.length === 0) {
            // Leaf node — mark as expanded with no children
            // If this is a variable template, propagate its variables to sibling nodes
            const isVarTemplate = d.templateLocation === 'variables';
            const varTemplateVars = isVarTemplate
              ? extractVariableValues(parsed)
              : undefined;
            const shouldPropagate =
              varTemplateVars && Object.keys(varTemplateVars).length > 0;

            // Pre-compute which sibling nodes will be updated so we can also update edges
            const updatedNodeIds = new Set<string>();
            const crossRepoNodeIds = new Set<string>();
            const resolvedNodePaths = new Map<string, string>();
            if (shouldPropagate) {
              for (const n of nodes) {
                const nd = n.data as unknown as FileNodeData;
                if (nd.dynamicPath && !nd.expressionResolved) {
                  const updated = updateNodeWithNewVariables(
                    n,
                    varTemplateVars,
                    org,
                    project,
                    defaultRepoName,
                    rootResources,
                  );
                  if (updated !== n) {
                    updatedNodeIds.add(n.id);
                    const updatedData = updated.data as unknown as FileNodeData;
                    if (updatedData.repoAlias) crossRepoNodeIds.add(n.id);
                    resolvedNodePaths.set(n.id, updatedData.filePath);
                  }
                }
              }
            }

            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === node.id) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'expanded',
                      templateCount: 0,
                      totalParameterCount:
                        declaredParamNames.length || undefined,
                      declaredParameterNames: declaredParamNames.length
                        ? declaredParamNames
                        : undefined,
                    },
                  };
                }
                if (shouldPropagate && updatedNodeIds.has(n.id)) {
                  return updateNodeWithNewVariables(
                    n,
                    varTemplateVars,
                    org,
                    project,
                    defaultRepoName,
                    rootResources,
                  );
                }
                return n;
              }),
            );

            // Update edges targeting nodes whose paths were just resolved
            if (updatedNodeIds.size > 0) {
              setEdges((eds) =>
                eds.map((e) => {
                  if (!updatedNodeIds.has(e.target)) return e;
                  const ed = e.data as TemplateEdgeData | undefined;
                  if (!ed?.dynamicPath) return e;
                  const isCrossRepo = crossRepoNodeIds.has(e.target);
                  return {
                    ...e,
                    data: {
                      ...ed,
                      expressionResolved: true,
                      isExternal: isCrossRepo || ed.isExternal || undefined,
                      resolvedPath:
                        resolvedNodePaths.get(e.target) ?? ed.resolvedPath,
                      unresolvedExpressions: undefined,
                    },
                    style: isCrossRepo
                      ? {
                          stroke: 'var(--badge-resources)',
                          strokeWidth: 2,
                          strokeDasharray: '6 3',
                        }
                      : e.style,
                    markerEnd: isCrossRepo
                      ? {
                          type: MarkerType.ArrowClosed,
                          color: 'var(--badge-resources)',
                        }
                      : e.markerEnd,
                  };
                }),
              );
            }
          } else if (autoExpandAll) {
            // Non-leaf with auto-expand enabled — fully expand
            const fileDefaults = extractParameterDefaults(parsed);
            const parentParamContext = (d as unknown as Record<string, unknown>)
              ._parentParamContext as Record<string, unknown> | undefined;
            const parentVariables = (d as unknown as Record<string, unknown>)
              ._accumulatedVariables as Record<string, string> | undefined;
            const rawCallerParams = parentRef?.parameters as
              | Record<string, unknown>
              | undefined;
            const callerParams = resolveCallerParams(
              rawCallerParams,
              parentParamContext,
              parentVariables,
            );
            const paramContext = { ...fileDefaults, ...callerParams };

            // Merge accumulated variables: parent's variables + this template's own variables
            const templateVariables = extractVariableValues(parsed);
            const mergedVariables = {
              ...(parentVariables ?? rootVariables),
              ...templateVariables,
            };

            // Merge accumulated resources: parent's resources + this template's own resources
            const parentResources = (d as unknown as Record<string, unknown>)
              ._accumulatedResources as ResourceRepository[] | undefined;
            const templateResources = extractResourceRepositories(parsed);
            const mergedResources = deduplicateResources([
              ...(parentResources ?? rootResources),
              ...templateResources,
            ]);

            // Wait for a microtask to let React process any pending state updates
            await new Promise((r) => setTimeout(r, 0));

            // Compute existing node IDs from current nodes for dedup
            const existingIds = new Set(nodes.map((n) => n.id));
            const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
              node.id,
              nestedRefs,
              org,
              project,
              defaultRepoName,
              mergedResources,
              paramContext,
              existingIds,
              mergedVariables,
            );

            setNodes((currentNodes) => {
              // Re-check against current state (may have changed)
              const currentIds = new Set(currentNodes.map((n) => n.id));
              const newNodes = templateNodes.filter(
                (n) => !currentIds.has(n.id),
              );

              const updated = currentNodes.map((n) =>
                n.id === node.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'expanded',
                        templateCount: nestedRefs.length,
                        totalParameterCount:
                          declaredParamNames.length || undefined,
                        declaredParameterNames: declaredParamNames.length
                          ? declaredParamNames
                          : undefined,
                      },
                    }
                  : n,
              );
              const allNodes = [...updated, ...newNodes];

              // Propagate declared param info to edges targeting this node
              const updatedEdges = declaredParamNames.length
                ? updateEdgesWithDeclaredParams(
                    edgesRef.current,
                    node.id,
                    declaredParamNames,
                  )
                : edgesRef.current;
              const allEdges = [...updatedEdges, ...templateEdges];
              return getLayoutedElements(allNodes, allEdges).nodes;
            });

            setEdges((currentEdges) => {
              const updated = declaredParamNames.length
                ? updateEdgesWithDeclaredParams(
                    currentEdges,
                    node.id,
                    declaredParamNames,
                  )
                : currentEdges;
              return [...updated, ...templateEdges];
            });

            // Let React flush the state update before processing next node
            await new Promise((r) => setTimeout(r, 50));
          }
        } catch {
          // Silently ignore — user can still click to expand manually
        }
      }

      autoExpandRunning.current = false;
      // When auto-expanding all, trigger re-render so the effect re-runs to process
      // newly added collapsed child nodes. Only needed when we actually expanded non-leaf nodes.
      if (autoExpandAll) {
        setNodes((n) => [...n]);
      }
    })();
  }, [
    nodes,
    org,
    project,
    defaultRepoName,
    rootResources,
    expandedTemplates,
    setExpandedTemplate,
    loadingNodes,
    setNodes,
    setEdges,
    autoExpandAll,
    fetchFileByRepoName,
  ]);

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

      // Already expanded: show its cached content in the detail panel
      if (d.status === 'expanded') {
        const ref = (d as unknown as Record<string, unknown>)._ref as
          | TemplateReference
          | undefined;
        const alias = getEffectiveRepoAlias(ref ?? {}) || '';
        const cacheKey = `${alias}:${d.filePath}`;
        const fallbackPath = (d as unknown as Record<string, unknown>)
          ._fallbackPath as string | undefined;
        const fallbackCacheKey = fallbackPath
          ? `${alias}:${fallbackPath}`
          : undefined;
        const cached =
          expandedTemplates.get(cacheKey) ??
          (fallbackCacheKey
            ? expandedTemplates.get(fallbackCacheKey)
            : undefined);

        if (cached) {
          setSelectedNodeDetail({
            nodeId: node.id,
            label: d.label,
            filePath: d.filePath,
            yaml: cached,
            repoAlias: d.repoAlias,
          });
          return;
        }

        // Cache miss — fetch content directly
        try {
          const { content } = await fetchTemplateContent(
            org,
            project,
            defaultRepoName,
            d,
            rootResources,
            expandedTemplates,
            setExpandedTemplate,
            fetchFileByRepoName,
          );
          setSelectedNodeDetail({
            nodeId: node.id,
            label: d.label,
            filePath: d.filePath,
            yaml: content,
            repoAlias: d.repoAlias,
          });
        } catch {
          // Silently fail — node is already expanded, just can't show detail
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
        const { content, actualPath } = await fetchTemplateContent(
          org,
          project,
          defaultRepoName,
          d,
          rootResources,
          expandedTemplates,
          setExpandedTemplate,
          fetchFileByRepoName,
        );

        const parsed = (parseYaml(content) ?? {}) as Record<string, unknown>;
        const parentRef = (d as unknown as Record<string, unknown>)._ref as
          | TemplateReference
          | undefined;
        const nestedRefs = detectTemplateReferences(parsed, {
          contextRepoAlias: getEffectiveRepoAlias(parentRef ?? {}),
          sourcePath: actualPath,
        });

        // Build parameter context for resolving expression paths in nested refs:
        // File's own parameter defaults, overridden by caller-passed parameter values
        const fileDefaults = extractParameterDefaults(parsed);
        const parentParamContext = (d as unknown as Record<string, unknown>)
          ._parentParamContext as Record<string, unknown> | undefined;
        const parentVariables = (d as unknown as Record<string, unknown>)
          ._accumulatedVariables as Record<string, string> | undefined;
        const rawCallerParams = parentRef?.parameters as
          | Record<string, unknown>
          | undefined;
        const callerParams = resolveCallerParams(
          rawCallerParams,
          parentParamContext,
          parentVariables,
        );
        const paramContext = { ...fileDefaults, ...callerParams };
        const declaredParamNames = extractDeclaredParameterNames(parsed);

        // Determine the baseDir for this expanded template (use actual resolved path)
        const expandedFileDir = dirOf(actualPath);

        // Merge accumulated variables: parent's variables + this template's own variables
        const templateVariables = extractVariableValues(parsed);
        const mergedVariables = {
          ...(parentVariables ?? rootVariables),
          ...templateVariables,
        };

        // Merge accumulated resources: parent's resources + this template's own resources
        const parentResources = (d as unknown as Record<string, unknown>)
          ._accumulatedResources as ResourceRepository[] | undefined;
        const templateResources = extractResourceRepositories(parsed);
        const mergedResources = deduplicateResources([
          ...(parentResources ?? rootResources),
          ...templateResources,
        ]);

        // Update this node to expanded and add child nodes
        const existingIds = new Set(nodes.map((n) => n.id));
        const { templateNodes, templateEdges } = buildTemplateNodesAndEdges(
          node.id,
          nestedRefs,
          org,
          project,
          defaultRepoName,
          mergedResources,
          paramContext,
          existingIds,
          mergedVariables,
        );

        // Atomic update: add new nodes with layout, then add new edges
        const manualUpdatedNodeIds = new Set<string>();
        const manualCrossRepoNodeIds = new Set<string>();
        const manualResolvedPaths = new Map<string, string>();
        const shouldPropagateVars =
          d.templateLocation === 'variables' &&
          Object.keys(templateVariables).length > 0;

        // Pre-compute which nodes will be updated
        if (shouldPropagateVars) {
          for (const n of nodes) {
            const nd = n.data as unknown as FileNodeData;
            if (nd.dynamicPath && !nd.expressionResolved) {
              const updated = updateNodeWithNewVariables(
                n,
                templateVariables,
                org,
                project,
                defaultRepoName,
                rootResources,
              );
              if (updated !== n) {
                manualUpdatedNodeIds.add(n.id);
                const updatedData = updated.data as unknown as FileNodeData;
                if (updatedData.repoAlias) manualCrossRepoNodeIds.add(n.id);
                manualResolvedPaths.set(n.id, updatedData.filePath);
              }
            }
          }
        }

        setNodes((currentNodes) => {
          const currentIds = new Set(currentNodes.map((n) => n.id));
          const newNodes = templateNodes.filter((n) => !currentIds.has(n.id));

          const updated = currentNodes.map((n) => {
            if (n.id === node.id) {
              return {
                ...n,
                data: {
                  ...n.data,
                  status: 'expanded',
                  templateCount: nestedRefs.length,
                  totalParameterCount: declaredParamNames.length || undefined,
                  declaredParameterNames: declaredParamNames.length
                    ? declaredParamNames
                    : undefined,
                },
              };
            }
            if (shouldPropagateVars && manualUpdatedNodeIds.has(n.id)) {
              return updateNodeWithNewVariables(
                n,
                templateVariables,
                org,
                project,
                defaultRepoName,
                rootResources,
              );
            }
            return n;
          });
          const allNodes = [...updated, ...newNodes];

          // Propagate declared param info to edges targeting this node
          const updatedEdges = declaredParamNames.length
            ? updateEdgesWithDeclaredParams(
                edgesRef.current,
                node.id,
                declaredParamNames,
              )
            : edgesRef.current;
          const allEdges = [...updatedEdges, ...templateEdges];
          return getLayoutedElements(allNodes, allEdges).nodes;
        });

        setEdges((currentEdges) => {
          let updated = declaredParamNames.length
            ? updateEdgesWithDeclaredParams(
                currentEdges,
                node.id,
                declaredParamNames,
              )
            : currentEdges;

          // Update edges targeting nodes whose variable expressions were just resolved
          if (manualUpdatedNodeIds.size > 0) {
            updated = updated.map((e) => {
              if (!manualUpdatedNodeIds.has(e.target)) return e;
              const ed = e.data as TemplateEdgeData | undefined;
              if (!ed?.dynamicPath) return e;
              const isCrossRepo = manualCrossRepoNodeIds.has(e.target);
              return {
                ...e,
                data: {
                  ...ed,
                  expressionResolved: true,
                  isExternal: isCrossRepo || ed.isExternal || undefined,
                  resolvedPath:
                    manualResolvedPaths.get(e.target) ?? ed.resolvedPath,
                  unresolvedExpressions: undefined,
                },
                style: isCrossRepo
                  ? {
                      stroke: 'var(--badge-resources)',
                      strokeWidth: 2,
                      strokeDasharray: '6 3',
                    }
                  : e.style,
                markerEnd: isCrossRepo
                  ? {
                      type: MarkerType.ArrowClosed,
                      color: 'var(--badge-resources)',
                    }
                  : e.markerEnd,
              };
            });
          }

          return [...updated, ...templateEdges];
        });

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
      fetchFileByRepoName,
    ],
  );

  const handleAutoExpandToggle = useCallback(() => {
    setAutoExpandAll((prev) => {
      if (!prev) {
        // Turning ON: reset attempted set so existing collapsed nodes get expanded
        autoExpandAttempted.current = new Set();
        lastAutoFitSignature.current = '';
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
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--border)"
          gap={20}
        />
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

/**
 * When a template node is expanded and we discover its declared parameter names,
 * propagate that info to all edges pointing at the node so the edge tooltip
 * can show "passed vs. not passed" breakdown.
 */
function updateEdgesWithDeclaredParams(
  edges: Edge[],
  targetNodeId: string,
  declaredParamNames: string[],
): Edge[] {
  return edges.map((e) => {
    if (e.target !== targetNodeId) return e;
    const d =
      (e.data as TemplateEdgeData | undefined) ?? ({} as TemplateEdgeData);
    return {
      ...e,
      data: {
        ...d,
        totalParameterCount: declaredParamNames.length,
        declaredParameterNames: declaredParamNames,
      },
    };
  });
}

/**
 * Resolve `${{ parameters.X }}` and `${{ variables.X }}` expression strings in a callerParams object.
 * When a template passes `featureFlags: ${{ parameters.featureFlags }}`, the YAML
 * parser stores the literal string. This function evaluates such expressions
 * using the parent's parameter context and variables to get the actual values.
 */
function resolveCallerParams(
  callerParams: Record<string, unknown> | undefined,
  parentParamContext: Record<string, unknown> | undefined,
  variableContext?: Record<string, string>,
): Record<string, unknown> | undefined {
  if (!callerParams || (!parentParamContext && !variableContext))
    return callerParams;

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(callerParams)) {
    if (typeof value === 'string' && pathHasExpressions(value)) {
      const { result, isFullyResolved } = resolveAllExpressions(value, {
        parameters: parentParamContext,
        variables: variableContext,
      });
      resolved[key] = isFullyResolved ? tryParseResolved(result) : value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively resolve nested objects
      resolved[key] =
        resolveCallerParams(
          value as Record<string, unknown>,
          parentParamContext,
          variableContext,
        ) ?? value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * After expression resolution, attempt to parse the result as JSON/boolean/number
 * so we get the actual typed value instead of a string representation.
 */
function tryParseResolved(value: string): unknown {
  if (value === 'True' || value === 'true') return true;
  if (value === 'False' || value === 'false') return false;
  if (value === 'null') return null;
  // Don't try JSON.parse for plain strings — only if it looks like JSON
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      /* fall through */
    }
  }
  return value;
}

/**
 * Extract `resources.repositories` from a parsed YAML template.
 * These define repo aliases used by template references within the file.
 */
function extractResourceRepositories(
  parsed: Record<string, unknown>,
): ResourceRepository[] {
  const resources = parsed.resources as Record<string, unknown> | undefined;
  if (!resources) return [];
  const repos = resources.repositories;
  if (!Array.isArray(repos)) return [];
  return repos.filter(
    (r): r is ResourceRepository =>
      r != null &&
      typeof r === 'object' &&
      'repository' in r &&
      'name' in r &&
      typeof (r as Record<string, unknown>).repository === 'string' &&
      typeof (r as Record<string, unknown>).name === 'string',
  );
}

/** De-duplicate resources by alias name, later entries take priority. */
function deduplicateResources(
  resources: ResourceRepository[],
): ResourceRepository[] {
  const map = new Map<string, ResourceRepository>();
  for (const r of resources) {
    map.set(r.repository, r);
  }
  return Array.from(map.values());
}

/**
 * Generate a canonical node ID for a template based on its resolved identity.
 * Two references pointing to the same file (and repo) produce the same ID,
 * enabling node de-duplication across the entire graph.
 */
function canonicalNodeId(
  resolvedRepoAlias: string | undefined,
  resolvedPath: string,
): string {
  const repo = resolvedRepoAlias || 'self';
  return `tpl::${repo}::${resolvedPath}`;
}

/** Build node + edge arrays from a set of template references attached to a parent. */
function buildTemplateNodesAndEdges(
  parentId: string,
  refs: TemplateReference[],
  org: string,
  project: string,
  defaultRepoName: string,
  repositories: ResourceRepository[],
  /** Parameter context of the file containing these refs (merged caller + file defaults) */
  parameterContext?: Record<string, unknown>,
  /** IDs of nodes that already exist in the graph — used for cross-parent dedup */
  existingNodeIds?: Set<string>,
  /** Pipeline variables for expression resolution */
  variableContext?: Record<string, string>,
): { templateNodes: Node[]; templateEdges: Edge[] } {
  // De-duplicate within this batch (same resolved identity from the same parent)
  const seenInBatch = new Set<string>();
  const templateNodes: Node[] = [];
  const templateEdges: Edge[] = [];

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];

    // Attempt to resolve expression paths (e.g. ${{parameters.buildType}} or ${{variables.buildType}})
    let pathForNode = ref.normalizedPath;
    let pathDynamic = false;
    let pathResolved = true;
    let originalPath: string | undefined;
    let unresolvedExpressions: string[] | undefined;

    if (pathHasExpressions(ref.normalizedPath)) {
      pathDynamic = true;
      originalPath = ref.normalizedPath;
      const resolution = resolveExpressionPath(
        ref.normalizedPath,
        parameterContext,
        undefined,
        variableContext,
      );
      pathForNode = resolution.resolvedPath;
      pathResolved = resolution.isFullyResolved;
      unresolvedExpressions = resolution.unresolved.length
        ? resolution.unresolved
        : undefined;
    }

    // Resolve expressions in repo alias (e.g. @${{ coalesce(params.x, 'fallback') }})
    let resolvedRepoAlias = getEffectiveRepoAlias(ref);
    let repoAliasDynamic = false;
    let repoAliasResolved = true;
    if (resolvedRepoAlias && pathHasExpressions(resolvedRepoAlias)) {
      repoAliasDynamic = true;
      const aliasResolution = resolveExpressionPath(
        resolvedRepoAlias,
        parameterContext,
        undefined,
        variableContext,
      );
      if (aliasResolution.isFullyResolved) {
        resolvedRepoAlias = aliasResolution.resolvedPath;
      } else {
        repoAliasResolved = false;
        unresolvedExpressions = [
          ...(unresolvedExpressions ?? []),
          ...aliasResolution.unresolved,
        ];
      }
    }

    // Overall: is anything dynamic? Is everything resolved?
    const isDynamic = pathDynamic || repoAliasDynamic;
    const isFullyResolved = pathResolved && repoAliasResolved;

    // Resolve non-aliased nested refs relative to the template that declared them.
    // Azure Pipelines tries relative-to-source first, then repo-root as fallback.
    const { primary: resolvedPath, fallback: fallbackPath } =
      resolveTemplateRefPaths({
        ...ref,
        normalizedPath: pathForNode,
        repoAlias: ref.repoAlias,
        sourcePath: ref.sourcePath,
      });

    // Canonical ID based on resolved identity
    const nodeId = canonicalNodeId(resolvedRepoAlias, resolvedPath);

    // Skip if we already created this node in this batch
    if (seenInBatch.has(nodeId)) continue;
    seenInBatch.add(nodeId);

    // Check if the node already exists in the graph (cross-parent dedup)
    const nodeAlreadyExists = existingNodeIds?.has(nodeId);

    // Evaluate condition expression for conditional template refs.
    // true → condition met, expand normally
    // false → condition not met, skip auto-expand
    // 'unknown' → couldn't determine (missing context), skip auto-expand
    let conditionResult: true | false | 'unknown' | undefined;
    if (ref.conditional && ref.conditionExpression) {
      try {
        const evalResult = evaluateExpression(ref.conditionExpression, {
          parameters: parameterContext,
          variables: variableContext,
        });
        if (typeof evalResult === 'boolean') {
          conditionResult = evalResult;
        } else if (
          evalResult === undefined ||
          evalResult === ref.conditionExpression
        ) {
          conditionResult = 'unknown';
        } else {
          conditionResult = !!evalResult;
        }
      } catch {
        conditionResult = 'unknown';
      }
    } else if (ref.conditional) {
      // Conditional but no expression (e.g. ${{ else }} block) — can't evaluate
      conditionResult = 'unknown';
    }

    // Condition evaluated to false — don't create the node or edge at all
    if (conditionResult === false) continue;

    if (!nodeAlreadyExists) {
      const label =
        pathForNode.length > 40 ? `...${pathForNode.slice(-37)}` : pathForNode;

      // Resolve repo info and ADO URL using the resolved repo alias
      const { repoInfo, adoUrl } = resolveNodeMetadata(
        ref,
        resolvedRepoAlias,
        resolvedPath,
        org,
        project,
        defaultRepoName,
        repositories,
      );

      // Resolve expression strings in ref.parameters (e.g. ${{ parameters.featureFlags }} → actual value)
      const resolvedRefParams = resolveCallerParams(
        ref.parameters as Record<string, unknown> | undefined,
        parameterContext,
        variableContext,
      );

      // Create a modified ref with the resolved repo alias and parameters for fetching
      const resolvedRef: TemplateReference =
        resolvedRepoAlias !== getEffectiveRepoAlias(ref) ||
        resolvedRefParams !== ref.parameters
          ? {
              ...ref,
              repoAlias: resolvedRepoAlias || ref.repoAlias,
              contextRepoAlias: resolvedRepoAlias || ref.contextRepoAlias,
              parameters: resolvedRefParams as TemplateReference['parameters'],
            }
          : ref;

      templateNodes.push({
        id: nodeId,
        type: 'fileNode',
        position: { x: 0, y: 0 },
        data: {
          label,
          filePath: resolvedPath,
          repoAlias: resolvedRepoAlias,
          templateCount: 0,
          status: 'collapsed',
          isRoot: false,
          baseDir: dirOf(resolvedPath),
          adoUrl,
          repoInfo,
          templateLocation: ref.location,
          // Dynamic path info for auto-expand to skip unresolved expression paths
          dynamicPath: isDynamic || undefined,
          expressionResolved: isDynamic ? isFullyResolved : undefined,
          // Stash the resolved ref for expansion (with resolved repo alias + params)
          _ref: resolvedRef,
          // Stash fallback path for fetch retry (repo-root-relative)
          _fallbackPath: fallbackPath,
          // Stash the parent's parameter context so it can flow down during expansion
          _parentParamContext: parameterContext,
          // Stash accumulated resources (root + all ancestor template resources)
          _accumulatedResources: repositories,
          // Stash accumulated variables for expression resolution in descendants
          _accumulatedVariables: variableContext,
          // Condition evaluation result for conditional refs
          // true = expand, false = skip, 'unknown' = expand when autoExpandAll
          _conditionResult: conditionResult,
        },
      });
    }

    // Always create the edge (even for deduplicated nodes)
    const edgeLabel =
      ref.location === 'extends'
        ? 'extends'
        : ref.location === 'extends-parameters'
          ? 'extends param'
          : ref.location;

    const isExternalEdge = !!resolvedRepoAlias;

    // Extract parameter names for the edge
    const parameterNames = ref.parameters
      ? Object.keys(ref.parameters)
      : undefined;

    templateEdges.push({
      id: `${parentId}->${nodeId}`,
      source: parentId,
      target: nodeId,
      type: 'templateEdge',
      data: {
        edgeLabel,
        parameterNames,
        isExternal: isExternalEdge || undefined,
        conditional: ref.conditional || undefined,
        conditionExpression: ref.conditionExpression,
        conditionResult,
        dynamicPath: isDynamic || undefined,
        expressionResolved: isDynamic ? isFullyResolved : undefined,
        originalPath:
          originalPath || (repoAliasDynamic ? ref.rawPath : undefined),
        resolvedPath: isDynamic ? resolvedPath : undefined,
        unresolvedExpressions,
      } satisfies TemplateEdgeData,
      style: isExternalEdge
        ? {
            stroke: 'var(--badge-resources)',
            strokeWidth: 2,
            strokeDasharray: '6 3',
          }
        : undefined,
      markerEnd: isExternalEdge
        ? { type: MarkerType.ArrowClosed, color: 'var(--badge-resources)' }
        : undefined,
    });
  }

  return { templateNodes, templateEdges };
}

/** Fetch template content, using cache or API. Returns content + actual resolved path. */
async function fetchTemplateContent(
  org: string,
  project: string,
  defaultRepoName: string,
  nodeData: FileNodeData,
  repositories: ResourceRepository[],
  cache: Map<string, string>,
  setCache: (key: string, content: string) => void,
  fetchFileByRepoName: FetchFileByRepoNameFn,
): Promise<{ content: string; actualPath: string }> {
  // Retrieve the stashed ref from node data
  const ref = (nodeData as unknown as Record<string, unknown>)._ref as
    | TemplateReference
    | undefined;
  if (!ref) throw new Error('No template reference on this node');

  // Use the resolved filePath from node data (already resolved relative to parent dir)
  const fetchPath = nodeData.filePath;
  const fallbackPath = (nodeData as unknown as Record<string, unknown>)
    ._fallbackPath as string | undefined;
  const effectiveRepoAlias = getEffectiveRepoAlias(ref);
  const cacheKey = `${effectiveRepoAlias || ''}:${fetchPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return { content: cached, actualPath: fetchPath };

  // Also check cache for fallback path
  if (fallbackPath) {
    const fallbackCacheKey = `${effectiveRepoAlias || ''}:${fallbackPath}`;
    const fallbackCached = cache.get(fallbackCacheKey);
    if (fallbackCached)
      return { content: fallbackCached, actualPath: fallbackPath };
  }

  // Use node-specific accumulated resources if available, otherwise fall back to root resources
  const nodeResources = (nodeData as unknown as Record<string, unknown>)
    ._accumulatedResources as ResourceRepository[] | undefined;
  const effectiveRepos = nodeResources ?? repositories;

  // Resolve the repo alias
  let targetProject = project;
  let targetRepo = defaultRepoName;
  let targetRef: string | undefined;

  if (effectiveRepoAlias && effectiveRepos.length) {
    const source = resolveTemplateSource(effectiveRepoAlias, effectiveRepos);
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

  let resp: { content: string };
  let actualPath = fetchPath;
  try {
    resp = await fetchFileByRepoName(
      org,
      targetProject,
      targetRepo,
      fetchPath,
      targetRef,
    );
  } catch (primaryErr) {
    // Fallback: try repo-root-relative path
    if (fallbackPath) {
      resp = await fetchFileByRepoName(
        org,
        targetProject,
        targetRepo,
        fallbackPath,
        targetRef,
      );
      actualPath = fallbackPath;
    } else {
      throw primaryErr;
    }
  }

  setCache(`${effectiveRepoAlias || ''}:${actualPath}`, resp.content);
  return { content: resp.content, actualPath };
}

/** Extract directory from a file path. e.g. "/.pipelines/a.yml" → "/.pipelines" */
function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
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
    const repoResource = repositories.find(
      (r) => r.repository === effectiveRepoAlias,
    );
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
  const adoUrl =
    org && targetProject && targetRepo
      ? buildAdoFileUrl({
          org,
          project: targetProject,
          repoName: targetRepo,
          filePath: resolvedPath,
          ref: targetRef,
        })
      : undefined;

  return { repoInfo, adoUrl };
}

/**
 * Update a node with newly discovered variables from an expanded variable template.
 * Re-resolves expression paths and repo aliases using the merged variable context.
 */
function updateNodeWithNewVariables(
  node: Node,
  newVariables: Record<string, string>,
  org?: string,
  project?: string,
  defaultRepoName?: string,
  repositories?: ResourceRepository[],
): Node {
  const d = node.data as unknown as Record<string, unknown>;
  const existingVars = (d._accumulatedVariables ?? {}) as Record<
    string,
    string
  >;
  const mergedVars = { ...existingVars, ...newVariables };

  const ref = d._ref as TemplateReference | undefined;
  if (!ref) return node;

  const paramContext = d._parentParamContext as
    | Record<string, unknown>
    | undefined;

  // Re-resolve the template path with new variables
  let newFilePath = ref.normalizedPath;
  let isDynamic = false;
  let isFullyResolved = true;
  let resolvedRepoAlias = getEffectiveRepoAlias(ref);

  if (pathHasExpressions(ref.normalizedPath)) {
    isDynamic = true;
    const resolution = resolveExpressionPath(
      ref.normalizedPath,
      paramContext,
      undefined,
      mergedVars,
    );
    newFilePath = resolution.resolvedPath;
    isFullyResolved = resolution.isFullyResolved;

    // After expression resolution, the path may contain @RepoAlias
    // (e.g. "path/to/file.yml@VstsTemplates") — split it out
    if (isFullyResolved && !pathHasExpressions(newFilePath)) {
      const parsed = parseTemplatePath(newFilePath);
      newFilePath = parsed.normalizedPath;
      if (parsed.repoAlias) {
        resolvedRepoAlias = parsed.repoAlias;
      }
    }
  }

  // Re-resolve repo alias expressions
  if (resolvedRepoAlias && pathHasExpressions(resolvedRepoAlias)) {
    isDynamic = true;
    const aliasRes = resolveExpressionPath(
      resolvedRepoAlias,
      paramContext,
      undefined,
      mergedVars,
    );
    if (aliasRes.isFullyResolved) {
      resolvedRepoAlias = aliasRes.resolvedPath;
    } else {
      isFullyResolved = false;
    }
  }

  // Update the ref with the resolved repo alias for proper fetching
  const updatedRef: TemplateReference = {
    ...ref,
    normalizedPath: newFilePath,
    repoAlias: resolvedRepoAlias || ref.repoAlias,
    contextRepoAlias: resolvedRepoAlias || ref.contextRepoAlias,
  };

  const { primary: resolvedPath, fallback: fallbackPath } =
    resolveTemplateRefPaths({
      ...updatedRef,
      normalizedPath: newFilePath,
      repoAlias: updatedRef.repoAlias,
      sourcePath: ref.sourcePath,
    });

  const label =
    newFilePath.length > 40 ? `...${newFilePath.slice(-37)}` : newFilePath;

  // Resolve ADO URL and repo info for the updated path
  const { repoInfo, adoUrl } =
    org && project && defaultRepoName && repositories
      ? resolveNodeMetadata(
          updatedRef,
          resolvedRepoAlias,
          resolvedPath,
          org,
          project,
          defaultRepoName,
          repositories,
        )
      : { repoInfo: undefined, adoUrl: undefined };

  return {
    ...node,
    data: {
      ...node.data,
      label,
      filePath: resolvedPath,
      repoAlias: resolvedRepoAlias,
      baseDir: dirOf(resolvedPath),
      dynamicPath: isDynamic || undefined,
      expressionResolved: isDynamic ? isFullyResolved : undefined,
      adoUrl: adoUrl || (node.data as unknown as FileNodeData).adoUrl,
      repoInfo: repoInfo || (node.data as unknown as FileNodeData).repoInfo,
      _ref: updatedRef,
      _accumulatedVariables: mergedVars,
      _fallbackPath: fallbackPath,
    },
  };
}
