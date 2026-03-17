import { useMemo } from 'react';
import { parseYaml, detectTemplateReferences, toYaml, mapToPipeline } from '@apv/core';
import type { TemplateReference, Pipeline, Stage, Job, Step } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import TreeNode from './TreeNode.js';
import YamlBlock from './YamlBlock.js';

export default function PipelineTree() {
  const { selectedPipeline, selectedPipelineLoading, selectedPipelineError } = usePipelineStore();

  const parsed = useMemo(() => {
    if (!selectedPipeline?.yaml) return null;
    const raw = parseYaml(selectedPipeline.yaml) as Record<string, unknown>;
    if (!raw) return null;
    const pipeline = mapToPipeline(raw);
    const templateRefs = detectTemplateReferences(raw);
    return { pipeline, raw, templateRefs };
  }, [selectedPipeline?.yaml]);

  if (selectedPipelineLoading) {
    return <div className="pipeline-tree__loading">⏳ Loading pipeline...</div>;
  }

  if (selectedPipelineError) {
    return <div className="error">{selectedPipelineError}</div>;
  }

  if (!selectedPipeline || !parsed) {
    return <div className="pipeline-tree__empty">Select a pipeline to visualize</div>;
  }

  const { pipeline, templateRefs } = parsed;

  return (
    <div className="pipeline-tree">
      <h2>{selectedPipeline.definition.name}</h2>
      <p className="pipeline-tree__subtitle">
        {selectedPipeline.definition.path} · {templateRefs.length} template reference(s)
      </p>

      {/* Trigger */}
      {pipeline.trigger && (
        <TreeNode nodeId="trigger" label="trigger" type="trigger" yamlContent={toYaml({ trigger: pipeline.trigger })} />
      )}

      {/* Resources */}
      {pipeline.resources && (
        <TreeNode nodeId="resources" label="resources" type="resources" yamlContent={toYaml({ resources: pipeline.resources })} />
      )}

      {/* Variables */}
      {pipeline.variables && (
        <TreeNode nodeId="variables" label="variables" type="variables" yamlContent={toYaml({ variables: pipeline.variables })}>
          {renderVariableTemplates(pipeline.variables, templateRefs)}
        </TreeNode>
      )}

      {/* Extends */}
      {pipeline.extends && (
        <TreeNode
          nodeId="extends"
          label={`extends: ${pipeline.extends.template}`}
          type="extends"
          templateRef={templateRefs.find((r) => r.location === 'extends')}
          yamlContent={toYaml({ extends: pipeline.extends })}
        />
      )}

      {/* Stages */}
      {pipeline.stages?.map((stage, i) => renderStage(stage, i, templateRefs))}

      {/* Top-level jobs */}
      {pipeline.jobs?.map((job, i) => renderJob(job, i, templateRefs))}

      {/* Top-level steps */}
      {pipeline.steps?.map((step, i) => renderStep(step, i, templateRefs))}
    </div>
  );
}

function renderStage(stage: Stage, index: number, allRefs: TemplateReference[]) {
  const nodeId = `stage-${index}`;
  const stageRef = findTemplateRefForItem(stage, allRefs, 'stages');

  if (stageRef) {
    return (
      <TreeNode
        key={nodeId}
        nodeId={nodeId}
        label={stageRef.rawPath}
        type="stage"
        templateRef={stageRef}
      />
    );
  }

  return (
    <TreeNode
      key={nodeId}
      nodeId={nodeId}
      label={stage.displayName || stage.stage || `Stage ${index}`}
      type="stage"
      yamlContent={stage.rawYaml}
    >
      {stage.jobs?.map((job, j) => renderJob(job, j, allRefs, nodeId))}
    </TreeNode>
  );
}

function renderJob(job: Job, index: number, allRefs: TemplateReference[], parentId = '') {
  const nodeId = `${parentId ? `${parentId}-` : ''}job-${index}`;
  const jobRef = findTemplateRefForItem(job, allRefs, 'jobs');

  if (jobRef) {
    return (
      <TreeNode
        key={nodeId}
        nodeId={nodeId}
        label={jobRef.rawPath}
        type="job"
        templateRef={jobRef}
      />
    );
  }

  return (
    <TreeNode
      key={nodeId}
      nodeId={nodeId}
      label={job.displayName || job.job || job.deployment || `Job ${index}`}
      type="job"
      yamlContent={job.rawYaml}
    >
      {job.steps?.map((step, s) => renderStep(step, s, allRefs, nodeId))}
    </TreeNode>
  );
}

function renderStep(step: Step, index: number, allRefs: TemplateReference[], parentId = '') {
  const nodeId = `${parentId ? `${parentId}-` : ''}step-${index}`;
  const stepRef = findTemplateRefForItem(step, allRefs, 'steps');

  if (stepRef) {
    return (
      <TreeNode
        key={nodeId}
        nodeId={nodeId}
        label={stepRef.rawPath}
        type="step"
        templateRef={stepRef}
      />
    );
  }

  const label = step.displayName
    || step.task
    || (step.script ? 'script' : '')
    || (step.bash ? 'bash' : '')
    || (step.powershell ? 'powershell' : '')
    || (step.pwsh ? 'pwsh' : '')
    || (step.checkout ? `checkout: ${step.checkout}` : '')
    || `Step ${index}`;

  return (
    <TreeNode
      key={nodeId}
      nodeId={nodeId}
      label={label}
      type="step"
      yamlContent={step.rawYaml}
    />
  );
}

function renderVariableTemplates(
  variables: Pipeline['variables'],
  allRefs: TemplateReference[],
) {
  if (!variables) return null;
  const varRefs = allRefs.filter((r) => r.location === 'variables');
  if (varRefs.length === 0) return null;

  return varRefs.map((ref, i) => (
    <TreeNode
      key={`var-template-${i}`}
      nodeId={`var-template-${i}`}
      label={ref.rawPath}
      type="variables"
      templateRef={ref}
    />
  ));
}

function findTemplateRefForItem(
  _item: Stage | Job | Step,
  _allRefs: TemplateReference[],
  _location: string,
): TemplateReference | undefined {
  // For template-only items (where the item IS a template ref, not an inline definition)
  const item = _item as Record<string, unknown>;
  if ('templateRef' in item && item.templateRef) {
    return item.templateRef as TemplateReference;
  }
  return undefined;
}
