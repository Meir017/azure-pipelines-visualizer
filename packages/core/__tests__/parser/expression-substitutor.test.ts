import { describe, expect, test } from 'bun:test';
import {
  findExpressions,
  substituteParameters,
} from '../../src/parser/expression-substitutor.js';

describe('substituteParameters', () => {
  test('replaces simple parameter references', () => {
    const yaml =
      'steps:\n' +
      '  - script: echo ${{ parameters.message }}\n' +
      '    displayName: ${{ parameters.stepName }}\n';
    const result = substituteParameters(yaml, {
      parameters: { message: 'hello world', stepName: 'Greeting' },
    });

    expect(result.text).toContain('echo hello world');
    expect(result.text).toContain('displayName: Greeting');
    expect(result.substituted).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);
  });

  test('handles bracket notation parameters["name"]', () => {
    const yaml = "value: ${{ parameters['my-param'] }}";
    const result = substituteParameters(yaml, {
      parameters: { 'my-param': 'bracket-value' },
    });

    expect(result.text).toBe('value: bracket-value');
    expect(result.substituted).toHaveLength(1);
  });

  test('leaves unknown parameters unresolved', () => {
    const yaml = 'value: ${{ parameters.unknown }}';
    const result = substituteParameters(yaml, { parameters: {} });

    expect(result.text).toBe(yaml);
    expect(result.unresolved).toHaveLength(1);
    expect(result.substituted).toHaveLength(0);
  });

  test('handles boolean parameter values', () => {
    const yaml = 'enabled: ${{ parameters.isEnabled }}';
    const result = substituteParameters(yaml, {
      parameters: { isEnabled: true },
    });
    expect(result.text).toBe('enabled: true');
  });

  test('handles numeric parameter values', () => {
    const yaml = 'count: ${{ parameters.retries }}';
    const result = substituteParameters(yaml, {
      parameters: { retries: 3 },
    });
    expect(result.text).toBe('count: 3');
  });

  test('handles whitespace variations in expression', () => {
    const yaml = 'a: ${{parameters.x}} b: ${{  parameters.y  }}';
    const result = substituteParameters(yaml, {
      parameters: { x: 'X', y: 'Y' },
    });
    expect(result.text).toBe('a: X b: Y');
  });

  test('handles null/undefined parameter values as empty string', () => {
    const yaml = 'value: ${{ parameters.empty }}';
    const result = substituteParameters(yaml, {
      parameters: { empty: null },
    });
    expect(result.text).toBe('value: ');
  });

  test('does not touch conditional expressions', () => {
    const yaml = '${{ if eq(parameters.foo, true) }}:\n  - script: echo hi';
    const result = substituteParameters(yaml, { parameters: { foo: true } });
    expect(result.text).toBe(yaml); // unchanged
  });

  test('replaces multiple occurrences of the same parameter', () => {
    const yaml = 'a: ${{ parameters.x }} b: ${{ parameters.x }}';
    const result = substituteParameters(yaml, { parameters: { x: 'val' } });
    expect(result.text).toBe('a: val b: val');
    expect(result.substituted).toHaveLength(2);
  });

  test('works with empty context', () => {
    const yaml = 'plain: value';
    const result = substituteParameters(yaml, {});
    expect(result.text).toBe(yaml);
    expect(result.substituted).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
  });
});

describe('findExpressions', () => {
  test('classifies parameter expressions', () => {
    const exprs = findExpressions('${{ parameters.name }}');
    expect(exprs).toHaveLength(1);
    expect(exprs[0].type).toBe('parameter');
  });

  test('classifies variable expressions', () => {
    const exprs = findExpressions(
      "${{ variables.myVar }} ${{ variables['other'] }}",
    );
    expect(exprs).toHaveLength(2);
    expect(exprs.every((e) => e.type === 'variable')).toBe(true);
  });

  test('classifies conditional expressions', () => {
    const exprs = findExpressions('${{ if eq(parameters.a, true) }}');
    expect(exprs).toHaveLength(1);
    expect(exprs[0].type).toBe('conditional');
  });

  test('classifies else expressions', () => {
    const exprs = findExpressions('${{ else }}');
    expect(exprs).toHaveLength(1);
    expect(exprs[0].type).toBe('conditional');
  });

  test('classifies each/iterator expressions', () => {
    const exprs = findExpressions('${{ each stage in parameters.stages }}');
    expect(exprs).toHaveLength(1);
    expect(exprs[0].type).toBe('iterator');
  });

  test('classifies other expressions as generic', () => {
    const exprs = findExpressions("${{ format('{0}', variables.x) }}");
    expect(exprs).toHaveLength(1);
    expect(exprs[0].type).toBe('expression');
  });

  test('finds multiple expressions in complex YAML', () => {
    const yaml =
      '\${{ if eq(parameters.enable, true) }}:\n' +
      '  - task: Build@1\n' +
      '    inputs:\n' +
      '      config: \${{ parameters.config }}\n' +
      '\${{ else }}:\n' +
      '  - script: echo skipped\n' +
      '\${{ each step in parameters.extraSteps }}:\n' +
      '  - \${{ step }}\n';
    const exprs = findExpressions(yaml);
    expect(exprs.length).toBeGreaterThanOrEqual(4);

    const types = exprs.map((e) => e.type);
    expect(types).toContain('conditional');
    expect(types).toContain('parameter');
    expect(types).toContain('iterator');
  });

  test('returns empty array for plain YAML', () => {
    const exprs = findExpressions('steps:\n  - script: echo hello\n');
    expect(exprs).toHaveLength(0);
  });
});
