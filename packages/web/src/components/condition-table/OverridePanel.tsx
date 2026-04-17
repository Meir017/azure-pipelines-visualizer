import { useCallback } from 'react';

interface OverridePanelProps {
  /** All referenced variable/parameter names across conditions */
  referencedNames: string[];
  /** Current override values */
  overrides: Record<string, string>;
  /** Callback when user changes an override value */
  onChange: (overrides: Record<string, string>) => void;
}

export default function OverridePanel({
  referencedNames,
  overrides,
  onChange,
}: OverridePanelProps) {
  const handleChange = useCallback(
    (name: string, value: string) => {
      onChange({ ...overrides, [name]: value });
    },
    [overrides, onChange],
  );

  const handleClear = useCallback(() => {
    onChange({});
  }, [onChange]);

  if (referencedNames.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        padding: 16,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0,
          }}
        >
          🎛️ Variable &amp; Parameter Overrides
        </h3>
        {Object.keys(overrides).length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) 1fr',
          gap: '6px 12px',
          alignItems: 'center',
        }}
      >
        {referencedNames.map((name) => (
          <label
            key={name}
            style={{
              display: 'contents',
              fontSize: 12,
            }}
          >
            <code
              style={{
                color: 'var(--accent)',
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </code>
            <input
              type="text"
              value={overrides[name] ?? ''}
              onChange={(e) => handleChange(name, e.target.value)}
              placeholder="(default)"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                width: '100%',
                outline: 'none',
              }}
            />
          </label>
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 8,
        }}
      >
        Set values to see conditions re-evaluate in real-time. Use{' '}
        <code>true</code>/<code>false</code> for booleans.
      </div>
    </div>
  );
}
