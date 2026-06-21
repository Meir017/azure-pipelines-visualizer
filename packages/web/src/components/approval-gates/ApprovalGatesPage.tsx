import { useState } from 'react';
import { fetchBuildTimeline } from '../../services/api-client.js';
import ApprovalTimeline from './ApprovalTimeline.js';
import type { TimelineRecord } from './types.js';

export default function ApprovalGatesPage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [buildId, setBuildId] = useState('');
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const id = Number(buildId);
    if (!org.trim() || !project.trim() || !id) return;

    setLoading(true);
    setError(null);
    setRecords([]);

    try {
      const data = (await fetchBuildTimeline(
        org.trim(),
        project.trim(),
        id,
      )) as TimelineRecord[];
      setRecords(data);
      if (data.length === 0) {
        setError('No timeline records found for this build.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="approval-gates-page">
      <div className="approval-gates-selector">
        <input
          type="text"
          placeholder="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={handleKeyDown}
          className="approval-gates-selector__input"
        />
        <input
          type="text"
          placeholder="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={handleKeyDown}
          className="approval-gates-selector__input"
        />
        <input
          type="text"
          placeholder="Build ID"
          value={buildId}
          onChange={(e) => setBuildId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="approval-gates-selector__input approval-gates-selector__input--short"
        />
        <button
          className="approval-gates-selector__btn"
          onClick={handleSubmit}
          disabled={
            !org.trim() || !project.trim() || !buildId.trim() || loading
          }
          type="button"
        >
          {loading ? '⏳ Loading...' : 'Load Timeline'}
        </button>
      </div>
      {error && <div className="approval-gates-error">{error}</div>}
      {records.length > 0 && <ApprovalTimeline records={records} />}
    </div>
  );
}
