import type { BuildInfo } from './build-types.js';

/** Small status icon matching ADO's build status circles. */
function statusIndicator(status: string, result: string | null): string {
  const cls = statusClass(status, result);
  // Running: solid blue filled circle (ADO pattern)
  if (status === 'inProgress')
    return `<span class="apv-row__status apv-row__status--running"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="currentColor"/></svg></span>`;
  // Queued: hollow gray circle
  if (status === 'notStarted')
    return `<span class="apv-row__status apv-row__status--queued"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>`;
  // Succeeded: green circle + white checkmark (ADO style — single clean stroke)
  if (result === 'succeeded')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><path d="M3.5 6.2l2 2 3-3.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  if (result === 'partiallySucceeded')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><path d="M5.4 3.5h1.2v3h-1.2zm0 4h1.2v1.2H5.4z" fill="#fff"/></svg></span>`;
  if (result === 'failed')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><path d="M4 4l4 4M8 4l-4 4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg></span>`;
  if (result === 'canceled')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><rect x="3.5" y="5" width="5" height="2" rx=".5" fill="#fff"/></svg></span>`;
  return `<span class="apv-row__status apv-row__status--unknown"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>`;
}

function statusClass(status: string, result: string | null): string {
  if (status === 'inProgress') return 'apv-row__status--running';
  if (result === 'succeeded') return 'apv-row__status--succeeded';
  if (result === 'partiallySucceeded') return 'apv-row__status--partial';
  if (result === 'failed') return 'apv-row__status--failed';
  if (result === 'canceled') return 'apv-row__status--canceled';
  return 'apv-row__status--unknown';
}

function formatTime(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function createRow(build: BuildInfo, depth: number): HTMLElement {
  const row = document.createElement('div');
  row.className = `apv-row${depth > 0 ? ` apv-row--depth-${Math.min(depth, 4)}` : ''}`;

  const link = build._links?.web?.href ?? '#';
  const duration = formatDuration(build.startTime, build.finishTime);

  let meta = `<span>${build.buildNumber}</span>`;
  if (build.startTime) {
    meta += `<span class="apv-row__meta-sep"></span><span>${formatTime(build.startTime)}</span>`;
  }
  if (duration) {
    meta += `<span class="apv-row__meta-sep"></span><span>${duration}</span>`;
  }

  row.innerHTML = `
    ${statusIndicator(build.status, build.result)}
    <div class="apv-row__content">
      <a class="apv-row__name" href="${link}" title="${build.definition.name}">${build.definition.name}</a>
      <div class="apv-row__meta">${meta}</div>
    </div>
  `;

  return row;
}

/** Render the trigger chain as a flat indented list. */
export function renderTree(container: HTMLElement, builds: BuildInfo[]): void {
  container.innerHTML = '';

  if (builds.length === 0) {
    container.innerHTML =
      '<div class="apv-list__empty">No triggered pipelines found.</div>';
    return;
  }

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

  const list = document.createElement('div');
  list.className = 'apv-list';

  function appendSubtree(build: BuildInfo, depth: number): void {
    list.appendChild(createRow(build, depth));

    const kids = children.get(build.id);
    if (kids && kids.length > 0) {
      kids.sort(byTime);
      for (const child of kids) {
        appendSubtree(child, depth + 1);
      }
    }
  }

  for (const root of roots) {
    appendSubtree(root, 0);
  }

  container.appendChild(list);
}
