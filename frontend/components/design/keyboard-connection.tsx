"use client";
import { useState } from "react";
import type { Connection } from "@xyflow/react";
import type { EditorNode } from "@/lib/simulation-editor";
export function KeyboardConnection({source,nodes,disabled,onConnect}:{source:EditorNode;nodes:EditorNode[];disabled:boolean;onConnect:(connection:Connection)=>void}){
 const [target,setTarget]=useState("");const [route,setRoute]=useState("yes");
 if(source.type==="sink")return null;
 return <fieldset style={{border:0,padding:0,margin:"24px 0 0"}} disabled={disabled}><legend style={{fontWeight:600}}>Connect a block</legend>{source.type==="decision"&&<label className="astra-property-field"><span>Decision route</span><select value={route} onChange={e=>setRoute(e.target.value)}><option value="yes">Yes route</option><option value="no">No route</option></select></label>}<label className="astra-property-field"><span>Destination</span><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose a block</option>{nodes.filter(n=>n.id!==source.id&&n.type!=="source").map(n=><option key={n.id} value={n.id}>{n.data.name}</option>)}</select></label><button className="builder-secondary" disabled={!target||disabled} onClick={()=>onConnect({source:source.id,target,sourceHandle:source.type==="decision"?route:"source-right",targetHandle:"target-left"})}>Connect</button><p className="astra-trust-note">Connections use the same validation as dragging a port.</p></fieldset>;
}
