# Azure Pipelines Visualizer

An interactive visualizer for Azure DevOps pipelines. Paste a pipeline URL and explore its template hierarchy as an expandable diagram with YAML preview and task documentation links.

## Quick Start

```bash
npx @meirblachman/azure-pipelines-visualizer
```

> Requires Node.js ≥ 24 and Azure CLI logged in (`az login`).

Open http://localhost:3001. The command bundles both the API server and web UI.

## CLI Options

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

## Usage

1. Paste an Azure DevOps file URL, e.g.:
   ```
   https://dev.azure.com/{org}/{project}/_git/{repo}?path=/.pipelines/main.yml
   ```
2. Click **Load Pipeline** — the root file and its template references appear as a diagram.
3. Click any template node to expand it and fetch its contents recursively.
4. Click an expanded node to view its YAML and task list in the detail panel.

## Disk Cache

Fetched pipeline and template files are cached on disk under `.cache/ado-file-cache` by default, keyed by repo identity, file path, branch, and resolved commit SHA.

You can override the cache location and add custom task documentation links in `apv.config.json`:

```jsonc
{
  "cacheDir": ".cache/ado-file-cache",
  "customTaskDocs": {
    "OneBranch.Pipeline.Build@1": "https://example.com/docs/build-task"
  }
}
```

## Standalone Binary

Pre-built binaries for Linux, macOS, and Windows are available on the [Releases](https://github.com/Meir017/azure-pipelines-visualizer/releases) page.

```bash
# Download the binary for your platform from the latest release, then:
chmod +x apv-linux-x64   # Linux/macOS only
./apv-linux-x64 --config ./apv.config.json --port 8080
```

## License

See [repository](https://github.com/Meir017/azure-pipelines-visualizer) for details.
