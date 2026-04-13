import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLocalRepoPath, resetConfig } from './config.js';

const tmpDir = resolve(import.meta.dir, '__config_test__');
const configPath = resolve(tmpDir, 'apv.config.json');

function writeConfig(config: object) {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config), 'utf-8');
  process.env.APV_CONFIG = configPath;
  resetConfig();
}

afterEach(() => {
  delete process.env.APV_CONFIG;
  resetConfig();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getLocalRepoPath', () => {
  test('returns path for exact match', () => {
    writeConfig({
      localRepos: { 'microsoft/WDATP/MyRepo': '/local/MyRepo' },
    });
    expect(getLocalRepoPath('microsoft', 'WDATP', 'MyRepo')).toBe(
      '/local/MyRepo',
    );
  });

  test('returns path for case-insensitive match', () => {
    writeConfig({
      localRepos: {
        'microsoft/WDATP/wdatp.infra.system.tools': '/local/tools',
      },
    });
    expect(
      getLocalRepoPath('Microsoft', 'WDATP', 'WDATP.Infra.System.Tools'),
    ).toBe('/local/tools');
  });

  test('returns undefined when no match', () => {
    writeConfig({
      localRepos: { 'microsoft/WDATP/MyRepo': '/local/MyRepo' },
    });
    expect(getLocalRepoPath('microsoft', 'WDATP', 'OtherRepo')).toBeUndefined();
  });

  test('returns undefined when no localRepos configured', () => {
    writeConfig({});
    expect(getLocalRepoPath('microsoft', 'WDATP', 'MyRepo')).toBeUndefined();
  });
});
