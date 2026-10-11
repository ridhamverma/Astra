const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const out={};modules.set(name,out);const source=fs.readFileSync(path.join(__dirname,'..',name),'utf8');new Function('exports','require',ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,p=>p.startsWith('@/')?load(p.slice(2)+'.ts'):require(p));return out;}
const {PlaybackButtons}=load('components/simulator/playback-buttons.tsx'),{PlaybackTimeline}=load('components/simulator/playback-timeline.tsx');
test('one toggle exposes Play, Pause, Replay and retains functional event controls',async()=>{
 let root,toggles=0,direction=0;
 const props={playing:false,finished:false,disabled:false,canPrevious:false,canNext:true,onToggle:()=>toggles++,onReset:()=>{},onStep:d=>direction=d};
 await act(()=>{root=create(React.createElement(PlaybackButtons,props));});
 assert.equal(root.root.findAllByProps({'aria-label':'Play'}).length,1);assert.equal(root.root.findByProps({'aria-label':'Previous event'}).props.disabled,true);
 await act(()=>root.root.findByProps({'aria-label':'Play'}).props.onClick());assert.equal(toggles,1);
 await act(()=>root.update(React.createElement(PlaybackButtons,{...props,playing:true})));assert.equal(root.root.findAllByProps({'aria-label':'Pause'}).length,1);assert.equal(root.root.findAllByProps({'aria-label':'Play'}).length,0);
 await act(()=>root.root.findByProps({'aria-label':'Next event'}).props.onClick());assert.equal(direction,1);
 await act(()=>root.update(React.createElement(PlaybackButtons,{...props,finished:true})));assert.equal(root.root.findAllByProps({'aria-label':'Replay'}).length,1);await act(()=>root.unmount());
});
test('scrubber exposes exact slider semantics and resumes only a drag started while playing',async()=>{
 let root,seek=-1,resume=false;const props={events:[],duration:24,time:9.97,index:107,playing:true,onSeek:t=>seek=t,onDragEnd:r=>resume=r};
 await act(()=>{root=create(React.createElement(PlaybackTimeline,props));});
 const slider=root.root.findByProps({role:'slider'});
 assert.equal(slider.props['aria-valuenow'],9.97);assert.equal(slider.props['aria-valuetext'],'9.97 of 24 minutes, event 107 of 0');
 await act(()=>slider.props.onPointerDown({pointerId:1,currentTarget:{setPointerCapture(){}}}));assert.equal(seek,9.97);
 await act(()=>slider.props.onChange({currentTarget:{valueAsNumber:4}}));assert.equal(seek,4);await act(()=>slider.props.onPointerUp());assert.equal(resume,true);await act(()=>root.unmount());
});
