"use client";

import { useRef } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { PLAYBACK_SPEED_OPTIONS } from "@/lib/playback-speeds";
import "./playback-speed.css";

type PlaybackSpeedProps = {
  value: number;
  onChange: (event: { target: { value: string } }) => void;
  reducedMotion: boolean;
};

export function PlaybackSpeed({ value, onChange, reducedMotion }: PlaybackSpeedProps) {
  const trigger = useRef<HTMLButtonElement>(null);

  return <div className="playback-speed" data-reduced-motion={reducedMotion}>
    <Select.Root value={value} modal={false} onValueChange={next => {
      // Preserve the native select's string-valued target for the existing handler.
      if (next !== null) onChange({ target: { value: String(next) } });
    }}>
      <span className="playback-speed-caption">Speed</span>
      <Select.Trigger ref={trigger} className="playback-speed-trigger" aria-label="Playback speed"
        onKeyDown={event => { if (event.currentTarget.getAttribute("aria-expanded") === "true") event.stopPropagation(); }}>
        <Gauge size={16} aria-hidden="true" />
        <Select.Value>{value}×</Select.Value>
        <Select.Icon className="playback-speed-chevron"><ChevronDown size={14} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal className="playback-speed-portal" data-reduced-motion={reducedMotion} ref={element => {
        if (!element || !trigger.current) return;
        // Carry the Playback theme into the body portal without duplicating its tokens.
        const style = getComputedStyle(trigger.current);
        for (const token of ["--accent", "--scene-surface", "--scene-text", "--scene-secondary", "--scene-font-body"]) {
          element.style.setProperty(token, style.getPropertyValue(token));
        }
      }}>
        <Select.Positioner className="playback-speed-positioner" side="bottom" align="end" sideOffset={8}
          alignItemWithTrigger={false} collisionPadding={8} collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}>
          <Select.Popup className="playback-speed-popup" finalFocus={trigger} onKeyDown={event => event.stopPropagation()}>
            <Select.List aria-label="Playback speed">
              {PLAYBACK_SPEED_OPTIONS.map(option => <Select.Item className="playback-speed-option" key={option} value={option}>
                <Select.ItemText>{option}×</Select.ItemText>
                <Select.ItemIndicator className="playback-speed-check"><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
    <small>{value}× · {value} min/s</small>
  </div>;
}
