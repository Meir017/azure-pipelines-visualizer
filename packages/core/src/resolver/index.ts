export type { IFileProvider } from './types.js';
export {
  resolveTemplateReferences,
  type ResolvedTemplate,
  type ResolveOptions,
} from './template-resolver.js';
export {
  expandPipeline,
  type ExpandedPipeline,
  type ExpandOptions,
  type ExpansionRecord,
  type ExpansionError,
} from './template-expander.js';
