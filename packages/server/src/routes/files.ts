import { Hono } from 'hono';
import { listRepositories, getFileContent } from '../services/azure-devops.js';

const files = new Hono();

files.get('/:org/:project/repos', async (c) => {
  const { org, project } = c.req.param();
  const repos = await listRepositories(org, project);
  return c.json(repos);
});

files.get('/:org/:project/repos/:repoId/file', async (c) => {
  const { org, project, repoId } = c.req.param();
  const path = c.req.query('path');
  const branch = c.req.query('branch');

  if (!path) {
    return c.json({ error: 'path query parameter is required' }, 400);
  }

  const content = await getFileContent(org, project, repoId, path, branch || undefined);
  return c.json({ content, path, repoId, branch });
});

export { files };
