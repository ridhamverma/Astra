"use client";
import { useEffect, useSyncExternalStore } from "react";
const EVENT = "astra-appearance-change";
function subscribe(callback: () => void) { window.addEventListener(EVENT, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); }; }
function read(key: string, fallback: string) { try { return localStorage.getItem(`astra-${key}`) ?? fallback; } catch { return fallback; } }
function write(key: string, value: string) { try { localStorage.setItem(`astra-${key}`, value); } catch { /* The current session remains usable without storage. */ } document.documentElement.setAttribute(`data-astra-${key}`, value); window.dispatchEvent(new Event(EVENT)); }
export function AppearanceRuntime() {
  useEffect(() => {
    const apply = () => { for (const [key, fallback] of [["theme","dark"],["transparency","glass"],["contrast","normal"],["motion","full"]]) document.documentElement.setAttribute(`data-astra-${key}`, read(key, fallback)); };
    apply(); window.addEventListener("storage", apply);
    let frame = 0; let active: HTMLElement | null = null;
    const point = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.astraMotion === "reduce") return;
      const panel = (event.target as HTMLElement).closest<HTMLElement>(".glass,.astra-glass");
      if (!panel || panel.closest(".react-flow__node")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (active && active !== panel) { active.style.removeProperty("--pointer-x");active.style.removeProperty("--pointer-y"); } const rect = panel.getBoundingClientRect();panel.style.setProperty("--pointer-x",`${event.clientX-rect.left}px`);panel.style.setProperty("--pointer-y",`${event.clientY-rect.top}px`);active = panel; });
    };
    document.addEventListener("pointermove",point,{passive:true});
    return () => { cancelAnimationFrame(frame);document.removeEventListener("pointermove",point);window.removeEventListener("storage",apply); };
  }, []);
  return null;
}
export function AppearanceSettings() {
  const theme = useSyncExternalStore(subscribe, () => read("theme","dark"), () => "dark");
  const transparency = useSyncExternalStore(subscribe, () => read("transparency","glass"), () => "glass");
  const contrast = useSyncExternalStore(subscribe, () => read("contrast","normal"), () => "normal");
  const motion = useSyncExternalStore(subscribe, () => read("motion","full"), () => "full");
  return <section className="astra-preferences" aria-label="Appearance and accessibility"><h2>Appearance</h2><label>Theme<select value={theme} onChange={e=>write("theme",e.target.value)}><option value="dark">Astra dark</option><option value="light">Warm light</option></select></label><label>Reduce transparency<input type="checkbox" checked={transparency==="solid"} onChange={e=>write("transparency",e.target.checked?"solid":"glass")} /></label><label>Increase contrast<input type="checkbox" checked={contrast==="more"} onChange={e=>write("contrast",e.target.checked?"more":"normal")} /></label><label>Reduce motion<input type="checkbox" checked={motion==="reduce"} onChange={e=>write("motion",e.target.checked?"reduce":"full")} /></label><p className="astra-trust-note">Saved on this device. Your system’s accessibility preferences also apply.</p></section>;
}
