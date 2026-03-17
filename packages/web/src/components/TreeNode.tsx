import type { TemplateReference } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import TemplateExpander from './TemplateExpander.js';
import YamlBlock from './YamlBlock.js';

interface TreeNodeProps {
  nodeId: string;
  label: string;
  type: 'pipeline' | 'stage' | 'job' | 'step' | 'extends' | 'variables' | 'resources' | 'trigger';
  yamlContent?: string;
  templateRef?: TemplateReference;
  children?: React.ReactNode;
}

export default function TreeNode({
  nodeId,
  label,
  type,
  yamlContent,
  templateRef,
  children,
}: TreeNodeProps) {
  const { expandedNodes, toggleNode } = usePipelineStore();
  const isExpanded = expandedNodes.has(nodeId);
  const hasContent = !!yamlContent || !!children || !!templateRef;

  return (
    <div className={`tree-node tree-node--${type}`}>
      <div
        className="tree-node__header"
        onClick={() => hasContent && toggleNode(nodeId)}
      >
        <span className="tree-node__toggle">
          {hasContent ? (isExpanded ? '▼' : '▶') : '•'}
        </span>
        <span className={`tree-node__badge tree-node__badge--${type}`}>
          {type}
        </span>
        <span className="tree-node__label">{label}</span>
        {templateRef && (
          <span className="tree-node__template-indicator" title={templateRef.rawPath}>
            📄 {templateRef.repoAlias ? `@${templateRef.repoAlias}` : 'template'}
            {templateRef.conditional && ' (conditional)'}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="tree-node__body">
          {templateRef && (
            <TemplateExpander
              templateRef={templateRef}
              nodeId={nodeId}
            />
          )}
          {yamlContent && !templateRef && (
            <YamlBlock content={yamlContent} />
          )}
          {children && <div className="tree-node__children">{children}</div>}
        </div>
      )}
    </div>
  );
}
