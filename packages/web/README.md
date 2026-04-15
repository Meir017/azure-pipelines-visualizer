# @meirblachman/azure-pipelines-visualizer-web

React components for visualizing Azure Pipelines template trees as interactive diagrams.

[![npm](https://img.shields.io/npm/v/@meirblachman/azure-pipelines-visualizer-web)](https://www.npmjs.com/package/@meirblachman/azure-pipelines-visualizer-web)

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

export default function MyPage() {
  return <App />;
}
```

The `App` component renders a full-featured visualizer: a URL input bar, an interactive template-tree diagram, and a YAML detail panel.

## Specifying a pipeline

The component reads the pipeline to display from the page's **URL query parameters**. There are three ways to point it at a pipeline:

### 1. Full Azure DevOps file URL

Pass the `url` query parameter with a direct link to the YAML file in your repo:

```tsx
// Navigate to: https://your-app.com/?url=https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml

import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

// App reads ?url= from the current page URL and auto-loads the pipeline
export default function MyPage() {
  return <App />;
}
```

Or link to it from elsewhere in your app:

```tsx
<a href="/visualizer?url=https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml">
  View pipeline
</a>
```

### 2. Separate org / project / repo / path parameters

Break the URL into individual query parameters for more control:

```tsx
// Navigate to: https://your-app.com/?org=myorg&project=myproject&repo=myrepo&path=/.pipelines/main.yml&branch=main

import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

export default function MyPage() {
  return <App />;
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org` | ✅ | Azure DevOps organization |
| `project` | ✅ | Azure DevOps project |
| `repo` | ✅ | Repository name |
| `path` | ✅ | Path to the YAML file in the repo |
| `branch` | ❌ | Git branch (defaults to the repo's default branch) |

Build links dynamically:

```tsx
function pipelineLink(org: string, project: string, repo: string, path: string, branch?: string) {
  const params = new URLSearchParams({ org, project, repo, path });
  if (branch) params.set('branch', branch);
  return `/visualizer?${params}`;
}

// Usage
<a href={pipelineLink('myorg', 'myproject', 'myrepo', '/.pipelines/main.yml', 'main')}>
  View pipeline
</a>
```

### 3. Pipeline definition ID

Reference a pipeline by its numeric build definition ID:

```tsx
// Navigate to: https://your-app.com/?org=myorg&project=myproject&pipelineId=42

import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

export default function MyPage() {
  return <App />;
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org` | ✅ | Azure DevOps organization |
| `project` | ✅ | Azure DevOps project |
| `pipelineId` | ✅ | Numeric pipeline/build definition ID |

Build links dynamically:

```tsx
<a href={`/visualizer?org=myorg&project=myproject&pipelineId=${pipeline.id}`}>
  View pipeline #{pipeline.id}
</a>
```

If no query parameters are present, the component shows an empty URL input bar where users can paste an Azure DevOps file URL manually.

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
| `App` | Full application shell with selector, diagram, and detail panel |
| `PipelineDiagram` | Core diagram component — renders the template tree with ReactFlow |
| `PipelineSelector` | URL input bar with auto-load from query parameters |
| `DetailPanel` | YAML preview and task docs for the selected node |
| `FileNode` | Custom ReactFlow node for pipeline files |
| `TemplateEdge` | Custom ReactFlow edge with template metadata |
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

## API server requirement

The web components call `/api/*` endpoints to fetch pipeline data from Azure DevOps. You need the companion server running and accessible at the same origin (or configure a reverse proxy).

The easiest way to get started:

```bash
npx @meirblachman/azure-pipelines-visualizer
```

This starts the API server on port 3001 with the built-in web UI. See the [main repository](https://github.com/Meir017/azure-pipelines-visualizer) for configuration options.

## License

See [repository](https://github.com/Meir017/azure-pipelines-visualizer) for details.
