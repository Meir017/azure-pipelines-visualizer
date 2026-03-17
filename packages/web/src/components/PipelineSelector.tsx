import { useState } from 'react';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchPipelines, fetchPipelineYaml } from '../services/api-client.js';

export default function PipelineSelector() {
  const {
    org,
    project,
    setConnection,
    pipelines,
    pipelinesLoading,
    pipelinesError,
    setPipelines,
    setPipelinesLoading,
    setPipelinesError,
    setSelectedPipeline,
    setSelectedPipelineLoading,
    setSelectedPipelineError,
  } = usePipelineStore();

  const [orgInput, setOrgInput] = useState(org);
  const [projectInput, setProjectInput] = useState(project);

  const handleLoadPipelines = async () => {
    if (!orgInput || !projectInput) return;
    setConnection(orgInput, projectInput);
    setPipelinesLoading(true);
    setPipelinesError(null);
    try {
      const data = await fetchPipelines(orgInput, projectInput);
      setPipelines(data);
    } catch (err) {
      setPipelinesError(err instanceof Error ? err.message : String(err));
    } finally {
      setPipelinesLoading(false);
    }
  };

  const handleSelectPipeline = async (pipelineId: number) => {
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
  };

  return (
    <div className="pipeline-selector">
      <div className="connection-form">
        <input
          type="text"
          placeholder="Organization"
          value={orgInput}
          onChange={(e) => setOrgInput(e.target.value)}
        />
        <input
          type="text"
          placeholder="Project"
          value={projectInput}
          onChange={(e) => setProjectInput(e.target.value)}
        />
        <button onClick={handleLoadPipelines} disabled={pipelinesLoading}>
          {pipelinesLoading ? 'Loading...' : 'Load Pipelines'}
        </button>
      </div>

      {pipelinesError && <div className="error">{pipelinesError}</div>}

      {pipelines.length > 0 && (
        <div className="pipeline-list">
          <h3>Pipelines</h3>
          <ul>
            {pipelines.map((p) => (
              <li key={p.id}>
                <button onClick={() => handleSelectPipeline(p.id)}>
                  {p.folder !== '\\' ? `${p.folder}\\` : ''}
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
