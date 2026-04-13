import { describe, expect, test } from 'bun:test';
import { extractTasksFromSchema } from './schema.js';

function mockSchema(
  taskEntries: Array<{ description: string; enum: string[] }>,
) {
  return {
    definitions: {
      task: {
        type: 'object',
        properties: {
          task: {
            anyOf: taskEntries.map((e) => ({
              description: e.description,
              doNotSuggest: false,
              ignoreCase: 'value',
              enum: e.enum,
            })),
          },
        },
      },
    },
  };
}

describe('extractTasksFromSchema', () => {
  test('extracts task name, version, and description', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([
        { description: 'Run dotnet commands', enum: ['DotNetCoreCLI@2'] },
        { description: 'Run bash scripts', enum: ['Bash@3'] },
      ]),
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      name: 'DotNetCoreCLI',
      version: 2,
      description: 'Run dotnet commands',
    });
    expect(tasks[1]).toMatchObject({
      name: 'Bash',
      version: 3,
      description: 'Run bash scripts',
    });
  });

  test('handles namespaced tasks', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([
        { description: 'Build pipeline', enum: ['OneBranch.Pipeline.Build@1'] },
      ]),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      name: 'OneBranch.Pipeline.Build',
      version: 1,
    });
  });

  test('handles task without @ separator', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([{ description: 'Some task', enum: ['SomeTask'] }]),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'SomeTask', version: 0 });
  });

  test('returns empty for schema without definitions', () => {
    expect(extractTasksFromSchema({})).toHaveLength(0);
    expect(extractTasksFromSchema({ definitions: {} })).toHaveLength(0);
  });

  test('skips entries without enum', () => {
    const schema = {
      definitions: {
        task: {
          properties: {
            task: {
              anyOf: [
                { description: 'No enum' },
                { description: 'With enum', enum: ['Task@1'] },
              ],
            },
          },
        },
      },
    };
    const tasks = extractTasksFromSchema(schema as Record<string, unknown>);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Task');
  });

  test('handles entries with empty enum array', () => {
    const schema = {
      definitions: {
        task: {
          properties: {
            task: {
              anyOf: [
                { description: 'Empty enum', enum: [] },
                { description: 'Valid', enum: ['Task@1'] },
              ],
            },
          },
        },
      },
    };
    const tasks = extractTasksFromSchema(schema as Record<string, unknown>);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Task');
  });

  test('handles entries with non-string description', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([{ description: 42 as unknown as string, enum: ['Task@1'] }]),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe('');
  });

  test('handles task with version 0', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([{ description: 'Zero version', enum: ['Task@0'] }]),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Task');
    expect(tasks[0].version).toBe(0);
  });

  test('handles non-numeric version in enum', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([{ description: 'Bad version', enum: ['Task@beta'] }]),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Task');
    expect(tasks[0].version).toBe(0);
  });

  test('returns empty when definitions.task has no properties', () => {
    const tasks = extractTasksFromSchema({
      definitions: { task: {} },
    });
    expect(tasks).toHaveLength(0);
  });

  test('returns empty when anyOf is not an array', () => {
    const tasks = extractTasksFromSchema({
      definitions: {
        task: {
          properties: {
            task: { anyOf: 'not an array' },
          },
        },
      },
    });
    expect(tasks).toHaveLength(0);
  });

  test('extracts multiple tasks correctly', () => {
    const tasks = extractTasksFromSchema(
      mockSchema([
        { description: 'Task A', enum: ['TaskA@1'] },
        { description: 'Task B', enum: ['TaskB@2'] },
        { description: 'Task C', enum: ['TaskC@3'] },
      ]),
    );
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.name)).toEqual(['TaskA', 'TaskB', 'TaskC']);
    expect(tasks.map((t) => t.version)).toEqual([1, 2, 3]);
  });
});
