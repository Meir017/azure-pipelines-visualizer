import type { BuildInfo } from '../../services/api-client.js';

interface ReasonDisplay {
  icon: string;
  narrative: string;
  colorClass: string;
}

function getReasonDisplay(build: BuildInfo): ReasonDisplay {
  const branch = build.sourceBranch.replace('refs/heads/', '');
  const who = build.requestedFor?.displayName ?? 'unknown';

  switch (build.reason) {
    case 'individualCI':
    case 'batchedCI':
    case 'ci':
      return {
        icon: '🔄',
        narrative: `CI trigger on branch \`${branch}\` — push by ${who}`,
        colorClass: 'why-run--ci',
      };
    case 'pullRequest':
      return {
        icon: '🔀',
        narrative: `Pull request trigger on \`${branch}\``,
        colorClass: 'why-run--pr',
      };
    case 'manual':
      return {
        icon: '👤',
        narrative: `Manually triggered by ${who}`,
        colorClass: 'why-run--manual',
      };
    case 'buildCompletion':
      if (build.triggeredByBuild) {
        return {
          icon: '⛓️',
          narrative: `Triggered by completion of pipeline '${build.triggeredByBuild.definition.name}' (build #${build.triggeredByBuild.buildNumber})`,
          colorClass: 'why-run--pipeline',
        };
      }
      return {
        icon: '⛓️',
        narrative: 'Triggered by build completion',
        colorClass: 'why-run--pipeline',
      };
    case 'resourceTrigger': {
      const upstreamId =
        build.triggerInfo['ci.triggeringBuildId'] ??
        build.upstreamBuildId ??
        'unknown';
      return {
        icon: '⛓️',
        narrative: `Resource trigger from pipeline #${upstreamId}`,
        colorClass: 'why-run--pipeline',
      };
    }
    case 'schedule':
      return {
        icon: '⏰',
        narrative: 'Scheduled run',
        colorClass: 'why-run--schedule',
      };
    default:
      return {
        icon: 'ℹ️',
        narrative: `Reason: ${build.reason}`,
        colorClass: 'why-run--other',
      };
  }
}

interface UpstreamStep {
  name: string;
  buildNumber: string;
}

function getUpstreamChain(build: BuildInfo): UpstreamStep[] {
  const chain: UpstreamStep[] = [];
  if (build.triggeredByBuild) {
    chain.push({
      name: build.triggeredByBuild.definition.name,
      buildNumber: build.triggeredByBuild.buildNumber,
    });
  }
  return chain;
}

export default function WhyDidThisRun({ build }: { build: BuildInfo }) {
  const { icon, narrative, colorClass } = getReasonDisplay(build);
  const upstream = getUpstreamChain(build);

  return (
    <div className={`why-run-banner ${colorClass}`}>
      <div className="why-run-banner__main">
        <span className="why-run-banner__icon">{icon}</span>
        <span className="why-run-banner__text">{narrative}</span>
      </div>
      {upstream.length > 0 && (
        <div className="why-run-banner__chain">
          {upstream.map((step) => (
            <span key={step.buildNumber} className="why-run-banner__step">
              {step.name} #{step.buildNumber}
            </span>
          ))}
          <span className="why-run-banner__separator">→</span>
          <span className="why-run-banner__step why-run-banner__step--current">
            This Build
          </span>
        </div>
      )}
    </div>
  );
}
