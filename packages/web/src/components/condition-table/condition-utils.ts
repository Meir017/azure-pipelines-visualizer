import {
  type ExpressionContext,
  evaluateExpression,
} from '@meirblachman/azure-pipelines-visualizer-core';

/** A condition extracted from YAML */
export interface ExtractedCondition {
  /** The raw expression text (without ${{ }}) */
  expression: string;
  /** Line number in the YAML source (1-based) */
  line: number;
  /** Location context (e.g. "stages[0]", "jobs[1].steps[2]") */
  location: string;
  /** Parameter and variable names referenced */
  referencedNames: string[];
}

/** Result of evaluating a condition */
export interface ConditionResult {
  condition: ExtractedCondition;
  result: boolean;
  error?: string;
}

/** Regex to match ${{ if <expr> }} directives in YAML keys */
const IF_DIRECTIVE_RE = /^\$\{\{\s*(?:if|elseif)\s+(.*?)\s*\}\}$/;

/** Regex to match standalone ${{ expr }} in values */
const EXPR_RE = /\$\{\{\s*(.*?)\s*\}\}/g;

/**
 * Extract all conditional expressions from raw YAML text.
 * Finds `${{ if ... }}` keys and conditions in template references.
 */
export function extractConditions(yaml: string): ExtractedCondition[] {
  const conditions: ExtractedCondition[] = [];
  const lines = yaml.split('\n');
  const seenExpressions = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match ${{ if expr }} or ${{ elseif expr }} as YAML keys
    // These appear as keys like: `${{ if eq(parameters.x, true) }}:`
    const keyMatch = trimmed.match(
      /^[-\s]*['"]*\$\{\{\s*(?:if|elseif)\s+(.*?)\s*\}\}['"]*\s*:/,
    );
    if (keyMatch) {
      const expr = keyMatch[1];
      if (!seenExpressions.has(expr)) {
        seenExpressions.add(expr);
        conditions.push({
          expression: expr,
          line: i + 1,
          location: guessLocation(lines, i),
          referencedNames: extractReferencedNames(expr),
        });
      }
      continue;
    }

    // Match condition fields: `condition: ${{ expr }}`
    const condFieldMatch = trimmed.match(
      /^condition\s*:\s*\$\{\{\s*(.*?)\s*\}\}/,
    );
    if (condFieldMatch) {
      const expr = condFieldMatch[1];
      if (!seenExpressions.has(expr)) {
        seenExpressions.add(expr);
        conditions.push({
          expression: expr,
          line: i + 1,
          location: guessLocation(lines, i),
          referencedNames: extractReferencedNames(expr),
        });
      }
    }
  }

  return conditions;
}

/** Extract parameter/variable names referenced in an expression */
export function extractReferencedNames(expr: string): string[] {
  const names: string[] = [];
  const paramRe = /(?:parameters|variables)\.(\w+(?:\.\w+)*)/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = paramRe.exec(expr)) !== null) {
    const full = match[0];
    if (!seen.has(full)) {
      seen.add(full);
      names.push(full);
    }
  }
  return names;
}

/** Guess a human-readable location from surrounding YAML lines */
function guessLocation(lines: string[], lineIndex: number): string {
  // Walk backwards to find the nearest section keyword
  for (let i = lineIndex - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    const sectionMatch = trimmed.match(
      /^(stages|jobs|steps|variables|extends|resources)\s*:/,
    );
    if (sectionMatch) {
      return sectionMatch[1];
    }
    // Check for named items like `- stage: Build`
    const namedMatch = trimmed.match(
      /^-\s*(stage|job|step|deployment)\s*:\s*(\S+)/,
    );
    if (namedMatch) {
      return `${namedMatch[1]}: ${namedMatch[2]}`;
    }
  }
  return `line ${lineIndex + 1}`;
}

/** Evaluate all conditions against the given context */
export function evaluateConditions(
  conditions: ExtractedCondition[],
  context: ExpressionContext,
): ConditionResult[] {
  return conditions.map((condition) => {
    try {
      const result = evaluateExpression(condition.expression, context);
      return {
        condition,
        result: toBool(result),
      };
    } catch (e) {
      return {
        condition,
        result: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/** Convert value to boolean (ADO semantics) */
function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string')
    return value !== '' && value.toLowerCase() !== 'false';
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  return true;
}
