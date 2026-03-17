import yaml from 'js-yaml';

/**
 * Parses a YAML string into a plain JavaScript object.
 * Returns the raw parsed structure — no model mapping.
 */
export function parseYaml(content: string): unknown {
  return yaml.load(content);
}

/**
 * Serializes a JavaScript object back to YAML string.
 * Useful for capturing raw YAML text of sub-nodes.
 */
export function toYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: -1, noRefs: true });
}
