/**
 * Standalone entrypoint for `bun build --compile`.
 * Extends the base server with embedded web frontend assets.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { webAssets } from './_web-assets.js';
import { getConfig } from './config.js';
import { files } from './routes/files.js';
import { pipelines } from './routes/pipelines.js';
import { schema } from './routes/schema.js';

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
  const ext = path.slice(path.lastIndexOf('.'));
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// Load config on startup
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

// Serve embedded web assets
app.get('/assets/*', async (c) => {
  const urlPath = c.req.path;
  const filePath = webAssets[urlPath];
  if (!filePath) return c.notFound();

  const file = Bun.file(filePath);
  return new Response(file, {
    headers: {
      'Content-Type': getMimeType(urlPath),
      'Cache-Control': 'public, immutable, max-age=31536000',
    },
  });
});

// SPA: serve index.html for all non-API routes
app.get('*', async (c) => {
  const filePath = webAssets['/index.html'];
  if (!filePath) return c.notFound();

  const file = Bun.file(filePath);
  return new Response(file, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 120,
};
