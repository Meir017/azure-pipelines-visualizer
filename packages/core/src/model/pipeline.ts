/** A fully parsed Azure Pipeline definition. */
export interface Pipeline {
  readonly trigger?: Trigger;
  readonly pr?: Trigger;
  readonly resources?: Resources;
  readonly variables?: VariableEntry[];
  readonly extends?: ExtendsBlock;
  readonly stages?: Stage[];
  /** Top-level jobs (when no stages are defined). */
  readonly jobs?: Job[];
  /** Top-level steps (when no stages or jobs are defined — single-job shorthand). */
  readonly steps?: Step[];
  /** Pool at the pipeline level. */
  readonly pool?: Pool;
  /** Raw YAML text of this node (for display). */
  readonly rawYaml?: string;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export type Trigger =
  | string[]
  | 'none'
  | { branches?: BranchFilter; paths?: PathFilter; tags?: TagFilter };

export interface BranchFilter {
  readonly include?: string[];
  readonly exclude?: string[];
}

export interface PathFilter {
  readonly include?: string[];
  readonly exclude?: string[];
}

export interface TagFilter {
  readonly include?: string[];
  readonly exclude?: string[];
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface Resources {
  readonly repositories?: ResourceRepository[];
  readonly pipelines?: ResourcePipeline[];
}

export interface ResourceRepository {
  readonly repository: string;
  readonly type: 'git' | 'github' | 'githubenterprise' | 'bitbucket';
  readonly name: string;
  readonly ref?: string;
  readonly endpoint?: string;
}

export interface ResourcePipeline {
  readonly pipeline: string;
  readonly source: string;
  readonly trigger?: boolean | { branches?: BranchFilter };
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export type VariableEntry =
  | { name: string; value: string }
  | { group: string }
  | { template: string; parameters?: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Extends
// ---------------------------------------------------------------------------

export interface ExtendsBlock {
  readonly template: string;
  readonly parameters?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stages / Jobs / Steps
// ---------------------------------------------------------------------------

export interface Stage {
  readonly stage: string;
  readonly displayName?: string;
  readonly dependsOn?: string | string[];
  readonly condition?: string;
  readonly variables?: VariableEntry[];
  readonly jobs?: Job[];
  readonly pool?: Pool;
  /** Present when this is a template reference instead of an inline stage. */
  readonly templateRef?: TemplateReference;
  readonly rawYaml?: string;
}

export interface Job {
  readonly job?: string;
  readonly deployment?: string;
  readonly displayName?: string;
  readonly dependsOn?: string | string[];
  readonly condition?: string;
  readonly strategy?: Strategy;
  readonly pool?: Pool;
  readonly variables?: VariableEntry[];
  readonly steps?: Step[];
  readonly environment?: string | { name: string; resourceType?: string };
  /** Present when this is a template reference instead of an inline job. */
  readonly templateRef?: TemplateReference;
  readonly rawYaml?: string;
}

export interface Step {
  readonly script?: string;
  readonly bash?: string;
  readonly powershell?: string;
  readonly pwsh?: string;
  readonly task?: string;
  readonly checkout?: string;
  readonly download?: string;
  readonly publish?: string;
  readonly displayName?: string;
  readonly condition?: string;
  readonly inputs?: Record<string, string>;
  readonly env?: Record<string, string>;
  /** Present when this is a template reference instead of an inline step. */
  readonly templateRef?: TemplateReference;
  readonly rawYaml?: string;
}

export interface Pool {
  readonly vmImage?: string;
  readonly name?: string;
  readonly demands?: string[];
}

export interface Strategy {
  readonly matrix?: Record<string, Record<string, string>>;
  readonly parallel?: number;
  readonly runOnce?: unknown;
  readonly canary?: unknown;
  readonly rolling?: unknown;
}

// ---------------------------------------------------------------------------
// Template Reference
// ---------------------------------------------------------------------------

export interface TemplateReference {
  /** The raw path as written in the YAML (e.g. `.pipelines/build-template.yml@self`). */
  readonly rawPath: string;
  /** Normalized path (no leading `./` or `.pipelines/`, forward slashes). */
  readonly normalizedPath: string;
  /** Repository alias if referencing an external repo (the part after `@`), or undefined for same-repo. */
  readonly repoAlias?: string;
  /** Parameters passed to the template. */
  readonly parameters?: Record<string, unknown>;
  /** Where in the tree this reference was found. */
  readonly location: TemplateLocation;
  /** Whether this ref is inside a conditional `${{ if }}` block. */
  readonly conditional: boolean;
}

export type TemplateLocation =
  | 'extends'
  | 'stages'
  | 'jobs'
  | 'steps'
  | 'variables'
  | 'extends-parameters';
