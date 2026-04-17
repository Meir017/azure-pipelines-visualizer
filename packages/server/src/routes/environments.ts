import { Hono } from 'hono';
import {
  getEnvironmentDeployments,
  listEnvironments,
} from '../services/azure-devops.js';

const environments = new Hono();

environments.get('/:org/:project/environments', async (c) => {
  const { org, project } = c.req.param();
  const data = await listEnvironments(org, project);
  return c.json(data);
});

environments.get(
  '/:org/:project/environments/:envId/deployments',
  async (c) => {
    const { org, project, envId } = c.req.param();
    const data = await getEnvironmentDeployments(org, project, Number(envId));
    return c.json(data);
  },
);

export { environments };
