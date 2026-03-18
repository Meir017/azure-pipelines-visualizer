/**
 * Resolves an Azure DevOps pipeline task reference (e.g. `DotNetCoreCLI@2`)
 * to its Microsoft Learn documentation URL.
 *
 * Built-in tasks follow the pattern:
 *   https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/{slug}-v{version}
 *
 * Slugs are looked up from a mapping sourced from the MS Learn task reference page.
 * Custom tasks can be resolved via a lookup map in apv.config.json.
 */

import { TASK_DOC_SLUGS } from './task-doc-slugs.js';

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
 * 1. Exact match in customTaskDocs (name@version or name)
 * 2. Known slug from the MS Learn task reference mapping
 * 3. Heuristic PascalCase → kebab-case (for tasks not yet in the mapping)
 * 4. null for custom/3rd-party tasks (names containing dots)
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

  // Look up the known slug from the MS Learn mapping
  const knownSlug = TASK_DOC_SLUGS[ref.name];
  if (knownSlug) {
    return `${MS_LEARN_BASE}/${knownSlug}-v${ref.version}`;
  }

  // Fallback: heuristic PascalCase → kebab-case for unknown tasks
  const kebab = pascalToKebab(ref.name);
  return `${MS_LEARN_BASE}/${kebab}-v${ref.version}`;
}

/**
 * Extract all task references from a parsed YAML object.
 * Walks through stages → jobs → steps looking for `task:` fields,
 * including inside conditional `${{ if }}` / `${{ else }}` blocks.
 */
export function extractTaskReferences(raw: Record<string, unknown>): TaskReference[] {
  const refs: TaskReference[] = [];
  const seen = new Set<string>();

  function addTask(taskVal: unknown) {
    if (typeof taskVal === 'string' && !seen.has(taskVal)) {
      seen.add(taskVal);
      refs.push(parseTaskReference(taskVal));
    }
  }

  function walkSteps(steps: unknown[]) {
    for (const step of steps) {
      if (!step || typeof step !== 'object') continue;
      const obj = step as Record<string, unknown>;

      if ('task' in obj) {
        addTask(obj.task);
      }

      // Walk conditional directive blocks: ${{ if }}, ${{ else }}, etc.
      for (const key of Object.keys(obj)) {
        if (key.startsWith('${{')) {
          walkConditionalValue(obj[key]);
        }
      }
    }
  }

  function walkConditionalValue(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        if ('task' in obj) addTask(obj.task);
        if (Array.isArray(obj.steps)) walkSteps(obj.steps);
        if (Array.isArray(obj.jobs)) walkJobs(obj.jobs);
        if (Array.isArray(obj.stages)) walkStages(obj.stages);
        for (const key of Object.keys(obj)) {
          if (key.startsWith('${{')) walkConditionalValue(obj[key]);
        }
      }
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('task' in obj) {
        addTask(obj.task);
      }
      // Recurse into nested conditionals
      for (const key of Object.keys(obj)) {
        if (key.startsWith('${{')) {
          walkConditionalValue(obj[key]);
        }
      }
      if (Array.isArray(obj.steps)) walkSteps(obj.steps);
      if (Array.isArray(obj.jobs)) walkJobs(obj.jobs);
      if (Array.isArray(obj.stages)) walkStages(obj.stages);
    }
  }

  function walkJobs(jobs: unknown[]) {
    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue;
      const j = job as Record<string, unknown>;
      if (Array.isArray(j.steps)) walkSteps(j.steps);
      // Walk conditional blocks at the job level
      for (const key of Object.keys(j)) {
        if (key.startsWith('${{')) {
          walkConditionalValue(j[key]);
        }
      }
    }
  }

  function walkStages(stages: unknown[]) {
    for (const stage of stages) {
      if (!stage || typeof stage !== 'object') continue;
      const s = stage as Record<string, unknown>;
      if (Array.isArray(s.jobs)) walkJobs(s.jobs);
      // Walk conditional blocks at the stage level
      for (const key of Object.keys(s)) {
        if (key.startsWith('${{')) {
          walkConditionalValue(s[key]);
        }
      }
    }
  }

  // Top-level steps (single job shorthand)
  if (Array.isArray(raw.steps)) walkSteps(raw.steps);
  // Top-level jobs (no stages)
  if (Array.isArray(raw.jobs)) walkJobs(raw.jobs);
  // Stages
  if (Array.isArray(raw.stages)) walkStages(raw.stages);
  // Top-level conditional blocks (template files with steps inside conditionals)
  for (const key of Object.keys(raw)) {
    if (key.startsWith('${{')) {
      walkConditionalValue(raw[key]);
    }
  }

  return refs;
}
