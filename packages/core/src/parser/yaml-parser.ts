import yaml from 'js-yaml';

const DIRECTIVE_KEY_PATTERN = /^(\s*-\s*|\s*)(\$\{\{.+?\}\})(\s*:\s*(?:#.*)?)$/;

/**
 * Parses a YAML string into a plain JavaScript object.
 * Returns the raw parsed structure — no model mapping.
 */
export function parseYaml(content: string): unknown {
  return yaml.load(preprocessAzurePipelinesDirectiveKeys(content));
}

/**
 * Serializes a JavaScript object back to YAML string.
 * Useful for capturing raw YAML text of sub-nodes.
 */
export function toYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: -1, noRefs: true });
}

function preprocessAzurePipelinesDirectiveKeys(content: string): string {
  let counter = 0;

  return content
    .split(/\r?\n/)
    .map((line) =>
      line.replace(DIRECTIVE_KEY_PATTERN, (_match, prefix: string, key: string, suffix: string) => {
        const uniqueKey = `${key}__apv_${counter++}`;
        return `${prefix}"${uniqueKey}"${suffix}`;
      }),
    )
    .join('\n');
}
