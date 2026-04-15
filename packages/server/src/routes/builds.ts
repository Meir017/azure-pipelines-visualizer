import { Hono } from 'hono';
import {
  getBuild,
  getCommitFlowGraph,
  getRepository,
  listBuildsForCommit,
} from '../services/azure-devops.js';

const builds = new Hono();

/** Get the full commit flow graph: root builds + recursively triggered builds. */
builds.get('/:org/:project/commit-flow', async (c) => {
  const { org, project } = c.req.param();
  const commitSha = c.req.query('commitSha');
  const repoName = c.req.query('repoName');

  if (!repoName || !commitSha) {
    return c.json(
      { error: 'Both repoName and commitSha query parameters are required' },
      400,
    );
  }

  const repo = await getRepository(org, project, repoName);
  const data = await getCommitFlowGraph(org, project, repo.id, commitSha);
  return c.json(data);
});

builds.get('/:org/:project/builds', async (c) => {
  const { org, project } = c.req.param();
  const commitSha = c.req.query('commitSha');
  const repoName = c.req.query('repoName');

  if (!repoName || !commitSha) {
    return c.json(
      { error: 'Both repoName and commitSha query parameters are required' },
      400,
    );
  }

  const repo = await getRepository(org, project, repoName);
  const data = await listBuildsForCommit(org, project, repo.id, commitSha);
  return c.json(data);
});

builds.get('/:org/:project/builds/:buildId', async (c) => {
  const { org, project, buildId } = c.req.param();
  const data = await getBuild(org, project, Number(buildId));
  return c.json(data);
});

export { builds };
