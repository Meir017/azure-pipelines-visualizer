import { Hono } from 'hono';
import {
  getTestRunResults,
  listTestRunsForBuild,
} from '../services/azure-devops.js';

const tests = new Hono();

/** List test runs associated with a build. */
tests.get('/:org/:project/builds/:buildId/test-runs', async (c) => {
  const { org, project, buildId } = c.req.param();
  const data = await listTestRunsForBuild(org, project, Number(buildId));
  return c.json(data);
});

/** Get test results for a specific test run. */
tests.get('/:org/:project/test-runs/:runId/results', async (c) => {
  const { org, project, runId } = c.req.param();
  const top = c.req.query('$top');
  const data = await getTestRunResults(
    org,
    project,
    Number(runId),
    top ? Number(top) : undefined,
  );
  return c.json(data);
});

export { tests };
