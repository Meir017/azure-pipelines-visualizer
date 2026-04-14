import { parseAdoUrl } from '@apv/core';
import { useEffect, useRef, useState } from 'react';
import {
  fetchFileByRepoName,
  fetchPipelineYaml,
} from '../services/api-client.js';
import { usePipelineStore } from '../store/pipeline-store.js';

export default function PipelineSelector() {
  const {
    setConnection,
    setSelectedPipeline,
    setSelectedPipelineLoading,
    setSelectedPipelineError,
  } = usePipelineStore();

  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
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
      setUrlInput(adoUrl);
      loadFromAdoUrl(adoUrl);
    } else if (paramOrg && paramProject && paramRepo && paramPath) {
      const fullUrl = `https://dev.azure.com/${paramOrg}/${paramProject}/_git/${paramRepo}?path=${paramPath}${paramBranch ? `&version=GB${paramBranch}` : ''}`;
      setUrlInput(fullUrl);
      loadFromAdoUrl(fullUrl);
    } else if (paramOrg && paramProject && paramPipelineId) {
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
        parsed.org,
        parsed.project,
        parsed.repoName,
        parsed.filePath,
        parsed.branch,
      );
      setSelectedPipeline({
        definition: {
          id: 0,
          name: parsed.filePath.split('/').pop() || parsed.filePath,
          path: parsed.filePath,
          repository: {
            id: resp.repoId,
            name: resp.repoName,
            type: 'git',
            defaultBranch: resp.branch || '',
          },
        },
        yaml: resp.content,
      });
    } catch (err) {
      setSelectedPipelineError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSelectedPipelineLoading(false);
      setUrlLoading(false);
    }
  };

  const loadFromPipelineId = async (
    pOrg: string,
    pProject: string,
    pipelineId: number,
  ) => {
    setConnection(pOrg, pProject);
    setSelectedPipelineLoading(true);
    setSelectedPipelineError(null);
    try {
      const data = await fetchPipelineYaml(pOrg, pProject, pipelineId);
      setSelectedPipeline(data);
    } catch (err) {
      setSelectedPipelineError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSelectedPipelineLoading(false);
    }
  };

  const handleLoadFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlError(null);
    await loadFromAdoUrl(urlInput.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoadFromUrl();
    }
  };

  return (
    <div className="pipeline-url-bar">
      <input
        type="text"
        className="pipeline-url-bar__input"
        placeholder="https://dev.azure.com/{org}/{project}/_git/{repo}?path=/{pipeline}.yml"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="pipeline-url-bar__btn"
        onClick={handleLoadFromUrl}
        disabled={!urlInput.trim() || urlLoading}
      >
        {urlLoading ? '⏳ Loading...' : 'Load'}
      </button>
      {urlError && <div className="pipeline-url-bar__error">{urlError}</div>}
    </div>
  );
}
