# Feature 12: Condition Truth Table

## Summary

For conditional stages, jobs, and steps in an Azure Pipeline, display a truth table showing which conditions evaluated to true or false for a given run, along with the actual variable and parameter values that drove each decision. Includes an expression tree visualization showing how sub-expressions combine. Answers "why didn't stage X run?" visually.

## Motivation

Azure Pipelines conditions can be complex:

```yaml
condition: and(succeeded(), ne(variables['Build.Reason'], 'PullRequest'), eq(variables['isProduction'], 'true'))
```

When a stage or job doesn't run, users must mentally evaluate the condition against the run's actual context. For deeply nested `${{ if }}` blocks with parameter expressions, this is even harder because the evaluation happens at compile time and the result is invisible in the UI.

This feature provides:

- Instant clarity on *why* something ran or didn't run.
- A debugging tool for condition authoring.
- Visibility into compile-time `${{ if }}` evaluation (which the existing `expression-evaluator.ts` already computes).

## Extracting Conditions from YAML

### Runtime Conditions

These appear on stages, jobs, and steps:

```yaml
stages:
- stage: Deploy
  condition: and(succeeded(), eq(variables['env'], 'prod'))
```

The existing YAML parser can extract `condition:` values. Add a new `detectConditions()` function to the core package that walks the parsed YAML and returns:

```typescript
interface ConditionEntry {
  path: string;             // e.g., "stages[0].Deploy"
  type: 'stage' | 'job' | 'step';
  name: string;             // e.g., "Deploy"
  expression: string;       // raw condition string
  isCompileTime: boolean;   // ${{ }} vs runtime
}
```

### Compile-Time Conditions

Template expressions using `${{ if }}`:

```yaml
steps:
- ${{ if eq(parameters.runTests, true) }}:
  - script: npm test
```

The existing `template-detector.ts` already identifies `${{ if }}` blocks when extracting template references. Extend it to also capture the condition expressions themselves and their evaluated results.

## Evaluation with Run Context

### Compile-Time Expressions

The existing `expression-evaluator.ts` in the core package already supports:

- `parameters.*` and `variables.*` resolution
- All built-in functions: `eq`, `ne`, `and`, `or`, `not`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`, `containsValue`, etc.
- Nested expressions and string coercion

For compile-time conditions, we already have the parameter/variable context flowing through the template tree (via `_parentParamContext`, `_accumulatedVariables` on `PipelineDiagram` nodes). Wire the truth table into this existing context propagation.

### Runtime Conditions

For runtime conditions evaluated against actual run data:

1. Fetch the run's variables from `GET /_apis/pipelines/{id}/runs/{runId}`.
2. Fetch the run's parameters from the same endpoint.
3. Include predefined variables: `Build.Reason`, `Build.SourceBranch`, `System.PullRequest.*`, `Agent.*`, etc.
4. Evaluate each condition expression using `expression-evaluator.ts` with the actual context.

### Evaluation Result

```typescript
interface ConditionResult {
  entry: ConditionEntry;
  result: boolean;
  variablesUsed: Array<{
    name: string;
    value: string | boolean | number;
    source: 'parameter' | 'variable' | 'predefined';
  }>;
  subExpressions: ExpressionNode[];  // AST with per-node evaluation results
}
```

## Truth Table Layout

### Table View

| Stage/Job/Step | Condition Expression | Variables Used | Result |
|---|---|---|---|
| Deploy | `and(succeeded(), eq(variables['env'], 'prod'))` | `env = "prod"` | ✓ |
| RunTests | `eq(parameters.runTests, true)` | `runTests = false` | ✗ |
| Notify | `always()` | — | ✓ |
| Rollback | `failed()` | — | ✗ |

Features:

- **Sortable** by name, result, or expression complexity.
- **Filterable** by result (show only skipped, show only run).
- **Searchable** across condition expressions and variable names.
- **Color coding**: Green row background for ✓, red tint for ✗.
- **Expand row** to see the expression tree (below).

### Expression Tree Visualization

When a row is expanded, show the parsed AST as a tree:

```
and(succeeded(), eq(variables['env'], 'prod'))
│
├── succeeded()     → ✓ true
│
└── eq(_, _)        → ✓ true
    ├── variables['env']  → "prod"
    └── 'prod'            → "prod"
```

Visual encoding:

- **Green nodes** (filled circle) = evaluated to true.
- **Red nodes** (filled circle) = evaluated to false.
- **Gray nodes** = literal values (not boolean).
- **Edges** connect parent functions to their arguments.
- **Inline values** shown next to each leaf node.

For complex conditions, the tree makes it immediately obvious which sub-expression caused a `false` result.

## Where It Appears

### 1. Template Tree Overlay

In the existing `PipelineDiagram`, each node that has a condition gets a small badge (✓/✗). Clicking the badge opens the truth table as a popover scoped to that node's conditions.

This integrates naturally because `PipelineDiagram` already:

- Propagates parameter context via `_parentParamContext`.
- Evaluates `${{ if }}` conditions via `_conditionResult`.
- Has the accumulated variable context via `_accumulatedVariables`.

### 2. Standalone Condition Explorer

A dedicated panel (slide-out or tab) showing the full truth table for all conditions in the pipeline. Accessed via a toolbar button: "Condition Explorer".

### 3. Build Timeline Integration (future)

If the build timeline feature exists, overlay condition results on the timeline stages.

## Implementation Plan

### Phase 1 — Condition Extraction (core)

- [ ] Add `detectConditions()` to core package that walks YAML and returns `ConditionEntry[]`.
- [ ] Extend `expression-evaluator.ts` to return per-node evaluation results (AST with boolean annotations).
- [ ] Add types for `ConditionResult` and `ExpressionNode`.
- [ ] Unit tests: evaluate conditions against known contexts, verify truth table output.

### Phase 2 — Truth Table Component (web)

- [ ] Create `ConditionTruthTable` React component with sortable/filterable table.
- [ ] Create `ExpressionTree` component for the tree visualization (SVG or ReactFlow sub-graph).
- [ ] Wire into `PipelineDiagram` node data for compile-time conditions.

### Phase 3 — Runtime Context (server + web)

- [ ] Add server endpoint to fetch run variables/parameters.
- [ ] Evaluate runtime conditions against actual run context.
- [ ] Show combined compile-time + runtime truth table.

### Phase 4 — Polish

- [ ] Badge indicators on template tree nodes.
- [ ] "Why didn't this run?" quick action on skipped nodes.
- [ ] Expression syntax highlighting in the table.

## Leveraging Existing Code

This feature has strong foundations in the current codebase:

| Existing Code | How It's Used |
|---|---|
| `expression-evaluator.ts` | Already parses and evaluates the full Azure Pipelines expression language. Needs minor extension to return per-node results. |
| `template-detector.ts` | Already finds `${{ if }}` blocks. Extend to capture the condition text. |
| `PipelineDiagram.tsx` (`_conditionResult`) | Already evaluates conditions and uses results to include/exclude nodes. Surface these results in UI. |
| `_parentParamContext` / `_accumulatedVariables` | Already propagates context down the tree. Pass to truth table evaluator. |

## Open Questions

1. Should the expression tree use ReactFlow (consistent with the main diagram) or a simpler SVG tree layout?
2. For runtime conditions, `succeeded()` / `failed()` depend on the actual stage outcomes — should we fetch the full timeline or just show them as "depends on runtime"?
3. How to handle conditions that reference variable groups not visible to the current user (permissions)?
