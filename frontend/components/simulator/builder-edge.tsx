import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useViewport, useStore } from "@xyflow/react";
import { isometricRoute } from "@/lib/isometric";
import type { EditorEdge } from "@/lib/simulation-editor";

export const BuilderEdge = memo(function BuilderEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
  selected,
}: EdgeProps<EditorEdge>) {
  const { zoom } = useViewport();
  const stations = useStore(state => state.nodeLookup);
  const transform = useStore(state => state.transform);
  const canvasHeight = useStore(state => state.height);
  const canvasWidth = useStore(state => state.width);
  const { path, x, y } = isometricRoute({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const label = zoom < .35 && /^(Yes|No) /.test(data?.label ?? "") ? data?.label?.split(" ")[0] : data?.label;
  // Keep screen-sized branch labels outside station artwork and its caption area.
  const labelWidth = ((label?.length ?? 0) * 6 + 20) / zoom;
  const direction = data?.label?.startsWith("No") ? 1 : -1;
  const labelX = direction === 1 && canvasWidth < 600 ? Math.min(x + 40 / zoom, (canvasWidth - 55 - transform[0]) / zoom) : x;
  const candidates = Array.from({ length: 24 }, (_, index) => 24 + index * 8).flatMap(offset => [direction, -direction].map(sign => ({ x: labelX, y: y + sign * offset / zoom })));
  // Include exact caption-boundary candidates so narrow gaps are not skipped by the search step.
  for (const node of stations.values()) {
    candidates.push({ x: labelX, y: node.internals.positionAbsolute.y - 12 / zoom - 1 });
    candidates.push({ x: labelX, y: node.internals.positionAbsolute.y + 220 + 62 / zoom + 1 });
  }
  candidates.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
  let anchor = candidates.find(candidate => candidate.y * zoom + transform[1] >= 24 && candidate.y * zoom + transform[1] <= canvasHeight - 88 && ![...stations.values()].some(node => {
    const position = node.internals.positionAbsolute;
    return candidate.x + labelWidth / 2 > position.x - 8 && candidate.x - labelWidth / 2 < position.x + (node.measured.width ?? 248) + 8 &&
      candidate.y + 12 / zoom > position.y && candidate.y - 12 / zoom < position.y + 220 + 50 / zoom;
  })) ?? { x: labelX, y: Math.max((24 - transform[1]) / zoom, Math.min((canvasHeight - 88 - transform[1]) / zoom, candidates[0].y)) };
  // The phone zoom rail occupies the right side of the canvas.
  if (canvasWidth < 600 && anchor.x * zoom + transform[0] + labelWidth * zoom / 2 > canvasWidth - 70 && anchor.y * zoom + transform[1] > 65 && anchor.y * zoom + transform[1] < 275) {
    anchor = { ...anchor, y: (canvasHeight - 88 - transform[1]) / zoom };
  }
  return (
    <>
      <path d={path} fill="none" stroke="#111a21" strokeWidth={20} transform="translate(0 5)" pointerEvents="none" />
      <path d={path} fill="none" stroke="#596570" strokeWidth={17} pointerEvents="none" />
      <path d={path} fill="none" stroke="#293640" strokeWidth={13} pointerEvents="none" />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={12}
        className={data?.running ? "builder-edge-running" : ""}
        style={{
          stroke: selected ? "var(--accent)" : data?.label?.startsWith("No") ? "#58d9bf" : "#7abdf1",
          strokeWidth: 2,
        }}
      />
      {data?.label && <path d={`M${x} ${y} L${anchor.x} ${anchor.y}`} stroke="#8295a2" strokeWidth={1 / zoom} opacity=".55" pointerEvents="none" />}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="builder-edge-label glass nodrag nopan"
            title={data.label}
            style={{
              transform: `translate(-50%, -50%) translate(${anchor.x}px,${anchor.y}px) scale(${1 / zoom})`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
