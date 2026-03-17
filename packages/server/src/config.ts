import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Maps "org/project/repo" → local filesystem path.
 *
 * Example apv.config.json:
 * {
 *   "localRepos": {
 *     "microsoft/WDATP/Wcd.Infra.ConfigurationGeneration": "D:/git/configen",
 *     "microsoft/WDATP/GovernedTemplates": "D:/git/governed-templates"
 *   }
 * }
 */
export interface AppConfig {
  localRepos: Record<string, string>;
}

const CONFIG_FILENAME = 'apv.config.json';

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  // Search: env var, then cwd, then repo root
  const envPath = process.env.APV_CONFIG;
  const candidates = [
    envPath,
    resolve(process.cwd(), CONFIG_FILENAME),
    resolve(import.meta.dir, '..', '..', '..', CONFIG_FILENAME),
  ].filter(Boolean) as string[];

  for (const configPath of candidates) {
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        _config = JSON.parse(raw) as AppConfig;
        console.log(`Loaded config from ${configPath}`);
        logLocalMappings(_config);
        return _config;
      } catch (err) {
        console.warn(`Failed to parse ${configPath}:`, err);
      }
    }
  }

  // No config found — empty defaults
  _config = { localRepos: {} };
  return _config;
}

/**
 * Look up a local path for a given org/project/repo.
 * Returns the local directory path or undefined if not mapped.
 */
export function getLocalRepoPath(
  org: string,
  project: string,
  repoName: string,
): string | undefined {
  const config = getConfig();
  // Try exact match first, then case-insensitive
  const key = `${org}/${project}/${repoName}`;
  if (config.localRepos[key]) return config.localRepos[key];

  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(config.localRepos)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function logLocalMappings(config: AppConfig) {
  const entries = Object.entries(config.localRepos);
  if (entries.length === 0) {
    console.log('  No local repo mappings configured');
    return;
  }
  console.log(`  ${entries.length} local repo mapping(s):`);
  for (const [key, path] of entries) {
    console.log(`    ${key} → ${path}`);
  }
}

/** Reset cached config (for testing). */
export function resetConfig(): void {
  _config = null;
}
