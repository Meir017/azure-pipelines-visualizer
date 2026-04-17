# Feature 7: Resource & Artifact Lineage Graph

## Summary

A cross-pipeline DAG visualization that maps how artifacts and resources flow between Azure DevOps pipelines. Nodes represent pipelines, edges represent artifact/resource relationships, and the graph reveals the full lineage from build → publish → consume → deploy.

## Motivation

Teams with mature CI/CD systems often have dozens of interconnected pipelines where one pipeline's output feeds into another. Today there is no single view that shows this dependency chain. When a build breaks or an artifact changes, engineers must manually trace which downstream pipelines are affected. This feature provides that missing "big picture" view.

## Data Sources

### 1. YAML `resources.pipelines` Definitions

Pipeline YAML declares upstream dependencies:

```yaml
resources:
  pipelines:
    - pipeline: build-api
      source: 'MyProject/API-Build'
      trigger:
        branches:
          include:
            - main
    - pipeline: build-web
      source: 'MyProject/Web-Build'
```

The template parser in `packages/core` can be extended to extract these `resources.pipelines` entries alongside template references. Each entry defines a directed edge: `source pipeline → current pipeline`.

### 2. Build Artifacts API

```
GET /_apis/build/builds/{buildId}/artifacts
```

Returns the list of artifacts published by a specific build. This provides the concrete artifact names that label the edges in the graph. Response includes:

- `name` — artifact name (e.g., `drop`, `packages`, `test-results`)
- `resource.type` — `Container`, `PipelineArtifact`, etc.
- `resource.downloadUrl` — link to download contents

### 3. Pipeline Triggers

The `resources.pipelines[].trigger` block defines when a downstream pipeline is actually triggered by an upstream completion. Combined with build history, this confirms actual consumption vs. declared-but-unused dependencies.

### 4. Build Timeline & Records

```
GET /_apis/build/builds/{buildId}/timeline
```

Download artifact tasks (`DownloadPipelineArtifact@2`, `DownloadBuildArtifacts@1`) in the timeline confirm which artifacts were actually consumed at runtime, not just declared.

## Graph Model

```
Node {
  id: string;              // pipeline definition ID
  name: string;            // pipeline display name
  projectName: string;
  latestBuild: {
    id: number;
    status: 'succeeded' | 'failed' | 'running' | 'canceled';
    finishTime: string;
    sourceBranch: string;
  } | null;
  artifacts: Artifact[];   // published artifacts from latest build
}

Edge {
  source: string;          // upstream pipeline ID
  target: string;          // downstream pipeline ID
  artifactNames: string[]; // artifact names flowing along this edge
  triggerEnabled: boolean;  // whether auto-trigger is configured
}
```

## Graph Layout

The DAG is rendered left-to-right using a layered (Sugiyama) layout:

1. **Column assignment**: Topological sort determines layer/column. Pipelines with no upstream dependencies are in column 0 (leftmost). Each subsequent column contains pipelines whose inputs come from previous columns.
2. **Row ordering**: Within each column, nodes are ordered to minimize edge crossings (barycenter heuristic).
3. **Spacing**: 250px horizontal between columns, 120px vertical between rows.
4. **Long edges**: Edges spanning multiple columns are drawn as smooth Bézier curves with intermediate waypoints.

## Node Styling

| Element | Design |
|---------|--------|
| **Node shape** | Rounded rectangle, 200×80px |
| **Header** | Pipeline name, bold, 14px |
| **Status badge** | Colored circle — green (succeeded), red (failed), blue (running), gray (canceled/none) |
| **Subtitle** | Last build time, relative (e.g., "2h ago") |
| **Border** | 2px solid, color matches status |
| **Selected state** | Drop shadow + thicker border (3px) |

## Edge Styling

| Element | Design |
|---------|--------|
| **Line** | Smooth Bézier, 2px stroke |
| **Color** | `#6366f1` (indigo) default, `#ef4444` (red) if upstream failed |
| **Label** | Artifact name(s) as pill badges on the midpoint of the edge |
| **Arrow** | Arrowhead at target end |
| **Trigger indicator** | Lightning bolt icon on edge if auto-trigger is enabled |

## Interactions

### Node Click → Detail Panel

Clicking a pipeline node opens a side panel showing:

- **Pipeline info**: Name, project, repository, default branch
- **Latest build**: Status, duration, triggered by, source version
- **Published artifacts**: List with name, size, type. Each artifact is expandable to show file contents (via Artifacts API).
- **Upstream pipelines**: List of pipelines this one depends on
- **Downstream pipelines**: List of pipelines triggered by this one

### Edge Click → Artifact Details

Clicking an edge shows:

- Artifact name and type
- Size of the latest published artifact
- Download link
- History of the last 5 transfers (build ID pairs)

### Filtering & Controls

- **Branch filter**: Show lineage for a specific branch (default: `main`)
- **Status filter**: Highlight or dim nodes by build status
- **Depth control**: Limit graph depth from a selected root node
- **Search**: Find a pipeline by name, auto-center and highlight

### Hover

- Node hover shows a tooltip with build summary
- Edge hover highlights the full path from source to ultimate consumer

## Implementation Plan

### Phase 1: Data Collection (Server)

1. **New API endpoint**: `GET /api/lineage/:project`
   - Fetches all pipeline definitions in a project
   - For each, parses YAML to extract `resources.pipelines`
   - Fetches latest build and its artifacts
   - Returns the graph model (nodes + edges)

2. **Extend server caching**: Reuse `RepoFileCache` for YAML content. Add TTL cache for build/artifact data (5-minute TTL since builds change frequently).

3. **New service**: `packages/server/src/services/lineage.ts`
   - `getProjectLineage(project: string, branch?: string): Promise<LineageGraph>`
   - Orchestrates API calls, builds graph model

### Phase 2: Core Parser Extension

1. **New detector**: `packages/core/src/parser/resource-detector.ts`
   - Similar to `template-detector.ts` but targets `resources.pipelines`, `resources.repositories`, and `resources.containers`
   - Returns `ResourceReference[]` objects

2. **Integrate with existing parser**: The `Pipeline` model gains an optional `resources` field populated during parsing.

### Phase 3: Web Visualization

1. **New route**: `/lineage/:project` in the React app
2. **React Flow graph**: Reuse ReactFlow (already a dependency) with custom node and edge components
3. **Layout engine**: Use `dagre` or `elkjs` for automatic DAG layout (both support left-to-right layered layout)
4. **Detail panel**: Slide-in panel component reused from template visualizer pattern
5. **Controls**: Toolbar with branch selector, status filter, depth slider, search

### Phase 4: Polish

- Animated edges for "running" builds
- Auto-refresh on configurable interval
- Permalink support (encode project + filters in URL)
- Keyboard navigation between nodes

## Technical Considerations

- **Rate limiting**: A project with 50+ pipelines requires many API calls. Batch requests where possible and use server-side caching aggressively.
- **Circular dependencies**: Azure DevOps allows circular pipeline triggers. The graph must detect and handle cycles (render as a cycle indicator, not infinite recursion).
- **Cross-project references**: `resources.pipelines` can reference pipelines in other projects. The graph should support cross-project edges with visual distinction.
- **Permissions**: Users may not have access to all pipelines. Missing nodes should appear as "restricted" placeholders.

## Mockup

See [07-artifact-lineage-mockup.svg](./07-artifact-lineage-mockup.svg) for the visual mockup.
