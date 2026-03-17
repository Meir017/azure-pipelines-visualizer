/**
 * Abstract file provider for fetching template files.
 * Implementations handle I/O; the resolver stays pure.
 */
export interface IFileProvider {
  /**
   * Fetch the text content of a file.
   * @param repo - Repository identifier. Empty string or undefined = current repo.
   * @param path - File path relative to the repo root.
   * @param ref  - Optional git ref (branch, tag, commit).
   */
  getFileContent(repo: string, path: string, ref?: string): Promise<string>;
}
