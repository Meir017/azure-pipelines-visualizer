/**
 * Cross-project configuration for the extension.
 * Related project groups are stored in chrome.storage.sync so users can
 * configure which projects to search for triggered pipelines.
 *
 * Example config:
 * [
 *   [
 *     { id: "proj-a-guid", name: "ProjectA" },
 *     { id: "proj-b-guid", name: "ProjectB" }
 *   ]
 * ]
 */

export interface ProjectEntry {
  id: string;
  name: string;
}

export type RelatedProjectGroups = ProjectEntry[][];

const STORAGE_KEY = 'relatedProjectGroups';

/** Load related project groups from chrome.storage.sync. */
export async function loadRelatedProjectGroups(): Promise<RelatedProjectGroups> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const groups = result[STORAGE_KEY];
    if (Array.isArray(groups)) return groups;
  } catch {
    // storage unavailable (e.g. in tests)
  }
  return [];
}

/** Save related project groups to chrome.storage.sync. */
export async function saveRelatedProjectGroups(
  groups: RelatedProjectGroups,
): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: groups });
}

/**
 * Given the current project name (from URL), return related project names
 * that should also be searched for triggered builds.
 */
export function getRelatedProjects(
  currentProject: string,
  groups: RelatedProjectGroups,
): string[] {
  const decoded = decodeURIComponent(currentProject);
  const related: string[] = [];
  for (const group of groups) {
    const match = group.find(
      (p) => p.name === decoded || p.name === currentProject,
    );
    if (match) {
      for (const p of group) {
        if (p.name !== match.name) related.push(p.name);
      }
    }
  }
  return related;
}
