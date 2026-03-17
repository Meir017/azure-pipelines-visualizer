import type { ResourcePipeline, ResourceRepository } from './pipeline.js';

/**
 * Resolves a repo alias to its ResourceRepository definition.
 */
export function resolveRepoAlias(
  alias: string,
  repositories: ResourceRepository[],
): ResourceRepository | undefined {
  return repositories.find((r) => r.repository === alias);
}

/**
 * Resolves a pipeline alias to its ResourcePipeline definition.
 */
export function resolvePipelineAlias(
  alias: string,
  pipelines: ResourcePipeline[],
): ResourcePipeline | undefined {
  return pipelines.find((p) => p.pipeline === alias);
}

/**
 * Result of resolving a template's repository source.
 * The `name` field in ResourceRepository can be `<project>/<repo>` or just `<repo>`.
 */
export interface ResolvedTemplateSource {
  /** Override project (when name is `project/repo`). undefined means same project. */
  readonly project?: string;
  /** Repository name. */
  readonly repoName: string;
  /** Git ref (branch/tag) from the resource definition. */
  readonly ref?: string;
}

/**
 * Resolves a template @alias to its actual project/repo/ref using the
 * resources.repositories definitions. Handles both `<repo>` and `<project>/<repo>` name formats.
 */
export function resolveTemplateSource(
  alias: string,
  repositories: ResourceRepository[],
): ResolvedTemplateSource | undefined {
  const repo = resolveRepoAlias(alias, repositories);
  if (!repo) return undefined;

  const slashIdx = repo.name.indexOf('/');
  if (slashIdx > 0) {
    return {
      project: repo.name.slice(0, slashIdx),
      repoName: repo.name.slice(slashIdx + 1),
      ref: repo.ref,
    };
  }
  return { repoName: repo.name, ref: repo.ref };
}
