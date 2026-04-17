import { useMemo, useState } from 'react';
import type { ProcessedRow, TimelineRecord } from './types.js';
import './ApprovalTimeline.css';

interface Props {
  records: TimelineRecord[];
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

function processRecords(records: TimelineRecord[]): {
  rows: ProcessedRow[];
  timelineStart: Date;
  timelineEnd: Date;
  totalWaitMs: number;
} {
  const stageMap = new Map<string, TimelineRecord>();
  const checkpointParents = new Map<string, string>();

  // Index stages and checkpoint containers
  for (const r of records) {
    if (r.type === 'Stage') {
      stageMap.set(r.id, r);
    }
    if (r.type === 'Checkpoint') {
      checkpointParents.set(r.id, r.parentId ?? '');
    }
  }

  // Find parent stage name for a record
  const findStageName = (parentId: string | null): string | null => {
    if (!parentId) return null;
    const stage = stageMap.get(parentId);
    if (stage) return stage.name;
    // Check if parent is a checkpoint whose parent is a stage
    const gpId = checkpointParents.get(parentId);
    if (gpId) {
      const gpStage = stageMap.get(gpId);
      if (gpStage) return gpStage.name;
    }
    return null;
  };

  const rows: ProcessedRow[] = [];
  let totalWaitMs = 0;

  // Add stages
  for (const r of records) {
    if (r.type === 'Stage') {
      const start = r.startTime ? new Date(r.startTime) : null;
      const finish = r.finishTime ? new Date(r.finishTime) : null;
      const execMs = start && finish ? finish.getTime() - start.getTime() : 0;

      rows.push({
        id: r.id,
        name: r.name,
        type: 'stage',
        state: r.state,
        result: r.result,
        startTime: start,
        finishTime: finish,
        waitDurationMs: 0,
        execDurationMs: execMs,
        parentStageName: null,
        raw: r,
      });
    }
  }

  // Add checkpoints (approvals & checks)
  for (const r of records) {
    if (r.type !== 'Checkpoint') continue;

    const start = r.startTime ? new Date(r.startTime) : null;
    const finish = r.finishTime ? new Date(r.finishTime) : null;
    const durationMs = start && finish ? finish.getTime() - start.getTime() : 0;

    const isApproval =
      r.name.toLowerCase().includes('approval') ||
      r.name.toLowerCase().includes('approve');
    const rowType = isApproval ? 'approval' : 'check';

    // For checkpoints, most time is "wait" time
    const waitMs = durationMs;
    totalWaitMs += waitMs;

    rows.push({
      id: r.id,
      name: r.name,
      type: rowType,
      state: r.state,
      result: r.result,
      startTime: start,
      finishTime: finish,
      waitDurationMs: waitMs,
      execDurationMs: 0,
      parentStageName: findStageName(r.parentId),
      raw: r,
    });
  }

  // Sort: stages first (by order), then checkpoints grouped under their stage
  rows.sort((a, b) => {
    if (a.type === 'stage' && b.type !== 'stage') return -1;
    if (a.type !== 'stage' && b.type === 'stage') return 1;
    const orderA = a.raw.order ?? 0;
    const orderB = b.raw.order ?? 0;
    return orderA - orderB;
  });

  // Compute timeline bounds
  const allTimes: number[] = [];
  for (const r of rows) {
    if (r.startTime) allTimes.push(r.startTime.getTime());
    if (r.finishTime) allTimes.push(r.finishTime.getTime());
  }
  const timelineStart = new Date(
    allTimes.length ? Math.min(...allTimes) : Date.now(),
  );
  const timelineEnd = new Date(
    allTimes.length ? Math.max(...allTimes) : Date.now(),
  );

  return { rows, timelineStart, timelineEnd, totalWaitMs };
}

export default function ApprovalTimeline({ records }: Props) {
  const { rows, timelineStart, timelineEnd, totalWaitMs } = useMemo(
    () => processRecords(records),
    [records],
  );
  const [selectedRow, setSelectedRow] = useState<ProcessedRow | null>(null);

  const totalSpanMs = timelineEnd.getTime() - timelineStart.getTime() || 1;

  const getBarStyle = (row: ProcessedRow) => {
    if (!row.startTime) return { left: '0%', width: '0%' };
    const startPct =
      ((row.startTime.getTime() - timelineStart.getTime()) / totalSpanMs) * 100;
    const endTime = row.finishTime ?? row.startTime;
    const widthPct = Math.max(
      ((endTime.getTime() - row.startTime.getTime()) / totalSpanMs) * 100,
      0.5,
    );
    return { left: `${startPct}%`, width: `${widthPct}%` };
  };

  const colorClass = (row: ProcessedRow) => {
    if (row.type === 'approval') return 'bar--approval';
    if (row.type === 'check') return 'bar--check';
    if (row.result === 'succeeded') return 'bar--success';
    if (row.result === 'failed') return 'bar--failed';
    if (row.result === 'canceled') return 'bar--canceled';
    return 'bar--stage';
  };

  const checkpointCount = rows.filter((r) => r.type !== 'stage').length;
  const stageCount = rows.filter((r) => r.type === 'stage').length;

  return (
    <div className="approval-timeline">
      <div className="approval-timeline__summary">
        <div className="approval-timeline__stat approval-timeline__stat--wait">
          <span className="approval-timeline__stat-label">Total Gate Wait</span>
          <span className="approval-timeline__stat-value">
            {formatDuration(totalWaitMs)}
          </span>
        </div>
        <div className="approval-timeline__stat">
          <span className="approval-timeline__stat-label">Stages</span>
          <span className="approval-timeline__stat-value">{stageCount}</span>
        </div>
        <div className="approval-timeline__stat">
          <span className="approval-timeline__stat-label">
            Approvals & Checks
          </span>
          <span className="approval-timeline__stat-value">
            {checkpointCount}
          </span>
        </div>
        <div className="approval-timeline__stat">
          <span className="approval-timeline__stat-label">Total Duration</span>
          <span className="approval-timeline__stat-value">
            {formatDuration(totalSpanMs)}
          </span>
        </div>
      </div>

      <div className="approval-timeline__legend">
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--stage" /> Stage
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--approval" /> Approval
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--check" /> Check
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--failed" /> Failed
        </span>
      </div>

      <div className="approval-timeline__chart">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`approval-timeline__row ${selectedRow?.id === row.id ? 'approval-timeline__row--selected' : ''}`}
            onClick={() => setSelectedRow(row === selectedRow ? null : row)}
            onKeyDown={() => {}}
          >
            <div className="approval-timeline__label">
              <span className={`type-badge type-badge--${row.type}`}>
                {row.type === 'stage'
                  ? '📦'
                  : row.type === 'approval'
                    ? '✅'
                    : '🔍'}
              </span>
              <span className="approval-timeline__name" title={row.name}>
                {row.name}
              </span>
              {row.parentStageName && (
                <span className="approval-timeline__parent">
                  ({row.parentStageName})
                </span>
              )}
            </div>
            <div className="approval-timeline__bar-track">
              <div
                className={`approval-timeline__bar ${colorClass(row)} ${row.type !== 'stage' ? 'bar--striped' : ''}`}
                style={getBarStyle(row)}
                title={`${row.name}: ${formatDuration(row.waitDurationMs || row.execDurationMs)}`}
              />
            </div>
            <div className="approval-timeline__duration">
              {formatDuration(row.waitDurationMs || row.execDurationMs)}
            </div>
          </div>
        ))}
      </div>

      {selectedRow && (
        <div className="approval-timeline__detail">
          <h3>{selectedRow.name}</h3>
          <table className="detail-table">
            <tbody>
              <tr>
                <td>Type</td>
                <td>{selectedRow.type}</td>
              </tr>
              <tr>
                <td>State</td>
                <td>{selectedRow.state}</td>
              </tr>
              <tr>
                <td>Result</td>
                <td>{selectedRow.result ?? '—'}</td>
              </tr>
              <tr>
                <td>Start</td>
                <td>{selectedRow.startTime?.toLocaleString() ?? '—'}</td>
              </tr>
              <tr>
                <td>Finish</td>
                <td>{selectedRow.finishTime?.toLocaleString() ?? '—'}</td>
              </tr>
              {selectedRow.type !== 'stage' && (
                <tr>
                  <td>Wait Duration</td>
                  <td>{formatDuration(selectedRow.waitDurationMs)}</td>
                </tr>
              )}
              {selectedRow.type === 'stage' && (
                <tr>
                  <td>Execution Duration</td>
                  <td>{formatDuration(selectedRow.execDurationMs)}</td>
                </tr>
              )}
              {selectedRow.parentStageName && (
                <tr>
                  <td>Parent Stage</td>
                  <td>{selectedRow.parentStageName}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
