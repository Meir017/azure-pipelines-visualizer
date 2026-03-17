import { Hono } from 'hono';
import { listRepositories, getRepository, getFileContent } from '../services/azure-devops.js';
import { getLocalRepoPath } from '../config.js';
import { getLocalFileContent } from '../services/local-files.js';

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
 * Fetch a file by repo name (not ID).
 * Checks local filesystem mappings first, falls back to ADO API.
 */
files.get('/:org/:project/file-by-repo-name', async (c) => {
  const { org, project } = c.req.param();
  const repoName = c.req.query('repo');
  const path = c.req.query('path');
  const branch = c.req.query('branch');

  if (!repoName || !path) {
    return c.json({ error: 'repo and path query parameters are required' }, 400);
  }

  // Check if this repo is mapped to a local directory
  const localPath = getLocalRepoPath(org, project, repoName);
  if (localPath) {
    const content = await getLocalFileContent(localPath, path);
    return c.json({
      content,
      path,
      repoId: `local:${repoName}`,
      repoName,
      branch: branch || 'local',
      local: true,
    });
  }

  // Fall back to Azure DevOps API
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
