import type { TemplateReference } from './pipeline.js';

export interface TemplateRefContext {
  contextRepoAlias?: string;
  sourcePath?: string;
}

/**
 * Parses a raw template path string (e.g. `.pipelines/build-template.yml@self`)
 * into its normalized path and optional repo alias.
 */
export function parseTemplatePath(raw: string): {
  normalizedPath: string;
  repoAlias: string | undefined;
} {
  let path = raw;
  let repoAlias: string | undefined;

  const atIndex = path.lastIndexOf('@');
  if (atIndex > 0) {
    repoAlias = path.slice(atIndex + 1);
    path = path.slice(0, atIndex);

    // `@self` means same repo — treat as no alias
    if (repoAlias === 'self') {
      repoAlias = undefined;
    }
  }

  // Normalize: forward slashes, strip leading ./ or .pipelines/
  path = path.replace(/\\/g, '/');
  path = path.replace(/^\.\//, '');
  path = path.replace(/^\.pipelines\//, '');

  return { normalizedPath: path, repoAlias };
}

/**
 * Creates a TemplateReference from a raw path and context.
 */
export function createTemplateRef(
  rawPath: string,
  location: TemplateReference['location'],
  parameters?: Record<string, unknown>,
  conditional = false,
  context: TemplateRefContext = {},
): TemplateReference {
  const { normalizedPath, repoAlias } = parseTemplatePath(rawPath);
  return {
    rawPath,
    normalizedPath,
    repoAlias,
    contextRepoAlias: repoAlias ?? context.contextRepoAlias,
    sourcePath: context.sourcePath,
    parameters,
    location,
    conditional,
  };
}

export function getEffectiveRepoAlias(
  ref: Pick<TemplateReference, 'repoAlias' | 'contextRepoAlias'>,
): string | undefined {
  return ref.repoAlias ?? ref.contextRepoAlias;
}

export function resolveTemplateRefPath(
  ref: Pick<TemplateReference, 'rawPath' | 'normalizedPath' | 'repoAlias' | 'sourcePath'>,
): string {
  if (ref.normalizedPath.startsWith('/')) {
    return ref.normalizedPath;
  }

  if (ref.repoAlias || !ref.sourcePath || !isExplicitRelativePath(ref.rawPath)) {
    return ref.normalizedPath;
  }

  const baseDir = dirOf(ref.sourcePath);
  if (!baseDir) {
    return ref.normalizedPath;
  }

  return `${baseDir}/${ref.normalizedPath}`;
}

function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
}

function isExplicitRelativePath(rawPath: string): boolean {
  const path = rawPath.split('@')[0]?.trim() ?? '';
  return path.startsWith('./') || path.startsWith('../');
}
