import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  copyToClipboard,
  downloadBlob,
  toMermaid,
  toPlantUML,
  toPngBlob,
  toSvgBlob,
} from './export-utils.js';
import './ExportButton.css';

interface ExportButtonProps {
  nodes: Node[];
  edges: Edge[];
}

export default function ExportButton({ nodes, edges }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as HTMLElement)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleCopyMermaid = useCallback(async () => {
    setOpen(false);
    const text = toMermaid(nodes, edges);
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Mermaid copied to clipboard' : 'Failed to copy');
  }, [nodes, edges, showToast]);

  const handleCopyPlantUML = useCallback(async () => {
    setOpen(false);
    const text = toPlantUML(nodes, edges);
    const ok = await copyToClipboard(text);
    showToast(ok ? 'PlantUML copied to clipboard' : 'Failed to copy');
  }, [nodes, edges, showToast]);

  const handleDownloadSvg = useCallback(() => {
    setOpen(false);
    const blob = toSvgBlob();
    if (blob) {
      downloadBlob(blob, 'pipeline-diagram.svg');
      showToast('SVG downloaded');
    } else {
      showToast('Could not capture SVG');
    }
  }, [showToast]);

  const handleDownloadPng = useCallback(async () => {
    setOpen(false);
    const blob = await toPngBlob();
    if (blob) {
      downloadBlob(blob, 'pipeline-diagram.png');
      showToast('PNG downloaded');
    } else {
      showToast('Could not capture PNG');
    }
  }, [showToast]);

  return (
    <div className="export-container" ref={containerRef}>
      <button
        type="button"
        className="export-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Export diagram"
      >
        📤 Export
      </button>

      {open && (
        <ul className="export-dropdown">
          <li>
            <button type="button" onClick={handleCopyMermaid}>
              📋 Copy as Mermaid
            </button>
          </li>
          <li>
            <button type="button" onClick={handleCopyPlantUML}>
              📋 Copy as PlantUML
            </button>
          </li>
          <li>
            <button type="button" onClick={handleDownloadSvg}>
              🖼️ Download as SVG
            </button>
          </li>
          <li>
            <button type="button" onClick={handleDownloadPng}>
              🖼️ Download as PNG
            </button>
          </li>
        </ul>
      )}

      {toast && <div className="export-toast">{toast}</div>}
    </div>
  );
}
