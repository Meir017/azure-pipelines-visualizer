import { describe, expect, test } from 'bun:test';
import {
  extractTaskReferences,
  parseTaskReference,
  pascalToKebab,
  resolveTaskDocUrl,
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
    expect(pascalToKebab('PublishBuildArtifacts')).toBe(
      'publish-build-artifacts',
    );
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
  test('built-in task gets MS Learn URL from known mapping', () => {
    const ref = parseTaskReference('DotNetCoreCLI@2');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/dotnet-core-cli-v2',
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

  test('PowerShell uses correct slug from mapping (not pascal-to-kebab)', () => {
    const ref = parseTaskReference('PowerShell@2');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/powershell-v2',
    );
    // Verify pascalToKebab would have produced the wrong slug
    expect(pascalToKebab('PowerShell')).toBe('power-shell');
  });

  test('AzurePowerShell uses correct slug from mapping', () => {
    const ref = parseTaskReference('AzurePowerShell@5');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/azure-powershell-v5',
    );
  });

  test('CmdLine uses correct slug from mapping', () => {
    const ref = parseTaskReference('CmdLine@2');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/cmd-line-v2',
    );
  });

  test('MSBuild uses correct slug from mapping', () => {
    const ref = parseTaskReference('MSBuild@1');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/msbuild-v1',
    );
  });

  test('SSH uses correct slug from mapping', () => {
    const ref = parseTaskReference('SSH@0');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/ssh-v0',
    );
  });

  test('unknown task falls back to pascalToKebab heuristic', () => {
    const ref = parseTaskReference('SomeNewTask@1');
    const url = resolveTaskDocUrl(ref);
    expect(url).toBe(
      'https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/some-new-task-v1',
    );
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

  test('extracts tasks inside conditional ${{ if }} blocks in steps', () => {
    const refs = extractTaskReferences({
      steps: [
        {
          '${{ if eq(parameters.isLinux, true) }}': [
            { task: 'ContainerSecurityCopacetic@0' },
          ],
        },
        { task: 'ContainerSecurityCredScan@0' },
      ],
    });
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.name)).toContain('ContainerSecurityCopacetic');
    expect(refs.map((r) => r.name)).toContain('ContainerSecurityCredScan');
  });

  test('extracts tasks from nested conditional blocks (if/elseif/else)', () => {
    const refs = extractTaskReferences({
      steps: [
        { '${{ if eq(parameters.mode, "patch") }}': [{ task: 'PatchTask@1' }] },
        {
          '${{ elseif eq(parameters.mode, "scan") }}': [{ task: 'ScanTask@1' }],
        },
        { '${{ else }}': [{ task: 'AnalyzeTask@1' }] },
      ],
    });
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.name)).toEqual([
      'PatchTask',
      'ScanTask',
      'AnalyzeTask',
    ]);
  });

  test('extracts tasks from doubly-nested conditional blocks', () => {
    const refs = extractTaskReferences({
      steps: [
        {
          '${{ if parameters.isLinux }}': [
            {
              '${{ if eq(parameters.enablePatching, true) }}': [
                { task: 'LinuxPatch@0' },
              ],
            },
            { '${{ else }}': [{ task: 'LinuxScan@0' }] },
          ],
        },
        { task: 'AlwaysRun@1' },
      ],
    });
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.name)).toContain('LinuxPatch');
    expect(refs.map((r) => r.name)).toContain('LinuxScan');
    expect(refs.map((r) => r.name)).toContain('AlwaysRun');
  });

  test('extracts tasks from conditional blocks inside jobs', () => {
    const refs = extractTaskReferences({
      jobs: [
        {
          job: 'Build',
          steps: [
            { '${{ if parameters.useCache }}': [{ task: 'Cache@2' }] },
            { task: 'DotNetCoreCLI@2' },
          ],
        },
      ],
    });
    expect(refs).toHaveLength(2);
  });

  test('deduplicates tasks across conditional branches', () => {
    const refs = extractTaskReferences({
      steps: [
        { '${{ if parameters.a }}': [{ task: 'Same@1' }] },
        { '${{ else }}': [{ task: 'Same@1' }] },
      ],
    });
    expect(refs).toHaveLength(1);
  });

  test('extracts tasks from triply-nested conditional blocks', () => {
    const refs = extractTaskReferences({
      steps: [
        {
          '${{ if parameters.a }}': [
            {
              '${{ if parameters.b }}': [
                { '${{ if parameters.c }}': [{ task: 'DeepTask@1' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('DeepTask');
  });

  test('extracts tasks from conditional blocks at root level', () => {
    const refs = extractTaskReferences({
      '${{ if parameters.isTemplate }}': {
        steps: [{ task: 'RootConditionalTask@1' }],
      },
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('RootConditionalTask');
  });

  test('extracts tasks from stages with conditional jobs', () => {
    const refs = extractTaskReferences({
      stages: [
        {
          stage: 'Build',
          jobs: [
            {
              '${{ if parameters.useDocker }}': [
                { job: 'DockerBuild', steps: [{ task: 'Docker@2' }] },
              ],
            },
            {
              '${{ else }}': [
                { job: 'NativeBuild', steps: [{ task: 'MSBuild@1' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.name)).toContain('Docker');
    expect(refs.map((r) => r.name)).toContain('MSBuild');
  });

  test('handles null and non-object steps gracefully', () => {
    const refs = extractTaskReferences({
      steps: [null, undefined, 'not an object', 42, { task: 'Valid@1' }],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('Valid');
  });

  test('handles conditional value that is neither array nor object', () => {
    const refs = extractTaskReferences({
      steps: [
        { '${{ if true }}': 'just a string' },
        { '${{ if true }}': 42 },
        { '${{ if true }}': null },
        { task: 'Still@1' },
      ],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('Still');
  });

  test('extracts from mixed conditional and non-conditional steps', () => {
    const refs = extractTaskReferences({
      steps: [
        { task: 'Before@1' },
        { '${{ if parameters.x }}': [{ task: 'Middle@1' }] },
        { task: 'After@1' },
      ],
    });
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.name)).toEqual(['Before', 'Middle', 'After']);
  });
});

describe('parseTaskReference edge cases', () => {
  test('handles @ at end with no version', () => {
    const ref = parseTaskReference('Task@');
    expect(ref.name).toBe('Task');
    expect(ref.version).toBe(0);
  });

  test('handles multiple @ symbols (uses last)', () => {
    const ref = parseTaskReference('Some@Weird@3');
    expect(ref.name).toBe('Some@Weird');
    expect(ref.version).toBe(3);
  });

  test('handles non-numeric version', () => {
    const ref = parseTaskReference('Task@beta');
    expect(ref.name).toBe('Task');
    expect(ref.version).toBe(0);
  });

  test('handles empty string', () => {
    const ref = parseTaskReference('');
    expect(ref.name).toBe('');
    expect(ref.version).toBe(0);
  });
});
