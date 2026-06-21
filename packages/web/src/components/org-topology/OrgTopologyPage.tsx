import { useCallback, useState } from 'react';
import OrgTopologyGraph, {
  type PipelineInfo,
  type ProjectInfo,
  type ProjectPipelines,
} from './OrgTopologyGraph.js';

const API_BASE = '/api';

async function fetchProjects(org: string): Promise<ProjectInfo[]> {
  const resp = await fetch(`${API_BASE}/${org}/topology/projects`);
  if (!resp.ok) throw new Error(`Failed to fetch projects: ${resp.status}`);
  return resp.json();
}

async function fetchProjectPipelines(
  org: string,
  project: string,
): Promise<{
  pipelines: PipelineInfo[];
  folders: Record<string, PipelineInfo[]>;
}> {
  const resp = await fetch(
    `${API_BASE}/${org}/${encodeURIComponent(project)}/topology/pipelines`,
  );
  if (!resp.ok) throw new Error(`Failed to fetch pipelines: ${resp.status}`);
  return resp.json();
}

export default function OrgTopologyPage() {
  const [org, setOrg] = useState('');
  const [data, setData] = useState<ProjectPipelines[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(async () => {
    if (!org.trim()) return;
    setLoading(true);
    setError(null);
    setData([]);

    try {
      const projects = await fetchProjects(org.trim());

      // Fetch pipelines for each project in parallel
      const results = await Promise.allSettled(
        projects.map(async (project) => {
          const { pipelines, folders } = await fetchProjectPipelines(
            org.trim(),
            project.name,
          );
          return { project, pipelines, folders } as ProjectPipelines;
        }),
      );

      const successful: ProjectPipelines[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.pipelines.length > 0) {
          successful.push(r.value);
        }
      }

      // Sort by pipeline count descending
      successful.sort((a, b) => b.pipelines.length - a.pipelines.length);
      setData(successful);

      if (successful.length === 0) {
        setError('No pipelines found in any project.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [org]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <label
          htmlFor="org-input"
          style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}
        >
          Organization:
        </label>
        <input
          id="org-input"
          type="text"
          placeholder="e.g. myorg"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          style={{
            padding: '6px 10px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            fontSize: 13,
            width: 240,
          }}
        />
        <button
          onClick={handleLoad}
          disabled={loading || !org.trim()}
          type="button"
          style={{
            padding: '6px 16px',
            background: loading ? 'var(--border)' : 'var(--accent)',
            border: 'none',
            borderRadius: 4,
            color: 'var(--bg)',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load Topology'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--error)',
            color: 'var(--bg)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {data.length > 0 && (
        <div style={{ flex: 1 }}>
          <OrgTopologyGraph data={data} loading={loading} />
        </div>
      )}

      {!loading && data.length === 0 && !error && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 15,
          }}
        >
          Enter an Azure DevOps organization name and click "Load Topology" to
          see all pipelines across projects.
        </div>
      )}
    </div>
  );
}
