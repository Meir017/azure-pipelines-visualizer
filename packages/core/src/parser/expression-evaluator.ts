/**
 * Azure Pipelines template expression evaluator.
 *
 * Evaluates expressions like:
 *   coalesce(parameters.featureFlags.obcanary, 'obcoretemplates')
 *   replace(replace(eq(parameters.x, true), true, 'canary'), false, 'stable')
 *
 * Supports:
 *   - Parameter access: parameters.a.b.c, parameters['name']
 *   - String literals: 'value'
 *   - Boolean literals: true, false
 *   - Number literals: 42, 3.14
 *   - Null literal: null
 *   - Built-in functions: coalesce, eq, ne, and, or, not, replace, in,
 *     startsWith, endsWith, contains, join, lower, upper, length, format,
 *     convertToJson, each, counter
 */

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenType =
  | 'IDENT'
  | 'STRING'
  | 'NUMBER'
  | 'BOOL'
  | 'NULL'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'DOT'
  | 'LBRACKET'
  | 'RBRACKET';

interface Token {
  type: TokenType;
  value: string;
}

// ---------------------------------------------------------------------------
// AST nodes
// ---------------------------------------------------------------------------

interface StringLiteralNode {
  kind: 'string';
  value: string;
}

interface NumberLiteralNode {
  kind: 'number';
  value: number;
}

interface BooleanLiteralNode {
  kind: 'boolean';
  value: boolean;
}

interface NullLiteralNode {
  kind: 'null';
}

interface ParameterAccessNode {
  kind: 'parameterAccess';
  path: string[];
}

interface VariableAccessNode {
  kind: 'variableAccess';
  path: string[];
}

interface FunctionCallNode {
  kind: 'functionCall';
  name: string;
  args: ASTNode[];
}

interface IdentifierNode {
  kind: 'identifier';
  name: string;
}

type ASTNode =
  | StringLiteralNode
  | NumberLiteralNode
  | BooleanLiteralNode
  | NullLiteralNode
  | ParameterAccessNode
  | VariableAccessNode
  | FunctionCallNode
  | IdentifierNode;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // String literal (single-quoted)
    if (input[i] === "'") {
      let str = '';
      i++; // skip opening quote
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Punctuation
    if (input[i] === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if (input[i] === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }
    if (input[i] === '.') {
      tokens.push({ type: 'DOT', value: '.' });
      i++;
      continue;
    }
    if (input[i] === '[') {
      tokens.push({ type: 'LBRACKET', value: '[' });
      i++;
      continue;
    }
    if (input[i] === ']') {
      tokens.push({ type: 'RBRACKET', value: ']' });
      i++;
      continue;
    }

    // Number
    if (/\d/.test(input[i]) || (input[i] === '-' && i + 1 < input.length && /\d/.test(input[i + 1]))) {
      let num = '';
      if (input[i] === '-') {
        num += '-';
        i++;
      }
      while (i < input.length && /[\d.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Identifier or keyword (true/false/null)
    if (/[a-zA-Z_]/.test(input[i])) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }

      if (ident === 'true' || ident === 'false') {
        tokens.push({ type: 'BOOL', value: ident });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: 'null' });
      } else {
        tokens.push({ type: 'IDENT', value: ident });
      }
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    const node = this.parseExpression();
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const tok = this.advance();
    if (!tok || tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok?.type ?? 'EOF'} (${tok?.value})`);
    }
    return tok;
  }

  private parseExpression(): ASTNode {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');

    switch (tok.type) {
      case 'STRING':
        this.advance();
        return { kind: 'string', value: tok.value };

      case 'NUMBER':
        this.advance();
        return { kind: 'number', value: Number(tok.value) };

      case 'BOOL':
        this.advance();
        return { kind: 'boolean', value: tok.value === 'true' };

      case 'NULL':
        this.advance();
        return { kind: 'null' };

      case 'IDENT':
        return this.parseIdentifierOrCall();

      default:
        throw new Error(`Unexpected token: ${tok.type} (${tok.value})`);
    }
  }

  private parseIdentifierOrCall(): ASTNode {
    const name = this.advance(); // consume IDENT

    // Check for function call: ident(...)
    if (this.peek()?.type === 'LPAREN') {
      this.advance(); // consume '('
      const args: ASTNode[] = [];

      if (this.peek()?.type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek()?.type === 'COMMA') {
          this.advance(); // consume ','
          args.push(this.parseExpression());
        }
      }

      this.expect('RPAREN');
      return { kind: 'functionCall', name: name.value, args };
    }

    // Check for dotted access: parameters.foo.bar or variables.x
    if (this.peek()?.type === 'DOT') {
      const parts: string[] = [name.value];
      while (this.peek()?.type === 'DOT') {
        this.advance(); // consume '.'
        const next = this.peek();
        if (next?.type === 'IDENT') {
          parts.push(this.advance().value);
        } else if (next?.type === 'BOOL') {
          // Handle edge case like parameters.true (unlikely but possible)
          parts.push(this.advance().value);
        } else {
          break;
        }
      }

      // Check for bracket access after dots: parameters.featureFlags['key']
      while (this.peek()?.type === 'LBRACKET') {
        this.advance(); // consume '['
        const key = this.expect('STRING');
        parts.push(key.value);
        this.expect('RBRACKET');
      }

      if (parts[0] === 'parameters') {
        return { kind: 'parameterAccess', path: parts.slice(1) };
      }
      if (parts[0] === 'variables') {
        return { kind: 'variableAccess', path: parts.slice(1) };
      }

      // Unknown dotted access — return as identifier with full path
      return { kind: 'identifier', name: parts.join('.') };
    }

    // Check for bracket access: parameters['key']
    if (this.peek()?.type === 'LBRACKET') {
      const parts: string[] = [name.value];
      while (this.peek()?.type === 'LBRACKET') {
        this.advance(); // consume '['
        const key = this.expect('STRING');
        parts.push(key.value);
        this.expect('RBRACKET');
      }

      if (parts[0] === 'parameters') {
        return { kind: 'parameterAccess', path: parts.slice(1) };
      }
      if (parts[0] === 'variables') {
        return { kind: 'variableAccess', path: parts.slice(1) };
      }

      return { kind: 'identifier', name: parts.join('.') };
    }

    // Plain identifier
    return { kind: 'identifier', name: name.value };
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface ExpressionContext {
  /** Template parameters (merged caller + file defaults) */
  parameters?: Record<string, unknown>;
  /** Pipeline variables */
  variables?: Record<string, unknown>;
}

/** Deeply access a nested property by path segments. */
function deepGet(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Convert a value to string for Azure Pipelines expression semantics. */
function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Convert to boolean for Azure Pipelines expression semantics. */
function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== '' && value.toLowerCase() !== 'false';
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  return true; // objects are truthy
}

/** Loose equality for Azure Pipelines (case-insensitive strings, bool coercion). */
function looseEqual(a: unknown, b: unknown): boolean {
  // Both null/undefined
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Boolean comparison — Azure Pipelines eq(false, 'false') is true
  if (typeof a === 'boolean' && typeof b === 'string') {
    return a === (b.toLowerCase() === 'true');
  }
  if (typeof b === 'boolean' && typeof a === 'string') {
    return b === (a.toLowerCase() === 'true');
  }

  // String comparison (case-insensitive)
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }

  return a === b;
}

// Built-in function implementations
const builtinFunctions: Record<string, (args: unknown[], ctx: ExpressionContext) => unknown> = {
  coalesce: (args) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined && arg !== '') return arg;
    }
    return null;
  },

  eq: (args) => looseEqual(args[0], args[1]),

  ne: (args) => !looseEqual(args[0], args[1]),

  and: (args) => args.every(toBool),

  or: (args) => args.some(toBool),

  not: (args) => !toBool(args[0]),

  gt: (args) => {
    const [a, b] = args;
    if (typeof a === 'number' && typeof b === 'number') return a > b;
    return toString(a) > toString(b);
  },

  ge: (args) => {
    const [a, b] = args;
    if (typeof a === 'number' && typeof b === 'number') return a >= b;
    return toString(a) >= toString(b);
  },

  lt: (args) => {
    const [a, b] = args;
    if (typeof a === 'number' && typeof b === 'number') return a < b;
    return toString(a) < toString(b);
  },

  le: (args) => {
    const [a, b] = args;
    if (typeof a === 'number' && typeof b === 'number') return a <= b;
    return toString(a) <= toString(b);
  },

  replace: (args) => {
    const str = toString(args[0]);
    const search = toString(args[1]);
    const replacement = toString(args[2]);
    return str.split(search).join(replacement);
  },

  in: (args) => {
    const value = args[0];
    const options = args.slice(1);
    return options.some((opt) => looseEqual(value, opt));
  },

  startswith: (args) => {
    return toString(args[0]).toLowerCase().startsWith(toString(args[1]).toLowerCase());
  },

  endswith: (args) => {
    return toString(args[0]).toLowerCase().endsWith(toString(args[1]).toLowerCase());
  },

  contains: (args) => {
    const haystack = args[0];
    const needle = toString(args[1]);
    if (Array.isArray(haystack)) {
      return haystack.some((item) => looseEqual(item, needle));
    }
    return toString(haystack).toLowerCase().includes(needle.toLowerCase());
  },

  join: (args) => {
    const separator = toString(args[0]);
    const items = args.slice(1);
    if (items.length === 1 && Array.isArray(items[0])) {
      return (items[0] as unknown[]).map(toString).join(separator);
    }
    return items.map(toString).join(separator);
  },

  lower: (args) => toString(args[0]).toLowerCase(),

  upper: (args) => toString(args[0]).toUpperCase(),

  length: (args) => {
    const val = args[0];
    if (typeof val === 'string') return val.length;
    if (Array.isArray(val)) return val.length;
    if (val && typeof val === 'object') return Object.keys(val).length;
    return 0;
  },

  format: (args) => {
    let fmt = toString(args[0]);
    for (let i = 1; i < args.length; i++) {
      fmt = fmt.split(`{${i - 1}}`).join(toString(args[i]));
    }
    return fmt;
  },

  converttojson: (args) => {
    const val = args[0];
    if (val === null || val === undefined) return 'null';
    return JSON.stringify(val);
  },

  counter: (args) => {
    return toString(args[0]);
  },
};

function evaluateNode(node: ASTNode, ctx: ExpressionContext): unknown {
  switch (node.kind) {
    case 'string':
      return node.value;
    case 'number':
      return node.value;
    case 'boolean':
      return node.value;
    case 'null':
      return null;

    case 'parameterAccess':
      return deepGet(ctx.parameters ?? {}, node.path);

    case 'variableAccess':
      return deepGet(ctx.variables ?? {}, node.path);

    case 'identifier':
      // Bare identifiers that aren't parameters/variables — return as-is
      return node.name;

    case 'functionCall': {
      const fn = builtinFunctions[node.name.toLowerCase()];
      if (!fn) {
        // Unknown function — evaluate args and return a string representation
        const evaluatedArgs = node.args.map((a) => evaluateNode(a, ctx));
        return `${node.name}(${evaluatedArgs.map(toString).join(', ')})`;
      }
      const evaluatedArgs = node.args.map((a) => evaluateNode(a, ctx));
      return fn(evaluatedArgs, ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single Azure Pipelines expression (without the `${{ }}` wrapper).
 *
 * @param expression - The expression string, e.g. `coalesce(parameters.x, 'fallback')`
 * @param context - Parameter and variable values
 * @returns The evaluated result
 */
export function evaluateExpression(expression: string, context: ExpressionContext = {}): unknown {
  const trimmed = expression.trim();
  if (!trimmed) return '';

  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return '';
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return evaluateNode(ast, context);
  } catch {
    // If parsing fails, return the original expression
    return expression;
  }
}

/**
 * Resolve all `${{ expression }}` placeholders in a string, evaluating each
 * using the provided context.
 *
 * @returns An object with the resolved string and metadata about what was resolved.
 */
export function resolveAllExpressions(
  input: string,
  context: ExpressionContext = {},
): {
  result: string;
  hadExpressions: boolean;
  isFullyResolved: boolean;
  substituted: string[];
  unresolved: string[];
} {
  const EXPR_RE = /\$\{\{\s*(.*?)\s*\}\}/g;
  const substituted: string[] = [];
  const unresolved: string[] = [];
  let hadExpressions = false;

  const result = input.replace(EXPR_RE, (_match, expr: string) => {
    hadExpressions = true;
    const value = evaluateExpression(expr, context);

    // Check if result still contains unresolved expressions
    const valueStr = toString(value);
    if (/\$\{\{/.test(valueStr) || value === expr || value === undefined) {
      unresolved.push(expr);
      return _match; // Keep original
    }

    substituted.push(expr);
    return valueStr;
  });

  return {
    result,
    hadExpressions,
    isFullyResolved: hadExpressions && unresolved.length === 0,
    substituted,
    unresolved,
  };
}
