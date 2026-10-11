"use client";
import { useState } from "react";
const steps=["Run the 240-minute baseline with seed 42. Look for the waiting line.","Open Insights. Compare utilization with resource wait and upstream queue evidence.","Save a baseline scenario, add one resource at the bottleneck, then run with the same settings."];
export function TemplateGuide(){const [step,setStep]=useState(0);if(step===3)return null;return <aside className="astra-template-guide" aria-label="Template first run"><strong>{step+1} / 3</strong><p aria-live="polite">{steps[step]}</p><button className="astra-action" onClick={()=>setStep(3)}>Dismiss</button><button className="astra-action astra-action-primary" onClick={()=>setStep(step+1)}>{step===2?"Got it":"Next tip"}</button></aside>;}
