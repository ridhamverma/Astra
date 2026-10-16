"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import Image, { getImageProps } from "next/image";
import { preload } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import {
  backgroundPreferenceEvent, parseBackgroundPreferences,
  readBackgroundSnapshot, writeBackgroundPreferences, type BackgroundId,
} from "@/lib/project-background";
import { backgroundTreatment, templateBackgrounds } from "@/lib/template-backgrounds";
import "./template-background.css";

// Image failures affect only this project's presentation for the current session.
const failedBackgrounds = new Set<string>();
function subscribe(callback: () => void) {
  window.addEventListener(backgroundPreferenceEvent, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(backgroundPreferenceEvent, callback); window.removeEventListener("storage", callback); };
}
export function useProjectBackground(projectId?: string) {
  const raw = useSyncExternalStore(subscribe, () => readBackgroundSnapshot(projectId), () => "");
  const preferences = parseBackgroundPreferences(raw);
  const failureKey = `${projectId ?? "draft"}:${preferences.templateId}`;
  const failed = useSyncExternalStore(subscribe, () => failedBackgrounds.has(failureKey), () => false);
  const available = Boolean(preferences.templateId && templateBackgrounds[preferences.templateId]?.src?.src && !failed);
  return {
    ...preferences,
    available,
    toggle: () => writeBackgroundPreferences(projectId, { ...preferences, backgroundEnabled: !preferences.backgroundEnabled }),
    reportImageFailure: (id: BackgroundId) => {
      failedBackgrounds.add(`${projectId ?? "draft"}:${id}`);
      window.dispatchEvent(new Event(backgroundPreferenceEvent));
    },
  };
}
export type ProjectBackground = ReturnType<typeof useProjectBackground>;

function subscribeMobile(callback: () => void) {
  const media = matchMedia("(max-width: 767px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function BackgroundPhoto({ id, active, onFailure }: { id: BackgroundId; active: boolean; onFailure?: (id: BackgroundId) => void }) {
  const config = templateBackgrounds[id];
  const mobile = useSyncExternalStore(subscribeMobile, () => matchMedia("(max-width: 767px)").matches, () => false);
  const source = mobile && config.srcMobile ? config.srcMobile : config.src;
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  if (failed === source.src) return null;
  const ready = loaded === source.src;
  if (active) {
    const { props } = getImageProps({ src: source, alt: "", fill: true, sizes: "100vw" });
    preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: props.sizes, fetchPriority: "low" });
  }
  const placeholder = config.thumb?.src ?? source.blurDataURL;
  return <div className="template-background-photo" data-visible={active && (ready || Boolean(config.thumb || source.blurDataURL))}>
    <div className="template-background-image">
      {placeholder && <div className="template-background-placeholder" style={{ backgroundImage: `url("${placeholder}")` }} />}
      <Image key={source.src} className="template-background-full" data-loaded={ready} src={source} fill sizes="100vw" alt="" loading="lazy" decoding="async"
        onLoad={() => setLoaded(source.src)} onError={() => { setFailed(source.src); onFailure?.(id); }} />
    </div>
    <div className="template-background-overlay" />
    <div className="template-background-vignette" />
  </div>;
}

export function TemplateBackground({ background, view, reducedMotion = false }: {
  background?: ProjectBackground; view: "builder" | "playback"; reducedMotion?: boolean;
}) {
  const choice = background?.available && background.backgroundEnabled ? background.templateId ?? null : null;
  const [selection, setSelection] = useState(choice);
  const [layers, setLayers] = useState<BackgroundId[]>(choice ? [choice] : []);
  if (selection !== choice) {
    setSelection(choice);
    setLayers(previous => [...previous.filter(id => id !== choice).slice(-1), ...(choice ? [choice] : [])]);
  }
  useEffect(() => {
    const timer = setTimeout(() => setLayers(previous => previous.filter(id => id === choice)), reducedMotion ? 0 : backgroundTreatment.fadeMs);
    return () => clearTimeout(timer);
  }, [choice, reducedMotion]);
  const treatment = backgroundTreatment[view];
  return <div className="template-background" aria-hidden="true" data-reduced-motion={reducedMotion}
    style={{ "--background-blur": `${treatment.blur}px`, "--background-center": backgroundTreatment.centerDarkening,
      "--background-fade": `${backgroundTreatment.fadeMs}ms` } as CSSProperties}>
    {(reducedMotion ? layers.filter(id => id === choice) : layers).map(id => <div className="template-background-slot" key={id}
      style={{ "--background-overlay": templateBackgrounds[id].overlayStrength * treatment.overlayMultiplier } as CSSProperties}>
      <BackgroundPhoto id={id} active={id === choice} onFailure={background?.reportImageFailure} />
    </div>)}
  </div>;
}

export function BackgroundControl({ background }: { background: ProjectBackground }) {
  if (!background.available) return null;
  return <button type="button" className="astra-button-secondary background-trigger" role="switch"
    aria-label="Background" aria-checked={background.backgroundEnabled} onClick={background.toggle}>
    <ImageIcon size={16} aria-hidden="true" />
    <span>Background {background.backgroundEnabled ? "on" : "off"}</span>
  </button>;
}
