import type { BuildInfo } from '../../services/api-client.js';

interface BuildDetailPopupProps {
  build: BuildInfo;
  onClose: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function resultBadge(
  status: string,
  result: string | null,
): { label: string; className: string } {
  if (status === 'inProgress')
    return { label: 'In Progress', className: 'badge--in-progress' };
  if (status === 'notStarted')
    return { label: 'Not Started', className: 'badge--pending' };
  if (result === 'succeeded')
    return { label: 'Succeeded', className: 'badge--succeeded' };
  if (result === 'partiallySucceeded')
    return { label: 'Partial Success', className: 'badge--partial' };
  if (result === 'failed')
    return { label: 'Failed', className: 'badge--failed' };
  if (result === 'canceled')
    return { label: 'Canceled', className: 'badge--canceled' };
  return { label: status, className: '' };
}

export default function BuildDetailPopup({
  build,
  onClose,
}: BuildDetailPopupProps) {
  const badge = resultBadge(build.status, build.result);
  const duration = formatDuration(build.startTime, build.finishTime);
  const webUrl = build._links?.web?.href;

  return (
    <div
      className="build-popup-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="build-popup"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="build-popup__header">
          <h2>{build.definition.name}</h2>
          <button
            className="build-popup__close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="build-popup__body">
          <div className="build-popup__row">
            <span className="build-popup__label">Build Number</span>
            <span>#{build.buildNumber}</span>
          </div>

          <div className="build-popup__row">
            <span className="build-popup__label">Status</span>
            <span className={`build-popup__badge ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          <div className="build-popup__row">
            <span className="build-popup__label">Queued</span>
            <span>{formatTimestamp(build.queueTime)}</span>
          </div>

          <div className="build-popup__row">
            <span className="build-popup__label">Started</span>
            <span>{formatTimestamp(build.startTime)}</span>
          </div>

          <div className="build-popup__row">
            <span className="build-popup__label">Finished</span>
            <span>{formatTimestamp(build.finishTime)}</span>
          </div>

          {duration && (
            <div className="build-popup__row">
              <span className="build-popup__label">Duration</span>
              <span>{duration}</span>
            </div>
          )}

          <div className="build-popup__row">
            <span className="build-popup__label">Branch</span>
            <span>{build.sourceBranch.replace('refs/heads/', '')}</span>
          </div>

          <div className="build-popup__row">
            <span className="build-popup__label">Commit</span>
            <span className="build-popup__mono">
              {build.sourceVersion.slice(0, 8)}
            </span>
          </div>

          {build.requestedFor && (
            <div className="build-popup__row">
              <span className="build-popup__label">Requested For</span>
              <span>{build.requestedFor.displayName}</span>
            </div>
          )}

          {build.triggeredByBuild && (
            <div className="build-popup__row">
              <span className="build-popup__label">Triggered By</span>
              <span>
                {build.triggeredByBuild.definition.name} #
                {build.triggeredByBuild.buildNumber}
              </span>
            </div>
          )}

          {Object.keys(build.triggerInfo).length > 0 && (
            <div className="build-popup__row">
              <span className="build-popup__label">Trigger Info</span>
              <span className="build-popup__mono">
                {Object.entries(build.triggerInfo)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              </span>
            </div>
          )}

          {build.tags.length > 0 && (
            <div className="build-popup__row">
              <span className="build-popup__label">Tags</span>
              <span className="build-popup__tags">
                {build.tags.map((tag) => (
                  <span key={tag} className="build-popup__tag">
                    {tag}
                  </span>
                ))}
              </span>
            </div>
          )}

          {webUrl && (
            <div className="build-popup__row">
              <a
                href={webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="build-popup__link"
              >
                Open in Azure DevOps ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
