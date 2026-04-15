import '@xyflow/react/dist/style.css';
import { useCallback, useState } from 'react';
import type { BuildInfo } from '../../services/api-client.js';
import { fetchCommitFlowGraph } from '../../services/api-client.js';
import BuildDetailPopup from './BuildDetailPopup.js';
import CommitFlowDiagram from './CommitFlowDiagram.js';
import CommitFlowSelector, {
  type CommitFlowParams,
} from './CommitFlowSelector.js';

export default function CommitFlowPage() {
  const [builds, setBuilds] = useState<BuildInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<BuildInfo | null>(null);
  const [lastParams, setLastParams] = useState<CommitFlowParams | null>(null);

  const handleLoad = useCallback(async (params: CommitFlowParams) => {
    setLoading(true);
    setError(null);
    setBuilds([]);
    setSelectedBuild(null);
    setLastParams(params);
    try {
      const data = await fetchCommitFlowGraph(
        params.org,
        params.project,
        params.repoName,
        params.commitSha,
      );
      setBuilds(data);
      if (data.length === 0) {
        setError('No builds found for this commit.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (lastParams) handleLoad(lastParams);
  }, [lastParams, handleLoad]);

  return (
    <div className="commit-flow-page">
      <div className="commit-flow-page__selector">
        <CommitFlowSelector onLoad={handleLoad} loading={loading} />
        {lastParams && !loading && (
          <button
            className="commit-flow-page__refresh"
            onClick={handleRefresh}
            type="button"
          >
            🔄 Refresh
          </button>
        )}
      </div>

      {error && <div className="commit-flow-page__error">{error}</div>}

      {builds.length > 0 && (
        <div className="commit-flow-page__diagram">
          <div className="commit-flow-page__summary">
            {builds.length} build{builds.length !== 1 ? 's' : ''} found
          </div>
          <CommitFlowDiagram builds={builds} onNodeClick={setSelectedBuild} />
        </div>
      )}

      {selectedBuild && (
        <BuildDetailPopup
          build={selectedBuild}
          onClose={() => setSelectedBuild(null)}
        />
      )}
    </div>
  );
}
