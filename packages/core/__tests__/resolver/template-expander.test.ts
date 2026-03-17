import { describe, expect, test } from 'bun:test';
import type { IFileProvider } from '../../src/resolver/types.js';
import { expandPipeline } from '../../src/resolver/template-expander.js';
import { toYaml } from '../../src/parser/yaml-parser.js';

/** In-memory file provider mirroring PipelineParserL0's YamlFileProvider. */
class InMemoryFileProvider implements IFileProvider {
  constructor(private files: Map<string, string>) {}

  async getFileContent(repo: string, path: string, _ref?: string): Promise<string> {
    const key = repo ? `${repo}:${path}` : path;
    const content = this.files.get(key);
    if (content === undefined) {
      throw new Error(`File not found: ${key}`);
    }
    return content;
  }
}

describe('expandPipeline', () => {
  // ── Basic expansion (inspired by PipelineParserL0.TaskStep/ScriptStep) ───

  test('loads a simple pipeline with no templates (passthrough)', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - task: Build@1
    inputs:
      solution: '*.sln'
  - script: echo done
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.filesLoaded).toEqual(['pipeline.yml']);
    expect(result.expansions).toHaveLength(0);

    const steps = result.pipeline.steps as unknown[];
    expect(steps).toHaveLength(2);
  });

  // ── Steps template expansion ─────────────────────────────────────────────

  test('expands a steps template reference inline', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - script: echo before
  - template: templates/build-steps.yml
  - script: echo after
`,
        ],
        [
          'templates/build-steps.yml',
          `
steps:
  - task: DotNetCoreCLI@2
    inputs:
      command: build
  - task: DotNetCoreCLI@2
    inputs:
      command: test
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.filesLoaded).toHaveLength(2);
    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0].location).toBe('steps');
    expect(result.expansions[0].resolvedItems).toBe(2);

    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(4); // before + 2 from template + after
    expect(steps[0].script).toBe('echo before');
    expect(steps[1].task).toBe('DotNetCoreCLI@2');
    expect(steps[2].task).toBe('DotNetCoreCLI@2');
    expect(steps[3].script).toBe('echo after');
  });

  // ── Jobs template expansion ──────────────────────────────────────────────

  test('expands a jobs template reference inline', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
jobs:
  - template: jobs/build.yml
    parameters:
      config: Release
  - job: deploy
    steps:
      - script: echo deploying
`,
        ],
        [
          'jobs/build.yml',
          `
jobs:
  - job: build
    steps:
      - script: echo building
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    const jobs = result.pipeline.jobs as Record<string, unknown>[];
    expect(jobs).toHaveLength(2);
    expect(jobs[0].job).toBe('build');
    expect(jobs[1].job).toBe('deploy');
  });

  // ── Stages template expansion ────────────────────────────────────────────

  test('expands a stages template reference inline', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
stages:
  - stage: Build
    jobs:
      - job: compile
        steps:
          - script: echo building
  - template: stages/deploy.yml
`,
        ],
        [
          'stages/deploy.yml',
          `
stages:
  - stage: DeployStaging
    jobs:
      - job: deployStagingJob
        steps:
          - script: echo staging
  - stage: DeployProd
    jobs:
      - job: deployProdJob
        steps:
          - script: echo prod
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    const stages = result.pipeline.stages as Record<string, unknown>[];
    expect(stages).toHaveLength(3);
    expect(stages[0].stage).toBe('Build');
    expect(stages[1].stage).toBe('DeployStaging');
    expect(stages[2].stage).toBe('DeployProd');
  });

  // ── Variables template expansion ─────────────────────────────────────────

  test('expands a variables template reference inline', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
variables:
  - template: vars/common.yml
  - name: localVar
    value: localValue
steps:
  - script: echo hello
`,
        ],
        [
          'vars/common.yml',
          `
variables:
  - name: sharedVar1
    value: shared1
  - name: sharedVar2
    value: shared2
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    const vars = result.pipeline.variables as Record<string, unknown>[];
    expect(vars).toHaveLength(3);
  });

  // ── Extends template expansion (like Process.Template in official parser) ─

  test('expands extends template replacing pipeline body', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
trigger:
  - main
extends:
  template: templates/base.yml
  parameters:
    buildConfig: Release
`,
        ],
        [
          'templates/base.yml',
          `
stages:
  - stage: Build
    jobs:
      - job: compile
        steps:
          - script: echo building
  - stage: Test
    jobs:
      - job: test
        steps:
          - script: echo testing
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.pipeline.extends).toBeUndefined(); // extends removed
    expect(result.pipeline.trigger).toEqual(['main']); // trigger preserved

    const stages = result.pipeline.stages as Record<string, unknown>[];
    expect(stages).toHaveLength(2);
    expect(stages[0].stage).toBe('Build');
    expect(stages[1].stage).toBe('Test');

    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0].location).toBe('extends');
  });

  // ── Nested template expansion ────────────────────────────────────────────

  test('expands templates nested multiple levels deep', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
stages:
  - template: stages/main.yml
`,
        ],
        [
          'stages/main.yml',
          `
stages:
  - stage: Build
    jobs:
      - template: build-job.yml
`,
        ],
        [
          'stages/build-job.yml',
          `
jobs:
  - job: compile
    steps:
      - template: compile-steps.yml
`,
        ],
        [
          'stages/compile-steps.yml',
          `
steps:
  - task: DotNetCoreCLI@2
    inputs:
      command: build
  - task: DotNetCoreCLI@2
    inputs:
      command: test
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.filesLoaded).toHaveLength(4);
    expect(result.expansions).toHaveLength(3);

    // Fully flattened: stage → job → steps all inlined
    const stages = result.pipeline.stages as Record<string, unknown>[];
    expect(stages).toHaveLength(1);
    const jobs = stages[0].jobs as Record<string, unknown>[];
    expect(jobs).toHaveLength(1);
    const steps = jobs[0].steps as Record<string, unknown>[];
    expect(steps).toHaveLength(2);
    expect(steps[0].task).toBe('DotNetCoreCLI@2');
  });

  // ── Parameter substitution during expansion ──────────────────────────────

  test('substitutes parameters when expanding templates', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - template: templates/echo.yml
    parameters:
      message: hello world
`,
        ],
        [
          'templates/echo.yml',
          `
steps:
  - script: echo $\{{ parameters.message }}
    displayName: Say $\{{ parameters.message }}
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(1);
    expect(steps[0].script).toBe('echo hello world');
    expect(steps[0].displayName).toBe('Say hello world');
  });

  // ── Circular reference detection ─────────────────────────────────────────

  test('detects circular references and reports error', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - template: templates/a.yml
`,
        ],
        [
          'templates/a.yml',
          `
steps:
  - template: b.yml
`,
        ],
        [
          'templates/b.yml',
          `
steps:
  - template: a.yml
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    // Should have a circular reference error
    const circularErrors = result.errors.filter((e) =>
      e.message.includes('Circular reference'),
    );
    expect(circularErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ── File count limit ─────────────────────────────────────────────────────

  test('enforces max file count limit', async () => {
    const files = new Map<string, string>();
    // Create a chain of 10 templates
    for (let i = 0; i < 10; i++) {
      const content =
        i < 9
          ? `steps:\n  - template: level${i + 1}.yml\n`
          : 'steps:\n  - script: echo done\n';
      files.set(`level${i}.yml`, content);
    }

    const provider = new InMemoryFileProvider(files);
    const result = await expandPipeline(provider, '', 'level0.yml', {
      maxFiles: 5,
    });

    const fileLimitErrors = result.errors.filter((e) =>
      e.message.includes('Max file count'),
    );
    expect(fileLimitErrors.length).toBeGreaterThanOrEqual(1);
    expect(result.filesLoaded.length).toBeLessThanOrEqual(5);
  });

  // ── Max depth limit ──────────────────────────────────────────────────────

  test('enforces max depth limit', async () => {
    const files = new Map<string, string>();
    for (let i = 0; i < 20; i++) {
      files.set(
        `level${i}.yml`,
        `steps:\n  - template: level${i + 1}.yml\n`,
      );
    }
    files.set('level20.yml', 'steps:\n  - script: echo done\n');

    const provider = new InMemoryFileProvider(files);
    const result = await expandPipeline(provider, '', 'level0.yml', {
      maxDepth: 3,
    });

    const depthErrors = result.errors.filter((e) =>
      e.message.includes('Max depth'),
    );
    expect(depthErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ── Cross-repo template expansion ────────────────────────────────────────

  test('expands cross-repo templates using @alias', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
resources:
  repositories:
    - repository: shared
      type: git
      name: org/shared-templates
steps:
  - template: steps/build.yml@shared
`,
        ],
        [
          'org/shared-templates:steps/build.yml',
          `
steps:
  - task: MSBuild@1
    inputs:
      solution: '*.sln'
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml', {
      repositories: [
        {
          repository: 'shared',
          type: 'git',
          name: 'org/shared-templates',
        },
      ],
    });

    expect(result.errors).toHaveLength(0);
    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(1);
    expect(steps[0].task).toBe('MSBuild@1');
  });

  // ── Relative path resolution ─────────────────────────────────────────────

  test('resolves template paths relative to referencing file directory', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          '.pipelines/main.yml',
          `
steps:
  - template: templates/build.yml
`,
        ],
        [
          '.pipelines/templates/build.yml',
          `
steps:
  - script: echo building
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', '.pipelines/main.yml');

    expect(result.errors).toHaveLength(0);
    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(1);
    expect(steps[0].script).toBe('echo building');
  });

  // ── Missing template handling ────────────────────────────────────────────

  test('handles missing template files gracefully', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - script: echo before
  - template: nonexistent.yml
  - script: echo after
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    // Should have an error for the missing file
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].message).toContain('File not found');

    // The template reference should remain (not replaced)
    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(3);
    expect(steps[0].script).toBe('echo before');
    expect(steps[2].script).toBe('echo after');
  });

  // ── Extends with nested templates ────────────────────────────────────────

  test('extends template that itself has template references', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
extends:
  template: base.yml
  parameters:
    config: Release
`,
        ],
        [
          'base.yml',
          `
stages:
  - stage: Build
    jobs:
      - template: jobs/build.yml
`,
        ],
        [
          'jobs/build.yml',
          `
jobs:
  - job: compile
    steps:
      - script: echo building
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.pipeline.extends).toBeUndefined();
    expect(result.expansions).toHaveLength(2); // extends + jobs template

    const stages = result.pipeline.stages as Record<string, unknown>[];
    expect(stages).toHaveLength(1);
    const jobs = stages[0].jobs as Record<string, unknown>[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].job).toBe('compile');
  });

  // ── Multiple templates at same level ─────────────────────────────────────

  test('expands multiple templates at the same level', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'pipeline.yml',
          `
steps:
  - template: steps/pre.yml
  - script: echo middle
  - template: steps/post.yml
`,
        ],
        [
          'steps/pre.yml',
          `
steps:
  - script: echo pre-1
  - script: echo pre-2
`,
        ],
        [
          'steps/post.yml',
          `
steps:
  - script: echo post-1
`,
        ],
      ]),
    );

    const result = await expandPipeline(provider, '', 'pipeline.yml');

    expect(result.errors).toHaveLength(0);
    expect(result.expansions).toHaveLength(2);

    const steps = result.pipeline.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(4); // pre-1, pre-2, middle, post-1
    expect(steps[0].script).toBe('echo pre-1');
    expect(steps[1].script).toBe('echo pre-2');
    expect(steps[2].script).toBe('echo middle');
    expect(steps[3].script).toBe('echo post-1');
  });
});
