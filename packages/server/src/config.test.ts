import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig, resetConfig } from './config.js';

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

describe('getConfig', () => {
  test('loads customTaskDocs from config', () => {
    writeConfig({
      customTaskDocs: { 'MyTask@1': 'https://example.com' },
    });
    const config = getConfig();
    expect(config.customTaskDocs).toEqual({
      'MyTask@1': 'https://example.com',
    });
  });

  test('returns empty defaults when no config', () => {
    const config = getConfig();
    expect(config.customTaskDocs).toEqual({});
  });
});
