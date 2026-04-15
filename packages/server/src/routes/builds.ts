import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  getBuild,
  getCommitFlowGraph,
  getRepository,
  listBuildsForCommit,
  streamCommitFlowGraph,
} from '../services/azure-devops.js';

const builds = new Hono();

/** Stream the commit flow graph via SSE: emits batches as BFS discovers them. */
builds.get('/:org/:project/commit-flow/stream', async (c) => {
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

  return streamSSE(c, async (stream) => {
    try {
      for await (const batch of streamCommitFlowGraph(
        org,
        project,
        repo.id,
        commitSha,
      )) {
        await stream.writeSSE({
          data: JSON.stringify(batch),
          event: 'builds',
        });
      }
      await stream.writeSSE({ data: '', event: 'done' });
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        event: 'error',
      });
    }
  });
});

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
