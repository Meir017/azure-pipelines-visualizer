# Azure Pipelines Visualizer — Implementation Plan

## Problem

Azure DevOps pipeline YAML files reference templates and other pipelines across files and repositories (`template:`, `extends:`, `@repoAlias`). Understanding the fully-resolved pipeline is extremely difficult. We need an interactive visualizer that recursively fetches and renders the full pipeline tree, with expand/collapse for each template reference.

## Key Architectural Decisions

- **Web app now**, but the core logic (YAML parsing, template resolution, tree model) must be extractable into an **Azure DevOps extension** later — particularly to enhance the **PR page** showing what a pipeline change actually does.
- **Auth**: `@azure/identity` with `DefaultAzureCredential` (supports `az login`, managed identity, etc.). No PAT management.
- **Monorepo** with Bun workspaces so the core can be shared between the web app and a future extension.
- **Runtime**: Bun for package management, running the server, and building. TypeScript everywhere with no separate compile step for the server.
- **Custom recursive tree component** (not a library like react-arborist) for full control and portability to the ADO extension iframe.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (React SPA)            │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  Pipeline    │  │   Tree Visualization     │  │
│  │  Selector    │  │   (recursive expand/     │  │
│  │  (org/proj/  │  │    collapse with syntax  │  │
│  │   pipeline)  │  │    highlighted YAML)     │  │
│  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                      │                  │
│         └──────────┬───────────┘                  │
│                    │ REST calls                   │
└────────────────────┼──────────────────────────────┘
                     │
┌────────────────────┼──────────────────────────────┐
│  Backend API       │  (Bun + Hono + TypeScript)    │
│  ┌─────────────────▼────────────────────────────┐ │
│  │  /api/pipelines       — list pipelines       │ │
│  │  /api/pipeline/:id    — get pipeline YAML    │ │
│  │  /api/file            — get file from repo   │ │
│  │  /api/repos           — list repositories    │ │
│  └─────────────────┬────────────────────────────┘ │
│                    │ @azure/identity               │
│                    │ (DefaultAzureCredential)      │
└────────────────────┼──────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │  Azure DevOps       │
          │  REST API           │
          │  (Git, Pipelines)   │
          └─────────────────────┘
```

## Monorepo Structure

```
azure-pipelines-visualizer/
├── package.json                  # Root Bun workspace config
├── biome.json                    # Biome lint + format config
├── tsconfig.base.json            # Shared TS config
├── packages/
│   ├── core/                     # Pure pipeline model + YAML parsing (ZERO side effects)
│   │   ├── src/
│   │   │   ├── model/
│   │   │   │   ├── pipeline.ts       # Pipeline, Stage, Job, Step value objects
│   │   │   │   ├── template-ref.ts   # TemplateReference (path, alias, params, location)
│   │   │   │   ├── resources.ts      # ResourceRepository, ResourcePipeline
│   │   │   │   └── index.ts          # Barrel export
│   │   │   ├── parser/
│   │   │   │   ├── yaml-parser.ts    # YAML string → raw parsed object (js-yaml)
│   │   │   │   ├── pipeline-parser.ts  # Raw object → Pipeline model
│   │   │   │   ├── template-detector.ts  # Walk model, extract TemplateReferences
│   │   │   │   └── index.ts
│   │   │   ├── resolver/
│   │   │   │   ├── types.ts          # IFileProvider interface
│   │   │   │   ├── template-resolver.ts  # Resolve refs via IFileProvider, cycle detection
│   │   │   │   └── index.ts
│   │   │   └── index.ts              # Public API
│   │   ├── __tests__/
│   │   │   ├── model/                # Model construction tests
│   │   │   ├── parser/               # YAML→model, template detection tests
│   │   │   ├── resolver/             # Resolver tests with InMemoryFileProvider
│   │   │   └── fixtures/             # 9 sample YAML pipeline files
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/                   # Hono backend (runs on Bun)
│   │   ├── src/
│   │   │   ├── index.ts          # Hono app entry (Bun.serve)
│   │   │   ├── routes/
│   │   │   │   ├── pipelines.ts  # Pipeline listing/fetching
│   │   │   │   └── files.ts      # File content fetching
│   │   │   ├── services/
│   │   │   │   └── azure-devops.ts  # ADO REST API client (implements IFileProvider)
│   │   │   └── auth.ts           # @azure/identity setup
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                      # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── PipelineSelector.tsx
│       │   │   ├── PipelineTree.tsx       # Main tree container
│       │   │   ├── TreeNode.tsx           # Recursive node component
│       │   │   ├── TemplateExpander.tsx   # Lazy-load template content
│       │   │   └── YamlBlock.tsx          # Syntax-highlighted YAML
│       │   ├── hooks/
│       │   │   ├── usePipeline.ts         # Fetch pipeline data
│       │   │   └── useTemplateExpansion.ts  # Manage expansion state + caching
│       │   ├── services/
│       │   │   └── api-client.ts          # Calls backend API
│       │   ├── store/
│       │   │   └── pipeline-store.ts      # Zustand store
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
```

## Testability Design

The core principle: **the pipeline model and all parsing logic live in `packages/core` with zero I/O dependencies**. Everything is testable with plain `bun test` — no mocking HTTP, no Azure credentials, no DOM.

### Dependency Inversion — `IFileProvider`

The key abstraction is `IFileProvider`:
```typescript
interface IFileProvider {
  getFileContent(repo: string, path: string, ref?: string): Promise<string>;
}
```

- **In tests**: `InMemoryFileProvider` (a `Map<string, string>` of path→YAML)
- **In server**: `AzureDevOpsFileProvider` (ADO REST API + @azure/identity)
- **In future extension**: `ExtensionFileProvider` (ADO Extension SDK)

### What Gets Tested Where

| Package | What's Tested | How |
|---------|--------------|-----|
| `core/model` | Pipeline/Stage/Job/Step construction, template ref parsing, path normalization | Pure unit tests — construct objects, assert properties |
| `core/parser` | YAML string → Pipeline model mapping, all edge cases | Feed YAML fixture strings, assert model structure |
| `core/parser/template-detector` | All 7 reference types detected correctly | Feed parsed models, assert TemplateReference[] output |
| `core/resolver` | Recursive resolution, cycle detection, depth limiting, cross-repo alias resolution | `InMemoryFileProvider` with fixture data |
| `server/services` | ADO API client correctness | Mock `fetch` — verify URLs, headers, response mapping |
| `web` | Component rendering, expand/collapse behavior | React Testing Library (future) |

## Real-World Patterns (from configen repo analysis)

Based on analysis of `Wcd.Infra.ConfigurationGeneration` pipelines (ADO repo), these are the patterns the parser handles:

### 1. Conditional Template References
Template includes inside `${{ if }}` expression blocks:
```yaml
- ${{ if eq(parameters.enablePSSA, true) }}:
  - template: templates/pssa-steps-template.yml@self
```
Parser walks into conditional expression blocks and marks refs as `conditional: true`.

### 2. Templates Inside `extends.parameters`
Templates referenced inside `parameters.stages` passed to an `extends` block:
```yaml
extends:
  template: v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates
  parameters:
    stages:
      - stage: build
        jobs:
          - template: .pipelines/build-template.yml@self
```
Parser recursively walks `extends.parameters` to find nested template refs.

### 3. Inconsistent Path Formats
All normalized to canonical form:
- `.pipelines/build-template.yml@self` → `build-template.yml`
- `./validation-stage-template.yml@self` → `validation-stage-template.yml`
- `templates/pssa-steps-template.yml@self` → `templates/pssa-steps-template.yml`

### 4. Same Template Reused with Different Parameters
`validation-job-template.yml` called 5× with different params. Each instance tracked separately.

### 5. External Template Paths
External repos resolved via `resources.repositories` alias mapping:
```yaml
template: helm-ev2/sharedEv2-build-steps.yaml@templates
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Bun | Fast runtime, native TS, built-in test runner, workspace support |
| Frontend | React 18 + TypeScript | Best ecosystem for tree UIs, strong typing |
| Build | Vite 5 (via Bun) | Fast HMR, modern, tree-shaking |
| State | Zustand | Lightweight, no boilerplate |
| YAML parsing | js-yaml | Battle-tested, preserves structure |
| Syntax highlight | highlight.js | Lightweight, good YAML support |
| Backend | Hono + TypeScript | Lightweight, Bun-native, edge-compatible |
| Auth | @azure/identity | DefaultAzureCredential (az login, MI, etc.) |
| Lint + Format | Biome | Single binary, replaces ESLint + Prettier |
| Monorepo | Bun workspaces | Fast installs, native TS resolution |
| Testing | bun:test | Built-in, fast, Jest-compatible |

## Azure DevOps REST API Endpoints Needed

| Purpose | Endpoint |
|---------|----------|
| List pipelines | `GET /{org}/{project}/_apis/pipelines` |
| Get pipeline definition | `GET /{org}/{project}/_apis/build/definitions/{id}` |
| List repositories | `GET /{org}/{project}/_apis/git/repositories` |
| Get file content | `GET /{org}/{project}/_apis/git/repositories/{repoId}/items?scopePath={path}` |
| Get file at branch/commit | Same + `&versionDescriptor.version={branch}` |

## Implementation Progress

### Phase 1: Foundation — ✅ COMPLETE
| # | Task | Status |
|---|------|--------|
| 1 | **project-scaffolding** — Bun workspaces monorepo, biome.json, tsconfig | ✅ Done |
| 2 | **core-types** — Pipeline, Stage, Job, Step, TemplateReference, ExtendsBlock types | ✅ Done |
| 3 | **core-test-fixtures** — 9 YAML fixture files covering all patterns | ✅ Done |
| 4 | **core-yaml-parser** — Two-stage YAML→model parser with path normalization | ✅ Done |
| 5 | **core-template-detector** — Detects all 7 ref types including conditionals and extends.parameters | ✅ Done |
| 6 | **core-resolver** — Recursive template resolution via IFileProvider, cycle detection, depth limiting | ✅ Done |
| 7 | **core-mock-provider** — InMemoryFileProvider for isolated resolver tests | ✅ Done |

**44 tests passing across 6 test files (141 assertions)**

### Phase 2: Backend — ✅ COMPLETE
| # | Task | Status |
|---|------|--------|
| 8 | **server-auth** — Hono + @azure/identity DefaultAzureCredential | ✅ Done |
| 9 | **server-ado-client** — AzureDevOpsFileProvider implementing IFileProvider | ✅ Done |
| 10 | **server-api-routes** — Hono REST endpoints for pipelines, files, repos | ✅ Done |

### Phase 3: Frontend — ✅ COMPLETE
| # | Task | Status |
|---|------|--------|
| 11 | **web-scaffold** — Vite + React + Zustand app shell | ✅ Done |
| 12 | **web-pipeline-selector** — Org/project input → pipeline list | ✅ Done |
| 13 | **web-tree-visualization** — Recursive TreeNode component | ✅ Done |
| 14 | **web-yaml-highlighting** — highlight.js YAML rendering | ✅ Done |
| 15 | **web-template-expansion** — Lazy expand template refs via API | ✅ Done |

### Phase 4: Polish & Integration — ✅ COMPLETE
| # | Task | Status |
|---|------|--------|
| 16 | **e2e-integration** — Frontend ↔ backend ↔ ADO API wired end-to-end | ✅ Done |
| 17 | **template-caching** — In-memory + localStorage caching (100 entry cap) | ✅ Done |
| 18 | **error-handling** — Auth errors, ADO status forwarding, ErrorBoundary | ✅ Done |
| 19 | **cross-repo-resolution** — @alias resolved via resources.repositories | ✅ Done |

**All 19 tasks complete. 44 tests passing. Web build: 77KB gzipped.**

### Future: Azure DevOps Extension
- Extract `packages/core` + `packages/web` components into an ADO extension
- Use `azure-devops-extension-sdk` for auth (no backend needed in extension context)
- Inject into PR diff page to show "before vs after" pipeline expansion
- Use ADO extension data service for caching

## How to Run

```bash
# Install dependencies
bun install

# Run tests
bun test --recursive

# Start the server (port 3001)
bun run dev:server

# Start the frontend dev server (port 3000, proxies /api to :3001)
bun run dev:web
```

**Prerequisites**: `az login` for Azure DevOps authentication.

## Notes
- The core package has **zero** Azure DevOps dependencies — it only parses YAML and builds trees. This makes it testable and reusable.
- The server is a thin proxy — it handles auth and forwards to ADO REST APIs. In the extension context, this layer is replaced by the ADO SDK.
- Template expansion is **lazy** — only fetched when the user clicks to expand. This keeps initial load fast and avoids hitting API rate limits.
- The tree model supports **infinite recursion** (template A → B → C → ...) with cycle detection to prevent infinite loops.
