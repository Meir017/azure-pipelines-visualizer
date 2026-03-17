/**
 * Resolves an Azure DevOps pipeline task reference (e.g. `DotNetCoreCLI@2`)
 * to its Microsoft Learn documentation URL.
 *
 * Built-in tasks follow the pattern:
 *   https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/{kebab-name}-v{version}
 *
 * Custom tasks can be resolved via a lookup map.
 */

export interface TaskReference {
  /** Full string as written in YAML, e.g. "DotNetCoreCLI@2" */
  readonly raw: string;
  /** Task name without version, e.g. "DotNetCoreCLI" */
  readonly name: string;
  /** Major version number */
  readonly version: number;
}

/**
 * Parse a `task:` value into its name and version.
 * Accepts "TaskName@Version" or just "TaskName" (version defaults to 0).
 */
export function parseTaskReference(raw: string): TaskReference {
  const trimmed = raw.trim();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx > 0) {
    const name = trimmed.slice(0, atIdx);
    const ver = Number.parseInt(trimmed.slice(atIdx + 1), 10);
    return { raw: trimmed, name, version: Number.isNaN(ver) ? 0 : ver };
  }
  return { raw: trimmed, name: trimmed, version: 0 };
}

/**
 * Convert PascalCase to kebab-case for MS Learn URLs.
 * "DotNetCoreCLI" → "dot-net-core-cli"
 * "PublishBuildArtifacts" → "publish-build-artifacts"
 */
export function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

const MS_LEARN_BASE =
  'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference';

/**
 * Resolve a task reference to its documentation URL.
 *
 * Priority:
 * 1. Exact match in customTaskDocs (name or name@version)
 * 2. Built-in MS Learn URL (for tasks without dots in their name)
 * 3. null if no URL can be determined
 */
export function resolveTaskDocUrl(
  ref: TaskReference,
  customTaskDocs?: Record<string, string>,
): string | null {
  if (customTaskDocs) {
    // Try exact match with version first
    const withVersion = `${ref.name}@${ref.version}`;
    if (customTaskDocs[withVersion]) return customTaskDocs[withVersion];
    // Try name-only match
    if (customTaskDocs[ref.name]) return customTaskDocs[ref.name];
  }

  // Tasks with dots (e.g. "OneBranch.Pipeline.Build") are custom/3rd-party — no MS Learn docs
  if (ref.name.includes('.')) return null;

  const kebab = pascalToKebab(ref.name);
  return `${MS_LEARN_BASE}/${kebab}-v${ref.version}`;
}

/**
 * Extract all task references from a parsed YAML object.
 * Walks through stages → jobs → steps looking for `task:` fields.
 */
export function extractTaskReferences(raw: Record<string, unknown>): TaskReference[] {
  const refs: TaskReference[] = [];
  const seen = new Set<string>();

  function walkSteps(steps: unknown[]) {
    for (const step of steps) {
      if (step && typeof step === 'object' && 'task' in step) {
        const taskVal = (step as Record<string, unknown>).task;
        if (typeof taskVal === 'string' && !seen.has(taskVal)) {
          seen.add(taskVal);
          refs.push(parseTaskReference(taskVal));
        }
      }
    }
  }

  function walkJobs(jobs: unknown[]) {
    for (const job of jobs) {
      if (job && typeof job === 'object') {
        const j = job as Record<string, unknown>;
        if (Array.isArray(j.steps)) walkSteps(j.steps);
      }
    }
  }

  function walkStages(stages: unknown[]) {
    for (const stage of stages) {
      if (stage && typeof stage === 'object') {
        const s = stage as Record<string, unknown>;
        if (Array.isArray(s.jobs)) walkJobs(s.jobs);
      }
    }
  }

  // Top-level steps (single job shorthand)
  if (Array.isArray(raw.steps)) walkSteps(raw.steps);
  // Top-level jobs (no stages)
  if (Array.isArray(raw.jobs)) walkJobs(raw.jobs);
  // Stages
  if (Array.isArray(raw.stages)) walkStages(raw.stages);

  return refs;
}
