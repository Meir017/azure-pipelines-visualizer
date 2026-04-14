export type { PipelineDefinition, PipelineInfo } from './ado-client.js';
export {
  downloadRepoZip,
  fetchFileContent,
  fetchPipelineDefinition,
  fetchPipelines,
  getVersionDescriptor,
  normalizeGitRef,
  resolveCommitSha,
} from './ado-client.js';
export type { ZipFileProviderOptions } from './file-provider.js';
export { ZipFileProvider } from './file-provider.js';
export type { ExtractedFiles } from './zip-cache.js';
export {
  clearCache,
  ensureRepoCached,
  extractZip,
  getFileFromCache,
} from './zip-cache.js';
