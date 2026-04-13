import {
  extractTaskReferences,
  parseYaml,
  resolveTaskDocUrl,
  type TaskReference,
} from '@apv/core';
import Editor from '@monaco-editor/react';
import { useMemo } from 'react';
import type { TaskSchemaEntry } from '../services/api-client.js';
import { usePipelineStore } from '../store/pipeline-store.js';

export default function DetailPanel() {
  const {
    selectedNodeDetail,
    customTaskDocs,
    taskSchema,
    setSelectedNodeDetail,
  } = usePipelineStore();

  const taskRefs = useMemo(() => {
    if (!selectedNodeDetail?.yaml) return [];
    try {
      const raw = parseYaml(selectedNodeDetail.yaml) as Record<string, unknown>;
      return extractTaskReferences(raw ?? {});
    } catch {
      return [];
    }
  }, [selectedNodeDetail?.yaml]);

  if (!selectedNodeDetail) {
    return (
      <div className="detail-panel detail-panel--empty">
        <p>Click a node to view its contents</p>
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <div className="detail-panel__header">
        <div className="detail-panel__header-row">
          <h3 className="detail-panel__title">{selectedNodeDetail.label}</h3>
          <button
            className="detail-panel__close"
            onClick={() => setSelectedNodeDetail(null)}
            aria-label="Close detail panel"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="detail-panel__path">
          {selectedNodeDetail.filePath}
          {selectedNodeDetail.repoAlias && (
            <span className="detail-panel__repo">
              {' '}
              @{selectedNodeDetail.repoAlias}
            </span>
          )}
        </div>
      </div>

      {taskRefs.length > 0 && (
        <div className="detail-panel__tasks">
          <h4 className="detail-panel__section-title">
            Tasks ({taskRefs.length})
          </h4>
          <ul className="task-list">
            {taskRefs.map((ref) => (
              <TaskItem
                key={ref.raw}
                ref_={ref}
                customDocs={customTaskDocs}
                schemaEntry={
                  taskSchema.get(ref.raw) ??
                  taskSchema.get(`${ref.name}@${ref.version}`)
                }
              />
            ))}
          </ul>
        </div>
      )}

      <div className="detail-panel__editor">
        <Editor
          height="100%"
          language="yaml"
          value={selectedNodeDetail.yaml}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            renderLineHighlight: 'none',
            wordWrap: 'on',
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}

function TaskItem({
  ref_,
  customDocs,
  schemaEntry,
}: {
  ref_: TaskReference;
  customDocs: Record<string, string>;
  schemaEntry?: TaskSchemaEntry;
}) {
  const url = resolveTaskDocUrl(ref_, customDocs);

  return (
    <li className="task-item">
      <span className="task-item__icon">⚙️</span>
      <div className="task-item__content">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="task-item__link"
            title={schemaEntry?.description || `Open docs for ${ref_.name}`}
          >
            {ref_.name}
            <span className="task-item__version">@{ref_.version}</span>
            <span className="task-item__external">↗</span>
          </a>
        ) : (
          <span className="task-item__name">
            {ref_.name}
            <span className="task-item__version">@{ref_.version}</span>
          </span>
        )}
        {schemaEntry?.description && (
          <div className="task-item__description">
            {schemaEntry.description}
          </div>
        )}
      </div>
    </li>
  );
}
