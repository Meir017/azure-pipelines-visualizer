import { useCallback, useState } from 'react';
import BuildTimelineGantt from './BuildTimelineGantt.js';

interface TimelineParams {
  org: string;
  project: string;
  buildId: string;
}

export default function BuildTimelinePage() {
  const [input, setInput] = useState('');
  const [params, setParams] = useState<TimelineParams | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    setError(null);

    // Try parsing as a full ADO build URL first
    // e.g. https://dev.azure.com/{org}/{project}/_build/results?buildId={id}
    try {
      const url = new URL(input.trim());
      const pathParts = url.pathname.split('/').filter(Boolean);
      const buildId = url.searchParams.get('buildId');
      if (pathParts.length >= 2 && buildId) {
        setParams({ org: pathParts[0], project: pathParts[1], buildId });
        return;
      }
    } catch {
      // not a URL — try org/project/buildId format
    }

    // Try org/project/buildId format
    const parts = input.trim().split('/');
    if (parts.length === 3 && parts.every((p) => p.length > 0)) {
      setParams({ org: parts[0], project: parts[1], buildId: parts[2] });
      return;
    }

    setError(
      'Enter a build URL (https://dev.azure.com/{org}/{project}/_build/results?buildId={id}) or org/project/buildId',
    );
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleLoad();
    },
    [handleLoad],
  );

  return (
    <div className="gantt-page">
      <div className="gantt-page__input-bar">
        <input
          className="gantt-page__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste build URL or enter org/project/buildId"
        />
        <button className="gantt-page__btn" onClick={handleLoad} type="button">
          Load Timeline
        </button>
      </div>
      {error && <div className="gantt-page__error">{error}</div>}
      {params && (
        <BuildTimelineGantt
          org={params.org}
          project={params.project}
          buildId={params.buildId}
        />
      )}
      {!params && !error && (
        <div className="gantt-page__placeholder">
          Enter a build URL or org/project/buildId to visualize the build
          timeline.
        </div>
      )}
    </div>
  );
}
