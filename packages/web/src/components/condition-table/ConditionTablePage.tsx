import type { ExpressionContext } from '@meirblachman/azure-pipelines-visualizer-core';
import { useCallback, useMemo, useState } from 'react';
import ConditionTable from './ConditionTable.js';
import { extractConditions } from './condition-utils.js';
import OverridePanel from './OverridePanel.js';

const SAMPLE_YAML = `stages:
  - \${{ if eq(parameters.environment, 'production') }}:
    - stage: Deploy
      jobs:
        - \${{ if eq(parameters.runTests, true) }}:
          - job: Test
            steps:
              - script: echo "testing"
        - job: Release
          condition: \${{ and(succeeded(), ne(variables.skipRelease, 'true')) }}
          steps:
            - script: echo "releasing"
  - \${{ if ne(parameters.environment, 'production') }}:
    - stage: Validate
      jobs:
        - job: Lint
`;

export default function ConditionTablePage() {
  const [yaml, setYaml] = useState(SAMPLE_YAML);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const conditions = useMemo(() => extractConditions(yaml), [yaml]);

  const allReferencedNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of conditions) {
      for (const name of c.referencedNames) {
        names.add(name);
      }
    }
    return [...names].sort();
  }, [conditions]);

  const context: ExpressionContext = useMemo(() => {
    const parameters: Record<string, unknown> = {};
    const variables: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(overrides)) {
      if (!value) continue;
      // Parse boolean-like values
      const parsed =
        value.toLowerCase() === 'true'
          ? true
          : value.toLowerCase() === 'false'
            ? false
            : value;

      if (key.startsWith('parameters.')) {
        const path = key.replace('parameters.', '').split('.');
        setNestedValue(parameters, path, parsed);
      } else if (key.startsWith('variables.')) {
        const path = key.replace('variables.', '').split('.');
        setNestedValue(variables, path, parsed);
      }
    }

    return { parameters, variables };
  }, [overrides]);

  const handleYamlChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setYaml(e.target.value);
    },
    [],
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 16,
          color: 'var(--text)',
        }}
      >
        📊 Condition Truth Table
      </h2>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            Pipeline YAML
          </label>
          <textarea
            value={yaml}
            onChange={handleYamlChange}
            spellCheck={false}
            style={{
              width: '100%',
              height: 300,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: 6,
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            {conditions.length} condition
            {conditions.length !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>

      <OverridePanel
        referencedNames={allReferencedNames}
        overrides={overrides}
        onChange={setOverrides}
      />

      <ConditionTable conditions={conditions} context={context} />
    </div>
  );
}

/** Set a deeply nested value in an object */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!(path[i] in current) || typeof current[path[i]] !== 'object') {
      current[path[i]] = {};
    }
    current = current[path[i]] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}
