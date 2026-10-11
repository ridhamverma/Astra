import type { ConnectionLineComponentProps } from "@xyflow/react";
import { isometricRoute } from "@/lib/isometric";
export function IsometricConnection({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const { path } = isometricRoute({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY });
  return <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="6 5" />;
}
