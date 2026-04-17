# Feature Proposal: Build Timeline Gantt View

## Summary

An interactive Gantt chart that visualizes the execution timeline of an Azure Pipelines build, showing stages, jobs, and tasks with their real start/finish times, parallelism, and results at a glance.

## Problem

Azure DevOps shows build timelines as a flat list or nested tree, making it difficult to understand:

- How long each stage/job/task actually took relative to the total build time.
- Which jobs ran in parallel and where bottlenecks exist.
- What the critical path through the build is.
- Where time is wasted waiting for agent availability.

## Data Source

**Azure DevOps REST API**:

```
GET /_apis/build/builds/{buildId}/timeline
```

Returns `records[]` where each record contains:

| Field          | Description                                      |
| -------------- | ------------------------------------------------ |
| `id`           | Unique record identifier                         |
| `parentId`     | Parent record ID (stages → jobs → tasks)         |
| `name`         | Display name of the stage/job/task                |
| `type`         | `Stage`, `Job`, or `Task`                         |
| `startTime`    | ISO 8601 timestamp when execution began           |
| `finishTime`   | ISO 8601 timestamp when execution completed       |
| `state`        | `pending`, `inProgress`, `completed`              |
| `result`       | `succeeded`, `failed`, `canceled`, `skipped`      |
| `workerName`   | Agent that executed the record                    |
| `errorCount`   | Number of errors encountered                      |
| `warningCount` | Number of warnings encountered                    |
| `issues`       | Array of issue objects (errors/warnings)          |
| `log`          | Reference to the log resource for this record     |
| `order`        | Execution order within the parent                 |

The hierarchy is: **Stage → Job → Task**. Each `Job` has a `parentId` pointing to its `Stage`, and each `Task` has a `parentId` pointing to its `Job`.

## What It Shows

### Gantt Chart (Main View)

- **Time axis** (horizontal): Spans from the earliest `startTime` to the latest `finishTime`, with grid lines at meaningful intervals.
- **Rows** (vertical): Grouped by stage, then by job within each stage. Tasks are shown as sub-bars within jobs (expandable).
- **Bars**: Each bar represents a record, positioned by `startTime` and sized by duration.
  - **Green** (`#2da44e`): succeeded
  - **Red** (`#cf222e`): failed
  - **Yellow** (`#d4a72c`): canceled
  - **Gray** (`#8b949e`): skipped
  - **Blue pulse** (`#0078d4`): in-progress (animated)
- **Parallel jobs**: Appear on separate rows at the same horizontal position — overlapping bars make parallelism immediately visible.
- **Critical path**: The longest sequential chain is highlighted with a thicker border and connecting lines.
- **Gap indicators**: Dashed regions between a job's queue time and start time show agent wait time.

### Detail Panel (Side/Bottom)

Clicking any bar opens a detail panel showing:

- Full name and type
- Start time, finish time, duration
- Worker/agent name
- Error count, warning count, and issue list
- Link to view full logs
- Link to open in Azure DevOps

### Summary Bar (Top)

- Total build duration
- Number of stages, jobs, tasks
- Overall result badge
- Critical path duration vs. total wall-clock time (parallelism efficiency metric)

## Interaction Model

| Action                    | Behavior                                                  |
| ------------------------- | --------------------------------------------------------- |
| Hover over bar            | Tooltip with name, duration, result                       |
| Click bar                 | Open detail panel                                         |
| Scroll horizontally       | Pan through timeline                                      |
| Mouse wheel / pinch       | Zoom in/out on time axis                                  |
| Click stage group header  | Collapse/expand jobs within the stage                     |
| Click job row             | Expand to show individual tasks                           |
| Toggle "Critical Path"    | Highlight/dim the critical path overlay                   |
| Toggle "Show Gaps"        | Show/hide agent wait time indicators                      |
| Click "Open in ADO"       | Navigate to the build in Azure DevOps                     |

## Where It Lives

### Web Application

- **New route**: `/build-timeline/:organization/:project/:buildId`
- **New tab** in the existing template visualizer when viewing a pipeline that has recent builds
- Accessible from the pipeline selector by entering a build URL

### Chrome Extension (Future)

- Injected as an additional tab on Azure DevOps build summary pages (`/_build/results?buildId=...`)
- Uses the same React component, rendered into a shadow DOM container
- Communicates with the APV server for data fetching and caching

## Implementation Approach

### Server

1. **New endpoint**: `GET /api/build/:organization/:project/:buildId/timeline`
   - Proxies the ADO timeline API
   - Transforms the flat `records[]` into a hierarchical structure (stages → jobs → tasks)
   - Computes derived fields: duration, gaps, critical path
   - Caches by `buildId` (build timelines are immutable once completed)

2. **Critical path computation**:
   - Build a DAG from the timeline records
   - Find the longest path using topological sort + dynamic programming
   - Return the set of record IDs on the critical path

### Web (React)

1. **New component**: `BuildTimelineGantt.tsx`
   - Uses custom SVG rendering for the Gantt bars (no heavy library dependency)
   - Time axis with adaptive tick intervals (seconds → minutes → hours)
   - Virtual scrolling for builds with hundreds of tasks
   - Responsive: collapses to summary view on narrow screens

2. **Detail panel**: `TimelineDetailPanel.tsx`
   - Displays record metadata, issues, and log links
   - Fetches log content on demand

3. **Data layer**: `useBuildTimeline` hook
   - Fetches and caches timeline data
   - Computes layout positions (row assignments, x-coordinates from timestamps)
   - Handles zoom/pan state

### Core

- **No changes to `@meirblachman/azure-pipelines-visualizer-core`** — this feature is purely about build execution data, not pipeline template structure. The core package remains pure.

### Dependencies

- No new runtime dependencies required. SVG rendering is custom.
- Optional: `d3-scale` for time axis computation (small, tree-shakeable)

## Open Questions

1. Should the Gantt view be linkable from template tree nodes (e.g., "View latest build timeline for this pipeline")?
2. Should we support comparing two build timelines side-by-side to diagnose regressions?
3. How should we handle very long builds (1000+ tasks) — virtual scrolling vs. pagination?
4. Should the Chrome extension be a separate package or bundled with the web app?

## Mockup

See [01-build-timeline-gantt-mockup.svg](./01-build-timeline-gantt-mockup.svg) for a visual mockup of the Gantt view.
