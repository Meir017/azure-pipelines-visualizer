export interface BuildDefinitionRef {
  id: number;
  name: string;
}

export interface BuildInfo {
  id: number;
  buildNumber: string;
  definition: BuildDefinitionRef;
  status: string;
  result: string | null;
  reason: string;
  startTime: string | null;
  finishTime: string | null;
  queueTime: string;
  sourceBranch: string;
  sourceVersion: string;
  project: { id: string; name: string };
  requestedFor: { displayName: string; uniqueName: string } | null;
  triggerInfo: Record<string, string>;
  triggeredByBuild: {
    id: number;
    buildNumber: string;
    definition: BuildDefinitionRef;
  } | null;
  /** Normalized upstream build ID: from triggeredByBuild.id or triggerInfo.pipelineId */
  upstreamBuildId: number | null;
  tags: string[];
  url: string;
  _links: { web: { href: string } } | null;
}
