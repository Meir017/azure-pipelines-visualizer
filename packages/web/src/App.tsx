import { useCallback, useEffect, useRef, useState } from 'react';
import DetailPanel from './components/DetailPanel.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import PipelineDiagram from './components/PipelineDiagram.js';
import PipelineSelector from './components/PipelineSelector.js';
import { fetchTaskDocsConfig, fetchTaskSchema } from './services/api-client.js';
import { usePipelineStore } from './store/pipeline-store.js';
import './App.css';

const DETAIL_MIN_WIDTH = 280;
const DETAIL_MAX_WIDTH = 900;
const DETAIL_DEFAULT_WIDTH = 420;

export default function App() {
  const { setCustomTaskDocs, setTaskSchema, selectedNodeDetail, org } =
    usePipelineStore();
  const [detailWidth, setDetailWidth] = useState(DETAIL_DEFAULT_WIDTH);
  const dragging = useRef(false);

  // Load custom task docs config on mount
  useEffect(() => {
    fetchTaskDocsConfig()
      .then((cfg) => setCustomTaskDocs(cfg.customTaskDocs))
      .catch(() => {});
  }, [setCustomTaskDocs]);

  // Fetch task schema when org becomes available
  useEffect(() => {
    if (!org) return;
    fetchTaskSchema(org)
      .then((resp) => setTaskSchema(resp.tasks))
      .catch(() => {});
  }, [org, setTaskSchema]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = detailWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX; // dragging left = wider
        const next = Math.min(
          DETAIL_MAX_WIDTH,
          Math.max(DETAIL_MIN_WIDTH, startWidth + delta),
        );
        setDetailWidth(next);
      };
      const onUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [detailWidth],
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1>🔧 Azure Pipelines Visualizer</h1>
      </header>
      <main className="app__main">
        <aside className="app__sidebar">
          <ErrorBoundary>
            <PipelineSelector />
          </ErrorBoundary>
        </aside>
        <section className="app__content">
          <ErrorBoundary>
            <PipelineDiagram />
          </ErrorBoundary>
        </section>
        {selectedNodeDetail && (
          <>
            <div
              className="app__detail-resize-handle"
              onMouseDown={onResizeStart}
              title="Drag to resize"
            />
            <aside className="app__detail" style={{ width: detailWidth }}>
              <ErrorBoundary>
                <DetailPanel />
              </ErrorBoundary>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
