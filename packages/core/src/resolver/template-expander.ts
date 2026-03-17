/**
 * Inline template expansion — produces a fully-flattened pipeline.
 *
 * This mirrors the algorithm from the official Azure Pipelines agent parser
 * (PipelineParser.cs): template references at each level (extends, stages,
 * jobs, steps, variables) are loaded, parsed, and replaced inline with the
 * template's contents.
 *
 * The result is a single Pipeline object with no template references — everything
 * is flattened as if the user had copy-pasted each template's content.
 */

import type { IFileProvider } from '../resolver/types.js';
import type { ResourceRepository } from '../model/pipeline.js';
import { parseYaml } from '../parser/yaml-parser.js';
import { substituteParameters } from '../parser/expression-substitutor.js';
import { resolveRepoAlias } from '../model/resources.js';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ExpandOptions {
  repositories?: ResourceRepository[];
  /** Max total files that can be loaded (default 50). */
  maxFiles?: number;
  /** Max recursion depth (default 10). */
  maxDepth?: number;
}

export interface ExpandedPipeline {
  /** The fully-expanded raw YAML object. */
  pipeline: Record<string, unknown>;
  /** Metadata about each expansion. */
  expansions: ExpansionRecord[];
  /** Total files loaded during expansion. */
  filesLoaded: string[];
  /** Non-fatal errors encountered. */
  errors: ExpansionError[];
}

export interface ExpansionRecord {
  /** Where the template ref was found. */
  location: 'extends' | 'stages' | 'jobs' | 'steps' | 'variables';
  /** Template path (as written). */
  templatePath: string;
  /** Resolved repo + path key. */
  resolvedKey: string;
  /** How many items the template contributed. */
  resolvedItems: number;
  /** Recursion depth. */
  depth: number;
}

export interface ExpansionError {
  templatePath: string;
  location: string;
  message: string;
  depth: number;
}

// ─── Internal state ──────────────────────────────────────────────────────────

interface ExpandContext {
  fileProvider: IFileProvider;
  repositories: ResourceRepository[];
  maxFiles: number;
  maxDepth: number;
  fileCount: number;
  filesLoaded: string[];
  expansions: ExpansionRecord[];
  errors: ExpansionError[];
  visited: Set<string>;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Load and fully expand a pipeline file, resolving all template references inline.
 */
export async function expandPipeline(
  fileProvider: IFileProvider,
  repo: string,
  rootPath: string,
  options: ExpandOptions = {},
): Promise<ExpandedPipeline> {
  const ctx: ExpandContext = {
    fileProvider,
    repositories: options.repositories ?? [],
    maxFiles: options.maxFiles ?? 50,
    maxDepth: options.maxDepth ?? 10,
    fileCount: 0,
    filesLoaded: [],
    expansions: [],
    errors: [],
    visited: new Set(),
  };

  const content = await loadFile(ctx, repo, rootPath);
  if (!content) {
    return {
      pipeline: {},
      expansions: ctx.expansions,
      filesLoaded: ctx.filesLoaded,
      errors: ctx.errors,
    };
  }

  const pipeline = (parseYaml(content) ?? {}) as Record<string, unknown>;

  await resolveAllTemplates(ctx, pipeline, dirOf(rootPath), repo, 0);

  return {
    pipeline,
    expansions: ctx.expansions,
    filesLoaded: ctx.filesLoaded,
    errors: ctx.errors,
  };
}

// ─── Template resolution (mirrors PipelineParser.ResolveTemplates) ───────────

async function resolveAllTemplates(
  ctx: ExpandContext,
  obj: Record<string, unknown>,
  defaultDir: string,
  defaultRepo: string,
  depth: number,
): Promise<void> {
  // 1. Handle `extends`
  if (obj.extends && typeof obj.extends === 'object') {
    const ext = obj.extends as Record<string, unknown>;
    if (typeof ext.template === 'string') {
      await resolveExtendsTemplate(ctx, obj, ext, defaultDir, defaultRepo, depth);
    }
  }

  // 2. Resolve stages
  if (Array.isArray(obj.stages)) {
    await resolveListTemplates(ctx, obj.stages, 'stages', defaultDir, defaultRepo, depth);
  }

  // 3. Resolve jobs
  if (Array.isArray(obj.jobs)) {
    await resolveListTemplates(ctx, obj.jobs, 'jobs', defaultDir, defaultRepo, depth);
  }

  // 4. Resolve steps
  if (Array.isArray(obj.steps)) {
    await resolveListTemplates(ctx, obj.steps, 'steps', defaultDir, defaultRepo, depth);
  }

  // 5. Resolve variables
  if (Array.isArray(obj.variables)) {
    await resolveListTemplates(ctx, obj.variables, 'variables', defaultDir, defaultRepo, depth);
  }

}

/**
 * Handle `extends: { template: "...", parameters: {...} }`
 * Loads the template, applies parameters, merges its content into the pipeline.
 */
async function resolveExtendsTemplate(
  ctx: ExpandContext,
  pipeline: Record<string, unknown>,
  ext: Record<string, unknown>,
  defaultDir: string,
  defaultRepo: string,
  depth: number,
): Promise<void> {
  const templatePath = ext.template as string;
  const parameters = (ext.parameters ?? {}) as Record<string, unknown>;
  const { repo, path: resolvedPath } = resolveTemplatePath(
    ctx, templatePath, defaultDir, defaultRepo,
  );
  const key = `${repo}:${resolvedPath}`;

  if (ctx.visited.has(key)) {
    ctx.errors.push({ templatePath, location: 'extends', message: 'Circular reference detected', depth });
    return;
  }

  if (depth >= ctx.maxDepth) {
    ctx.errors.push({ templatePath, location: 'extends', message: `Max depth (${ctx.maxDepth}) exceeded`, depth });
    return;
  }

  const content = await loadFile(ctx, repo, resolvedPath);
  if (!content) return;

  // Substitute parameters
  const { text: substituted } = substituteParameters(content, { parameters });
  const template = (parseYaml(substituted) ?? {}) as Record<string, unknown>;

  const branchVisited = new Set(ctx.visited);
  branchVisited.add(key);
  const childCtx: ExpandContext = { ...ctx, visited: branchVisited };

  // Recursively resolve templates within the extends template
  await resolveAllTemplates(childCtx, template, dirOf(resolvedPath), repo, depth + 1);

  // Sync shared mutable state back
  ctx.fileCount = childCtx.fileCount;

  // Merge template content into pipeline: stages/jobs/steps from template replace extends
  const mergedCount = mergeExtends(pipeline, template);

  ctx.expansions.push({
    location: 'extends',
    templatePath,
    resolvedKey: key,
    resolvedItems: mergedCount,
    depth,
  });

  // Remove the extends block
  delete pipeline.extends;
}

/**
 * Walk a list (stages/jobs/steps/variables) and replace template references inline.
 */
async function resolveListTemplates(
  ctx: ExpandContext,
  list: unknown[],
  location: 'stages' | 'jobs' | 'steps' | 'variables',
  defaultDir: string,
  defaultRepo: string,
  depth: number,
): Promise<void> {
  let i = 0;
  while (i < list.length) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      i++;
      continue;
    }

    const obj = item as Record<string, unknown>;

    // Check for conditional blocks containing templates
    for (const key of Object.keys(obj)) {
      if (key.startsWith('${{')) {
        const condValue = obj[key];
        if (Array.isArray(condValue)) {
          await resolveListTemplates(ctx, condValue, location, defaultDir, defaultRepo, depth);
        }
      }
    }

    if (typeof obj.template !== 'string') {
      // Not a template — recurse into nested structures (stages→jobs→steps)
      if (location !== 'variables') {
        await resolveAllTemplates(ctx, obj, defaultDir, defaultRepo, depth);
      }
      i++;
      continue;
    }

    // This is a template reference — resolve it
    const templatePath = obj.template as string;
    const parameters = (obj.parameters ?? {}) as Record<string, unknown>;
    const { repo, path: resolvedPath } = resolveTemplatePath(
      ctx, templatePath, defaultDir, defaultRepo,
    );
    const key = `${repo}:${resolvedPath}`;

    if (ctx.visited.has(key)) {
      ctx.errors.push({ templatePath, location, message: 'Circular reference detected', depth });
      i++;
      continue;
    }

    if (depth >= ctx.maxDepth) {
      ctx.errors.push({ templatePath, location, message: `Max depth (${ctx.maxDepth}) exceeded`, depth });
      i++;
      continue;
    }

    const content = await loadFile(ctx, repo, resolvedPath);
    if (!content) {
      i++;
      continue;
    }

    const { text: substituted } = substituteParameters(content, { parameters });
    const template = (parseYaml(substituted) ?? {}) as Record<string, unknown>;

    // Recursively resolve nested templates within this template
    const branchVisited = new Set(ctx.visited);
    branchVisited.add(key);
    const childCtx: ExpandContext = { ...ctx, visited: branchVisited };
    await resolveAllTemplates(childCtx, template, dirOf(resolvedPath), repo, depth + 1);
    ctx.fileCount = childCtx.fileCount;

    // Extract the items from the template that match this location
    const templateItems = extractItems(template, location);

    // Remove the template reference and insert the template's items
    list.splice(i, 1, ...templateItems);

    ctx.expansions.push({
      location,
      templatePath,
      resolvedKey: key,
      resolvedItems: templateItems.length,
      depth,
    });

    i += templateItems.length;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadFile(
  ctx: ExpandContext,
  repo: string,
  path: string,
): Promise<string | null> {
  ctx.fileCount++;
  if (ctx.maxFiles > 0 && ctx.fileCount > ctx.maxFiles) {
    ctx.errors.push({
      templatePath: path,
      location: 'load',
      message: `Max file count (${ctx.maxFiles}) exceeded`,
      depth: 0,
    });
    return null;
  }

  try {
    const content = await ctx.fileProvider.getFileContent(repo, path);
    ctx.filesLoaded.push(repo ? `${repo}:${path}` : path);
    return content;
  } catch (err) {
    ctx.errors.push({
      templatePath: path,
      location: 'load',
      message: err instanceof Error ? err.message : String(err),
      depth: 0,
    });
    return null;
  }
}

function resolveTemplatePath(
  ctx: ExpandContext,
  rawPath: string,
  defaultDir: string,
  defaultRepo: string,
): { repo: string; path: string } {
  let path = rawPath;
  let repo = defaultRepo;

  // Handle @alias
  const atIndex = path.lastIndexOf('@');
  if (atIndex > 0) {
    const alias = path.slice(atIndex + 1);
    path = path.slice(0, atIndex);

    if (alias !== 'self') {
      const repoResource = resolveRepoAlias(alias, ctx.repositories);
      if (repoResource) {
        repo = repoResource.name;
        // Cross-repo templates resolve from repo root
        return { repo, path: normalizePath(path) };
      }
    }
  }

  // Normalize path
  path = normalizePath(path);

  // Relative path resolution: resolve against the referencing file's directory
  if (!path.startsWith('/')) {
    path = defaultDir ? `${defaultDir}/${path}` : path;
  }

  return { repo, path };
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
}

/**
 * Merge an extends template into the pipeline object.
 * The template's stages/jobs/steps/variables/resources overwrite
 * the pipeline's (since extends replaces the whole body).
 */
function mergeExtends(
  pipeline: Record<string, unknown>,
  template: Record<string, unknown>,
): number {
  let count = 0;

  // The extends template provides the pipeline body
  for (const key of ['stages', 'jobs', 'steps'] as const) {
    if (Array.isArray(template[key])) {
      pipeline[key] = template[key];
      count += (template[key] as unknown[]).length;
    }
  }

  // Merge variables (pipeline vars take precedence over template vars)
  if (Array.isArray(template.variables)) {
    const existing = Array.isArray(pipeline.variables) ? pipeline.variables as unknown[] : [];
    pipeline.variables = [...(template.variables as unknown[]), ...existing];
    count += (template.variables as unknown[]).length;
  }

  // Merge resources
  if (template.resources && typeof template.resources === 'object') {
    const existingRes = (pipeline.resources ?? {}) as Record<string, unknown>;
    const templateRes = template.resources as Record<string, unknown>;
    pipeline.resources = { ...templateRes, ...existingRes };
  }

  // Copy pool if not already set
  if (template.pool && !pipeline.pool) {
    pipeline.pool = template.pool;
  }

  return count;
}

/**
 * Extract the list of items from a template that correspond to the given location.
 * A steps template returns its `steps`, a stages template returns its `stages`, etc.
 */
function extractItems(
  template: Record<string, unknown>,
  location: 'stages' | 'jobs' | 'steps' | 'variables',
): unknown[] {
  // Direct match: template has the same-level items
  if (Array.isArray(template[location])) {
    return template[location] as unknown[];
  }

  // A steps template referenced in a jobs list → wrap in implicit job
  if (location === 'jobs' && Array.isArray(template.steps)) {
    return [{ job: '__expanded', steps: template.steps }];
  }

  // A steps template referenced in a stages list → wrap in implicit stage+job
  if (location === 'stages' && Array.isArray(template.steps)) {
    return [{ stage: '__expanded', jobs: [{ job: '__expanded', steps: template.steps }] }];
  }
  if (location === 'stages' && Array.isArray(template.jobs)) {
    return [{ stage: '__expanded', jobs: template.jobs }];
  }

  // Parameters-only template (just declares parameters, no body) → empty
  return [];
}
