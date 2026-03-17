import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

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
}

function FileNode({ data }: NodeProps) {
  const d = data as unknown as FileNodeData;

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

  return (
    <div className={`file-node ${statusClass} ${crossRepoClass}`}>
      {!d.isRoot && <Handle type="target" position={Position.Top} />}

      <div className="file-node__header">
        <span className="file-node__icon">
          {d.isRoot ? '📄' : d.status === 'expanded' ? '📋' : d.repoAlias ? '🔗' : '📁'}
        </span>
        <span className="file-node__label" title={d.filePath}>
          {d.label}
        </span>
      </div>

      {d.repoAlias && (
        <div className="file-node__repo">@{d.repoAlias}</div>
      )}

      <div className="file-node__meta">
        {d.status === 'loading' && <span className="file-node__spinner">⏳ Loading...</span>}
        {d.status === 'error' && (
          <span className="file-node__error" title={d.errorMessage}>
            ❌ {d.errorMessage?.slice(0, 80)}
          </span>
        )}
        {d.status === 'collapsed' && (
          <span className="file-node__hint">Click to expand</span>
        )}
        {(d.status === 'root' || d.status === 'expanded') && d.templateCount > 0 && (
          <span className="file-node__count">{d.templateCount} template ref(s)</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(FileNode);
