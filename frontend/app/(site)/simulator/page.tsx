import { SimulatorWorkspace } from "@/components/simulator/workspace";
import "./simulator.css";
import "./builder.css";
import "./workspace.css";

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return <SimulatorWorkspace projectId={project} />;
}
