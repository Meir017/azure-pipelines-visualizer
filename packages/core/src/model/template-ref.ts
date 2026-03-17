import type { TemplateReference } from './pipeline.js';

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
): TemplateReference {
  const { normalizedPath, repoAlias } = parseTemplatePath(rawPath);
  return {
    rawPath,
    normalizedPath,
    repoAlias,
    parameters,
    location,
    conditional,
  };
}
