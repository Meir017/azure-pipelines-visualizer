import { describe, expect, test } from 'bun:test';
import {
  parseTaskReference,
  pascalToKebab,
  resolveTaskDocUrl,
  extractTaskReferences,
} from '../../src/parser/task-resolver.js';

describe('parseTaskReference', () => {
  test('parses task with version', () => {
    const ref = parseTaskReference('DotNetCoreCLI@2');
    expect(ref.name).toBe('DotNetCoreCLI');
    expect(ref.version).toBe(2);
    expect(ref.raw).toBe('DotNetCoreCLI@2');
  });

  test('parses task without version', () => {
    const ref = parseTaskReference('Checkout');
    expect(ref.name).toBe('Checkout');
    expect(ref.version).toBe(0);
  });

  test('parses namespaced task', () => {
    const ref = parseTaskReference('OneBranch.Pipeline.Build@1');
    expect(ref.name).toBe('OneBranch.Pipeline.Build');
    expect(ref.version).toBe(1);
  });

  test('trims whitespace', () => {
    const ref = parseTaskReference('  PublishBuildArtifacts@1  ');
    expect(ref.name).toBe('PublishBuildArtifacts');
    expect(ref.version).toBe(1);
  });
});

describe('pascalToKebab', () => {
  test('simple PascalCase', () => {
    expect(pascalToKebab('PublishBuildArtifacts')).toBe('publish-build-artifacts');
  });

  test('consecutive uppercase (CLI)', () => {
    expect(pascalToKebab('DotNetCoreCLI')).toBe('dot-net-core-cli');
  });

  test('NuGet style', () => {
    expect(pascalToKebab('NuGetCommand')).toBe('nu-get-command');
  });

  test('single word', () => {
    expect(pascalToKebab('Bash')).toBe('bash');
  });
});

describe('resolveTaskDocUrl', () => {
  test('built-in task gets MS Learn URL', () => {
    const ref = parseTaskReference('DotNetCoreCLI@2');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/dot-net-core-cli-v2',
    );
  });

  test('namespaced task returns null without custom docs', () => {
    const ref = parseTaskReference('OneBranch.Pipeline.Build@1');
    expect(resolveTaskDocUrl(ref)).toBeNull();
  });

  test('custom docs override by name@version', () => {
    const ref = parseTaskReference('OneBranch.Pipeline.Build@1');
    const url = resolveTaskDocUrl(ref, {
      'OneBranch.Pipeline.Build@1': 'https://example.com/build',
    });
    expect(url).toBe('https://example.com/build');
  });

  test('custom docs override by name only', () => {
    const ref = parseTaskReference('OneBranch.Pipeline.Build@2');
    const url = resolveTaskDocUrl(ref, {
      'OneBranch.Pipeline.Build': 'https://example.com/build',
    });
    expect(url).toBe('https://example.com/build');
  });

  test('custom docs for built-in task overrides MS Learn', () => {
    const ref = parseTaskReference('Bash@3');
    const url = resolveTaskDocUrl(ref, {
      'Bash@3': 'https://custom.com/bash',
    });
    expect(url).toBe('https://custom.com/bash');
  });
});

describe('extractTaskReferences', () => {
  test('extracts from top-level steps', () => {
    const refs = extractTaskReferences({
      steps: [
        { task: 'DotNetCoreCLI@2', inputs: {} },
        { script: 'echo hello' },
        { task: 'PublishBuildArtifacts@1' },
      ],
    });
    expect(refs).toHaveLength(2);
    expect(refs[0].name).toBe('DotNetCoreCLI');
    expect(refs[1].name).toBe('PublishBuildArtifacts');
  });

  test('extracts from jobs → steps', () => {
    const refs = extractTaskReferences({
      jobs: [
        { job: 'Build', steps: [{ task: 'Bash@3' }] },
        { job: 'Test', steps: [{ task: 'VSTest@2' }] },
      ],
    });
    expect(refs).toHaveLength(2);
  });

  test('extracts from stages → jobs → steps', () => {
    const refs = extractTaskReferences({
      stages: [
        {
          stage: 'Build',
          jobs: [{ job: 'j1', steps: [{ task: 'NuGetCommand@2' }] }],
        },
      ],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('NuGetCommand');
  });

  test('deduplicates same task', () => {
    const refs = extractTaskReferences({
      steps: [{ task: 'Bash@3' }, { task: 'Bash@3' }],
    });
    expect(refs).toHaveLength(1);
  });

  test('returns empty for pipeline with no tasks', () => {
    const refs = extractTaskReferences({ trigger: 'none', pool: {} });
    expect(refs).toHaveLength(0);
  });
});
