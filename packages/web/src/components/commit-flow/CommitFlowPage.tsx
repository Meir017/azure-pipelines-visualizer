import '@xyflow/react/dist/style.css';
import { useCallback, useRef, useState } from 'react';
import type { BuildInfo } from '../../services/api-client.js';
import { streamCommitFlowGraph } from '../../services/api-client.js';
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
  const abortRef = useRef<AbortController | null>(null);

  const handleLoad = useCallback((params: CommitFlowParams) => {
    // Cancel any in-flight stream
    abortRef.current?.abort();

    setLoading(true);
    setError(null);
    setBuilds([]);
    setSelectedBuild(null);
    setLastParams(params);

    abortRef.current = streamCommitFlowGraph(
      params.org,
      params.project,
      params.repoName,
      params.commitSha,
      (batch) => {
        setBuilds((prev) => [...prev, ...batch]);
      },
      () => {
        setLoading(false);
        // Check if any builds were received
        setBuilds((prev) => {
          if (prev.length === 0) {
            setError('No builds found for this commit.');
          }
          return prev;
        });
      },
      (errMsg) => {
        setLoading(false);
        setError(errMsg);
      },
    );
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
            {loading && ' (loading…)'}
          </div>
          <CommitFlowDiagram builds={builds} onNodeClick={setSelectedBuild} />
        </div>
      )}

      {selectedBuild && lastParams && (
        <BuildDetailPopup
          build={selectedBuild}
          org={lastParams.org}
          onClose={() => setSelectedBuild(null)}
        />
      )}
    </div>
  );
}
