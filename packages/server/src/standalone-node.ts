/**
 * Standalone entrypoint for Node.js (npm distribution).
 * Serves the web frontend from dist/web/ and the API routes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getConfig, setConfigPath } from './config.js';
import { files } from './routes/files.js';
import { pipelines } from './routes/pipelines.js';
import { schema } from './routes/schema.js';

// Replaced at bundle time by esbuild
declare const __APV_VERSION__: string;

// --- CLI argument parsing ---------------------------------------------------

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', short: 'c' },
    port: { type: 'string', short: 'p' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  strict: true,
  allowPositionals: false,
});

if (args.help) {
  console.log(
    `
Azure Pipelines Visualizer

Usage: apv [options]

Options:
  -c, --config <path>  Path to apv.config.json
  -p, --port <number>  Port to listen on (default: 3001)
  -h, --help           Show this help message
  -v, --version        Show version number
`.trim(),
  );
  process.exit(0);
}

if (args.version) {
  const version =
    typeof __APV_VERSION__ !== 'undefined' ? __APV_VERSION__ : 'dev';
  console.log(version);
  process.exit(0);
}

// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIR = join(__dirname, 'web');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function getMimeType(path: string): string {
  const ext = extname(path);
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// Load config on startup (with optional explicit path)
if (args.config) {
  setConfigPath(args.config);
}
getConfig();

const app = new Hono();

app.use('/*', logger());
app.use('/*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/api/config/task-docs', (c) => {
  const config = getConfig();
  return c.json({ customTaskDocs: config.customTaskDocs ?? {} });
});

// Mount API routes
app.route('/api', pipelines);
app.route('/api', files);
app.route('/api', schema);

// 404 for unknown API routes (before SPA catch-all)
app.all('/api/*', (c) => {
  return c.json({ error: `Not found: ${c.req.path}` }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Server error:', err.message);

  if (
    err.message.includes('DefaultAzureCredential') ||
    err.message.includes('authentication')
  ) {
    return c.json(
      {
        error:
          'Authentication failed. Ensure you are logged in via `az login`.',
        details: err.message,
      },
      401,
    );
  }

  const adoMatch = err.message.match(/API error \((\d+)\)/);
  if (adoMatch) {
    const status = Number(adoMatch[1]);
    return c.json({ error: err.message }, status as 400);
  }

  return c.json({ error: err.message }, 500);
});

// Serve web assets from dist/web/
app.get('/assets/*', (c) => {
  const urlPath = c.req.path;
  const filePath = join(WEB_DIR, urlPath);
  if (!existsSync(filePath)) return c.notFound();

  const content = readFileSync(filePath);
  return c.body(content, 200, {
    'Content-Type': getMimeType(urlPath),
    'Cache-Control': 'public, immutable, max-age=31536000',
  });
});

// SPA: serve index.html for all non-API routes
app.get('*', (c) => {
  const indexPath = join(WEB_DIR, 'index.html');
  if (!existsSync(indexPath)) return c.notFound();

  const content = readFileSync(indexPath, 'utf-8');
  return c.html(content);
});

const port = Number(args.port) || Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`APV server listening on http://localhost:${info.port}`);
});

export { app };
