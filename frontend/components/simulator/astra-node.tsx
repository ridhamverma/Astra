import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Icon } from "@/components/dashboard/icon";
import { NODE_DEFINITIONS, type EditorNode } from "@/lib/simulation-editor";

export const AstraNode = memo(function AstraNode({
  data,
  type,
  selected,
}: NodeProps<EditorNode>) {
  const definition = NODE_DEFINITIONS[type];
  if (!data.builderPresentation)
    return (
      <div
        className={`astra-node ${selected ? "astra-node-selected" : ""} ${data.bottleneck ? "astra-node-bottleneck" : ""}`}
        style={{ "--node-accent": definition.accent } as CSSProperties}
      >
        {data.bottleneck && (
          <span className="astra-node-bottleneck-badge">
            Primary bottleneck
          </span>
        )}
        {type !== "source" && (
          <Handle
            type="target"
            position={Position.Left}
            className="astra-handle"
          />
        )}
        <div className="astra-node-icon" aria-hidden="true">
          <Icon name={definition.icon} style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {data.name}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {legacyDetail(type, data.config)}
          </div>
        </div>
        {type !== "sink" && (
          <Handle
            type="source"
            position={Position.Right}
            className="astra-handle"
          />
        )}
      </div>
    );
  return (
    <div
      data-kind={type}
      className={`astra-node glass ${selected ? "astra-node-selected" : ""} ${data.running ? "is-running" : ""}`}
    >
      {type !== "source" && (
        <Handle
          id="target-left"
          type="target"
          position={Position.Left}
          className="astra-handle"
          title="Input"
        />
      )}
      <div className="astra-node-top">
        <div className="astra-node-icon" aria-hidden="true">
          <Icon name={definition.icon} style={{ width: 20, height: 20 }} />
        </div>
        <span className="astra-node-type-label">
          {definition.label.toUpperCase()}
        </span>
        {data.bottleneck && (
          <span className="astra-node-bottleneck-badge">
            <svg
              aria-hidden="true"
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
            >
              <path d="m8 2 6 11H2Z M8 6v3m0 2v.1" />
            </svg>
            Bottleneck
          </span>
        )}
      </div>
      <div className="astra-node-title" title={data.name}>
        {data.name}
      </div>
      {type === "decision" && (
        <div
          className="astra-decision-bar"
          aria-hidden="true"
          style={
            {
              "--split": `${(data.yesProbability ?? 0) * 100}%`,
            } as CSSProperties
          }
        >
          <i />
        </div>
      )}
      <dl className="astra-node-data">
        {data.rows?.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={value === "--" ? "is-unmeasured" : ""}>{value}</dd>
          </div>
        ))}
      </dl>
      {data.error && (
        <span className="astra-node-error" role="status" title={data.error}>
          ⚠ Check configuration
        </span>
      )}
      {type === "decision" ? (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Right}
            style={{ top: "35%" }}
            className="astra-handle"
            title="Yes branch"
            aria-label="Yes branch"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Right}
            style={{ top: "65%" }}
            className="astra-handle"
            title="No branch"
            aria-label="No branch"
          />
        </>
      ) : (
        type !== "sink" && (
          <Handle
            id="source-right"
            type="source"
            position={Position.Right}
            className="astra-handle"
            title="Output"
          />
        )
      )}
    </div>
  );
});

function legacyDetail(
  type: EditorNode["type"],
  config: EditorNode["data"]["config"],
): string {
  switch (type) {
    case "source":
      return `Every ${"mean_interarrival_time" in config ? config.mean_interarrival_time : 5} min`;
    case "queue":
      return `FIFO · ${"capacity" in config && config.capacity !== null ? `${config.capacity} places` : "unlimited"}`;
    case "process":
      return `${"resource_count" in config ? config.resource_count : 1} resource${"resource_count" in config && config.resource_count === 1 ? "" : "s"}`;
    case "decision":
      return "Probability routing";
    case "delay":
      return `${"mean_delay" in config ? config.mean_delay : 2} min delay`;
    case "sink":
      return "Completed entities";
  }
}
