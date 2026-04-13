import { describe, expect, test } from 'bun:test';
import {
  extractDeclaredParameterNames,
  extractParameterDefaults,
  extractVariableValues,
  pathHasExpressions,
  resolveExpressionPath,
} from '../../src/parser/expression-path-resolver.js';

describe('pathHasExpressions', () => {
  test('returns false for plain path', () => {
    expect(pathHasExpressions('templates/build.yml')).toBe(false);
  });

  test('returns true for path with parameter expression', () => {
    expect(pathHasExpressions('governed/${{parameters.buildType}}.yaml')).toBe(
      true,
    );
  });

  test('returns true for path with spaces in expression', () => {
    expect(
      pathHasExpressions('governed/${{ parameters.buildType }}.yaml'),
    ).toBe(true);
  });
});

describe('resolveExpressionPath', () => {
  test('returns plain path unchanged', () => {
    const result = resolveExpressionPath('templates/build.yml');
    expect(result.resolvedPath).toBe('templates/build.yml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.hadExpressions).toBe(false);
  });

  test('resolves parameter from caller params', () => {
    const result = resolveExpressionPath(
      'governed/${{parameters.buildType}}.yaml',
      { buildType: 'standard' },
    );
    expect(result.resolvedPath).toBe('governed/standard.yaml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.hadExpressions).toBe(true);
    expect(result.substituted).toEqual(['parameters.buildType']);
    expect(result.unresolved).toEqual([]);
  });

  test('resolves parameter with spaces in expression', () => {
    const result = resolveExpressionPath(
      'governed/${{ parameters.buildType }}.yaml',
      { buildType: 'official' },
    );
    expect(result.resolvedPath).toBe('governed/official.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves from file defaults when caller param missing', () => {
    const result = resolveExpressionPath(
      'governed/${{parameters.buildType}}.yaml',
      {}, // caller didn't pass buildType
      { buildType: 'standard' }, // file default
    );
    expect(result.resolvedPath).toBe('governed/standard.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('caller params override file defaults', () => {
    const result = resolveExpressionPath(
      'governed/${{parameters.buildType}}.yaml',
      { buildType: 'official' }, // caller overrides
      { buildType: 'standard' }, // file default
    );
    expect(result.resolvedPath).toBe('governed/official.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('reports unresolved when no value available', () => {
    const result = resolveExpressionPath(
      'governed/${{parameters.buildType}}.yaml',
    );
    expect(result.resolvedPath).toBe('governed/${{parameters.buildType}}.yaml');
    expect(result.isFullyResolved).toBe(false);
    expect(result.hadExpressions).toBe(true);
    expect(result.unresolved).toEqual(['parameters.buildType']);
  });

  test('resolves multiple expressions in one path', () => {
    const result = resolveExpressionPath(
      '${{parameters.dir}}/${{parameters.file}}.yml',
      { dir: 'stages', file: 'build' },
    );
    expect(result.resolvedPath).toBe('stages/build.yml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.substituted).toEqual(['parameters.dir', 'parameters.file']);
  });

  test('partially resolves when only some params available', () => {
    const result = resolveExpressionPath(
      '${{parameters.dir}}/${{parameters.file}}.yml',
      { dir: 'stages' },
    );
    expect(result.resolvedPath).toBe('stages/${{parameters.file}}.yml');
    expect(result.isFullyResolved).toBe(false);
    expect(result.substituted).toEqual(['parameters.dir']);
    expect(result.unresolved).toEqual(['parameters.file']);
  });

  test('handles bracket notation', () => {
    const result = resolveExpressionPath(
      "governed/${{parameters['buildType']}}.yaml",
      { buildType: 'standard' },
    );
    expect(result.resolvedPath).toBe('governed/standard.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('handles boolean parameter values', () => {
    const result = resolveExpressionPath(
      'steps/${{parameters.enabled}}-build.yml',
      { enabled: true },
    );
    // Azure Pipelines renders booleans as True/False
    expect(result.resolvedPath).toBe('steps/True-build.yml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves variable expression when variables provided', () => {
    const result = resolveExpressionPath(
      'governed/${{variables.buildType}}.yaml',
      undefined,
      undefined,
      { buildType: 'standard' },
    );
    expect(result.resolvedPath).toBe('governed/standard.yaml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.hadExpressions).toBe(true);
    expect(result.substituted).toEqual(['variables.buildType']);
  });

  test('reports unresolved variable when no variables provided', () => {
    const result = resolveExpressionPath(
      'governed/${{variables.buildType}}.yaml',
    );
    expect(result.isFullyResolved).toBe(false);
    expect(result.hadExpressions).toBe(true);
    expect(result.unresolved.length).toBeGreaterThan(0);
  });

  test('resolves mixed parameter and variable expressions', () => {
    const result = resolveExpressionPath(
      '${{parameters.dir}}/${{variables.buildType}}.yaml',
      { dir: 'governed' },
      undefined,
      { buildType: 'official' },
    );
    expect(result.resolvedPath).toBe('governed/official.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('variables do not override parameters', () => {
    const result = resolveExpressionPath(
      '${{parameters.buildType}}.yaml',
      { buildType: 'from-params' },
      undefined,
      { buildType: 'from-vars' },
    );
    expect(result.resolvedPath).toBe('from-params.yaml');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves coalesce function in path', () => {
    const result = resolveExpressionPath(
      "path.yml@${{ coalesce(parameters.featureFlags.obcanary, 'obcoretemplates') }}",
      { featureFlags: { WindowsHostVersion: '2022' } },
    );
    expect(result.resolvedPath).toBe('path.yml@obcoretemplates');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves nested replace/eq in path', () => {
    const result = resolveExpressionPath(
      "template.yml@${{ replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escanary'), false, '1esstable') }}",
      { featureFlags: {} },
    );
    expect(result.resolvedPath).toBe('template.yml@1esstable');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves nested parameter access', () => {
    const result = resolveExpressionPath(
      '${{ parameters.featureFlags.obcanary }}/template.yml',
      { featureFlags: { obcanary: 'myrepo' } },
    );
    expect(result.resolvedPath).toBe('myrepo/template.yml');
    expect(result.isFullyResolved).toBe(true);
  });
});

describe('extractParameterDefaults', () => {
  test('extracts defaults from parameter list', () => {
    const parsed = {
      parameters: [
        { name: 'buildType', type: 'string', default: 'standard' },
        { name: 'enableTests', type: 'boolean', default: true },
        { name: 'count', type: 'number', default: 5 },
      ],
    };
    const defaults = extractParameterDefaults(parsed);
    expect(defaults).toEqual({
      buildType: 'standard',
      enableTests: true,
      count: 5,
    });
  });

  test('skips parameters without defaults', () => {
    const parsed = {
      parameters: [
        { name: 'buildType', type: 'string', default: 'standard' },
        { name: 'target', type: 'string' }, // no default
      ],
    };
    const defaults = extractParameterDefaults(parsed);
    expect(defaults).toEqual({ buildType: 'standard' });
    expect('target' in defaults).toBe(false);
  });

  test('returns empty for no parameters', () => {
    expect(extractParameterDefaults({})).toEqual({});
    expect(
      extractParameterDefaults({ parameters: 'not-array' } as any),
    ).toEqual({});
  });

  test('handles object-style parameters', () => {
    // Some pipelines use object-style: parameters: { buildType: 'standard' }
    // This is a plain object, not an array — we only handle array style
    const parsed = { parameters: { buildType: 'standard' } };
    expect(extractParameterDefaults(parsed as any)).toEqual({});
  });
});

describe('extractDeclaredParameterNames', () => {
  test('extracts all declared names', () => {
    const parsed = {
      parameters: [
        { name: 'buildType', type: 'string', default: 'standard' },
        { name: 'target', type: 'string' },
        { name: 'enableTests', type: 'boolean', default: true },
      ],
    };
    expect(extractDeclaredParameterNames(parsed)).toEqual([
      'buildType',
      'target',
      'enableTests',
    ]);
  });

  test('returns empty for no parameters', () => {
    expect(extractDeclaredParameterNames({})).toEqual([]);
    expect(
      extractDeclaredParameterNames({ parameters: 'not-array' } as any),
    ).toEqual([]);
  });
});

describe('extractVariableValues', () => {
  test('extracts from array-style variables', () => {
    const parsed = {
      variables: [
        { name: 'buildType', value: 'standard' },
        { name: 'region', value: 'eastus' },
      ],
    };
    expect(extractVariableValues(parsed)).toEqual({
      buildType: 'standard',
      region: 'eastus',
    });
  });

  test('extracts from object-style variables', () => {
    const parsed = {
      variables: {
        buildType: 'official',
        region: 'westus',
      },
    };
    expect(extractVariableValues(parsed)).toEqual({
      buildType: 'official',
      region: 'westus',
    });
  });

  test('skips groups and template entries in array style', () => {
    const parsed = {
      variables: [
        { name: 'buildType', value: 'standard' },
        { group: 'my-group' },
        { template: 'variables/common.yml' },
      ],
    };
    const result = extractVariableValues(parsed);
    expect(result).toEqual({ buildType: 'standard' });
    expect('group' in result).toBe(false);
    expect('template' in result).toBe(false);
  });

  test('converts non-string values to strings', () => {
    const parsed = {
      variables: [
        { name: 'count', value: 5 },
        { name: 'enabled', value: true },
      ],
    };
    expect(extractVariableValues(parsed)).toEqual({
      count: '5',
      enabled: 'true',
    });
  });

  test('returns empty for no variables', () => {
    expect(extractVariableValues({})).toEqual({});
    expect(extractVariableValues({ variables: null } as any)).toEqual({});
  });
});
