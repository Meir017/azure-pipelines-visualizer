import type { BuildInfo } from './build-types.js';
import { statusSvg } from './status-icons.js';

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

function createRow(
  build: BuildInfo,
  depth: number,
  currentProject: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'apv-dep';
  if (depth > 0) row.style.paddingLeft = `${depth * 20}px`;

  // Status icon
  const icon = statusSvg(build.status, build.result);
  row.appendChild(icon);

  // Content
  const content = document.createElement('div');
  content.className = 'apv-dep__content';

  const link = document.createElement('a');
  link.className = 'apv-dep__name';
  link.href = build._links?.web?.href ?? '#';
  link.textContent = build.definition.name;
  link.title = build.definition.name;
  content.appendChild(link);

  // Show project badge for cross-project builds
  const buildProject = build.project.name;
  const decodedCurrent = decodeURIComponent(currentProject);
  if (
    buildProject &&
    buildProject !== decodedCurrent &&
    buildProject !== currentProject
  ) {
    const badge = document.createElement('span');
    badge.className = 'apv-dep__project';
    badge.textContent = buildProject;
    badge.title = `From project: ${buildProject}`;
    content.appendChild(badge);
  }

  const meta = document.createElement('span');
  meta.className = 'apv-dep__meta';
  const duration = formatDuration(build.startTime, build.finishTime);
  meta.textContent = [build.buildNumber, duration]
    .filter(Boolean)
    .join(' \u00b7 ');
  content.appendChild(meta);

  row.appendChild(content);
  return row;
}

/**
 * Render triggered pipelines into a container.
 * Excludes the root build (rootBuildId) since the sidebar already shows it.
 */
export function renderDeps(
  container: HTMLElement,
  builds: BuildInfo[],
  rootBuildId: number,
  currentProject?: string,
): void {
  container.innerHTML = '';

  const deps = builds.filter((b) => b.id !== rootBuildId);
  if (deps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'apv-deps-empty';
    empty.textContent = 'No triggered pipelines found.';
    container.appendChild(empty);
    return;
  }

  // Summary bar — uses inline SVGs with hardcoded colors (same as ADO)
  const summary = document.createElement('div');
  summary.className = 'apv-deps-summary';

  const counts: Record<string, number> = {};
  for (const b of deps) {
    const key = b.status === 'completed' ? (b.result ?? 'unknown') : b.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const totalSpan = document.createElement('span');
  totalSpan.className = 'apv-deps-summary__total';
  totalSpan.textContent = `${deps.length} pipeline${deps.length === 1 ? '' : 's'}`;
  summary.appendChild(totalSpan);

  // Inline SVG strings with baked-in colors (matches ADO's own status icons)
  const svgHead =
    '<svg viewBox="0 0 16 16" width="12" height="12" xmlns="http://www.w3.org/2000/svg">';
  const summaryIcons: [string, string][] = [
    [
      'succeeded',
      `${svgHead}<circle cx="8" cy="8" r="8" fill="#107c10"/><path d="M6.062 11.144l-.003-.002-1.784-1.785A.937.937 0 1 1 5.6 8.031l1.125 1.124 3.88-3.88A.937.937 0 1 1 11.931 6.6l-4.54 4.54-.004.004a.938.938 0 0 1-1.325 0z" fill="#fff"/></svg>`,
    ],
    [
      'failed',
      `${svgHead}<circle cx="8" cy="8" r="8" fill="#d32f2f"/><path d="M10.95 5.05a.7.7 0 0 0-.99 0L8 7.01 6.04 5.05a.7.7 0 1 0-.99.99L7.01 8l-1.96 1.96a.7.7 0 1 0 .99.99L8 8.99l1.96 1.96a.7.7 0 1 0 .99-.99L8.99 8l1.96-1.96a.7.7 0 0 0 0-.99z" fill="#fff"/></svg>`,
    ],
    [
      'inProgress',
      `${svgHead}<circle cx="8" cy="8" r="8" fill="#0078d4"/><polygon points="6,4 12,8 6,12" fill="#fff"/></svg>`,
    ],
    [
      'partiallySucceeded',
      `${svgHead}<circle cx="8" cy="8" r="8" fill="#ff8c00"/><path d="M6.062 11.144l-.003-.002-1.784-1.785A.937.937 0 1 1 5.6 8.031l1.125 1.124 3.88-3.88A.937.937 0 1 1 11.931 6.6l-4.54 4.54-.004.004a.938.938 0 0 1-1.325 0z" fill="#fff"/></svg>`,
    ],
    [
      'canceled',
      `${svgHead}<circle cx="8" cy="8" r="8" fill="#8a8a8a"/><rect x="4" y="6.75" width="8" height="2.5" rx="1" fill="#fff"/></svg>`,
    ],
    [
      'notStarted',
      `${svgHead}<circle cx="8" cy="8" r="7" fill="none" stroke="#8a8a8a" stroke-width="2"/></svg>`,
    ],
  ];

  for (const [key, svgStr] of summaryIcons) {
    const count = counts[key] ?? 0;
    if (!count) continue;

    const chip = document.createElement('span');
    chip.className = 'apv-deps-summary__chip';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'apv-deps-summary__icon';
    iconWrap.innerHTML = svgStr;
    chip.appendChild(iconWrap);

    const num = document.createElement('span');
    num.textContent = String(count);
    chip.appendChild(num);

    summary.appendChild(chip);
  }

  container.appendChild(summary);

  // Build adjacency map
  const buildMap = new Map<number, BuildInfo>();
  for (const b of builds) buildMap.set(b.id, b);

  const children = new Map<number, BuildInfo[]>();
  const roots: BuildInfo[] = [];

  for (const b of deps) {
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

  // Also include children of the root build
  const rootChildren = children.get(rootBuildId) ?? [];
  const allRoots = [...roots, ...rootChildren].sort(byTime);
  // Deduplicate
  const seen = new Set<number>();
  const uniqueRoots = allRoots.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  function appendSubtree(build: BuildInfo, depth: number): void {
    container.appendChild(createRow(build, depth, currentProject ?? ''));
    const kids = children.get(build.id);
    if (kids) {
      kids.sort(byTime);
      for (const child of kids) {
        appendSubtree(child, depth + 1);
      }
    }
  }

  for (const root of uniqueRoots) {
    appendSubtree(root, 0);
  }
}
