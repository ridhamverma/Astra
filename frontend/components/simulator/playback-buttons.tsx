export function PlaybackButtons({playing,finished,disabled,canPrevious,canNext,onToggle,onReset,onStep}:{playing:boolean;finished:boolean;disabled:boolean;canPrevious:boolean;canNext:boolean;onToggle:()=>void;onReset:()=>void;onStep:(direction:-1|1)=>void}) {
  const label = finished ? "Replay" : playing ? "Pause" : "Play";
  return <div className="playback-buttons">
    <button className="astra-button-primary" disabled={disabled} onClick={onToggle} aria-label={label}>{label}</button>
    <button className="astra-button-secondary" onClick={()=>onStep(-1)} disabled={!canPrevious} aria-label="Previous event" title="Previous event (Left)">←</button>
    <button className="astra-button-secondary" onClick={()=>onStep(1)} disabled={!canNext} aria-label="Next event" title="Next event (Right)">→</button>
    <button className="astra-button-secondary" onClick={onReset}>Reset</button>
  </div>;
}
