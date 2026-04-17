import {
  type ExpandedPipeline,
  type IFileProvider,
  expandPipeline,
  parseAdoUrl,
} from '@meirblachman/azure-pipelines-visualizer-core';
import { useCallback, useState } from 'react';
import { fetchFileByRepoName } from '../../services/api-client.js';
import FlattenerView, { type TemplateSource } from './FlattenerView.js';

function yamlStringify(obj: Record<string, unknown>, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}${key}:`);
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (item && typeof item === 'object') {
          const inner = yamlStringify(
            item as Record<string, unknown>,
            indent + 2,
          );
          const innerLines = inner.split('\n').filter(Boolean);
          if (innerLines.length > 0) {
            lines.push(`${pad}  - ${innerLines[0].trimStart()}`);
            for (let i = 1; i < innerLines.length; i++) {
              lines.push(`${pad}    ${innerLines[i].trimStart()}`);
            }
          }
        } else {
          lines.push(`${pad}  - ${String(item)}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${pad}${key}:`);
      lines.push(yamlStringify(value as Record<string, unknown>, indent + 1));
    } else {
      lines.push(`${pad}${key}: ${String(value)}`);
    }
  }

  return lines.join('\n');
}

export default function FlattenerPage() {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [originalYaml, setOriginalYaml] = useState<string | null>(null);
  const [flattenedYaml, setFlattenedYaml] = useState<string | null>(null);
  const [templateSources, setTemplateSources] = useState<TemplateSource[]>([]);
  const [filesLoaded, setFilesLoaded] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleLoad = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlError(null);
    setLoading(true);
    setFlattenedYaml(null);
    setTemplateSources([]);
    setFilesLoaded([]);
    setErrors([]);

    const parsed = parseAdoUrl(urlInput.trim());
    if (!parsed) {
      setUrlError('Invalid Azure DevOps URL');
      setLoading(false);
      return;
    }

    try {
      // Fetch root YAML
      const resp = await fetchFileByRepoName(
        parsed.org,
        parsed.project,
        parsed.repoName,
        parsed.filePath,
        parsed.branch,
      );
      setOriginalYaml(resp.content);

      // Create a file provider that uses the API
      const fileProvider: IFileProvider = {
        getFileContent: async (repo: string, path: string) => {
          const repoName = repo || parsed.repoName;
          const result = await fetchFileByRepoName(
            parsed.org,
            parsed.project,
            repoName,
            path,
            parsed.branch,
          );
          return result.content;
        },
      };

      // Expand the pipeline
      let expanded: ExpandedPipeline;
      try {
        expanded = await expandPipeline(
          fileProvider,
          parsed.repoName,
          parsed.filePath,
        );
      } catch (err) {
        setErrors([
          `Expansion failed: ${err instanceof Error ? err.message : String(err)}`,
        ]);
        setLoading(false);
        return;
      }

      setFlattenedYaml(yamlStringify(expanded.pipeline));
      setFilesLoaded(expanded.filesLoaded);
      setTemplateSources(
        expanded.expansions.map((e) => ({
          path: e.templatePath,
          depth: e.depth,
          location: e.location,
        })),
      );
      if (expanded.errors.length > 0) {
        setErrors(
          expanded.errors.map(
            (e) => `[${e.location}] ${e.templatePath}: ${e.message}`,
          ),
        );
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [urlInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoad();
    }
  };

  return (
    <div className="flattener-page">
      <div className="flattener-page__selector">
        <div className="pipeline-url-bar">
          <input
            type="text"
            className="pipeline-url-bar__input"
            placeholder="https://dev.azure.com/{org}/{project}/_git/{repo}?path=/{pipeline}.yml"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="pipeline-url-bar__btn"
            onClick={handleLoad}
            disabled={!urlInput.trim() || loading}
            type="button"
          >
            {loading ? '⏳ Expanding…' : 'Flatten'}
          </button>
        </div>
        {urlError && (
          <div className="flattener-page__error">{urlError}</div>
        )}
      </div>

      {originalYaml && (
        <FlattenerView
          originalYaml={originalYaml}
          flattenedYaml={flattenedYaml}
          templateSources={templateSources}
          filesLoaded={filesLoaded}
          errors={errors}
          loading={loading}
        />
      )}

      {!originalYaml && !loading && (
        <div className="flattener-page__placeholder">
          <p>
            Enter an Azure DevOps pipeline URL to flatten all template
            references into a single expanded YAML view.
          </p>
        </div>
      )}
    </div>
  );
}
