/**
 * Parses an Azure DevOps file URL into its components.
 *
 * Supported formats:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}?path={filePath}
 * - https://dev.azure.com/{org}/{project}/_git/{repo}?path={filePath}&version=GB{branch}
 * - https://dev.azure.com/{org}/{project}/_git/{repo}?path={filePath}&version=GT{tag}
 */
export interface AdoUrlParts {
  org: string;
  project: string;
  repoName: string;
  filePath: string;
  /** Branch name (without refs/heads/ prefix) */
  branch?: string;
  /** Raw git ref, e.g. refs/heads/main or refs/tags/v1.0 */
  ref?: string;
}

/**
 * Parsed components of an Azure DevOps commit URL.
 *
 * Supported format:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}/commit/{commitSha}
 */
export interface AdoCommitUrlParts {
  org: string;
  project: string;
  repoName: string;
  commitSha: string;
}

export function parseAdoUrl(url: string): AdoUrlParts | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith('dev.azure.com')) return null;

    // pathname: /{org}/{project}/_git/{repo}
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4 || segments[2] !== '_git') return null;

    const org = decodeURIComponent(segments[0]);
    const project = decodeURIComponent(segments[1]);
    const repoName = decodeURIComponent(segments[3]);
    const filePath = parsed.searchParams.get('path') || '';
    const version = parsed.searchParams.get('version');

    let branch: string | undefined;
    let ref: string | undefined;
    if (version?.startsWith('GB')) {
      // GB prefix = git branch
      branch = version.slice(2);
      ref = `refs/heads/${branch}`;
    } else if (version?.startsWith('GT')) {
      // GT prefix = git tag
      ref = `refs/tags/${version.slice(2)}`;
    }

    if (!filePath) return null;

    return { org, project, repoName, filePath, branch, ref };
  } catch {
    return null;
  }
}

/**
 * Builds an Azure DevOps file URL from its components.
 *
 * Version prefix is determined by the `ref` field:
 * - refs/tags/...  → GT{tag}
 * - refs/heads/... → GB{branch}
 * - (fallback)     → GB{branch} if `branch` is set
 */
export function buildAdoFileUrl(parts: AdoUrlParts): string {
  const base = `https://dev.azure.com/${encodeURIComponent(parts.org)}/${encodeURIComponent(parts.project)}/_git/${encodeURIComponent(parts.repoName)}`;
  const params = new URLSearchParams({ path: parts.filePath });

  if (parts.ref?.startsWith('refs/tags/')) {
    params.set('version', `GT${parts.ref.replace('refs/tags/', '')}`);
  } else if (parts.ref?.startsWith('refs/heads/')) {
    params.set('version', `GB${parts.ref.replace('refs/heads/', '')}`);
  } else if (parts.branch) {
    params.set('version', `GB${parts.branch}`);
  }

  return `${base}?${params}`;
}

/**
 * Parses an Azure DevOps commit URL into its components.
 *
 * Supported format:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}/commit/{commitSha}
 */
export function parseAdoCommitUrl(url: string): AdoCommitUrlParts | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith('dev.azure.com')) return null;

    // pathname: /{org}/{project}/_git/{repo}/commit/{sha}
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length < 6 ||
      segments[2] !== '_git' ||
      segments[4] !== 'commit'
    )
      return null;

    const org = decodeURIComponent(segments[0]);
    const project = decodeURIComponent(segments[1]);
    const repoName = decodeURIComponent(segments[3]);
    const commitSha = decodeURIComponent(segments[5]);

    if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) return null;

    return { org, project, repoName, commitSha };
  } catch {
    return null;
  }
}
