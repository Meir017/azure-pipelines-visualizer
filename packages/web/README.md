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

## Usage — bundle with your app

Import the `App` component and its stylesheet into your React application:

```tsx
import { App } from '@meirblachman/azure-pipelines-visualizer-web';
import '@meirblachman/azure-pipelines-visualizer-web/dist/lib/style.css';
import '@xyflow/react/dist/style.css';

export default function MyPage() {
  return <App />;
}
```

> **Note:** The `App` component expects API calls to be proxied to the `@meirblachman/azure-pipelines-visualizer` server at `/api`. Configure your dev server or reverse proxy accordingly.

### Using individual components

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
| `PipelineSelector` | URL input + pipeline picker |
| `DetailPanel` | YAML preview and task docs for the selected node |
| `FileNode` | Custom ReactFlow node for pipeline files |
| `TemplateEdge` | Custom ReactFlow edge with template metadata |
| `ErrorBoundary` | React error boundary wrapper |
| `usePipelineStore` | Zustand store hook for pipeline state |
| `getLayoutedElements` | Dagre-based layout utility for nodes and edges |
| `fetchPipelines`, `fetchPipelineYaml`, ... | API client functions |

## Usage — script tag (CDN)

You can load the library directly from a CDN using [unpkg](https://unpkg.com) or [jsDelivr](https://www.jsdelivr.com). This approach requires React and ReactDOM to be available as globals.

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

> **Important:** The components call `/api/*` endpoints for fetching pipeline data. You need the [`@meirblachman/azure-pipelines-visualizer`](https://www.npmjs.com/package/@meirblachman/azure-pipelines-visualizer) server running and accessible at the same origin, or configure a reverse proxy.

## API server

The web components are designed to work with the companion server package. The easiest way to get started:

```bash
npx @meirblachman/azure-pipelines-visualizer
```

This starts the API server (port 3001) with the built-in web UI. See the [main repository](https://github.com/Meir017/azure-pipelines-visualizer) for configuration options.

## License

See [repository](https://github.com/Meir017/azure-pipelines-visualizer) for details.
