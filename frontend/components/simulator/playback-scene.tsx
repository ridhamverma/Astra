"use client";
import { createContext, useCallback, useContext, useEffect, useState, useRef, useMemo, memo, type ReactNode } from "react";
import { ViewportPortal, useViewport, useReactFlow, useStore, type EdgeProps } from "@xyflow/react";
import { BuilderEdge } from "./builder-edge";
import { isometricRoute } from "@/lib/isometric";
import { AnimatedPerson, updatePersonPose } from "./animated-person";
import type { PlaybackTheme } from "./station-visuals";
import { stationPosition, playbackLayout, sampleSceneJourney, cacheScenePath } from "@/lib/playback-layout";
import type { PlaybackClock } from "@/lib/playback-clock";
import { PLAYBACK_DESIGN } from "@/lib/playback-design";
import { MARKER_LIMIT, type TimelinePlayer } from "@/lib/playback";
import type { EditorEdge } from "@/lib/simulation-editor";
import type { PlaybackRun } from "@/types/simulation-result";

const Paths = createContext<{ paths: Map<string, SVGPathElement>; register: (id: string, path: SVGPathElement | null) => void }>({ paths: new Map(), register: () => {} });
export function PlaybackPaths({ children }: { children: ReactNode }) {
  const [paths, setPaths] = useState(new Map<string, SVGPathElement>());
  const register = useCallback((id: string, path: SVGPathElement | null) => setPaths(old => {
    if (old.get(id) === path || (!path && !old.has(id))) return old;
    const next = new Map(old); if (path) next.set(id, path); else next.delete(id); return next;
  }), []);
  return <Paths.Provider value={{ paths, register }}>{children}</Paths.Provider>;
}
export const PlaybackEdge = memo(function PlaybackEdge(props: EdgeProps<EditorEdge>) {
  const { register } = useContext(Paths), { zoom } = useViewport();
  const { path } = isometricRoute(props);
  const ref = useCallback((element: SVGPathElement | null) => {
    // Ref identity follows geometry so cached samples refresh after drag or reflow.
    if (element && element.getAttribute("d") !== path) return;
    register(props.id, element);
  }, [register, props.id, path]);
  return <><BuilderEdge {...props} /><path ref={ref} d={path} fill="none" stroke="none" pointerEvents="none" />
    {(props.data?.playbackActive || props.data?.playbackFollowed) && <path d={path} fill="none" stroke={props.data.playbackFollowed ? "var(--scene-service)" : "var(--scene-transfer)"} strokeWidth={3 / zoom} opacity=".8" pointerEvents="none" />}

  </>;
});
export function PlaybackPeople({ run, player, theme, selected, onSelect, following, onStopFollowing, clock, reducedMotion }: { run: PlaybackRun; player: TimelinePlayer; theme: PlaybackTheme; selected: string | null; onSelect: (id: string | null) => void; following: boolean; onStopFollowing: () => void; clock: PlaybackClock; reducedMotion: boolean }) {
  const { paths } = useContext(Paths);
  const { zoom } = useViewport();
  const measuredPaths = useMemo(() => new Map([...paths].map(([id, path]) => [id, cacheScenePath(path)])), [paths]);
  const lastMotionUpdate = useRef(0);
  const personElements = useRef(new Map<string, HTMLDivElement>());
  const flow = useReactFlow();
  const width = useStore(s => s.width), height = useStore(s => s.height);
  const lastFollow = useRef(0);
  const Person = theme.Person ?? AnimatedPerson;
  const locatePeople = useCallback(() => {
  const { journeys, slots } = playbackLayout(player, run.model.nodes, reducedMotion);
  const travelling = new Set<string>();
  const people: { id: string; x: number; y: number; facing: number; state: "walking" | "standing" | "waiting" | "serving" }[] = [];
  for (const journey of journeys) {
    // Sample the actual rendered SVG curves; bridge station interiors between hops.
    const routePaths = journey.legs.map(leg => {
      const edge = run.model.edges.find(e => e.source === leg.source && e.target === leg.target);
      return edge ? measuredPaths.get(edge.id) : undefined;
    });
    if (routePaths.some(path => !path)) continue;
    const source = run.model.nodes.find(n => n.id === journey.legs[0].source);
    const target = run.model.nodes.find(n => n.id === journey.legs[journey.legs.length - 1].target);
    if (!source || !target) continue;
    const destination = slots.find(s => s.entity.id === journey.id);
    const sourcePoint = stationPosition(0), targetPoint = stationPosition(destination?.slot ?? 0);
    const point = sampleSceneJourney(
      routePaths.map(route => route!),
      { x: source.position.x + (source.type === "source" ? 124 : sourcePoint.x), y: source.position.y + sourcePoint.y },
      { x: target.position.x + (target.type === "sink" ? 124 : targetPoint.x), y: target.position.y + targetPoint.y },
      journey.totalProgress,
    );
    travelling.add(journey.id);
    people.push({ id: journey.id, x: point.x, y: point.y, facing: point.facing, state: "walking" });
  }
  for (const { entity, slot } of slots) {
    if (travelling.has(entity.id) || people.length >= MARKER_LIMIT) continue;
    const node = run.model.nodes.find(n => n.id === entity.nodeId);
    if (!node) continue;
    const point = stationPosition(slot);
    people.push({ id: entity.id, x: node.position.x + point.x, y: node.position.y + point.y, facing: 1, state: entity.state === "present" ? "standing" : entity.state });
  }
  return people;
  }, [player, run.model.nodes, run.model.edges, measuredPaths, reducedMotion]);
  const people = locatePeople();
  useEffect(() => {
    const update = (force = false) => {
      const now = performance.now();
      // At overview zoom, a 30 Hz position layer avoids repainting subpixel details.
      // The authoritative clock still advances every frame; seeks always paint immediately.
      if (!force && zoom < PLAYBACK_DESIGN.motionDetailZoom && now - lastMotionUpdate.current < PLAYBACK_DESIGN.distantFrameMs) return;
      lastMotionUpdate.current = now;
      for (const person of locatePeople()) {
      const element = personElements.current.get(person.id);
      if (!element) continue;
      element.style.transform = `translate3d(${person.x - 22 / zoom}px,${person.y - 66}px,0)`;
      updatePersonPose(element, player.time, person.facing, person.state === "walking" && !reducedMotion && zoom >= PLAYBACK_DESIGN.motionDetailZoom);
    } };
    update(true); return clock.subscribe(() => update(clock.forced));
  }, [clock, locatePeople, player, reducedMotion, zoom]);
  const followed = people.find(p => p.id === selected);
  useEffect(() => {
    if (!following || !followed || performance.now() - lastFollow.current < PLAYBACK_DESIGN.followIntervalMs) return;
    const viewport = flow.getViewport(), sx = followed.x * viewport.zoom + viewport.x, sy = followed.y * viewport.zoom + viewport.y;
    if (sx < width * .2 || sx > width * .8 || sy < height * .2 || sy > height * .8) {
      lastFollow.current = performance.now();
      void flow.setCenter(followed.x, followed.y, { zoom: viewport.zoom, duration: 0 });
    }
  }, [following, followed, flow, width, height]);
  useEffect(() => {
    if (!following) return;
    // Manual pointer navigation always yields control back to the user.
    const stop = () => onStopFollowing();
    const element = document.querySelector(".playback-graph");
    element?.addEventListener("wheel", stop, { passive: true });
    return () => element?.removeEventListener("wheel", stop);
  }, [following, onStopFollowing]);
  return <>
    <ViewportPortal><div className="astra-playback-overlay" role="group" aria-label="People in the simulation">
      {people.slice(0, MARKER_LIMIT).map(person => <div ref={element => { if (element) personElements.current.set(person.id, element); else personElements.current.delete(person.id); }} data-state={person.state} key={person.id} style={{width:44/zoom,height:Math.max(104,44/zoom),transform:`translate3d(${person.x - 22 / zoom}px,${person.y - 66}px,0)`}} className={`playback-person nodrag nopan ${selected === person.id ? "is-selected" : ""}`} data-dimmed={!!selected && selected !== person.id} role="button" tabIndex={0} aria-label={`Inspect ${person.id}, ${person.state}`} onClick={(event) => { event.stopPropagation(); onSelect(person.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(person.id); } }}>
        <svg width={44/zoom} height={Math.max(104,44/zoom)} style={{overflow:"visible"}} aria-hidden="true"><g transform={`translate(${22/zoom},66)`}><title>{person.id} · {person.state}</title>
        <rect x={-22/zoom} y="-66" width={44/zoom} height={Math.max(104,44/zoom)} rx="12" fill="transparent" />
        {selected === person.id && <ellipse cy="4" rx="16" ry="5" fill="none" stroke="var(--accent)" strokeWidth="2" />}
        <path className="person-status" transform="translate(14,-25)" d={person.state === "walking" ? "M-5 7L5 10-5 13Z" : person.state === "waiting" ? "M-5 10a5 3 0 1 0 10 0a5 3 0 1 0-10 0" : "M-3 10a3 2 0 1 0 6 0a3 2 0 1 0-6 0"} strokeWidth="1.5" />
        <Person id={person.id} state={person.state} facing={person.facing < 0 ? -1 : 1} time={0} reducedMotion={reducedMotion} detail={zoom >= .65} />
        {zoom >= .8 && selected === person.id && <text className="person-label" style={{fontSize: 10 / zoom}} y={18 / zoom} textAnchor="middle">{person.id}</text>}
      </g></svg></div>)}
    </div></ViewportPortal>

  </>;
}
