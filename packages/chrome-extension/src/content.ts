import { showDependencyModal } from './modal.js';

const BUTTON_MARKER = 'data-apv-injected';

/** Extract org and project from the current ADO URL. */
function parseAdoContext(): { org: string; project: string } | null {
  const match = window.location.href.match(
    /https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)/,
  );
  if (match) return { org: match[1], project: match[2] };

  // visualstudio.com format: https://org.visualstudio.com/project/...
  const vsMatch = window.location.href.match(
    /https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)/,
  );
  if (vsMatch) return { org: vsMatch[1], project: vsMatch[2] };

  return null;
}

/** Extract build ID from an ADO build link href. */
function extractBuildId(href: string): number | null {
  // Pattern: _build/results?buildId=12345
  const match = href.match(/buildId=(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Find pipeline rows in the build status sidebar and inject dependency buttons.
 * ADO's sidebar uses different DOM structures; we look for build links.
 */
function injectButtons(container: Element): void {
  // Find all links to build results that we haven't already processed
  const buildLinks = container.querySelectorAll<HTMLAnchorElement>(
    'a[href*="_build/results"]',
  );

  for (const link of buildLinks) {
    // Find the row/container for this build link
    const row =
      link.closest('.ci-status-item') ??
      link.closest('.repos-ci-status-item') ??
      link.closest('[role="listitem"]') ??
      link.closest('[class*="status-item"]') ??
      link.parentElement;

    if (!row || row.hasAttribute(BUTTON_MARKER)) continue;
    row.setAttribute(BUTTON_MARKER, 'true');

    const buildId = extractBuildId(link.href);
    if (!buildId) continue;

    const ctx = parseAdoContext();
    if (!ctx) continue;

    const btn = document.createElement('button');
    btn.className = 'apv-deps-btn';
    btn.title = 'View pipeline dependencies';
    // Azure Pipelines rocket + dependency tree icon
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 5.5C1 3.5 2.5 2 4 2h1l.5 1H4c-1 0-2 .8-2 2.5S3 8 4 8h1.5l-.5 1H4C2.5 9 1 7.5 1 5.5z"/><rect x="5.5" y="4.5" width="2" height="2" rx=".4"/><path d="M7.5 5.5H9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M9.5 2.5V5.5V8.5V11.5" stroke="currentColor" stroke-width=".8"/><path d="M9.5 2.5H11M9.5 5.5H11M9.5 8.5H11M9.5 11.5H11" stroke="currentColor" stroke-width=".8"/><rect x="11" y="1.75" width="4" height="1.5" rx=".5"/><rect x="11" y="4.75" width="4" height="1.5" rx=".5"/><rect x="11" y="7.75" width="4" height="1.5" rx=".5"/><rect x="11" y="10.75" width="4" height="1.5" rx=".5"/></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showDependencyModal(ctx.org, ctx.project, buildId);
    });

    // Insert button after the link or at the end of the row
    const insertTarget = link.parentElement ?? row;
    insertTarget.appendChild(btn);
  }
}

/** Observe the DOM for build status sidebar appearing. */
function startObserver(): void {
  // Initial scan in case the sidebar is already open
  injectButtons(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // Check if this is or contains build links
          if (
            node.querySelector?.('a[href*="_build/results"]') ||
            (node instanceof HTMLAnchorElement &&
              node.href?.includes('_build/results'))
          ) {
            injectButtons(node.parentElement ?? node);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
