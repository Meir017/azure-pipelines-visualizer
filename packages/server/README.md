# @meirblachman/azure-pipelines-visualizer-server

> **Internal package** — this is not published to npm and is consumed only within the monorepo.

Hono HTTP server that proxies Azure DevOps REST API calls and maintains a multi-layer caching system for pipeline files.

## Key modules

| Module | Description |
|--------|-------------|
| `services/azure-devops` | ADO REST API client with in-memory TTL caches |
| `services/repo-file-cache` | Disk cache keyed by commit SHA |
| `services/repo-zip-cache` | Repo ZIP cache with extraction and traversal guard |
| `services/memory-cache` | Generic TTL cache with in-flight request deduplication |
| `routes/files` | File and repo endpoints |
| `routes/pipelines` | Pipeline list/definition/YAML endpoints |

## Running

```bash
bun run dev    # development with watch mode
bun run start  # production
```
