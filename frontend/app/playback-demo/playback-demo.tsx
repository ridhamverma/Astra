"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SimulationPlayback } from "@/components/simulator/playback";
import type { PlaybackRun } from "@/types/simulation-result";
import fixture from "@/dev/clinic-playback.json";
import stress from "@/dev/stress-playback.json";
export function PlaybackDemo({initialState="ready",scenario}:{initialState?:string;scenario?:string}) {
  const router = useRouter();
  const [state,setState]=useState(initialState);
  const source: PlaybackRun = scenario === "stress" ? stress as PlaybackRun : fixture as PlaybackRun;
  const run = state === "empty" ? null : state === "zero" ? {...source,events:[]} : source;
  return <div className="astra-workspace astra-builder-workspace astra-builder-screen workspace-shell workspace-page-screen" data-view="playback"><main className="builder-body workspace-pages"><SimulationPlayback run={run} visible loading={state === "loading"} error={state === "error" ? "Could not load the selected run." : undefined} stale={state === "stale"} onRetry={()=>setState("ready")} onCreate={()=>router.push("/simulator")} /></main></div>;
}
