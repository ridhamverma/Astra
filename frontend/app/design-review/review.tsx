"use client";
import { useState } from "react";
import { SimulationPlayback } from "@/components/simulator/playback";
import { AnalyticsDashboard } from "@/components/simulator/analytics-dashboard";
import { AppearanceSettings } from "@/components/design/preferences";
import { RunSetup } from "@/components/design/run-setup";
import type { PlaybackRun } from "@/types/simulation-result";
import data from "./fixture.json";
const run=data as PlaybackRun;
export function Review(){const [view,setView]=useState("playback");const [settings,setSettings]=useState(run.model.simulation);return <div className="astra-workspace astra-builder-workspace astra-builder-screen workspace-shell workspace-page-screen" data-view={view}><header className="astra-workspace-header glass"><div><strong style={{fontSize:20}}>Astra</strong><span style={{marginLeft:24}}>Bank · measured demonstration</span></div><nav className="builder-project-tabs" aria-label="Review views">{["playback","analytics","appearance"].map(v=><button key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v}</button>)}</nav><RunSetup settings={settings} disabled={false} stage="idle" onChange={setSettings} onRun={()=>setView("analytics")}/></header><main className="builder-body workspace-pages">{view==="playback"&&<SimulationPlayback run={run} visible/>}{view==="analytics"&&<AnalyticsDashboard run={run} nodes={run.model.nodes} stale={false} onViewBottleneck={()=>setView("playback")} loading={false}/>} {view==="appearance"&&<AppearanceSettings/>}</main></div>;}
