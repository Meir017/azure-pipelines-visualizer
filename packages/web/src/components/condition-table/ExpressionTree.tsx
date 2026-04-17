import {
  type ExpressionContext,
  evaluateExpression,
} from '@meirblachman/azure-pipelines-visualizer-core';
import { useMemo } from 'react';

interface ExpressionTreeProps {
  expression: string;
  context: ExpressionContext;
}

/** Simplified AST node for display */
interface DisplayNode {
  label: string;
  result: unknown;
  children: DisplayNode[];
}

/**
 * Parse an expression into a display tree.
 * This is a simplified parser that handles nested function calls.
 */
function parseToDisplayTree(
  expr: string,
  context: ExpressionContext,
): DisplayNode {
  const trimmed = expr.trim();

  // Function call: name(arg1, arg2, ...)
  const funcMatch = trimmed.match(/^(\w+)\s*\(/);
  if (funcMatch) {
    const name = funcMatch[1];
    // Find matching closing paren
    const argsStr = extractFunctionArgs(trimmed, funcMatch[0].length - 1);
    if (argsStr !== null) {
      const args = splitTopLevelArgs(argsStr);
      const children = args.map((arg) => parseToDisplayTree(arg, context));
      let result: unknown;
      try {
        result = evaluateExpression(trimmed, context);
      } catch {
        result = '?';
      }
      return { label: `${name}(...)`, result, children };
    }
  }

  // Leaf node (literal, parameter access, etc.)
  let result: unknown;
  try {
    result = evaluateExpression(trimmed, context);
  } catch {
    result = '?';
  }
  return { label: trimmed, result, children: [] };
}

/** Extract the content between the opening and closing parens */
function extractFunctionArgs(expr: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') {
      depth--;
      if (depth === 0) {
        return expr.substring(openIndex + 1, i);
      }
    }
  }
  return null;
}

/** Split arguments at top-level commas (not inside nested parens or strings) */
function splitTopLevelArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === "'" && !inString) {
      inString = true;
      current += ch;
    } else if (ch === "'" && inString) {
      inString = false;
      current += ch;
    } else if (inString) {
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function formatResult(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `'${value}'`;
  return String(value);
}

function resultColor(value: unknown): string {
  if (typeof value === 'boolean')
    return value ? 'var(--success)' : 'var(--error)';
  return 'var(--text-muted)';
}

function TreeNode({ node, depth }: { node: DisplayNode; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderRadius: 4,
          background: depth === 0 ? 'var(--surface)' : 'transparent',
          borderLeft: depth > 0 ? '2px solid var(--border)' : 'none',
          marginBottom: 2,
        }}
      >
        <code style={{ color: 'var(--text)', fontSize: 13 }}>{node.label}</code>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: resultColor(node.result),
            marginLeft: 'auto',
          }}
        >
          → {formatResult(node.result)}
        </span>
      </div>
      {node.children.map((child, i) => (
        <TreeNode key={`${child.label}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function ExpressionTree({
  expression,
  context,
}: ExpressionTreeProps) {
  const tree = useMemo(
    () => parseToDisplayTree(expression, context),
    [expression, context],
  );

  return (
    <div
      style={{
        padding: 12,
        background: 'var(--bg)',
        borderRadius: 6,
        border: '1px solid var(--border)',
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Expression Tree
      </div>
      <TreeNode node={tree} depth={0} />
    </div>
  );
}
