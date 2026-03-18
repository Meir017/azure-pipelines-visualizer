import { describe, expect, test } from 'bun:test';
import { parseTemplatePath, createTemplateRef, resolveTemplateRefPath, resolveTemplateRefPaths, collapsePath } from '../../src/model/template-ref.js';

describe('parseTemplatePath', () => {
  test('simple path without alias', () => {
    const result = parseTemplatePath('jobs/build.yml');
    expect(result.normalizedPath).toBe('jobs/build.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('path with @self is treated as local', () => {
    const result = parseTemplatePath('jobs/build.yml@self');
    expect(result.normalizedPath).toBe('jobs/build.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('path with external repo alias', () => {
    const result = parseTemplatePath('jobs/build.yml@templates');
    expect(result.normalizedPath).toBe('jobs/build.yml');
    expect(result.repoAlias).toBe('templates');
  });

  test('strips leading ./ prefix', () => {
    const result = parseTemplatePath('./validation-stage-template.yml@self');
    expect(result.normalizedPath).toBe('validation-stage-template.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('preserves .pipelines/ prefix in path', () => {
    const result = parseTemplatePath('.pipelines/build-template.yml@self');
    expect(result.normalizedPath).toBe('.pipelines/build-template.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('preserves .pipelines/ with nested path', () => {
    const result = parseTemplatePath('.pipelines/templates/pssa-steps-template.yml@self');
    expect(result.normalizedPath).toBe('.pipelines/templates/pssa-steps-template.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('normalizes backslashes to forward slashes', () => {
    const result = parseTemplatePath('templates\\build.yml');
    expect(result.normalizedPath).toBe('templates/build.yml');
  });

  test('external repo with nested path', () => {
    const result = parseTemplatePath('helm-ev2/sharedEv2-build-steps.yaml@templates');
    expect(result.normalizedPath).toBe('helm-ev2/sharedEv2-build-steps.yaml');
    expect(result.repoAlias).toBe('templates');
  });

  test('path with @ in directory name does not split incorrectly', () => {
    // Edge case: @ only splits on the last occurrence
    const result = parseTemplatePath('v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates');
    expect(result.normalizedPath).toBe('v2/OneBranch.Official.CrossPlat.yml');
    expect(result.repoAlias).toBe('GovernedTemplates');
  });
});

describe('createTemplateRef', () => {
  test('creates a full template reference', () => {
    const ref = createTemplateRef(
      '.pipelines/build-template.yml@self',
      'steps',
      { config: 'release' },
      false,
    );

    expect(ref.rawPath).toBe('.pipelines/build-template.yml@self');
    expect(ref.normalizedPath).toBe('.pipelines/build-template.yml');
    expect(ref.repoAlias).toBeUndefined();
    expect(ref.parameters).toEqual({ config: 'release' });
    expect(ref.location).toBe('steps');
    expect(ref.conditional).toBe(false);
  });

  test('creates a conditional template reference', () => {
    const ref = createTemplateRef(
      'templates/pssa-steps-template.yml@self',
      'steps',
      undefined,
      true,
    );

    expect(ref.conditional).toBe(true);
    expect(ref.normalizedPath).toBe('templates/pssa-steps-template.yml');
  });

  test('creates an extends template reference', () => {
    const ref = createTemplateRef(
      'v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates',
      'extends',
      { globalSdl: { binskim: true } },
    );

    expect(ref.location).toBe('extends');
    expect(ref.repoAlias).toBe('GovernedTemplates');
    expect(ref.normalizedPath).toBe('v2/OneBranch.Official.CrossPlat.yml');
  });

  test('inherits repo context for local references in external templates', () => {
    const ref = createTemplateRef('./Core.Template.yml', 'extends', undefined, false, {
      contextRepoAlias: 'GovernedTemplates',
      sourcePath: 'v2/OneBranch.NonOfficial.CrossPlat.yml',
    });

    expect(ref.repoAlias).toBeUndefined();
    expect(ref.contextRepoAlias).toBe('GovernedTemplates');
    expect(ref.sourcePath).toBe('v2/OneBranch.NonOfficial.CrossPlat.yml');
  });
});

describe('resolveTemplateRefPath', () => {
  test('returns absolute paths as-is', () => {
    const path = resolveTemplateRefPath({
      rawPath: '/templates/build.yml',
      normalizedPath: '/templates/build.yml',
      repoAlias: undefined,
      sourcePath: 'some/source.yml',
    });
    expect(path).toBe('/templates/build.yml');
  });

  test('returns normalized path for cross-repo refs', () => {
    const path = resolveTemplateRefPath({
      rawPath: 'jobs/build.yml@templates',
      normalizedPath: 'jobs/build.yml',
      repoAlias: 'templates',
      sourcePath: 'src/pipeline.yml',
    });
    expect(path).toBe('jobs/build.yml');
  });

  test('returns normalized path when no source context', () => {
    const path = resolveTemplateRefPath({
      rawPath: 'jobs/build.yml',
      normalizedPath: 'jobs/build.yml',
      repoAlias: undefined,
      sourcePath: undefined,
    });
    expect(path).toBe('jobs/build.yml');
  });

  test('resolves bare filename relative to source directory', () => {
    const path = resolveTemplateRefPath({
      rawPath: 'create-helm-commands.yaml',
      normalizedPath: 'create-helm-commands.yaml',
      repoAlias: undefined,
      sourcePath: 'helm-ev2/sharedEv2-build-steps.yaml',
    });
    expect(path).toBe('helm-ev2/create-helm-commands.yaml');
  });

  test('resolves paths with directories relative to source', () => {
    const path = resolveTemplateRefPath({
      rawPath: 'Stages/StagesValidation.yml',
      normalizedPath: 'Stages/StagesValidation.yml',
      repoAlias: undefined,
      sourcePath: 'v1/1ES.Pipeline.yml',
    });
    expect(path).toBe('v1/Stages/StagesValidation.yml');
  });

  test('collapses .. segments in resolved path', () => {
    const path = resolveTemplateRefPath({
      rawPath: '../../Variables/PredefinedOneESPTVariables.yml',
      normalizedPath: '../../Variables/PredefinedOneESPTVariables.yml',
      repoAlias: undefined,
      sourcePath: 'v1/Core/Steps/PublishArtifacts.yml',
    });
    expect(path).toBe('v1/Variables/PredefinedOneESPTVariables.yml');
  });

  test('resolves ./ prefix (stripped by normalization) relative to source', () => {
    const path = resolveTemplateRefPath({
      rawPath: './Core.Template.yml',
      normalizedPath: 'Core.Template.yml',
      repoAlias: undefined,
      sourcePath: 'v2/OneBranch.NonOfficial.CrossPlat.yml',
    });
    expect(path).toBe('v2/Core.Template.yml');
  });

  test('returns normalized path for root-level source', () => {
    const path = resolveTemplateRefPath({
      rawPath: 'stages/deploy.yml',
      normalizedPath: 'stages/deploy.yml',
      repoAlias: undefined,
      sourcePath: 'pipeline.yml',
    });
    // source at root level → no baseDir → normalized path
    expect(path).toBe('stages/deploy.yml');
  });
});

describe('resolveTemplateRefPaths', () => {
  test('provides fallback when relative path differs from normalized', () => {
    const result = resolveTemplateRefPaths({
      rawPath: '.pipelines/build-template.yml@self',
      normalizedPath: '.pipelines/build-template.yml',
      repoAlias: undefined,
      sourcePath: '/.pipelines/onebranch.official.pkg.yml',
    });
    // Relative: /.pipelines/.pipelines/build-template.yml
    expect(result.primary).toBe('/.pipelines/.pipelines/build-template.yml');
    expect(result.fallback).toBe('.pipelines/build-template.yml');
  });

  test('no fallback when relative resolution matches normalized', () => {
    // When source is at root level, path goes through as-is
    const result = resolveTemplateRefPaths({
      rawPath: 'jobs/build.yml',
      normalizedPath: 'jobs/build.yml',
      repoAlias: undefined,
      sourcePath: 'pipeline.yml',
    });
    expect(result.primary).toBe('jobs/build.yml');
    expect(result.fallback).toBeUndefined();
  });

  test('no fallback for absolute paths', () => {
    const result = resolveTemplateRefPaths({
      rawPath: '/templates/build.yml',
      normalizedPath: '/templates/build.yml',
      repoAlias: undefined,
      sourcePath: 'some/source.yml',
    });
    expect(result.primary).toBe('/templates/build.yml');
    expect(result.fallback).toBeUndefined();
  });
});

describe('collapsePath', () => {
  test('collapses .. segments', () => {
    expect(collapsePath('v1/Core/Steps/../../Variables/foo.yml')).toBe('v1/Variables/foo.yml');
  });

  test('collapses . segments', () => {
    expect(collapsePath('v1/./Core/./Steps/foo.yml')).toBe('v1/Core/Steps/foo.yml');
  });

  test('handles absolute paths', () => {
    expect(collapsePath('/a/b/../c/foo.yml')).toBe('/a/c/foo.yml');
  });

  test('does not go above root for absolute paths', () => {
    expect(collapsePath('/a/../../foo.yml')).toBe('/foo.yml');
  });

  test('preserves leading .. for relative paths', () => {
    expect(collapsePath('../../foo.yml')).toBe('../../foo.yml');
  });

  test('returns path unchanged when no special segments', () => {
    expect(collapsePath('a/b/c.yml')).toBe('a/b/c.yml');
  });
});
