import type { BuildInfo } from './build-types.js';

function statusIcon(status: string, result: string | null): string {
  if (status === 'inProgress') return '⏳';
  if (status === 'notStarted') return '⏸️';
  if (result === 'succeeded') return '✅';
  if (result === 'partiallySucceeded') return '⚠️';
  if (result === 'failed') return '❌';
  if (result === 'canceled') return '🚫';
  return '❓';
}

function resultClass(status: string, result: string | null): string {
  if (status === 'inProgress') return 'apv-node--in-progress';
  if (result === 'succeeded') return 'apv-node--succeeded';
  if (result === 'partiallySucceeded') return 'apv-node--partial';
  if (result === 'failed') return 'apv-node--failed';
  if (result === 'canceled') return 'apv-node--canceled';
  return '';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
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
      <span class="apv-node__status">${statusIcon(build.status, build.result)}</span>
      <a class="apv-node__name" href="${link}" target="_blank" title="${build.definition.name}">${build.definition.name}</a>
    </div>
    <div class="apv-node__number">#${build.buildNumber}</div>
    <div class="apv-node__times">
      <span title="Start time">🕐 ${formatTime(build.startTime)}</span>
      ${duration ? `<span title="Duration">⏱️ ${duration}</span>` : ''}
    </div>
    <div class="apv-node__branch" title="${build.sourceBranch}">🌿 ${branch}</div>
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

  // Sort roots and children by start time
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
