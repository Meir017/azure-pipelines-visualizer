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

function createRow(build: BuildInfo, depth: number): HTMLElement {
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
    container.appendChild(createRow(build, depth));
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
