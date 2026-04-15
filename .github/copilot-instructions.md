# Copilot Instructions

## Build & Test

```bash
bun install                   # install all workspace packages
bun run dev                   # start server (3001) + web (3000) in watch mode
bun test                      # run all tests (core + server)
bun test packages/core        # run only core tests
bun test packages/server      # run only server tests
bun test path/to/file.test.ts # run a single test file
bun run lint                  # lint with Biome
bun run lint:fix              # lint + auto-fix
```

The test runner is `bun:test` (not Jest/Vitest). Test files live next to source (`*.test.ts`) in `packages/server/src/` and under `packages/core/__tests__/`.

## Architecture

Bun monorepo with three packages:

- **`@meirblachman/azure-pipelines-visualizer-core`** — Pure TypeScript, zero runtime dependencies. Defines the `Pipeline` model, YAML parser, template detector, expression evaluator, and template resolver. Imported by both server and web.
- **`@meirblachman/azure-pipelines-visualizer-server`** — Hono HTTP server on port 3001. Proxies Azure DevOps REST API calls, maintains a disk cache (keyed by commit SHA) and in-memory TTL caches for repo metadata and ref resolution.
- **`@meirblachman/azure-pipelines-visualizer-web`** — React + Vite SPA on port 3000. Renders a ReactFlow diagram of the pipeline template tree. The Vite dev server proxies `/api` to the server.

### Data flow

1. User pastes an ADO pipeline URL → `PipelineSelector` parses it via `parseAdoUrl` and fetches the YAML.
2. `PipelineDiagram` parses YAML → `detectTemplateReferences` walks the AST to find all `template:` refs (including inside `${{ if }}` blocks).
3. Each template ref becomes a node. On expand, the node's YAML is fetched, parsed, and its nested refs added recursively.
4. Expression paths (`${{ parameters.X }}`, `${{ variables.X }}`) are resolved using accumulated context that flows down the tree — same pattern as parameters, variables, and resources.
5. Conditional `${{ if }}` expressions are evaluated against the accumulated parameter/variable context. Refs whose conditions evaluate to `false` are excluded from the graph entirely.

### Key files

- `packages/core/src/parser/expression-evaluator.ts` — Full expression parser/evaluator (tokenizer → AST → evaluator). Supports parameters, variables, and all Azure Pipelines built-in functions.
- `packages/core/src/parser/expression-path-resolver.ts` — Resolves `${{ }}` expressions in template paths using merged parameter + variable context.
- `packages/core/src/parser/template-detector.ts` — Walks raw YAML to extract `TemplateReference` objects from extends, stages, jobs, steps, and variables sections, including conditional blocks.
- `packages/web/src/components/PipelineDiagram.tsx` — Core diagram component. Manages node expansion, parameter/variable/resource context propagation, condition evaluation, and graph deduplication.
- `packages/server/src/services/repo-file-cache.ts` — Disk cache: resolves branch→commit SHA first, then checks cache by content hash.
- `packages/server/src/services/azure-devops.ts` — ADO REST API client with in-memory TTL caches.

## Conventions

- All packages use **ESM** with `.js` extensions in imports (TypeScript `moduleResolution: "bundler"`).
- Formatting: **Biome** — 2-space indent, single quotes, semicolons.
- The `@meirblachman/azure-pipelines-visualizer-core` package must remain **pure** — no Node.js APIs, no network calls, no side effects. It's shared between server and web (browser).
- `PipelineDiagram.tsx` stashes internal state on React Flow node data using underscore-prefixed keys (`_ref`, `_parentParamContext`, `_accumulatedResources`, `_accumulatedVariables`, `_conditionResult`, `_fallbackPath`). These are cast via `as unknown as Record<string, unknown>` since they're not part of `FileNodeData`.
- Configuration is in `apv.config.json` (validated by `apv.config.schema.json`).
- Cache keys in `azure-devops.ts` are lowercased for case-insensitive deduplication.
