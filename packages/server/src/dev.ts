import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { getRequestListener } from '@hono/node-server';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';
import { app } from './app.js';

const webRoot = resolve(import.meta.dir, '../../web');

const vite = await createViteServer({
  root: webRoot,
  appType: 'spa',
  server: { middlewareMode: true },
  plugins: [react()],
});

const honoListener = getRequestListener(app.fetch);

const server = createServer((req, res) => {
  const url = req.url ?? '/';

  if (url.startsWith('/api') || url === '/health') {
    honoListener(req, res);
    return;
  }

  vite.middlewares(req, res, () => {
    // If Vite didn't handle it, pass to Hono (404)
    honoListener(req, res);
  });
});

server.listen(3000, () => {
  console.log('Dev server running at http://localhost:3000');
});
