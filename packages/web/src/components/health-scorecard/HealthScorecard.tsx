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

function scoreColor(score: number): string {
  if (score >= 80) return '#107c10';
  if (score >= 60) return '#ff8c00';
  if (score >= 40) return '#d83b01';
  return '#d13438';
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 70;
  const stroke = 12;
  const center = 85;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * 0.75; // 270 degree arc
  const offset = arc - (score / 100) * arc;
  const color = scoreColor(score);

  return (
    <svg width={170} height={150} viewBox="0 0 170 150">
      {/* Background arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#e0e0e0"
        strokeWidth={stroke}
        strokeDasharray={`${arc} ${circumference}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(135 ${center} ${center})`}
      />
      {/* Score arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${arc} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(135 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {/* Score text */}
      <text
        x={center}
        y={center - 5}
        textAnchor="middle"
        fontSize="36"
        fontWeight="bold"
        fill={color}
      >
        {score}
      </text>
      <text
        x={center}
        y={center + 18}
        textAnchor="middle"
        fontSize="13"
        fill="#666"
      >
        / 100
      </text>
    </svg>
  );
}

function BreakdownCard({
  title,
  value,
  detail,
  color,
  barPercent,
}: {
  title: string;
  value: string;
  detail?: string;
  color: string;
  barPercent?: number;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: '14px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        minWidth: 120,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color }}>{value}</div>
      {detail && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {detail}
        </div>
      )}
      {barPercent !== undefined && (
        <div
          style={{
            marginTop: 6,
            height: 4,
            borderRadius: 2,
            background: '#e8e8e8',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, barPercent))}%`,
              background: color,
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}

function Sparkline({
  trend,
}: {
  trend: ('succeeded' | 'failed' | 'other')[];
}) {
  const dotSize = 8;
  const gap = 4;
  const width = trend.length * (dotSize + gap);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
        Recent builds (newest → oldest)
      </div>
      <svg width={width} height={dotSize + 4} viewBox={`0 0 ${width} ${dotSize + 4}`}>
        {trend.map((result, i) => (
          <circle
            key={`dot-${i}-${result}`}
            cx={i * (dotSize + gap) + dotSize / 2}
            cy={dotSize / 2 + 2}
            r={dotSize / 2}
            fill={
              result === 'succeeded'
                ? '#107c10'
                : result === 'failed'
                  ? '#d13438'
                  : '#888'
            }
          />
        ))}
      </svg>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function HealthScorecard({
  metrics,
}: {
  metrics: HealthMetrics;
}) {
  if (metrics.totalBuilds === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
        No completed builds found.
      </div>
    );
  }

  const cv =
    metrics.avgDurationSeconds > 0
      ? metrics.durationStdDev / metrics.avgDurationSeconds
      : 0;
  const consistencyPct = Math.round(Math.max(0, (1 - cv) * 100));

  return (
    <div>
      {/* Gauge */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <ScoreGauge score={metrics.score} />
        <div style={{ fontSize: 13, color: '#666' }}>
          Based on {metrics.totalBuilds} recent builds
        </div>
      </div>

      {/* Breakdown cards */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <BreakdownCard
          title="Success Rate"
          value={`${metrics.successRate}%`}
          color={scoreColor(metrics.successRate)}
          barPercent={metrics.successRate}
        />
        <BreakdownCard
          title="Avg Duration"
          value={formatDuration(metrics.avgDurationSeconds)}
          detail={`σ ${formatDuration(metrics.durationStdDev)}`}
          color="#0078d4"
        />
        <BreakdownCard
          title="Queue Wait"
          value={formatDuration(metrics.avgQueueWaitSeconds)}
          color={metrics.avgQueueWaitSeconds > 120 ? '#d83b01' : '#107c10'}
        />
        <BreakdownCard
          title="Failure Streak"
          value={`${metrics.longestFailureStreak}`}
          detail={
            metrics.currentFailureStreak > 0
              ? `${metrics.currentFailureStreak} current`
              : 'none active'
          }
          color={metrics.longestFailureStreak >= 3 ? '#d13438' : '#107c10'}
        />
        <BreakdownCard
          title="Consistency"
          value={`${consistencyPct}%`}
          color={consistencyPct >= 70 ? '#107c10' : '#d83b01'}
          barPercent={consistencyPct}
        />
      </div>

      {/* Sparkline */}
      {metrics.recentTrend.length > 0 && (
        <Sparkline trend={metrics.recentTrend} />
      )}
    </div>
  );
}
