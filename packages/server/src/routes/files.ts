import { Hono } from 'hono';
import { listRepositories, getRepository } from '../services/azure-devops.js';
import { fetchRepoFileWithCache } from '../services/repo-file-cache.js';
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

  const repo = await getRepository(org, project, repoId);
  const result = await fetchRepoFileWithCache({
    org,
    project,
    repoId: repo.id,
    repoName: repo.name,
    path,
    ref: branch || repo.defaultBranch,
  });

  return c.json({
    content: result.content,
    path: result.path,
    repoId: result.repoId,
    repoName: result.repoName,
    branch: result.requestedRef,
    commitSha: result.commitSha,
    cache: result.cache,
  });
});

/**
 * Fetch a file by repo name (not ID), using local repos or the on-disk cache.
 */
files.get('/:org/:project/file-by-repo-name', async (c) => {
  const { org, project } = c.req.param();
  const repoName = c.req.query('repo');
  const path = c.req.query('path');
  const branch = c.req.query('branch');

  if (!repoName || !path) {
    return c.json({ error: 'repo and path query parameters are required' }, 400);
  }

  // Try local repo first — avoids ADO API round-trip entirely
  const localPath = getLocalRepoPath(org, project, repoName);
  if (localPath) {
    try {
      const content = await getLocalFileContent(localPath, path);
      return c.json({
        content,
        path,
        repoId: repoName,
        repoName,
        branch: branch || 'local',
        commitSha: 'local',
        cache: 'local',
      });
    } catch {
      // Fall through to remote fetch if local read fails
    }
  }

  const repo = await getRepository(org, project, repoName);
  if (!repo) {
    return c.json({ error: `Repository not found: ${repoName}` }, 404);
  }

  const result = await fetchRepoFileWithCache({
    org,
    project,
    repoId: repo.id,
    repoName: repo.name,
    path,
    ref: branch || repo.defaultBranch,
  });

  return c.json({
    content: result.content,
    path: result.path,
    repoId: result.repoId,
    repoName: result.repoName,
    branch: result.requestedRef,
    commitSha: result.commitSha,
    cache: result.cache,
  });
});

export { files };
