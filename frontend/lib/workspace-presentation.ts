/** Presentation validation only; the API remains authoritative. */
export function validateOptimizationFields(fields: {
  minimum: string;
  maximum: string;
  step: string;
  replications: string;
  target: string;
  additional: string;
  percentage: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["minimum", "maximum", "step", "replications"] as const) {
    const n = Number(fields[key]),
      max = key === "replications" ? 10 : 100;
    if (!fields[key].trim() || !Number.isInteger(n) || n < 1 || n > max)
      errors[key] = `Enter a whole number from 1 to ${max}.`;
  }
  if (
    !errors.minimum &&
    !errors.maximum &&
    Number(fields.minimum) > Number(fields.maximum)
  )
    errors.maximum = "Maximum must be at least minimum resources.";
  const target = Number(fields.target);
  if (
    !fields.target.trim() ||
    !Number.isFinite(target) ||
    target < 0 ||
    (fields.percentage && target > 100)
  )
    errors.target = fields.percentage
      ? "Enter a target from 0 to 100%."
      : "Enter a nonnegative target.";
  if (
    fields.additional.trim() &&
    (!Number.isInteger(Number(fields.additional)) ||
      Number(fields.additional) < 0 ||
      Number(fields.additional) > 99)
  )
    errors.additional = "Enter a whole number from 0 to 99, or leave blank.";
  return errors;
}
export function measuredChange(
  key: string,
  difference: number | null,
): { label: string; direction: string; className: string } {
  if (difference === null)
    return { label: "Unavailable", direction: "—", className: "" };
  if (difference === 0)
    return { label: "Unchanged", direction: "→", className: "" };
  // These are measured outcome metrics, never a guess about utilization desirability.
  const higherBetter = [
    "throughput",
    "total_completed",
    "completion_rate",
  ].includes(key);
  const lowerBetter = [
    "average_waiting_time",
    "maximum_waiting_time",
    "average_cycle_time",
    "maximum_cycle_time",
    "total_rejected",
    "in_system_at_end",
  ].includes(key);
  const improved = higherBetter
    ? difference > 0
    : lowerBetter
      ? difference < 0
      : null;
  return {
    label: improved === null ? "Changed" : improved ? "Improved" : "Worse",
    direction: difference > 0 ? "↑" : "↓",
    className: improved === null ? "" : improved ? "is-success" : "is-error",
  };
}
