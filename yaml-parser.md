# YAML Parser — Deep Dive & Enhancement Plan

## Context

This document compares our current `@apv/core` parser against the **official Azure Pipelines parser**
([`PipelineParser.cs`](https://github.com/microsoft/azure-pipelines-agent/blob/master/src/Agent.Listener/DistributedTask.Pipelines/Yaml/PipelineParser.cs))
and the [official JSON schema](https://github.com/microsoft/azure-pipelines-vscode/blob/main/service-schema.json)
(v1.261.1, 1.6 MB) from the VS Code extension.

Our goal is **visualization**, not execution — so we don't need to replicate the full pipeline runtime.
But understanding the official parser reveals gaps in how we resolve templates and represent the
final expanded pipeline.

---

## 1. Official Parser Architecture

### 1.1 Core Algorithm (`PipelineParser.cs`)

```
LoadInternal(defaultRoot, path, mustacheContext)
  ├── ResolvePath(defaultRoot, path)          → canonical file path
  ├── LoadFile<Process, ProcessConverter>()
  │     ├── Read front-matter (YAML --- block) → mustache context vars
  │     ├── Merge mustache context from caller
  │     ├── Evaluate mustache expressions       → string with {{ }} replaced
  │     └── Deserialize YAML → Process object
  ├── ResolveTemplates(process, processFile.Directory)
  │     ├── If process.Template → load ProcessTemplate, merge into process
  │     ├── Else if process.Phases → ResolveTemplates(phases)
  │     ├── Else → ResolveTemplates(variables) + ResolveTemplates(steps)
  │     └── (recursive for each level)
  └── Create implied levels (steps-only → wrap in Phase)
```

**Key behaviors:**
- **Inline replacement**: template references are removed from the list and replaced
  with the template's contents at that position. The final `Process` object contains
  no template references — everything is flattened.
- **Relative path resolution**: `IFileProvider.ResolvePath(defaultRoot, path)` resolves
  template paths relative to the *referencing* file's directory.
- **File count limit**: `ParseOptions.MaxFiles` caps total files loaded (prevents infinite recursion).
- **Mustache templating**: front-matter variables + caller parameters feed into `{{ }}` expressions
  *before* YAML deserialization.

### 1.2 Contract Type Hierarchy

```
Template hierarchy (what a template file deserializes into):
  StepsTemplate          { Steps: IList<IStep> }
  └── PhasesTemplate     { Phases: IList<IPhase> } + inherited Steps
      └── ProcessTemplate { Resources } + inherited Phases, Steps

Template reference hierarchy (how references appear in YAML):
  StepsTemplateReference  : IStep    { Name, Parameters, StepOverrides }
  └── PhasesTemplateReference : IPhase  { PhaseSelectors } + inherited
      └── ProcessTemplateReference      (no extra properties)

  VariablesTemplateReference : IVariable { Name, Parameters }

Key insight: template refs implement the *same interface* as the items they replace.
A StepsTemplateReference IS an IStep — it appears in a steps list and gets replaced
with the template's actual steps during resolution.
```

### 1.3 Step Overrides (StepGroup)

Templates can define named injection points:

```yaml
# template.yml
steps:
  - stepGroup: preSteps    # ← named placeholder
  - task: Build@1
  - stepGroup: postSteps   # ← named placeholder
```

Callers fill them:

```yaml
steps:
  - template: template.yml
    stepOverrides:
      preSteps:
        - script: echo "before build"
      postSteps:
        - script: echo "after build"
```

`PhaseSelector` extends this to target specific phases within a PhasesTemplate.

### 1.4 Resource Merging

When a template defines `resources:`, they merge with the process resources.
Process-level resources win on name conflicts:

```csharp
MergeResources(processResources, templateResources)
// result = processResources + templateResources.Where(not-already-in-process)
```

---

## 2. Official JSON Schema (service-schema.json)

### 2.1 Pipeline Variants (7 forms)

| Required field | Description |
|---|---|
| `stages` | Multi-stage pipeline |
| `extends` | Template extension |
| `jobs` | Multi-job pipeline (no stages) |
| `phases` | Legacy (pre-stages) |
| `steps` (×3 variants) | Single-job shorthand (pool/queue/server) |

All variants share: `pool`, `name`, `trigger`, `pr`, `schedules`, `resources`, `variables`, `parameters`, `lockBehavior`

### 2.2 Template References at Every Level

Each level supports `{ template, parameters }` as an alternative to its concrete form:

| Level | Concrete form | Template form |
|---|---|---|
| Stage | `{ stage: "name", jobs: [...] }` | `{ template: "path.yml", parameters: {...} }` |
| Job | `{ job: "name", steps: [...] }` | `{ template: "path.yml", parameters: {...} }` |
| Deployment | `{ deployment: "name", strategy: {...} }` | (same template form as job) |
| Step | `{ task: "Name@V" }`, `{ script: "..." }`, etc. | `{ template: "path.yml", parameters: {...} }` |
| Variable | `{ name: "x", value: "y" }`, `{ group: "g" }` | `{ template: "path.yml", parameters: {...} }` |

### 2.3 Step Types (12 forms)

`task`, `script`, `powershell`, `pwsh`, `bash`, `checkout`, `download`, `downloadBuild`,
`getPackage`, `upload` (deprecated), `publish`, `reviewApp`, `template`

Common step properties: `condition`, `continueOnError`, `displayName`, `enabled`, `env`,
`name`, `target`, `timeoutInMinutes`, `retryCountOnTaskFailure`

### 2.4 `templateContext`

A newer mechanism (not in the older PipelineParser.cs) for passing opaque context from
the calling pipeline to a template when using `extends`. Appears on stages, jobs, and
deployments.

---

## 3. What Our Parser Does Today

### 3.1 Strengths ✅

| Capability | Status |
|---|---|
| YAML parsing (js-yaml) | ✅ |
| Type model (Pipeline, Stage, Job, Step) | ✅ Comprehensive |
| Template reference detection at all levels | ✅ extends, stages, jobs, steps, variables |
| Conditional `${{ if }}` block detection | ✅ |
| `@alias` and `@self` parsing | ✅ |
| Cross-repo `project/repo` resolution | ✅ |
| Relative path resolution | ✅ |
| Task reference extraction + doc URL resolution | ✅ |
| IFileProvider abstraction for testability | ✅ |

### 3.2 Gaps ❌

| Capability | Status | Impact on Visualization |
|---|---|---|
| **Inline template expansion** (flattening) | ❌ | Can't show "final effective pipeline" |
| **Parameter substitution** (`${{ parameters.x }}`) | ❌ | Template content shown with unresolved `${{ }}` |
| **Expression evaluation** (`${{ if eq(...) }}`) | ❌ | Can't determine which conditional branches apply |
| **Step overrides / StepGroup** | ❌ | Missing injection point visualization |
| **Implied level creation** (steps → job → stage) | ❌ | Minor: UI already handles all 3 layouts |
| **Mustache/front-matter** | ❌ | Legacy; rarely used in modern pipelines |
| **templateContext** | ❌ | Newer feature; context not shown |
| **Depth/file limits** | ❌ Partial | We have maxDepth in resolver but no file count cap |
| **Variable expansion** (`$(var)`) | ❌ | Display-only; not critical for visualization |

---

## 4. Enhancement Plan

### Phase 1: Inline Template Expansion (Flattening)

**Goal**: Given a root pipeline, produce a fully-expanded `Pipeline` object where all
template references have been replaced with their resolved contents.

```typescript
interface ExpandedPipeline {
  /** The fully-resolved pipeline with templates inlined. */
  pipeline: Pipeline;
  /** Metadata about each expansion that occurred. */
  expansions: ExpansionRecord[];
  /** Files that were loaded during expansion. */
  filesLoaded: string[];
  /** Errors encountered (non-fatal — missing templates, etc.). */
  errors: ExpansionError[];
}

interface ExpansionRecord {
  /** Where the template ref was found. */
  location: TemplateLocation;
  /** The original template reference. */
  ref: TemplateReference;
  /** What it resolved to (stages/jobs/steps/variables count). */
  resolvedItems: number;
  /** Depth of this expansion (0 = root file). */
  depth: number;
}
```

**Algorithm** (mirrors PipelineParser.cs):

```
expandPipeline(fileProvider, rootPath, maxFiles = 50)
  ├── loadAndParse(rootPath) → raw YAML
  ├── If extends → expandProcessTemplate(extendsRef)
  │     ├── Load template file
  │     ├── Recursively expand nested refs in template
  │     └── Replace extends block with template's stages/jobs/steps
  ├── expandStages(stages)
  │     └── For each stage: if template → load & inline; else recurse into jobs
  ├── expandJobs(jobs)
  │     └── For each job: if template → load & inline; else recurse into steps
  ├── expandSteps(steps)
  │     └── For each step: if template → load & inline
  └── expandVariables(variables)
        └── For each var: if template → load & inline
```

**Testability**: Use `InMemoryFileProvider` (already exists) to test expansion with
known template trees without any I/O.

### Phase 2: Parameter Substitution

**Goal**: Replace `${{ parameters.x }}` expressions in YAML text before parsing.

```typescript
interface SubstitutionContext {
  parameters: Record<string, unknown>;
  variables?: Record<string, string>;
}

function substituteExpressions(yaml: string, context: SubstitutionContext): string;
```

**Scope**: Start with simple `${{ parameters.x }}` replacement (string interpolation).
Do NOT attempt full expression evaluation (`eq()`, `ne()`, `and()`, etc.) initially — 
mark those as "unresolved" for the UI to display.

**Approach**:
1. Regex scan for `${{ parameters.NAME }}` patterns
2. Look up `NAME` in the provided parameters map
3. Replace with the stringified value
4. For complex expressions (`${{ if ... }}`), leave as-is but tag them

### Phase 3: Conditional Branch Resolution

**Goal**: Evaluate `${{ if }}` / `${{ else }}` blocks to determine which branches are active.

This is the hardest part and may not be fully achievable (runtime variables are unknown
at parse time). Practical approach:

- **Known parameters**: When expanding a template with specific parameter values, evaluate
  simple conditions (`eq`, `ne`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`)
- **Unknown variables**: Show both branches in the UI, labeled as conditional
- **Expression parser**: Implement a subset of the [ADO expression syntax](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/expressions)

### Phase 4: "Effective Pipeline" View in UI

**Goal**: Add a toggle in the UI to switch between:
1. **Template view** (current) — shows the template reference graph
2. **Effective view** (new) — shows the fully-expanded pipeline as a single flattened YAML

The effective view would use Monaco to display the expanded YAML, with annotations
showing which sections came from which template file (via `ExpansionRecord` metadata).

---

## 5. Implementation Priority

| # | Enhancement | Effort | Value for Visualization |
|---|---|---|---|
| 1 | Inline template expansion | Medium | **High** — enables "effective pipeline" view |
| 2 | Simple parameter substitution | Medium | **High** — templates become readable |
| 3 | Depth/file count limits | Small | Medium — prevents runaway expansion |
| 4 | Effective pipeline UI view | Medium | **High** — the payoff of #1 and #2 |
| 5 | Conditional branch evaluation | Large | Medium — nice-to-have, complex |
| 6 | Step overrides / StepGroup | Small | Low — rarely used in modern pipelines |
| 7 | templateContext | Small | Low — metadata, not structural |
| 8 | Variable expansion | Medium | Low — runtime values unknown |

---

## 6. Key Design Decisions

### Keep detection separate from expansion

Our current `detectTemplateReferences()` is for **visualization** (building the graph).
The new `expandPipeline()` is for **flattening** (producing the effective YAML).
Both use `IFileProvider` but serve different purposes. Don't merge them.

### Don't try to be a runtime

The official parser evaluates mustache templates, resolves runtime variables, and handles
agent-specific logic. We should NOT replicate this. Our goal is:
- Show the template structure (graph view) ← already done
- Show the effective YAML (flattened view) ← Phase 1 + 2
- Show what's conditional vs. guaranteed ← Phase 3

### File provider stays async

Unlike the C# parser (synchronous `GetFile`), our `IFileProvider` is async because it may
call the ADO REST API. The expansion algorithm must be async-aware.

### Expansion is opt-in and lazy

Don't auto-expand everything on load. The graph view loads templates on-demand (click to expand).
The "effective view" triggers a full expansion only when the user requests it.
