import { Hono } from 'hono';
import { getBuild, listBuildsForCommit } from '../services/azure-devops.js';

const builds = new Hono();

builds.get('/:org/:project/builds', async (c) => {
  const { org, project } = c.req.param();
  const repoId = c.req.query('repoId');
  const commitSha = c.req.query('commitSha');

  if (!repoId || !commitSha) {
    return c.json(
      { error: 'Both repoId and commitSha query parameters are required' },
      400,
    );
  }

  const data = await listBuildsForCommit(org, project, repoId, commitSha);
  return c.json(data);
});

builds.get('/:org/:project/builds/:buildId', async (c) => {
  const { org, project, buildId } = c.req.param();
  const data = await getBuild(org, project, Number(buildId));
  return c.json(data);
});

export { builds };
