import { useEffect } from 'react';
import PipelineSelector from './components/PipelineSelector.js';
import PipelineDiagram from './components/PipelineDiagram.js';
import DetailPanel from './components/DetailPanel.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { usePipelineStore } from './store/pipeline-store.js';
import { fetchTaskDocsConfig } from './services/api-client.js';
import './App.css';

export default function App() {
  const { setCustomTaskDocs, selectedNodeDetail } = usePipelineStore();

  // Load custom task docs config on mount
  useEffect(() => {
    fetchTaskDocsConfig()
      .then((cfg) => setCustomTaskDocs(cfg.customTaskDocs))
      .catch(() => {});
  }, [setCustomTaskDocs]);

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
          <aside className="app__detail">
            <ErrorBoundary>
              <DetailPanel />
            </ErrorBoundary>
          </aside>
        )}
      </main>
    </div>
  );
}
