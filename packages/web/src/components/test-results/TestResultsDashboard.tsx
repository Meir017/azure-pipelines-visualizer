import { useMemo, useState } from 'react';
import type { TestResult, TestRun } from '../../services/api-client.js';

interface Props {
  testRuns: TestRun[];
  results: TestResult[];
}

interface OutcomeGroup {
  outcome: string;
  count: number;
  color: string;
}

interface NamespaceGroup {
  name: string;
  passed: number;
  failed: number;
  other: number;
  total: number;
}

const OUTCOME_COLORS: Record<string, string> = {
  Passed: '#2da44e',
  Failed: '#cf222e',
  NotExecuted: '#888',
  Skipped: '#888',
  Inconclusive: '#bf8700',
  Timeout: '#cf222e',
  Aborted: '#cf222e',
};

function getColor(outcome: string): string {
  return OUTCOME_COLORS[outcome] ?? '#666';
}

function DonutChart({
  groups,
  total,
}: {
  groups: OutcomeGroup[];
  total: number;
}) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 60;
  const stroke = 24;

  let offset = 0;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {groups.map((g) => {
        const pct = g.count / total;
        const dashLen = pct * circumference;
        const dashOffset = -offset * circumference;
        offset += pct;
        return (
          <circle
            key={g.outcome}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={g.color}
            strokeWidth={stroke}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize="22"
        fontWeight="bold"
      >
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#666">
        tests
      </text>
    </svg>
  );
}

function HorizontalBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="tr-bar">
      <span className="tr-bar__label" title={label}>
        {label.length > 50 ? `…${label.slice(-50)}` : label}
      </span>
      <div className="tr-bar__track">
        <div className="tr-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="tr-bar__value">{(value / 1000).toFixed(1)}s</span>
    </div>
  );
}

export default function TestResultsDashboard({ testRuns, results }: Props) {
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  const { outcomeGroups, total, passed, failed, skipped } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    }
    const groups: OutcomeGroup[] = Object.entries(counts)
      .map(([outcome, count]) => ({ outcome, count, color: getColor(outcome) }))
      .sort((a, b) => b.count - a.count);

    return {
      outcomeGroups: groups,
      total: results.length,
      passed: counts.Passed ?? 0,
      failed: counts.Failed ?? 0,
      skipped: (counts.NotExecuted ?? 0) + (counts.Skipped ?? 0),
    };
  }, [results]);

  const failedTests = useMemo(
    () => results.filter((r) => r.outcome === 'Failed'),
    [results],
  );

  const slowestTests = useMemo(
    () =>
      [...results]
        .filter((r) => r.durationInMs > 0)
        .sort((a, b) => b.durationInMs - a.durationInMs)
        .slice(0, 10),
    [results],
  );

  const namespaceGroups = useMemo(() => {
    const map = new Map<string, NamespaceGroup>();
    for (const r of results) {
      const ns = r.automatedTestStorage || '(unknown)';
      let g = map.get(ns);
      if (!g) {
        g = { name: ns, passed: 0, failed: 0, other: 0, total: 0 };
        map.set(ns, g);
      }
      g.total++;
      if (r.outcome === 'Passed') g.passed++;
      else if (r.outcome === 'Failed') g.failed++;
      else g.other++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [results]);

  const toggleExpand = (id: number) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maxDuration = slowestTests[0]?.durationInMs ?? 1;

  return (
    <div className="tr-dashboard">
      {/* Summary counters */}
      <div className="tr-summary">
        <div className="tr-summary__card">
          <span className="tr-summary__count">{total}</span>
          <span className="tr-summary__label">Total</span>
        </div>
        <div className="tr-summary__card tr-summary__card--passed">
          <span className="tr-summary__count">{passed}</span>
          <span className="tr-summary__label">Passed</span>
        </div>
        <div className="tr-summary__card tr-summary__card--failed">
          <span className="tr-summary__count">{failed}</span>
          <span className="tr-summary__label">Failed</span>
        </div>
        <div className="tr-summary__card tr-summary__card--skipped">
          <span className="tr-summary__count">{skipped}</span>
          <span className="tr-summary__label">Skipped</span>
        </div>
        <div className="tr-summary__card">
          <span className="tr-summary__count">{testRuns.length}</span>
          <span className="tr-summary__label">Test Runs</span>
        </div>
      </div>

      <div className="tr-grid">
        {/* Outcome donut */}
        <section className="tr-card">
          <h3>Outcome Distribution</h3>
          <div className="tr-card__donut">
            <DonutChart groups={outcomeGroups} total={total} />
            <ul className="tr-card__legend">
              {outcomeGroups.map((g) => (
                <li key={g.outcome}>
                  <span
                    className="tr-card__swatch"
                    style={{ background: g.color }}
                  />
                  {g.outcome}: {g.count} ({((g.count / total) * 100).toFixed(1)}
                  %)
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Top 10 slowest */}
        <section className="tr-card">
          <h3>Top 10 Slowest Tests</h3>
          <div className="tr-bars">
            {slowestTests.map((t) => (
              <HorizontalBar
                key={t.id}
                label={t.testCaseTitle}
                value={t.durationInMs}
                max={maxDuration}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Failed tests */}
      {failedTests.length > 0 && (
        <section className="tr-card tr-card--full">
          <h3>❌ Failed Tests ({failedTests.length})</h3>
          <div className="tr-failed-list">
            {failedTests.map((t) => (
              <div key={t.id} className="tr-failed-item">
                <button
                  className="tr-failed-item__header"
                  onClick={() => toggleExpand(t.id)}
                  type="button"
                >
                  <span className="tr-failed-item__name">
                    {t.testCaseTitle}
                  </span>
                  <span className="tr-failed-item__duration">
                    {(t.durationInMs / 1000).toFixed(2)}s
                  </span>
                  <span className="tr-failed-item__toggle">
                    {expandedTests.has(t.id) ? '▼' : '▶'}
                  </span>
                </button>
                {expandedTests.has(t.id) && (
                  <div className="tr-failed-item__detail">
                    {t.errorMessage && (
                      <div className="tr-failed-item__error">
                        <strong>Error:</strong>
                        <pre>{t.errorMessage}</pre>
                      </div>
                    )}
                    {t.stackTrace && (
                      <div className="tr-failed-item__stack">
                        <strong>Stack Trace:</strong>
                        <pre>{t.stackTrace}</pre>
                      </div>
                    )}
                    <div className="tr-failed-item__meta">
                      <span>Namespace: {t.automatedTestStorage}</span>
                      <span>Full name: {t.automatedTestName}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Namespace groups */}
      <section className="tr-card tr-card--full">
        <h3>Results by Namespace</h3>
        <table className="tr-namespace-table">
          <thead>
            <tr>
              <th>Namespace</th>
              <th>Total</th>
              <th>Passed</th>
              <th>Failed</th>
              <th>Other</th>
              <th>Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            {namespaceGroups.map((g) => (
              <tr key={g.name}>
                <td title={g.name}>
                  {g.name.length > 60 ? `…${g.name.slice(-60)}` : g.name}
                </td>
                <td>{g.total}</td>
                <td style={{ color: '#2da44e' }}>{g.passed}</td>
                <td style={{ color: g.failed > 0 ? '#cf222e' : undefined }}>
                  {g.failed}
                </td>
                <td>{g.other}</td>
                <td>
                  <div className="tr-pass-rate">
                    <div
                      className="tr-pass-rate__bar"
                      style={{
                        width: `${(g.passed / g.total) * 100}%`,
                        background: g.failed > 0 ? '#bf8700' : '#2da44e',
                      }}
                    />
                    <span>{((g.passed / g.total) * 100).toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
