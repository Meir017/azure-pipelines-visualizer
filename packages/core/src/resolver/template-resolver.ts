import type {
  ResourceRepository,
  TemplateReference,
} from '../model/pipeline.js';
import { resolveRepoAlias } from '../model/resources.js';
import {
  getEffectiveRepoAlias,
  resolveTemplateRefPaths,
} from '../model/template-ref.js';
import { detectTemplateReferences } from '../parser/template-detector.js';
import { parseYaml } from '../parser/yaml-parser.js';
import type { IFileProvider } from './types.js';

/** A resolved template with its content and any nested template references. */
export interface ResolvedTemplate {
  /** The template reference that was resolved. */
  readonly ref: TemplateReference;
  /** The raw YAML content of the resolved template. */
  readonly content: string;
  /** Parsed raw object of the template YAML. */
  readonly parsed: Record<string, unknown>;
  /** Template references found within this template (for recursive expansion). */
  readonly nestedRefs: TemplateReference[];
  /** Recursively resolved children. */
  readonly children: ResolvedTemplate[];
  /** Whether resolution was stopped due to cycle detection. */
  readonly cycleDetected?: boolean;
  /** Error message if resolution failed. */
  readonly error?: string;
}

export interface ResolveOptions {
  /** Repository resource definitions for resolving @alias references. */
  readonly repositories?: ResourceRepository[];
  /** Maximum recursion depth (default: 10). */
  readonly maxDepth?: number;
}

/**
 * Recursively resolves template references using the provided file provider.
 * Includes cycle detection and depth limiting.
 */
export async function resolveTemplateReferences(
  refs: TemplateReference[],
  fileProvider: IFileProvider,
  options: ResolveOptions = {},
): Promise<ResolvedTemplate[]> {
  const { repositories = [], maxDepth = 10 } = options;
  const visited = new Set<string>();

  return resolveRefs(refs, fileProvider, repositories, visited, 0, maxDepth);
}

async function resolveRefs(
  refs: TemplateReference[],
  fileProvider: IFileProvider,
  repositories: ResourceRepository[],
  visited: Set<string>,
  depth: number,
  maxDepth: number,
): Promise<ResolvedTemplate[]> {
  return Promise.all(
    refs.map((ref) =>
      resolveSingle(ref, fileProvider, repositories, visited, depth, maxDepth),
    ),
  );
}

async function resolveSingle(
  ref: TemplateReference,
  fileProvider: IFileProvider,
  repositories: ResourceRepository[],
  visited: Set<string>,
  depth: number,
  maxDepth: number,
): Promise<ResolvedTemplate> {
  // Build a unique key for cycle detection
  const repoKey = getEffectiveRepoAlias(ref) ?? '';
  const { primary: primaryPath, fallback: fallbackPath } =
    resolveTemplateRefPaths(ref);
  const cacheKey = `${repoKey}:${primaryPath}`;

  // Cycle detection (check both primary and fallback)
  const fallbackCacheKey = fallbackPath
    ? `${repoKey}:${fallbackPath}`
    : undefined;
  if (
    visited.has(cacheKey) ||
    (fallbackCacheKey && visited.has(fallbackCacheKey))
  ) {
    return {
      ref,
      content: '',
      parsed: {},
      nestedRefs: [],
      children: [],
      cycleDetected: true,
    };
  }

  // Depth limit
  if (depth >= maxDepth) {
    return {
      ref,
      content: '',
      parsed: {},
      nestedRefs: [],
      children: [],
      error: `Maximum recursion depth (${maxDepth}) reached`,
    };
  }

  // Determine the repo to fetch from
  let repoId = '';
  let gitRef: string | undefined;
  const effectiveRepoAlias = getEffectiveRepoAlias(ref);

  if (effectiveRepoAlias) {
    const repoResource = resolveRepoAlias(effectiveRepoAlias, repositories);
    if (repoResource) {
      repoId = repoResource.name;
      gitRef = repoResource.ref;
    } else {
      return {
        ref,
        content: '',
        parsed: {},
        nestedRefs: [],
        children: [],
        error: `Unknown repository alias: ${effectiveRepoAlias}`,
      };
    }
  }

  try {
    // Try primary path (relative to source file), fallback to repo-root-relative
    let resolvedPath = primaryPath;
    let content: string;
    try {
      content = await fileProvider.getFileContent(repoId, primaryPath, gitRef);
    } catch (primaryErr) {
      if (fallbackPath) {
        content = await fileProvider.getFileContent(
          repoId,
          fallbackPath,
          gitRef,
        );
        resolvedPath = fallbackPath;
      } else {
        throw primaryErr;
      }
    }

    const parsed = (parseYaml(content) ?? {}) as Record<string, unknown>;
    const nestedRefs = detectTemplateReferences(parsed, {
      contextRepoAlias: effectiveRepoAlias,
      sourcePath: resolvedPath,
    });

    // Track this path as visited for cycle detection in this branch
    const branchVisited = new Set(visited);
    branchVisited.add(`${repoKey}:${resolvedPath}`);

    const children = await resolveRefs(
      nestedRefs,
      fileProvider,
      repositories,
      branchVisited,
      depth + 1,
      maxDepth,
    );

    return { ref, content, parsed, nestedRefs, children };
  } catch (err) {
    return {
      ref,
      content: '',
      parsed: {},
      nestedRefs: [],
      children: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
