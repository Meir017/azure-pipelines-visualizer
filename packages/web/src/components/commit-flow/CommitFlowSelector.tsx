import { parseAdoCommitUrl } from '@meirblachman/azure-pipelines-visualizer-core';
import { useState } from 'react';

export interface CommitFlowParams {
  org: string;
  project: string;
  repoName: string;
  commitSha: string;
}

interface CommitFlowSelectorProps {
  onLoad: (params: CommitFlowParams) => void;
  loading: boolean;
}

export default function CommitFlowSelector({
  onLoad,
  loading,
}: CommitFlowSelectorProps) {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleSubmit = () => {
    const input = urlInput.trim();
    if (!input) return;
    setUrlError(null);

    const parsed = parseAdoCommitUrl(input);
    if (!parsed) {
      setUrlError(
        'Invalid URL. Expected: https://dev.azure.com/{org}/{project}/_git/{repo}/commit/{sha}',
      );
      return;
    }

    onLoad({
      org: parsed.org,
      project: parsed.project,
      repoName: parsed.repoName,
      commitSha: parsed.commitSha,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="commit-flow-selector">
      <input
        type="text"
        placeholder="https://dev.azure.com/{org}/{project}/_git/{repo}/commit/{sha}"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="commit-flow-selector__input commit-flow-selector__input--url"
      />
      <button
        className="commit-flow-selector__btn"
        onClick={handleSubmit}
        disabled={!urlInput.trim() || loading}
        type="button"
      >
        {loading ? '⏳ Loading...' : 'Load Builds'}
      </button>
      {urlError && (
        <div className="commit-flow-selector__error">{urlError}</div>
      )}
    </div>
  );
}
