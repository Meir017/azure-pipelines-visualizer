import { useCallback, useState } from 'react';
import HealthScorecard from './HealthScorecard.js';

interface HealthMetrics {
  totalBuilds: number;
  successRate: number;
  avgDurationSeconds: number;
  avgQueueWaitSeconds: number;
  longestFailureStreak: number;
  currentFailureStreak: number;
  durationStdDev: number;
  recentTrend: ('succeeded' | 'failed' | 'other')[];
  score: number;
}

export default function HealthScorecardPage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [definitionId, setDefinitionId] = useState('');
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!org || !project || !definitionId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/${encodeURIComponent(org)}/${encodeURIComponent(project)}/definitions/${encodeURIComponent(definitionId)}/health`,
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(
          body.error ?? `HTTP ${resp.status}`,
        );
      }
      const data: HealthMetrics = await resp.json();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [org, project, definitionId]);

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>Pipeline Health Scorecard</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Definition ID"
          value={definitionId}
          onChange={(e) => setDefinitionId(e.target.value)}
          style={inputStyle}
          type="number"
        />
        <button
          onClick={fetchHealth}
          disabled={loading || !org || !project || !definitionId}
          type="button"
          style={{
            padding: '8px 20px',
            background: '#0078d4',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Analyze'}
        </button>
      </div>
      {error && (
        <div style={{ color: '#d13438', marginBottom: 16 }}>{error}</div>
      )}
      {metrics && <HealthScorecard metrics={metrics} />}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 14,
  minWidth: 140,
};
