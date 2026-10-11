import { memo, type CSSProperties } from "react";

export interface PersonAppearance { skin: string; hair: string; shirt: string; trousers: string; }
export function personAppearance(id: string): PersonAppearance {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return { skin: ["#e8b591", "#b97854", "#81513c", "#f2cbb0"][hash % 4], hair: ["#302a35", "#583d30", "#93857a"][hash % 3], shirt: ["#79abae", "#9993c6", "#d3a27c", "#789cc2"][(hash >>> 5) % 4], trousers: "#39495c" };
}

/** Articulated SVG; pose comes exclusively from the shared simulation clock. */
export const AnimatedPerson = memo(function AnimatedPerson({ id, state, time, facing = 1, reducedMotion = false, detail = true, appearance = personAppearance(id) }: {
  id: string; state: "walking" | "standing" | "waiting" | "serving"; time: number;
  facing?: number; reducedMotion?: boolean; detail?: boolean; appearance?: PersonAppearance;
}) {
  const walk = state === "walking" && !reducedMotion;
  const phase = time * Math.PI * 8;
  const swing = walk ? Math.sin(phase) * 25 : 0;
  const bob = walk ? Math.abs(Math.sin(phase)) * -1.4 : 0;
  const arm = state === "serving" ? -26 : state === "waiting" ? -8 : swing;
  const { skin, hair, shirt, trousers } = appearance;
  const limb = (x: number, angle: number, leg: boolean, back: boolean) => {
    const bend = walk ? (leg ? Math.max(0, -angle) * 1.2 : 12 + Math.abs(angle) * .35) : leg ? 0 : state === "serving" ? -45 : 8;
    return <g data-person-limb={`${leg ? "leg" : "arm"}-${back ? "back" : "front"}`} transform={`translate(${x},${leg ? -20 : -39}) rotate(${angle})`} opacity={back ? 0.8 : 1}>
      <path d="M0 0V9" fill="none" stroke={leg ? trousers : shirt} strokeWidth={leg ? 6 : 5} strokeLinecap="round" />
      <g transform={`translate(0,9) rotate(${bend})`}>
        <path d={leg ? "M0 0V9" : "M0 0V6"} fill="none" stroke={leg ? trousers : shirt} strokeWidth={leg ? 5 : 4} strokeLinecap="round" />
        <g transform={`translate(0,${leg ? 9 : 6}) rotate(${-angle * .45})`}>
          {leg ? <path d="M-3 0 Q0-2 3 0 L6 2 Q7 4 3 4 H-3Z" fill="#222c3c" /> : <ellipse cy="1" rx="2.6" ry="3" fill={skin} />}
        </g>
      </g>
    </g>;
  };
  return <g data-person={id} data-pose={state} style={{ "--person-shirt": shirt } as CSSProperties}>
    <ellipse cy="3" rx="12" ry="3" fill="currentColor" opacity="0.12" />
    <g data-person-body transform={`scale(${facing < 0 ? -1 : 1},1) translate(0,${bob})`}>
      {limb(-4, -swing, true, true)}{limb(-7, -arm, false, true)}
      <path d="M-7-42 Q0-46 7-42 L8-23 Q0-19-8-23Z" fill={shirt} />
      <path d="M-5-23 H5" stroke={trousers} strokeWidth="3" />
      <path d="M-2-44 V-48 H3 V-43" fill={skin} />
      <ellipse cy="-53" rx="8" ry="9" fill={skin} />
      <path d="M-8-51 Q-11-65 1-64 Q10-63 8-53 L5-57 Q0-54-6-58Z" fill={hair} />
      <ellipse cx="7" cy="-52" rx="2" ry="2.5" fill={skin} />
      {detail && <g className="person-detail"><path d="M1-53h1m3 0h1" stroke="#302a35" strokeWidth="1.3" strokeLinecap="round" /><path d="M2-48q2 1 4-1" stroke="#875748" fill="none" strokeLinecap="round" /><path d="M-3-41l3 4 3-4" stroke="#ffffff" opacity=".5" fill="none" /></g>}
      {limb(4, swing, true, false)}{limb(7, arm, false, false)}
    </g>
  </g>;
});

const poseParts = new WeakMap<HTMLDivElement, { body: SVGGElement | null; limbs: SVGGElement[] }>();
/** Shared-clock imperative pose updates avoid reconciling each SVG on every frame. */
export function updatePersonPose(root: HTMLDivElement, time: number, facing: number, walking: boolean) {
  let parts = poseParts.get(root);
  if (!parts) { parts = { body: root.querySelector("[data-person-body]"), limbs: Array.from(root.querySelectorAll("[data-person-limb]")) }; poseParts.set(root, parts); }
  if (!walking) return;
  const swing = Math.sin(time * Math.PI * 8) * 25, bob = Math.abs(Math.sin(time * Math.PI * 8)) * -1.4;
  parts.body?.setAttribute("transform", `scale(${facing < 0 ? -1 : 1},1) translate(0,${bob})`);
  for (const limb of parts.limbs) {
    const leg = limb.dataset.personLimb?.startsWith("leg"), back = limb.dataset.personLimb?.endsWith("back");
    const angle = back ? -swing : swing, x = (leg ? 4 : 7) * (back ? -1 : 1);
    limb.setAttribute("transform", `translate(${x},${leg ? -20 : -39}) rotate(${angle})`);
    limb.children[1]?.setAttribute("transform", `translate(0,9) rotate(${leg ? Math.max(0, -angle) * 1.2 : 12 + Math.abs(angle) * .35})`);
    limb.children[1]?.children[1]?.setAttribute("transform", `translate(0,${leg ? 9 : 6}) rotate(${-angle * .45})`);
  }
}
