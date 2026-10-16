import type { StaticImageData } from "next/image";
import hospital from "@/public/template-backgrounds/hospital/hospital-background.png";
import bank from "@/public/template-backgrounds/bank/bank-background.png";
import restaurant from "@/public/template-backgrounds/restaurant/kitchen-background.png";
import warehouse from "@/public/template-backgrounds/warehouse/warehouse-background.png";
import customerService from "@/public/template-backgrounds/customer-service/customer-service.png";
import type { BackgroundId } from "./project-background";

interface TemplateBackgroundConfig {
  src: StaticImageData;
  srcMobile?: StaticImageData;
  thumb?: StaticImageData;
  overlayStrength: number;
}
// Optional mobile/thumb imports can be added to individual entries when supplied.
export const templateBackgrounds: Record<BackgroundId, TemplateBackgroundConfig> = {
  hospital: { src: hospital, overlayStrength: .75 },
  bank: { src: bank, overlayStrength: .75 },
  restaurant: { src: restaurant, overlayStrength: .6 },
  warehouse: { src: warehouse, overlayStrength: .6 },
  "customer-service": { src: customerService, overlayStrength: .6 },
};
export const backgroundTreatment = {
  builder: { blur: 1.5, overlayMultiplier: 1 },
  playback: { blur: 0.9, overlayMultiplier: .75 },
  centerDarkening: .5,
  fadeMs: 300,
};
