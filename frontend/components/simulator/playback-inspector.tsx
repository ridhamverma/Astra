import { useMemo } from "react";
import { entityInformation, indexEntityEvents } from "@/lib/playback-information";
import type { TimelinePlayer } from "@/lib/playback";
import type { PlaybackRun } from "@/types/simulation-result";
export function PlaybackInspector({run,player,selected,following,onFollow,onClose}:{run:PlaybackRun;player:TimelinePlayer;selected:string;following:boolean;onFollow:()=>void;onClose:()=>void}){
  const index=useMemo(()=>indexEntityEvents(run.events),[run.events]);
  const info=entityInformation(index.get(selected)??[],player.index,player.time);
  const name=(id:string)=>run.model.nodes.find(n=>n.id===id)?.name??id;
  return <aside className="playback-inspector" aria-label="Entity details"><header><strong>{selected}</strong><button aria-label="Close entity details" onClick={onClose}>×</button></header><span>{info.nodeId?name(info.nodeId):"Not yet arrived"} · {info.status}</span><dl><div><dt>Time in system</dt><dd>{info.inSystem===null?"—":`${info.inSystem.toFixed(2)} min`}</dd></div><div><dt>Total wait</dt><dd>{info.wait.toFixed(2)} min</dd></div><div><dt>Service time</dt><dd>{info.service.toFixed(2)} min</dd></div></dl><p className="entity-route">{info.route.map(name).join(" → ")||"No route yet"}</p><button aria-pressed={following} onClick={onFollow}>{following?"Stop following":"Follow camera"}</button></aside>;
}
