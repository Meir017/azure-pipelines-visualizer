import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectTemplateReferences } from '../../src/parser/template-detector.js';
import { parseYaml } from '../../src/parser/yaml-parser.js';

const fixturesDir = join(import.meta.dir, '..', 'fixtures');
const detectFromFixture = (name: string) =>
  detectTemplateReferences(
    parseYaml(readFileSync(join(fixturesDir, name), 'utf-8')) as Record<
      string,
      unknown
    >,
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
    expect(extendsRef!.normalizedPath).toBe(
      'v2/OneBranch.Official.CrossPlat.yml',
    );
    expect(extendsRef!.repoAlias).toBe('GovernedTemplates');

    // Templates inside extends.parameters.stages
    const nestedRefs = refs.filter((r) => r.location === 'extends-parameters');
    expect(nestedRefs.length).toBeGreaterThanOrEqual(2);

    const buildRef = nestedRefs.find(
      (r) => r.normalizedPath === '.pipelines/build-template.yml',
    );
    expect(buildRef).toBeDefined();

    const validationRef = nestedRefs.find(
      (r) => r.normalizedPath === 'validation-stage-template.yml',
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

    const govRef = externalRefs.find(
      (r) => r.repoAlias === 'GovernedTemplates',
    );
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
    expect(pssaRef!.conditionExpression).toBe(
      'eq(parameters.enablePSSA, true)',
    );

    const armRef = conditionalRefs.find((r) =>
      r.normalizedPath.includes('arm-ev2-test-steps-template'),
    );
    expect(armRef).toBeDefined();
    expect(armRef!.conditional).toBe(true);
    expect(armRef!.conditionExpression).toBe(
      'eq(parameters.enableArmTests, true)',
    );
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

    const aRef = refs.find((r) => r.normalizedPath === 'templates/a.yml')!;
    expect(aRef.conditionExpression).toBe('eq(parameters.useA, true)');

    const bRef = refs.find((r) => r.normalizedPath === 'templates/b.yml')!;
    expect(bRef.conditionExpression).toBeUndefined(); // ${{ else }} has no expression
  });

  test('extracts elseif condition expression', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if eq(variables.env, 'prod') }}:
    - template: templates/prod.yml
  - \${{ elseif eq(variables.env, 'staging') }}:
    - template: templates/staging.yml
  - \${{ else }}:
    - template: templates/dev.yml
`) as Record<string, unknown>,
    );

    expect(refs).toHaveLength(3);
    expect(refs[0].conditionExpression).toBe("eq(variables.env, 'prod')");
    expect(refs[1].conditionExpression).toBe("eq(variables.env, 'staging')");
    expect(refs[2].conditionExpression).toBeUndefined();
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

    // .pipelines/build-template.yml@self → .pipelines/build-template.yml (preserved)
    // ./build-template.yml@self → build-template.yml
    // build-template.yml → build-template.yml
    const buildRefs = refs.filter(
      (r) => r.normalizedPath === 'build-template.yml',
    );
    expect(buildRefs).toHaveLength(2);

    // The .pipelines/ prefixed one is separate now
    const pipelinesRef = refs.find(
      (r) => r.normalizedPath === '.pipelines/build-template.yml',
    );
    expect(pipelinesRef).toBeDefined();

    // All should have no repoAlias (self = local)
    for (const ref of [...buildRefs, pipelinesRef!]) {
      expect(ref.repoAlias).toBeUndefined();
    }

    // .pipelines/templates/steps.yml@self → .pipelines/templates/steps.yml (preserved)
    // templates/steps.yml → templates/steps.yml
    const stepsRefs = refs.filter(
      (r) => r.normalizedPath === 'templates/steps.yml',
    );
    expect(stepsRefs).toHaveLength(1);
    const pipelinesStepsRef = refs.find(
      (r) => r.normalizedPath === '.pipelines/templates/steps.yml',
    );
    expect(pipelinesStepsRef).toBeDefined();
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
    expect(refs[0].normalizedPath).toBe(
      '/v2/Core.Dialtone.OnPrem.Template.yml',
    );
    expect(refs[0].location).toBe('extends');
    expect(refs[0].conditional).toBe(true);
    expect(refs[0].conditionExpression).toBe("eq(parameters.mode, 'dialtone')");
    expect(refs[1].normalizedPath).toBe('/v2/Core.Template.yml');
    expect(refs[1].location).toBe('extends');
    expect(refs[1].conditional).toBe(true);
    expect(refs[1].conditionExpression).toBeUndefined(); // ${{ else }}
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

  test('extracts condition from no-space format ${{if ...}}', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{if eq(a,b)}}:
    - template: templates/a.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].conditional).toBe(true);
    expect(refs[0].conditionExpression).toBe('eq(a,b)');
  });

  test('extracts complex nested condition expression', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if and(or(x, y), eq(z, true)) }}:
    - template: templates/complex.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].conditionExpression).toBe('and(or(x, y), eq(z, true))');
  });

  test('extracts condition with extra whitespace', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{   if   eq(a, b)   }}:
    - template: templates/ws.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].conditionExpression).toBe('eq(a, b)');
  });

  test('detects templates in triple-nested conditional blocks', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if eq(parameters.platform, 'linux') }}:
    - \${{ if eq(parameters.arch, 'x64') }}:
      - \${{ if parameters.enableTelemetry }}:
        - template: templates/telemetry-linux-x64.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].normalizedPath).toBe('templates/telemetry-linux-x64.yml');
    expect(refs[0].conditional).toBe(true);
  });

  test('detects templates in multiple conditional blocks at same level', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if parameters.runBuild }}:
    - template: templates/build.yml
  - \${{ if parameters.runTest }}:
    - template: templates/test.yml
  - \${{ if parameters.runDeploy }}:
    - template: templates/deploy.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(3);
    expect(refs[0].normalizedPath).toBe('templates/build.yml');
    expect(refs[1].normalizedPath).toBe('templates/test.yml');
    expect(refs[2].normalizedPath).toBe('templates/deploy.yml');
    expect(refs.every((r) => r.conditional)).toBe(true);
  });

  test('detects templates in conditionals at different nesting levels', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
stages:
  - \${{ if eq(parameters.env, 'prod') }}:
    - stage: Production
      jobs:
        - \${{ if parameters.approval }}:
          - template: jobs/approval.yml
        - template: jobs/deploy.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.normalizedPath)).toContain('jobs/approval.yml');
    expect(refs.map((r) => r.normalizedPath)).toContain('jobs/deploy.yml');
  });

  test('handles empty conditional blocks gracefully', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if parameters.verbose }}:
    - script: echo "verbose mode"
  - template: templates/always.yml
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].normalizedPath).toBe('templates/always.yml');
    expect(refs[0].conditional).toBe(false);
  });

  test('detects step templates inside conditional jobs', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
jobs:
  - \${{ if parameters.includeJob }}:
    - job: ConditionalJob
      steps:
        - template: steps/build.yml
          parameters:
            config: release
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].normalizedPath).toBe('steps/build.yml');
    expect(refs[0].parameters).toEqual({ config: 'release' });
  });

  test('propagates context repo alias through conditional templates', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - \${{ if parameters.flag }}:
    - template: steps/helper.yml
`) as Record<string, unknown>,
      { contextRepoAlias: 'ExternalRepo', sourcePath: 'main/pipeline.yml' },
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].contextRepoAlias).toBe('ExternalRepo');
    expect(refs[0].sourcePath).toBe('main/pipeline.yml');
  });

  test('returns empty for pipeline with only script steps and conditionals', () => {
    const refs = detectTemplateReferences(
      parseYaml(`
steps:
  - script: echo "hello"
  - \${{ if parameters.debug }}:
    - script: echo "debug"
  - bash: echo "done"
`) as Record<string, unknown>,
    );
    expect(refs).toHaveLength(0);
  });
});
