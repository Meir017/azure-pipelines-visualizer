import { useCallback, useState } from 'react';
import type { TestResult, TestRun } from '../../services/api-client.js';
import {
  fetchTestRunResults,
  fetchTestRunsForBuild,
} from '../../services/api-client.js';
import TestResultsDashboard from './TestResultsDashboard.js';

export default function TestResultsPage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [buildId, setBuildId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [allResults, setAllResults] = useState<TestResult[]>([]);

  const handleLoad = useCallback(async () => {
    if (!org || !project || !buildId) return;
    setLoading(true);
    setError(null);
    setTestRuns([]);
    setAllResults([]);

    try {
      const runs = await fetchTestRunsForBuild(org, project, Number(buildId));
      setTestRuns(runs);

      if (runs.length === 0) {
        setError('No test runs found for this build.');
        setLoading(false);
        return;
      }

      const resultsArrays = await Promise.all(
        runs.map((run) => fetchTestRunResults(org, project, run.id)),
      );
      setAllResults(resultsArrays.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [org, project, buildId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLoad();
  };

  return (
    <div className="test-results-page">
      <div className="test-results-page__selector">
        <label>
          Org
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="my-org"
          />
        </label>
        <label>
          Project
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="my-project"
          />
        </label>
        <label>
          Build ID
          <input
            value={buildId}
            onChange={(e) => setBuildId(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="12345"
            type="number"
          />
        </label>
        <button
          onClick={handleLoad}
          disabled={loading || !org || !project || !buildId}
          type="button"
        >
          {loading ? 'Loading…' : 'Load Test Results'}
        </button>
      </div>

      {error && <div className="test-results-page__error">{error}</div>}

      {allResults.length > 0 && (
        <TestResultsDashboard testRuns={testRuns} results={allResults} />
      )}
    </div>
  );
}
