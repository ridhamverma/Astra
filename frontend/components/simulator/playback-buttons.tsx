import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

export function PlaybackButtons({playing,finished,disabled,canPrevious,canNext,onToggle,onReset,onStep}:{playing:boolean;finished:boolean;disabled:boolean;canPrevious:boolean;canNext:boolean;onToggle:()=>void;onReset:()=>void;onStep:(direction:-1|1)=>void}) {
  const label = finished ? "Replay" : playing ? "Pause" : "Play";
  return <div className="playback-buttons">
    <button className="playback-icon-button playback-reset" onClick={onReset} aria-label="Reset" title="Reset"><RotateCcw size={18} aria-hidden="true" /></button>
    <span className="playback-transport-divider" aria-hidden="true" />
    <button className="playback-icon-button" onClick={()=>onStep(-1)} disabled={!canPrevious} aria-label="Previous event" title="Previous event (Left)"><SkipBack size={18} aria-hidden="true" /></button>
    <button className="playback-icon-button playback-toggle" disabled={disabled} onClick={onToggle} aria-label={label} aria-pressed={playing} title={label}>{playing ? <Pause size={22} fill="currentColor" aria-hidden="true" /> : <Play size={22} fill="currentColor" aria-hidden="true" />}</button>
    <button className="playback-icon-button" onClick={()=>onStep(1)} disabled={!canNext} aria-label="Next event" title="Next event (Right)"><SkipForward size={18} aria-hidden="true" /></button>
  </div>;
}
