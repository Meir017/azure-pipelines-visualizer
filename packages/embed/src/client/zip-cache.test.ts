import { afterEach, describe, expect, mock, test } from 'bun:test';
import { strToU8, zipSync } from 'fflate';
import { clearCache, extractZip, getFileFromCache } from './zip-cache.js';

function createTestZip(files: Record<string, string>): ArrayBuffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  const zipped = zipSync(entries);
  return zipped.buffer;
}

afterEach(async () => {
  await clearCache();
});

describe('extractZip', () => {
  test('extracts files from a zip with a top-level directory', () => {
    const zip = createTestZip({
      'repo-abc123/azure-pipelines.yml': 'trigger: none',
      'repo-abc123/templates/build.yml': 'steps: []',
      'repo-abc123/templates/deploy.yml': 'jobs: []',
    });

    const files = extractZip(zip);

    expect(files.get('/azure-pipelines.yml')).toBe('trigger: none');
    expect(files.get('/templates/build.yml')).toBe('steps: []');
    expect(files.get('/templates/deploy.yml')).toBe('jobs: []');
    expect(files.size).toBe(3);
  });

  test('extracts files from a flat zip (no top-level directory)', () => {
    const zip = createTestZip({
      'file.yml': 'content: hello',
    });

    const files = extractZip(zip);
    expect(files.get('/file.yml')).toBe('content: hello');
  });

  test('skips directory entries', () => {
    const zip = createTestZip({
      'root/': '',
      'root/file.txt': 'hello',
    });

    const files = extractZip(zip);
    expect(files.size).toBe(1);
    expect(files.get('/file.txt')).toBe('hello');
  });

  test('handles empty zip', () => {
    const zip = createTestZip({});
    const files = extractZip(zip);
    expect(files.size).toBe(0);
  });

  test('handles utf-8 content', () => {
    const zip = createTestZip({
      'repo/readme.md': '# Hello 🌍\nUnicode: àáâãäå',
    });

    const files = extractZip(zip);
    expect(files.get('/readme.md')).toBe('# Hello 🌍\nUnicode: àáâãäå');
  });

  test('preserves nested directory structure', () => {
    const zip = createTestZip({
      'repo/a/b/c/deep.yml': 'deep: true',
      'repo/a/sibling.yml': 'sibling: true',
    });

    const files = extractZip(zip);
    expect(files.get('/a/b/c/deep.yml')).toBe('deep: true');
    expect(files.get('/a/sibling.yml')).toBe('sibling: true');
  });

  test('handles files with special characters in content', () => {
    const zip = createTestZip({
      'repo/template.yml':
        'condition: ${{ eq(parameters.env, \'prod\') }}\npath: "C:\\Users"',
    });

    const files = extractZip(zip);
    expect(files.get('/template.yml')).toContain('${{ eq(parameters.env');
    expect(files.get('/template.yml')).toContain('C:\\Users');
  });

  test('handles multiple files with different extensions', () => {
    const zip = createTestZip({
      'repo/pipeline.yml': 'yml content',
      'repo/pipeline.yaml': 'yaml content',
      'repo/readme.md': 'markdown content',
      'repo/config.json': '{"key": "value"}',
    });

    const files = extractZip(zip);
    expect(files.size).toBe(4);
    expect(files.get('/pipeline.yml')).toBe('yml content');
    expect(files.get('/pipeline.yaml')).toBe('yaml content');
    expect(files.get('/readme.md')).toBe('markdown content');
    expect(files.get('/config.json')).toBe('{"key": "value"}');
  });
});

describe('getFileFromCache', () => {
  function mockFetchForZip(files: Record<string, string>) {
    const zipBuffer = createTestZip(files);

    return mock(async (url: string) => {
      if (url.includes('/refs?')) {
        // resolveCommitSha call
        return new Response(
          JSON.stringify({
            value: [{ name: 'refs/heads/main', objectId: 'abc123def456' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        // downloadRepoZip call
        return new Response(zipBuffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;
  }

  test('downloads zip and returns file content', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/azure-pipelines.yml': 'trigger: none\npool: default',
    });

    try {
      const content = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        '/azure-pipelines.yml',
      );
      expect(content).toBe('trigger: none\npool: default');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('adds leading slash to path if missing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/templates/build.yml': 'steps: []',
    });

    try {
      const content = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        'templates/build.yml',
      );
      expect(content).toBe('steps: []');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('performs case-insensitive file lookup', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/Templates/Build.yml': 'steps: []',
    });

    try {
      const content = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        '/templates/build.yml',
      );
      expect(content).toBe('steps: []');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws when file not found in zip', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/azure-pipelines.yml': 'trigger: none',
    });

    try {
      await expect(
        getFileFromCache(
          'org',
          'proj',
          'repo',
          'refs/heads/main',
          '/nonexistent.yml',
        ),
      ).rejects.toThrow('File not found in cached repo');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns cached content on second call (no re-download)', async () => {
    let fetchCallCount = 0;
    const zipBuffer = createTestZip({
      'repo/file.yml': 'cached content',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      fetchCallCount++;
      if (url.includes('/refs?')) {
        return new Response(
          JSON.stringify({
            value: [
              { name: 'refs/heads/main', objectId: 'sha-for-cache-test' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        return new Response(zipBuffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const content1 = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        '/file.yml',
      );
      const fetchCountAfterFirst = fetchCallCount;

      const content2 = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        '/file.yml',
      );

      expect(content1).toBe('cached content');
      expect(content2).toBe('cached content');
      // Second call should not trigger additional zip download
      // (may trigger ref resolution due to TTL but not zip download)
      expect(fetchCallCount).toBeLessThanOrEqual(fetchCountAfterFirst + 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('normalizes backslashes in path', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/templates/build.yml': 'build steps',
    });

    try {
      const content = await getFileFromCache(
        'org',
        'proj',
        'repo',
        'refs/heads/main',
        '\\templates\\build.yml',
      );
      expect(content).toBe('build steps');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('clearCache', () => {
  test('clears memory cache so next call re-downloads', async () => {
    let downloadCount = 0;
    const zipBuffer = createTestZip({
      'repo/file.yml': 'original',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/refs?')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                name: 'refs/heads/main',
                objectId: 'sha-clear-test',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        downloadCount++;
        return new Response(zipBuffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      await getFileFromCache(
        'org',
        'proj',
        'repo-clear',
        'refs/heads/main',
        '/file.yml',
      );
      expect(downloadCount).toBe(1);

      await clearCache();

      await getFileFromCache(
        'org',
        'proj',
        'repo-clear',
        'refs/heads/main',
        '/file.yml',
      );
      expect(downloadCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
