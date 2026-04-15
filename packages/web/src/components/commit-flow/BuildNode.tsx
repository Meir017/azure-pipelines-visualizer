import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

export interface BuildNodeData {
  buildId: number;
  pipelineName: string;
  buildNumber: string;
  status: string;
  result: string | null;
  startTime: string | null;
  finishTime: string | null;
  sourceBranch: string;
  webUrl: string | null;
  isRoot: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function statusIcon(status: string, result: string | null): string {
  if (status === 'inProgress') return '⏳';
  if (status === 'notStarted') return '⏸️';
  if (result === 'succeeded') return '✅';
  if (result === 'partiallySucceeded') return '⚠️';
  if (result === 'failed') return '❌';
  if (result === 'canceled') return '🚫';
  return '❓';
}

function resultClass(status: string, result: string | null): string {
  if (status === 'inProgress') return 'build-node--in-progress';
  if (result === 'succeeded') return 'build-node--succeeded';
  if (result === 'partiallySucceeded') return 'build-node--partial';
  if (result === 'failed') return 'build-node--failed';
  if (result === 'canceled') return 'build-node--canceled';
  return '';
}

function BuildNode({ data }: NodeProps) {
  const d = data as unknown as BuildNodeData;
  const duration = formatDuration(d.startTime, d.finishTime);

  return (
    <div className={`build-node ${resultClass(d.status, d.result)}`}>
      {!d.isRoot && <Handle type="target" position={Position.Left} />}

      <div className="build-node__header">
        <span className="build-node__status">
          {statusIcon(d.status, d.result)}
        </span>
        <span className="build-node__name" title={d.pipelineName}>
          {d.pipelineName}
        </span>
      </div>

      <div className="build-node__number">#{d.buildNumber}</div>

      <div className="build-node__times">
        <span title="Start time">🕐 {formatTime(d.startTime)}</span>
        {duration && <span title="Duration">⏱️ {duration}</span>}
      </div>

      <div className="build-node__branch" title={d.sourceBranch}>
        🌿 {d.sourceBranch.replace('refs/heads/', '')}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(BuildNode);
