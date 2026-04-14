import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, '..');
const ENTRY = resolve(CLI_DIR, 'dist', 'index.min.js');
const PORT = 3099;

describe('CLI Node.js integration', () => {
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let server;

  before(async () => {
    assert.ok(
      existsSync(ENTRY),
      `Bundle not found at ${ENTRY}. Run "bun run build:cli" first.`,
    );

    server = spawn('node', [ENTRY], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Server did not start within 10s')),
        10_000,
      );
      server.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.stderr.on('data', (data) => {
        console.error('server stderr:', data.toString());
      });
      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  after(() => {
    if (server) {
      server.kill('SIGTERM');
    }
  });

  it('GET /health returns ok', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok' });
  });

  it('GET /api/config/task-docs returns config', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/config/task-docs`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(
      'customTaskDocs' in body,
      'Response should have customTaskDocs key',
    );
  });

  it('GET / serves index.html', async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(
      contentType?.includes('text/html'),
      `Expected text/html but got ${contentType}`,
    );
    const body = await res.text();
    assert.ok(
      body.includes('<!DOCTYPE html>') || body.includes('<html'),
      'Should serve HTML',
    );
  });

  it('GET /some/spa/route serves index.html (SPA fallback)', async () => {
    const res = await fetch(`http://localhost:${PORT}/some/spa/route`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(
      contentType?.includes('text/html'),
      'SPA fallback should serve HTML',
    );
  });

  it('GET /api/unknown returns 404', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/unknown`);
    assert.equal(res.status, 404);
  });
});
