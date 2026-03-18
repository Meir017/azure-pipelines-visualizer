import { memo, useState, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

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
  /** Whether the template path originally contained expressions */
  dynamicPath?: boolean;
  /** Whether all expressions in the path were fully resolved */
  expressionResolved?: boolean;
  /** The original raw path before expression resolution */
  originalPath?: string;
  /** Unresolved expression parameter names */
  unresolvedExpressions?: string[];
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
              <span
                className="template-edge__badge template-edge__badge--conditional"
                title="This template reference is inside a conditional (${{ if }}) block — it may not execute in every run"
              >
                conditional
              </span>
            )}
            {d?.dynamicPath && d.expressionResolved && (
              <span
                className="template-edge__badge template-edge__badge--resolved"
                title={`Expression resolved\nOriginal: ${d.originalPath}\nResolved to the current target path`}
              >
                🔮 resolved
              </span>
            )}
            {d?.dynamicPath && !d.expressionResolved && (
              <span
                className="template-edge__badge template-edge__badge--unresolved"
                title={`Unresolved expressions: ${d.unresolvedExpressions?.join(', ') ?? 'unknown'}\nOriginal: ${d.originalPath}\nThe template path contains expressions that could not be evaluated`}
              >
                ⚠️ dynamic
              </span>
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
              <li key={n} className="template-edge__params-item template-edge__params-item--passed">{n}</li>
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
              <li key={n} className="template-edge__params-item template-edge__params-item--missing">{n}</li>
            ))}
          </ul>
        </div>
      )}
      {d.totalParameterCount == null && !d.declaredParameterNames?.length && (
        <div className="template-edge__params-hint">Expand node to see all declared params</div>
      )}
    </div>
  );
}

export default memo(TemplateEdge);
