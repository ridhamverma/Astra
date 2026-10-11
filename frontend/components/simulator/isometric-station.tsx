import type { NodeKind } from "@/lib/simulation-editor";
import { stationPoint } from "@/lib/isometric";

const point = (x: number, y: number, z = 0) => { const p = stationPoint(x,y,z); return `${p.x},${p.y}`; };
function Box({ x, y, w, d, h, color = "#477caa" }: { x: number; y: number; w: number; d: number; h: number; color?: string }) {
  return <g stroke="#b6c6d0" strokeOpacity=".25" strokeLinejoin="round">
    <polygon points={[point(x,y,h),point(x+w,y,h),point(x+w,y+d,h),point(x,y+d,h)].join(" ")} fill={color} />
    <polygon points={[point(x,y+d,h),point(x+w,y+d,h),point(x+w,y+d),point(x,y+d)].join(" ")} fill={color} style={{ filter:"brightness(.65)" }} />
    <polygon points={[point(x+w,y,h),point(x+w,y+d,h),point(x+w,y+d),point(x+w,y)].join(" ")} fill={color} style={{ filter:"brightness(.45)" }} />
  </g>;
}
function Rail({ x, y, length, axis = "x" }: { x:number; y:number; length:number; axis?:"x"|"y" }) {
  const end = axis === "x" ? [x+length,y] : [x,y+length];
  return <g stroke="#e7af4d" strokeWidth="3" strokeLinecap="round"><path d={`M${point(x,y)} L${point(x,y,30)} L${point(end[0],end[1],30)} L${point(end[0],end[1])}`} /><path d={`M${point(x,y,15)} L${point(end[0],end[1],15)}`} strokeWidth="1.5" opacity=".6" /></g>;
}
export function IsometricStation({ kind, resources = 1, occupiedSlots = [] }: { kind: NodeKind; resources?: number; occupiedSlots?: number[] }) {
  const portal = kind === "source" || kind === "sink";
  return <svg className="isometric-miniature" viewBox="0 0 248 220" fill="none" aria-hidden="true">
    <ellipse cx="124" cy="175" rx="102" ry="32" fill="#000" opacity=".28" />
    <Box x={-62} y={-54} w={124} d={108} h={8} color="#81919c" />
    <polygon points={[point(-55,-47,9),point(55,-47,9),point(55,47,9),point(-55,47,9)].join(" ")} fill="#3b4853" stroke="#a8b5bb" strokeOpacity=".35" />
    {portal && <g>
      <Box x={-44} y={-38} w={12} d={76} h={86} color="#6b8190" />
      <Box x={-44} y={-38} w={12} d={6} h={86} color="#a6b3bb" />
      <polygon points={[point(-31,-32,77),point(-31,32,77),point(-31,32,10),point(-31,-32,10)].join(" ")} fill="#153f42" stroke="#55d6be" strokeWidth="2" />
      <g transform={`translate(${point(-30,0,45).replace(","," ")}) skewY(-30)`}>
        {kind === "source" ? <path d="M-19 0H16M5-12 17 0 5 12" stroke="#64e2cf" strokeWidth="7" /> : <g stroke="#eef8f5" strokeWidth="2"><path d="M-14 20V-20M-14-19H14V0H-14" />{[0,1,2].flatMap(i => [0,1].map(j => (i+j)%2===0 && <rect key={`${i}-${j}`} x={-13+i*9} y={-18+j*9} width="9" height="9" fill="#eef8f5" stroke="none" />))}</g>}
      </g>
      <path d={`M${point(-15,0,10)} L${point(36,0,10)}`} stroke="#5ce0cb" strokeWidth="4" />
    </g>}
    {kind === "process" && <g>
      <Box x={-38} y={-32} w={63} d={46} h={68} color="#5795ca" />
      <Box x={-30} y={-27} w={48} d={36} h={76} color="#b4c5d0" />
      <Box x={-25} y={15} w={48} d={25} h={26} color="#8999a5" />
      <polygon points={[point(-24,15,56),point(8,15,56),point(8,15,29),point(-24,15,29)].join(" ")} fill="#182c3e" stroke="#73bfee" />
      {Array.from({length:Math.min(resources,6)},(_,i) => <circle key={i} cx={stationPoint(-30+i*10,41,28).x} cy={stationPoint(-30+i*10,41,28).y} r="2.8" fill={occupiedSlots.includes(i) ? "#edb755" : "#5cddc8"} />)}
    </g>}
    {(kind === "queue" || kind === "delay") && <g>
      <Rail x={-49} y={-37} length={95} /><Rail x={-49} y={-37} length={74} axis="y" /><Rail x={46} y={-37} length={74} axis="y" />
      {kind === "queue" ? [-24,0,24].map(x => <Box key={x} x={x} y={-16} w={14} d={16} h={18} color="#b48b50" />) : <g transform={`translate(${point(0,-28,54).replace(","," ")})`}><path d="M0 30V48" stroke="#72808c" strokeWidth="6" /><circle r="24" fill="#27323c" stroke="#8395a2" strokeWidth="2" /><circle r="15" stroke="#edf3f5" strokeWidth="2" /><path d="M0-10V0L7-5M-4-29H4M0-29V-24" stroke="#edb755" strokeWidth="3" /></g>}
    </g>}
    {kind === "decision" && <g strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${point(-42,0,12)} L${point(0,0,12)} L${point(0,-33,12)} L${point(38,-33,12)}`} stroke="#7abdf1" />
      <path d={`M${point(0,0,12)} L${point(0,33,12)} L${point(38,33,12)}`} stroke="#58d9bf" />
      {[-33,33].map(y => <path key={y} d={`M${point(28,y-7,12)} L${point(38,y,12)} L${point(28,y+7,12)}`} stroke={y<0 ? "#7abdf1" : "#58d9bf"} />)}
    </g>}
  </svg>;
}
