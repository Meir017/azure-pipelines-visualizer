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

export function toBuildInfo(data: Record<string, unknown>): BuildInfo {
  const def = data.definition as Record<string, unknown> | undefined;
  const reqFor = data.requestedFor as Record<string, unknown> | undefined;
  const triggered = data.triggeredByBuild as
    | Record<string, unknown>
    | undefined;
  const triggeredDef = triggered?.definition as
    | Record<string, unknown>
    | undefined;
  const links = data._links as Record<string, unknown> | undefined;
  const web = links?.web as Record<string, unknown> | undefined;
  const proj = data.project as Record<string, unknown> | undefined;
  const triggerInfo = (data.triggerInfo as Record<string, string>) ?? {};

  const triggeredById = triggered ? (triggered.id as number) : null;
  const pipelineIdStr = triggerInfo.pipelineId;
  const upstreamBuildId =
    triggeredById ?? (pipelineIdStr ? Number(pipelineIdStr) : null);

  return {
    id: data.id as number,
    buildNumber: data.buildNumber as string,
    definition: {
      id: (def?.id as number) ?? 0,
      name: (def?.name as string) ?? '',
    },
    status: data.status as string,
    result: (data.result as string) ?? null,
    reason: (data.reason as string) ?? '',
    startTime: (data.startTime as string) ?? null,
    finishTime: (data.finishTime as string) ?? null,
    queueTime: data.queueTime as string,
    sourceBranch: data.sourceBranch as string,
    sourceVersion: data.sourceVersion as string,
    project: {
      id: (proj?.id as string) ?? '',
      name: (proj?.name as string) ?? '',
    },
    requestedFor: reqFor
      ? {
          displayName: reqFor.displayName as string,
          uniqueName: reqFor.uniqueName as string,
        }
      : null,
    triggerInfo,
    triggeredByBuild: triggered
      ? {
          id: triggered.id as number,
          buildNumber: triggered.buildNumber as string,
          definition: {
            id: (triggeredDef?.id as number) ?? 0,
            name: (triggeredDef?.name as string) ?? '',
          },
        }
      : null,
    upstreamBuildId,
    tags: (data.tags as string[]) ?? [],
    url: data.url as string,
    _links: web ? { web: { href: web.href as string } } : null,
  };
}
