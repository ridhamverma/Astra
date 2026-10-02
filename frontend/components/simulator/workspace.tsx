"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { CanvasGrid, CanvasZoomControls } from "./canvas-ui";
import { WorkspaceShell, WorkspaceStatusBar } from "./workspace-shell";
import { Hand, MousePointer2 } from "lucide-react";
import {
  SheetHandle,
  BuilderCommandPalette,
  trapFocus,
  useSheetFocus,
  type BuilderCommand,
} from "@/components/simulator/builder-ui";
import { BuilderEdge } from "@/components/simulator/builder-edge";
import { averageUtilization, nodeRows } from "@/lib/builder-presentation";
const TOOL_KEYS = {
  source: "S",
  queue: "Q",
  process: "P",
  decision: "D",
  delay: "L",
  sink: "K",
};
import { useRouter } from "next/navigation";
import {
  ConnectionLineType,
  getViewportForBounds,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { applyResourceConfiguration } from "@/lib/optimization";
import { OptimizationPanel } from "@/components/simulator/optimization-panel";
import { ModelChat } from "@/components/simulator/model-chat";
import { insertGeneratedModel } from "@/lib/insert-generated-model";
import {
  NodeProperties,
  type ConfigPatch,
} from "@/components/simulator/node-properties";
import { Icon } from "@/components/dashboard/icon";
import { AstraNode } from "@/components/simulator/astra-node";
import { ScenariosPanel } from "@/components/simulator/scenarios-panel";
import { scenariosApi, type Scenario } from "@/services/scenarios";
import { SimulationPlayback } from "@/components/simulator/playback";
import {
  AnalyticsDashboard,
  AnalyticsEmptyState,
} from "@/components/simulator/analytics-dashboard";
import {
  NODE_DEFINITIONS,
  NODE_KINDS,
  balanceDecisionEdges,
  createNode,
  createsCycle,
  toEditorEdges,
  toEditorNodes,
  toSimulationModel,
  type EditorEdge,
  type EditorNode,
  type NodeKind,
} from "@/lib/simulation-editor";
import { projectsApi } from "@/services/projects";
import { ApiRequestError, type ApiIssue } from "@/services/api";
import { simulationsApi } from "@/services/simulations";
import type { SimulationModel } from "@/types/simulation";
import type { SimulationRun, PlaybackRun } from "@/types/simulation-result";

const nodeTypes = {
  source: AstraNode,
  queue: AstraNode,
  process: AstraNode,
  decision: AstraNode,
  delay: AstraNode,
  sink: AstraNode,
};

const edgeTypes = { builder: BuilderEdge };

const DEFAULT_SIMULATION: SimulationModel["simulation"] = {
  duration: 480,
  seed: 42,
};
const BUILDER_FIT = { padding: 0.15, minZoom: 0.08, maxZoom: 1.25 };

function Pencil() {
  return (
    <svg
      className="builder-project-pencil"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      className="builder-tab-lock"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function AstraConceptMark() {
  return <span className="builder-astra-mark" role="img" aria-label="Astra" />;
}

function WorkspaceCanvas({ initialProjectId }: { initialProjectId?: string }) {
  const router = useRouter();
  const flow = useReactFlow<EditorNode, EditorEdge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [panMode, setPanMode] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("Configuration");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toolFocus, setToolFocus] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [toolTip, setToolTip] = useState<NodeKind | null>(null);
  const toolPressTimer = useRef<number | undefined>(undefined);
  const touchTool = useRef<{
    kind: NodeKind;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const toolDragged = useRef(false);
  useEffect(() => () => window.clearTimeout(toolPressTimer.current), []);
  const panelRef = useRef<HTMLElement>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const history = useRef<
    { nodes: EditorNode[]; edges: EditorEdge[]; dirty: boolean }[]
  >([]);
  const previousGraph = useRef<{
    key: string;
    dirty: boolean;
    nodes: EditorNode[];
    edges: EditorEdge[];
  } | null>(null);
  const restoring = useRef(false);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<EditorNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<EditorEdge>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [modelVersion, setModelVersion] = useState<number | null>(null);
  const [modelId, setModelId] = useState("");
  const [projectName, setProjectName] = useState("Untitled File");
  const [simulation, setSimulation] = useState(DEFAULT_SIMULATION);
  const [loading, setLoading] = useState(Boolean(initialProjectId));
  const [busy, setBusy] = useState(false);
  const runPending = useRef(false);
  const savePending = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [runResult, setRunResult] = useState<SimulationRun | null>(null);
  const [activeView, setActiveView] = useState<
    "builder" | "analytics" | "playback" | "scenarios" | "optimization"
  >("builder");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatGenerating, setChatGenerating] = useState(false);
  const [selectedTool, setSelectedTool] = useState<NodeKind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolPaletteExpanded, setToolPaletteExpanded] = useState(false);
  const [toolPalettePreferenceLoaded, setToolPalettePreferenceLoaded] =
    useState(false);
  const [toolRailCompact, setToolRailCompact] = useState(false);
  const [compactToolRailExpanded, setCompactToolRailExpanded] = useState<
    boolean | null
  >(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const renameFinished = useRef(false);
  const projectNameInput = useRef<HTMLInputElement>(null);
  const generateButton = useRef<HTMLButtonElement>(null);
  const previousChatOpen = useRef(chatOpen);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [activeScenario, setActiveScenario] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [scenarioRevision, setScenarioRevision] = useState(0);
  const [playbackRun, setPlaybackRun] = useState<PlaybackRun | null>(null);
  const [runStage, setRunStage] = useState<
    "idle" | "validating" | "saving" | "running" | "success" | "error"
  >("idle");
  const [validationIssues, setValidationIssues] = useState<ApiIssue[]>([]);

  useEffect(() => {
    if (activeView === "builder" || !message || error) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [activeView, message, error]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const preference = window.localStorage.getItem(
          "astra-builder-tools-expanded",
        );
        if (preference === "true" || preference === "false")
          setToolPaletteExpanded(preference === "true");
      } catch {
        /* Keep the default when storage is unavailable. */
      }
      setToolPalettePreferenceLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!toolPalettePreferenceLoaded) return;
    try {
      window.localStorage.setItem(
        "astra-builder-tools-expanded",
        String(toolPaletteExpanded),
      );
    } catch {
      /* Storage is optional. */
    }
  }, [toolPaletteExpanded, toolPalettePreferenceLoaded]);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      activeTabRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [activeView]);

  useEffect(() => {
    if (renamingProject) {
      projectNameInput.current?.focus();
      projectNameInput.current?.select();
    }
  }, [renamingProject]);

  function beginProjectRename() {
    if (busy || activeScenario) return;
    renameFinished.current = false;
    setProjectNameDraft(projectName);
    setRenamingProject(true);
  }

  function finishProjectRename(commit: boolean) {
    if (renameFinished.current) return;
    renameFinished.current = true;
    setRenamingProject(false);
    const nextName = projectNameDraft.trim();
    if (!commit || !nextName || nextName === projectName) return;
    if (!projectId) {
      setProjectName(nextName);
      setDirty(true);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    projectsApi
      .rename(projectId, nextName)
      .then((project) => {
        setProjectName(project.name);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not rename project.",
        ),
      )
      .finally(() => setBusy(false));
  }

  const fitBuilderView = useCallback(
    (duration?: number) => {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        const currentNodes = flow.getNodes();
        if (!canvas || !currentNodes.length || !canvas.clientWidth) return;
        const mobile = window.innerWidth < 768;
        const rail = canvas.querySelector<HTMLElement>(".builder-tool-palette");
        const left = mobile ? 24 : (rail?.offsetWidth ?? 48) + 24 + 96;
        const bottom = mobile ? 132 : 24;
        const right = mobile ? 24 : 96;
        const width = Math.max(100, canvas.clientWidth - left - right);
        const height = Math.max(100, canvas.clientHeight - 48 - bottom);
        const bounds = flow.getNodesBounds(currentNodes);
        const viewport = getViewportForBounds(
          bounds,
          width,
          height,
          BUILDER_FIT.minZoom,
          BUILDER_FIT.maxZoom,
          0.15,
        );
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        void flow.setViewport(
          { ...viewport, x: viewport.x + left, y: viewport.y + 24 },
          { duration: reduced ? 0 : (duration ?? 0) },
        );
      });
    },
    [flow],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let frame = 0;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      const compact = window.innerWidth < 1280;
      setToolRailCompact(compact);
      if (!compact) setCompactToolRailExpanded(null);
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      if (nodes.length) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => fitBuilderView(120));
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fitBuilderView, nodes.length]);

  useEffect(() => {
    if (previousChatOpen.current === chatOpen) return;
    previousChatOpen.current = chatOpen;
    const timeout = window.setTimeout(() => {
      if (canvasRef.current?.clientWidth && canvasRef.current.clientHeight)
        fitBuilderView(200);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [chatOpen, flow, fitBuilderView]);

  useEffect(() => {
    if (!initialProjectId) return;
    let active = true;
    projectsApi
      .get(initialProjectId)
      .then((project) => {
        if (!active) return;
        setProjectId(project.id);
        setProjectName(project.name);
        setModelVersion(project.latest_version);
        if (project.model) {
          setModelId(project.model.id);
          setSimulation(project.model.simulation);
          const loadedNodes = toEditorNodes(project.model.nodes);
          const loadedEdges = toEditorEdges(
            project.model.edges,
            project.model.nodes,
          );
          setNodes(loadedNodes);
          setEdges(loadedEdges);
          fitBuilderView();
        }
        projectsApi
          .runs(project.id)
          .then((runs) => {
            if (active && runs.length > 0) setRunResult(runs[0]);
          })
          .catch(() => {
            /* The editor remains usable if history cannot load. */
          });
        setDirty(false);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load project.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialProjectId, setNodes, setEdges, flow, fitBuilderView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      onNodesChangeBase(changes);
      if (
        changes.some(
          (change) => change.type !== "select" && change.type !== "dimensions",
        )
      )
        setDirty(true);
    },
    [onNodesChangeBase, setDirty],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      onEdgesChangeBase(changes);
      if (changes.some((change) => change.type !== "select")) {
        setDirty(true);
        const removed = changes
          .filter((change) => change.type === "remove")
          .map((change) => change.id);
        if (removed.length > 0) {
          const affectedDecisions = new Set(
            edges
              .filter(
                (edge) =>
                  removed.includes(edge.id) &&
                  nodes.find((node) => node.id === edge.source)?.type ===
                    "decision",
              )
              .map((edge) => edge.source),
          );
          setEdges((current) => {
            let next = current;
            for (const sourceId of affectedDecisions)
              next = balanceDecisionEdges(next, sourceId);
            return next;
          });
        }
      }
    },
    [onEdgesChangeBase, setEdges, nodes, edges, setDirty],
  );

  const connect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      if (
        !source ||
        !target ||
        source.type === "sink" ||
        target.type === "source"
      )
        return;
      if (createsCycle(edges, source.id, target.id)) {
        setError("That connection would create a cycle.");
        return;
      }
      if (
        source.type !== "decision" &&
        edges.some((edge) => edge.source === source.id)
      ) {
        setError("Only Decision nodes can have multiple outgoing paths.");
        return;
      }
      if (
        source.type === "decision" &&
        edges.some(
          (edge) =>
            edge.source === source.id &&
            edge.sourceHandle === connection.sourceHandle,
        )
      ) {
        setError("Each Decision branch can have one connection.");
        return;
      }
      if (
        edges.some(
          (edge) =>
            edge.source === source.id &&
            edge.target === target.id &&
            edge.sourceHandle === connection.sourceHandle,
        )
      )
        return;
      const nextEdge: EditorEdge = {
        id: crypto.randomUUID(),
        source: source.id,
        target: target.id,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: "smoothstep",
        pathOptions: { borderRadius: 12 },
        interactionWidth: 12,
        data: {},
      };
      setEdges((current) => {
        const next = addEdge(nextEdge, current);
        return source.type === "decision"
          ? balanceDecisionEdges(next, source.id)
          : next;
      });
      setDirty(true);
      setError("");
    },
    [nodes, edges, setEdges, setDirty],
  );

  const addNode = useCallback(
    (kind: NodeKind, clientX?: number, clientY?: number) => {
      if (busy) return;
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const point =
        clientX === undefined || clientY === undefined
          ? {
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            }
          : { x: clientX, y: clientY };
      const position = flow.screenToFlowPosition(point);
      setNodes((current) => [...current, createNode(kind, position)]);
      setDirty(true);
      setError("");
    },
    [flow, setNodes, busy, setDirty],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(
        "application/astra-node",
      ) as NodeKind;
      if (NODE_KINDS.includes(kind))
        addNode(kind, event.clientX, event.clientY);
    },
    [addNode],
  );

  const save = useCallback(
    async (preparedModel?: SimulationModel): Promise<string | null> => {
      if (savePending.current || (!preparedModel && runPending.current))
        return null;
      savePending.current = true;
      setBusy(true);
      setError("");
      setMessage("");
      setValidationIssues([]);
      const id =
        preparedModel?.id ?? (modelId || `model-${crypto.randomUUID()}`);
      const name = projectName.trim();
      if (!name) {
        setError("Give the project a name before saving.");
        savePending.current = false;
        if (!preparedModel) setBusy(false);
        return null;
      }
      const model =
        preparedModel ?? toSimulationModel(id, name, simulation, nodes, edges);
      try {
        if (activeScenario && projectId) {
          const scenario = await scenariosApi.update(activeScenario.id, {
            model,
          });
          setModelId(id);
          setModelVersion(scenario.model_version);
          setDirty(false);
          setScenarioRevision((value) => value + 1);
          setMessage(
            `Saved ${scenario.name}, version ${scenario.model_version}.`,
          );
          return projectId;
        }
        const project = projectId
          ? await projectsApi.update(projectId, name, model)
          : await projectsApi.create(name, model);
        setProjectId(project.id);
        setModelId(id);
        setModelVersion(project.latest_version);
        setDirty(false);
        setMessage(`Saved version ${project.latest_version}.`);
        if (!projectId) router.replace(`/simulator?project=${project.id}`);
        return project.id;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not save project.",
        );
        if (cause instanceof ApiRequestError) setValidationIssues(cause.issues);
        return null;
      } finally {
        savePending.current = false;
        if (!preparedModel) setBusy(false);
      }
    },
    [
      modelId,
      projectName,
      simulation,
      nodes,
      edges,
      projectId,
      router,
      activeScenario,
      setDirty,
      setBusy,
      setScenarioRevision,
    ],
  );

  const run = useCallback(async () => {
    if (runPending.current || savePending.current || busy || loading) return;
    runPending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setValidationIssues([]);
    setRunStage("validating");
    const model = toSimulationModel(
      modelId || `model-${crypto.randomUUID()}`,
      projectName.trim(),
      simulation,
      nodes,
      edges,
    );
    try {
      const validation = await simulationsApi.validate(model);
      if (!validation.valid) {
        setValidationIssues(validation.errors);
        setError("Fix the model before running the simulation.");
        setRunStage("error");
        setActiveView("builder");
        return;
      }
      let id = projectId;
      if (dirty || !id) {
        setRunStage("saving");
        id = (await save(model)) ?? undefined;
      }
      if (!id) {
        setRunStage("error");
        return;
      }
      setBusy(true);
      setRunStage("running");
      const result = activeScenario
        ? await scenariosApi.run(activeScenario.id)
        : await projectsApi.run(id);
      setRunResult(result);
      setPlaybackRun(result);
      setScenarioRevision((value) => value + 1);
      setMessage(`Run completed using model version ${result.model_version}.`);
      setRunStage("success");
      setActiveView("analytics");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not run simulation.",
      );
      if (cause instanceof ApiRequestError) setValidationIssues(cause.issues);
      setRunStage("error");
    } finally {
      runPending.current = false;
      setBusy(false);
    }
  }, [
    dirty,
    projectId,
    save,
    modelId,
    projectName,
    simulation,
    nodes,
    edges,
    activeScenario,
    busy,
    loading,
    setBusy,
    setScenarioRevision,
  ]);

  function updateSelectedNode(patch: { name?: string; config?: ConfigPatch }) {
    if (!selectedNode || busy) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                ...(patch.name === undefined ? {} : { name: patch.name }),
                config: {
                  ...node.data.config,
                  ...patch.config,
                } as EditorNode["data"]["config"],
              },
            }
          : node,
      ),
    );
    setDirty(true);
    setError("");
    setValidationIssues([]);
  }

  function applyOptimization(nodeId: string, resources: number) {
    if (busy) return;
    const updated = applyResourceConfiguration(
      toSimulationModel(
        modelId || "unsaved",
        projectName,
        simulation,
        nodes,
        edges,
      ),
      nodeId,
      resources,
    );
    setNodes(
      toEditorNodes(updated.nodes).map((node) => ({
        ...node,
        selected: node.id === nodeId,
      })),
    );
    setDirty(true);
    setError("");
    setValidationIssues([]);
    setActiveView("builder");
    setMessage(
      `Applied ${resources} resources. Save or run to measure this configuration.`,
    );
  }

  function importGeneratedModel(model: SimulationModel) {
    const merged = insertGeneratedModel(
      toSimulationModel(
        modelId || `model-${crypto.randomUUID()}`,
        projectName,
        simulation,
        nodes,
        edges,
      ),
      model,
    );
    setModelId(merged.id);
    setNodes(toEditorNodes(merged.nodes));
    setEdges(toEditorEdges(merged.edges, merged.nodes));
    setDirty(true);
    setError("");
    setValidationIssues([]);
    setRunStage("idle");
    setActiveView("builder");
    setMessage(
      "Reviewed draft added. Select any node to edit its parameters, then save or run when ready.",
    );
    fitBuilderView();
  }

  function loadScenario(scenario: Scenario) {
    setActiveScenario({ id: scenario.id, name: scenario.name });
    setModelVersion(scenario.model_version);
    setModelId(scenario.model.id);
    setSimulation(scenario.model.simulation);
    const scenarioNodes = toEditorNodes(scenario.model.nodes);
    const scenarioEdges = toEditorEdges(
      scenario.model.edges,
      scenario.model.nodes,
    );
    setNodes(scenarioNodes);
    setEdges(scenarioEdges);
    setRunResult(scenario.latest_run);
    setPlaybackRun(null);
    setDirty(false);
    setError("");
    setValidationIssues([]);
    setActiveView("builder");
    setMessage(`Loaded ${scenario.name}.`);
    fitBuilderView();
  }

  async function runSavedScenario(scenario: Scenario) {
    loadScenario(scenario);
    setRunStage("running");
    try {
      const result = await scenariosApi.run(scenario.id);
      setRunResult(result);
      setPlaybackRun(result);
      setScenarioRevision((value) => value + 1);
      setRunStage("success");
      setActiveView("analytics");
      setMessage(
        `Run completed for ${scenario.name}, model version ${result.model_version}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not run scenario.",
      );
      setRunStage("error");
      throw cause;
    }
  }

  const resultMatchesCanvas =
    !dirty && runResult?.model_version === modelVersion;
  const primaryNodeId = resultMatchesCanvas
    ? runResult?.bottleneck_analysis.primaryBottleneck
    : null;
  // Presentation changes only when names/configuration change, not on every drag frame.
  const presentationKey = JSON.stringify(
    nodes.map(({ id, type, data }) => ({
      id,
      type,
      data,
      position: { x: 0, y: 0 },
    })),
  );
  const presentationNodes = useMemo(
    () => JSON.parse(presentationKey) as EditorNode[],
    [presentationKey],
  );
  const nodePresentation = useMemo(
    () =>
      new Map(
        presentationNodes.map((node) => [
          node.id,
          {
            ...node.data,
            builderPresentation: true,
            bottleneck: node.id === primaryNodeId,
            running: runStage === "running",
            rows: nodeRows(
              node,
              resultMatchesCanvas ? runResult : null,
              playbackRun,
              edges,
              presentationNodes,
            ),
            yesProbability: edges.find(
              (edge) => edge.source === node.id && edge.sourceHandle === "yes",
            )?.data?.probability,
            error: validationIssues.find((issue) =>
              issue.path.includes(node.id),
            )?.message,
          },
        ]),
      ),
    [
      presentationNodes,
      primaryNodeId,
      runStage,
      resultMatchesCanvas,
      runResult,
      playbackRun,
      edges,
      validationIssues,
    ],
  );
  const canvasNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: nodePresentation.get(node.id) ?? node.data,
      })),
    [nodes, nodePresentation],
  );

  const eventCounts = useMemo(() => {
    const counts = new Map<string, { created: number; exited: number }>();
    if (resultMatchesCanvas && playbackRun?.id === runResult?.id)
      for (const event of playbackRun?.events ?? []) {
        const count = counts.get(event.node_id) ?? { created: 0, exited: 0 };
        if (event.type === "entity_created") count.created++;
        if (event.type === "node_exit") count.exited++;
        counts.set(event.node_id, count);
      }
    return counts;
  }, [playbackRun, runResult, resultMatchesCanvas]);
  const canvasEdges = useMemo(
    () =>
      edges.map((edge) => {
        const decision =
          nodes.find((node) => node.id === edge.source)?.type === "decision";
        const metric = resultMatchesCanvas
          ? runResult?.node_metrics[edge.source]
          : undefined;
        const timelineCount =
          resultMatchesCanvas && playbackRun?.id === runResult?.id
            ? nodes.find((node) => node.id === edge.source)?.type === "source"
              ? eventCounts.get(edge.source)?.created
              : eventCounts.get(edge.source)?.exited
            : undefined;
        const sourceNode = nodes.find((node) => node.id === edge.source);
        const compactCount =
          resultMatchesCanvas &&
          runResult &&
          sourceNode?.type === "source" &&
          nodes.filter((node) => node.type === "source").length === 1
            ? runResult.summary.total_generated
            : resultMatchesCanvas &&
                runResult &&
                nodes.find((node) => node.id === edge.target)?.type ===
                  "sink" &&
                nodes.filter((node) => node.type === "sink").length === 1 &&
                edges.filter((item) => item.target === edge.target).length === 1
              ? runResult.summary.total_completed
              : undefined;
        const count =
          timelineCount ??
          compactCount ??
          (metric && "entities_processed" in metric
            ? metric.entities_processed
            : metric && "total_exited" in metric
              ? metric.total_exited
              : undefined);
        const label = decision
          ? `${edge.sourceHandle === "no" ? "No" : "Yes"} ${Math.round((edge.data?.probability ?? 0) * 100)}%`
          : count != null && runResult
            ? `${Number(((count / runResult.duration) * 60).toFixed(1))} / hr`
            : undefined;
        return {
          ...edge,
          sourceHandle: decision
            ? (edge.sourceHandle ?? "yes")
            : "source-right",
          targetHandle: "target-left",
          type: "builder",
          interactionWidth: 12,
          data: { ...edge.data, label, running: runStage === "running" },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: edge.selected ? "var(--accent)" : "var(--edge-arrow)",
          },
        };
      }),
    [
      edges,
      nodes,
      runResult,
      resultMatchesCanvas,
      runStage,
      playbackRun,
      eventCounts,
    ],
  );

  function viewBottleneck() {
    if (!primaryNodeId) return;
    setActiveView("builder");
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === primaryNodeId })),
    );
    fitBuilderView(300);
  }

  const selectedNode = nodes.find((node) => node.selected);
  const selectedEdge = edges.find((edge) => edge.selected);
  const counts = useMemo(
    () => ({ nodes: nodes.length, edges: edges.length }),
    [nodes.length, edges.length],
  );

  function deleteSelection() {
    if (busy) return;
    if (selectedNode) {
      if (
        edges.some(
          (edge) =>
            edge.source === selectedNode.id || edge.target === selectedNode.id,
        ) &&
        !window.confirm(
          `Delete ${selectedNode.data.name} and its connected links?`,
        )
      )
        return;
      setNodes((current) =>
        current.filter((node) => node.id !== selectedNode.id),
      );
      setEdges((current) => {
        let next = current.filter(
          (edge) =>
            edge.source !== selectedNode.id && edge.target !== selectedNode.id,
        );
        for (const sourceId of new Set(
          current
            .filter((edge) => edge.target === selectedNode.id)
            .map((edge) => edge.source),
        )) {
          if (nodes.find((node) => node.id === sourceId)?.type === "decision")
            next = balanceDecisionEdges(next, sourceId);
        }
        return next;
      });
    } else if (selectedEdge) {
      let next = edges.filter((edge) => edge.id !== selectedEdge.id);
      if (
        nodes.find((node) => node.id === selectedEdge.source)?.type ===
        "decision"
      )
        next = balanceDecisionEdges(next, selectedEdge.source);
      setEdges(next);
    }
    setDirty(true);
  }

  const effectiveToolPaletteExpanded = toolRailCompact
    ? (compactToolRailExpanded ?? false)
    : toolPaletteExpanded;
  const toggleToolPalette = () => {
    if (toolRailCompact)
      setCompactToolRailExpanded((current) => !(current ?? false));
    else setToolPaletteExpanded((current) => !current);
  };

  const panelOpen = Boolean(
    selectedNode || selectedEdge || settingsOpen || chatOpen,
  );
  useSheetFocus(
    panelRef,
    Boolean(!chatOpen && (selectedNode || selectedEdge || settingsOpen)),
  );
  useEffect(() => {
    if (activeView === "builder") {
      const timer = window.setTimeout(() => fitBuilderView(200), 240);
      return () => clearTimeout(timer);
    }
  }, [panelOpen, effectiveToolPaletteExpanded, activeView, fitBuilderView]);
  useEffect(() => {
    const resize = () => fitBuilderView(120);
    window.addEventListener("orientationchange", resize);
    return () => window.removeEventListener("orientationchange", resize);
  }, [fitBuilderView]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem(`astra-builder-notes-${projectId ?? "draft"}`) ??
            "{}",
        );
        if (stored && typeof stored === "object")
          setNotes(
            Object.fromEntries(
              Object.entries(stored).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
          );
      } catch {
        /* Optional device notes. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [projectId]);
  useEffect(() => {
    const key = JSON.stringify(
      toSimulationModel("history", "history", DEFAULT_SIMULATION, nodes, edges),
    );
    const previous = previousGraph.current;
    if (
      previous &&
      previous.key !== key &&
      !restoring.current &&
      dirty &&
      !loading &&
      !nodes.some((node) => node.dragging) &&
      !previous.nodes.some((node) => node.dragging)
    ) {
      history.current.push({
        nodes: previous.nodes,
        edges: previous.edges,
        dirty: previous.dirty,
      });
      if (history.current.length > 50) history.current.shift();
    }
    restoring.current = false;
    previousGraph.current = { key, nodes, edges, dirty };
  }, [nodes, edges, dirty, loading]);
  function closePanel() {
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: false })),
    );
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: false })),
    );
    setSettingsOpen(false);
  }
  const commands: BuilderCommand[] = [
    ...NODE_KINDS.map((kind) => ({
      label: `Add ${NODE_DEFINITIONS[kind].label}`,
      group: "Add node",
      icon: NODE_DEFINITIONS[kind].icon,
      hint: TOOL_KEYS[kind],
      disabled: busy || loading,
      action: () => {
        setActiveView("builder");
        addNode(kind);
        fitBuilderView(200);
      },
    })),
    {
      label: "Run simulation",
      group: "Actions",
      icon: "run",
      disabled: busy || !nodes.length,
      action: () => void run(),
    },
    {
      label: "Fit view",
      group: "Actions",
      icon: "search",
      action: () => fitBuilderView(200),
    },
    {
      label: "Generate model with Astra",
      group: "Actions",
      icon: "projects",
      action: () => setChatOpen(true),
    },
    {
      label: "Open settings",
      group: "Actions",
      icon: "settings",
      action: () => {
        setChatOpen(false);
        setSettingsOpen(true);
      },
    },
    ...(
      ["builder", "analytics", "playback", "scenarios", "optimization"] as const
    ).map((view, i) => ({
      label: ["Builder", "Insights", "Playback", "Scenarios", "Optimization"][
        i
      ],
      group: "Go to",
      icon: "arrow" as const,
      disabled: view === "playback" && !playbackRun,
      action: () => setActiveView(view),
    })),
  ];
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
      if (typing) return;
      if (
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") ||
        (activeView === "builder" && event.key === "/")
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (activeView !== "builder") return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z" &&
        !busy
      ) {
        event.preventDefault();
        const previous = history.current.pop();
        if (previous) {
          restoring.current = true;
          setNodes(previous.nodes);
          setEdges(previous.edges);
          setDirty(previous.dirty);
        }
        return;
      }
      if (event.key === "Escape") {
        setSelectedTool(null);
        setPaletteOpen(false);
        if (chatOpen) setChatOpen(false);
        else closePanel();
        return;
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !paletteOpen &&
        !panelOpen &&
        !busy
      ) {
        const kind = NODE_KINDS.find(
          (kind) => TOOL_KEYS[kind].toLowerCase() === event.key.toLowerCase(),
        );
        if (kind) {
          event.preventDefault();
          setSelectedTool((current) => (current === kind ? null : kind));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <WorkspaceShell
      view={activeView}
      status={
        <WorkspaceStatusBar
          counts={counts}
          dirty={dirty || !projectId}
          saving={busy && runStage === "idle"}
          disabled={busy || loading || (!dirty && Boolean(projectId))}
          scenario={activeScenario?.name}
          onSave={() => void save()}
        />
      }
    >
      <header className="astra-workspace-header">
        <div className="builder-header-left">
          <span className="builder-brand">
            <AstraConceptMark />
          </span>
          <Link
            href="/projects"
            className="builder-breadcrumb"
            aria-label="Back to Projects"
            title="Back to Projects"
          >
            <svg
              aria-hidden="true"
              className="builder-breadcrumb-chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="builder-breadcrumb-projects">Projects</span>
          </Link>
          <span className="builder-breadcrumb-separator" aria-hidden="true">
            /
          </span>
          <div className="builder-project-title-wrap">
            {renamingProject ? (
              <input
                ref={projectNameInput}
                disabled={busy}
                aria-label="Project name"
                className="astra-project-name builder-project-name-input"
                style={{
                  width: `clamp(120px, ${Math.max(12, Math.min(40, projectNameDraft.length + 1))}ch, 320px)`,
                }}
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                maxLength={200}
                onBlur={() => finishProjectRename(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishProjectRename(true);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    finishProjectRename(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="builder-project-title"
                onClick={beginProjectRename}
                disabled={busy || Boolean(activeScenario)}
                title={projectName}
              >
                <span>{projectName}</span>
                <Pencil />
              </button>
            )}
          </div>
          {activeScenario && (
            <span className="astra-status">
              Scenario: {activeScenario.name}
            </span>
          )}
        </div>
        {
          <div
            className="builder-project-tabs"
            role="tablist"
            aria-label="Workspace views"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const current = tabs.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (current < 0) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
          >
            <button
              ref={activeView === "builder" ? activeTabRef : null}
              role="tab"
              tabIndex={activeView === "builder" ? 0 : -1}
              aria-selected={activeView === "builder"}
              onClick={() => setActiveView("builder")}
            >
              Builder
            </button>
            <button
              ref={activeView === "analytics" ? activeTabRef : null}
              role="tab"
              tabIndex={activeView === "analytics" ? 0 : -1}
              aria-selected={activeView === "analytics"}
              onClick={() => setActiveView("analytics")}
            >
              Insights
            </button>
            <button
              role="tab"
              ref={activeView === "playback" ? activeTabRef : null}
              tabIndex={activeView === "playback" ? 0 : -1}
              aria-label="Playback"
              aria-describedby={
                !playbackRun ? "builder-playback-lock-tip" : undefined
              }
              aria-selected={activeView === "playback"}
              aria-disabled={!playbackRun}
              onClick={() => {
                if (playbackRun) setActiveView("playback");
              }}
              title={
                !playbackRun ? "Run a simulation to unlock Playback" : undefined
              }
            >
              {!playbackRun ? (
                <>
                  <span>Playback</span>
                  <LockIcon />
                  <span
                    id="builder-playback-lock-tip"
                    className="builder-tab-tooltip"
                    role="tooltip"
                  >
                    Run a simulation to unlock Playback
                  </span>
                </>
              ) : (
                "Playback"
              )}
            </button>
            <button
              role="tab"
              ref={activeView === "scenarios" ? activeTabRef : null}
              tabIndex={activeView === "scenarios" ? 0 : -1}
              aria-selected={activeView === "scenarios"}
              aria-disabled={loading}
              onClick={() => {
                if (!loading) setActiveView("scenarios");
              }}
            >
              Scenarios
            </button>
            <button
              role="tab"
              ref={activeView === "optimization" ? activeTabRef : null}
              tabIndex={activeView === "optimization" ? 0 : -1}
              aria-selected={activeView === "optimization"}
              aria-disabled={loading}
              onClick={() => {
                if (!loading) setActiveView("optimization");
              }}
            >
              Optimization
            </button>
          </div>
        }
        {
          <div className="builder-header-actions">
            <button
              ref={generateButton}
              type="button"
              className={`builder-secondary builder-generate${chatGenerating ? " is-loading" : ""}`}
              aria-label="Ask Astra"
              aria-expanded={chatOpen}
              aria-pressed={chatOpen}
              aria-busy={chatGenerating || busy || loading}
              aria-controls="astra-generation-drawer"
              title="Ask Astra · ⌘K"
              data-tooltip="Ask Astra · ⌘K"
              disabled={busy || loading}
              onClick={() => setChatOpen((open) => !open)}
            >
              <AstraConceptMark />
              <span className="builder-ask-label">Ask Astra</span>
            </button>
            <button
              type="button"
              className="builder-settings-action"
              aria-label="Simulation settings"
              aria-expanded={settingsOpen}
              onClick={() => {
                if (activeView !== "builder") {
                  setNodes((items) =>
                    items.map((node) => ({ ...node, selected: false })),
                  );
                  setEdges((items) =>
                    items.map((edge) => ({ ...edge, selected: false })),
                  );
                }
                setChatOpen(false);
                setSettingsOpen((open) => !open);
              }}
              title="Simulation settings"
              data-tooltip="Simulation settings"
            >
              <Icon name="settings" />
              <span>Simulation settings</span>
            </button>
            <span className="builder-header-divider" aria-hidden="true" />
            <button
              type="button"
              className="builder-primary builder-run"
              aria-label="Run simulation"
              title={
                nodes.length === 0
                  ? "Add nodes to run a simulation"
                  : "Run simulation"
              }
              data-tooltip={
                nodes.length === 0
                  ? "Add nodes to run a simulation"
                  : "Run simulation"
              }
              onClick={() => void run()}
              disabled={busy || loading || nodes.length === 0}
              aria-busy={busy || loading}
            >
              {busy || loading ? (
                <span className="builder-run-spinner" aria-hidden="true" />
              ) : (
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <path
                    d="M4 2.6c0-.5.55-.8.98-.53l8.05 5.07a1 1 0 0 1 0 1.7l-8.05 5.07A.62.62 0 0 1 4 13.38V2.6Z"
                    fill="currentColor"
                  />
                </svg>
              )}
              <span className="builder-run-label">
                {runStage === "validating"
                  ? "Validating…"
                  : runStage === "saving"
                    ? "Saving…"
                    : runStage === "running"
                      ? "Running…"
                      : "Run"}
              </span>
            </button>
          </div>
        }
      </header>

      {activeView === "builder" && (
        <div
          className="builder-metrics glass"
          aria-label="Latest simulation metrics"
        >
          {resultMatchesCanvas && runResult ? (
            <>
              <div>
                <span>Throughput</span>
                <strong>{runResult.summary.throughput.toFixed(1)} / hr</strong>
              </div>
              <div>
                <span>Avg wait</span>
                <strong>
                  {runResult.summary.average_waiting_time?.toFixed(1) ?? "--"}{" "}
                  min
                </strong>
              </div>
              <div>
                <span>Avg utilization</span>
                <strong>{averageUtilization(runResult)}%</strong>
              </div>
              <button onClick={viewBottleneck} disabled={!primaryNodeId}>
                <span>Bottleneck</span>
                <strong>
                  <i />
                  {nodes.find((node) => node.id === primaryNodeId)?.data.name ??
                    "None"}
                </strong>
              </button>
              <div className="builder-last-run">
                <span>Last run</span>
                <strong>
                  {new Date(runResult.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </strong>
              </div>
            </>
          ) : (
            <p>
              {runResult
                ? "Model changed. Press Run to refresh metrics."
                : "No run yet. Press Run to see live metrics."}
            </p>
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="builder-context-menu glass"
          role="menu"
          aria-label="Node actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setContextMenu(null);
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setChatOpen(false);
              setContextMenu(null);
              panelRef.current
                ?.querySelector<HTMLInputElement>("input")
                ?.focus();
            }}
          >
            Edit node
          </button>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setContextMenu(null);
              deleteSelection();
            }}
          >
            Delete node
          </button>
        </div>
      )}
      {paletteOpen && (
        <BuilderCommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      <main
        className={`builder-body ${activeView !== "builder" ? "workspace-pages" : ""}`}
        aria-label={`${activeView === "analytics" ? "Insights" : activeView} workspace`}
      >
        {(error ||
          (message &&
            !(
              activeView === "analytics" && message.startsWith("Run completed")
            ))) && (
          <div
            role={error ? "alert" : "status"}
            className={`astra-notice builder-banner ${activeView !== "builder" ? "workspace-feedback" : ""} ${error ? "astra-notice-error" : ""}`}
          >
            {activeView !== "builder" && (
              <span aria-hidden="true">{error ? "⚠" : "●"} </span>
            )}
            {error ||
              (activeView !== "builder" && message.startsWith("Run completed")
                ? `Run completed · model v${runResult?.model_version ?? modelVersion}`
                : message)}
            {error && runStage === "error" && activeView !== "builder" && (
              <button
                className="builder-secondary"
                disabled={busy || loading || !nodes.length}
                onClick={() => void run()}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {validationIssues.length > 0 && (
          <ul
            className="astra-validation-list"
            aria-label="Model validation errors"
          >
            {validationIssues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
        )}

        <div className={activeView === "optimization" ? "" : "astra-hidden"}>
          <OptimizationPanel
            model={toSimulationModel(
              modelId || "unsaved",
              projectName,
              simulation,
              nodes,
              edges,
            )}
            busy={busy}
            setBusy={setBusy}
            onApply={applyOptimization}
            onGoBuilder={() => setActiveView("builder")}
            visible={activeView === "optimization"}
          />
        </div>

        <div
          className={`astra-workspace-grid builder-canvas-layout ${chatOpen || selectedNode || selectedEdge || settingsOpen ? "builder-panel-open" : ""} ${activeView !== "builder" && !chatOpen && !settingsOpen ? "astra-hidden" : ""}`}
        >
          <div className="builder-stage">
            <section
              className="astra-canvas-wrap"
              aria-label="Simulation canvas"
            >
              <div
                ref={canvasRef}
                className="astra-canvas"
                onDrop={onDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
              >
                <div
                  className={`builder-left-rail react-flow__panel ${effectiveToolPaletteExpanded ? "is-expanded" : "is-collapsed"}`}
                >
                  <div className="builder-toolbar-slot">
                    <aside
                      className={`builder-tool-palette glass ${effectiveToolPaletteExpanded ? "is-expanded" : "is-collapsed"}`}
                      aria-label="Node tools"
                    >
                      <div className="builder-tools-heading">
                        <div>
                          <strong>Blocks</strong>
                          <span>Drag onto canvas</span>
                        </div>
                        <button
                          type="button"
                          aria-label={
                            effectiveToolPaletteExpanded
                              ? "Collapse block panel"
                              : "Expand block panel"
                          }
                          aria-expanded={effectiveToolPaletteExpanded}
                          onClick={toggleToolPalette}
                          title={
                            effectiveToolPaletteExpanded
                              ? "Collapse block panel"
                              : "Expand block panel"
                          }
                          data-tooltip={
                            effectiveToolPaletteExpanded
                              ? "Collapse block panel"
                              : "Expand block panel"
                          }
                        >
                          <span aria-hidden="true">
                            <Icon
                              name={
                                effectiveToolPaletteExpanded
                                  ? "chevronsLeft"
                                  : "chevronsRight"
                              }
                              style={{ width: 16, height: 16 }}
                            />
                          </span>
                        </button>
                      </div>
                      {NODE_KINDS.map((kind) => {
                        const item = NODE_DEFINITIONS[kind];
                        return (
                          <button
                            key={kind}
                            type="button"
                            disabled={busy || loading}
                            tabIndex={
                              toolFocus === NODE_KINDS.indexOf(kind) ? 0 : -1
                            }
                            onFocus={() =>
                              setToolFocus(NODE_KINDS.indexOf(kind))
                            }
                            draggable
                            onDragStart={(event) => {
                              event.currentTarget.classList.add("is-dragging");
                              event.dataTransfer.setData(
                                "application/astra-node",
                                kind,
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={(event) =>
                              event.currentTarget.classList.remove(
                                "is-dragging",
                              )
                            }
                            onClick={() => {
                              if (toolDragged.current) {
                                toolDragged.current = false;
                                return;
                              }
                              setSelectedTool((current) =>
                                current === kind ? null : kind,
                              );
                            }}
                            onKeyDown={(event) => {
                              if (
                                [
                                  "ArrowUp",
                                  "ArrowDown",
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "Home",
                                  "End",
                                ].includes(event.key)
                              ) {
                                event.preventDefault();
                                const index = NODE_KINDS.indexOf(kind);
                                const next =
                                  event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? 5
                                      : (index +
                                          (["ArrowDown", "ArrowRight"].includes(
                                            event.key,
                                          )
                                            ? 1
                                            : -1) +
                                          6) %
                                        6;
                                setToolFocus(next);
                                event.currentTarget.parentElement
                                  ?.querySelectorAll<HTMLButtonElement>(
                                    ".builder-node-tool",
                                  )
                                  [next]?.focus();
                              }
                            }}
                            className={`builder-node-tool ${toolTip === kind ? "is-tooltip-open" : ""}`}
                            onPointerDown={(event) => {
                              if (event.pointerType !== "touch") return;
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
                              touchTool.current = {
                                kind,
                                x: event.clientX,
                                y: event.clientY,
                                dragging: false,
                              };
                              toolPressTimer.current = window.setTimeout(
                                () => setToolTip(kind),
                                500,
                              );
                            }}
                            onPointerMove={(event) => {
                              const touch = touchTool.current;
                              if (!touch || event.pointerType !== "touch")
                                return;
                              if (
                                Math.hypot(
                                  event.clientX - touch.x,
                                  event.clientY - touch.y,
                                ) > 12
                              ) {
                                touch.dragging = true;
                                toolDragged.current = true;
                                window.clearTimeout(toolPressTimer.current);
                                setToolTip(null);
                                event.currentTarget.classList.add(
                                  "is-dragging",
                                );
                              }
                            }}
                            onPointerUp={(event) => {
                              window.clearTimeout(toolPressTimer.current);
                              event.currentTarget.classList.remove(
                                "is-dragging",
                              );
                              const touch = touchTool.current;
                              const bounds =
                                canvasRef.current?.getBoundingClientRect();
                              if (
                                touch?.dragging &&
                                bounds &&
                                event.clientX >= bounds.left &&
                                event.clientX <= bounds.right &&
                                event.clientY >= bounds.top &&
                                event.clientY < bounds.bottom - 60
                              ) {
                                addNode(
                                  touch.kind,
                                  event.clientX,
                                  event.clientY,
                                );
                                setSelectedTool(null);
                              }
                              touchTool.current = null;
                            }}
                            onPointerCancel={(event) => {
                              window.clearTimeout(toolPressTimer.current);
                              touchTool.current = null;
                              toolDragged.current = false;
                              event.currentTarget.classList.remove(
                                "is-dragging",
                              );
                            }}
                            aria-label={item.label}
                            aria-describedby={`builder-tool-tip-${kind}`}
                            aria-pressed={selectedTool === kind}
                          >
                            <span
                              className="builder-tool-symbol"
                              aria-hidden="true"
                            >
                              <Icon
                                name={item.icon}
                                style={{ width: 20, height: 20 }}
                              />
                            </span>
                            <span className="builder-tool-name">
                              {item.label}
                            </span>
                            <span
                              id={`builder-tool-tip-${kind}`}
                              className="builder-tool-tip"
                              role="tooltip"
                            >
                              {item.label} <kbd>{TOOL_KEYS[kind]}</kbd>
                            </span>
                          </button>
                        );
                      })}
                    </aside>
                  </div>
                </div>
                <ReactFlow<EditorNode, EditorEdge>
                  tabIndex={0}
                  aria-label="Simulation canvas"
                  proOptions={{ hideAttribution: true }}
                  ariaLabelConfig={{ "controls.fitView.ariaLabel": "Fit view" }}
                  nodes={canvasNodes}
                  edges={canvasEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodeDragStart={() => {
                    history.current.push({ nodes, edges, dirty });
                    if (history.current.length > 50) history.current.shift();
                  }}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={connect}
                  connectionLineType={ConnectionLineType.SmoothStep}
                  connectionLineStyle={{
                    stroke: "var(--accent)",
                    strokeWidth: 2,
                  }}
                  onNodeContextMenu={(event, node) => {
                    event.preventDefault();
                    setNodes((current) =>
                      current.map((item) => ({
                        ...item,
                        selected: item.id === node.id,
                      })),
                    );
                    setContextMenu({
                      x: Math.min(event.clientX, window.innerWidth - 180),
                      y: Math.min(event.clientY, window.innerHeight - 120),
                    });
                  }}
                  onBeforeDelete={async ({ nodes: removed }) =>
                    !removed.some((node) =>
                      edges.some(
                        (edge) =>
                          edge.source === node.id || edge.target === node.id,
                      ),
                    ) ||
                    window.confirm(
                      "Delete selected nodes and their connected links?",
                    )
                  }
                  onPaneClick={(event) => {
                    setContextMenu(null);
                    if (selectedTool) {
                      addNode(selectedTool, event.clientX, event.clientY);
                      setSelectedTool(null);
                    }
                  }}
                  nodesDraggable={!busy}
                  nodesConnectable={!busy}
                  minZoom={0.08}
                  maxZoom={2}
                  panOnDrag={panMode ? true : [1, 2]}
                  selectionOnDrag={!panMode}
                  panOnScroll
                  zoomOnPinch
                  fitViewOptions={BUILDER_FIT}
                  snapToGrid
                  snapGrid={[16, 16]}
                  deleteKeyCode={busy ? null : ["Backspace", "Delete"]}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    interactionWidth: 12,
                    style: {
                      stroke: "var(--edge)",
                      strokeWidth: 2,
                      opacity: 1,
                    },
                    markerEnd: {
                      type: MarkerType.ArrowClosed,
                      width: 14,
                      height: 14,
                      color: "var(--edge-arrow)",
                    },
                  }}
                >
                  <CanvasGrid />
                </ReactFlow>
                <CanvasZoomControls onFit={() => fitBuilderView(200)}>
                  <button
                    aria-label="Select mode"
                    title="Select mode"
                    aria-pressed={!panMode}
                    onClick={() => setPanMode(false)}
                  >
                    <MousePointer2 size={20} />
                  </button>
                  <button
                    aria-label="Hand mode"
                    title="Hand mode"
                    aria-pressed={panMode}
                    onClick={() => setPanMode(true)}
                  >
                    <Hand size={20} />
                  </button>
                  <hr />
                </CanvasZoomControls>
                {nodes.length === 0 && !loading && (
                  <div className="astra-empty-canvas">
                    <p>
                      Start with a Source, or describe your process to Astra
                    </p>
                    <div>
                      <button
                        className="builder-secondary"
                        onClick={() => addNode("source")}
                      >
                        Add Source
                      </button>
                      <button
                        className="builder-primary"
                        onClick={() => setChatOpen(true)}
                      >
                        Generate with Astra
                      </button>
                    </div>
                  </div>
                )}
                {loading && (
                  <div className="astra-empty-canvas">
                    <p>Loading project…</p>
                  </div>
                )}
                {selectedTool && (
                  <p className="builder-placement-hint" role="status">
                    Click the canvas to place a{" "}
                    {NODE_DEFINITIONS[selectedTool].label}
                    <button
                      type="button"
                      onClick={() => setSelectedTool(null)}
                      aria-label="Cancel node placement"
                      title="Cancel node placement"
                      data-tooltip="Cancel node placement"
                    >
                      ×
                    </button>
                  </p>
                )}
              </div>
            </section>

            {!chatOpen && (selectedNode || selectedEdge || settingsOpen) && (
              <aside
                ref={panelRef}
                className="astra-sidebar astra-properties builder-inspector glass"
                aria-label="Properties"
                role="dialog"
                onKeyDown={(event) => {
                  if (window.innerWidth < 1024) trapFocus(event);
                  if (event.key === "Escape") closePanel();
                }}
              >
                <SheetHandle onClose={closePanel} />
                <header className="builder-inspector-heading">
                  {selectedNode && (
                    <span className="astra-node-icon">
                      <Icon name={NODE_DEFINITIONS[selectedNode.type].icon} />
                    </span>
                  )}
                  <div>
                    {selectedNode ? (
                      <>
                        <input
                          className="builder-inspector-name"
                          disabled={busy}
                          aria-label="Node name"
                          value={selectedNode.data.name}
                          onChange={(event) =>
                            updateSelectedNode({ name: event.target.value })
                          }
                        />
                        <div className="builder-inspector-chips">
                          <span>{selectedNode.type}</span>
                          {selectedNode.id === primaryNodeId && (
                            <span className="astra-node-bottleneck-badge">
                              ⚠ Bottleneck
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <strong>
                        {selectedEdge ? "Selected link" : "Simulation settings"}
                      </strong>
                    )}
                  </div>
                  <button
                    className="builder-icon-button"
                    aria-label="Close properties"
                    title="Close properties"
                    onClick={closePanel}
                  >
                    <Icon name="close" />
                  </button>
                </header>
                {selectedNode && (
                  <div
                    className="builder-inspector-tabs"
                    role="tablist"
                    aria-label="Node details"
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight"].includes(event.key))
                        return;
                      event.preventDefault();
                      const tabs = ["Configuration", "Live metrics", "Notes"];
                      const next =
                        (tabs.indexOf(inspectorTab) +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          3) %
                        3;
                      setInspectorTab(tabs[next]);
                      event.currentTarget
                        .querySelectorAll<HTMLButtonElement>("button")
                        [next]?.focus();
                    }}
                  >
                    {["Configuration", "Live metrics", "Notes"].map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={inspectorTab === tab}
                        tabIndex={inspectorTab === tab ? 0 : -1}
                        onClick={() => setInspectorTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
                <div className="builder-inspector-scroll">
                  {selectedNode ? (
                    <div
                      className="astra-properties-content"
                      role="tabpanel"
                      aria-label={inspectorTab}
                    >
                      {inspectorTab === "Configuration" && (
                        <>
                          <label className="astra-property-field">
                            <span>Name</span>
                            <input
                              disabled={busy}
                              aria-label="Configuration node name"
                              value={selectedNode.data.name}
                              onChange={(event) =>
                                updateSelectedNode({ name: event.target.value })
                              }
                            />
                          </label>
                          <NodeProperties
                            key={selectedNode.id}
                            node={selectedNode}
                            disabled={busy}
                            onChange={(config) =>
                              updateSelectedNode({ config })
                            }
                            issues={validationIssues.filter(
                              (issue) =>
                                issue.path.includes(
                                  `nodes.${nodes.indexOf(selectedNode)}.`,
                                ) || issue.path.includes(selectedNode.id),
                            )}
                          />
                        </>
                      )}
                      {inspectorTab === "Live metrics" &&
                        (resultMatchesCanvas && runResult ? (
                          <>
                            <dl className="builder-live-metrics">
                              {Object.entries(
                                runResult.node_metrics[selectedNode.id] ?? {},
                              ).map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key.replaceAll("_", " ")}</dt>
                                  <dd>
                                    {value == null
                                      ? "--"
                                      : typeof value === "number"
                                        ? key === "resource_utilization"
                                          ? `${(value * 100).toFixed(1)}%`
                                          : Number(value.toFixed(2))
                                        : String(value)}
                                    {key === "resource_utilization" &&
                                      typeof value === "number" && (
                                        <span
                                          className="builder-utilization-bar"
                                          aria-hidden="true"
                                        >
                                          <i
                                            style={{
                                              width: `${Math.min(100, value * 100)}%`,
                                            }}
                                          />
                                        </span>
                                      )}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            {!runResult.node_metrics[selectedNode.id] && (
                              <dl className="builder-live-metrics">
                                {nodeRows(
                                  selectedNode,
                                  runResult,
                                  playbackRun,
                                  edges,
                                  nodes,
                                ).map(([label, value]) => (
                                  <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </>
                        ) : (
                          <p className="builder-panel-empty">
                            {runResult
                              ? "Run again to measure this configuration."
                              : "No run yet. Press Run to see live metrics."}
                          </p>
                        ))}
                      {inspectorTab === "Notes" && (
                        <label className="builder-notes">
                          <span>Notes</span>
                          <textarea
                            aria-label="Node notes"
                            rows={8}
                            value={notes[selectedNode.id] ?? ""}
                            onChange={(event) => {
                              const next = {
                                ...notes,
                                [selectedNode.id]: event.target.value,
                              };
                              setNotes(next);
                              try {
                                localStorage.setItem(
                                  `astra-builder-notes-${projectId ?? "draft"}`,
                                  JSON.stringify(next),
                                );
                              } catch {
                                /* Notes remain usable when storage is unavailable. */
                              }
                            }}
                          />
                          <small>Saved on this device.</small>
                        </label>
                      )}
                    </div>
                  ) : selectedEdge ? (
                    <div className="astra-properties-content">
                      <p className="builder-panel-empty">
                        {
                          nodes.find((node) => node.id === selectedEdge.source)
                            ?.data.name
                        }{" "}
                        →{" "}
                        {
                          nodes.find((node) => node.id === selectedEdge.target)
                            ?.data.name
                        }
                      </p>
                      {selectedEdge.data?.probability != null && (
                        <label className="astra-property-field">
                          <span>Probability</span>
                          <input
                            aria-label="Route probability"
                            type="number"
                            disabled={busy}
                            min={0}
                            max={1}
                            step="any"
                            value={selectedEdge.data.probability}
                            onChange={(event) => {
                              const probability =
                                event.currentTarget.valueAsNumber;
                              if (
                                Number.isFinite(probability) &&
                                probability >= 0 &&
                                probability <= 1
                              ) {
                                setEdges((current) =>
                                  current.map((edge) =>
                                    edge.id === selectedEdge.id
                                      ? {
                                          ...edge,
                                          data: { ...edge.data, probability },
                                        }
                                      : edge,
                                  ),
                                );
                                setDirty(true);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="astra-properties-content">
                      <label className="astra-property-field">
                        <span>Duration (min)</span>
                        <input
                          aria-label="Simulation duration"
                          type="number"
                          min="0.01"
                          max="10080"
                          step="any"
                          disabled={busy}
                          value={simulation.duration}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (value > 0 && value <= 10080) {
                              setSimulation((current) => ({
                                ...current,
                                duration: value,
                              }));
                              setDirty(true);
                            }
                          }}
                        />
                      </label>
                      <label className="astra-property-field">
                        <span>Random seed</span>
                        <input
                          aria-label="Random seed"
                          type="number"
                          step="1"
                          disabled={busy}
                          value={simulation.seed}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isSafeInteger(value)) {
                              setSimulation((current) => ({
                                ...current,
                                seed: value,
                              }));
                              setDirty(true);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
                {(selectedNode || selectedEdge) && (
                  <footer className="builder-inspector-footer">
                    <button
                      disabled={busy}
                      className="astra-delete-button"
                      onClick={deleteSelection}
                    >
                      Delete {selectedNode ? "node" : "connection"}
                    </button>
                  </footer>
                )}
              </aside>
            )}
          </div>
          {(chatOpen || selectedNode || selectedEdge || settingsOpen) && (
            <button
              className="builder-sheet-scrim"
              aria-label="Close panel"
              onClick={() => {
                setChatOpen(false);
                closePanel();
              }}
            />
          )}
          <ModelChat
            disabled={busy || loading}
            open={chatOpen}
            onClose={() => {
              setChatOpen(false);
              generateButton.current?.focus();
            }}
            onImport={importGeneratedModel}
            onPendingChange={setChatGenerating}
          />
        </div>
        <div
          className={
            activeView === "scenarios" ? "astra-scenarios-wrap" : "astra-hidden"
          }
        >
          <ScenariosPanel
            projectId={projectId}
            model={toSimulationModel(
              modelId || "unsaved",
              projectName,
              simulation,
              nodes,
              edges,
            )}
            activeId={activeScenario?.id ?? null}
            revision={scenarioRevision}
            busy={busy}
            setBusy={setBusy}
            onLoad={loadScenario}
            onRun={runSavedScenario}
            onRenamed={(scenario) => {
              if (activeScenario?.id === scenario.id)
                setActiveScenario({ id: scenario.id, name: scenario.name });
            }}
            onDeleted={(id) => {
              if (activeScenario?.id === id) {
                setActiveScenario(null);
                setDirty(true);
              }
              setScenarioRevision((value) => value + 1);
            }}
          />
        </div>
        {playbackRun && (
          <SimulationPlayback
            key={playbackRun.id}
            run={playbackRun}
            visible={activeView === "playback"}
          />
        )}
        {activeView === "analytics" && runResult && (
          <AnalyticsDashboard
            run={runResult}
            nodes={
              toSimulationModel(
                modelId || "preview",
                projectName,
                simulation,
                nodes,
                edges,
              ).nodes
            }
            stale={!resultMatchesCanvas}
            onViewBottleneck={viewBottleneck}
            loading={busy}
          />
        )}
        {activeView === "analytics" && !runResult && (
          <AnalyticsEmptyState onRun={() => void run()} loading={busy} />
        )}
      </main>
    </WorkspaceShell>
  );
}

export function SimulatorWorkspace({ projectId }: { projectId?: string }) {
  return (
    <ReactFlowProvider>
      <WorkspaceCanvas initialProjectId={projectId} />
    </ReactFlowProvider>
  );
}
