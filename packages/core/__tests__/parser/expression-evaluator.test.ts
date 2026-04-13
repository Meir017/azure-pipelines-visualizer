import { describe, test, expect } from 'bun:test';
import { evaluateExpression, resolveAllExpressions } from '../../src/parser/expression-evaluator';

describe('evaluateExpression', () => {
  // -----------------------------------------------------------------------
  // Literals
  // -----------------------------------------------------------------------
  describe('literals', () => {
    test('string literal', () => {
      expect(evaluateExpression("'hello'")).toBe('hello');
    });

    test('empty string literal', () => {
      expect(evaluateExpression("''")).toBe('');
    });

    test('number literal', () => {
      expect(evaluateExpression('42')).toBe(42);
    });

    test('boolean true', () => {
      expect(evaluateExpression('true')).toBe(true);
    });

    test('boolean false', () => {
      expect(evaluateExpression('false')).toBe(false);
    });

    test('null literal', () => {
      expect(evaluateExpression('null')).toBe(null);
    });
  });

  // -----------------------------------------------------------------------
  // Parameter access
  // -----------------------------------------------------------------------
  describe('parameter access', () => {
    test('simple parameter access', () => {
      expect(evaluateExpression('parameters.name', { parameters: { name: 'hello' } })).toBe(
        'hello',
      );
    });

    test('nested parameter access', () => {
      expect(
        evaluateExpression('parameters.featureFlags.obcanary', {
          parameters: { featureFlags: { obcanary: 'myrepo' } },
        }),
      ).toBe('myrepo');
    });

    test('deeply nested parameter access', () => {
      expect(
        evaluateExpression('parameters.a.b.c.d', {
          parameters: { a: { b: { c: { d: 'deep' } } } },
        }),
      ).toBe('deep');
    });

    test('missing parameter returns undefined', () => {
      expect(
        evaluateExpression('parameters.featureFlags.obcanary', {
          parameters: { featureFlags: {} },
        }),
      ).toBeUndefined();
    });

    test('missing intermediate returns undefined', () => {
      expect(
        evaluateExpression('parameters.featureFlags.obcanary', {
          parameters: {},
        }),
      ).toBeUndefined();
    });

    test('bracket notation', () => {
      expect(
        evaluateExpression("parameters['name']", { parameters: { name: 'value' } }),
      ).toBe('value');
    });

    test('dotted then bracket access', () => {
      expect(
        evaluateExpression("parameters.flags['key']", {
          parameters: { flags: { key: 'found' } },
        }),
      ).toBe('found');
    });

    test('parameter returning object', () => {
      const flags = { a: 1, b: 2 };
      expect(
        evaluateExpression('parameters.featureFlags', {
          parameters: { featureFlags: flags },
        }),
      ).toEqual(flags);
    });
  });

  // -----------------------------------------------------------------------
  // Variable access
  // -----------------------------------------------------------------------
  describe('variable access', () => {
    test('simple variable access', () => {
      expect(evaluateExpression('variables.buildType', { variables: { buildType: 'release' } })).toBe('release');
    });

    test('missing variable returns undefined', () => {
      expect(evaluateExpression('variables.missing', { variables: {} })).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // coalesce
  // -----------------------------------------------------------------------
  describe('coalesce', () => {
    test('returns first non-null value', () => {
      expect(evaluateExpression("coalesce(null, 'fallback')")).toBe('fallback');
    });

    test('returns first defined parameter', () => {
      expect(
        evaluateExpression("coalesce(parameters.obcanary, 'obcoretemplates')", {
          parameters: { obcanary: 'myrepo' },
        }),
      ).toBe('myrepo');
    });

    test('falls back when parameter is undefined', () => {
      expect(
        evaluateExpression("coalesce(parameters.obcanary, 'obcoretemplates')", {
          parameters: {},
        }),
      ).toBe('obcoretemplates');
    });

    test('skips empty string', () => {
      expect(evaluateExpression("coalesce('', 'fallback')")).toBe('fallback');
    });

    test('nested parameter with coalesce for repo resolution', () => {
      expect(
        evaluateExpression("coalesce(parameters.featureFlags.obcanary, 'obcoretemplates')", {
          parameters: { featureFlags: { obcanary: undefined } },
        }),
      ).toBe('obcoretemplates');
    });

    test('nested parameter found with coalesce', () => {
      expect(
        evaluateExpression("coalesce(parameters.featureFlags.obcanary, 'obcoretemplates')", {
          parameters: { featureFlags: { obcanary: 'customrepo' } },
        }),
      ).toBe('customrepo');
    });
  });

  // -----------------------------------------------------------------------
  // eq / ne
  // -----------------------------------------------------------------------
  describe('eq / ne', () => {
    test('eq with matching strings', () => {
      expect(evaluateExpression("eq('hello', 'hello')")).toBe(true);
    });

    test('eq case insensitive', () => {
      expect(evaluateExpression("eq('Hello', 'hello')")).toBe(true);
    });

    test('eq with booleans', () => {
      expect(evaluateExpression('eq(true, true)')).toBe(true);
    });

    test('eq boolean and string', () => {
      expect(evaluateExpression("eq(true, 'True')")).toBe(true);
    });

    test('eq with parameter', () => {
      expect(
        evaluateExpression('eq(parameters.x, true)', { parameters: { x: true } }),
      ).toBe(true);
    });

    test('eq returns false on mismatch', () => {
      expect(
        evaluateExpression('eq(parameters.x, true)', { parameters: { x: false } }),
      ).toBe(false);
    });

    test('ne returns true on mismatch', () => {
      expect(evaluateExpression("ne('a', 'b')")).toBe(true);
    });

    test('ne returns false on match', () => {
      expect(evaluateExpression("ne('a', 'a')")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // and / or / not
  // -----------------------------------------------------------------------
  describe('and / or / not', () => {
    test('and with all true', () => {
      expect(evaluateExpression('and(true, true, true)')).toBe(true);
    });

    test('and with one false', () => {
      expect(evaluateExpression('and(true, false, true)')).toBe(false);
    });

    test('or with one true', () => {
      expect(evaluateExpression('or(false, true, false)')).toBe(true);
    });

    test('or with all false', () => {
      expect(evaluateExpression('or(false, false)')).toBe(false);
    });

    test('not true', () => {
      expect(evaluateExpression('not(true)')).toBe(false);
    });

    test('not false', () => {
      expect(evaluateExpression('not(false)')).toBe(true);
    });

    test('nested and/or', () => {
      expect(evaluateExpression("and(eq('a', 'a'), or(false, true))")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // replace
  // -----------------------------------------------------------------------
  describe('replace', () => {
    test('simple string replacement', () => {
      expect(evaluateExpression("replace('hello world', 'world', 'there')")).toBe('hello there');
    });

    test('replaces all occurrences', () => {
      expect(evaluateExpression("replace('aabaa', 'a', 'x')")).toBe('xxbxx');
    });

    test('replace with boolean value (Azure Pipelines pattern)', () => {
      // eq(false, true) returns false, then replace(false, false, 'stable')
      // toString(false) = 'False', so replace('False', 'False', 'stable') = 'stable'
      expect(evaluateExpression("replace(false, false, 'stable')")).toBe('stable');
    });

    test('replace does not match when search not found', () => {
      // replace(true, true, 'canary') → replace('True', 'True', 'canary') → 'canary'
      expect(evaluateExpression("replace(true, true, 'canary')")).toBe('canary');
    });

    test('the real-world nested replace/eq pattern for 1ES repo', () => {
      // replace(replace(eq(parameters.use1ESPTCanary, true), true, '1escanary'), false, '1esstable')
      // When use1ESPTCanary is NOT set (undefined):
      //   eq(undefined, true) → false
      //   replace(false, true, '1escanary') → replace('False', 'True', '1escanary') → 'False' (no match)
      //   replace('False', false, '1esstable') → replace('False', 'False', '1esstable') → '1esstable'
      expect(
        evaluateExpression(
          "replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escoretemplatescanary'), false, '1escoretemplates')",
          { parameters: { featureFlags: {} } },
        ),
      ).toBe('1escoretemplates');
    });

    test('nested replace/eq when parameter IS true', () => {
      expect(
        evaluateExpression(
          "replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escoretemplatescanary'), false, '1escoretemplates')",
          { parameters: { featureFlags: { use1ESPTCanary: true } } },
        ),
      ).toBe('1escoretemplatescanary');
    });
  });

  // -----------------------------------------------------------------------
  // in
  // -----------------------------------------------------------------------
  describe('in', () => {
    test('value in set', () => {
      expect(evaluateExpression("in('b', 'a', 'b', 'c')")).toBe(true);
    });

    test('value not in set', () => {
      expect(evaluateExpression("in('d', 'a', 'b', 'c')")).toBe(false);
    });

    test('case insensitive', () => {
      expect(evaluateExpression("in('Hello', 'hello', 'world')")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // startsWith / endsWith / contains
  // -----------------------------------------------------------------------
  describe('string functions', () => {
    test('startsWith true', () => {
      expect(evaluateExpression("startsWith('hello world', 'hello')")).toBe(true);
    });

    test('startsWith false', () => {
      expect(evaluateExpression("startsWith('hello world', 'world')")).toBe(false);
    });

    test('endsWith true', () => {
      expect(evaluateExpression("endsWith('hello world', 'world')")).toBe(true);
    });

    test('contains true', () => {
      expect(evaluateExpression("contains('hello world', 'lo wo')")).toBe(true);
    });

    test('contains case insensitive', () => {
      expect(evaluateExpression("contains('Hello World', 'hello')")).toBe(true);
    });

    test('contains with object (convertToJson pattern)', () => {
      expect(
        evaluateExpression("contains(convertToJson(parameters.value), '\"task\":')", {
          parameters: { value: { task: 'build' } },
        }),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // join
  // -----------------------------------------------------------------------
  describe('join', () => {
    test('join strings', () => {
      expect(evaluateExpression("join(',', 'a', 'b', 'c')")).toBe('a,b,c');
    });

    test('join with empty separator', () => {
      expect(evaluateExpression("join('', 'a', 'b')")).toBe('ab');
    });
  });

  // -----------------------------------------------------------------------
  // lower / upper
  // -----------------------------------------------------------------------
  describe('lower / upper', () => {
    test('lower', () => {
      expect(evaluateExpression("lower('HELLO')")).toBe('hello');
    });

    test('upper', () => {
      expect(evaluateExpression("upper('hello')")).toBe('HELLO');
    });
  });

  // -----------------------------------------------------------------------
  // length
  // -----------------------------------------------------------------------
  describe('length', () => {
    test('string length', () => {
      expect(evaluateExpression("length('hello')")).toBe(5);
    });

    test('object length', () => {
      expect(
        evaluateExpression('length(parameters.obj)', {
          parameters: { obj: { a: 1, b: 2 } },
        }),
      ).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // format
  // -----------------------------------------------------------------------
  describe('format', () => {
    test('format with placeholders', () => {
      expect(evaluateExpression("format('{0}/{1}', 'hello', 'world')")).toBe('hello/world');
    });
  });

  // -----------------------------------------------------------------------
  // convertToJson
  // -----------------------------------------------------------------------
  describe('convertToJson', () => {
    test('converts object to JSON', () => {
      expect(
        evaluateExpression('convertToJson(parameters.obj)', {
          parameters: { obj: { key: 'value' } },
        }),
      ).toBe('{"key":"value"}');
    });

    test('converts null to "null"', () => {
      expect(evaluateExpression('convertToJson(null)')).toBe('null');
    });
  });

  // -----------------------------------------------------------------------
  // gt / ge / lt / le
  // -----------------------------------------------------------------------
  describe('comparison functions', () => {
    test('gt numbers', () => {
      expect(evaluateExpression('gt(5, 3)')).toBe(true);
    });

    test('le numbers', () => {
      expect(evaluateExpression('le(3, 5)')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Complex real-world expressions
  // -----------------------------------------------------------------------
  describe('real-world expressions', () => {
    const pipelineContext = {
      parameters: {
        featureFlags: {
          WindowsHostVersion: { Version: '2022' },
          // obcanary NOT SET
          // use1ESPTCanary NOT SET
        },
        obDialtone: { enabled: false },
        isOfficial: true,
      },
    };

    test('coalesce for obcoretemplates repo', () => {
      expect(
        evaluateExpression(
          "coalesce(parameters.featureFlags.obcanary, 'obcoretemplates')",
          pipelineContext,
        ),
      ).toBe('obcoretemplates');
    });

    test('replace/eq chain for 1ES repo (official path)', () => {
      expect(
        evaluateExpression(
          "replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escoretemplatescanary'), false, '1escoretemplates')",
          pipelineContext,
        ),
      ).toBe('1escoretemplates');
    });

    test('conditional check: obDialtone not enabled', () => {
      expect(
        evaluateExpression(
          "and(eq(parameters.obDialtone.enabled, true), eq(parameters.obDialtone.phase, 'DTONPREM'))",
          pipelineContext,
        ),
      ).toBe(false);
    });

    test('conditional check: isOfficial', () => {
      expect(evaluateExpression('eq(parameters.isOfficial, true)', pipelineContext)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    test('empty expression returns empty string', () => {
      expect(evaluateExpression('')).toBe('');
    });

    test('whitespace expression returns empty string', () => {
      expect(evaluateExpression('   ')).toBe('');
    });

    test('unknown function returns string representation', () => {
      const result = evaluateExpression("unknownFunc('arg')");
      expect(typeof result).toBe('string');
    });

    test('no context — parameters return undefined', () => {
      expect(evaluateExpression('parameters.x')).toBeUndefined();
    });
  });
});

describe('resolveAllExpressions', () => {
  test('resolves simple parameter in path', () => {
    const result = resolveAllExpressions(
      'governed/${{ parameters.buildType }}.yaml',
      { parameters: { buildType: 'release' } },
    );
    expect(result.result).toBe('governed/release.yaml');
    expect(result.hadExpressions).toBe(true);
    expect(result.isFullyResolved).toBe(true);
    expect(result.substituted).toHaveLength(1);
  });

  test('resolves coalesce in repo alias', () => {
    const result = resolveAllExpressions(
      "/v2/Core.Internal.yml@${{ coalesce(parameters.featureFlags.obcanary, 'obcoretemplates') }}",
      { parameters: { featureFlags: {} } },
    );
    expect(result.result).toBe('/v2/Core.Internal.yml@obcoretemplates');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves nested replace/eq in repo alias', () => {
    const result = resolveAllExpressions(
      "/v1/1ES.Official.PipelineTemplate.yml@${{ replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escoretemplatescanary'), false, '1escoretemplates') }}",
      { parameters: { featureFlags: {} } },
    );
    expect(result.result).toBe('/v1/1ES.Official.PipelineTemplate.yml@1escoretemplates');
    expect(result.isFullyResolved).toBe(true);
  });

  test('resolves multiple expressions in same string', () => {
    const result = resolveAllExpressions(
      '${{ parameters.dir }}/${{ parameters.file }}.yml',
      { parameters: { dir: 'templates', file: 'build' } },
    );
    expect(result.result).toBe('templates/build.yml');
    expect(result.substituted).toHaveLength(2);
  });

  test('marks unresolvable expressions', () => {
    const result = resolveAllExpressions(
      '${{ variables.buildType }}.yml',
      { parameters: {} },
    );
    expect(result.isFullyResolved).toBe(false);
    expect(result.unresolved).toHaveLength(1);
  });

  test('resolves variable expressions when variables provided', () => {
    const result = resolveAllExpressions(
      '${{ variables.buildType }}.yml',
      { variables: { buildType: 'release' } },
    );
    expect(result.result).toBe('release.yml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.substituted).toEqual(['variables.buildType']);
  });

  test('resolves mixed parameters and variables', () => {
    const result = resolveAllExpressions(
      '${{ parameters.dir }}/${{ variables.buildType }}.yml',
      { parameters: { dir: 'governed' }, variables: { buildType: 'official' } },
    );
    expect(result.result).toBe('governed/official.yml');
    expect(result.isFullyResolved).toBe(true);
    expect(result.substituted).toHaveLength(2);
  });

  test('no expressions returns unchanged', () => {
    const result = resolveAllExpressions('plain/path.yml');
    expect(result.result).toBe('plain/path.yml');
    expect(result.hadExpressions).toBe(false);
    expect(result.isFullyResolved).toBe(false);
  });

  test('full pipeline expression chain', () => {
    const ctx = {
      parameters: {
        featureFlags: {
          WindowsHostVersion: { Version: '2022' },
        },
        isOfficial: true,
      },
    };

    // Repo expression for obcoretemplates
    const r1 = resolveAllExpressions(
      "/v2/Stages/Dialtone.DTEnvBuild.Stage.yml@${{ coalesce(parameters.featureFlags.obcanary, 'obcoretemplates') }}",
      ctx,
    );
    expect(r1.result).toBe('/v2/Stages/Dialtone.DTEnvBuild.Stage.yml@obcoretemplates');
    expect(r1.isFullyResolved).toBe(true);

    // Repo expression for 1escoretemplates
    const r2 = resolveAllExpressions(
      "/v1/1ES.Official.PipelineTemplate.yml@${{ replace(replace(eq(parameters.featureFlags.use1ESPTCanary, true), true, '1escoretemplatescanary'), false, '1escoretemplates') }}",
      ctx,
    );
    expect(r2.result).toBe('/v1/1ES.Official.PipelineTemplate.yml@1escoretemplates');
    expect(r2.isFullyResolved).toBe(true);
  });
});
