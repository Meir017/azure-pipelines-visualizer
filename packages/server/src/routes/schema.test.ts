import { describe, expect, test } from 'bun:test';
import { extractTasksFromSchema } from './schema.js';

function mockSchema(taskEntries: Array<{ description: string; enum: string[] }>) {
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
    const tasks = extractTasksFromSchema(mockSchema([
      { description: 'Run dotnet commands', enum: ['DotNetCoreCLI@2'] },
      { description: 'Run bash scripts', enum: ['Bash@3'] },
    ]));

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ name: 'DotNetCoreCLI', version: 2, description: 'Run dotnet commands' });
    expect(tasks[1]).toMatchObject({ name: 'Bash', version: 3, description: 'Run bash scripts' });
  });

  test('handles namespaced tasks', () => {
    const tasks = extractTasksFromSchema(mockSchema([
      { description: 'Build pipeline', enum: ['OneBranch.Pipeline.Build@1'] },
    ]));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'OneBranch.Pipeline.Build', version: 1 });
  });

  test('handles task without @ separator', () => {
    const tasks = extractTasksFromSchema(mockSchema([
      { description: 'Some task', enum: ['SomeTask'] },
    ]));

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
});
