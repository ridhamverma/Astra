export function PlaybackState({state,error,onRetry,onCreate}:{state:"empty"|"loading"|"error";error?:string;onRetry?:()=>void;onCreate?:()=>void}) {
  return <section className="astra-playback playback-state" aria-label="Simulation playback">
    <h1>Replay your system</h1>
    {state === "loading" ? <><p role="status">Loading playback…</p><div className="playback-skeleton" aria-hidden="true" /></> : state === "error" ? <><p role="alert">{error || "Could not load this run."}</p><button onClick={onRetry}>Retry</button></> : <><p>No run available. Run your model to follow entities through the system.</p><button onClick={onCreate}>Open model builder</button></>}
  </section>;
}
