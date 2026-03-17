import PipelineSelector from './components/PipelineSelector.js';
import PipelineTree from './components/PipelineTree.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import './App.css';

export default function App() {
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
            <PipelineTree />
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
}
