import { create } from 'zustand';
import type {
  PipelineYamlResponse,
  TaskSchemaEntry,
} from '../services/api-client.js';

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

  // Task schema: name@version → description & inputs
  taskSchema: Map<string, TaskSchemaEntry>;
  setTaskSchema: (entries: TaskSchemaEntry[]) => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  org: '',
  project: '',
  setConnection: (org, project) => set({ org, project }),

  selectedPipeline: null,
  selectedPipelineLoading: false,
  selectedPipelineError: null,
  setSelectedPipeline: (selectedPipeline) =>
    set({
      selectedPipeline,
      selectedPipelineError: null,
      expandedNodes: new Set(),
    }),
  setSelectedPipelineLoading: (selectedPipelineLoading) =>
    set({ selectedPipelineLoading }),
  setSelectedPipelineError: (selectedPipelineError) =>
    set({ selectedPipelineError }),

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

  taskSchema: new Map(),
  setTaskSchema: (entries) =>
    set(() => {
      const map = new Map<string, TaskSchemaEntry>();
      for (const entry of entries) {
        // Index by name@version for exact lookups
        map.set(`${entry.name}@${entry.version}`, entry);
      }
      return { taskSchema: map };
    }),
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
