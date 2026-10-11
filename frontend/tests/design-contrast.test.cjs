const test=require('node:test');const assert=require('node:assert/strict');const tokens=require('../styles/astra-tokens.json');
function rgb(hex){return hex.slice(1).match(/../g).map(c=>parseInt(c,16));}
function rgba(value){return value.match(/[\d.]+/g).map(Number);}
function blend(top,bottom){return top.slice(0,3).map((c,i)=>c*top[3]+bottom[i]*(1-top[3]));}
function luminance(color){return color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const mode of ['dark','light'])test(`${mode}: glass text, actions and chart strokes retain contrast`,()=>{
const t=tokens[mode];
for(const underlay of [[0,0,0],[255,255,255]]){
 const surface=blend(rgba(t['glass-specular']),blend(rgba(t['glass-regular-tint']),underlay));
 for(const key of ['text','secondary','muted'])assert.ok(ratio(rgb(t[key]),surface)>=4.5,`${mode} ${key}: ${ratio(rgb(t[key]),surface)}`);
}
assert.ok(ratio(rgb(t['on-accent']),rgb(t.accent))>=4.5);
for(const key of ['chart-queue','chart-completions','chart-utilization','border-strong'])assert.ok(ratio(rgb(t[key]),rgb(t.surface))>=3,`${mode} ${key}`);
});
