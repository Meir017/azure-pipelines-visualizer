import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Read a file from a local repo directory.
 * The `filePath` is resolved relative to `repoRoot`.
 * Rejects paths that try to escape the repo root via `..`.
 */
export async function getLocalFileContent(
  repoRoot: string,
  filePath: string,
): Promise<string> {
  // Normalize and join
  const cleaned = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const full = normalize(join(repoRoot, cleaned));

  // Security: ensure the resolved path is still under repoRoot
  const normalizedRoot = normalize(repoRoot);
  if (!full.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal attempt: ${filePath}`);
  }

  if (!existsSync(full)) {
    throw new Error(`File not found locally: ${full}`);
  }

  return readFile(full, 'utf-8');
}
