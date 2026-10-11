import { notFound } from "next/navigation";
import { Review } from "./review";
import "../(site)/simulator/simulator.css";
import "../(site)/simulator/builder.css";
import "../(site)/simulator/workspace.css";
import "@/styles/astra-workspace.css";
export default function Page(){if(process.env.NODE_ENV!=="development")notFound();return <Review/>;}
