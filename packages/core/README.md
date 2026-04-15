# @meirblachman/azure-pipelines-visualizer-core

> **Internal package** — this is not published to npm and is consumed only within the monorepo.

Pure TypeScript library with zero runtime dependencies (aside from `js-yaml`). Provides the pipeline model, YAML parser, template detector, expression evaluator, and template resolver used by both the server and web packages.

## Key modules

| Module | Description |
|--------|-------------|
| `parser/expression-evaluator` | Full expression parser/evaluator for Azure Pipelines `${{ }}` syntax |
| `parser/template-detector` | Walks YAML AST to extract `template:` references |
| `parser/expression-path-resolver` | Resolves expressions in template paths |
| `model/pipeline` | Typed pipeline model |
| `resolver/template-resolver` | Recursive template resolution with cycle/depth checks |

## Constraints

This package must remain **pure** — no Node.js APIs, no network calls, no side effects. It is shared between the server (Node/Bun) and web (browser) packages.
