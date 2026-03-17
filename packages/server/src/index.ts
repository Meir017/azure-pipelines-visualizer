import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { pipelines } from './routes/pipelines.js';
import { files } from './routes/files.js';

const app = new Hono();

app.use('/*', cors({ origin: 'http://localhost:3000' }));

app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount API routes
app.route('/api', pipelines);
app.route('/api', files);

// Global error handler
app.onError((err, c) => {
  console.error('Server error:', err.message);
  return c.json({ error: err.message }, 500);
});

export default {
  port: 3001,
  fetch: app.fetch,
};
