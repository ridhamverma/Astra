import type { CSSProperties } from "react";
const paths = {
  recent: "M12 8v4l3 2M4 5v4h4M4.5 9a8 8 0 1 1-.2 6",
  projects: "M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  bell: "M18 8a6 6 0 0 0-12 0v5l-2 4h16l-2-4ZM10 21h4",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  filter: "M3 6h18M6 12h12M9 18h6",
  plus: "M12 4v16M4 12h16",
  arrow: "M5 12h14M14 7l5 5-5 5",
  dots: "M4 12h.01M12 12h.01M20 12h.01",
  logout: "M10 4H4v16h6M10 12h11M17 8l4 4-4 4",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M5 5l14 14M5 19 19 5",
  run: "M8 4v16l12-8Z",
  logIn: "M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
  listOrdered: "M3 6h3v3M3 9h3M3 13c2-2 3 0 0 2h3M3 18h3l-3 3h3M10 6h11M10 12h11M10 18h11",
  users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  split: "M3 12h6m0 0 6-6m-6 6 6 6M15 6h6M15 18h6M18 3l3 3-3 3M18 15l3 3-3 3",
  timer: "M10 2h4M12 14l4-4M12 14v.01M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 6V4",
  circleCheck: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  chevronsLeft: "m18 17-5-5 5-5M11 17l-5-5 5-5",
  chevronsRight: "m6 17 5-5-5-5M13 17l5-5-5-5",
} as const;
export type IconName = keyof typeof paths;
const nodeIconNames: IconName[] = ["logIn", "listOrdered", "users", "split", "timer", "circleCheck", "chevronsLeft", "chevronsRight"];
export function Icon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "dots" ? 4 : nodeIconNames.includes(name) ? 1.75 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
