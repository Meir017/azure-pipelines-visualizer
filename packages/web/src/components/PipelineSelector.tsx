import { useState, useEffect, useRef } from 'react';
import { parseAdoUrl } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchPipelines, fetchPipelineYaml, fetchFileByRepoName } from '../services/api-client.js';

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

  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [orgInput, setOrgInput] = useState(org);
  const [projectInput, setProjectInput] = useState(project);
  const [mode, setMode] = useState<'url' | 'browse'>('url');

  const [urlLoading, setUrlLoading] = useState(false);
  const autoLoaded = useRef(false);

  // Auto-load pipeline from URL search params on mount
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;

    const params = new URLSearchParams(window.location.search);
    const adoUrl = params.get('url');
    const paramOrg = params.get('org');
    const paramProject = params.get('project');
    const paramRepo = params.get('repo');
    const paramPath = params.get('path');
    const paramBranch = params.get('branch') ?? undefined;
    const paramPipelineId = params.get('pipelineId');

    if (adoUrl) {
      // Mode 1: full ADO URL passed as ?url=...
      setUrlInput(adoUrl);
      loadFromAdoUrl(adoUrl);
    } else if (paramOrg && paramProject && paramRepo && paramPath) {
      // Mode 2: individual params ?org=&project=&repo=&path=&branch=
      const fullUrl = `https://dev.azure.com/${paramOrg}/${paramProject}/_git/${paramRepo}?path=${paramPath}${paramBranch ? `&version=GB${paramBranch}` : ''}`;
      setUrlInput(fullUrl);
      loadFromAdoUrl(fullUrl);
    } else if (paramOrg && paramProject && paramPipelineId) {
      // Mode 3: pipeline ID ?org=&project=&pipelineId=
      loadFromPipelineId(paramOrg, paramProject, Number(paramPipelineId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFromAdoUrl = async (url: string) => {
    const parsed = parseAdoUrl(url);
    if (!parsed) {
      setUrlError('Invalid Azure DevOps URL');
      return;
    }
    setConnection(parsed.org, parsed.project);
    setSelectedPipelineLoading(true);
    setSelectedPipelineError(null);
    setUrlLoading(true);
    try {
      const resp = await fetchFileByRepoName(
        parsed.org, parsed.project, parsed.repoName, parsed.filePath, parsed.branch,
      );
      setSelectedPipeline({
        definition: {
          id: 0,
          name: parsed.filePath.split('/').pop() || parsed.filePath,
          path: parsed.filePath,
          repository: { id: resp.repoId, name: resp.repoName, type: 'git', defaultBranch: resp.branch || '' },
        },
        yaml: resp.content,
      });
    } catch (err) {
      setSelectedPipelineError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelectedPipelineLoading(false);
      setUrlLoading(false);
    }
  };

  const loadFromPipelineId = async (pOrg: string, pProject: string, pipelineId: number) => {
    setConnection(pOrg, pProject);
    setSelectedPipelineLoading(true);
    setSelectedPipelineError(null);
    try {
      const data = await fetchPipelineYaml(pOrg, pProject, pipelineId);
      setSelectedPipeline(data);
    } catch (err) {
      setSelectedPipelineError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelectedPipelineLoading(false);
    }
  };

  const handleLoadFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlError(null);
    await loadFromAdoUrl(urlInput.trim());
  };

  const handleLoadPipelines= async () => {
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
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'url' ? 'mode-tab--active' : ''}`}
          onClick={() => setMode('url')}
        >
          Paste URL
        </button>
        <button
          className={`mode-tab ${mode === 'browse' ? 'mode-tab--active' : ''}`}
          onClick={() => setMode('browse')}
        >
          Browse
        </button>
      </div>

      {mode === 'url' && (
        <div className="connection-form">
          <label className="form-label">Azure DevOps file URL</label>
          <textarea
            placeholder="https://dev.azure.com/{org}/{project}/_git/{repo}?path=/{pipeline}.yml"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={3}
          />
          <button onClick={handleLoadFromUrl} disabled={!urlInput.trim() || urlLoading}>
            {urlLoading ? '⏳ Loading...' : 'Load Pipeline'}
          </button>
          {urlError && <div className="error">{urlError}</div>}
        </div>
      )}

      {mode === 'browse' && (
        <>
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
        </>
      )}
    </div>
  );
}
