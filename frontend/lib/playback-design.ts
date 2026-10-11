/** Presentation constants only. No value here participates in engine timing. */
export const PLAYBACK_DESIGN = {
  motionDetailZoom: 0.35, distantFrameMs: 1000 / 30,
  mobileFitPadding: { top: "12px", bottom: "76px", left: "20px", right: "20px" },
  fitPadding: { top: "40px", bottom: "80px", left: "210px", right: "35px" }, resizeDebounceMs: 120, followIntervalMs: 160,
  uiIntervalMs: 100, liveIntervalMs: 1200, logRowHeight: 60, logWindowRows: 12, logOverscan: 4,
  waiting: "#ebbf66", service: "#83bfef", transfer: "#bfabe9", rejected: "#ffa8a0", completed: "#8fdbb0",
  text: "#fff9f0", secondary: "#c4bdb2", border: "#827d73", surface: "#171715", track: "#827d73",
} as const;
