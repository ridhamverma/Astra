"use client";
import { useId, type ReactNode } from "react";
import {
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { Plus, Minus, Maximize } from "lucide-react";

export function CanvasGrid() {
  const { x, y, zoom } = useViewport();
  const id = useId().replace(/:/g, "");
  return <svg className="operations-grid" aria-hidden="true" width="100%" height="100%">
    <defs><pattern id={id} width="138.564" height="80" patternUnits="userSpaceOnUse" patternTransform={`translate(${x},${y}) scale(${zoom})`}>
      <path d="M0 40L69.282 0L138.564 40L69.282 80Z" fill="none" stroke="#8193a5" strokeOpacity=".12" strokeWidth=".8" />
    </pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}

export function CanvasZoomControls({
  onFit,
  children,
}: {
  onFit: () => void;
  children?: ReactNode;
}) {
  const flow = useReactFlow(),
    { zoom } = useViewport();
  return (
    <div className="builder-controls glass" aria-label="Canvas controls">
      {children}
      <button
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => void flow.zoomIn()}
      >
        <Plus size={20} />
      </button>
      <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
      <button
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => void flow.zoomOut()}
      >
        <Minus size={20} />
      </button>
      <hr />
      <button aria-label="Fit view" title="Fit view" onClick={onFit}>
        <Maximize size={20} />
      </button>
    </div>
  );
}
