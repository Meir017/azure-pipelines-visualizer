import { afterEach, describe, expect, mock, test } from 'bun:test';
import { strToU8, zipSync } from 'fflate';
import { ZipFileProvider } from './file-provider.js';
import { clearCache } from './zip-cache.js';

function createTestZip(files: Record<string, string>): ArrayBuffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  const zipped = zipSync(entries);
  return zipped.buffer;
}

function mockFetchForZip(files: Record<string, string>) {
  const zipBuffer = createTestZip(files);

  return mock(async (url: string) => {
    if (url.includes('/refs?')) {
      return new Response(
        JSON.stringify({
          value: [{ name: 'refs/heads/main', objectId: 'commit-sha-fp-test' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('$format=zip')) {
      return new Response(zipBuffer, { status: 200 });
    }
    // Individual file fetch fallback
    if (url.includes('/items?')) {
      const pathMatch = url.match(/path=([^&]+)/);
      if (pathMatch) {
        const decodedPath = decodeURIComponent(pathMatch[1]);
        // Look up file in the original map (strip leading /)
        const key = Object.keys(files).find((k) => {
          const stripped = k.includes('/') ? k.slice(k.indexOf('/')) : `/${k}`;
          return stripped === decodedPath;
        });
        if (key) {
          return new Response(files[key], { status: 200 });
        }
      }
      return new Response('Not Found', { status: 404 });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;
}

afterEach(async () => {
  await clearCache();
});

describe('ZipFileProvider', () => {
  test('returns file content from ZIP cache', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/templates/build.yml': 'steps:\n  - script: echo build',
    });

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'repo',
        defaultBranch: 'refs/heads/main',
      });

      const content = await provider.getFileContent('', '/templates/build.yml');
      expect(content).toBe('steps:\n  - script: echo build');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses default repo when repo param is empty', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/file.yml': 'default repo content',
    });

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'my-default-repo',
        defaultBranch: 'refs/heads/main',
      });

      // Empty repo string should use defaultRepoId
      const content = await provider.getFileContent('', '/file.yml');
      expect(content).toBe('default repo content');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses explicit repo when provided', async () => {
    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      if (url.includes('/refs?')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                name: 'refs/heads/main',
                objectId: 'sha-explicit-repo',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        const zipBuffer = createTestZip({
          'repo/file.yml': 'explicit repo content',
        });
        return new Response(zipBuffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'default-repo',
        defaultBranch: 'refs/heads/main',
      });

      const content = await provider.getFileContent('other-repo', '/file.yml');
      expect(content).toBe('explicit repo content');
      // Should have hit the other-repo in the URL
      expect(capturedUrl).toContain('other-repo');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses explicit ref when provided', async () => {
    let capturedUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      if (url.includes('/refs?')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                name: 'refs/heads/develop',
                objectId: 'sha-develop',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        const zipBuffer = createTestZip({
          'repo/file.yml': 'develop branch content',
        });
        return new Response(zipBuffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'repo',
        defaultBranch: 'refs/heads/main',
      });

      const content = await provider.getFileContent(
        '',
        '/file.yml',
        'refs/heads/develop',
      );
      expect(content).toBe('develop branch content');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('normalizes relative path', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchForZip({
      'repo/templates/build.yml': 'build content',
    });

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'repo',
        defaultBranch: 'refs/heads/main',
      });

      // Path without leading slash should be normalized
      const content = await provider.getFileContent('', 'templates/build.yml');
      expect(content).toBe('build content');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('falls back to individual fetch when ZIP cache misses', async () => {
    let individualFetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes('/refs?')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                name: 'refs/heads/main',
                objectId: 'sha-fallback',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('$format=zip')) {
        // ZIP contains a different file — the one we're looking for is NOT in it
        const zipBuffer = createTestZip({
          'repo/other.yml': 'other',
        });
        return new Response(zipBuffer, { status: 200 });
      }
      if (url.includes('/items?')) {
        individualFetchCalled = true;
        return new Response('fallback content', { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    try {
      const provider = new ZipFileProvider({
        org: 'org',
        project: 'proj',
        defaultRepoId: 'repo',
        defaultBranch: 'refs/heads/main',
      });

      const content = await provider.getFileContent(
        '',
        '/missing-from-zip.yml',
      );
      expect(content).toBe('fallback content');
      expect(individualFetchCalled).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('implements IFileProvider interface', () => {
    const provider = new ZipFileProvider({
      org: 'org',
      project: 'proj',
      defaultRepoId: 'repo',
    });

    // Verify it has the required method
    expect(typeof provider.getFileContent).toBe('function');
  });
});
