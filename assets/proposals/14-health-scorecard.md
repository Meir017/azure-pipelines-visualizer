# Feature 14: Pipeline Health Scorecard

## Summary

A per-pipeline health scoring system that computes a composite 0–100 score from five weighted dimensions: success rate, duration trend, flaky test percentage, queue wait time, and failure clustering. The scorecard provides a single at-a-glance health metric with detailed breakdowns, trend visualization, and a cross-pipeline leaderboard.

## Motivation

- Teams manage dozens of pipelines but lack a unified metric to identify which pipelines need attention.
- Individual signals (failure rate, duration) exist in ADO but are scattered across different pages and require manual correlation.
- Recurring failures and infrastructure degradation (long queue waits) go unnoticed until they cause incidents.
- A composite score enables data-driven prioritization: fix the pipeline with the lowest score first.

## Data Sources

| Metric | API Endpoint | Parameters |
|--------|-------------|------------|
| Build history | `GET /_apis/build/builds?definitions={id}&$top=100&minTime={30daysAgo}` | Last 100 builds or 30 days |
| Build timeline | `GET /_apis/build/builds/{buildId}/timeline` | Per-build stage/job/task durations |
| Test results | `GET /_apis/test/runs?buildUri={buildUri}` | Test run outcomes per build |
| Test result details | `GET /_apis/test/runs/{runId}/results?outcomes=Failed` | Individual test failures for flaky detection |

**Collection period**: Rolling 30-day window. Scores recomputed on each page load with a 15-minute cache TTL.

## Scoring Algorithm

### Component Scores (each 0–100)

#### 1. Success Rate (Weight: 30%)

```
score = (succeeded_builds / total_builds) × 100
```

- Only counts completed builds (excludes cancelled).
- Partially succeeded builds count as 0.5.

| Score Range | Label | Color |
|------------|-------|-------|
| 90–100 | Excellent | Green |
| 70–89 | Good | Yellow-Green |
| 50–69 | Needs Attention | Yellow |
| 0–49 | Critical | Red |

#### 2. Average Duration Trend (Weight: 20%)

Compares the average duration of the last 10 builds to the average of the prior 20 builds:

```
ratio = avg_recent_10 / avg_prior_20
score = clamp(100 - (ratio - 1) × 200, 0, 100)
```

- `ratio = 1.0` → score 100 (no change).
- `ratio = 1.25` → score 50 (25% slower).
- `ratio ≤ 0.75` → score 100 (getting faster — capped at 100).

Trend direction indicator:
- ↑ (improving): ratio < 0.95
- → (stable): 0.95 ≤ ratio ≤ 1.05
- ↓ (degrading): ratio > 1.05

#### 3. Flaky Test Percentage (Weight: 20%)

A test is "flaky" if it failed in some builds but passed in others within the 30-day window (same test name, mixed outcomes):

```
flaky_count = tests that both passed and failed across builds
total_tests = distinct test names executed
flaky_pct = flaky_count / total_tests
score = clamp(100 - (flaky_pct × 500), 0, 100)
```

- 0% flaky → 100.
- 5% flaky → 75.
- 20%+ flaky → 0.

If no test results exist, this component is excluded and its weight redistributed.

#### 4. Queue Wait Time (Weight: 15%)

Average time between build queued and build started:

```
avg_wait = mean(build.startTime - build.queueTime) across builds
score = clamp(100 - (avg_wait_seconds - 30) × 0.5, 0, 100)
```

- ≤ 30s wait → 100.
- 90s wait → 70.
- 230s+ wait → 0.

This reflects infrastructure health and agent pool capacity.

#### 5. Failure Clustering (Weight: 15%)

Detects recurring identical failures by grouping failed builds by their first error message (normalized — stripped of timestamps, build numbers, paths):

```
clusters = group failed builds by normalized_error
recurring_clusters = clusters with count ≥ 3
score = clamp(100 - recurring_clusters × 25, 0, 100)
```

- 0 recurring clusters → 100.
- 2 clusters → 50.
- 4+ clusters → 0.

### Composite Score

```
composite = Σ (component_score × weight)
```

Rounded to the nearest integer. If a component is unavailable (e.g., no tests), its weight is redistributed proportionally across the remaining components.

## Visualization

### Primary View: Gauge + Breakdown

**Gauge**: Large circular arc (180° or 270°) displaying the composite score 0–100. Color gradient follows the score: green (80–100) → yellow (50–79) → red (0–49).

**Breakdown Cards**: Five cards arranged beside or below the gauge, one per component:
- Component name and icon.
- Raw metric value (e.g., "92%", "12m", "45s").
- Component score as a small bar or number.
- Trend indicator arrow (↑ ↓ →) with color.

**Trend Sparkline**: Below the gauge, a 30-day mini line chart showing daily composite score. Hover reveals the date and score.

### Leaderboard View

A sortable table of all pipelines in the project:

| Rank | Pipeline | Score | Success | Duration | Flaky | Queue | Failures | Trend |
|------|----------|-------|---------|----------|-------|-------|----------|-------|
| 1 | Build-Core | 92 | 98% | 8m ↓ | 1% | 12s | 0 | ↑ |
| 2 | Deploy-Staging | 78 | 92% | 12m ↑ | 3% | 45s | 2 | → |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

Sortable by any column. Color-coded score cells. Click a row to navigate to that pipeline's detailed scorecard.

### Where It Lives

1. **Dashboard view**: New "Health" tab in the main visualizer app alongside the existing pipeline diagram.
2. **Per-pipeline badge**: Inline score badge (e.g., `Health: 78`) shown in the pipeline list and the pipeline diagram node tooltip.
3. **Chrome extension**: Optional injection of a small score badge on ADO pipeline definition pages.

## Alerting Thresholds

Configurable in `apv.config.json`:

```json
{
  "healthScorecard": {
    "alertThresholds": {
      "critical": 40,
      "warning": 65
    },
    "weights": {
      "successRate": 0.30,
      "durationTrend": 0.20,
      "flakyTests": 0.20,
      "queueWait": 0.15,
      "failureClusters": 0.15
    },
    "collectionDays": 30,
    "cacheTtlMinutes": 15
  }
}
```

When a pipeline's score drops below a threshold:
- **Warning (< 65)**: Yellow indicator in the dashboard and leaderboard.
- **Critical (< 40)**: Red indicator, optional browser notification via the Chrome extension.

Users can subscribe to score change notifications per pipeline.

## Implementation Notes

### Server Side (`packages/server`)

- New route: `GET /api/health/{org}/{project}/{definitionId}` — returns the computed scorecard JSON.
- Build history and timeline data cached in the existing disk cache, keyed by `{org}/{project}/health/{definitionId}/{date}`.
- Test result aggregation runs server-side to avoid sending large payloads to the client.

### Core Package (`packages/core`)

- New module: `packages/core/src/health/` containing:
  - `score-calculator.ts` — Pure functions for each component score and the composite.
  - `failure-normalizer.ts` — Error message normalization for clustering.
  - `types.ts` — `HealthScore`, `ScoreBreakdown`, `ScoreComponent` types.
- Zero runtime dependencies — all scoring logic is pure math on pre-fetched data.

### Web Package (`packages/web`)

- New `HealthScorecard` component with gauge, breakdown cards, and sparkline.
- New `HealthLeaderboard` component with sortable table.
- Gauge rendered with SVG `<path>` arcs (no charting library dependency).
- Sparkline rendered with SVG `<polyline>`.

## Performance Considerations

- Fetching 100 builds + timelines can be slow. Paginate API calls and cache aggressively.
- Score computation is O(n × m) where n = builds and m = test results. Keep n ≤ 100.
- Leaderboard fetches scores for all pipelines in parallel with `Promise.all`, bounded to 10 concurrent requests.
- Stale-while-revalidate pattern: serve cached score immediately, recompute in the background.

## Open Questions

- Should the leaderboard support cross-project comparison (requires multi-project API access)?
- Should scores be stored historically to show long-term health trends beyond the 30-day window?
- Should the scoring weights be user-configurable per pipeline, or fixed project-wide?
- How to handle pipelines with very few builds (< 5 in 30 days) — exclude from leaderboard or show "insufficient data"?
