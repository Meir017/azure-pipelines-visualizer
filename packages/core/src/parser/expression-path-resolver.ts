/**
 * Resolves `${{ parameters.xxx }}` expressions in template paths.
 *
 * When a template reference uses `${{ parameters.buildType }}` in its path,
 * we attempt to resolve it by looking up the value from:
 * 1. The parameters passed by the caller (parent)
 * 2. The parameter defaults declared in the file's own `parameters:` section
 *
 * If we can resolve all expressions, the path becomes a concrete file path.
 * If some expressions can't be resolved, the path stays partially dynamic.
 */

// Matches ${{ parameters.NAME }} or ${{ parameters['NAME'] }}
const PARAM_DOT_RE =
  /\$\{\{\s*parameters\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const PARAM_BRACKET_RE =
  /\$\{\{\s*parameters\['\s*([^']+)\s*'\]\s*\}\}/g;
// Matches any remaining ${{ ... }} expression
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
 * Resolve expressions in a template path using available parameter values.
 *
 * @param templatePath The raw template path possibly containing `${{ parameters.xxx }}`
 * @param callerParams Parameters passed by the parent (higher priority)
 * @param fileParamDefaults Parameter defaults declared in the file's `parameters:` section
 */
export function resolveExpressionPath(
  templatePath: string,
  callerParams?: Record<string, unknown>,
  fileParamDefaults?: Record<string, unknown>,
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

  const substituted: string[] = [];
  const unresolved: string[] = [];

  let result = templatePath;

  // Replace ${{ parameters.NAME }}
  result = result.replace(PARAM_DOT_RE, (match, name: string) => {
    if (name in merged) {
      substituted.push(name);
      return String(merged[name] ?? '');
    }
    unresolved.push(name);
    return match;
  });

  // Replace ${{ parameters['NAME'] }}
  result = result.replace(PARAM_BRACKET_RE, (match, name: string) => {
    if (name in merged) {
      substituted.push(name);
      return String(merged[name] ?? '');
    }
    unresolved.push(name);
    return match;
  });

  // Check for any remaining expressions (variables, functions, etc.)
  const remaining = result.match(ANY_EXPR_RE);
  if (remaining) {
    for (const expr of remaining) {
      // Don't duplicate parameter expressions already tracked by name
      const alreadyTracked = unresolved.some(u => expr.includes(`parameters.${u}`) || expr.includes(`parameters['${u}']`));
      if (!alreadyTracked) {
        unresolved.push(expr);
      }
    }
  }

  return {
    resolvedPath: result,
    isFullyResolved: !ANY_EXPR_RE.test(result),
    hadExpressions: true,
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
