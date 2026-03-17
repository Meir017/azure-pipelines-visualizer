import { useCallback } from 'react';
import { parseYaml, detectTemplateReferences, resolveTemplateSource } from '@apv/core';
import type { TemplateReference, ResourceRepository } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileByRepoName } from '../services/api-client.js';

export function useTemplateExpansion() {
  const { org, project, expandedTemplates, setExpandedTemplate } = usePipelineStore();

  const expandTemplate = useCallback(
    async (ref: TemplateReference, repositories?: ResourceRepository[]) => {
      const cacheKey = `${ref.repoAlias || ''}:${ref.normalizedPath}`;
      const cached = expandedTemplates.get(cacheKey);
      if (cached) {
        const parsed = (parseYaml(cached) ?? {}) as Record<string, unknown>;
        return {
          content: cached,
          nestedRefs: detectTemplateReferences(parsed),
        };
      }

      // Resolve repo alias to actual project/repo using resources
      let targetProject = project;
      let targetRepo = '';
      let targetRef: string | undefined;

      if (ref.repoAlias && repositories?.length) {
        const source = resolveTemplateSource(ref.repoAlias, repositories);
        if (source) {
          targetProject = source.project || project;
          targetRepo = source.repoName;
          targetRef = source.ref;
        } else {
          // Fallback: use alias directly as repo name
          targetRepo = ref.repoAlias;
        }
      } else if (ref.repoAlias) {
        // No resources available, use alias as repo name
        targetRepo = ref.repoAlias;
      }

      const resp = await fetchFileByRepoName(
        org,
        targetProject,
        targetRepo || '',
        ref.normalizedPath,
        targetRef,
      );
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
