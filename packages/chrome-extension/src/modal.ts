import { buildTriggerChain, fetchBuild } from './ado-api.js';
import type { BuildInfo } from './build-types.js';
import { renderTree } from './tree-renderer.js';

let activeModal: HTMLElement | null = null;

export function closeModal(): void {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}

export async function showDependencyModal(
  org: string,
  project: string,
  buildId: number,
): Promise<void> {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'apv-overlay';
  activeModal = overlay;

  const modal = document.createElement('div');
  modal.className = 'apv-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'apv-modal__header';
  header.innerHTML = `
    <h2 class="apv-modal__title">Pipeline Dependencies</h2>
    <button class="apv-modal__close" title="Close">✕</button>
  `;
  modal.appendChild(header);

  // Body with loading state
  const body = document.createElement('div');
  body.className = 'apv-modal__body';
  body.innerHTML = `
    <div class="apv-modal__loading">
      <div class="apv-spinner"></div>
      <span>Loading pipeline dependencies…</span>
    </div>
  `;
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close handlers
  const closeBtn = header.querySelector('.apv-modal__close')!;
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
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
    const title = header.querySelector('.apv-modal__title')!;
    title.textContent = `Dependencies: ${rootBuild.definition.name}`;

    const allBuilds: BuildInfo[] = [];
    const treeContainer = document.createElement('div');
    treeContainer.className = 'apv-modal__tree';

    // Progressive rendering
    body.innerHTML = '';
    const status = document.createElement('div');
    status.className = 'apv-modal__status';
    status.innerHTML = `
      <div class="apv-spinner apv-spinner--small"></div>
      <span>Discovering triggered pipelines…</span>
    `;
    body.appendChild(status);
    body.appendChild(treeContainer);

    await buildTriggerChain(org, project, rootBuild, (batch) => {
      allBuilds.push(...batch);
      renderTree(treeContainer, allBuilds);
      status.querySelector('span')!.textContent =
        `${allBuilds.length} pipeline${allBuilds.length !== 1 ? 's' : ''} found (loading…)`;
    });

    // Done
    status.innerHTML = `<span>${allBuilds.length} pipeline${allBuilds.length !== 1 ? 's' : ''} in dependency chain</span>`;
  } catch (err) {
    body.innerHTML = `
      <div class="apv-modal__error">
        <span>❌ Failed to load dependencies</span>
        <p>${err instanceof Error ? err.message : String(err)}</p>
      </div>
    `;
  }
}
