import {
  detectTemplateReferences,
  evaluateExpression,
  parseYaml,
  type TemplateReference,
} from '@meirblachman/azure-pipelines-visualizer-core';
import { useCallback, useMemo, useState } from 'react';
import ParameterForm, { type ParameterDefinition } from './ParameterForm.js';

const SAMPLE_YAML = `parameters:
  - name: environment
    type: string
    default: dev
    values:
      - dev
      - staging
      - prod
  - name: enableTests
    type: boolean
    default: true
  - name: buildConfig
    type: string
    default: Release
  - name: replicas
    type: number
    default: 2

extends:
  template: pipelines/\${{ parameters.environment }}-pipeline.yml
  parameters:
    config: \${{ parameters.buildConfig }}

stages:
  - template: stages/build.yml
    parameters:
      config: \${{ parameters.buildConfig }}
  - \${{ if eq(parameters.enableTests, true) }}:
    - template: stages/test.yml
      parameters:
        environment: \${{ parameters.environment }}
  - \${{ if eq(parameters.environment, 'prod') }}:
    - template: stages/approval.yml
  - template: stages/deploy-\${{ parameters.environment }}.yml
    parameters:
      replicas: \${{ parameters.replicas }}
`;

/** Extract parameter definitions from parsed YAML */
function extractParameters(
  parsed: Record<string, unknown>,
): ParameterDefinition[] {
  const params = parsed.parameters;
  if (!Array.isArray(params)) return [];

  return params
    .filter(
      (p): p is Record<string, unknown> =>
        p != null && typeof p === 'object' && 'name' in p,
    )
    .map((p) => ({
      name: p.name as string,
      type: (p.type as string) ?? 'string',
      default: p.default,
      values: Array.isArray(p.values) ? p.values.map(String) : undefined,
    }));
}

/** Build initial values from parameter definitions */
function buildDefaults(params: ParameterDefinition[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const p of params) {
    values[p.name] = p.default ?? '';
  }
  return values;
}

interface ChangeEntry {
  type: 'added' | 'removed' | 'path-changed';
  ref: TemplateReference;
  originalRef?: TemplateReference;
}

function computeChanges(
  defaultRefs: TemplateReference[],
  currentRefs: TemplateReference[],
): ChangeEntry[] {
  const changes: ChangeEntry[] = [];
  const defaultPaths = new Set(defaultRefs.map((r) => r.rawPath));
  const currentPaths = new Set(currentRefs.map((r) => r.rawPath));

  // Compare by normalized key (location + raw path)
  const key = (r: TemplateReference) => `${r.location}::${r.rawPath}`;
  const defaultKeys = new Map(defaultRefs.map((r) => [key(r), r]));
  const currentKeys = new Map(currentRefs.map((r) => [key(r), r]));

  for (const [k, ref] of currentKeys) {
    if (!defaultKeys.has(k)) {
      // Check if same location exists with different path
      const sameLoc = defaultRefs.find(
        (r) => r.location === ref.location && !currentPaths.has(r.rawPath),
      );
      if (sameLoc) {
        changes.push({ type: 'path-changed', ref, originalRef: sameLoc });
      } else {
        changes.push({ type: 'added', ref });
      }
    }
  }

  for (const [k, ref] of defaultKeys) {
    if (!currentKeys.has(k)) {
      const sameLoc = currentRefs.find(
        (r) => r.location === ref.location && !defaultPaths.has(r.rawPath),
      );
      if (!sameLoc) {
        changes.push({ type: 'removed', ref });
      }
    }
  }

  return changes;
}

/** Evaluate condition expressions to filter refs */
function filterByConditions(
  refs: TemplateReference[],
  paramValues: Record<string, unknown>,
): TemplateReference[] {
  return refs.filter((ref) => {
    if (!ref.conditional || !ref.conditionExpression) return true;
    try {
      const result = evaluateExpression(ref.conditionExpression, {
        parameters: paramValues,
      });
      return result === true || result === 'True' || result === 'true';
    } catch {
      return true; // keep if we can't evaluate
    }
  });
}

export default function ParameterExplorerPanel() {
  const [yamlInput, setYamlInput] = useState(SAMPLE_YAML);
  const [parseError, setParseError] = useState<string | null>(null);

  const { parsed, parameters } = useMemo(() => {
    try {
      const result = parseYaml(yamlInput) as Record<string, unknown>;
      if (!result || typeof result !== 'object') {
        setParseError('Invalid YAML');
        return { parsed: null, parameters: [] };
      }
      setParseError(null);
      return { parsed: result, parameters: extractParameters(result) };
    } catch (err) {
      setParseError(String(err));
      return { parsed: null, parameters: [] };
    }
  }, [yamlInput]);

  const defaults = useMemo(() => buildDefaults(parameters), [parameters]);
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Merged values: user overrides on top of defaults
  const mergedValues = useMemo(
    () => ({ ...defaults, ...values }),
    [defaults, values],
  );

  const handleParamChange = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setValues({});
  }, []);

  // Template refs with defaults vs current values
  const { defaultRefs, currentRefs, changes } = useMemo(() => {
    if (!parsed) return { defaultRefs: [], currentRefs: [], changes: [] };

    const allDefaultRefs = detectTemplateReferences(parsed);
    const allCurrentRefs = detectTemplateReferences(parsed);

    // Resolve expression paths in raw paths for comparison
    const resolveRawPaths = (
      refs: TemplateReference[],
      paramVals: Record<string, unknown>,
    ): TemplateReference[] =>
      refs.map((ref) => {
        let resolvedPath = ref.rawPath;
        const exprPattern = /\$\{\{\s*(.*?)\s*\}\}/g;
        resolvedPath = resolvedPath.replace(exprPattern, (_m, expr: string) => {
          try {
            const result = evaluateExpression(expr, {
              parameters: paramVals,
            });
            return result != null ? String(result) : _m;
          } catch {
            return _m;
          }
        });
        return { ...ref, rawPath: resolvedPath };
      });

    const resolvedDefaultRefs = filterByConditions(
      resolveRawPaths(allDefaultRefs, defaults),
      defaults,
    );
    const resolvedCurrentRefs = filterByConditions(
      resolveRawPaths(allCurrentRefs, mergedValues),
      mergedValues,
    );

    return {
      defaultRefs: resolvedDefaultRefs,
      currentRefs: resolvedCurrentRefs,
      changes: computeChanges(resolvedDefaultRefs, resolvedCurrentRefs),
    };
  }, [parsed, defaults, mergedValues]);

  const hasChanges = Object.keys(values).length > 0;

  return (
    <div className="param-explorer">
      <div className="param-explorer__editor">
        <h2 className="param-explorer__title">Pipeline YAML</h2>
        <textarea
          className="param-explorer__yaml"
          value={yamlInput}
          onChange={(e) => {
            setYamlInput(e.target.value);
            setValues({});
          }}
          spellCheck={false}
        />
        {parseError && (
          <div className="param-explorer__error">{parseError}</div>
        )}
      </div>

      <div className="param-explorer__panel">
        <div className="param-explorer__form">
          <div className="param-explorer__form-header">
            <h2 className="param-explorer__title">Parameters</h2>
            {hasChanges && (
              <button
                type="button"
                className="param-explorer__reset"
                onClick={handleReset}
              >
                Reset to defaults
              </button>
            )}
          </div>

          {parameters.length === 0 ? (
            <p className="param-explorer__empty">
              No parameters found. Add a <code>parameters:</code> block to your
              YAML.
            </p>
          ) : (
            parameters.map((p) => (
              <ParameterForm
                key={p.name}
                parameter={p}
                value={mergedValues[p.name]}
                onChange={handleParamChange}
              />
            ))
          )}
        </div>

        <div className="param-explorer__results">
          <h2 className="param-explorer__title">
            Template References
            <span className="param-explorer__count">{currentRefs.length}</span>
          </h2>

          <div className="param-explorer__ref-list">
            {currentRefs.map((ref, i) => (
              <div
                key={`${ref.location}-${ref.rawPath}-${i}`}
                className="param-explorer__ref"
              >
                <span className="param-explorer__ref-path">{ref.rawPath}</span>
                <span
                  className={`param-explorer__ref-loc param-explorer__ref-loc--${ref.location}`}
                >
                  {ref.location}
                </span>
                {ref.conditional && (
                  <span
                    className="param-explorer__ref-cond"
                    title={ref.conditionExpression}
                  >
                    conditional
                  </span>
                )}
              </div>
            ))}
          </div>

          {changes.length > 0 && (
            <div className="param-explorer__changes">
              <h3 className="param-explorer__subtitle">
                Changes from defaults
              </h3>
              {changes.map((c) => (
                <div
                  key={`change-${c.type}-${c.ref.location}-${c.ref.rawPath}`}
                  className={`param-explorer__change param-explorer__change--${c.type}`}
                >
                  <span className="param-explorer__change-icon">
                    {c.type === 'added'
                      ? '+'
                      : c.type === 'removed'
                        ? '−'
                        : '↔'}
                  </span>
                  <span className="param-explorer__change-text">
                    {c.type === 'path-changed' ? (
                      <>
                        <s>{c.originalRef?.rawPath}</s> → {c.ref.rawPath}
                      </>
                    ) : (
                      c.ref.rawPath
                    )}
                  </span>
                  <span className="param-explorer__change-loc">
                    {c.ref.location}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
