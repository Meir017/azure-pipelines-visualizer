import { useState, useCallback } from 'react';
import type { TemplateReference } from '@apv/core';
import { parseYaml, detectTemplateReferences } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileContent } from '../services/api-client.js';
import TreeNode from './TreeNode.js';
import YamlBlock from './YamlBlock.js';

interface TemplateExpanderProps {
  templateRef: TemplateReference;
  nodeId: string;
}

interface ExpandedData {
  content: string;
  nestedRefs: TemplateReference[];
}

export default function TemplateExpander({ templateRef, nodeId }: TemplateExpanderProps) {
  const { org, project, expandedTemplates, setExpandedTemplate } = usePipelineStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedData | null>(null);

  const cacheKey = `${templateRef.repoAlias || ''}:${templateRef.normalizedPath}`;
  const cachedContent = expandedTemplates.get(cacheKey);

  const handleExpand = useCallback(async () => {
    if (expandedData || cachedContent) {
      if (cachedContent && !expandedData) {
        const parsed = (parseYaml(cachedContent) ?? {}) as Record<string, unknown>;
        const nestedRefs = detectTemplateReferences(parsed);
        setExpandedData({ content: cachedContent, nestedRefs });
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // TODO: resolve repoAlias to actual repoId via resources.repositories
      const repoId = templateRef.repoAlias || '';
      const resp = await fetchFileContent(
        org,
        project,
        repoId,
        templateRef.normalizedPath,
      );
      setExpandedTemplate(cacheKey, resp.content);

      const parsed = (parseYaml(resp.content) ?? {}) as Record<string, unknown>;
      const nestedRefs = detectTemplateReferences(parsed);
      setExpandedData({ content: resp.content, nestedRefs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [org, project, templateRef, cacheKey, expandedData, cachedContent, setExpandedTemplate]);

  if (!expandedData && !loading) {
    return (
      <div className="template-expander">
        <button className="template-expander__btn" onClick={handleExpand}>
          📂 Expand: {templateRef.rawPath}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  if (loading) {
    return <div className="template-expander__loading">⏳ Loading {templateRef.rawPath}...</div>;
  }

  if (!expandedData) return null;

  return (
    <div className="template-expander__content">
      <YamlBlock content={expandedData.content} />
      {expandedData.nestedRefs.length > 0 && (
        <div className="template-expander__nested">
          <div className="template-expander__nested-label">
            Nested templates ({expandedData.nestedRefs.length}):
          </div>
          {expandedData.nestedRefs.map((ref, idx) => (
            <TreeNode
              key={`${nodeId}-nested-${idx}`}
              nodeId={`${nodeId}-nested-${idx}`}
              label={ref.rawPath}
              type={ref.location === 'extends' ? 'extends' : 'step'}
              templateRef={ref}
            />
          ))}
        </div>
      )}
    </div>
  );
}
