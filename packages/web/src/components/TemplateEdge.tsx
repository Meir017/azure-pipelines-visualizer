import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from '@xyflow/react';
import { memo, useCallback, useState } from 'react';

export interface TemplateEdgeData {
  /** Edge category label: extends, stages, jobs, steps, etc. */
  edgeLabel: string;
  /** Names of parameters the caller passes to the target template */
  parameterNames?: string[];
  /** Total number of parameters declared by the target template file */
  totalParameterCount?: number;
  /** All parameter names declared by the target template file */
  declaredParameterNames?: string[];
  /** Whether this edge goes to an external (cross-repo) template */
  isExternal?: boolean;
  /** Whether this reference is inside a conditional block */
  conditional?: boolean;
  /** The condition expression text, e.g. `eq(parameters.enablePSSA, true)` */
  conditionExpression?: string;
  /** Evaluated condition result: true (will expand), false (skipped), 'unknown' (can't determine) */
  conditionResult?: true | false | 'unknown';
  /** Whether the template path originally contained expressions */
  dynamicPath?: boolean;
  /** Whether all expressions in the path were fully resolved */
  expressionResolved?: boolean;
  /** The original raw path before expression resolution */
  originalPath?: string;
  /** The resolved path after expression evaluation */
  resolvedPath?: string;
  /** Unresolved expression parameter names */
  unresolvedExpressions?: string[];
}

function BadgeWithTooltip({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className={className}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      {show && <div className="template-edge__badge-tooltip">{children}</div>}
    </span>
  );
}

function TemplateEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const d = data as unknown as TemplateEdgeData | undefined;
  const [showTooltip, setShowTooltip] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleMouseEnter = useCallback(() => setShowTooltip(true), []);
  const handleMouseLeave = useCallback(() => setShowTooltip(false), []);

  const paramCount = d?.parameterNames?.length ?? 0;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="template-edge__label-container"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <div className="template-edge__top-row">
            <span className="template-edge__category">{d?.edgeLabel}</span>
            {d?.conditional && (
              <BadgeWithTooltip
                className={`template-edge__badge template-edge__badge--conditional${d.conditionResult === false ? ' template-edge__badge--condition-false' : d.conditionResult === true ? ' template-edge__badge--condition-true' : ''}`}
                label={
                  d.conditionResult === false
                    ? '⊘ false'
                    : d.conditionResult === true
                      ? '✓ conditional'
                      : 'conditional'
                }
              >
                <div className="template-edge__badge-tooltip-title">
                  ⚡ Conditional Reference
                </div>
                <p>
                  {d.conditionResult === true
                    ? 'Condition evaluated to true — this template will be included.'
                    : d.conditionResult === false
                      ? 'Condition evaluated to false — this template will NOT be included in this pipeline run.'
                      : 'This template is inside a conditional block. The condition could not be fully evaluated.'}
                </p>
                {d.conditionExpression && (
                  <div className="template-edge__badge-tooltip-row">
                    <span className="template-edge__badge-tooltip-label">
                      Condition
                    </span>
                    <code>{d.conditionExpression}</code>
                  </div>
                )}
                {d.conditionResult != null && (
                  <div className="template-edge__badge-tooltip-row">
                    <span className="template-edge__badge-tooltip-label">
                      Result
                    </span>
                    <code>{String(d.conditionResult)}</code>
                  </div>
                )}
              </BadgeWithTooltip>
            )}
            {d?.dynamicPath && d.expressionResolved && (
              <BadgeWithTooltip
                className="template-edge__badge template-edge__badge--resolved"
                label="🔮 resolved"
              >
                <div className="template-edge__badge-tooltip-title">
                  🔮 Expression Resolved
                </div>
                <p>
                  The template path contained expressions that were successfully
                  evaluated.
                </p>
                <div className="template-edge__badge-tooltip-row">
                  <span className="template-edge__badge-tooltip-label">
                    Original
                  </span>
                  <code>{d.originalPath}</code>
                </div>
                {d.resolvedPath && (
                  <div className="template-edge__badge-tooltip-row">
                    <span className="template-edge__badge-tooltip-label">
                      Resolved
                    </span>
                    <code>{d.resolvedPath}</code>
                  </div>
                )}
              </BadgeWithTooltip>
            )}
            {d?.dynamicPath && !d.expressionResolved && (
              <BadgeWithTooltip
                className="template-edge__badge template-edge__badge--unresolved"
                label="⚠️ dynamic"
              >
                <div className="template-edge__badge-tooltip-title">
                  ⚠️ Unresolved Expressions
                </div>
                <p>
                  The template path contains expressions that could not be
                  evaluated at analysis time.
                </p>
                <div className="template-edge__badge-tooltip-row">
                  <span className="template-edge__badge-tooltip-label">
                    Original
                  </span>
                  <code>{d.originalPath}</code>
                </div>
                {d.resolvedPath && d.resolvedPath !== d.originalPath && (
                  <div className="template-edge__badge-tooltip-row">
                    <span className="template-edge__badge-tooltip-label">
                      Partial
                    </span>
                    <code>{d.resolvedPath}</code>
                  </div>
                )}
                {d.unresolvedExpressions &&
                  d.unresolvedExpressions.length > 0 && (
                    <div className="template-edge__badge-tooltip-row">
                      <span className="template-edge__badge-tooltip-label">
                        Unresolved
                      </span>
                      <span>{d.unresolvedExpressions.join(', ')}</span>
                    </div>
                  )}
              </BadgeWithTooltip>
            )}
          </div>
          {paramCount > 0 && (
            <span
              className="template-edge__params-badge"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {formatParamsBadge(d!)}
              {showTooltip && <ParamsTooltip data={d!} />}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function formatParamsBadge(d: TemplateEdgeData): string {
  const passed = d.parameterNames?.length ?? 0;
  if (d.totalParameterCount != null) {
    return `${passed}/${d.totalParameterCount} params`;
  }
  return `${passed} params`;
}

function ParamsTooltip({ data: d }: { data: TemplateEdgeData }) {
  const notPassed = d.declaredParameterNames?.filter(
    (n) => !d.parameterNames?.includes(n),
  );

  return (
    <div className="template-edge__params-tooltip">
      {d.parameterNames && d.parameterNames.length > 0 && (
        <div className="template-edge__params-section">
          <div className="template-edge__params-heading">
            ✓ Passed ({d.parameterNames.length})
          </div>
          <ul className="template-edge__params-list">
            {d.parameterNames.map((n) => (
              <li
                key={n}
                className="template-edge__params-item template-edge__params-item--passed"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notPassed && notPassed.length > 0 && (
        <div className="template-edge__params-section">
          <div className="template-edge__params-heading">
            ○ Not passed ({notPassed.length})
          </div>
          <ul className="template-edge__params-list">
            {notPassed.map((n) => (
              <li
                key={n}
                className="template-edge__params-item template-edge__params-item--missing"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.totalParameterCount == null && !d.declaredParameterNames?.length && (
        <div className="template-edge__params-hint">
          Expand node to see all declared params
        </div>
      )}
    </div>
  );
}

export default memo(TemplateEdge);
