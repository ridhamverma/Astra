import { getSmoothStepPath, type Position } from "@xyflow/react";

interface EdgeCoordinates {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}
/** Preserve user positions. Short legacy gaps take a raised route, keeping its midpoint pill clear of cards. */
export function builderEdgeGeometry(points: EdgeCoordinates): {
  path: string;
  x: number;
  y: number;
} {
  const { sourceX } = points;
  const gap = points.targetX - sourceX;
  if (
    gap > -32 &&
    gap < 96 &&
    Math.abs(points.targetY - points.sourceY) < 160
  ) {
    const top = Math.min(points.sourceY, points.targetY) - 84;
    const available = Math.max(8, gap);
    const x1 = sourceX + Math.min(4, available * 0.2),
      x2 = points.targetX - Math.min(8, available * 0.65);
    const r = Math.max(0.5, Math.min(12, (x2 - x1) / 2));
    const end = points.targetX - Math.min(6, available * 0.5);
    const path = `M ${sourceX} ${points.sourceY} L ${x1 - r} ${points.sourceY} Q ${x1} ${points.sourceY} ${x1} ${points.sourceY - r} L ${x1} ${top + r} Q ${x1} ${top} ${x1 + r} ${top} L ${x2 - r} ${top} Q ${x2} ${top} ${x2} ${top + r} L ${x2} ${points.targetY - r} Q ${x2} ${points.targetY} ${x2 + r} ${points.targetY} L ${end} ${points.targetY}`;
    return { path, x: (x1 + x2) / 2, y: top };
  }
  const [path, x, y] = getSmoothStepPath({
    ...points,
    sourceX: sourceX + 8,
    targetX: points.targetX - 8,
    borderRadius: 12,
    offset: 28,
  });
  return { path, x, y };
}
