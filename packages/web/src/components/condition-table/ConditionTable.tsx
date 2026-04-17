import type { ExpressionContext } from '@meirblachman/azure-pipelines-visualizer-core';
import { useMemo, useState } from 'react';
import type { ExtractedCondition } from './condition-utils.js';
import { evaluateConditions } from './condition-utils.js';
import ExpressionTree from './ExpressionTree.js';

interface ConditionTableProps {
  conditions: ExtractedCondition[];
  context: ExpressionContext;
}

export default function ConditionTable({
  conditions,
  context,
}: ConditionTableProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const results = useMemo(
    () => evaluateConditions(conditions, context),
    [conditions, context],
  );

  if (conditions.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        No conditional expressions found in the YAML.
      </div>
    );
  }

  return (
    <div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '2px solid var(--border)',
              textAlign: 'left',
            }}
          >
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
              #
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
              Location
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
              Condition
            </th>
            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
              Variables / Parameters
            </th>
            <th
              style={{
                padding: '8px 12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr
              key={`${r.condition.expression}-${r.condition.line}`}
              onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background:
                  selectedIndex === i
                    ? 'rgba(137, 180, 250, 0.1)'
                    : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (selectedIndex !== i) {
                  e.currentTarget.style.background =
                    'rgba(137, 180, 250, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedIndex !== i) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <td
                style={{
                  padding: '8px 12px',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                {i + 1}
              </td>
              <td
                style={{
                  padding: '8px 12px',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {r.condition.location}
                <span style={{ opacity: 0.5, marginLeft: 4 }}>
                  L{r.condition.line}
                </span>
              </td>
              <td style={{ padding: '8px 12px' }}>
                <code
                  style={{
                    fontSize: 12,
                    background: 'var(--bg)',
                    padding: '2px 6px',
                    borderRadius: 3,
                    wordBreak: 'break-all',
                  }}
                >
                  {r.condition.expression}
                </code>
              </td>
              <td
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                {r.condition.referencedNames.length > 0
                  ? r.condition.referencedNames.map((name) => (
                      <span
                        key={name}
                        style={{
                          display: 'inline-block',
                          background: 'var(--bg)',
                          padding: '1px 6px',
                          borderRadius: 3,
                          marginRight: 4,
                          marginBottom: 2,
                          fontSize: 11,
                        }}
                      >
                        {name}
                      </span>
                    ))
                  : '—'}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                {r.error ? (
                  <span title={r.error} style={{ color: 'var(--error)' }}>
                    ⚠
                  </span>
                ) : r.result ? (
                  <span
                    style={{
                      color: 'var(--success)',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    style={{
                      color: 'var(--error)',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    ✗
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedIndex !== null && results[selectedIndex] && (
        <ExpressionTree
          expression={results[selectedIndex].condition.expression}
          context={context}
        />
      )}
    </div>
  );
}
