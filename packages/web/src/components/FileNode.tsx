import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

/** Resolved repo info for tooltip display */
export interface RepoInfo {
  /** Alias used in the pipeline (e.g., "GovernedTemplates") */
  alias: string;
  /** Full repo name from resources (e.g., "OneBranch.Pipelines/GovernedTemplates") */
  fullName: string;
  /** Type: git, github, etc. */
  type: string;
  /** Git ref/branch */
  ref?: string;
  /** Resolved project (if cross-project) */
  project?: string;
}

export interface FileNodeData {
  label: string;
  filePath: string;
  repoAlias?: string;
  templateCount: number;
  status: 'root' | 'collapsed' | 'loading' | 'expanded' | 'error';
  errorMessage?: string;
  /** Whether this is the root pipeline node */
  isRoot?: boolean;
  /** Directory of the file this node represents (for resolving relative template paths) */
  baseDir?: string;
  /** Azure DevOps URL to open this file in the browser */
  adoUrl?: string;
  /** Resolved repo details for hover tooltip */
  repoInfo?: RepoInfo;
  /** Template location: extends, stages, jobs, steps */
  templateLocation?: string;
  /** Whether this template is inside a conditional block */
  conditional?: boolean;
  /** Names of parameters passed to this template */
  parameterNames?: string[];
  /** Whether this path originally contained `${{ }}` expressions */
  dynamicPath?: boolean;
  /** The original raw path before expression resolution */
  originalPath?: string;
  /** Whether the expression was fully resolved */
  expressionResolved?: boolean;
  /** Unresolved expression parameter names */
  unresolvedExpressions?: string[];
}

function FileNode({ data }: NodeProps) {
  const d = data as unknown as FileNodeData;
  const [showRepoTooltip, setShowRepoTooltip] = useState(false);

  const statusClass =
    d.status === 'root'
      ? 'file-node--root'
      : d.status === 'expanded'
        ? 'file-node--expanded'
        : d.status === 'loading'
          ? 'file-node--loading'
          : d.status === 'error'
            ? 'file-node--error'
            : 'file-node--collapsed';

  const crossRepoClass = d.repoAlias ? 'file-node--cross-repo' : '';
  const dynamicClass = d.dynamicPath && !d.expressionResolved ? 'file-node--dynamic' : '';

  return (
    <div className={`file-node ${statusClass} ${crossRepoClass} ${dynamicClass}`}>
      {!d.isRoot && <Handle type="target" position={Position.Top} />}

      <div className="file-node__header">
        <span className="file-node__icon">
          {d.isRoot
            ? '📄'
            : d.dynamicPath && !d.expressionResolved
              ? '⚠️'
              : d.dynamicPath && d.expressionResolved
                ? '🔮'
                : d.status === 'expanded'
                  ? '📋'
                  : d.repoAlias
                    ? '🔗'
                    : '📁'}
        </span>
        <span className="file-node__label" title={d.originalPath ?? d.filePath}>
          {d.label}
        </span>
        {/* Action buttons */}
        <span className="file-node__actions">
          {d.adoUrl && (
            <a
              href={d.adoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="file-node__action-btn"
              title="Open in Azure DevOps"
              onClick={(e) => e.stopPropagation()}
            >
              <AdoIcon />
            </a>
          )}
        </span>
      </div>

      {d.repoAlias && (
        <div
          className="file-node__repo-row"
          onMouseEnter={() => setShowRepoTooltip(true)}
          onMouseLeave={() => setShowRepoTooltip(false)}
        >
          <span className="file-node__repo">@{d.repoAlias}</span>
          {d.repoInfo && showRepoTooltip && (
            <div className="file-node__repo-tooltip">
              <div className="file-node__repo-tooltip-row">
                <span className="file-node__repo-tooltip-label">Repo</span>
                <span>{d.repoInfo.fullName}</span>
              </div>
              <div className="file-node__repo-tooltip-row">
                <span className="file-node__repo-tooltip-label">Type</span>
                <span>{d.repoInfo.type}</span>
              </div>
              {d.repoInfo.ref && (
                <div className="file-node__repo-tooltip-row">
                  <span className="file-node__repo-tooltip-label">Ref</span>
                  <span>{d.repoInfo.ref}</span>
                </div>
              )}
              {d.repoInfo.project && (
                <div className="file-node__repo-tooltip-row">
                  <span className="file-node__repo-tooltip-label">Project</span>
                  <span>{d.repoInfo.project}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="file-node__meta">
        {/* Badges row */}
        {(d.templateLocation || d.conditional || d.parameterNames?.length || d.dynamicPath) && (
          <div className="file-node__badges">
            {d.templateLocation && (
              <span className={`file-node__badge file-node__badge--${d.templateLocation}`}>
                {d.templateLocation}
              </span>
            )}
            {d.conditional && (
              <span className="file-node__badge file-node__badge--conditional" title="Inside conditional block">
                conditional
              </span>
            )}
            {d.dynamicPath && d.expressionResolved && (
              <span
                className="file-node__badge file-node__badge--resolved"
                title={`Resolved from: ${d.originalPath}`}
              >
                resolved
              </span>
            )}
            {d.dynamicPath && !d.expressionResolved && (
              <span
                className="file-node__badge file-node__badge--unresolved"
                title={`Unresolved expressions: ${d.unresolvedExpressions?.join(', ') ?? 'unknown'}\nOriginal path: ${d.originalPath}`}
              >
                dynamic
              </span>
            )}
            {d.parameterNames && d.parameterNames.length > 0 && (
              <span
                className="file-node__badge file-node__badge--params"
                title={`Parameters: ${d.parameterNames.join(', ')}`}
              >
                {d.parameterNames.length} param{d.parameterNames.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {d.status === 'loading' && <span className="file-node__spinner">⏳ Loading...</span>}
        {d.status === 'error' && (
          <span className="file-node__error" title={d.errorMessage}>
            ❌ {d.errorMessage?.slice(0, 80)}
          </span>
        )}
        {d.status === 'collapsed' && (
          <span className="file-node__hint">Click to expand</span>
        )}
        {d.status === 'expanded' && d.templateCount === 0 && !d.isRoot && (
          <span className="file-node__leaf">✓ no nested templates</span>
        )}
        {(d.status === 'root' || d.status === 'expanded') && d.templateCount > 0 && (
          <span className="file-node__count">{d.templateCount} template ref(s)</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** Azure DevOps logo as inline SVG (official icon path, 18×18 viewBox) */
function AdoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 18 18"
      className="file-node__ado-icon"
      aria-label="Azure DevOps"
    >
      <path
        d="M17 4v9.74l-4 3.28-6.2-2.26V17l-3.51-4.59 10.23.8V4.44zm-3.41.49L7.85 1v2.29L2.58 4.84 1 6.87v4.61l2.26 1V6.57z"
        fill="#3c91e5"
      />
    </svg>
  );
}

export default memo(FileNode);
