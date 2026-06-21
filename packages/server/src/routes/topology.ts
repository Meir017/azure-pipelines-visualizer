import { Hono } from 'hono';
import { listPipelines, listProjects } from '../services/azure-devops.js';

const topology = new Hono();

topology.get('/:org/topology/projects', async (c) => {
  const { org } = c.req.param();
  const projects = await listProjects(org);
  return c.json(projects);
});

topology.get('/:org/:project/topology/pipelines', async (c) => {
  const { org, project } = c.req.param();
  const pipelines = await listPipelines(org, project);

  // Group by folder
  const folders: Record<string, typeof pipelines> = {};
  for (const p of pipelines) {
    const folder = p.folder || '\\';
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(p);
  }

  return c.json({ pipelines, folders });
});

export { topology };
