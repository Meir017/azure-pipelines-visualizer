import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseYaml } from '../../src/parser/yaml-parser.js';
import { mapToPipeline } from '../../src/parser/pipeline-parser.js';

const fixturesDir = join(import.meta.dir, '..', 'fixtures');
const loadFixture = (name: string) =>
  mapToPipeline(parseYaml(readFileSync(join(fixturesDir, name), 'utf-8')) as Record<string, unknown>);

describe('mapToPipeline', () => {
  test('maps simple pipeline with steps', () => {
    const pipeline = loadFixture('simple-pipeline.yml');

    expect(pipeline.trigger).toEqual(['main']);
    expect(pipeline.pool?.vmImage).toBe('ubuntu-latest');
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps![0].script).toBe('echo Hello, world!');
    expect(pipeline.steps![0].displayName).toBe('Run a one-line script');
    expect(pipeline.steps![1].task).toBe('DotNetCoreCLI@2');
    expect(pipeline.stages).toBeUndefined();
  });

  test('maps pipeline with templates in stages/jobs', () => {
    const pipeline = loadFixture('pipeline-with-templates.yml');

    expect(pipeline.stages).toHaveLength(3);
    expect(pipeline.stages![0].stage).toBe('Build');
    expect(pipeline.stages![1].stage).toBe('Test');
    expect(pipeline.stages![1].dependsOn).toBe('Build');
  });

  test('maps pipeline with extends block', () => {
    const pipeline = loadFixture('pipeline-with-extends.yml');

    expect(pipeline.extends).toBeDefined();
    expect(pipeline.extends!.template).toBe(
      'v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates',
    );
    expect(pipeline.extends!.parameters).toBeDefined();
    expect(pipeline.extends!.parameters!.globalSdl).toBeDefined();
  });

  test('maps pipeline with resources', () => {
    const pipeline = loadFixture('cross-repo-templates.yml');

    expect(pipeline.resources).toBeDefined();
    expect(pipeline.resources!.repositories).toHaveLength(2);
    expect(pipeline.resources!.repositories![0].repository).toBe('templates');
    expect(pipeline.resources!.repositories![0].type).toBe('github');
    expect(pipeline.resources!.repositories![0].ref).toBe('refs/tags/3.stable');
    expect(pipeline.resources!.repositories![1].repository).toBe('GovernedTemplates');
  });

  test('maps pipeline with variable templates', () => {
    const pipeline = loadFixture('variable-templates.yml');

    expect(pipeline.variables).toHaveLength(3);
    const tmpl1 = pipeline.variables![0] as { template: string };
    expect(tmpl1.template).toBe('variables/common.yml');
    const tmpl2 = pipeline.variables![1] as { template: string; parameters: Record<string, unknown> };
    expect(tmpl2.template).toBe('variables/env-specific.yml');
    expect(tmpl2.parameters).toEqual({ environment: 'production' });
    const named = pipeline.variables![2] as { name: string; value: string };
    expect(named.name).toBe('buildNumber');
    expect(named.value).toBe('1.0.0');
  });

  test('preserves rawYaml on pipeline', () => {
    const pipeline = loadFixture('simple-pipeline.yml');
    expect(pipeline.rawYaml).toBeDefined();
    expect(pipeline.rawYaml).toContain('trigger');
  });

  test('maps pipeline with empty stages array', () => {
    const pipeline = mapToPipeline(
      parseYaml('stages: []') as Record<string, unknown>,
    );
    expect(pipeline.stages).toEqual([]);
  });

  test('maps pipeline with empty jobs array', () => {
    const pipeline = mapToPipeline(
      parseYaml('jobs: []') as Record<string, unknown>,
    );
    expect(pipeline.jobs).toEqual([]);
  });

  test('maps pipeline with empty steps array', () => {
    const pipeline = mapToPipeline(
      parseYaml('steps: []') as Record<string, unknown>,
    );
    expect(pipeline.steps).toEqual([]);
  });

  test('maps pipeline with only trigger', () => {
    const pipeline = mapToPipeline(
      parseYaml('trigger: none') as Record<string, unknown>,
    );
    expect(pipeline.trigger).toBe('none');
    expect(pipeline.stages).toBeUndefined();
    expect(pipeline.jobs).toBeUndefined();
    expect(pipeline.steps).toBeUndefined();
  });

  test('maps pipeline with pool object', () => {
    const pipeline = mapToPipeline(
      parseYaml(`
pool:
  vmImage: windows-latest
  demands:
    - npm
`) as Record<string, unknown>,
    );
    expect(pipeline.pool).toBeDefined();
    expect(pipeline.pool!.vmImage).toBe('windows-latest');
  });

  test('maps pipeline with both variables and variable templates', () => {
    const pipeline = mapToPipeline(
      parseYaml(`
variables:
  - template: vars/common.yml
  - name: myVar
    value: myValue
  - group: MyVarGroup
`) as Record<string, unknown>,
    );
    expect(pipeline.variables).toHaveLength(3);
  });

  test('maps pipeline with resources including containers', () => {
    const pipeline = mapToPipeline(
      parseYaml(`
resources:
  repositories:
    - repository: templates
      type: git
      name: project/templates
  containers:
    - container: build
      image: ubuntu:20.04
`) as Record<string, unknown>,
    );
    expect(pipeline.resources).toBeDefined();
    expect(pipeline.resources!.repositories).toHaveLength(1);
  });

  test('maps empty object as valid pipeline', () => {
    const pipeline = mapToPipeline({});
    expect(pipeline.rawYaml).toBeDefined();
    expect(pipeline.stages).toBeUndefined();
    expect(pipeline.jobs).toBeUndefined();
    expect(pipeline.steps).toBeUndefined();
  });
});
