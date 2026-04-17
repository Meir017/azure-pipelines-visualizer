import { useCallback, useEffect, useRef, useState } from 'react';
import ArtifactLineagePage from './components/artifact-lineage/ArtifactLineagePage.js';
import CommitFlowPage from './components/commit-flow/CommitFlowPage.js';
import DetailPanel from './components/DetailPanel.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import PipelineDiagram from './components/PipelineDiagram.js';
import PipelineSelector, {
  type PipelineSelectorProps,
} from './components/PipelineSelector.js';
import {
  fetchFileByRepoName,
  fetchTaskDocsConfig,
  fetchTaskSchema,
} from './services/api-client.js';
import { FileFetchProvider } from './services/file-fetch-context.js';
import { usePipelineStore } from './store/pipeline-store.js';
import './App.css';

export type AppProps = PipelineSelectorProps;

type AppView = 'pipeline' | 'commit-flow' | 'artifacts';

function useHashRoute(): [AppView, (view: AppView) => void] {
  const getView = (): AppView => {
    const hash = window.location.hash;
    if (hash.startsWith('#/commit-flow')) return 'commit-flow';
    if (hash.startsWith('#/artifacts')) return 'artifacts';
    return 'pipeline';
  };

  const [view, setViewState] = useState<AppView>(getView);

  useEffect(() => {
    const onHashChange = () => setViewState(getView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setView = (v: AppView) => {
    window.location.hash = v === 'pipeline' ? '#/' : `#/${v}`;
  };

  return [view, setView];
}

const DETAIL_MIN_WIDTH = 280;
const DETAIL_MAX_WIDTH = 900;
const DETAIL_DEFAULT_WIDTH = 420;

export default function App(props: AppProps) {
  const { setCustomTaskDocs, setTaskSchema, selectedNodeDetail, org } =
    usePipelineStore();
  const [detailWidth, setDetailWidth] = useState(DETAIL_DEFAULT_WIDTH);
  const dragging = useRef(false);
  const [view, setView] = useHashRoute();

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
    <FileFetchProvider value={fetchFileByRepoName}>
      <div className="app">
        <header className="app__header">
          <h1>🔧 Azure Pipelines Visualizer</h1>
          <nav className="app__nav">
            <button
              className={`app__nav-btn ${view === 'pipeline' ? 'app__nav-btn--active' : ''}`}
              onClick={() => setView('pipeline')}
              type="button"
            >
              Pipeline Templates
            </button>
            <button
              className={`app__nav-btn ${view === 'commit-flow' ? 'app__nav-btn--active' : ''}`}
              onClick={() => setView('commit-flow')}
              type="button"
            >
              Commit Flow
            </button>
            <button
              className={`app__nav-btn ${view === 'artifacts' ? 'app__nav-btn--active' : ''}`}
              onClick={() => setView('artifacts')}
              type="button"
            >
              Artifacts
            </button>
          </nav>
          {view === 'pipeline' && (
            <ErrorBoundary>
              <PipelineSelector {...props} />
            </ErrorBoundary>
          )}
        </header>
        <main className="app__main">
          {view === 'pipeline' && (
            <>
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
            </>
          )}
          {view === 'commit-flow' && (
            <section className="app__content">
              <ErrorBoundary>
                <CommitFlowPage />
              </ErrorBoundary>
            </section>
          )}
          {view === 'artifacts' && (
            <section className="app__content">
              <ErrorBoundary>
                <ArtifactLineagePage />
              </ErrorBoundary>
            </section>
          )}
        </main>
      </div>
    </FileFetchProvider>
  );
}
