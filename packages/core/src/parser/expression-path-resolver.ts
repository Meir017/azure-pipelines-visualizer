/**
 * Resolves `${{ ... }}` expressions in template paths.
 *
 * When a template reference uses expressions like `${{ parameters.buildType }}`
 * or `${{ coalesce(parameters.featureFlags.obcanary, 'obcoretemplates') }}`,
 * we evaluate them using the full expression evaluator which supports Azure
 * Pipelines functions (coalesce, eq, replace, etc.) and nested parameter access.
 *
 * Parameter values come from:
 * 1. The parameters passed by the caller (parent) — higher priority
 * 2. The parameter defaults declared in the file's own `parameters:` section
 */

import { resolveAllExpressions, type ExpressionContext } from './expression-evaluator';

// Matches any ${{ ... }} expression
const ANY_EXPR_RE = /\$\{\{.*?\}\}/g;

export interface PathResolutionResult {
  /** The resolved path (with expressions substituted where possible). */
  resolvedPath: string;
  /** Whether the path was fully resolved (no remaining expressions). */
  isFullyResolved: boolean;
  /** Whether the original path contained any expressions at all. */
  hadExpressions: boolean;
  /** Expressions that were successfully substituted. */
  substituted: string[];
  /** Expressions that could not be resolved. */
  unresolved: string[];
}

/**
 * Check if a template path contains `${{ }}` expressions.
 */
export function pathHasExpressions(templatePath: string): boolean {
  return /\$\{\{.*?\}\}/.test(templatePath);
}

/**
 * Resolve expressions in a template path using available parameter and variable values.
 *
 * Supports simple parameter substitution (`${{ parameters.x }}`), variable
 * substitution (`${{ variables.buildType }}`), nested access
 * (`${{ parameters.featureFlags.obcanary }}`), and function calls
 * (`${{ coalesce(parameters.x, 'fallback') }}`).
 *
 * @param templatePath The raw template path possibly containing `${{ ... }}`
 * @param callerParams Parameters passed by the parent (higher priority)
 * @param fileParamDefaults Parameter defaults declared in the file's `parameters:` section
 * @param variables Pipeline variables (from the `variables:` section)
 */
export function resolveExpressionPath(
  templatePath: string,
  callerParams?: Record<string, unknown>,
  fileParamDefaults?: Record<string, unknown>,
  variables?: Record<string, unknown>,
): PathResolutionResult {
  if (!pathHasExpressions(templatePath)) {
    return {
      resolvedPath: templatePath,
      isFullyResolved: true,
      hadExpressions: false,
      substituted: [],
      unresolved: [],
    };
  }

  // Merge: caller params override file defaults
  const merged: Record<string, unknown> = {
    ...(fileParamDefaults ?? {}),
    ...(callerParams ?? {}),
  };

  const context: ExpressionContext = {
    parameters: merged,
    variables: variables,
  };
  const { result, hadExpressions, isFullyResolved, substituted, unresolved } =
    resolveAllExpressions(templatePath, context);

  return {
    resolvedPath: result,
    isFullyResolved: hadExpressions ? isFullyResolved : true,
    hadExpressions,
    substituted,
    unresolved,
  };
}

/**
 * Extract parameter default values from a parsed YAML file's `parameters:` section.
 *
 * Azure Pipelines parameters can be declared as:
 * ```yaml
 * parameters:
 *   - name: buildType
 *     type: string
 *     default: standard
 *   - name: enableTests
 *     type: boolean
 *     default: true
 * ```
 */
export function extractParameterDefaults(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const params = parsed.parameters;
  if (!Array.isArray(params)) return {};

  const defaults: Record<string, unknown> = {};
  for (const param of params) {
    if (
      param &&
      typeof param === 'object' &&
      'name' in param &&
      'default' in param
    ) {
      const p = param as { name: string; default: unknown };
      defaults[p.name] = p.default;
    }
  }
  return defaults;
}

/**
 * Extract declared parameter names from a parsed YAML file's `parameters:` section.
 */
export function extractDeclaredParameterNames(
  parsed: Record<string, unknown>,
): string[] {
  const params = parsed.parameters;
  if (!Array.isArray(params)) return [];

  return params
    .filter((p): p is { name: string } =>
      p != null && typeof p === 'object' && 'name' in p && typeof p.name === 'string',
    )
    .map((p) => p.name);
}

/**
 * Extract variable values from a parsed YAML file's `variables:` section.
 *
 * Azure Pipelines variables can be declared as:
 * ```yaml
 * # Array style (name/value pairs, groups, templates)
 * variables:
 *   - name: buildType
 *     value: standard
 *   - group: my-group
 *   - template: variables/common.yml
 *
 * # Object/mapping style
 * variables:
 *   buildType: standard
 *   region: eastus
 * ```
 *
 * Only concrete name/value pairs are extracted; groups and template references
 * are skipped since their values aren't statically known.
 */
export function extractVariableValues(
  parsed: Record<string, unknown>,
): Record<string, string> {
  const vars = parsed.variables;
  if (!vars) return {};

  // Array style: [{ name, value }, { group }, { template }]
  if (Array.isArray(vars)) {
    const result: Record<string, string> = {};
    for (const entry of vars) {
      if (
        entry &&
        typeof entry === 'object' &&
        'name' in entry &&
        'value' in entry
      ) {
        const v = entry as { name: string; value: unknown };
        result[v.name] = String(v.value);
      }
    }
    return result;
  }

  // Object/mapping style: { key: value }
  if (typeof vars === 'object') {
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(vars as Record<string, unknown>)) {
      result[name] = String(value);
    }
    return result;
  }

  return {};
}
