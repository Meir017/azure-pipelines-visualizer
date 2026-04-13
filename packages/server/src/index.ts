import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveStatic } from 'hono/bun';
import { app } from './app.js';

const webDistDir = resolve(import.meta.dir, '../../web/dist');

if (existsSync(webDistDir)) {
  // Serve pre-built web assets
  app.use('/*', serveStatic({ root: webDistDir }));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', serveStatic({ root: webDistDir, path: '/index.html' }));
} else {
  // 404 handler when no web build is available
  app.notFound((c) => {
    return c.json({ error: `Not found: ${c.req.path}` }, 404);
  });
}

export default {
  port: 3000,
  fetch: app.fetch,
  idleTimeout: 120,
};
