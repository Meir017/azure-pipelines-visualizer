import { buildTriggerChain, fetchBuild } from './ado-api.js';
import type { BuildInfo } from './build-types.js';
import { renderTree } from './tree-renderer.js';

let activePanel: HTMLElement | null = null;

export function closeModal(): void {
  if (activePanel) {
    activePanel.classList.add('apv-panel--closing');
    setTimeout(() => {
      activePanel?.remove();
      activePanel = null;
    }, 200);
  }
}

const TREE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 1H2v3h1.5v2H2v3h1.5v2H2v3h4v-3H4.5v-2H6V7H4.5V5H6V1zm4 0h4v3h-4V1zm0 5h4v3h-4V6zm0 5h4v3h-4v-3zM7 2.5h2v1H7v-1zm0 5h2v1H7v-1zm0 5h2v1H7v-1z"/></svg>`;

export async function showDependencyModal(
  org: string,
  project: string,
  buildId: number,
): Promise<void> {
  closeModal();
  // Wait for any closing animation
  await new Promise((r) => setTimeout(r, 50));

  const panel = document.createElement('div');
  panel.className = 'apv-panel';
  activePanel = panel;

  // Header — ADO panel style with icon, title, close button
  const header = document.createElement('div');
  header.className = 'apv-panel__header';
  header.innerHTML = `
    <div class="apv-panel__header-left">
      <span class="apv-panel__icon">${TREE_ICON}</span>
      <h2 class="apv-panel__title">Pipeline Dependencies</h2>
    </div>
    <button class="apv-panel__close" title="Close" aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M8.06 7l4.72-4.72a.75.75 0 0 0-1.06-1.06L7 5.94 2.28 1.22a.75.75 0 0 0-1.06 1.06L5.94 7l-4.72 4.72a.75.75 0 1 0 1.06 1.06L7 8.06l4.72 4.72a.75.75 0 0 0 1.06-1.06L8.06 7z"/>
      </svg>
    </button>
  `;
  panel.appendChild(header);

  // Body with loading state
  const body = document.createElement('div');
  body.className = 'apv-panel__body';
  body.innerHTML = `
    <div class="apv-panel__loading">
      <div class="apv-spinner"></div>
      <span>Loading pipeline dependencies…</span>
    </div>
  `;
  panel.appendChild(body);

  document.body.appendChild(panel);

  // Trigger slide-in animation
  requestAnimationFrame(() => panel.classList.add('apv-panel--open'));

  // Close handlers
  header
    .querySelector('.apv-panel__close')!
    .addEventListener('click', closeModal);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  // Fetch and render
  try {
    const rootBuild = await fetchBuild(org, project, buildId);

    // Update title with pipeline name
    const title = header.querySelector('.apv-panel__title')!;
    title.textContent = rootBuild.definition.name;

    const allBuilds: BuildInfo[] = [];
    const treeContainer = document.createElement('div');
    treeContainer.className = 'apv-panel__tree';

    // Progressive rendering — status bar
    body.innerHTML = '';
    const statusBar = document.createElement('div');
    statusBar.className = 'apv-panel__status-bar';
    statusBar.innerHTML = `
      <div class="apv-spinner apv-spinner--small"></div>
      <span>Discovering triggered pipelines…</span>
    `;
    body.appendChild(statusBar);
    body.appendChild(treeContainer);

    await buildTriggerChain(org, project, rootBuild, (batch) => {
      allBuilds.push(...batch);
      renderTree(treeContainer, allBuilds);
      const count = allBuilds.length;
      statusBar.querySelector('span')!.textContent =
        `${count} pipeline${count !== 1 ? 's' : ''} found…`;
    });

    // Done — replace spinner with summary pill
    const count = allBuilds.length;
    statusBar.className = 'apv-panel__status-bar apv-panel__status-bar--done';
    statusBar.innerHTML = `
      <span class="apv-badge apv-badge--info">${count} pipeline${count !== 1 ? 's' : ''}</span>
      <span>in dependency chain</span>
    `;
  } catch (err) {
    body.innerHTML = `
      <div class="apv-panel__error">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="#a4262c">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-.75 4.5h1.5v5h-1.5v-5zm.75 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
        </svg>
        <div>
          <div class="apv-panel__error-title">Failed to load dependencies</div>
          <div class="apv-panel__error-detail">${err instanceof Error ? err.message : String(err)}</div>
        </div>
      </div>
    `;
  }
}
