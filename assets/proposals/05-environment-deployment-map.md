# Feature 5: Environment & Deployment Map

## Summary

Visualize which pipelines deploy to which environments as a left-to-right flow diagram: **Pipeline → Stages → Environments**. Each environment node shows deployment history, approval gates, checks, and deployment strategy details. Lives as a new dedicated web view.

## Motivation

Teams with multiple pipelines deploying to shared environments (Dev → Staging → Prod) lack a holistic view of their deployment topology. Today, understanding "which pipelines touch Prod?" or "what approvals gate the Staging environment?" requires manually inspecting YAML across many repos. This feature provides that map at a glance.

## Data Sources

### APIs

| API | Endpoint | Data |
|---|---|---|
| Environments | `GET /_apis/pipelines/environments` | Environment list with IDs, names, descriptions |
| Environment Resources | `GET /_apis/pipelines/environments/{id}` | Linked Kubernetes clusters, VMs, resources |
| Deployment Jobs | Timeline API records with `type: "Deployment"` | Which stages deploy and their target environments |
| Environment Checks | `GET /_apis/pipelines/checks/configurations?resourceType=environment&resourceId={id}` | Approval gates, business hours, template checks, invoke REST API checks |
| Deployment History | `GET /_apis/pipelines/environments/{id}/environmentdeploymentrecords` | Historical deployments per environment |

### YAML Sources

```yaml
stages:
  - stage: DeployDev
    jobs:
      - deployment: DeployWeb
        environment: 'Dev.web-app'
        strategy:
          runOnce:
            deploy:
              steps: [...]

  - stage: DeployProd
    jobs:
      - deployment: DeployWeb
        environment: 'Production.web-app'
        strategy:
          rolling:
            maxParallel: 25%
            preDeploy:
              steps: [...]
            deploy:
              steps: [...]
            routeTraffic:
              steps: [...]
            postRouteTraffic:
              steps: [...]
```

Key YAML fields: `environment:` (name + resource), `strategy:` (runOnce | rolling | canary).

## Graph Layout

### Columns (Left to Right)

1. **Pipeline Definitions** — Each pipeline definition that has deployment jobs
2. **Deployment Stages** — The stages within each pipeline (e.g., Deploy-Dev, Deploy-Staging, Deploy-Prod)
3. **Environments** — The target environments (Dev, Staging, Production)

### Edges

- Pipeline → Stage: always shown
- Stage → Environment: derived from `environment:` field in deployment jobs
- Environment → Environment: inferred promotion path (if stages are sequential with `dependsOn`)

### Node Types

| Node | Shape | Color | Content |
|---|---|---|---|
| Pipeline | Rounded rect | Blue (#3B82F6) | Pipeline name, repo |
| Stage | Rounded rect | Gray (#6B7280) | Stage name, condition |
| Environment | Large rect | Varies (see below) | Name, resource count, last deploy status |
| Approval Gate | Diamond | Amber (#F59E0B) | Approver names, timeout |
| Check | Small circle | Purple (#8B5CF6) | Check type icon |

### Environment Color Coding

| Environment Pattern | Color | Rationale |
|---|---|---|
| `*dev*`, `*development*` | Green (#22C55E) | Safe, frequently deployed |
| `*stag*`, `*uat*`, `*qa*` | Yellow (#EAB308) | Pre-production, caution |
| `*prod*`, `*production*`, `*live*` | Red (#EF4444) | Critical, high impact |
| Other | Blue (#3B82F6) | Default |

Detection is case-insensitive substring matching on environment name.

## Approval & Check Timeline Overlay

When a user clicks on an environment node, an overlay panel slides in showing:

### Checks & Gates

| Check Type | Icon | Display |
|---|---|---|
| Manual Approval | 🔒 | Approver list, min approvals, timeout |
| Business Hours | 🕐 | Allowed time windows |
| Template Validation | 📋 | Required template path |
| Invoke REST API | 🌐 | Endpoint, success criteria |
| Exclusive Lock | 🔐 | Lock scope, timeout |

### Timeline

A horizontal timeline strip showing recent deployments to this environment:

```
[✓ #456 2h ago] ← [✓ #455 1d ago] ← [✗ #454 2d ago] ← [✓ #453 3d ago]
```

Each entry shows: build number, status icon, relative time, deploying pipeline name.

## Deployment Strategy Visualization

When a deployment job uses a multi-lifecycle strategy (rolling, canary), the stage-to-environment edge expands into a sub-flow:

### runOnce
```
deploy
```

### rolling
```
preDeploy → deploy → routeTraffic → postRouteTraffic
```

### canary
```
preDeploy → deploy (X%) → routeTraffic → postRouteTraffic → deploy (100%)
```

Each lifecycle hook is shown as a small node within the edge, with step count badges.

## Where It Lives

### New Web View: `/environments`

A dedicated page in the web SPA, accessible from the main navigation. Not embedded in the existing pipeline template tree — this is a different conceptual view (deployment topology vs. template structure).

### Navigation

- Add "Environments" tab to the top navigation bar
- Deep-link support: `/environments?org={org}&project={project}&env={envName}`
- From a pipeline node in the existing template tree, add a context menu action: "View deployments →"

## Implementation

### Server Package

New API routes:

```
GET /api/environments?org={org}&project={project}
GET /api/environments/{envId}/checks
GET /api/environments/{envId}/deployments?top=20
GET /api/pipeline/{definitionId}/deployment-stages
```

Each endpoint proxies to the corresponding ADO REST API with caching:
- Environment list: 5-minute TTL (environments rarely change)
- Checks: 5-minute TTL
- Deployment history: 30-second TTL (frequently updated)

### Core Package

Add `packages/core/src/models/environment.ts`:

```typescript
export interface EnvironmentNode {
  id: number;
  name: string;
  category: 'dev' | 'staging' | 'prod' | 'other';
  resources: EnvironmentResource[];
  checks: EnvironmentCheck[];
  lastDeployment?: DeploymentRecord;
}

export interface DeploymentStageMapping {
  pipelineId: number;
  pipelineName: string;
  stageName: string;
  environmentName: string;
  strategy: 'runOnce' | 'rolling' | 'canary';
}
```

Add `packages/core/src/environment-classifier.ts` — pure function to classify environments by name pattern.

### Web Package

- New `<EnvironmentMap>` page component using ReactFlow for the graph
- New `<EnvironmentDetailPanel>` slide-in overlay
- New `<DeploymentTimeline>` horizontal timeline component
- New `<StrategySubFlow>` inline node component

## Edge Cases

- **Environments with no deployments**: Show as dimmed nodes with "No deployments" label
- **Pipelines targeting dynamic environment names** (`environment: ${{ parameters.env }}`): Show with a parameter icon and tooltip
- **Cross-project environments**: Not supported in v1; show warning if detected
- **Large graphs (50+ pipelines)**: Add filtering by environment, pipeline, or date range; collapse low-activity nodes

## Rollout

1. **Phase 1**: Static environment map (pipeline → environment edges from YAML parsing)
2. **Phase 2**: Live deployment history timeline overlay
3. **Phase 3**: Approval/check visualization + deployment strategy sub-flows
4. **Phase 4**: Cross-pipeline promotion path inference
