import PipelineDiagram from '@apv/web/src/components/PipelineDiagram.js';
import type { FileByRepoNameResponse } from '@apv/web/src/services/api-client.js';
import { FileFetchProvider } from '@apv/web/src/services/file-fetch-context.js';
import { usePipelineStore } from '@apv/web/src/store/pipeline-store.js';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchFileContent,
  fetchPipelineDefinition,
  normalizeGitRef,
} from '../client/ado-client.js';
import { ensureRepoCached, getFileFromCache } from '../client/zip-cache.js';
import '@xyflow/react/dist/style.css';

export interface ApvEmbedProps {
  /** Azure DevOps organization name */
  org: string;
  /** Azure DevOps project name */
  project: string;
  /** Pipeline definition ID */
  pipelineId: number;
  /** Optional: CSS class name for the container */
  className?: string;
  /** Optional: inline styles for the container */
  style?: React.CSSProperties;
}

/**
 * Self-contained pipeline visualization component.
 * Fetches pipeline definition, downloads repo ZIP, and renders the template tree.
 */
export function ApvEmbed({
  org,
  project,
  pipelineId,
  className,
  style,
}: ApvEmbedProps) {
  const {
    setConnection,
    setSelectedPipeline,
    setSelectedPipelineLoading,
    setSelectedPipelineError,
  } = usePipelineStore();

  const [initialized, setInitialized] = useState(false);

  // Fetch file using the ZIP cache, with fallback to individual fetch
  const fetchFileByRepoName = useCallback(
    async (
      fetchOrg: string,
      fetchProject: string,
      repoName: string,
      path: string,
      branch?: string,
    ): Promise<FileByRepoNameResponse> => {
      // Try ZIP cache first
      if (branch) {
        try {
          const content = await getFileFromCache(
            fetchOrg,
            fetchProject,
            repoName,
            branch,
            path,
          );
          return { content, path, repoId: repoName, repoName, branch };
        } catch {
          // Fall through to individual fetch
        }
      }

      // Fallback: individual file fetch
      const content = await fetchFileContent(
        fetchOrg,
        fetchProject,
        repoName,
        path,
        branch,
      );
      return {
        content,
        path,
        repoId: repoName,
        repoName,
        branch: branch || '',
      };
    },
    [],
  );

  // Load pipeline on mount
  useEffect(() => {
    setConnection(org, project);

    let cancelled = false;
    (async () => {
      setSelectedPipelineLoading(true);
      setSelectedPipelineError(null);

      try {
        const definition = await fetchPipelineDefinition(
          org,
          project,
          pipelineId,
        );

        if (cancelled) return;

        const branch =
          definition.repository.defaultBranch || normalizeGitRef('main');

        // Pre-fetch the repo ZIP in background for faster template expansion
        ensureRepoCached(org, project, definition.repository.id, branch).catch(
          () => {
            // Non-fatal: individual fetches will work as fallback
          },
        );

        // Fetch the root YAML file
        const yaml = await fetchFileContent(
          org,
          project,
          definition.repository.id,
          definition.path,
          branch,
        );

        if (cancelled) return;

        setSelectedPipeline({ definition, yaml });
        setInitialized(true);
      } catch (err) {
        if (!cancelled) {
          setSelectedPipelineError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        if (!cancelled) {
          setSelectedPipelineLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    org,
    project,
    pipelineId,
    setConnection,
    setSelectedPipeline,
    setSelectedPipelineLoading,
    setSelectedPipelineError,
  ]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 400,
    ...style,
  };

  return (
    <FileFetchProvider value={fetchFileByRepoName}>
      <div className={className} style={containerStyle}>
        <PipelineDiagram />
      </div>
    </FileFetchProvider>
  );
}
