import { Hono } from 'hono';
import {
  getPipelineDefinition,
  listPipelines,
} from '../services/azure-devops.js';
import { fetchRepoFileWithCache } from '../services/repo-file-cache.js';

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
  const yamlFile = await fetchRepoFileWithCache({
    org,
    project,
    repoId: definition.repository.id,
    repoName: definition.repository.name,
    path: definition.path,
    ref: definition.repository.defaultBranch,
  });

  return c.json({
    definition,
    yaml: yamlFile.content,
    branch: yamlFile.requestedRef,
    commitSha: yamlFile.commitSha,
    cache: yamlFile.cache,
  });
});

export { pipelines };
