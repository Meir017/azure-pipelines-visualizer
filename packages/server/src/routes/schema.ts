import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Hono } from 'hono';
import { getAzureDevOpsToken } from '../auth.js';

const schema = new Hono();

export interface TaskSchemaEntry {
  name: string;
  description: string;
  version: number;
  inputs: { name: string; description: string; required: boolean }[];
}

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCachePath(org: string): string {
  // Cache relative to the repo root
  const repoRoot = resolve(import.meta.dir, '..', '..', '..', '..');
  return resolve(repoRoot, '.cache', `task-schema-${org.toLowerCase()}.json`);
}

function readCache(org: string): TaskSchemaEntry[] | null {
  const path = getCachePath(org);
  if (!existsSync(path)) return null;

  try {
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE_MS) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(org: string, entries: TaskSchemaEntry[]): void {
  const path = getCachePath(org);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2));
}

/**
 * Extract task definitions from the ADO YAML schema.
 *
 * The schema has `definitions.task.properties.task.anyOf` containing entries like:
 * { description: "...", enum: ["TaskName@Version"] }
 */
export function extractTasksFromSchema(
  schemaJson: Record<string, unknown>,
): TaskSchemaEntry[] {
  const definitions = schemaJson.definitions as
    | Record<string, unknown>
    | undefined;
  if (!definitions) return [];

  const taskDef = definitions.task as Record<string, unknown> | undefined;
  const taskProp = (taskDef?.properties as Record<string, unknown> | undefined)
    ?.task as Record<string, unknown> | undefined;
  const anyOf = taskProp?.anyOf as Array<Record<string, unknown>> | undefined;
  if (!anyOf) return [];

  const tasks: TaskSchemaEntry[] = [];

  for (const entry of anyOf) {
    const enumVal = entry.enum as string[] | undefined;
    if (!enumVal?.length) continue;

    const raw = enumVal[0];
    const description =
      typeof entry.description === 'string' ? entry.description : '';
    const atIdx = raw.lastIndexOf('@');

    let name: string;
    let version: number;
    if (atIdx > 0) {
      name = raw.slice(0, atIdx);
      version = parseInt(raw.slice(atIdx + 1), 10);
      if (Number.isNaN(version)) version = 0;
    } else {
      name = raw;
      version = 0;
    }

    tasks.push({ name, description, version, inputs: [] });
  }

  return tasks;
}

/**
 * GET /api/:org/schema/tasks
 *
 * Fetches the YAML schema from Azure DevOps for the given org,
 * extracts task definitions with descriptions, and caches them locally.
 */
schema.get('/:org/schema/tasks', async (c) => {
  const { org } = c.req.param();

  // Try cache first
  const cached = readCache(org);
  if (cached) {
    return c.json({ tasks: cached, cached: true });
  }

  // Fetch from ADO
  const token = await getAzureDevOpsToken();
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/distributedtask/yamlschema?api-version=7.1`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    return c.json(
      { error: `Failed to fetch schema: ${resp.status} ${text}` },
      resp.status as 400,
    );
  }

  const schemaJson = (await resp.json()) as Record<string, unknown>;
  const tasks = extractTasksFromSchema(schemaJson);

  // Cache the result
  writeCache(org, tasks);
  console.log(`Cached ${tasks.length} task definitions for org "${org}"`);

  return c.json({ tasks, cached: false });
});

export { schema };
