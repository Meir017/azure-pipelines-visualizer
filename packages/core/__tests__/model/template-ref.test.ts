import { describe, expect, test } from 'bun:test';
import { parseTemplatePath, createTemplateRef } from '../../src/model/template-ref.js';

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

  test('strips leading .pipelines/ prefix', () => {
    const result = parseTemplatePath('.pipelines/build-template.yml@self');
    expect(result.normalizedPath).toBe('build-template.yml');
    expect(result.repoAlias).toBeUndefined();
  });

  test('strips .pipelines/ and nested path', () => {
    const result = parseTemplatePath('.pipelines/templates/pssa-steps-template.yml@self');
    expect(result.normalizedPath).toBe('templates/pssa-steps-template.yml');
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
    expect(ref.normalizedPath).toBe('build-template.yml');
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
