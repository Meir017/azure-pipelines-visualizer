# Azure Pipelines Visualizer

[![CI](https://github.com/Meir017/azure-pipelines-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Meir017/azure-pipelines-visualizer/actions/workflows/ci.yml)
[![npm CLI](https://img.shields.io/npm/v/@meirblachman/azure-pipelines-visualizer?label=npm%20cli)](https://www.npmjs.com/package/@meirblachman/azure-pipelines-visualizer)
[![npm Web](https://img.shields.io/npm/v/@meirblachman/azure-pipelines-visualizer-web?label=npm%20web)](https://www.npmjs.com/package/@meirblachman/azure-pipelines-visualizer-web)

An interactive visualizer for Azure DevOps pipelines. Paste a pipeline URL and explore its template hierarchy as an expandable diagram with YAML preview and task documentation links.

### Paste a URL and load the pipeline

![Load pipeline](assets/load-pipeline.png)

### Expand templates to explore the full hierarchy

![Expanded diagram](assets/expanded-diagram.png)

### Drill into cross-repo template trees

![Cross-repo templates](assets/cross-repo-templates.png)

### View YAML and task documentation in the detail panel

![Detail panel](assets/detail-panel.png)


## Quick Start with npx

The fastest way to run the visualizer — no installation required:

```bash
npx @meirblachman/azure-pipelines-visualizer
```

> Requires Node.js ≥ 24 and Azure CLI logged in (`az login`).

Open http://localhost:3001. The command bundles both the API server and web UI.

### CLI Options

```
Usage: apv [options]

Options:
  -c, --config <path>  Path to apv.config.json
  -p, --port <number>  Port to listen on (default: 3001)
  -h, --help           Show this help message
  -v, --version        Show version number
```

Examples:

```bash
# Use a custom config file and port
npx @meirblachman/azure-pipelines-visualizer --config ./my-config.json --port 8080

# Short flags work too
npx @meirblachman/azure-pipelines-visualizer -c ./my-config.json -p 8080
```

The `PORT` environment variable is still supported as a fallback when `--port` is not specified.

## Web Library

The visualizer is also available as a React component library for embedding in your own apps or Chrome extensions:

```bash
npm install @meirblachman/azure-pipelines-visualizer-web
```

### React

```tsx
import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

// Load by pipeline definition ID
<App org="myorg" project="myproject" pipelineId={42} />

// Load by file URL
<App fileUrl="https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml" />

// Load by repo path
<App org="myorg" project="myproject" repo="myrepo" path="/.pipelines/main.yml" />
```

### Vanilla JS / Chrome extension (no React needed)

```js
import { mount } from '@meirblachman/azure-pipelines-visualizer-web';

const handle = mount(document.getElementById('root'), {
  org: 'myorg',
  project: 'myproject',
  pipelineId: 42,
});

handle.update({ pipelineId: 99 }); // update
handle.unmount();                   // clean up
```

> **Chrome extensions:** The library auto-detects `chrome-extension:` protocol and talks directly to Azure DevOps REST APIs using browser cookies — no server required.

See the full [web library documentation](packages/web/README.md) for all props, exports, and CDN usage.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Azure CLI logged in (`az login`) — required for fetching files from Azure DevOps

### Quick Start

```bash
bun install
bun run dev
```

This starts a single dev server at http://localhost:3000 serving both the API and web UI with hot reload.

## Production

```bash
bun install
bun run build   # Build the web UI
bun run start   # Start the production server
```

Open http://localhost:3000.

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
| `bun run dev` | Start dev server (API + web UI with HMR) |
| `bun run build` | Build the web UI for production |
| `bun run start` | Start the production server |
| `bun test` | Run all tests |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run build:standalone` | Build a self-contained executable |

## Standalone Binary

Pre-built binaries for Linux, macOS, and Windows are available on the [Releases](https://github.com/Meir017/azure-pipelines-visualizer/releases) page.

### Download and run

```bash
# Download the binary for your platform from the latest release, then:
chmod +x apv-linux-x64   # Linux/macOS only
./apv-linux-x64
```

Open http://localhost:3001. The binary bundles both the API server and web UI.

### Configuration

Pass options via CLI flags (same flags as the npm package):

```bash
./apv-linux-x64 --config ./apv.config.json --port 8080
```

The `APV_CONFIG` environment variable is also supported as a fallback:

```bash
APV_CONFIG=./apv.config.json ./apv-linux-x64
```

See [`apv.config.example.json`](apv.config.example.json) for available options.

### Build from source

```bash
bun install
bun run build:standalone    # produces ./apv (or apv.exe on Windows)
./apv
```

## Project Structure

```
packages/
  core/     # Pipeline model, YAML parser, template detector, expression evaluator
  server/   # Hono API server (ADO proxy + disk-backed file cache)
  web/      # React + Vite frontend (ReactFlow diagram, Monaco editor, npm library)
  cli/      # CLI wrapper — bundles server + web for npx usage
```
