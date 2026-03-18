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

  // Normalize: forward slashes, strip leading ./
  path = path.replace(/\\/g, '/');
  path = path.replace(/^\.\//, '');

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

/**
 * Returns the primary resolved path (relative to source file) and an optional
 * fallback path (repo-root-relative) for template path resolution.
 *
 * Azure Pipelines resolves template paths by first trying relative to the
 * including file's directory, then falling back to repository root.
 */
export function resolveTemplateRefPaths(
  ref: Pick<TemplateReference, 'rawPath' | 'normalizedPath' | 'repoAlias' | 'sourcePath'>,
): { primary: string; fallback?: string } {
  if (ref.normalizedPath.startsWith('/')) {
    return { primary: ref.normalizedPath };
  }

  // Cross-repo explicit refs or no source context — use normalized path only
  if (ref.repoAlias || !ref.sourcePath) {
    return { primary: ref.normalizedPath };
  }

  const baseDir = dirOf(ref.sourcePath);
  if (!baseDir) {
    return { primary: ref.normalizedPath };
  }

  const relativePath = collapsePath(`${baseDir}/${ref.normalizedPath}`);

  // If relative resolution produces the same path, no fallback needed
  if (relativePath === ref.normalizedPath) {
    return { primary: relativePath };
  }

  return { primary: relativePath, fallback: ref.normalizedPath };
}

/**
 * Returns the primary resolved path for a template reference.
 * Use resolveTemplateRefPaths() when fallback resolution is needed.
 */
export function resolveTemplateRefPath(
  ref: Pick<TemplateReference, 'rawPath' | 'normalizedPath' | 'repoAlias' | 'sourcePath'>,
): string {
  return resolveTemplateRefPaths(ref).primary;
}

function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
}

/**
 * Collapses `.` and `..` segments in a path.
 * e.g. `v1/Core/Steps/../../Variables/foo.yml` → `v1/Variables/foo.yml`
 */
export function collapsePath(path: string): string {
  const isAbsolute = path.startsWith('/');
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') {
        result.pop();
      } else if (!isAbsolute) {
        result.push(part);
      }
    } else {
      result.push(part);
    }
  }
  const collapsed = result.join('/');
  return isAbsolute ? `/${collapsed}` : collapsed;
}
