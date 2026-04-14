// Components

export type {
  ExtractedFiles,
  PipelineDefinition,
  PipelineInfo,
  ZipFileProviderOptions,
} from './client/index.js';
// Client utilities (for advanced usage)
export {
  clearCache,
  downloadRepoZip,
  ensureRepoCached,
  extractZip,
  fetchFileContent,
  fetchPipelineDefinition,
  fetchPipelines,
  getFileFromCache,
  normalizeGitRef,
  resolveCommitSha,
  ZipFileProvider,
} from './client/index.js';
export type { ApvEmbedProps } from './components/ApvEmbed.js';
export { ApvEmbed } from './components/ApvEmbed.js';
export type { MountHandle, MountOptions } from './mount.js';
// Mount API (vanilla JS)
export { mount } from './mount.js';
