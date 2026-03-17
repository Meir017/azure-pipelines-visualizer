import { create } from 'zustand';
import type { PipelineInfo, PipelineYamlResponse } from '../services/api-client.js';

export interface SelectedNodeDetail {
  nodeId: string;
  label: string;
  filePath: string;
  yaml: string;
  repoAlias?: string;
}

export interface PipelineStore {
  // Connection
  org: string;
  project: string;
  setConnection: (org: string, project: string) => void;

  // Pipeline list
  pipelines: PipelineInfo[];
  pipelinesLoading: boolean;
  pipelinesError: string | null;
  setPipelines: (pipelines: PipelineInfo[]) => void;
  setPipelinesLoading: (loading: boolean) => void;
  setPipelinesError: (error: string | null) => void;

  // Selected pipeline
  selectedPipeline: PipelineYamlResponse | null;
  selectedPipelineLoading: boolean;
  selectedPipelineError: string | null;
  setSelectedPipeline: (pipeline: PipelineYamlResponse | null) => void;
  setSelectedPipelineLoading: (loading: boolean) => void;
  setSelectedPipelineError: (error: string | null) => void;

  // Expanded templates cache: key = normalizedPath, value = YAML content
  expandedTemplates: Map<string, string>;
  setExpandedTemplate: (key: string, content: string) => void;

  // Expanded node IDs (for tree expand/collapse state)
  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;

  // Detail panel: currently selected node for viewing
  selectedNodeDetail: SelectedNodeDetail | null;
  setSelectedNodeDetail: (detail: SelectedNodeDetail | null) => void;

  // Custom task docs from server config
  customTaskDocs: Record<string, string>;
  setCustomTaskDocs: (docs: Record<string, string>) => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  org: '',
  project: '',
  setConnection: (org, project) => set({ org, project }),

  pipelines: [],
  pipelinesLoading: false,
  pipelinesError: null,
  setPipelines: (pipelines) => set({ pipelines, pipelinesError: null }),
  setPipelinesLoading: (pipelinesLoading) => set({ pipelinesLoading }),
  setPipelinesError: (pipelinesError) => set({ pipelinesError }),

  selectedPipeline: null,
  selectedPipelineLoading: false,
  selectedPipelineError: null,
  setSelectedPipeline: (selectedPipeline) =>
    set({ selectedPipeline, selectedPipelineError: null, expandedNodes: new Set() }),
  setSelectedPipelineLoading: (selectedPipelineLoading) => set({ selectedPipelineLoading }),
  setSelectedPipelineError: (selectedPipelineError) => set({ selectedPipelineError }),

  expandedTemplates: new Map(loadCachedTemplates()),
  setExpandedTemplate: (key, content) =>
    set((state) => {
      const next = new Map(state.expandedTemplates);
      next.set(key, content);
      persistCachedTemplates(next);
      return { expandedTemplates: next };
    }),

  expandedNodes: new Set(),
  toggleNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { expandedNodes: next };
    }),

  selectedNodeDetail: null,
  setSelectedNodeDetail: (selectedNodeDetail) => set({ selectedNodeDetail }),

  customTaskDocs: {},
  setCustomTaskDocs: (customTaskDocs) => set({ customTaskDocs }),
}));

const CACHE_KEY = 'apv-template-cache';

function loadCachedTemplates(): [string, string][] {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function persistCachedTemplates(map: Map<string, string>): void {
  try {
    const entries = Array.from(map.entries());
    // Cap at 100 entries to avoid bloating localStorage
    const capped = entries.slice(-100);
    localStorage.setItem(CACHE_KEY, JSON.stringify(capped));
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}
