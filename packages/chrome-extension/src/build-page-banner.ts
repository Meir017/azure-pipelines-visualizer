import { buildTriggerChain, fetchBuild } from './ado-api.js';
import type { BuildInfo } from './build-types.js';
import { getRelatedProjects, loadRelatedProjectGroups } from './config.js';
import { statusSvg } from './status-icons.js';

const BANNER_MARKER = 'data-apv-build-banner';

/** Reason labels matching ADO terminology */
const REASON_LABELS: Record<string, { icon: string; label: string }> = {
  manual: { icon: '👤', label: 'Manually triggered' },
  individualCI: { icon: '🔄', label: 'Continuous integration' },
  batchedCI: { icon: '🔄', label: 'Batched CI' },
  schedule: { icon: '⏰', label: 'Scheduled' },
  pullRequest: { icon: '🔀', label: 'Pull request' },
  buildCompletion: { icon: '🔗', label: 'Triggered by pipeline' },
  resourceTrigger: { icon: '🔗', label: 'Triggered by resource' },
  validateShelveset: { icon: '📋', label: 'Validation build' },
  checkInShelveset: { icon: '📋', label: 'Gated check-in' },
};

function parseBuildPageContext(): {
  org: string;
  project: string;
  buildId: number;
} | null {
  const m =
    window.location.href.match(
      /https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_build\/results\?buildId=(\d+)/,
    ) ??
    window.location.href.match(
      /https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_build\/results\?buildId=(\d+)/,
    );
  return m ? { org: m[1], project: m[2], buildId: Number(m[3]) } : null;
}

function buildWebUrl(org: string, project: string, buildId: number): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_build/results?buildId=${buildId}`;
}

function createBuildNode(
  build: BuildInfo,
  isCurrent: boolean,
  org: string,
): HTMLElement {
  const node = document.createElement('a');
  node.className = `apv-chain-node${isCurrent ? ' apv-chain-node--current' : ''}`;
  node.href =
    build._links?.web?.href ?? buildWebUrl(org, build.project.name, build.id);
  node.title = `${build.definition.name} #${build.buildNumber}`;

  const icon = statusSvg(build.status, build.result);
  icon.setAttribute('width', '14');
  icon.setAttribute('height', '14');
  node.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'apv-chain-node__text';
  text.textContent = build.definition.name;
  node.appendChild(text);

  const num = document.createElement('span');
  num.className = 'apv-chain-node__number';
  num.textContent = `#${build.buildNumber}`;
  node.appendChild(num);

  return node;
}

function createArrow(): HTMLElement {
  const arrow = document.createElement('span');
  arrow.className = 'apv-chain-arrow';
  arrow.textContent = '→';
  return arrow;
}

function renderTriggerChain(
  container: HTMLElement,
  builds: BuildInfo[],
  currentBuildId: number,
  org: string,
): void {
  container.innerHTML = '';

  const buildMap = new Map<number, BuildInfo>();
  for (const b of builds) buildMap.set(b.id, b);

  const currentBuild = buildMap.get(currentBuildId);
  if (!currentBuild) return;

  // Walk upstream chain
  const upstream: BuildInfo[] = [];
  let walk: BuildInfo | undefined = currentBuild;
  while (walk?.upstreamBuildId) {
    const parent = buildMap.get(walk.upstreamBuildId);
    if (!parent) break;
    upstream.unshift(parent);
    walk = parent;
  }

  // Find direct downstream
  const downstream = builds.filter(
    (b) => b.upstreamBuildId === currentBuildId && b.id !== currentBuildId,
  );

  if (upstream.length === 0 && downstream.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'apv-chain-empty';
    empty.textContent = 'No related pipelines found.';
    container.appendChild(empty);
    return;
  }

  const chain = document.createElement('div');
  chain.className = 'apv-chain';

  for (const b of upstream) {
    chain.appendChild(createBuildNode(b, false, org));
    chain.appendChild(createArrow());
  }

  chain.appendChild(createBuildNode(currentBuild, true, org));

  if (downstream.length > 0) {
    chain.appendChild(createArrow());
    if (downstream.length === 1) {
      chain.appendChild(createBuildNode(downstream[0], false, org));
    } else {
      const group = document.createElement('div');
      group.className = 'apv-chain-group';
      for (const b of downstream) {
        group.appendChild(createBuildNode(b, false, org));
      }
      chain.appendChild(group);
    }
  }

  container.appendChild(chain);
}

export async function injectBuildPageBanner(): Promise<void> {
  const ctx = parseBuildPageContext();
  if (!ctx) return;

  // Don't inject twice
  if (document.querySelector(`[${BANNER_MARKER}]`)) return;

  // Look for the build header area
  const headerEl =
    document.querySelector('.build-header') ??
    document.querySelector('.bolt-header-title-area') ??
    document.querySelector('[data-renderedregion="header"]') ??
    document.querySelector('.page-content');

  if (!headerEl) return;

  // Build the banner DOM
  const banner = document.createElement('div');
  banner.className = 'apv-build-banner';
  banner.setAttribute(BANNER_MARKER, 'true');

  const header = document.createElement('div');
  header.className = 'apv-build-banner__header';

  const logo = document.createElement('span');
  logo.className = 'apv-build-banner__logo';
  logo.textContent = 'APV';
  header.appendChild(logo);

  const title = document.createElement('span');
  title.className = 'apv-build-banner__title';
  title.textContent = 'Loading build info…';
  header.appendChild(title);

  banner.appendChild(header);

  const chainSection = document.createElement('div');
  chainSection.className = 'apv-build-banner__chain-section';
  chainSection.style.display = 'none';

  const chainToggle = document.createElement('button');
  chainToggle.className = 'apv-build-banner__chain-toggle';
  chainToggle.textContent = '▶ Trigger Chain';

  const chainContainer = document.createElement('div');
  chainContainer.className = 'apv-build-banner__chain-container';
  chainContainer.style.display = 'none';

  let chainExpanded = false;
  chainToggle.addEventListener('click', () => {
    chainExpanded = !chainExpanded;
    chainContainer.style.display = chainExpanded ? '' : 'none';
    chainToggle.textContent = chainExpanded
      ? '▼ Trigger Chain'
      : '▶ Trigger Chain';
  });

  chainSection.appendChild(chainToggle);
  chainSection.appendChild(chainContainer);
  banner.appendChild(chainSection);

  // Insert banner after the header
  headerEl.insertAdjacentElement('afterend', banner);

  try {
    const build = await fetchBuild(ctx.org, ctx.project, ctx.buildId);

    // "Why did this run?" reason line
    const reasonInfo = REASON_LABELS[build.reason] ?? {
      icon: '❓',
      label: build.reason,
    };
    let reasonText = `${reasonInfo.icon} ${reasonInfo.label}`;

    if (build.triggeredByBuild) {
      const upstream = build.triggeredByBuild;
      reasonText += ` — ${upstream.definition.name} #${upstream.buildNumber}`;
    }

    title.textContent = reasonText;

    if (build.triggeredByBuild) {
      const upstreamLink = document.createElement('a');
      upstreamLink.className = 'apv-build-banner__upstream-link';
      upstreamLink.href = buildWebUrl(
        ctx.org,
        ctx.project,
        build.triggeredByBuild.id,
      );
      upstreamLink.textContent = '↗ View upstream build';
      header.appendChild(upstreamLink);
    }

    // Load trigger chain
    chainSection.style.display = '';

    const chainLoading = document.createElement('div');
    chainLoading.className = 'apv-chain-loading';
    chainLoading.textContent = 'Loading trigger chain…';
    chainContainer.appendChild(chainLoading);

    const groups = await loadRelatedProjectGroups();
    const related = getRelatedProjects(ctx.project, groups);
    const projects = [ctx.project, ...related];

    const accumulated: BuildInfo[] = [];

    await buildTriggerChain(ctx.org, projects, build, (batch) => {
      for (const b of batch) {
        const idx = accumulated.findIndex((x) => x.id === b.id);
        if (idx >= 0) accumulated[idx] = b;
        else accumulated.push(b);
      }
      renderTriggerChain(chainContainer, accumulated, ctx.buildId, ctx.org);
    });

    // Final render
    renderTriggerChain(chainContainer, accumulated, ctx.buildId, ctx.org);
  } catch (err) {
    title.textContent =
      err instanceof Error ? `⚠️ ${err.message}` : '⚠️ Failed to load';
    title.classList.add('apv-build-banner__title--error');
  }
}

/** Check if current page is a build result page */
export function isBuildResultPage(): boolean {
  return /_build\/results\?buildId=/.test(window.location.href);
}
