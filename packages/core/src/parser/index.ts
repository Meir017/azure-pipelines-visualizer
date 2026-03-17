export { parseYaml, toYaml } from './yaml-parser.js';
export { mapToPipeline } from './pipeline-parser.js';
export { detectTemplateReferences } from './template-detector.js';
export { parseAdoUrl, type AdoUrlParts } from './ado-url-parser.js';
export {
  parseTaskReference,
  resolveTaskDocUrl,
  extractTaskReferences,
  pascalToKebab,
  type TaskReference,
} from './task-resolver.js';
export {
  substituteParameters,
  findExpressions,
  type SubstitutionContext,
  type SubstitutionResult,
  type Expression,
} from './expression-substitutor.js';
