import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseYaml } from '../../src/parser/yaml-parser.js';
import { detectTemplateReferences } from '../../src/parser/template-detector.js';

const fixturesDir = join(import.meta.dir, '..', 'fixtures');
const detectFromFixture = (name: string) =>
  detectTemplateReferences(
    parseYaml(readFileSync(join(fixturesDir, name), 'utf-8')) as Record<string, unknown>,
  );

describe('detectTemplateReferences', () => {
  test('returns empty array for simple pipeline with no templates', () => {
    const refs = detectFromFixture('simple-pipeline.yml');
    expect(refs).toHaveLength(0);
  });

  test('detects stage and job templates', () => {
    const refs = detectFromFixture('pipeline-with-templates.yml');

    // jobs/build.yml, jobs/test.yml, stages/deploy.yml
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.normalizedPath)).toContain('jobs/build.yml');
    expect(refs.map((r) => r.normalizedPath)).toContain('jobs/test.yml');
    expect(refs.map((r) => r.normalizedPath)).toContain('stages/deploy.yml');
  });

  test('detects extends template and nested templates in extends.parameters', () => {
    const refs = detectFromFixture('pipeline-with-extends.yml');

    // extends: v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates
    const extendsRef = refs.find((r) => r.location === 'extends');
    expect(extendsRef).toBeDefined();
    expect(extendsRef!.normalizedPath).toBe('v2/OneBranch.Official.CrossPlat.yml');
    expect(extendsRef!.repoAlias).toBe('GovernedTemplates');

    // Templates inside extends.parameters.stages
    const nestedRefs = refs.filter((r) => r.location === 'extends-parameters');
    expect(nestedRefs.length).toBeGreaterThanOrEqual(2);

    const buildRef = nestedRefs.find((r) => r.normalizedPath === 'build-template.yml');
    expect(buildRef).toBeDefined();

    const validationRef = nestedRefs.find((r) =>
      r.normalizedPath === 'validation-stage-template.yml',
    );
    expect(validationRef).toBeDefined();
  });

  test('detects cross-repo template references', () => {
    const refs = detectFromFixture('cross-repo-templates.yml');

    const externalRefs = refs.filter((r) => r.repoAlias !== undefined);
    expect(externalRefs.length).toBeGreaterThanOrEqual(2);

    const templatesRef = externalRefs.find((r) => r.repoAlias === 'templates');
    expect(templatesRef).toBeDefined();
    expect(templatesRef!.normalizedPath).toBe('jobs/build.yml');

    const govRef = externalRefs.find((r) => r.repoAlias === 'GovernedTemplates');
    expect(govRef).toBeDefined();
  });

  test('detects conditional template references', () => {
    const refs = detectFromFixture('conditional-templates.yml');

    const conditionalRefs = refs.filter((r) => r.conditional);
    expect(conditionalRefs.length).toBeGreaterThanOrEqual(2);

    const pssaRef = conditionalRefs.find((r) =>
      r.normalizedPath.includes('pssa-steps-template'),
    );
    expect(pssaRef).toBeDefined();
    expect(pssaRef!.conditional).toBe(true);

    const armRef = conditionalRefs.find((r) =>
      r.normalizedPath.includes('arm-ev2-test-steps-template'),
    );
    expect(armRef).toBeDefined();
    expect(armRef!.conditional).toBe(true);
  });

  test('detects template references in else branches', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if eq(parameters.useA, true) }}:
    - template: templates/a.yml
  - \${{ else }}:
    - template: templates/b.yml
`) as Record<string, unknown>,
    );

    expect(refs).toHaveLength(2);
    expect(refs.every((ref) => ref.conditional)).toBe(true);
    expect(refs.map((ref) => ref.normalizedPath)).toContain('templates/a.yml');
    expect(refs.map((ref) => ref.normalizedPath)).toContain('templates/b.yml');
  });

  test('detects variable template references', () => {
    const refs = detectFromFixture('variable-templates.yml');

    const varRefs = refs.filter((r) => r.location === 'variables');
    expect(varRefs).toHaveLength(2);
    expect(varRefs[0].normalizedPath).toBe('variables/common.yml');
    expect(varRefs[1].normalizedPath).toBe('variables/env-specific.yml');
    expect(varRefs[1].parameters).toEqual({ environment: 'production' });
  });

  test('inherits source repo context for local refs found inside external templates', () => {
    const refs = detectTemplateReferences(
      {
        extends: {
          template: './Core.Template.yml',
        },
      },
      {
        contextRepoAlias: 'GovernedTemplates',
        sourcePath: 'v2/OneBranch.NonOfficial.CrossPlat.yml',
      },
    );

    expect(refs).toHaveLength(1);
    expect(refs[0].repoAlias).toBeUndefined();
    expect(refs[0].contextRepoAlias).toBe('GovernedTemplates');
    expect(refs[0].sourcePath).toBe('v2/OneBranch.NonOfficial.CrossPlat.yml');
  });

  test('detects same template used with different params', () => {
    const refs = detectFromFixture('same-template-different-params.yml');

    expect(refs).toHaveLength(5);
    // All 5 should reference the same normalized path
    const uniquePaths = new Set(refs.map((r) => r.normalizedPath));
    expect(uniquePaths.size).toBe(1);
    expect(uniquePaths.has('validation-job-template.yml')).toBe(true);

    // Each should have different parameters
    const chartNames = refs.map((r) => r.parameters?.chartName);
    expect(new Set(chartNames).size).toBe(5);
  });

  test('handles inconsistent path formats', () => {
    const refs = detectFromFixture('inconsistent-paths.yml');

    // .pipelines/build-template.yml@self → build-template.yml
    // ./build-template.yml@self → build-template.yml
    // build-template.yml → build-template.yml
    const buildRefs = refs.filter((r) => r.normalizedPath === 'build-template.yml');
    expect(buildRefs).toHaveLength(3);

    // All should have no repoAlias (self = local)
    for (const ref of buildRefs) {
      expect(ref.repoAlias).toBeUndefined();
    }

    // .pipelines/templates/steps.yml@self → templates/steps.yml
    // templates/steps.yml → templates/steps.yml
    const stepsRefs = refs.filter((r) => r.normalizedPath === 'templates/steps.yml');
    expect(stepsRefs).toHaveLength(2);
  });

  test('detects conditional extends template references', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
extends:
  \${{ if eq(parameters.mode, 'dialtone') }}:
    template: /v2/Core.Dialtone.OnPrem.Template.yml
  \${{ else }}:
    template: /v2/Core.Template.yml
  parameters:
    stages: \${{ parameters.stages }}
`) as Record<string, unknown>,
    );

    expect(refs).toHaveLength(2);
    expect(refs[0].normalizedPath).toBe('/v2/Core.Dialtone.OnPrem.Template.yml');
    expect(refs[0].location).toBe('extends');
    expect(refs[0].conditional).toBe(true);
    expect(refs[1].normalizedPath).toBe('/v2/Core.Template.yml');
    expect(refs[1].location).toBe('extends');
    expect(refs[1].conditional).toBe(true);
  });

  test('detects conditional extends with shared parameters fallback', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
extends:
  \${{ if eq(parameters.mode, 'a') }}:
    template: templates/a.yml
  \${{ else }}:
    template: templates/b.yml
  parameters:
    env: production
`) as Record<string, unknown>,
    );

    expect(refs).toHaveLength(2);
    // Both should pick up the shared parameters since their conditional blocks have none
    for (const ref of refs) {
      expect(ref.location).toBe('extends');
      expect(ref.conditional).toBe(true);
      expect(ref.parameters).toBeDefined();
      expect(ref.parameters?.env).toBe('production');
    }
  });

  test('non-conditional extends still works', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
extends:
  template: base-pipeline.yml
  parameters:
    env: dev
`) as Record<string, unknown>,
    );

    expect(refs).toHaveLength(1);
    expect(refs[0].normalizedPath).toBe('base-pipeline.yml');
    expect(refs[0].location).toBe('extends');
    expect(refs[0].conditional).toBe(false);
    expect(refs[0].parameters?.env).toBe('dev');
  });
});
