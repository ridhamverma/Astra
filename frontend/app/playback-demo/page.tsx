import { notFound } from "next/navigation";
import { PlaybackDemo } from "./playback-demo";
import "../(site)/simulator/simulator.css";
import "../(site)/simulator/builder.css";
import "../(site)/simulator/workspace.css";
import "@xyflow/react/dist/style.css";
export default async function Page({searchParams}:{searchParams:Promise<{state?:string;scenario?:string}>}) {
  if (process.env.NODE_ENV !== "development" && process.env.ASTRA_PLAYBACK_QA !== "1") notFound();
  const params = await searchParams;
  return <PlaybackDemo initialState={params.state ?? "ready"} scenario={params.scenario} />;
}
