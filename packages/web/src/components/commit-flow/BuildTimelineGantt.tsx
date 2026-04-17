import { useCallback, useEffect, useMemo, useState } from 'react';

export interface TimelineRecord {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  state: string;
  result: string | null;
  startTime: string | null;
  finishTime: string | null;
  workerName: string | null;
  errorCount: number;
  warningCount: number;
  order: number;
  issues?: Array<{ type: string; message: string }>;
}

interface TreeNode {
  record: TimelineRecord;
  children: TreeNode[];
  depth: number;
}

const RESULT_COLORS: Record<string, string> = {
  succeeded: '#28a745',
  succeededWithIssues: '#dbab09',
  failed: '#d73a49',
  canceled: '#dbab09',
  skipped: '#6a737d',
  abandoned: '#6a737d',
};

const ROW_HEIGHT = 28;
const LABEL_WIDTH = 280;
const MIN_BAR_WIDTH = 4;

function getColor(record: TimelineRecord): string {
  if (record.state === 'pending' || record.state === 'inProgress') {
    return record.state === 'inProgress' ? '#58a6ff' : '#6a737d';
  }
  return RESULT_COLORS[record.result ?? ''] ?? '#6a737d';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function buildTree(records: TimelineRecord[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const r of records) {
    byId.set(r.id, { record: r, children: [], depth: 0 });
  }

  for (const node of byId.values()) {
    if (node.record.parentId && byId.has(node.record.parentId)) {
      byId.get(node.record.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      n.children.sort((a, b) => a.record.order - b.record.order);
      sortChildren(n.children, depth + 1);
    }
  };
  roots.sort((a, b) => a.record.order - b.record.order);
  sortChildren(roots, 0);

  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

interface Props {
  org: string;
  project: string;
  buildId: number;
}

export default function BuildTimelineGantt({ org, project, buildId }: Props) {
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TimelineRecord | null>(null);

  useEffect(() => {
    if (!org || !project || !buildId) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    fetch(
      `/api/${encodeURIComponent(org)}/${encodeURIComponent(project)}/builds/${encodeURIComponent(String(buildId))}/timeline`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: TimelineRecord[]) => {
        setRecords(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [org, project, buildId]);

  const tree = useMemo(() => buildTree(records), [records]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const { minTime, maxTime } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const n of flat) {
      if (n.record.startTime) {
        const t = new Date(n.record.startTime).getTime();
        if (t < min) min = t;
      }
      if (n.record.finishTime) {
        const t = new Date(n.record.finishTime).getTime();
        if (t > max) max = t;
      }
    }
    if (!Number.isFinite(min)) min = Date.now();
    if (!Number.isFinite(max)) max = min + 1000;
    return { minTime: min, maxTime: max };
  }, [flat]);

  const totalDuration = maxTime - minTime || 1;

  const handleBarClick = useCallback((record: TimelineRecord) => {
    setSelected((prev) => (prev?.id === record.id ? null : record));
  }, []);

  if (loading) {
    return <div className="gantt-loading">Loading timeline…</div>;
  }
  if (error) {
    return <div className="gantt-error">Error: {error}</div>;
  }
  if (flat.length === 0) {
    return <div className="gantt-empty">No timeline records found.</div>;
  }

  const tickCount = 6;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(minTime + (totalDuration * i) / tickCount);
  }

  const chartWidth = 600;
  const totalHeight = flat.length * ROW_HEIGHT + 30;

  return (
    <div className="gantt-container">
      <div
        className="gantt-chart"
        style={{ minWidth: LABEL_WIDTH + chartWidth + 16 }}
      >
        <div className="gantt-header" style={{ height: 30 }}>
          <div className="gantt-label-col" style={{ width: LABEL_WIDTH }}>
            Task
          </div>
          <div
            className="gantt-bar-col"
            style={{ width: chartWidth, position: 'relative' }}
          >
            {ticks.map((t) => {
              const left = ((t - minTime) / totalDuration) * chartWidth;
              return (
                <span key={t} className="gantt-tick" style={{ left }}>
                  {new Date(t).toLocaleTimeString()}
                </span>
              );
            })}
          </div>
        </div>
        <div className="gantt-body" style={{ height: totalHeight - 30 }}>
          {flat.map((node, i) => {
            const r = node.record;
            const startMs = r.startTime
              ? new Date(r.startTime).getTime()
              : null;
            const finishMs = r.finishTime
              ? new Date(r.finishTime).getTime()
              : null;

            let barLeft = 0;
            let barWidth = 0;
            if (startMs != null) {
              barLeft = ((startMs - minTime) / totalDuration) * chartWidth;
              const end = finishMs ?? Date.now();
              barWidth = Math.max(
                MIN_BAR_WIDTH,
                ((end - startMs) / totalDuration) * chartWidth,
              );
            }

            const color = getColor(r);
            const isSelected = selected?.id === r.id;
            const duration =
              startMs && finishMs ? formatDuration(finishMs - startMs) : '';

            return (
              <div
                key={r.id}
                className={`gantt-row ${isSelected ? 'gantt-row--selected' : ''}`}
                style={{ height: ROW_HEIGHT, top: i * ROW_HEIGHT }}
              >
                <div
                  className="gantt-label-col"
                  style={{
                    width: LABEL_WIDTH,
                    paddingLeft: 8 + node.depth * 16,
                  }}
                  title={r.name}
                >
                  <span
                    className={`gantt-type-badge gantt-type-badge--${r.type.toLowerCase()}`}
                  >
                    {r.type === 'Stage' ? '▶' : r.type === 'Job' ? '◆' : '•'}
                  </span>
                  <span className="gantt-label-text">{r.name}</span>
                </div>
                <div className="gantt-bar-col" style={{ width: chartWidth }}>
                  {startMs != null && (
                    <button
                      type="button"
                      className="gantt-bar"
                      style={{
                        left: barLeft,
                        width: barWidth,
                        background: color,
                      }}
                      onClick={() => handleBarClick(r)}
                      title={`${r.name} — ${duration}`}
                    >
                      {barWidth > 50 && (
                        <span className="gantt-bar-label">{duration}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="gantt-detail">
          <div className="gantt-detail__header">
            <h3>{selected.name}</h3>
            <button
              className="gantt-detail__close"
              onClick={() => setSelected(null)}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="gantt-detail__body">
            <div className="gantt-detail__row">
              <span className="gantt-detail__label">Type</span>
              <span>{selected.type}</span>
            </div>
            <div className="gantt-detail__row">
              <span className="gantt-detail__label">State</span>
              <span>{selected.state}</span>
            </div>
            <div className="gantt-detail__row">
              <span className="gantt-detail__label">Result</span>
              <span style={{ color: getColor(selected) }}>
                {selected.result ?? '—'}
              </span>
            </div>
            {selected.workerName && (
              <div className="gantt-detail__row">
                <span className="gantt-detail__label">Worker</span>
                <span>{selected.workerName}</span>
              </div>
            )}
            {selected.startTime && selected.finishTime && (
              <div className="gantt-detail__row">
                <span className="gantt-detail__label">Duration</span>
                <span>
                  {formatDuration(
                    new Date(selected.finishTime).getTime() -
                      new Date(selected.startTime).getTime(),
                  )}
                </span>
              </div>
            )}
            {selected.startTime && (
              <div className="gantt-detail__row">
                <span className="gantt-detail__label">Start</span>
                <span>{new Date(selected.startTime).toLocaleString()}</span>
              </div>
            )}
            {selected.finishTime && (
              <div className="gantt-detail__row">
                <span className="gantt-detail__label">Finish</span>
                <span>{new Date(selected.finishTime).toLocaleString()}</span>
              </div>
            )}
            {(selected.errorCount > 0 || selected.warningCount > 0) && (
              <div className="gantt-detail__row">
                <span className="gantt-detail__label">Issues</span>
                <span>
                  {selected.errorCount > 0 && (
                    <span className="gantt-detail__errors">
                      {selected.errorCount} error
                      {selected.errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {selected.errorCount > 0 && selected.warningCount > 0 && ', '}
                  {selected.warningCount > 0 && (
                    <span className="gantt-detail__warnings">
                      {selected.warningCount} warning
                      {selected.warningCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>
            )}
            {selected.issues && selected.issues.length > 0 && (
              <div className="gantt-detail__issues">
                <span className="gantt-detail__label">Messages</span>
                <ul>
                  {selected.issues.map((issue, idx) => (
                    <li
                      key={`${issue.type}-${idx}`}
                      className={`gantt-detail__issue gantt-detail__issue--${issue.type}`}
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
