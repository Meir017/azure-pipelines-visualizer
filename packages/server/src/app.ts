import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { getConfig } from './config.js';
import { builds } from './routes/builds.js';
import { environments } from './routes/environments.js';
import { files } from './routes/files.js';
import { pipelines } from './routes/pipelines.js';
import { schema } from './routes/schema.js';

// Load config on startup
getConfig();

const app = new Hono();

app.use('/*', logger());

app.get('/health', (c) => c.json({ status: 'ok' }));

// Serve custom task docs config to the frontend
app.get('/api/config/task-docs', (c) => {
  const config = getConfig();
  return c.json({ customTaskDocs: config.customTaskDocs ?? {} });
});

// Mount API routes
app.route('/api', pipelines);
app.route('/api', builds);
app.route('/api', environments);
app.route('/api', files);
app.route('/api', schema);

// Global error handler
app.onError((err, c) => {
  console.error('Server error:', err.message);

  // Auth errors
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

  // ADO API errors (forwarded status)
  const adoMatch = err.message.match(/API error \((\d+)\)/);
  if (adoMatch) {
    const status = Number(adoMatch[1]);
    return c.json({ error: err.message }, status as 400);
  }

  return c.json({ error: err.message }, 500);
});

export { app };
