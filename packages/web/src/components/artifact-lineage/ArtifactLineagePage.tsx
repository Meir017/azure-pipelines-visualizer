import '@xyflow/react/dist/style.css';
import { useCallback, useState } from 'react';
import type { BuildArtifact, BuildInfo } from '../../services/api-client.js';
import {
  fetchBuild,
  fetchBuildArtifacts,
  streamCommitFlowGraph,
} from '../../services/api-client.js';
import ArtifactLineageGraph from './ArtifactLineageGraph.js';

export interface ArtifactBuild {
  build: BuildInfo;
  artifacts: BuildArtifact[];
}

export default function ArtifactLineagePage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [buildId, setBuildId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactBuilds, setArtifactBuilds] = useState<ArtifactBuild[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<ArtifactBuild | null>(
    null,
  );

  const handleLoad = useCallback(async () => {
    const trimOrg = org.trim();
    const trimProject = project.trim();
    const id = Number(buildId.trim());
    if (!trimOrg || !trimProject || !id) return;

    setLoading(true);
    setError(null);
    setArtifactBuilds([]);
    setSelectedBuild(null);

    try {
      // Fetch the root build and its artifacts
      const rootBuild = await fetchBuild(trimOrg, trimProject, id);
      const rootArtifacts = await fetchBuildArtifacts(trimOrg, trimProject, id);

      const buildMap = new Map<number, ArtifactBuild>();
      buildMap.set(rootBuild.id, {
        build: rootBuild,
        artifacts: rootArtifacts,
      });

      // If the build has a source repo + commit, discover the full commit flow
      if (rootBuild.sourceVersion) {
        // Use commit flow SSE to discover related builds
        await new Promise<void>((resolve, reject) => {
          const batches: BuildInfo[] = [];
          const ctrl = streamCommitFlowGraph(
            trimOrg,
            trimProject,
            // Try to extract repo name from the build — fall back to empty
            '',
            rootBuild.sourceVersion,
            (batch) => {
              batches.push(...batch);
            },
            async () => {
              // Fetch artifacts for each discovered build
              const promises = batches
                .filter((b) => !buildMap.has(b.id))
                .map(async (b) => {
                  try {
                    const arts = await fetchBuildArtifacts(
                      trimOrg,
                      b.project.name,
                      b.id,
                    );
                    buildMap.set(b.id, { build: b, artifacts: arts });
                  } catch {
                    buildMap.set(b.id, { build: b, artifacts: [] });
                  }
                });
              await Promise.all(promises);
              resolve();
            },
            (errMsg) => {
              // Commit flow may fail if no repo context — that's okay,
              // we still have the root build
              console.warn('Commit flow failed:', errMsg);
              resolve();
            },
          );
          // Cleanup on reject
          ctrl.signal.addEventListener('abort', () => reject());
        });
      }

      // Also discover triggered builds via upstreamBuildId chain
      // Walk downstream: find builds triggered by our root
      const discoveredBuilds = Array.from(buildMap.values());
      setArtifactBuilds(discoveredBuilds);

      if (discoveredBuilds.length === 0) {
        setError('No builds found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [org, project, buildId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoad();
    }
  };

  return (
    <div className="artifact-lineage-page">
      <div className="artifact-lineage-page__selector">
        <input
          type="text"
          placeholder="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={handleKeyDown}
          className="artifact-lineage-page__input"
        />
        <input
          type="text"
          placeholder="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={handleKeyDown}
          className="artifact-lineage-page__input"
        />
        <input
          type="text"
          placeholder="Build ID"
          value={buildId}
          onChange={(e) => setBuildId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="artifact-lineage-page__input artifact-lineage-page__input--short"
        />
        <button
          className="artifact-lineage-page__btn"
          onClick={handleLoad}
          disabled={
            !org.trim() || !project.trim() || !buildId.trim() || loading
          }
          type="button"
        >
          {loading ? '⏳ Loading...' : 'Load Artifacts'}
        </button>
      </div>

      {error && <div className="artifact-lineage-page__error">{error}</div>}

      {artifactBuilds.length > 0 && (
        <div className="artifact-lineage-page__diagram">
          <div className="artifact-lineage-page__summary">
            {artifactBuilds.length} build
            {artifactBuilds.length !== 1 ? 's' : ''},{' '}
            {artifactBuilds.reduce((s, ab) => s + ab.artifacts.length, 0)}{' '}
            artifact
            {artifactBuilds.reduce((s, ab) => s + ab.artifacts.length, 0) !== 1
              ? 's'
              : ''}
          </div>
          <ArtifactLineageGraph
            artifactBuilds={artifactBuilds}
            onNodeClick={setSelectedBuild}
          />
        </div>
      )}

      {selectedBuild && (
        <div
          className="artifact-lineage-page__panel-overlay"
          onClick={() => setSelectedBuild(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedBuild(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="artifact-lineage-page__panel"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="artifact-lineage-page__panel-header">
              <h3>{selectedBuild.build.definition.name}</h3>
              <button
                className="artifact-lineage-page__panel-close"
                onClick={() => setSelectedBuild(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="artifact-lineage-page__panel-body">
              <p>
                <strong>Build:</strong> #{selectedBuild.build.buildNumber}
              </p>
              <p>
                <strong>Status:</strong> {selectedBuild.build.status}
                {selectedBuild.build.result
                  ? ` (${selectedBuild.build.result})`
                  : ''}
              </p>
              <p>
                <strong>Branch:</strong>{' '}
                {selectedBuild.build.sourceBranch.replace('refs/heads/', '')}
              </p>
              <h4>Artifacts ({selectedBuild.artifacts.length})</h4>
              {selectedBuild.artifacts.length === 0 ? (
                <p className="artifact-lineage-page__no-artifacts">
                  No artifacts published
                </p>
              ) : (
                <ul className="artifact-lineage-page__artifact-list">
                  {selectedBuild.artifacts.map((a) => (
                    <li key={a.id}>
                      <span className="artifact-lineage-page__artifact-name">
                        📦 {a.name}
                      </span>
                      <span className="artifact-lineage-page__artifact-type">
                        {a.resource.type}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {selectedBuild.build._links?.web?.href && (
                <a
                  href={selectedBuild.build._links.web.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="artifact-lineage-page__ado-link"
                >
                  Open in Azure DevOps ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
