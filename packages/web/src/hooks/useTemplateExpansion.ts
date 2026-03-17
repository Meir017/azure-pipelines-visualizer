import { useCallback } from 'react';
import {
  parseYaml,
  detectTemplateReferences,
  resolveTemplateSource,
  getEffectiveRepoAlias,
  resolveTemplateRefPath,
} from '@apv/core';
import type { TemplateReference, ResourceRepository } from '@apv/core';
import { usePipelineStore } from '../store/pipeline-store.js';
import { fetchFileByRepoName } from '../services/api-client.js';

export function useTemplateExpansion() {
  const { org, project, expandedTemplates, setExpandedTemplate } = usePipelineStore();

  const expandTemplate = useCallback(
    async (ref: TemplateReference, repositories?: ResourceRepository[]) => {
      const effectiveRepoAlias = getEffectiveRepoAlias(ref);
      const resolvedPath = resolveTemplateRefPath(ref);
      const cacheKey = `${effectiveRepoAlias || ''}:${resolvedPath}`;
      const cached = expandedTemplates.get(cacheKey);
      if (cached) {
        const parsed = (parseYaml(cached) ?? {}) as Record<string, unknown>;
        return {
          content: cached,
          nestedRefs: detectTemplateReferences(parsed, {
            contextRepoAlias: effectiveRepoAlias,
            sourcePath: resolvedPath,
          }),
        };
      }

      // Resolve repo alias to actual project/repo using resources
      let targetProject = project;
      let targetRepo = '';
      let targetRef: string | undefined;

      if (effectiveRepoAlias && repositories?.length) {
        const source = resolveTemplateSource(effectiveRepoAlias, repositories);
        if (source) {
          targetProject = source.project || project;
          targetRepo = source.repoName;
          targetRef = source.ref;
        } else {
          // Fallback: use alias directly as repo name
          targetRepo = effectiveRepoAlias;
        }
      } else if (effectiveRepoAlias) {
        // No resources available, use alias as repo name
        targetRepo = effectiveRepoAlias;
      }

      const resp = await fetchFileByRepoName(
        org,
        targetProject,
        targetRepo || '',
        resolvedPath,
        targetRef,
      );
      setExpandedTemplate(cacheKey, resp.content);

      const parsed = (parseYaml(resp.content) ?? {}) as Record<string, unknown>;
      return {
        content: resp.content,
        nestedRefs: detectTemplateReferences(parsed, {
          contextRepoAlias: effectiveRepoAlias,
          sourcePath: resolvedPath,
        }),
      };
    },
    [org, project, expandedTemplates, setExpandedTemplate],
  );

  return { expandTemplate };
}
