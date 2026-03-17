import { useCallback } from 'react';
import { parseYaml, detectTemplateReferences } from '@apv/core';
import type { TemplateReference } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileContent } from '../services/api-client.js';

export function useTemplateExpansion() {
  const { org, project, expandedTemplates, setExpandedTemplate } = usePipelineStore();

  const expandTemplate = useCallback(
    async (ref: TemplateReference) => {
      const cacheKey = `${ref.repoAlias || ''}:${ref.normalizedPath}`;
      const cached = expandedTemplates.get(cacheKey);
      if (cached) {
        const parsed = (parseYaml(cached) ?? {}) as Record<string, unknown>;
        return {
          content: cached,
          nestedRefs: detectTemplateReferences(parsed),
        };
      }

      const repoId = ref.repoAlias || '';
      const resp = await fetchFileContent(org, project, repoId, ref.normalizedPath);
      setExpandedTemplate(cacheKey, resp.content);

      const parsed = (parseYaml(resp.content) ?? {}) as Record<string, unknown>;
      return {
        content: resp.content,
        nestedRefs: detectTemplateReferences(parsed),
      };
    },
    [org, project, expandedTemplates, setExpandedTemplate],
  );

  return { expandTemplate };
}
