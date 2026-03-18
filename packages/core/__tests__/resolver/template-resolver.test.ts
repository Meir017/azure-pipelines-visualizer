import { describe, expect, test } from 'bun:test';
import type { IFileProvider } from '../../src/resolver/types.js';
import { resolveTemplateReferences } from '../../src/resolver/template-resolver.js';
import { createTemplateRef } from '../../src/model/template-ref.js';
import type { ResourceRepository } from '../../src/model/pipeline.js';

/** In-memory file provider for tests — no I/O needed. */
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

describe('resolveTemplateReferences', () => {
  test('resolves a simple template with no nested refs', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
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

    const refs = [createTemplateRef('jobs/build.yml', 'jobs', { config: 'release' })];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].content).toContain('echo building');
    expect(resolved[0].nestedRefs).toHaveLength(0);
    expect(resolved[0].children).toHaveLength(0);
    expect(resolved[0].error).toBeUndefined();
  });

  test('resolves nested templates recursively', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'stages/deploy.yml',
          `
stages:
  - stage: deploy
    jobs:
      - template: deploy-job.yml
`,
        ],
        [
          'stages/deploy-job.yml',
          `
jobs:
  - job: deployJob
    steps:
      - script: echo deploying
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('stages/deploy.yml', 'stages')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].nestedRefs).toHaveLength(1);
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].content).toContain('echo deploying');
  });

  test('detects circular references', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'templates/stage-a.yml',
          `
stages:
  - template: stage-b.yml
`,
        ],
        [
          'templates/stage-b.yml',
          `
stages:
  - template: stage-a.yml
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('templates/stage-a.yml', 'stages')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    // A → B → A (cycle)
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].children).toHaveLength(1);
    expect(resolved[0].children[0].children[0].cycleDetected).toBe(true);
  });

  test('handles missing template files gracefully', async () => {
    const provider = new InMemoryFileProvider(new Map());

    const refs = [createTemplateRef('nonexistent.yml', 'stages')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeDefined();
    expect(resolved[0].error).toContain('File not found');
  });

  test('respects max depth limit', async () => {
    // Create a chain: a→b→c→d→e (5 levels)
    const files = new Map<string, string>();
    for (let i = 0; i < 5; i++) {
      const next = i < 4 ? `\nstages:\n  - template: level${i + 1}.yml\n` : '\nstages: []\n';
      files.set(`level${i}.yml`, next);
    }

    const provider = new InMemoryFileProvider(files);
    const refs = [createTemplateRef('level0.yml', 'stages')];
    const resolved = await resolveTemplateReferences(refs, provider, { maxDepth: 3 });

    // Should resolve 3 levels then stop
    let current = resolved[0];
    expect(current.error).toBeUndefined(); // level0 (depth 0)
    current = current.children[0]; // level1 (depth 1)
    expect(current.error).toBeUndefined();
    current = current.children[0]; // level2 (depth 2)
    expect(current.error).toBeUndefined();
    current = current.children[0]; // level3 (depth 3 = maxDepth, blocked)
    expect(current.error).toBeDefined();
    expect(current.error).toContain('Maximum recursion depth');
  });

  test('resolves cross-repo templates using repository aliases', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'org/shared-templates:jobs/build.yml',
          `
jobs:
  - job: sharedBuild
    steps:
      - script: echo shared build
`,
        ],
      ]),
    );

    const repositories: ResourceRepository[] = [
      {
        repository: 'templates',
        type: 'github',
        name: 'org/shared-templates',
        ref: 'refs/tags/v1',
        endpoint: 'gh',
      },
    ];

    const refs = [createTemplateRef('jobs/build.yml@templates', 'jobs')];
    const resolved = await resolveTemplateReferences(refs, provider, { repositories });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].content).toContain('shared build');
    expect(resolved[0].error).toBeUndefined();
  });

  test('returns error for unknown repository alias', async () => {
    const provider = new InMemoryFileProvider(new Map());

    const refs = [createTemplateRef('jobs/build.yml@unknown-repo', 'jobs')];
    const resolved = await resolveTemplateReferences(refs, provider, { repositories: [] });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toContain('Unknown repository alias');
  });

  test('resolves local nested templates relative to the external template repo', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'shared/repo:v2/OneBranch.NonOfficial.CrossPlat.yml',
          `
extends:
  template: ./Core.Template.yml
`,
        ],
        [
          'shared/repo:v2/Core.Template.yml',
          `
steps:
  - script: echo inherited repo context
`,
        ],
      ]),
    );

    const repositories: ResourceRepository[] = [
      {
        repository: 'GovernedTemplates',
        type: 'git',
        name: 'shared/repo',
        ref: 'refs/heads/main',
      },
    ];

    const refs = [
      createTemplateRef(
        'v2/OneBranch.NonOfficial.CrossPlat.yml@GovernedTemplates',
        'extends',
      ),
    ];
    const resolved = await resolveTemplateReferences(refs, provider, { repositories });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].error).toBeUndefined();
    expect(resolved[0].children[0].content).toContain('inherited repo context');
  });

  test('resolves multiple refs in parallel', async () => {
    const provider = new InMemoryFileProvider(
      new Map([
        ['a.yml', 'steps:\n  - script: a\n'],
        ['b.yml', 'steps:\n  - script: b\n'],
        ['c.yml', 'steps:\n  - script: c\n'],
      ]),
    );

    const refs = [
      createTemplateRef('a.yml', 'steps'),
      createTemplateRef('b.yml', 'steps'),
      createTemplateRef('c.yml', 'steps'),
    ];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(3);
    expect(resolved.every((r) => !r.error)).toBe(true);
  });

  test('falls back to repo-root path when relative resolution fails', async () => {
    // Simulates: .pipelines/pipeline.yml references .pipelines/build-template.yml
    // Relative resolution produces .pipelines/.pipelines/build-template.yml (wrong)
    // Fallback to .pipelines/build-template.yml (correct)
    const provider = new InMemoryFileProvider(
      new Map([
        [
          '.pipelines/build-template.yml',
          `
steps:
  - script: echo building
`,
        ],
      ]),
    );

    const refs = [
      createTemplateRef('.pipelines/build-template.yml@self', 'steps', undefined, false, {
        sourcePath: '.pipelines/pipeline.yml',
      }),
    ];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    expect(resolved[0].content).toContain('echo building');
  });

  test('resolves bare filenames relative to source directory', async () => {
    // Simulates: helm-ev2/parent.yaml references create-helm-commands.yaml
    // Should resolve to helm-ev2/create-helm-commands.yaml
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'helm-ev2/parent.yaml',
          `
steps:
  - template: create-commands.yaml
`,
        ],
        [
          'helm-ev2/create-commands.yaml',
          `
steps:
  - script: echo creating
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('helm-ev2/parent.yaml', 'steps')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].error).toBeUndefined();
    expect(resolved[0].children[0].content).toContain('echo creating');
  });

  test('errors when both primary and fallback paths fail', async () => {
    const provider = new InMemoryFileProvider(new Map());

    // Reference from a subdirectory — primary will be dir/missing.yml, fallback will be missing.yml
    // Neither exists → error
    const refs = [
      createTemplateRef('missing.yml', 'steps', undefined, false, {
        sourcePath: 'some-dir/parent.yml',
      }),
    ];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeDefined();
    expect(resolved[0].error).toContain('File not found');
  });

  test('detects cycle via fallback path resolution', async () => {
    // A references B (bare name, resolves relative to A's dir)
    // B references A using a path that needs fallback (path includes parent dir)
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'templates/stage-a.yml',
          `
stages:
  - template: stage-b.yml
`,
        ],
        [
          'templates/stage-b.yml',
          `
stages:
  - template: stage-a.yml
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('templates/stage-a.yml', 'stages')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    // A → B (bare "stage-b.yml" resolves to templates/stage-b.yml)
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].error).toBeUndefined();
    // B → A (bare "stage-a.yml" resolves to templates/stage-a.yml → cycle!)
    expect(resolved[0].children[0].children).toHaveLength(1);
    expect(resolved[0].children[0].children[0].cycleDetected).toBe(true);
  });

  test('propagates correct sourcePath through 3+ level chain', async () => {
    // Root references level1/main.yml
    // level1/main.yml references steps.yml (bare) → resolves to level1/steps.yml
    // level1/steps.yml references build.yml (bare) → resolves to level1/build.yml
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'level1/main.yml',
          `
steps:
  - template: steps.yml
`,
        ],
        [
          'level1/steps.yml',
          `
steps:
  - template: build.yml
`,
        ],
        [
          'level1/build.yml',
          `
steps:
  - script: echo final
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('level1/main.yml', 'steps')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    // level1/main.yml → level1/steps.yml
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].error).toBeUndefined();
    // level1/steps.yml → level1/build.yml
    expect(resolved[0].children[0].children).toHaveLength(1);
    expect(resolved[0].children[0].children[0].error).toBeUndefined();
    expect(resolved[0].children[0].children[0].content).toContain('echo final');
  });

  test('fallback updates sourcePath for nested refs', async () => {
    // .pipelines/pipeline.yml references .pipelines/build.yml (will need fallback)
    // .pipelines/build.yml references steps.yml (bare) → should resolve to .pipelines/steps.yml
    const provider = new InMemoryFileProvider(
      new Map([
        [
          '.pipelines/build.yml',
          `
steps:
  - template: steps.yml
`,
        ],
        [
          '.pipelines/steps.yml',
          `
steps:
  - script: echo nested
`,
        ],
      ]),
    );

    // Simulate: reference from .pipelines/pipeline.yml to .pipelines/build.yml
    // Primary resolution: .pipelines/.pipelines/build.yml → not found
    // Fallback: .pipelines/build.yml → found
    // Nested ref "steps.yml" should use fallback's sourcePath (.pipelines/build.yml)
    const refs = [
      createTemplateRef('.pipelines/build.yml', 'steps', undefined, false, {
        sourcePath: '.pipelines/pipeline.yml',
      }),
    ];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children[0].error).toBeUndefined();
    expect(resolved[0].children[0].content).toContain('echo nested');
  });

  test('sibling refs resolve independently via primary and fallback', async () => {
    // Parent references two templates:
    // - steps.yml (bare) → resolves via primary to subdir/steps.yml
    // - subdir/jobs.yml (from root) → primary fails, fallback succeeds
    const provider = new InMemoryFileProvider(
      new Map([
        [
          'subdir/parent.yml',
          `
steps:
  - template: steps.yml
  - template: subdir/jobs.yml
`,
        ],
        [
          'subdir/steps.yml',
          `
steps:
  - script: echo steps
`,
        ],
        [
          'subdir/jobs.yml',
          `
jobs:
  - job: build
    steps:
      - script: echo jobs
`,
        ],
      ]),
    );

    const refs = [createTemplateRef('subdir/parent.yml', 'steps')];
    const resolved = await resolveTemplateReferences(refs, provider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    expect(resolved[0].children).toHaveLength(2);
    // steps.yml → primary: subdir/steps.yml (exists)
    expect(resolved[0].children[0].error).toBeUndefined();
    expect(resolved[0].children[0].content).toContain('echo steps');
    // subdir/jobs.yml → primary: subdir/subdir/jobs.yml (not found) → fallback: subdir/jobs.yml (exists)
    expect(resolved[0].children[1].error).toBeUndefined();
    expect(resolved[0].children[1].content).toContain('echo jobs');
  });

  test('primary succeeds without attempting fallback', async () => {
    // When primary resolution finds the file, fallback should not be attempted
    let fetchCount = 0;
    const originalProvider = new InMemoryFileProvider(
      new Map([
        ['dir/template.yml', 'steps:\n  - script: echo ok\n'],
      ]),
    );
    const countingProvider: IFileProvider = {
      async getFileContent(repo: string, path: string, ref?: string): Promise<string> {
        fetchCount++;
        return originalProvider.getFileContent(repo, path, ref);
      },
    };

    const refs = [
      createTemplateRef('template.yml', 'steps', undefined, false, {
        sourcePath: 'dir/parent.yml',
      }),
    ];
    const resolved = await resolveTemplateReferences(refs, countingProvider);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].error).toBeUndefined();
    // Should have fetched exactly once (primary succeeded, no fallback attempt)
    expect(fetchCount).toBe(1);
  });
});
