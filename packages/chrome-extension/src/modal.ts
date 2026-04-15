import { buildTriggerChain, fetchBuild } from './ado-api.js';
import type { BuildInfo } from './build-types.js';
import { renderTree } from './tree-renderer.js';

let activePanel: HTMLElement | null = null;
let activeAbort: AbortController | null = null;

export function closeModal(): void {
  activeAbort?.abort();
  activeAbort = null;
  if (activePanel) {
    activePanel.classList.add('apv-panel--closing');
    setTimeout(() => {
      activePanel?.remove();
      activePanel = null;
    }, 200);
  }
}

export async function showDependencyModal(
  org: string,
  project: string,
  buildId: number,
): Promise<void> {
  closeModal();
  await new Promise((r) => setTimeout(r, 50));

  const panel = document.createElement('div');
  panel.className = 'apv-panel';
  activePanel = panel;

  // Header — plain text title + close button (ADO panel pattern)
  const header = document.createElement('div');
  header.className = 'apv-panel__header';
  header.innerHTML = `
    <h2 class="apv-panel__title">Pipeline Dependencies</h2>
    <button class="apv-panel__close" title="Close" aria-label="Close">
      <svg viewBox="0 0 12 12" fill="currentColor">
        <path d="M6.85 6l4.08-4.08a.6.6 0 0 0-.85-.85L6 5.15 1.92 1.07a.6.6 0 0 0-.85.85L5.15 6l-4.08 4.08a.6.6 0 0 0 .85.85L6 6.85l4.08 4.08a.6.6 0 0 0 .85-.85L6.85 6z"/>
      </svg>
    </button>
  `;
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'apv-panel__body';
  body.innerHTML = `
    <div class="apv-panel__loading">
      <div class="apv-spinner"></div>
      <span>Loading…</span>
    </div>
  `;
  panel.appendChild(body);

  document.body.appendChild(panel);
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
  activeAbort = new AbortController();
  const { signal } = activeAbort;

  try {
    const rootBuild = await fetchBuild(org, project, buildId);

    // Update title with pipeline name
    const title = header.querySelector('.apv-panel__title')!;
    title.textContent = rootBuild.definition.name;

    const allBuilds: BuildInfo[] = [];
    const listContainer = document.createElement('div');

    // Summary line + list
    body.innerHTML = '';
    const summary = document.createElement('div');
    summary.className = 'apv-panel__summary';
    summary.textContent = 'Discovering triggered pipelines…';
    body.appendChild(summary);
    body.appendChild(listContainer);

    await buildTriggerChain(
      org,
      project,
      rootBuild,
      (batch) => {
        for (const b of batch) {
          const existing = allBuilds.findIndex((x) => x.id === b.id);
          if (existing >= 0) {
            allBuilds[existing] = b;
          } else {
            allBuilds.push(b);
          }
        }
        renderTree(listContainer, allBuilds);
        const count = allBuilds.length;
        const inProgressCount = allBuilds.filter(
          (b) => b.status !== 'completed',
        ).length;
        if (inProgressCount > 0) {
          summary.textContent = `${count} pipeline${count !== 1 ? 's' : ''} found, ${inProgressCount} still running…`;
        } else {
          summary.textContent = `${count} pipeline${count !== 1 ? 's' : ''} in dependency chain`;
        }
      },
      signal,
    );

    // Final summary
    const count = allBuilds.length;
    summary.textContent = `${count} pipeline${count !== 1 ? 's' : ''} in dependency chain`;
  } catch (err) {
    if (signal.aborted) return;
    body.innerHTML = `
      <div class="apv-panel__error">
        <div class="apv-panel__error-title">Failed to load dependencies</div>
        <div class="apv-panel__error-detail">${err instanceof Error ? err.message : String(err)}</div>
      </div>
    `;
  }
}
