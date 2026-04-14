import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * App configuration.
 *
 * Example apv.config.json:
 * {
 *   "cacheDir": ".cache/ado-file-cache",
 *   "customTaskDocs": {
 *     "OneBranch.Pipeline.Build@1": "https://onebranch.dev/docs/build",
 *     "OneBranch.Pipeline.Signing": "https://onebranch.dev/docs/signing"
 *   }
 * }
 */
export interface AppConfig {
  cacheDir?: string;
  customTaskDocs?: Record<string, string>;
}

const CONFIG_FILENAME = 'apv.config.json';

let _config: AppConfig | null = null;
let _explicitConfigPath: string | undefined;

/**
 * Set an explicit config file path (e.g. from CLI --config flag).
 * Must be called before the first getConfig() call.
 */
export function setConfigPath(configPath: string): void {
  _explicitConfigPath = configPath;
}

export function getConfig(): AppConfig {
  if (_config) return _config;

  // Search: explicit path, env var, then cwd, then repo root
  const envPath = process.env.APV_CONFIG;
  const candidates = [
    _explicitConfigPath,
    envPath,
    resolve(process.cwd(), CONFIG_FILENAME),
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      CONFIG_FILENAME,
    ),
  ].filter(Boolean) as string[];

  for (const configPath of candidates) {
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as AppConfig;
        _config = {
          cacheDir: parsed.cacheDir,
          customTaskDocs: parsed.customTaskDocs ?? {},
        };
        console.log(`Loaded config from ${configPath}`);
        return _config;
      } catch (err) {
        console.warn(`Failed to parse ${configPath}:`, err);
      }
    }
  }

  // No config found — empty defaults
  _config = { customTaskDocs: {} };
  return _config;
}

/** Reset cached config (for testing). */
export function resetConfig(): void {
  _config = null;
  _explicitConfigPath = undefined;
}
