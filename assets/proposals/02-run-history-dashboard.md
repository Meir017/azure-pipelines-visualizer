# Feature Proposal: Pipeline Run History Dashboard

## Summary

A dashboard that aggregates historical build data for a pipeline definition, presenting success/failure trends, duration metrics, queue latency, and breakdowns by branch and requester — enabling teams to quickly identify reliability issues and performance regressions.

## Problem

Azure DevOps provides build history as a list, but lacks:

- At-a-glance trend visualization (is the pipeline getting more reliable or less?).
- Duration tracking over time (is the build getting slower?).
- Queue-to-start latency visibility (are agents overloaded?).
- Branch-level and requester-level breakdowns (which branches or developers trigger the most failures?).

Teams end up exporting data to external tools or building custom dashboards. This feature brings those insights directly into the visualizer.

## Data Source

**Azure DevOps REST API**:

```
GET /_apis/build/builds?definitions={definitionId}&$top=50&api-version=7.0
```

Returns an array of build objects. Key fields per build:

| Field           | Description                                      |
| --------------- | ------------------------------------------------ |
| `id`            | Build ID                                         |
| `buildNumber`   | Human-readable build number                      |
| `result`        | `succeeded`, `partiallySucceeded`, `failed`, `canceled` |
| `status`        | `completed`, `inProgress`, `notStarted`          |
| `queueTime`     | When the build was queued                        |
| `startTime`     | When execution began (agent picked it up)        |
| `finishTime`    | When execution completed                         |
| `sourceBranch`  | Branch that triggered the build (e.g., `refs/heads/main`) |
| `requestedFor`  | User who triggered the build                     |
| `triggerInfo`   | CI/PR/Manual trigger metadata                    |

Additional API calls for richer data:

- `GET /_apis/build/builds/{buildId}/timeline` — for per-stage duration breakdowns
- `GET /_apis/build/definitions/{definitionId}` — for pipeline name and metadata

## Metrics & Charts

### 1. Success Rate (Big Number + Trend)

- **Type**: Large percentage display with sparkline
- **Data**: `result` field over last N builds
- **Shows**: Current success rate (e.g., "87%") with a small trend line beneath it
- **Color**: Green if ≥ 90%, yellow if ≥ 70%, red if < 70%

### 2. Build Result Trend (Line/Dot Chart)

- **Type**: Timeline chart with colored dots
- **X-axis**: Build number or date
- **Y-axis**: Result (succeeded = top, failed = bottom)
- **Shows**: Each build as a dot — green for success, red for failure, yellow for partial, gray for canceled
- **Interaction**: Hover shows build number, branch, duration. Click opens the build.

### 3. Duration Over Time (Bar Chart)

- **Type**: Vertical bar chart
- **X-axis**: Build number or date
- **Y-axis**: Duration in minutes
- **Shows**: Each bar represents a build's total duration (`finishTime - startTime`)
- **Overlay**: Moving average line to show trend
- **Color**: Bars colored by result

### 4. Queue-to-Start Latency (Area Chart)

- **Type**: Area chart
- **X-axis**: Build number or date
- **Y-axis**: Wait time in seconds/minutes (`startTime - queueTime`)
- **Shows**: How long builds wait before an agent picks them up
- **Insight**: Spikes indicate agent pool saturation

### 5. Branch Breakdown (Pie/Donut Chart)

- **Type**: Donut chart
- **Data**: Build count grouped by `sourceBranch`
- **Shows**: Which branches trigger the most builds
- **Color**: Each branch gets a distinct color
- **Interaction**: Click a slice to filter all other charts to that branch

### 6. Requester Breakdown (Horizontal Bar Chart)

- **Type**: Horizontal bar chart
- **Data**: Build count grouped by `requestedFor.displayName`
- **Shows**: Who triggers the most builds (useful for understanding CI vs. manual triggers)
- **Interaction**: Click a bar to filter all other charts to that requester

## Interaction Model

| Action                     | Behavior                                                  |
| -------------------------- | --------------------------------------------------------- |
| Hover over any data point  | Tooltip with build details (number, branch, duration, result) |
| Click a data point         | Navigate to that specific build (timeline view or ADO)    |
| Click a pie/bar segment    | Cross-filter all charts to that branch/requester          |
| Date range selector        | Filter all charts to a specific time window               |
| Build count selector       | Choose last 25, 50, 100, or 200 builds                   |
| Refresh button             | Fetch latest data from ADO                                |

## Where It Lives

### Web Application

- **New route**: `/dashboard/:organization/:project/:definitionId`
- **New tab**: "History" tab alongside the existing template tree view
- **Entry point**: From the pipeline selector — after selecting a pipeline, show a "View History" link
- **From template nodes**: When viewing a pipeline's template tree, add a "Build History" button in the toolbar

### Linking

- Deep-linkable: each chart state (filters, date range) encoded in URL query params
- Shareable: teams can share dashboard URLs in Slack/Teams

## Implementation Approach

### Server

1. **New endpoint**: `GET /api/builds/:organization/:project/:definitionId/history`
   - Proxies the ADO builds list API
   - Computes derived metrics server-side:
     - Success rate (overall and per-branch)
     - Duration statistics (mean, median, p95)
     - Queue latency statistics
   - Caches with a short TTL (5 minutes) since new builds appear frequently

2. **Aggregation endpoint**: `GET /api/builds/:organization/:project/:definitionId/stats`
   - Pre-computed aggregations for faster dashboard loading
   - Branch breakdown, requester breakdown, trend data

### Web (React)

1. **New component**: `RunHistoryDashboard.tsx`
   - Grid layout with responsive card-based panels
   - Each chart is an independent component that receives filtered data

2. **Chart components** (all custom SVG or lightweight library):
   - `SuccessRateBadge.tsx` — big number with sparkline
   - `ResultTrendChart.tsx` — dot timeline
   - `DurationBarChart.tsx` — bar chart with moving average
   - `LatencyAreaChart.tsx` — area chart
   - `BranchDonutChart.tsx` — donut chart
   - `RequesterBarChart.tsx` — horizontal bar chart

3. **Cross-filtering state**: React context that manages active filters (branch, requester, date range) and propagates to all chart components

4. **Data layer**: `useRunHistory` hook
   - Fetches build history data
   - Computes chart-ready data structures
   - Manages filter state and re-computation

### Core

- **No changes to `@meirblachman/azure-pipelines-visualizer-core`** — this feature deals with build execution data, not pipeline template structure.

### Dependencies

- Consider `d3-shape` + `d3-scale` for chart primitives (small, tree-shakeable)
- Alternatively, fully custom SVG (the charts are straightforward enough)

## Open Questions

1. How many builds should we fetch by default? 50 is a good start, but power users may want 200+.
2. Should we support comparing two pipeline definitions side-by-side?
3. Should aggregations happen server-side or client-side? Server-side is faster for large datasets but adds complexity.
4. Should the dashboard auto-refresh on an interval?
5. Do we want to show per-stage duration breakdowns (requires fetching timeline for each build)?

## Mockup

See [02-run-history-dashboard-mockup.svg](./02-run-history-dashboard-mockup.svg) for a visual mockup of the dashboard layout.
