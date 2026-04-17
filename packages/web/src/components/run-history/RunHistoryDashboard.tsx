import { useMemo, useState } from 'react';
import type { BuildInfo } from '../../services/api-client.js';

interface Props {
  builds: BuildInfo[];
}

interface TooltipData {
  x: number;
  y: number;
  build: BuildInfo;
}

function durationMinutes(b: BuildInfo): number | null {
  if (!b.startTime || !b.finishTime) return null;
  return (
    (new Date(b.finishTime).getTime() - new Date(b.startTime).getTime()) /
    60_000
  );
}

function resultColor(result: string | null): string {
  switch (result) {
    case 'succeeded':
      return 'var(--success)';
    case 'partiallySucceeded':
      return 'var(--badge-job)';
    case 'failed':
      return 'var(--error)';
    case 'canceled':
      return 'var(--text-muted)';
    default:
      return 'var(--border)';
  }
}

function shortBranch(ref: string): string {
  return ref.replace(/^refs\/heads\//, '');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Tooltip({ data }: { data: TooltipData }) {
  const dur = durationMinutes(data.build);
  return (
    <div className="rh-tooltip" style={{ left: data.x, top: data.y }}>
      <strong>#{data.build.buildNumber}</strong>
      <div>Result: {data.build.result ?? data.build.status}</div>
      <div>Branch: {shortBranch(data.build.sourceBranch)}</div>
      {data.build.startTime && (
        <div>Started: {formatDate(data.build.startTime)}</div>
      )}
      {dur != null && <div>Duration: {dur.toFixed(1)} min</div>}
      {data.build.requestedFor && (
        <div>By: {data.build.requestedFor.displayName}</div>
      )}
    </div>
  );
}

function SuccessRate({ builds }: { builds: BuildInfo[] }) {
  const completed = builds.filter((b) => b.result);
  const succeeded = completed.filter((b) => b.result === 'succeeded').length;
  const rate = completed.length ? (succeeded / completed.length) * 100 : 0;
  const color =
    rate >= 80
      ? 'var(--success)'
      : rate >= 50
        ? 'var(--badge-job)'
        : 'var(--error)';

  return (
    <div className="rh-stat-card">
      <div className="rh-stat-label">Success Rate</div>
      <div className="rh-stat-value" style={{ color }}>
        {rate.toFixed(0)}%
      </div>
      <div className="rh-stat-sub">
        {succeeded}/{completed.length} builds
      </div>
    </div>
  );
}

function AvgDuration({ builds }: { builds: BuildInfo[] }) {
  const durations = builds
    .map(durationMinutes)
    .filter((d): d is number => d != null);
  const avg = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return (
    <div className="rh-stat-card">
      <div className="rh-stat-label">Avg Duration</div>
      <div className="rh-stat-value">{avg.toFixed(1)}m</div>
      <div className="rh-stat-sub">{durations.length} builds with timing</div>
    </div>
  );
}

function TrendChart({ builds }: { builds: BuildInfo[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const sorted = useMemo(
    () => [...builds].sort((a, b) => a.queueTime.localeCompare(b.queueTime)),
    [builds],
  );

  const width = 600;
  const height = 60;
  const padding = 20;
  const dotR = 8;
  const usable = width - padding * 2;

  return (
    <div className="rh-chart-card">
      <h3>Build Trend</h3>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ display: 'block' }}
        >
          <line
            x1={padding}
            y1={height / 2}
            x2={width - padding}
            y2={height / 2}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {sorted.map((b, i) => {
            const x =
              sorted.length === 1
                ? width / 2
                : padding + (i / (sorted.length - 1)) * usable;
            return (
              <circle
                key={b.id}
                cx={x}
                cy={height / 2}
                r={dotR}
                fill={resultColor(b.result)}
                stroke="var(--surface)"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) =>
                  setTooltip({ x: e.clientX, y: e.clientY, build: b })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
        {tooltip && <Tooltip data={tooltip} />}
      </div>
    </div>
  );
}

function DurationChart({ builds }: { builds: BuildInfo[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const sorted = useMemo(
    () =>
      [...builds]
        .filter((b) => durationMinutes(b) != null)
        .sort((a, b) => a.queueTime.localeCompare(b.queueTime)),
    [builds],
  );

  const durations = sorted.map((b) => durationMinutes(b) as number);
  const maxDur = Math.max(...durations, 1);
  const width = 600;
  const height = 200;
  const padding = 40;
  const usableH = height - padding;
  const barWidth = sorted.length
    ? Math.min(20, (width - padding) / sorted.length - 2)
    : 20;

  return (
    <div className="rh-chart-card">
      <h3>Duration (minutes)</h3>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ display: 'block' }}
        >
          {/* Y axis labels */}
          {[0, 0.5, 1].map((f) => {
            const y = height - padding - f * usableH;
            const val = (f * maxDur).toFixed(0);
            return (
              <g key={f}>
                <line
                  x1={padding - 5}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  strokeDasharray="4"
                />
                <text
                  x={padding - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize={10}
                >
                  {val}
                </text>
              </g>
            );
          })}
          {sorted.map((b, i) => {
            const dur = durations[i];
            const barH = (dur / maxDur) * usableH;
            const x = padding + i * (barWidth + 2);
            const y = height - padding - barH;
            return (
              <rect
                key={b.id}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={2}
                fill={resultColor(b.result)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) =>
                  setTooltip({ x: e.clientX, y: e.clientY, build: b })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
        {tooltip && <Tooltip data={tooltip} />}
      </div>
    </div>
  );
}

function BranchBreakdown({ builds }: { builds: BuildInfo[] }) {
  const branchData = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of builds) {
      const branch = shortBranch(b.sourceBranch);
      map.set(branch, (map.get(branch) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [builds]);

  const maxCount = branchData.length ? branchData[0][1] : 1;
  const barHeight = 24;
  const labelWidth = 160;
  const width = 600;
  const chartWidth = width - labelWidth - 40;
  const height = branchData.length * (barHeight + 4) + 10;

  return (
    <div className="rh-chart-card">
      <h3>Branch Breakdown (top 10)</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: 'block' }}
      >
        {branchData.map(([branch, count], i) => {
          const y = i * (barHeight + 4) + 5;
          const barW = (count / maxCount) * chartWidth;
          return (
            <g key={branch}>
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fill="var(--text)"
                fontSize={11}
              >
                {branch.length > 22 ? `${branch.slice(0, 20)}…` : branch}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill="var(--accent)"
                opacity={0.8}
              />
              <text
                x={labelWidth + barW + 6}
                y={y + barHeight / 2 + 4}
                fill="var(--text-muted)"
                fontSize={11}
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function RunHistoryDashboard({ builds }: Props) {
  if (builds.length === 0) {
    return <div className="rh-empty">No builds found for this definition.</div>;
  }

  return (
    <div className="rh-dashboard">
      <div className="rh-stats-row">
        <SuccessRate builds={builds} />
        <AvgDuration builds={builds} />
        <div className="rh-stat-card">
          <div className="rh-stat-label">Total Builds</div>
          <div className="rh-stat-value">{builds.length}</div>
          <div className="rh-stat-sub">last {builds.length} runs</div>
        </div>
      </div>
      <TrendChart builds={builds} />
      <DurationChart builds={builds} />
      <BranchBreakdown builds={builds} />
    </div>
  );
}
