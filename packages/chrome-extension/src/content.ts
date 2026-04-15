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
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-1h4v1H5V2zm6 0h3v1h-3V2zM2 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-1h4v1H5V7zm6 0h3v1h-3V7zM2 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-1h4v1H5v-1zm6 0h3v1h-3v-1zM4 2.5h1v5H4v-5zm7 0h1v5h-1v-5zm-7 5h1v5H4v-5z"/></svg>`;
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
