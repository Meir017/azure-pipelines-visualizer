import { create } from 'zustand';
import type { PipelineInfo, PipelineYamlResponse } from '../services/api-client.js';

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

  expandedTemplates: new Map(),
  setExpandedTemplate: (key, content) =>
    set((state) => {
      const next = new Map(state.expandedTemplates);
      next.set(key, content);
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
}));
