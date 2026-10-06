import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Astra — Understand the flow. Improve what comes next.",
  description: "Build visual process models, run discrete event simulations, and explore queues, throughput, wait times, and resource utilization with Astra.",
};

export default function HomePage() {
  return <LandingPage />;
}
