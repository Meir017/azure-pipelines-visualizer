/**
 * Parses an Azure DevOps file URL into its components.
 *
 * Supported formats:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}?path={filePath}
 * - https://dev.azure.com/{org}/{project}/_git/{repo}?path={filePath}&version=GB{branch}
 */
export interface AdoUrlParts {
  org: string;
  project: string;
  repoName: string;
  filePath: string;
  branch?: string;
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

    // version=GBmain → branch=main (GB prefix = git branch)
    const branch = version?.startsWith('GB') ? version.slice(2) : undefined;

    if (!filePath) return null;

    return { org, project, repoName, filePath, branch };
  } catch {
    return null;
  }
}
