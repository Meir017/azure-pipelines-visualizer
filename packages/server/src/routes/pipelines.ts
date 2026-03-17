import { Hono } from 'hono';
import {
  listPipelines,
  getPipelineDefinition,
  getFileContent,
} from '../services/azure-devops.js';

const pipelines = new Hono();

pipelines.get('/:org/:project/pipelines', async (c) => {
  const { org, project } = c.req.param();
  const data = await listPipelines(org, project);
  return c.json(data);
});

pipelines.get('/:org/:project/pipelines/:id', async (c) => {
  const { org, project, id } = c.req.param();
  const definition = await getPipelineDefinition(org, project, Number(id));
  return c.json(definition);
});

pipelines.get('/:org/:project/pipelines/:id/yaml', async (c) => {
  const { org, project, id } = c.req.param();
  const definition = await getPipelineDefinition(org, project, Number(id));
  const yamlContent = await getFileContent(
    org,
    project,
    definition.repository.id,
    definition.path,
    definition.repository.defaultBranch,
  );
  return c.json({
    definition,
    yaml: yamlContent,
  });
});

export { pipelines };
