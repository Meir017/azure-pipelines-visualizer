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
      - template: jobs/deploy-job.yml
`,
        ],
        [
          'jobs/deploy-job.yml',
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
  - template: templates/stage-b.yml
`,
        ],
        [
          'templates/stage-b.yml',
          `
stages:
  - template: templates/stage-a.yml
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
});
