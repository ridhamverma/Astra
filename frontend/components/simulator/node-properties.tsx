import { useState } from "react";
import type { EditorNode } from "@/lib/simulation-editor";
import type { ApiIssue } from "@/services/api";

export type ConfigPatch = Record<string, string | number | null>;
function NumberField({
  field,
  label,
  value,
  disabled,
  optional = false,
  min = 0,
  integer = false,
  unit,
  issue,
  onChange,
}: {
  field: string;
  label: string;
  value: string | number | null;
  disabled: boolean;
  optional?: boolean;
  min?: number;
  integer?: boolean;
  unit?: string;
  issue?: string;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const error =
    draft != null
      ? `Enter ${integer ? "a whole number" : "a number"} of at least ${min}.`
      : issue;
  return (
    <label className="astra-property-field" htmlFor={`node-${field}`}>
      <span>{label}</span>
      <div className="builder-field-input">
        <input
          id={`node-${field}`}
          disabled={disabled}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `node-${field}-error` : undefined}
          type="number"
          min={min}
          step={integer ? 1 : "any"}
          placeholder={optional ? "Unlimited" : undefined}
          value={draft ?? value ?? ""}
          onChange={(event) => {
            const text = event.currentTarget.value;
            const number = event.currentTarget.valueAsNumber;
            if (text === "" && optional) {
              setDraft(null);
              onChange(null);
            } else if (
              Number.isFinite(number) &&
              number >= min &&
              (!integer || Number.isInteger(number))
            ) {
              setDraft(null);
              onChange(number);
            } else setDraft(text);
          }}
        />
        {unit && <span className="builder-input-unit">{unit}</span>}
      </div>
      {error && (
        <small id={`node-${field}-error`} className="builder-field-error">
          {error}
        </small>
      )}
    </label>
  );
}
export function NodeProperties({
  node,
  disabled,
  onChange,
  issues = [],
}: {
  node: EditorNode;
  disabled: boolean;
  onChange: (patch: ConfigPatch) => void;
  issues?: ApiIssue[];
}) {
  const config = node.data.config as unknown as Record<
    string,
    string | number | null
  >;
  const number = (
    key: string,
    label: string,
    optional = false,
    min = 0,
    integer = false,
    unit?: string,
  ) => (
    <NumberField
      key={key}
      field={key}
      label={label}
      value={config[key]}
      disabled={disabled}
      optional={optional}
      min={min}
      integer={integer}
      unit={unit}
      issue={issues.find((issue) => issue.path.endsWith(key))?.message}
      onChange={(value) => onChange({ [key]: value })}
    />
  );
  const timing = (
    distribution: string,
    mean: string,
    lower: string,
    upper: string,
    label: string,
  ) => (
    <>
      {config[distribution] !== "uniform" &&
        number(
          mean,
          `Mean ${label.toLowerCase()} time`,
          false,
          0.000001,
          false,
          "min",
        )}
      <label className="astra-property-field">
        <span>Distribution</span>
        <select
          aria-label={`${label} distribution`}
          disabled={disabled}
          value={config[distribution] ?? "constant"}
          onChange={(event) => {
            const value = event.target.value;
            const average = Number(config[mean]);
            onChange({
              [distribution]: value,
              [lower]: value === "uniform" ? average * 0.5 : null,
              [upper]: value === "uniform" ? average * 1.5 : null,
            });
          }}
        >
          <option value="constant">Constant</option>
          <option value="exponential">Exponential</option>
          <option value="uniform">Uniform</option>
        </select>
      </label>
      {config[distribution] === "uniform" && (
        <>
          {[lower, upper].map((key, index) => (
            <NumberField
              key={key}
              field={key}
              label={index ? "Maximum" : "Minimum"}
              disabled={disabled}
              issue={
                Number(config[upper]) <= Number(config[lower])
                  ? "Maximum must exceed minimum."
                  : issues.find((issue) => issue.path.endsWith(key))?.message
              }
              value={config[key]}
              min={0}
              unit="min"
              onChange={(value) => {
                const next = { ...config, [key]: value };
                onChange({
                  [key]: value,
                  [mean]: (Number(next[lower]) + Number(next[upper])) / 2,
                });
              }}
            />
          ))}
          <p className="astra-property-note">
            Mean: {config[mean]} min. Maximum must exceed minimum.
          </p>
        </>
      )}
    </>
  );
  switch (node.type) {
    case "source":
      return (
        <>
          {timing(
            "distribution",
            "mean_interarrival_time",
            "minimum_interarrival_time",
            "maximum_interarrival_time",
            "Interarrival",
          )}
          {number("max_entities", "Maximum entities", true, 1, true)}
        </>
      );
    case "queue":
      return (
        <>
          {number("capacity", "Capacity", true, 0, true, "entities")}
          <label className="astra-property-field">
            <span>Discipline</span>
            <input aria-label="Discipline" value="FIFO" readOnly />
          </label>
        </>
      );
    case "process":
      return (
        <>
          {timing(
            "service_distribution",
            "mean_service_time",
            "minimum_service_time",
            "maximum_service_time",
            "Service",
          )}
          {number("resource_count", "Resources", false, 1, true, "staff")}
          <details className="builder-advanced">
            <summary>Advanced</summary>
            {number("cost_per_resource", "Cost per resource", true)}
          </details>
        </>
      );
    case "delay":
      return timing(
        "distribution",
        "mean_delay",
        "minimum_delay",
        "maximum_delay",
        "Delay",
      );
    case "decision":
      return (
        <p className="astra-property-note">
          Select each branch link to edit its probability. Yes and No
          probabilities must total 100%.
        </p>
      );
    case "sink":
      return (
        <p className="astra-property-note">
          Entities complete here. No configuration is needed.
        </p>
      );
  }
}
