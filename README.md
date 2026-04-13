# Azure Pipelines Visualizer

An interactive visualizer for Azure DevOps pipelines. Paste a pipeline URL and explore its template hierarchy as an expandable diagram with YAML preview and task documentation links.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Azure CLI logged in (`az login`) — required for fetching files from Azure DevOps

## Quick Start

```bash
bun install
bun run dev
```

This starts the API server (port 3001) and the web UI (port 3000). Open http://localhost:3000.

## Usage

1. Paste an Azure DevOps file URL, e.g.:
   ```
   https://dev.azure.com/{org}/{project}/_git/{repo}?path=/.pipelines/main.yml
   ```
2. Click **Load Pipeline** — the root file and its template references appear as a diagram.
3. Click any template node to expand it and fetch its contents recursively.
4. Click an expanded node to view its YAML and task list in the detail panel.

## Disk Cache

Fetched pipeline and template files are cached on disk under `.cache/ado-file-cache` by default, so you do not need local Git clones for template repos. Cache entries are keyed by:

- repo identity
- normalized file path
- requested branch or tag
- resolved Git commit SHA

This keeps cache hits accurate even when a branch moves forward.

You can optionally override the cache location in `apv.config.json`:

```jsonc
{
  "cacheDir": ".cache/ado-file-cache",
  "customTaskDocs": {
    "OneBranch.Pipeline.Build@1": "https://example.com/docs/build-task"
  }
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start server + web UI in watch mode |
| `bun run dev:server` | Start only the API server |
| `bun run dev:web` | Start only the Vite dev server |
| `bun test` | Run all tests |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Lint and auto-fix |

## Project Structure

```
packages/
  core/     # Pipeline model, YAML parser, template detector, task resolver
  server/   # Hono API server (ADO proxy + disk-backed file cache)
  web/      # React + Vite frontend (ReactFlow diagram, Monaco editor)
```
