import { Hono } from 'hono';
import { listRepositories, getRepository, getFileContent } from '../services/azure-devops.js';

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

/**
 * Fetch a file by repo name (not ID). Resolves repo name → ID first.
 * Used by the URL-based pipeline selector.
 */
files.get('/:org/:project/file-by-repo-name', async (c) => {
  const { org, project } = c.req.param();
  const repoName = c.req.query('repo');
  const path = c.req.query('path');
  const branch = c.req.query('branch');

  if (!repoName || !path) {
    return c.json({ error: 'repo and path query parameters are required' }, 400);
  }

  // Look up the single repo by name (much faster than listing all repos)
  const repo = await getRepository(org, project, repoName);
  if (!repo) {
    return c.json({ error: `Repository not found: ${repoName}` }, 404);
  }

  const content = await getFileContent(org, project, repo.id, path, branch || repo.defaultBranch);
  return c.json({
    content,
    path,
    repoId: repo.id,
    repoName: repo.name,
    branch: branch || repo.defaultBranch,
  });
});

export { files };
