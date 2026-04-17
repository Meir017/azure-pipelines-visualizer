import type { Edge, Node } from '@xyflow/react';

/** Sanitize a label for use as a Mermaid node text (escape brackets, quotes). */
function mermaidLabel(raw: string): string {
  return raw.replace(/[[\](){}|<>#&"]/g, ' ').trim() || 'node';
}

/** Sanitize an id for Mermaid (alphanumeric + underscore only). */
function mermaidId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Extract a human-readable label from a ReactFlow node. */
function nodeLabel(node: Node): string {
  const d = node.data as Record<string, unknown>;
  // FileNode uses `label`, BuildNode uses `pipelineName`
  return String(d.label ?? d.pipelineName ?? d.buildNumber ?? node.id);
}

/**
 * Convert ReactFlow nodes + edges into Mermaid flowchart syntax.
 *
 * ```
 * graph LR
 *   id1["Label 1"] --> id2["Label 2"]
 * ```
 */
export function toMermaid(nodes: Node[], edges: Edge[]): string {
  const lines: string[] = ['graph LR'];

  // Declare all nodes
  for (const n of nodes) {
    const id = mermaidId(n.id);
    const label = mermaidLabel(nodeLabel(n));
    lines.push(`  ${id}["${label}"]`);
  }

  // Declare edges
  for (const e of edges) {
    lines.push(`  ${mermaidId(e.source)} --> ${mermaidId(e.target)}`);
  }

  return lines.join('\n');
}

/**
 * Convert ReactFlow nodes + edges into PlantUML syntax.
 *
 * ```
 * @startuml
 * object "Label 1" as id1
 * id1 --> id2
 * @enduml
 * ```
 */
export function toPlantUML(nodes: Node[], edges: Edge[]): string {
  const lines: string[] = ['@startuml'];

  for (const n of nodes) {
    const id = mermaidId(n.id);
    const label = nodeLabel(n).replace(/"/g, "'");
    lines.push(`object "${label}" as ${id}`);
  }

  lines.push('');

  for (const e of edges) {
    lines.push(`${mermaidId(e.source)} --> ${mermaidId(e.target)}`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}

/**
 * Capture the ReactFlow viewport SVG and return it as a Blob.
 * Falls back to null if the viewport element isn't found.
 */
export function toSvgBlob(): Blob | null {
  const viewport = document.querySelector(
    '.react-flow__viewport',
  ) as SVGGElement | null;
  if (!viewport) return null;

  const svg = viewport.closest('svg');
  if (!svg) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Convert the ReactFlow viewport to a PNG Blob via an offscreen canvas.
 * Returns null if capture fails.
 */
export async function toPngBlob(): Promise<Blob | null> {
  const svgBlob = toSvgBlob();
  if (!svgBlob) return null;

  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1200;
    canvas.height = img.naturalHeight || img.height || 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Copy text to the clipboard, returning true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
