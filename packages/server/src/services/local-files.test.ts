import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { getLocalFileContent } from './local-files.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmpDir = join(import.meta.dir, '__test_repo__');

beforeAll(() => {
  mkdirSync(join(tmpDir, 'subdir'), { recursive: true });
  writeFileSync(join(tmpDir, 'hello.txt'), 'hello world');
  writeFileSync(join(tmpDir, 'subdir', 'nested.yml'), 'steps:\n  - script: echo hi');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getLocalFileContent', () => {
  test('reads a file at the repo root', async () => {
    const content = await getLocalFileContent(tmpDir, 'hello.txt');
    expect(content).toBe('hello world');
  });

  test('reads a nested file', async () => {
    const content = await getLocalFileContent(tmpDir, 'subdir/nested.yml');
    expect(content).toContain('steps:');
  });

  test('strips leading slashes from filePath', async () => {
    const content = await getLocalFileContent(tmpDir, '/hello.txt');
    expect(content).toBe('hello world');
  });

  test('strips multiple leading slashes', async () => {
    const content = await getLocalFileContent(tmpDir, '///hello.txt');
    expect(content).toBe('hello world');
  });

  test('normalizes backslashes to forward slashes', async () => {
    const content = await getLocalFileContent(tmpDir, 'subdir\\nested.yml');
    expect(content).toContain('steps:');
  });

  test('throws on path traversal attempt', async () => {
    await expect(
      getLocalFileContent(tmpDir, '../../etc/passwd'),
    ).rejects.toThrow('Path traversal attempt');
  });

  test('throws on file not found', async () => {
    await expect(
      getLocalFileContent(tmpDir, 'nonexistent.yml'),
    ).rejects.toThrow('File not found locally');
  });

  test('throws on directory path (not a file)', async () => {
    await expect(
      getLocalFileContent(tmpDir, 'subdir'),
    ).rejects.toThrow(); // readFile on a directory throws
  });
});
