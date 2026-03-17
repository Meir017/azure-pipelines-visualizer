import { useCallback } from 'react';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchPipelines, fetchPipelineYaml } from '../services/api-client.js';

export function usePipeline() {
  const {
    org,
    project,
    setPipelines,
    setPipelinesLoading,
    setPipelinesError,
    setSelectedPipeline,
    setSelectedPipelineLoading,
    setSelectedPipelineError,
  } = usePipelineStore();

  const loadPipelines = useCallback(async () => {
    setPipelinesLoading(true);
    setPipelinesError(null);
    try {
      const data = await fetchPipelines(org, project);
      setPipelines(data);
    } catch (err) {
      setPipelinesError(err instanceof Error ? err.message : String(err));
    } finally {
      setPipelinesLoading(false);
    }
  }, [org, project, setPipelines, setPipelinesLoading, setPipelinesError]);

  const selectPipeline = useCallback(
    async (pipelineId: number) => {
      setSelectedPipelineLoading(true);
      setSelectedPipelineError(null);
      try {
        const data = await fetchPipelineYaml(org, project, pipelineId);
        setSelectedPipeline(data);
      } catch (err) {
        setSelectedPipelineError(err instanceof Error ? err.message : String(err));
      } finally {
        setSelectedPipelineLoading(false);
      }
    },
    [org, project, setSelectedPipeline, setSelectedPipelineLoading, setSelectedPipelineError],
  );

  return { loadPipelines, selectPipeline };
}
