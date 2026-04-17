import { useCallback, useEffect, useState } from 'react';
import type {
  EnvironmentDeploymentRecord,
  EnvironmentInfo,
} from '../../services/api-client.js';
import {
  fetchEnvironmentDeployments,
  fetchEnvironments,
} from '../../services/api-client.js';

interface EnvironmentWithDeployments extends EnvironmentInfo {
  deployments: EnvironmentDeploymentRecord[];
  loading: boolean;
}

function statusColor(result: string | undefined): string {
  if (!result) return 'var(--text-muted)';
  switch (result.toLowerCase()) {
    case 'succeeded':
      return 'var(--success)';
    case 'failed':
      return 'var(--error)';
    case 'canceled':
    case 'cancelled':
      return 'var(--badge-job)';
    default:
      return 'var(--text-muted)';
  }
}

function statusEmoji(result: string | undefined): string {
  if (!result) return '⚪';
  switch (result.toLowerCase()) {
    case 'succeeded':
      return '✅';
    case 'failed':
      return '❌';
    case 'canceled':
    case 'cancelled':
      return '⚠️';
    default:
      return '⚪';
  }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EnvironmentCard({
  env,
  onToggle,
  expanded,
}: {
  env: EnvironmentWithDeployments;
  onToggle: () => void;
  expanded: boolean;
}) {
  const lastDeploy = env.deployments[0];
  const lastResult = lastDeploy?.result;
  const borderColor = statusColor(lastResult);

  return (
    <div className="env-card" style={{ borderLeftColor: borderColor }}>
      <button type="button" className="env-card__header" onClick={onToggle}>
        <div className="env-card__title">
          <span className="env-card__name">{env.name}</span>
          {env.description && (
            <span className="env-card__desc">{env.description}</span>
          )}
        </div>
        <div className="env-card__meta">
          {lastDeploy ? (
            <>
              <span style={{ color: borderColor }}>
                {statusEmoji(lastResult)} {lastResult}
              </span>
              <span className="env-card__pipeline">
                {lastDeploy.definitionName}
              </span>
              <span className="env-card__time">
                {relativeTime(lastDeploy.finishedOn || lastDeploy.startedOn)}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>No deployments</span>
          )}
          <span className="env-card__count">
            {env.deployments.length} deployment
            {env.deployments.length !== 1 ? 's' : ''}
          </span>
          <span className="env-card__expand">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {env.loading && (
        <div className="env-card__loading">Loading deployments…</div>
      )}

      {expanded && env.deployments.length > 0 && (
        <div className="env-card__timeline">
          {env.deployments.slice(0, 20).map((d) => (
            <div key={`${d.id}-${d.stageAttempt}`} className="env-deploy-row">
              <span
                className="env-deploy-row__dot"
                style={{ background: statusColor(d.result) }}
              />
              <span className="env-deploy-row__result">{d.result}</span>
              <span className="env-deploy-row__stage">{d.stageName}</span>
              <span className="env-deploy-row__pipeline">
                {d.definitionName}
              </span>
              <span className="env-deploy-row__time">
                {d.finishedOn
                  ? relativeTime(d.finishedOn)
                  : d.startedOn
                    ? 'running'
                    : 'queued'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EnvironmentMap({
  org,
  project,
}: {
  org: string;
  project: string;
}) {
  const [environments, setEnvironments] = useState<
    EnvironmentWithDeployments[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEnvironments(org, project)
      .then(async (envs) => {
        if (cancelled) return;

        // Initialize with empty deployments
        const withDeploys: EnvironmentWithDeployments[] = envs.map((e) => ({
          ...e,
          deployments: [],
          loading: true,
        }));
        setEnvironments(withDeploys);
        setLoading(false);

        // Fetch deployments for each environment in parallel
        const results = await Promise.allSettled(
          envs.map((e) => fetchEnvironmentDeployments(org, project, e.id)),
        );

        if (cancelled) return;

        setEnvironments((prev) =>
          prev.map((env, i) => {
            const r = results[i];
            return {
              ...env,
              deployments: r.status === 'fulfilled' ? r.value : [],
              loading: false,
            };
          }),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [org, project]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading && environments.length === 0) {
    return <div className="env-map__loading">Loading environments…</div>;
  }

  if (error) {
    return <div className="env-map__error">{error}</div>;
  }

  if (environments.length === 0) {
    return (
      <div className="env-map__empty">
        No environments found in {org}/{project}.
      </div>
    );
  }

  // Sort: environments with recent deployments first, then alphabetically
  const sorted = [...environments].sort((a, b) => {
    const aTime = a.deployments[0]?.finishedOn ?? '';
    const bTime = b.deployments[0]?.finishedOn ?? '';
    if (aTime && bTime) return bTime.localeCompare(aTime);
    if (aTime) return -1;
    if (bTime) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="env-map">
      <div className="env-map__summary">
        {environments.length} environment
        {environments.length !== 1 ? 's' : ''}
      </div>
      <div className="env-map__grid">
        {sorted.map((env) => (
          <EnvironmentCard
            key={env.id}
            env={env}
            expanded={expandedIds.has(env.id)}
            onToggle={() => toggleExpand(env.id)}
          />
        ))}
      </div>
    </div>
  );
}
