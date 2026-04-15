import type { BuildInfo } from './build-types.js';

/** Small status icon — exact ADO bolt-status SVG paths. */
function statusIndicator(status: string, result: string | null): string {
  const cls = statusClass(status, result);
  // Running: blue circle + spinning 3-segment arc (ADO bolt-status.active.animate)
  if (status === 'inProgress')
    return `<span class="apv-row__status apv-row__status--running"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="M4.75 8a3.25 3.25 0 0 1 1.917-2.965c.33-.148.583-.453.583-.814 0-.479-.432-.848-.881-.683A4.752 4.752 0 0 0 3.29 8.62c.064.49.616.697 1.043.45.303-.175.443-.528.423-.877A3.304 3.304 0 0 1 4.75 8zm6.5 0c0 .065-.002.13-.006.194-.02.349.12.702.422.877.428.247.98.04 1.044-.45a4.752 4.752 0 0 0-3.078-5.084c-.45-.164-.882.205-.882.684 0 .36.253.666.583.814A3.25 3.25 0 0 1 11.25 8zM8 11.25c.758 0 1.455-.26 2.008-.694.293-.23.696-.31 1.019-.123.402.233.51.77.167 1.083A4.733 4.733 0 0 1 8 12.75c-1.23 0-2.35-.467-3.194-1.234-.344-.312-.235-.85.168-1.083.322-.186.725-.108 1.018.123.553.435 1.25.694 2.008.694z" fill="#fff"/></svg></span>`;
  // Queued: hollow gray circle
  if (status === 'notStarted')
    return `<span class="apv-row__status apv-row__status--queued"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>`;
  // Succeeded: green circle + white checkmark (exact ADO bolt-status.success path)
  if (result === 'succeeded')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="M6.062 11.144l-.003-.002-1.784-1.785A.937.937 0 1 1 5.6 8.031l1.125 1.124 3.88-3.88A.937.937 0 1 1 11.931 6.6l-4.54 4.54-.004.004a.938.938 0 0 1-1.325 0z" fill="#fff"/></svg></span>`;
  // Partially succeeded: warning color circle + exclamation
  if (result === 'partiallySucceeded')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="M7.25 4.5h1.5v4.5h-1.5zm0 6h1.5V12h-1.5z" fill="#fff"/></svg></span>`;
  // Failed: red circle + white X (exact ADO bolt-status.failed path)
  if (result === 'failed')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="M10.984 5.004a.9.9 0 0 1 0 1.272L9.27 7.99l1.74 1.741a.9.9 0 1 1-1.272 1.273l-1.74-1.741-1.742 1.74a.9.9 0 1 1-1.272-1.272l1.74-1.74-1.713-1.714a.9.9 0 0 1 1.273-1.273l1.713 1.713 1.714-1.713a.9.9 0 0 1 1.273 0z" fill="#fff"/></svg></span>`;
  // Canceled: gray circle + dash
  if (result === 'canceled')
    return `<span class="apv-row__status ${cls}"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><rect x="4.5" y="6.75" width="7" height="2.5" rx="1" fill="#fff"/></svg></span>`;
  return `<span class="apv-row__status apv-row__status--unknown"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>`;
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
