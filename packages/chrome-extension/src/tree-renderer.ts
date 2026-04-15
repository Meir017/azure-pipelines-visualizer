import type { BuildInfo } from './build-types.js';

/** ADO-style status indicator: colored circle with optional icon */
function statusIndicator(status: string, result: string | null): string {
  if (status === 'inProgress')
    return '<span class="apv-status apv-status--running" title="In progress"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="11 33" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite"/></svg></span>';
  if (status === 'notStarted')
    return '<span class="apv-status apv-status--queued" title="Queued"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>';
  if (result === 'succeeded')
    return '<span class="apv-status apv-status--succeeded" title="Succeeded"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M6.5 10.5L4.5 8.5l-.7.7 2.7 2.7 5-5-.7-.7z" fill="#fff"/></svg></span>';
  if (result === 'partiallySucceeded')
    return '<span class="apv-status apv-status--partial" title="Partially succeeded"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M7.25 4.5h1.5v4h-1.5zm0 5.5h1.5v1.5h-1.5z" fill="#fff"/></svg></span>';
  if (result === 'failed')
    return '<span class="apv-status apv-status--failed" title="Failed"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.17 5.17l5.66 5.66m0-5.66L5.17 10.83" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg></span>';
  if (result === 'canceled')
    return '<span class="apv-status apv-status--canceled" title="Canceled"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><rect x="5" y="6.5" width="6" height="3" rx="0.5" fill="#fff"/></svg></span>';
  return '<span class="apv-status apv-status--unknown" title="Unknown"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>';
}

function resultClass(status: string, result: string | null): string {
  if (status === 'inProgress') return 'apv-node--running';
  if (result === 'succeeded') return 'apv-node--succeeded';
  if (result === 'partiallySucceeded') return 'apv-node--partial';
  if (result === 'failed') return 'apv-node--failed';
  if (result === 'canceled') return 'apv-node--canceled';
  return '';
}

function formatTime(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function createBuildCard(build: BuildInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = `apv-node ${resultClass(build.status, build.result)}`;

  const link = build._links?.web?.href ?? '#';
  const duration = formatDuration(build.startTime, build.finishTime);
  const branch = build.sourceBranch.replace('refs/heads/', '');

  card.innerHTML = `
    <div class="apv-node__header">
      ${statusIndicator(build.status, build.result)}
      <a class="apv-node__name" href="${link}" target="_blank" title="${build.definition.name}">${build.definition.name}</a>
    </div>
    <div class="apv-node__meta">
      <span class="apv-node__number">${build.buildNumber}</span>
      ${duration ? `<span class="apv-node__duration">${duration}</span>` : ''}
    </div>
    <div class="apv-node__details">
      <span class="apv-node__time">${formatTime(build.startTime)}</span>
      <span class="apv-node__branch" title="${build.sourceBranch}">${branch}</span>
    </div>
  `;

  return card;
}

/** Render the trigger chain as a left-to-right tree. */
export function renderTree(container: HTMLElement, builds: BuildInfo[]): void {
  container.innerHTML = '';

  if (builds.length === 0) {
    container.innerHTML =
      '<div class="apv-tree__empty">No triggered pipelines found.</div>';
    return;
  }

  // Build adjacency: parent -> children
  const buildMap = new Map<number, BuildInfo>();
  for (const b of builds) buildMap.set(b.id, b);

  const children = new Map<number, BuildInfo[]>();
  const roots: BuildInfo[] = [];

  for (const b of builds) {
    if (b.upstreamBuildId && buildMap.has(b.upstreamBuildId)) {
      const list = children.get(b.upstreamBuildId) ?? [];
      list.push(b);
      children.set(b.upstreamBuildId, list);
    } else {
      roots.push(b);
    }
  }

  const byTime = (a: BuildInfo, b: BuildInfo) =>
    (a.startTime ?? '').localeCompare(b.startTime ?? '');
  roots.sort(byTime);

  const tree = document.createElement('div');
  tree.className = 'apv-tree';

  function buildSubtree(build: BuildInfo): HTMLElement {
    const row = document.createElement('div');
    row.className = 'apv-tree__row';

    const card = createBuildCard(build);
    row.appendChild(card);

    const kids = children.get(build.id);
    if (kids && kids.length > 0) {
      kids.sort(byTime);
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'apv-tree__children';
      for (const child of kids) {
        childrenContainer.appendChild(buildSubtree(child));
      }
      row.appendChild(childrenContainer);
    }

    return row;
  }

  for (const root of roots) {
    tree.appendChild(buildSubtree(root));
  }

  container.appendChild(tree);
}
