import { useState } from 'react';
import EnvironmentMap from './EnvironmentMap.js';

export default function EnvironmentMapPage() {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [activeParams, setActiveParams] = useState<{
    org: string;
    project: string;
  } | null>(null);

  const handleSubmit = () => {
    const o = org.trim();
    const p = project.trim();
    if (!o || !p) return;
    setActiveParams({ org: o, project: p });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="env-page">
      <div className="env-page__selector">
        <input
          type="text"
          placeholder="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={handleKeyDown}
          className="env-page__input"
        />
        <input
          type="text"
          placeholder="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={handleKeyDown}
          className="env-page__input"
        />
        <button
          className="env-page__btn"
          onClick={handleSubmit}
          disabled={!org.trim() || !project.trim()}
          type="button"
        >
          Load Environments
        </button>
      </div>

      {activeParams && (
        <EnvironmentMap org={activeParams.org} project={activeParams.project} />
      )}
    </div>
  );
}
