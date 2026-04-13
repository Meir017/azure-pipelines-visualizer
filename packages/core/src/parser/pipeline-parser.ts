import type {
  ExtendsBlock,
  Job,
  Pipeline,
  Pool,
  ResourcePipeline,
  ResourceRepository,
  Resources,
  Stage,
  Step,
  Trigger,
  VariableEntry,
} from '../model/pipeline.js';
import { toYaml } from './yaml-parser.js';

/**
 * Maps a raw parsed YAML object into a typed Pipeline model.
 */
export function mapToPipeline(raw: Record<string, unknown>): Pipeline {
  const pipeline: Pipeline = {
    trigger: parseTrigger(raw.trigger),
    pr: parseTrigger(raw.pr),
    resources: parseResources(raw.resources),
    variables: parseVariables(raw.variables),
    extends: parseExtends(raw.extends),
    stages: parseStages(raw.stages),
    jobs: parseJobs(raw.jobs),
    steps: parseSteps(raw.steps),
    pool: parsePool(raw.pool),
    rawYaml: toYaml(raw),
  };
  return pipeline;
}

function parseTrigger(raw: unknown): Trigger | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw === 'none') return 'none';
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'object') return raw as Trigger;
  return undefined;
}

function parseResources(raw: unknown): Resources | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    repositories: parseRepositories(r.repositories),
    pipelines: parsePipelines(r.pipelines),
  };
}

function parseRepositories(raw: unknown): ResourceRepository[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((r: Record<string, unknown>) => ({
    repository: r.repository as string,
    type: r.type as ResourceRepository['type'],
    name: r.name as string,
    ref: r.ref as string | undefined,
    endpoint: r.endpoint as string | undefined,
  }));
}

function parsePipelines(raw: unknown): ResourcePipeline[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((r: Record<string, unknown>) => ({
    pipeline: r.pipeline as string,
    source: r.source as string,
    trigger: r.trigger as boolean | undefined,
  }));
}

function parseVariables(raw: unknown): VariableEntry[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((v: Record<string, unknown>) => {
      if (v.template) {
        return {
          template: v.template as string,
          parameters: v.parameters as Record<string, unknown> | undefined,
        };
      }
      if (v.group) return { group: v.group as string };
      return { name: v.name as string, value: String(v.value) };
    });
  }
  // Object-style variables: { key: value }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(
      ([name, value]) => ({
        name,
        value: String(value),
      }),
    );
  }
  return undefined;
}

function parseExtends(raw: unknown): ExtendsBlock | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  return {
    template: e.template as string,
    parameters: e.parameters as Record<string, unknown> | undefined,
  };
}

function parseStages(raw: unknown): Stage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((s: Record<string, unknown>) => mapToStage(s));
}

function mapToStage(raw: Record<string, unknown>): Stage {
  return {
    stage: (raw.stage as string) ?? '',
    displayName: raw.displayName as string | undefined,
    dependsOn: raw.dependsOn as string | string[] | undefined,
    condition: raw.condition as string | undefined,
    variables: parseVariables(raw.variables),
    jobs: parseJobs(raw.jobs),
    pool: parsePool(raw.pool),
    rawYaml: toYaml(raw),
  };
}

function parseJobs(raw: unknown): Job[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((j: Record<string, unknown>) => mapToJob(j));
}

function mapToJob(raw: Record<string, unknown>): Job {
  return {
    job: raw.job as string | undefined,
    deployment: raw.deployment as string | undefined,
    displayName: raw.displayName as string | undefined,
    dependsOn: raw.dependsOn as string | string[] | undefined,
    condition: raw.condition as string | undefined,
    pool: parsePool(raw.pool),
    variables: parseVariables(raw.variables),
    steps: parseSteps(raw.steps),
    environment: raw.environment as string | undefined,
    rawYaml: toYaml(raw),
  };
}

function parseSteps(raw: unknown): Step[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((s: Record<string, unknown>) => mapToStep(s));
}

function mapToStep(raw: Record<string, unknown>): Step {
  return {
    script: raw.script as string | undefined,
    bash: raw.bash as string | undefined,
    powershell: raw.powershell as string | undefined,
    pwsh: raw.pwsh as string | undefined,
    task: raw.task as string | undefined,
    checkout: raw.checkout as string | undefined,
    download: raw.download as string | undefined,
    publish: raw.publish as string | undefined,
    displayName: raw.displayName as string | undefined,
    condition: raw.condition as string | undefined,
    inputs: raw.inputs as Record<string, string> | undefined,
    env: raw.env as Record<string, string> | undefined,
    rawYaml: toYaml(raw),
  };
}

function parsePool(raw: unknown): Pool | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  return {
    vmImage: p.vmImage as string | undefined,
    name: p.name as string | undefined,
    demands: p.demands as string[] | undefined,
  };
}
