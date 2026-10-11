import type { SimulationModel } from "@/types/simulation";
import { NODE_DEFINITIONS } from "@/lib/simulation-editor";
export function ModelThumbnail({model}:{model:SimulationModel}) {
 const maxX=Math.max(...model.nodes.map(n=>n.position.x))+248;
 const minY=Math.min(...model.nodes.map(n=>n.position.y));
 const maxY=Math.max(...model.nodes.map(n=>n.position.y))+112;
 const points=new Map(model.nodes.map(n=>[n.id,n.position]));
 return <svg viewBox={`-40 ${minY-100} ${maxX+80} ${maxY-minY+240}`} role="img" aria-label={`${model.name}: ${model.nodes.map(n=>n.name).join(" → ")}`} style={{width:"100%",height:"100%"}}>{model.edges.map(e=>{const a=points.get(e.source),b=points.get(e.target);if(!a||!b)return null;const x=a.x+248,y=a.y+56,mid=(x+b.x)/2;return <path key={e.id} d={`M${x},${y} H${mid} V${b.y+56} H${b.x}`} fill="none" stroke="var(--a-edge)" strokeWidth="6"/>;})}{model.nodes.map(n=><g key={n.id}><rect x={n.position.x} y={n.position.y} width="248" height="112" rx={n.type==="source"||n.type==="sink"?48:20} fill="var(--a-surface)" stroke={NODE_DEFINITIONS[n.type].accent} strokeWidth="6"/><text x={n.position.x+124} y={n.position.y+68} textAnchor="middle" fill="var(--a-text)" fontSize="36" fontFamily="var(--font-sans),sans-serif">{NODE_DEFINITIONS[n.type].label}</text></g>)}</svg>;
}
