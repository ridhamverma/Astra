"use client";
import type { ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { Plus, Minus, Maximize } from "lucide-react";

export function CanvasGrid() {
  const { zoom } = useViewport();
  return (
    <Background
      variant={BackgroundVariant.Dots}
      gap={24 / zoom}
      size={1.2 / zoom}
      color="var(--border-hairline)"
    />
  );
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
