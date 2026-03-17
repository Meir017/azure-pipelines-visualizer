import type { TemplateReference, TemplateLocation } from '../model/pipeline.js';
import { createTemplateRef } from '../model/template-ref.js';

/**
 * Walks a raw parsed YAML pipeline object and extracts all template references.
 * Handles:
 * - Stage/job/step templates (same repo and @alias)
 * - Variable templates
 * - Extends template
 * - Templates nested inside extends.parameters
 * - Conditional ${{ if }} blocks wrapping template refs
 */
export function detectTemplateReferences(raw: Record<string, unknown>): TemplateReference[] {
  const refs: TemplateReference[] = [];

  // 1. Extends block
  if (raw.extends && typeof raw.extends === 'object') {
    const ext = raw.extends as Record<string, unknown>;
    if (typeof ext.template === 'string') {
      refs.push(
        createTemplateRef(ext.template, 'extends', ext.parameters as Record<string, unknown>),
      );
    }

    // Walk extends.parameters for nested template refs
    if (ext.parameters && typeof ext.parameters === 'object') {
      walkExtendsParameters(ext.parameters as Record<string, unknown>, refs);
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
          ),
        );
      }
    }
  }

  // 3. Stages
  if (Array.isArray(raw.stages)) {
    walkItems(raw.stages, 'stages', refs);
  }

  // 4. Jobs (top-level, when no stages)
  if (Array.isArray(raw.jobs)) {
    walkItems(raw.jobs, 'jobs', refs);
  }

  // 5. Steps (top-level, when no stages or jobs)
  if (Array.isArray(raw.steps)) {
    walkItems(raw.steps, 'steps', refs);
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
        ),
      );
      continue;
    }

    // Check for conditional expression blocks: ${{ if ... }}
    for (const key of Object.keys(obj)) {
      if (key.startsWith('${{') && key.includes('if')) {
        const conditionalBlock = obj[key];
        if (Array.isArray(conditionalBlock)) {
          walkConditionalItems(conditionalBlock, location, refs);
        }
      }
    }

    // Recurse into nested stages → jobs → steps
    if (Array.isArray(obj.jobs)) {
      walkItems(obj.jobs, location === 'extends-parameters' ? 'extends-parameters' : 'jobs', refs);
    }
    if (Array.isArray(obj.steps)) {
      walkItems(obj.steps, location === 'extends-parameters' ? 'extends-parameters' : 'steps', refs);
    }
    if (Array.isArray(obj.stages)) {
      walkItems(obj.stages, location === 'extends-parameters' ? 'extends-parameters' : 'stages', refs);
    }
  }
}

/**
 * Walk items inside a conditional ${{ if }} block.
 * These template refs are marked as conditional.
 */
function walkConditionalItems(
  items: unknown[],
  location: TemplateLocation,
  refs: TemplateReference[],
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
        ),
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
): void {
  // Check for stages/jobs/steps arrays inside parameters
  if (Array.isArray(params.stages)) {
    walkItems(params.stages, 'extends-parameters', refs);
  }
  if (Array.isArray(params.jobs)) {
    walkItems(params.jobs, 'extends-parameters', refs);
  }
  if (Array.isArray(params.steps)) {
    walkItems(params.steps, 'extends-parameters', refs);
  }

  // Also walk any parameter that looks like a step/job/stage list
  for (const [, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).template === 'string') {
          const obj = item as Record<string, unknown>;
          refs.push(
            createTemplateRef(
              obj.template as string,
              'extends-parameters',
              obj.parameters as Record<string, unknown> | undefined,
            ),
          );
        }
        // Recurse into stage-like or job-like objects within parameters
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (Array.isArray(obj.jobs)) {
            walkItems(obj.jobs, 'extends-parameters', refs);
          }
          if (Array.isArray(obj.steps)) {
            walkItems(obj.steps, 'extends-parameters', refs);
          }
        }
      }
    }
  }
}

function getChildLocation(
  location: TemplateLocation,
): TemplateLocation | null {
  switch (location) {
    case 'stages':
      return 'jobs';
    case 'jobs':
      return 'steps';
    default:
      return null;
  }
}
