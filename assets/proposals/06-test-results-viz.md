# Feature 6: Test Results Visualization

## Summary

Visualize test results for a build as an interactive dashboard with four panels: a treemap by namespace, a bar chart of slowest tests, a flaky test detector, and summary counters. Accessible as a drill-down from the build timeline or as a standalone view.

## Motivation

Azure DevOps shows test results in a flat table. This makes it hard to answer common questions: "Which namespaces have the most failures?", "Which tests are flaky?", "What are the slowest tests dragging down CI?" This feature surfaces these insights visually.

## Data Sources

### Test Results API

```
GET /{org}/{project}/_apis/test/Runs?buildUri={buildUri}&api-version=7.0
GET /{org}/{project}/_apis/test/Runs/{runId}/results?api-version=7.0&$top=10000
```

Each result contains:

| Field | Type | Description |
|---|---|---|
| `testCaseTitle` | string | Human-readable test name |
| `outcome` | string | `Passed`, `Failed`, `NotExecuted`, `Aborted`, `Inconclusive` |
| `durationInMs` | number | Execution time in milliseconds |
| `automatedTestName` | string | Full qualified name (e.g., `MyApp.Tests.Auth.LoginTests.ShouldValidateToken`) |
| `automatedTestStorage` | string | Assembly/file name |
| `errorMessage` | string | Failure message (null if passed) |
| `stackTrace` | string | Stack trace (null if passed) |

### Flaky Detection (Cross-Run)

To detect flaky tests, fetch results from the last N runs (configurable, default 10):

```
GET /_apis/test/Runs?buildDefinitionId={defId}&$top=10&api-version=7.0
```

Then for each run, fetch results and compare outcomes for the same `automatedTestName`.

## Chart Types & Panels

### Panel 1: Namespace Treemap

**What**: A treemap where each rectangle represents a test namespace. Rectangles are nested by namespace hierarchy (e.g., `MyApp` → `Tests` → `Auth`).

**Size** = total duration of tests in that namespace
**Color** = pass rate:
- 100% pass → Green (#22C55E)
- 50-99% pass → Yellow (#EAB308)
- <50% pass → Red (#EF4444)
- All skipped → Gray (#94A3B8)

**Interaction**: Click a namespace to zoom in. Click a leaf test to see details (name, duration, error message).

### Panel 2: Slowest Tests Bar Chart

**What**: Horizontal bar chart showing the top 10 slowest tests.

**X-axis** = duration (ms)
**Y-axis** = test name (truncated to last 2 segments of `automatedTestName`)
**Color** = outcome (green=pass, red=fail)

**Interaction**: Hover for full test name + exact duration. Click to navigate to test detail.

### Panel 3: Flaky Tests List

**What**: A table/list of tests that have flipped between pass and fail across recent runs.

| Column | Description |
|---|---|
| Test Name | Last 2 segments of `automatedTestName` |
| Flip Count | Number of pass↔fail transitions in last N runs |
| Pattern | Visual indicator: `✓✗✓✓✗` showing outcomes per run |
| Current | Current outcome |

**Sorting**: By flip count (descending).

**Flaky Detection Algorithm**:

```typescript
function detectFlakyTests(
  runsResults: Map<number, TestResult[]>,
  minFlips: number = 2
): FlakyTest[] {
  // 1. Group results by automatedTestName across all runs
  // 2. For each test, build outcome sequence ordered by run date
  // 3. Count transitions: outcome[i] !== outcome[i-1]
  // 4. Filter to tests with transitions >= minFlips
  // 5. Sort by flip count descending
}
```

A test is considered "flaky" if it has ≥2 outcome transitions (pass→fail or fail→pass) across the recent N runs. This distinguishes genuinely flaky tests from consistently failing ones.

### Panel 4: Summary Counters

**What**: Four big-number cards:

| Counter | Color | Icon |
|---|---|---|
| Total Tests | Blue (#3B82F6) | 📊 |
| Passed | Green (#22C55E) | ✓ |
| Failed | Red (#EF4444) | ✗ |
| Skipped | Yellow (#EAB308) | ⊘ |

Plus a pass rate percentage bar beneath.

## Failure Grouping by Error Pattern

Beyond the four panels, a collapsible section groups failed tests by error message similarity:

### Algorithm

```typescript
function groupByErrorPattern(failures: TestResult[]): ErrorGroup[] {
  // 1. Extract first line of errorMessage
  // 2. Normalize: remove GUIDs, timestamps, file paths, line numbers
  // 3. Group by normalized message (exact match after normalization)
  // 4. Sort groups by count descending
  // 5. Each group shows: pattern, count, sample test names
}
```

**Normalization rules**:
- Replace GUIDs (`[a-f0-9-]{36}`) with `{guid}`
- Replace numbers after line/col indicators with `{N}`
- Replace absolute file paths with `{path}`
- Replace timestamps with `{timestamp}`

This surfaces common root causes: "15 tests failed with: Connection timeout to {host}:{port}".

## Interaction Model

### Entry Points

1. **Build Timeline Drill-Down**: From an existing build timeline node, click "Test Results" action
2. **Standalone View**: `/tests?org={org}&project={project}&buildId={buildId}`
3. **Build Detail Popup**: New "Tests" tab alongside existing tabs

### Cross-Panel Interaction

- Click a namespace in the treemap → filters bar chart and flaky list to that namespace
- Click a failed test in the bar chart → highlights it in the treemap and shows error detail
- All panels share a search/filter bar at the top

### Detail Drawer

Clicking any individual test opens a right-side drawer with:
- Full test name
- Duration + outcome
- Error message (formatted)
- Stack trace (syntax-highlighted)
- Run history sparkline (last 10 runs)

## Where It Lives

### Primary: Drill-Down from Build Timeline

The test dashboard opens as a full-width panel below the build timeline, pushing the timeline up. This maintains context (which build? which stage?) while showing test details.

### Secondary: Standalone Page

`/tests?org={org}&project={project}&buildId={buildId}` — bookmarkable, shareable.

## Implementation

### Server Package

New API routes:

```
GET /api/build/{buildId}/test-runs
GET /api/build/{buildId}/test-results          → aggregated across all runs
GET /api/build/{buildId}/test-flaky?runs=10    → flaky detection result
```

Caching:
- Completed build test results: cache indefinitely (immutable)
- In-progress build test results: 30-second TTL
- Flaky detection: 5-minute TTL (involves multiple API calls)

### Core Package

Add `packages/core/src/models/test-results.ts`:

```typescript
export interface TestNamespace {
  name: string;
  children: TestNamespace[];
  tests: TestLeaf[];
  totalDuration: number;
  passRate: number;
}

export interface TestLeaf {
  name: string;
  fullName: string;
  outcome: TestOutcome;
  durationMs: number;
  errorMessage?: string;
  stackTrace?: string;
}

export interface FlakyTest {
  testName: string;
  fullName: string;
  flipCount: number;
  outcomeHistory: TestOutcome[];  // ordered newest→oldest
  currentOutcome: TestOutcome;
}

export interface ErrorGroup {
  pattern: string;
  count: number;
  sampleTests: string[];
}
```

Add `packages/core/src/test-analyzer.ts`:

```typescript
export function buildNamespaceTree(results: TestResult[]): TestNamespace;
export function detectFlakyTests(runsResults: Map<number, TestResult[]>, minFlips?: number): FlakyTest[];
export function groupFailuresByPattern(failures: TestResult[]): ErrorGroup[];
export function getTopSlowest(results: TestResult[], limit?: number): TestResult[];
```

All pure functions — no API calls, suitable for the core package.

### Web Package

- `<TestDashboard>` — main container with 4-panel grid layout
- `<TestTreemap>` — D3.js treemap (or visx) for namespace visualization
- `<SlowestTestsChart>` — horizontal bar chart (recharts or visx)
- `<FlakyTestsList>` — sortable table with outcome pattern visualization
- `<TestSummaryCards>` — four big-number cards
- `<ErrorGroupPanel>` — collapsible failure groups
- `<TestDetailDrawer>` — right-side detail drawer

Charting library recommendation: **visx** (already React-based, tree-shakeable, good treemap support).

## Edge Cases

- **No test results**: Show empty state with message: "No test results found for this build"
- **Very large result sets (10K+ tests)**: Paginate API calls, render treemap at namespace level only (don't render leaf nodes until zoomed)
- **Missing `automatedTestName`**: Fall back to `testCaseTitle` for grouping; mark namespace as "Unknown"
- **Tests with 0ms duration**: Include in treemap but use minimum visible size; flag as "instant" in bar chart
- **Parallel test runs**: Multiple test runs per build — aggregate across all runs, dedup by `automatedTestName`

## Rollout

1. **Phase 1**: Summary counters + slowest tests bar chart (simplest, most value)
2. **Phase 2**: Namespace treemap with drill-down
3. **Phase 3**: Flaky test detection (requires cross-run data)
4. **Phase 4**: Error pattern grouping + detail drawer
