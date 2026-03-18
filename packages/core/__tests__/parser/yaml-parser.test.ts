import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseYaml, toYaml } from '../../src/parser/yaml-parser.js';

const fixturesDir = join(import.meta.dir, '..', 'fixtures');

describe('parseYaml', () => {
  test('parses simple pipeline', () => {
    const content = readFileSync(join(fixturesDir, 'simple-pipeline.yml'), 'utf-8');
    const result = parseYaml(content) as Record<string, unknown>;

    expect(result.trigger).toEqual(['main']);
    expect(result.pool).toEqual({ vmImage: 'ubuntu-latest' });
    expect(Array.isArray(result.steps)).toBe(true);
    expect((result.steps as unknown[]).length).toBe(2);
  });

  test('parses pipeline with extends', () => {
    const content = readFileSync(join(fixturesDir, 'pipeline-with-extends.yml'), 'utf-8');
    const result = parseYaml(content) as Record<string, unknown>;

    expect(result.extends).toBeDefined();
    const ext = result.extends as Record<string, unknown>;
    expect(ext.template).toContain('GovernedTemplates');
  });

  test('handles empty/null input', () => {
    expect(parseYaml('')).toBeUndefined();
  });

  test('parses repeated Azure Pipelines directive keys in the same mapping', () => {
    const content =
      'steps:\n' +
      '  - task: Example@1\n' +
      '    inputs:\n' +
      '      ${{ if eq(parameters.useTestSdlExtension, true) }}:\n' +
      '        sdlExtensionPrefix: test\n' +
      '      ${{ else }}:\n' +
      '        sdlExtensionPrefix: prod\n' +
      '      ${{ if eq(parameters.isOfficial, true) }}:\n' +
      '        buildType: official\n' +
      '      ${{ else }}:\n' +
      '        buildType: buddy\n';

    const result = parseYaml(content) as Record<string, unknown>;
    expect(Array.isArray(result.steps)).toBe(true);
  });

  test('parses directive keys that contain embedded double quotes', () => {
    const content =
      'featureFlags:\n' +
      '  ${{ if startsWith(convertToJson(parameters.featureFlags), \'{\') }}:\n' +
      '    ${{ each property in parameters.featureFlags }}:\n' +
      '      ${{ if or(contains(convertToJson(property.value), \'"task":\'), in(property.key, \'EnableClamd\')) }}:\n' +
      '        enabled: false\n';

    const result = parseYaml(content) as Record<string, unknown>;
    expect(result.featureFlags).toBeDefined();
  });
});

describe('toYaml', () => {
  test('round-trips a simple object', () => {
    const obj = { trigger: ['main'], pool: { vmImage: 'ubuntu-latest' } };
    const yaml = toYaml(obj);
    const parsed = parseYaml(yaml) as Record<string, unknown>;
    expect(parsed.trigger).toEqual(['main']);
  });
});
