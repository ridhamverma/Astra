/** Presentation-only 30° projection. Canonical model positions remain in floor space. */
export interface FloorPoint { x: number; y: number }
const COS = Math.sqrt(3) / 2;
const SCENE_SCALE = 1;
export function projectFloor(point: FloorPoint): FloorPoint {
  return { x: (point.x - point.y) * COS * SCENE_SCALE, y: (point.x + point.y) * .5 * SCENE_SCALE };
}
export function unprojectFloor(point: FloorPoint): FloorPoint {
  return { x: (point.x / COS + point.y * 2) / (2 * SCENE_SCALE), y: (point.y * 2 - point.x / COS) / (2 * SCENE_SCALE) };
}
/** Orient existing left-to-right layouts across the floor, preserving their relative arrangement. */
export function projectModelPosition(point: FloorPoint): FloorPoint {
  return projectFloor({ x: point.x * COS + point.y * .5, y: -point.x * .5 + point.y * COS });
}
export function unprojectModelPosition(point: FloorPoint): FloorPoint {
  const floor = unprojectFloor(point);
  return { x: floor.x * COS - floor.y * .5, y: floor.x * .5 + floor.y * COS };
}
/** Route elbows are laid out on the floor, then projected together with their endpoints. */
export function isometricRoute({ sourceX, sourceY, targetX, targetY }: { sourceX: number; sourceY: number; targetX: number; targetY: number }) {
  const a = unprojectFloor({ x: sourceX, y: sourceY });
  const b = unprojectFloor({ x: targetX, y: targetY });
  const mid = (a.x + b.x) / 2;
  const points = [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b].map(projectFloor);
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(18, before / 2, after / 2);
    const enter = { x: corner.x + (previous.x - corner.x) * (before ? radius / before : 0), y: corner.y + (previous.y - corner.y) * (before ? radius / before : 0) };
    const leave = { x: corner.x + (next.x - corner.x) * (after ? radius / after : 0), y: corner.y + (next.y - corner.y) * (after ? radius / after : 0) };
    path += ` L ${enter.x} ${enter.y} Q ${corner.x} ${corner.y} ${leave.x} ${leave.y}`;
  }
  path += ` L ${points[3].x} ${points[3].y}`;
  const label = projectFloor({ x: mid, y: (a.y + b.y) / 2 });
  return { path, ...label };
}
export function stationSlot(slot: number): FloorPoint {
  // Six distinct places on the front half of the same projected station platform.
  return stationPoint(-38 + slot * 15, 24);
}
export function stationPoint(x: number, y: number, z = 0): FloorPoint {
  return { x: 124 + (x - y) * COS, y: 142 + (x + y) * .5 - z };
}
