import { describe, expect, test } from 'bun:test';
import type { Pipeline, Stage, Job, Step, TemplateReference } from '../../src/model/pipeline.js';

describe('Pipeline model types', () => {
  test('simple pipeline can be constructed', () => {
    const pipeline: Pipeline = {
      trigger: ['main'],
      pool: { vmImage: 'ubuntu-latest' },
      steps: [
        { script: 'echo hello', displayName: 'Greet' },
        { task: 'DotNetCoreCLI@2', inputs: { command: 'build' } },
      ],
    };

    expect(pipeline.trigger).toEqual(['main']);
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps![0].script).toBe('echo hello');
    expect(pipeline.stages).toBeUndefined();
  });

  test('pipeline with stages/jobs/steps hierarchy', () => {
    const pipeline: Pipeline = {
      stages: [
        {
          stage: 'Build',
          jobs: [
            {
              job: 'buildJob',
              pool: { vmImage: 'ubuntu-latest' },
              steps: [{ script: 'npm run build' }],
            },
          ],
        },
        {
          stage: 'Deploy',
          dependsOn: 'Build',
          condition: "succeeded('Build')",
          jobs: [
            {
              deployment: 'deployJob',
              environment: 'production',
              steps: [{ script: 'deploy.sh' }],
            },
          ],
        },
      ],
    };

    expect(pipeline.stages).toHaveLength(2);
    expect(pipeline.stages![1].dependsOn).toBe('Build');
    expect(pipeline.stages![1].jobs![0].deployment).toBe('deployJob');
  });

  test('pipeline with extends block', () => {
    const pipeline: Pipeline = {
      extends: {
        template: 'v2/OneBranch.Official.CrossPlat.yml@GovernedTemplates',
        parameters: {
          globalSdl: { binskim: { enabled: true } },
        },
      },
    };

    expect(pipeline.extends!.template).toContain('GovernedTemplates');
    expect(pipeline.extends!.parameters!.globalSdl).toBeDefined();
  });

  test('pipeline with resources', () => {
    const pipeline: Pipeline = {
      resources: {
        repositories: [
          {
            repository: 'templates',
            type: 'github',
            name: 'org/shared-templates',
            ref: 'refs/tags/v1',
            endpoint: 'github-conn',
          },
        ],
        pipelines: [
          {
            pipeline: 'upstream',
            source: 'BuildPipeline',
            trigger: true,
          },
        ],
      },
    };

    expect(pipeline.resources!.repositories).toHaveLength(1);
    expect(pipeline.resources!.repositories![0].type).toBe('github');
    expect(pipeline.resources!.pipelines![0].trigger).toBe(true);
  });

  test('stage with template reference', () => {
    const stage: Stage = {
      stage: '',
      templateRef: {
        rawPath: 'stages/deploy.yml@templates',
        normalizedPath: 'stages/deploy.yml',
        repoAlias: 'templates',
        parameters: { env: 'prod' },
        location: 'stages',
        conditional: false,
      },
    };

    expect(stage.templateRef!.repoAlias).toBe('templates');
    expect(stage.templateRef!.location).toBe('stages');
  });

  test('variable entries support all three forms', () => {
    const pipeline: Pipeline = {
      variables: [
        { name: 'foo', value: 'bar' },
        { group: 'my-var-group' },
        { template: 'variables/common.yml', parameters: { env: 'prod' } },
      ],
    };

    expect(pipeline.variables).toHaveLength(3);
  });
});
