# @meirblachman/azure-pipelines-visualizer-web

React components for visualizing Azure Pipelines — both template trees and commit build flows.

[![npm](https://img.shields.io/npm/v/@meirblachman/azure-pipelines-visualizer-web)](https://www.npmjs.com/package/@meirblachman/azure-pipelines-visualizer-web)

## Two main views

The `App` component provides two views via hash routing:

- **Pipeline Templates** (`#/`) — paste a pipeline URL and explore its template hierarchy as an interactive diagram with YAML preview and task docs.
- **Commit Flow** (`#/commit-flow`) — paste a commit URL and visualize the full chain of pipelines triggered by that commit, including cross-project triggers.

## Installation

```bash
npm install @meirblachman/azure-pipelines-visualizer-web
```

### Peer dependencies

These must be installed alongside the package:

```bash
npm install react react-dom @xyflow/react
```

## Quick start

Import the `App` component and its stylesheet into your React application:

```tsx
import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

// Empty — shows a URL input bar where users can paste a pipeline link
export default function MyPage() {
  return <App />;
}
```

The `App` component renders a full-featured visualizer: a URL input bar, an interactive template-tree diagram, and a YAML detail panel.

## Specifying a pipeline

Pass props to `<App>` to load a pipeline automatically. There are three ways:

### 1. Full Azure DevOps file URL

```tsx
import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

export default function MyPage() {
  return (
    <App fileUrl="https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml" />
  );
}
```

### 2. Org / project / repo / path

```tsx
<App
  org="myorg"
  project="myproject"
  repo="myrepo"
  path="/.pipelines/main.yml"
  branch="main"  // optional
/>
```

| Prop | Required | Description |
|------|----------|-------------|
| `org` | ✅ | Azure DevOps organization |
| `project` | ✅ | Azure DevOps project |
| `repo` | ✅ | Repository name |
| `path` | ✅ | Path to the YAML file in the repo |
| `branch` | ❌ | Git branch (defaults to the repo's default branch) |

### 3. Pipeline definition ID

```tsx
<App org="myorg" project="myproject" pipelineId={42} />
```

| Prop | Required | Description |
|------|----------|-------------|
| `org` | ✅ | Azure DevOps organization |
| `project` | ✅ | Azure DevOps project |
| `pipelineId` | ✅ | Numeric pipeline/build definition ID |

### Fallback: URL query parameters

When no props are provided, the component also reads from the page's URL query parameters (`?url=`, `?org=&project=&pipelineId=`, etc.). This is useful when embedding the visualizer as a standalone page. Props take precedence over query parameters when both are present.

## Embedding without React (Chrome extension, vanilla JS)

If your project doesn't use React, use the `mount()` function. It handles React internally and gives you a plain JavaScript API.

### Vanilla JS

```js
import { mount } from '@meirblachman/azure-pipelines-visualizer-web';

const container = document.getElementById('pipeline-visualizer');

// Load by pipeline definition ID
const handle = mount(container, {
  org: 'myorg',
  project: 'myproject',
  pipelineId: 42,
});

// Or load by file URL
const handle2 = mount(container, {
  fileUrl: 'https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml',
});

// Update the pipeline later
handle.update({ pipelineId: 99 });

// Clean up when done
handle.unmount();
```

### Chrome extension (content script or popup)

```js
// popup.js or content-script.js
import { mount } from '@meirblachman/azure-pipelines-visualizer-web';

const container = document.createElement('div');
container.style.width = '100%';
container.style.height = '600px';
document.body.appendChild(container);

const handle = mount(container, {
  org: 'myorg',
  project: 'myproject',
  pipelineId: 42,
});
```

### Chrome extension HTML page

```html
<!-- popup.html or a dedicated extension page -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; }
    #root { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import { mount } from '@meirblachman/azure-pipelines-visualizer-web';

    mount(document.getElementById('root'), {
      org: 'myorg',
      project: 'myproject',
      pipelineId: 42,
    });
  </script>
</body>
</html>
```

### `mount()` API

```ts
mount(element: HTMLElement, options?: MountOptions): MountHandle
```

`MountOptions` accepts the same props as `<App>`: `fileUrl`, `org`, `project`, `pipelineId`, `repo`, `path`, `branch`.

| Handle method | Description |
|---------------|-------------|
| `update(partial)` | Update any option without remounting |
| `unmount()` | Remove the visualizer and clean up |

## Using individual components

You can also import specific components for more control:

```tsx
import {
  PipelineDiagram,
  PipelineSelector,
  DetailPanel,
  ErrorBoundary,
  usePipelineStore,
} from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';
```

### Available exports

| Export | Description |
|---|---|
| `mount` | Vanilla JS mount function — no React needed in your project |
| `App` | Full application shell with selector, diagram, detail panel, and commit flow |
| **Pipeline Templates** | |
| `PipelineDiagram` | Core diagram component — renders the template tree with ReactFlow |
| `PipelineSelector` | URL input bar with auto-load from query parameters |
| `DetailPanel` | YAML preview and task docs for the selected node |
| `FileNode` | Custom ReactFlow node for pipeline files |
| `TemplateEdge` | Custom ReactFlow edge with template metadata |
| **Commit Flow** | |
| `CommitFlowPage` | Full commit flow view with selector, diagram, and build detail popup |
| `CommitFlowDiagram` | ReactFlow diagram of the build trigger chain |
| `CommitFlowSelector` | Commit URL input bar |
| `BuildNode` | Custom ReactFlow node for pipeline builds |
| `BuildDetailPopup` | Modal popup with clickable links to ADO (build, definition, branch, commit) |
| **Shared** | |
| `ErrorBoundary` | React error boundary wrapper |
| `usePipelineStore` | Zustand store hook for pipeline state |
| `getLayoutedElements` | Dagre-based layout utility for nodes and edges |
| `fetchPipelines`, `fetchPipelineYaml`, ... | API client functions |

## Usage via CDN (script tag)

Load the library directly from [unpkg](https://unpkg.com) or [jsDelivr](https://www.jsdelivr.com):

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css" />
  <link rel="stylesheet" href="https://unpkg.com/@xyflow/react/dist/style.css" />
</head>
<body>
  <div id="root"></div>

  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

  <script type="module">
    import { App } from 'https://unpkg.com/@meirblachman/azure-pipelines-visualizer-web/dist/lib/index.js';

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
  </script>
</body>
</html>
```

## Data fetching

The library automatically detects its runtime environment and uses the appropriate data source:

- **Chrome extension** (`chrome-extension:` protocol) → talks directly to the Azure DevOps REST API using the browser's existing session cookies. **No server required.**
- **Web app** (any other origin) → calls `/api/*` endpoints, which requires the companion server running at the same origin (or behind a reverse proxy).

### Running with the API server

For web apps, start the companion server:

```bash
npx @meirblachman/azure-pipelines-visualizer
```

This starts the API server on port 3001 with the built-in web UI. See the [main repository](https://github.com/Meir017/azure-pipelines-visualizer) for configuration options.

## License

See [repository](https://github.com/Meir017/azure-pipelines-visualizer) for details.
