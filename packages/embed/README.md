# @meirblachman/azure-pipelines-visualizer-embed

Embeddable client-side library for visualizing Azure Pipelines template trees. Designed to be consumed by Chrome extensions or any web application running on the same origin as Azure DevOps.

## Features

- **Full pipeline visualization** — renders the same ReactFlow template-tree diagram as the main app
- **ZIP-based repo caching** — downloads the entire repo as a ZIP, extracts in-memory with `fflate` (~8KB), caches in IndexedDB for cross-session persistence
- **Cookie-based auth** — uses `credentials: 'include'` (browser session cookies), no PAT required
- **Zero server dependency** — talks directly to Azure DevOps REST APIs from the browser

## Installation

```bash
npm install @meirblachman/azure-pipelines-visualizer-embed
# or
bun add @meirblachman/azure-pipelines-visualizer-embed
```

## Usage

### React Component

```tsx
import { ApvEmbed } from '@meirblachman/azure-pipelines-visualizer-embed';

function App() {
  return (
    <div style={{ width: '100%', height: 600 }}>
      <ApvEmbed
        org="myorg"
        project="myproject"
        pipelineId={42}
      />
    </div>
  );
}
```

### Vanilla JavaScript

```ts
import { mount } from '@meirblachman/azure-pipelines-visualizer-embed';

const handle = mount(document.getElementById('pipeline')!, {
  org: 'myorg',
  project: 'myproject',
  pipelineId: 42,
});

// Update the visualization
handle.update({ pipelineId: 99 });

// Clean up
handle.unmount();
```

## API Reference

### `<ApvEmbed />` Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `org` | `string` | ✅ | Azure DevOps organization name |
| `project` | `string` | ✅ | Azure DevOps project name |
| `pipelineId` | `number` | ✅ | Pipeline definition ID |
| `className` | `string` | | CSS class for the container |
| `style` | `CSSProperties` | | Inline styles for the container |

### `mount(element, options)` → `MountHandle`

Mount the visualizer into a DOM element. Returns a handle with:
- `unmount()` — remove the component
- `update(partialOptions)` — change org/project/pipelineId

### Advanced: Direct Cache Access

```ts
import {
  ensureRepoCached,
  getFileFromCache,
  clearCache,
} from '@meirblachman/azure-pipelines-visualizer-embed';

// Pre-fetch a repo
await ensureRepoCached('org', 'project', 'repoId', 'refs/heads/main');

// Read a file from cache
const content = await getFileFromCache('org', 'project', 'repoId', 'refs/heads/main', '/path/to/file.yml');

// Clear all caches
await clearCache();
```

## Caching Strategy

| Layer | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| Memory Map | In-memory | Session lifetime | Extracted file maps from ZIP |
| IndexedDB | Persistent | 7 days | Survives page reloads, large storage (~100MB+) |
| Branch→SHA | In-memory | 2 minutes | Avoids re-resolving HEAD on every request |

## Authentication

This library uses browser session cookies (`credentials: 'include'`). It's designed for:

- **Chrome extensions** running on `dev.azure.com` pages (inherits the user's ADO session)
- **Same-origin deployments** hosted alongside Azure DevOps

No Personal Access Token (PAT) is required.

## Peer Dependencies

- `react` >= 18.2.0
- `react-dom` >= 18.2.0
