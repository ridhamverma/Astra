"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackRun } from "@/types/simulation-result";
import type { TimelinePlayer } from "@/lib/playback";
import { PLAYBACK_DESIGN } from "@/lib/playback-design";
const ROW_HEIGHT = PLAYBACK_DESIGN.logRowHeight, WINDOW_ROWS = PLAYBACK_DESIGN.logWindowRows, OVERSCAN = PLAYBACK_DESIGN.logOverscan;
export function PlaybackEventLog({ run, player, selected, onSeek, onClose }: {run:PlaybackRun;player:TimelinePlayer;selected:string|null;onSeek:(index:number)=>void;onClose:()=>void}) {
  const [station,setStation] = useState(""), [type,setType] = useState(""), [scroll,setScroll] = useState(0);
  const viewport=useRef<HTMLDivElement>(null);
  const rows=useMemo(()=>run.events.map((event,index)=>({event,index})).filter(({event})=>(!station||event.node_id===station)&&(!type||event.type===type)),[run.events,station,type]);
  const current=useMemo(()=> {let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid].index<player.index)low=mid+1;else high=mid;}return Math.max(0,low-1);},[rows,player.index]);
  useEffect(()=>{if(viewport.current)viewport.current.scrollTop=Math.max(0,(current-2)*ROW_HEIGHT);},[current]);
  const start=Math.max(0,Math.floor(scroll/ROW_HEIGHT)-OVERSCAN);
  const slice=rows.slice(start,start+WINDOW_ROWS+OVERSCAN*2);
  return <aside className="playback-event-log" aria-label="Event log"><header><strong>Event log</strong><button onClick={onClose} aria-label="Close event log">×</button></header>
    <div className="event-log-filters"><label>Station<select aria-label="Station filter" value={station} onChange={e=>setStation(e.target.value)}><option value="">All stations</option>{run.model.nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>Type<select aria-label="Event type" value={type} onChange={e=>setType(e.target.value)}><option value="">All events</option>{[...new Set(run.events.map(e=>e.type))].map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</select></label></div>
    <div className="event-log-viewport" ref={viewport} onScroll={e=>setScroll(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Simulation events">
      <div style={{height:rows.length*ROW_HEIGHT,position:"relative"}}>{slice.map(({event,index},i)=><button key={index} className="event-log-row" aria-current={index===player.index-1?"step":undefined} data-followed={selected===event.entity_id} data-future={index>=player.index} style={{position:"absolute",top:(start+i)*ROW_HEIGHT,height:ROW_HEIGHT}} onClick={()=>onSeek(index)}><span>{event.time.toFixed(2)} min · {event.entity_id}</span><strong>{event.type.replaceAll("_"," ")}</strong><small>{run.model.nodes.find(n=>n.id===event.node_id)?.name??event.node_id}</small></button>)}</div>
      {!rows.length&&<p>No matching events.</p>}
    </div><small>{rows.length.toLocaleString()} events · follows the playback clock</small>
  </aside>;
}
