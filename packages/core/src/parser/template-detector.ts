import type { TemplateLocation, TemplateReference } from '../model/pipeline.js';
import {
  createTemplateRef,
  type TemplateRefContext,
} from '../model/template-ref.js';

/**
 * Walks a raw parsed YAML pipeline object and extracts all template references.
 * Handles:
 * - Stage/job/step templates (same repo and @alias)
 * - Variable templates
 * - Extends template
 * - Templates nested inside extends.parameters
 * - Conditional ${{ if }} blocks wrapping template refs
 */
export function detectTemplateReferences(
  raw: Record<string, unknown>,
  context: TemplateRefContext = {},
): TemplateReference[] {
  const refs: TemplateReference[] = [];

  // 1. Extends block
  if (raw.extends && typeof raw.extends === 'object') {
    const ext = raw.extends as Record<string, unknown>;
    if (typeof ext.template === 'string') {
      refs.push(
        createTemplateRef(
          ext.template,
          'extends',
          ext.parameters as Record<string, unknown>,
          false,
          context,
        ),
      );
    }

    // Check for conditional blocks inside extends: ${{ if }}, ${{ else }}, etc.
    // These wrap { template: "...", parameters: {...} } objects
    for (const key of Object.keys(ext)) {
      if (isDirectiveKey(key)) {
        const block = ext[key];
        if (block && typeof block === 'object' && !Array.isArray(block)) {
          const condObj = block as Record<string, unknown>;
          if (typeof condObj.template === 'string') {
            refs.push(
              createTemplateRef(
                condObj.template,
                'extends',
                // Use parameters from the conditional block, or fall back to shared parameters
                (condObj.parameters ?? ext.parameters) as Record<
                  string,
                  unknown
                >,
                true, // conditional
                context,
                extractConditionExpression(key),
              ),
            );
          }
        }
      }
    }

    // Walk extends.parameters for nested template refs
    if (ext.parameters && typeof ext.parameters === 'object') {
      walkExtendsParameters(
        ext.parameters as Record<string, unknown>,
        refs,
        context,
      );
    }
  }

  // 2. Variables
  if (Array.isArray(raw.variables)) {
    for (const v of raw.variables) {
      if (v && typeof v === 'object' && typeof v.template === 'string') {
        refs.push(
          createTemplateRef(
            v.template,
            'variables',
            v.parameters as Record<string, unknown> | undefined,
            false,
            context,
          ),
        );
      }
    }
  }

  // 3. Stages
  if (Array.isArray(raw.stages)) {
    walkItems(raw.stages, 'stages', refs, context);
  }

  // 4. Jobs (top-level, when no stages)
  if (Array.isArray(raw.jobs)) {
    walkItems(raw.jobs, 'jobs', refs, context);
  }

  // 5. Steps (top-level, when no stages or jobs)
  if (Array.isArray(raw.steps)) {
    walkItems(raw.steps, 'steps', refs, context);
  }

  return refs;
}

/**
 * Walk an array of items (stages, jobs, or steps) looking for template references.
 * Handles both direct template refs and conditional blocks.
 */
function walkItems(
  items: unknown[],
  location: TemplateLocation,
  refs: TemplateReference[],
  context: TemplateRefContext,
): void {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    // Direct template reference
    if (typeof obj.template === 'string') {
      refs.push(
        createTemplateRef(
          obj.template,
          location,
          obj.parameters as Record<string, unknown> | undefined,
          false,
          context,
        ),
      );
      continue;
    }

    // Check for Azure Pipelines directive blocks: ${{ if ... }}, ${{ else }}, etc.
    for (const key of Object.keys(obj)) {
      if (isDirectiveKey(key)) {
        const conditionalBlock = obj[key];
        walkConditionalValue(
          conditionalBlock,
          location,
          refs,
          context,
          extractConditionExpression(key),
        );
      }
    }

    // Recurse into nested stages → jobs → steps
    if (Array.isArray(obj.jobs)) {
      walkItems(
        obj.jobs,
        location === 'extends-parameters' ? 'extends-parameters' : 'jobs',
        refs,
        context,
      );
    }
    if (Array.isArray(obj.steps)) {
      walkItems(
        obj.steps,
        location === 'extends-parameters' ? 'extends-parameters' : 'steps',
        refs,
        context,
      );
    }
    if (Array.isArray(obj.stages)) {
      walkItems(
        obj.stages,
        location === 'extends-parameters' ? 'extends-parameters' : 'stages',
        refs,
        context,
      );
    }
  }
}

/**
 * Walk items inside a conditional ${{ if }} block.
 * These template refs are marked as conditional.
 */
function walkConditionalValue(
  value: unknown,
  location: TemplateLocation,
  refs: TemplateReference[],
  context: TemplateRefContext,
  conditionExpression?: string,
): void {
  if (Array.isArray(value)) {
    walkConditionalItems(value, location, refs, context, conditionExpression);
    return;
  }

  if (value && typeof value === 'object') {
    walkConditionalItems([value], location, refs, context, conditionExpression);
  }
}

function walkConditionalItems(
  items: unknown[],
  location: TemplateLocation,
  refs: TemplateReference[],
  context: TemplateRefContext,
  conditionExpression?: string,
): void {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    if (typeof obj.template === 'string') {
      refs.push(
        createTemplateRef(
          obj.template,
          location,
          obj.parameters as Record<string, unknown> | undefined,
          true, // conditional
          context,
          conditionExpression,
        ),
      );
    }

    // Check for nested directive blocks inside conditional items
    for (const key of Object.keys(obj)) {
      if (isDirectiveKey(key)) {
        walkConditionalValue(
          obj[key],
          location,
          refs,
          context,
          extractConditionExpression(key),
        );
      }
    }

    if (Array.isArray(obj.jobs)) {
      walkItems(
        obj.jobs,
        location === 'extends-parameters' ? 'extends-parameters' : 'jobs',
        refs,
        context,
      );
    }
    if (Array.isArray(obj.steps)) {
      walkItems(
        obj.steps,
        location === 'extends-parameters' ? 'extends-parameters' : 'steps',
        refs,
        context,
      );
    }
    if (Array.isArray(obj.stages)) {
      walkItems(
        obj.stages,
        location === 'extends-parameters' ? 'extends-parameters' : 'stages',
        refs,
        context,
      );
    }
  }
}

/**
 * Walk extends.parameters to find template references nested inside
 * parameters.stages, parameters.jobs, etc.
 */
function walkExtendsParameters(
  params: Record<string, unknown>,
  refs: TemplateReference[],
  context: TemplateRefContext,
): void {
  // Check for stages/jobs/steps arrays inside parameters
  if (Array.isArray(params.stages)) {
    walkItems(params.stages, 'extends-parameters', refs, context);
  }
  if (Array.isArray(params.jobs)) {
    walkItems(params.jobs, 'extends-parameters', refs, context);
  }
  if (Array.isArray(params.steps)) {
    walkItems(params.steps, 'extends-parameters', refs, context);
  }

  // Also walk any parameter that looks like a step/job/stage list
  for (const [, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).template === 'string'
        ) {
          const obj = item as Record<string, unknown>;
          refs.push(
            createTemplateRef(
              obj.template as string,
              'extends-parameters',
              obj.parameters as Record<string, unknown> | undefined,
              false,
              context,
            ),
          );
        }
        // Recurse into stage-like or job-like objects within parameters
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (Array.isArray(obj.jobs)) {
            walkItems(obj.jobs, 'extends-parameters', refs, context);
          }
          if (Array.isArray(obj.steps)) {
            walkItems(obj.steps, 'extends-parameters', refs, context);
          }
        }
      }
    }
  }
}

function isDirectiveKey(key: string): boolean {
  return key.startsWith('${{');
}

/** Extract the condition expression from a directive key like `${{ if eq(a, b) }}` → `eq(a, b)` */
function extractConditionExpression(key: string): string | undefined {
  // Match: ${{ if <expression> }}  or  ${{ elseif <expression> }}
  const m = key.match(/\$\{\{\s*(?:else\s*)?if\s+(.*?)\s*\}\}/);
  return m?.[1] || undefined;
}
