import { useCallback, useState } from 'react';
import type { BuildInfo } from '../../services/api-client.js';
import { fetchBuildsForDefinition } from '../../services/api-client.js';
import RunHistoryDashboard from './RunHistoryDashboard.js';

export default function RunHistoryPage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [definitionId, setDefinitionId] = useState('');
  const [builds, setBuilds] = useState<BuildInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(async () => {
    const defId = Number(definitionId);
    if (!org || !project || !defId) return;

    setLoading(true);
    setError(null);
    setBuilds(null);

    try {
      const data = await fetchBuildsForDefinition(org, project, defId);
      setBuilds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [org, project, definitionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLoad();
  };

  return (
    <div className="rh-page">
      <div className="rh-selector">
        <input
          className="rh-input"
          placeholder="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <input
          className="rh-input"
          placeholder="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <input
          className="rh-input"
          placeholder="Definition ID"
          value={definitionId}
          onChange={(e) => setDefinitionId(e.target.value)}
          onKeyDown={handleKeyDown}
          type="number"
        />
        <button
          className="rh-load-btn"
          onClick={handleLoad}
          disabled={loading || !org || !project || !definitionId}
          type="button"
        >
          {loading ? 'Loading…' : 'Load History'}
        </button>
      </div>

      {error && <div className="rh-error">{error}</div>}
      {builds && <RunHistoryDashboard builds={builds} />}
    </div>
  );
}
