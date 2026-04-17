import { buildTriggerChain } from './ado-api.js';
import type { BuildInfo } from './build-types.js';
import { getRelatedProjects, loadRelatedProjectGroups } from './config.js';
import { renderDeps } from './tree-renderer.js';

const MARKER = 'data-apv-injected';

/** Per-buildId cache: avoids re-fetching when ADO rerenders sidebar rows. */
const cache = new Map<
  number,
  { builds: BuildInfo[]; expanded: boolean; abort?: AbortController }
>();

/** Extract org and project from the current ADO URL. */
function parseAdoContext(): { org: string; project: string } | null {
  const m =
    window.location.href.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)/) ??
    window.location.href.match(/https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)/);
  return m ? { org: m[1], project: m[2] } : null;
}

function extractBuildId(href: string): number | null {
  const m = href.match(/buildId=(\d+)/);
  return m ? Number(m[1]) : null;
}

// ── Expand / collapse triggered pipelines inside a sidebar row ──────

async function toggleExpand(
  buildId: number,
  rootBuild: BuildInfo,
  container: HTMLElement,
  org: string,
  projects: string[],
): Promise<void> {
  let entry = cache.get(buildId);

  // Collapse
  if (entry?.expanded) {
    entry.expanded = false;
    entry.abort?.abort();
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  // Expand
  if (!entry) {
    entry = { builds: [], expanded: true };
    cache.set(buildId, entry);
  }
  entry.expanded = true;
  container.style.display = '';

  // Already cached?
  if (entry.builds.length > 0) {
    renderDeps(container, entry.builds, buildId, projects[0]);
    return;
  }

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'apv-deps-loading';
  loading.textContent = 'Loading triggered pipelines\u2026';
  container.appendChild(loading);

  const abort = new AbortController();
  entry.abort = abort;

  try {
    await buildTriggerChain(
      org,
      projects,
      rootBuild,
      (batch) => {
        for (const b of batch) {
          const idx = entry!.builds.findIndex((x) => x.id === b.id);
          if (idx >= 0) entry!.builds[idx] = b;
          else entry!.builds.push(b);
        }
        if (entry!.expanded) {
          renderDeps(container, entry!.builds, buildId, projects[0]);
        }
      },
      abort.signal,
    );
  } catch (err) {
    if (abort.signal.aborted) return;
    container.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className = 'apv-deps-error';
    errEl.textContent = err instanceof Error ? err.message : 'Failed to load';
    container.appendChild(errEl);
  }
}

// ── Inject into the Pipelines sidebar ───────────────────────────────

async function injectIntoSidebar(dialog: Element): Promise<void> {
  const ctx = parseAdoContext();
  if (!ctx) return;

  const groups = await loadRelatedProjectGroups();
  const related = getRelatedProjects(ctx.project, groups);
  const projects = [ctx.project, ...related];

  const rows = dialog.querySelectorAll('.repos-pipeline-status-item');

  for (const row of rows) {
    if (row.hasAttribute(MARKER)) continue;
    row.setAttribute(MARKER, 'true');

    const link = row.querySelector<HTMLAnchorElement>(
      'a[href*="_build/results"]',
    );
    if (!link) continue;

    const buildId = extractBuildId(link.href);
    if (!buildId) continue;

    // Find the flex-column container that holds the link + secondary text
    const col =
      row.querySelector<HTMLElement>('.flex-column') ?? link.parentElement;
    if (!col) continue;

    // "Show dependencies" toggle link — looks like secondary text
    const toggle = document.createElement('button');
    toggle.className = 'apv-deps-toggle';
    toggle.textContent = 'Show triggered pipelines';

    // Container for the dependency tree (hidden initially)
    const depsContainer = document.createElement('div');
    depsContainer.className = 'apv-deps-container';
    depsContainer.style.display = 'none';

    toggle.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const entry = cache.get(buildId);
      const isExpanded = entry?.expanded ?? false;
      toggle.textContent = isExpanded
        ? 'Show triggered pipelines'
        : 'Hide triggered pipelines';

      // We need the root build info — fetch it
      const { fetchBuild } = await import('./ado-api.js');
      const rootBuild = await fetchBuild(ctx.org, ctx.project, buildId);
      await toggleExpand(buildId, rootBuild, depsContainer, ctx.org, projects);

      // Update toggle text based on final state
      const finalEntry = cache.get(buildId);
      toggle.textContent = finalEntry?.expanded
        ? 'Hide triggered pipelines'
        : 'Show triggered pipelines';
    });

    col.appendChild(toggle);
    col.appendChild(depsContainer);
  }
}

// ── Observer ────────────────────────────────────────────────────────

function startObserver(): void {
  // Scan for any already-open sidebar
  const existing = document.querySelector('[role="dialog"]');
  if (existing) injectIntoSidebar(existing);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if ((mutation.target as Element).closest?.('.apv-deps-container'))
        continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        // Sidebar dialog appeared or content was added to it
        const dialog = node.matches?.('[role="dialog"]')
          ? node
          : node.querySelector?.('[role="dialog"]');
        if (dialog) {
          injectIntoSidebar(dialog);
          continue;
        }
        // Content added inside an existing dialog (ADO lazy-loads rows)
        const parentDialog = node.closest?.('[role="dialog"]');
        if (
          parentDialog &&
          node.querySelector?.('.repos-pipeline-status-item')
        ) {
          injectIntoSidebar(parentDialog);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
