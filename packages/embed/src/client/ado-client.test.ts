import { describe, expect, mock, test } from 'bun:test';
import { getVersionDescriptor, normalizeGitRef } from './ado-client.js';

describe('normalizeGitRef', () => {
  test('returns refs/ prefixed strings as-is', () => {
    expect(normalizeGitRef('refs/heads/main')).toBe('refs/heads/main');
    expect(normalizeGitRef('refs/tags/v1.0')).toBe('refs/tags/v1.0');
    expect(normalizeGitRef('refs/pull/42/merge')).toBe('refs/pull/42/merge');
  });

  test('returns commit SHAs as-is', () => {
    expect(normalizeGitRef('abc1234')).toBe('abc1234');
    // 40-char full SHA
    expect(normalizeGitRef('abc1234567890abc1234567890abc1234567890a')).toBe(
      'abc1234567890abc1234567890abc1234567890a',
    );
    // 7-char short SHA
    expect(normalizeGitRef('abcdef0')).toBe('abcdef0');
  });

  test('wraps bare branch names with refs/heads/', () => {
    expect(normalizeGitRef('main')).toBe('refs/heads/main');
    expect(normalizeGitRef('feature/my-branch')).toBe(
      'refs/heads/feature/my-branch',
    );
    expect(normalizeGitRef('develop')).toBe('refs/heads/develop');
  });

  test('does not treat non-hex strings as commit SHAs', () => {
    // Contains 'g' which is not hex
    expect(normalizeGitRef('abcdefg')).toBe('refs/heads/abcdefg');
    // Too short (6 chars)
    expect(normalizeGitRef('abc123')).toBe('refs/heads/abc123');
  });
});

describe('getVersionDescriptor', () => {
  test('handles branches', () => {
    const desc = getVersionDescriptor('refs/heads/main');
    expect(desc.version).toBe('main');
    expect(desc.versionType).toBe('branch');
  });

  test('handles nested branch names', () => {
    const desc = getVersionDescriptor('refs/heads/feature/my-branch');
    expect(desc.version).toBe('feature/my-branch');
    expect(desc.versionType).toBe('branch');
  });

  test('handles tags', () => {
    const desc = getVersionDescriptor('refs/tags/v1.0');
    expect(desc.version).toBe('v1.0');
    expect(desc.versionType).toBe('tag');
  });

  test('handles bare branch names (normalized to branch type)', () => {
    const desc = getVersionDescriptor('develop');
    expect(desc.version).toBe('develop');
    expect(desc.versionType).toBe('branch');
  });

  test('handles commit SHAs', () => {
    const desc = getVersionDescriptor('abc1234');
    expect(desc.version).toBe('abc1234');
    expect(desc.versionType).toBe('commit');
  });

  test('handles full 40-char SHA', () => {
    const sha = 'abc1234567890abc1234567890abc1234567890a';
    const desc = getVersionDescriptor(sha);
    expect(desc.version).toBe(sha);
    expect(desc.versionType).toBe('commit');
  });

  test('handles non-standard refs as commit type', () => {
    const desc = getVersionDescriptor('refs/pull/42/merge');
    expect(desc.version).toBe('refs/pull/42/merge');
    expect(desc.versionType).toBe('commit');
  });
});

describe('resolveCommitSha', () => {
  test('returns commit SHA directly for commit-type refs', async () => {
    const { resolveCommitSha } = await import('./ado-client.js');
    const sha = 'abc1234';
    // For commit-type refs, no fetch should be needed
    const result = await resolveCommitSha('org', 'proj', 'repo', sha);
    expect(result).toBe(sha);
  });
});

describe('fetchPipelines', () => {
  test('calls correct URL and returns pipeline list', async () => {
    const mockPipelines = [
      { id: 1, name: 'Pipeline 1', folder: '\\' },
      { id: 2, name: 'Pipeline 2', folder: '\\builds' },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      expect(url).toContain('dev.azure.com/myorg/myproject/_apis/pipelines');
      expect(url).toContain('api-version=7.1');
      return new Response(JSON.stringify({ value: mockPipelines }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const { fetchPipelines } = await import('./ado-client.js');
      const result = await fetchPipelines('myorg', 'myproject');
      expect(result).toEqual(mockPipelines);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('fetchPipelineDefinition', () => {
  test('extracts definition fields from API response', async () => {
    const apiResponse = {
      id: 42,
      name: 'MyPipeline',
      process: { yamlFilename: '/azure-pipelines.yml' },
      repository: {
        id: 'repo-id-123',
        name: 'MyRepo',
        type: 'TfsGit',
        defaultBranch: 'refs/heads/main',
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      expect(url).toContain('build/definitions/42');
      return new Response(JSON.stringify(apiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const { fetchPipelineDefinition } = await import('./ado-client.js');
      const def = await fetchPipelineDefinition('myorg', 'myproject', 42);
      expect(def.id).toBe(42);
      expect(def.name).toBe('MyPipeline');
      expect(def.path).toBe('/azure-pipelines.yml');
      expect(def.repository.id).toBe('repo-id-123');
      expect(def.repository.name).toBe('MyRepo');
      expect(def.repository.defaultBranch).toBe('refs/heads/main');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('falls back to data.path when process.yamlFilename is absent', async () => {
    const apiResponse = {
      id: 10,
      name: 'Legacy',
      path: '/build.yml',
      repository: {
        id: 'r1',
        name: 'Repo',
        type: 'TfsGit',
        defaultBranch: 'refs/heads/main',
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(apiResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof fetch;

    try {
      const { fetchPipelineDefinition } = await import('./ado-client.js');
      const def = await fetchPipelineDefinition('org', 'proj', 10);
      expect(def.path).toBe('/build.yml');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('fetchFileContent', () => {
  test('constructs correct URL with branch descriptor', async () => {
    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response('trigger: none', { status: 200 });
    }) as typeof fetch;

    try {
      const { fetchFileContent } = await import('./ado-client.js');
      const content = await fetchFileContent(
        'myorg',
        'myproject',
        'myrepo',
        '/azure-pipelines.yml',
        'refs/heads/main',
      );
      expect(content).toBe('trigger: none');
      expect(capturedUrl).toContain('git/repositories/myrepo/items');
      expect(capturedUrl).toContain('versionDescriptor.version=main');
      expect(capturedUrl).toContain('versionDescriptor.versionType=branch');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('normalizes path with leading slash', async () => {
    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response('content', { status: 200 });
    }) as typeof fetch;

    try {
      const { fetchFileContent } = await import('./ado-client.js');
      await fetchFileContent('org', 'proj', 'repo', 'no-leading-slash.yml');
      expect(capturedUrl).toContain(
        encodeURIComponent('/no-leading-slash.yml'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws on non-OK response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('Not Found', { status: 404 }),
    ) as typeof fetch;

    try {
      const { fetchFileContent } = await import('./ado-client.js');
      await expect(
        fetchFileContent('org', 'proj', 'repo', '/file.yml'),
      ).rejects.toThrow('ADO API error (404)');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('downloadRepoZip', () => {
  test('constructs correct URL with version descriptor', async () => {
    let capturedUrl = '';
    const zipBytes = new Uint8Array([80, 75, 3, 4]); // PK zip header
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(zipBytes, { status: 200 });
    }) as typeof fetch;

    try {
      const { downloadRepoZip } = await import('./ado-client.js');
      const result = await downloadRepoZip(
        'myorg',
        'myproject',
        'myrepo',
        'refs/heads/main',
      );
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(capturedUrl).toContain('$format=zip');
      expect(capturedUrl).toContain('versionDescriptor.version=main');
      expect(capturedUrl).toContain('versionDescriptor.versionType=branch');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
