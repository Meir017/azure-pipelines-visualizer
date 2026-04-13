/**
 * Substitutes `${{ parameters.NAME }}` expressions in YAML text.
 *
 * Azure Pipelines templates use `${{ }}` for compile-time expressions.
 * This module handles the simple (but most common) case: parameter references.
 *
 * Complex expressions (`${{ if }}`, `${{ each }}`, function calls) are left
 * as-is — the visualizer marks them but doesn't evaluate them.
 */

export interface SubstitutionContext {
  parameters?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface SubstitutionResult {
  /** The YAML text with parameter references replaced. */
  text: string;
  /** Expressions that were successfully substituted. */
  substituted: string[];
  /** Expressions that could not be resolved (unknown params, complex expressions). */
  unresolved: string[];
}

// Matches ${{ parameters.NAME }} or ${{ parameters['NAME'] }}
// Also handles whitespace variations: ${{parameters.NAME}}
const PARAM_DOT_RE = /\$\{\{\s*parameters\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const PARAM_BRACKET_RE = /\$\{\{\s*parameters\['\s*([^']+)\s*'\]\s*\}\}/g;

/**
 * Replace `${{ parameters.x }}` with the actual parameter value.
 * Returns the modified text plus lists of what was/wasn't resolved.
 */
export function substituteParameters(
  yaml: string,
  context: SubstitutionContext,
): SubstitutionResult {
  const params = context.parameters ?? {};
  const substituted: string[] = [];
  const unresolved: string[] = [];

  let result = yaml;

  // Replace ${{ parameters.NAME }}
  result = result.replace(PARAM_DOT_RE, (match, name: string) => {
    if (name in params) {
      substituted.push(match);
      return stringifyValue(params[name]);
    }
    unresolved.push(match);
    return match;
  });

  // Replace ${{ parameters['NAME'] }}
  result = result.replace(PARAM_BRACKET_RE, (match, name: string) => {
    if (name in params) {
      substituted.push(match);
      return stringifyValue(params[name]);
    }
    unresolved.push(match);
    return match;
  });

  return { text: result, substituted, unresolved };
}

/**
 * Scan YAML text for all `${{ }}` expressions and classify them.
 */
export function findExpressions(yaml: string): Expression[] {
  const ALL_EXPR_RE = /\$\{\{(.*?)\}\}/gs;
  const expressions: Expression[] = [];
  let match: RegExpExecArray | null;

  while ((match = ALL_EXPR_RE.exec(yaml)) !== null) {
    const inner = match[1].trim();
    const fullMatch = match[0];
    const offset = match.index;

    if (inner.startsWith('parameters.') || inner.startsWith("parameters['")) {
      expressions.push({ raw: fullMatch, type: 'parameter', inner, offset });
    } else if (
      inner.startsWith('variables.') ||
      inner.startsWith("variables['") ||
      inner.startsWith('variables[')
    ) {
      expressions.push({ raw: fullMatch, type: 'variable', inner, offset });
    } else if (
      inner.startsWith('if ') ||
      inner.startsWith('elseif ') ||
      inner === 'else'
    ) {
      expressions.push({ raw: fullMatch, type: 'conditional', inner, offset });
    } else if (inner.startsWith('each ')) {
      expressions.push({ raw: fullMatch, type: 'iterator', inner, offset });
    } else {
      expressions.push({ raw: fullMatch, type: 'expression', inner, offset });
    }
  }

  return expressions;
}

export interface Expression {
  /** The full `${{ ... }}` string. */
  raw: string;
  /** Classified type. */
  type: 'parameter' | 'variable' | 'conditional' | 'iterator' | 'expression';
  /** The inner content (trimmed). */
  inner: string;
  /** Character offset in the original string. */
  offset: number;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  // For objects/arrays, produce inline YAML-ish representation
  return JSON.stringify(value);
}
