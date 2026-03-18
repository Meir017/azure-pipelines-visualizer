import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { pipelines } from './routes/pipelines.js';
import { files } from './routes/files.js';
import { schema } from './routes/schema.js';
import { getConfig } from './config.js';

// Load config on startup
getConfig();

const app = new Hono();

app.use('/*', logger());
app.use('/*', cors({ origin: 'http://localhost:3000' }));

app.get('/health', (c) => c.json({ status: 'ok' }));

// Serve custom task docs config to the frontend
app.get('/api/config/task-docs', (c) => {
  const config = getConfig();
  return c.json({ customTaskDocs: config.customTaskDocs ?? {} });
});

// Mount API routes
app.route('/api', pipelines);
app.route('/api', files);
app.route('/api', schema);

// Global error handler
app.onError((err, c) => {
  console.error('Server error:', err.message);

  // Auth errors
  if (err.message.includes('DefaultAzureCredential') || err.message.includes('authentication')) {
    return c.json(
      {
        error: 'Authentication failed. Ensure you are logged in via `az login`.',
        details: err.message,
      },
      401,
    );
  }

  // ADO API errors (forwarded status)
  const adoMatch = err.message.match(/API error \((\d+)\)/);
  if (adoMatch) {
    const status = Number(adoMatch[1]);
    return c.json({ error: err.message }, status as 400);
  }

  return c.json({ error: err.message }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: `Not found: ${c.req.path}` }, 404);
});

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 120,
};
