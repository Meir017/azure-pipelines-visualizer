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
