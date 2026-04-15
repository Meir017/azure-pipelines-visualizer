import { useState } from 'react';

export interface CommitFlowParams {
  org: string;
  project: string;
  repoId: string;
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
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [org, setOrg] = useState(params.get('org') || '');
  const [project, setProject] = useState(params.get('project') || '');
  const [repoId, setRepoId] = useState(params.get('repoId') || '');
  const [commitSha, setCommitSha] = useState(params.get('commitSha') || '');

  const canSubmit =
    org.trim() && project.trim() && repoId.trim() && commitSha.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onLoad({
      org: org.trim(),
      project: project.trim(),
      repoId: repoId.trim(),
      commitSha: commitSha.trim(),
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
        placeholder="Organization"
        value={org}
        onChange={(e) => setOrg(e.target.value)}
        onKeyDown={handleKeyDown}
        className="commit-flow-selector__input"
      />
      <input
        type="text"
        placeholder="Project"
        value={project}
        onChange={(e) => setProject(e.target.value)}
        onKeyDown={handleKeyDown}
        className="commit-flow-selector__input"
      />
      <input
        type="text"
        placeholder="Repository ID or Name"
        value={repoId}
        onChange={(e) => setRepoId(e.target.value)}
        onKeyDown={handleKeyDown}
        className="commit-flow-selector__input"
      />
      <input
        type="text"
        placeholder="Commit SHA"
        value={commitSha}
        onChange={(e) => setCommitSha(e.target.value)}
        onKeyDown={handleKeyDown}
        className="commit-flow-selector__input commit-flow-selector__input--sha"
      />
      <button
        className="commit-flow-selector__btn"
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        type="button"
      >
        {loading ? '⏳ Loading...' : 'Load Builds'}
      </button>
    </div>
  );
}
