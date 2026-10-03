import type {
  AttributeDecl,
  LabelDecl,
  LogDecl,
  MetricDecl,
  MetricPurpose,
  NormalizedLog,
  NormalizedMetric,
  NormalizedPlan,
  NormalizedSpan,
  ResolvedAttribute,
  ResolvedLabel,
  SpanDecl,
  TelemetryPlan,
} from "./types.js";
import { PlanError } from "./types.js";
import { inferAttributeKind, inferLabelBounded } from "./names.js";

export const DEFAULT_ACTIONABLE_PURPOSES: MetricPurpose[] = ["latency", "traffic", "errors", "saturation"];
export const DEFAULT_FAIL_UNBOUNDED_ABOVE_USD = 50;
const METRIC_PURPOSES: MetricPurpose[] = ["latency", "traffic", "errors", "saturation", "other"];

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PlanError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requireNumber(value: unknown, path: string, { min = 0, integer = false } = {}): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new PlanError(`${path} must be a number`);
  }
  if (value < min) throw new PlanError(`${path} must be >= ${min}`);
  if (integer && !Number.isInteger(value)) throw new PlanError(`${path} must be an integer`);
  return value;
}

function resolveLabel(label: LabelDecl, path: string): ResolvedLabel {
  const name = requireString(label.name, `${path}.name`);
  const cardinality = requireNumber(label.cardinality, `${path}.cardinality`, { min: 1, integer: true });
  const inferred = label.bounded === undefined;
  const bounded = label.bounded ?? inferLabelBounded(name);
  return { name, cardinality, bounded, inferred };
}

function resolveAttribute(attribute: AttributeDecl, path: string): ResolvedAttribute {
  const name = requireString(attribute.name, `${path}.name`);
  const inferred = attribute.kind === undefined;
  const kind = attribute.kind ?? inferAttributeKind(name);
  return { name, kind, inferred };
}

function resolveMetric(metric: MetricDecl, index: number): NormalizedMetric {
  const path = `metrics[${index}]`;
  const type = metric.type ?? "gauge";
  if (!["gauge", "counter", "histogram", "native_histogram"].includes(type)) {
    throw new PlanError(`${path}.type is not a known metric type`);
  }
  return {
    name: requireString(metric.name, `${path}.name`),
    type,
    buckets: requireNumber(metric.buckets ?? 10, `${path}.buckets`, { min: 1, integer: true }),
    nativeBuckets: requireNumber(metric.nativeBuckets ?? 20, `${path}.nativeBuckets`, { min: 1, integer: true }),
    datadogPercentileMetrics: requireNumber(metric.datadogPercentileMetrics ?? 0, `${path}.datadogPercentileMetrics`, {
      min: 0,
      integer: true,
    }),
    intervalSeconds: requireNumber(metric.intervalSeconds ?? 60, `${path}.intervalSeconds`, { min: 1 }),
    purpose: metric.purpose ?? "other",
    labels: (metric.labels ?? []).map((label, labelIndex) => resolveLabel(label, `${path}.labels[${labelIndex}]`)),
  };
}

function resolveLog(log: LogDecl, index: number): NormalizedLog {
  const path = `logs[${index}]`;
  const indexRatio = requireNumber(log.indexRatio ?? 1, `${path}.indexRatio`, { min: 0 });
  if (indexRatio > 1) throw new PlanError(`${path}.indexRatio must be between 0 and 1`);
  const adaptiveDropRatio = requireNumber(log.adaptiveDropRatio ?? 0, `${path}.adaptiveDropRatio`, { min: 0 });
  if (adaptiveDropRatio > 1) throw new PlanError(`${path}.adaptiveDropRatio must be between 0 and 1`);
  const level = log.level ?? "info";
  if (!["debug", "info", "warn", "error"].includes(level)) {
    throw new PlanError(`${path}.level is not a known log level`);
  }
  return {
    name: requireString(log.name, `${path}.name`),
    eventsPerSecond: requireNumber(log.eventsPerSecond, `${path}.eventsPerSecond`, { min: 0 }),
    avgBytes: requireNumber(log.avgBytes, `${path}.avgBytes`, { min: 1 }),
    level,
    indexRatio,
    retentionDays: requireNumber(log.retentionDays ?? 15, `${path}.retentionDays`, { min: 1 }),
    adaptiveDropRatio,
    attributes: (log.attributes ?? []).map((attribute, attributeIndex) =>
      resolveAttribute(attribute, `${path}.attributes[${attributeIndex}]`),
    ),
  };
}

function resolveSpan(span: SpanDecl, index: number): NormalizedSpan {
  const path = `spans[${index}]`;
  const indexRatio = requireNumber(span.indexRatio ?? 1, `${path}.indexRatio`, { min: 0 });
  if (indexRatio > 1) throw new PlanError(`${path}.indexRatio must be between 0 and 1`);
  const adaptiveDropRatio = requireNumber(span.adaptiveDropRatio ?? 0, `${path}.adaptiveDropRatio`, { min: 0 });
  if (adaptiveDropRatio > 1) throw new PlanError(`${path}.adaptiveDropRatio must be between 0 and 1`);
  return {
    name: requireString(span.name, `${path}.name`),
    spansPerSecond: requireNumber(span.spansPerSecond, `${path}.spansPerSecond`, { min: 0 }),
    avgBytes: requireNumber(span.avgBytes, `${path}.avgBytes`, { min: 1 }),
    indexRatio,
    retentionDays: requireNumber(span.retentionDays ?? 15, `${path}.retentionDays`, { min: 1 }),
    adaptiveDropRatio,
    hasTraceId: span.hasTraceId ?? true,
  };
}

export function normalizePlan(input: TelemetryPlan): NormalizedPlan {
  if (input === null || typeof input !== "object") {
    throw new PlanError("A telemetry plan must be an object");
  }
  const service = requireString(input.service, "service");
  const hosts = requireNumber(input.hosts ?? 1, "hosts", { min: 0, integer: true });
  if (input.budgetUsdMonth !== undefined) {
    requireNumber(input.budgetUsdMonth, "budgetUsdMonth", { min: 0 });
  }
  const failUnboundedAboveUsd = requireNumber(
    input.failUnboundedAboveUsd ?? DEFAULT_FAIL_UNBOUNDED_ABOVE_USD,
    "failUnboundedAboveUsd",
    { min: 0 },
  );
  const allowUnboundedLabels = (input.allowUnboundedLabels ?? []).map((name, index) =>
    requireString(name, `allowUnboundedLabels[${index}]`),
  );
  const actionablePurposes = input.actionablePurposes ?? DEFAULT_ACTIONABLE_PURPOSES;
  for (const [index, purpose] of actionablePurposes.entries()) {
    if (!METRIC_PURPOSES.includes(purpose)) {
      throw new PlanError(`actionablePurposes[${index}] is not a known purpose`);
    }
  }
  const names = new Set<string>();
  const metrics = (input.metrics ?? []).map(resolveMetric);
  const logs = (input.logs ?? []).map(resolveLog);
  const spans = (input.spans ?? []).map(resolveSpan);
  for (const signal of [...metrics, ...logs, ...spans]) {
    if (names.has(signal.name)) throw new PlanError(`Duplicate signal name "${signal.name}"`);
    names.add(signal.name);
  }
  return {
    service,
    team: input.team?.trim() || undefined,
    budgetUsdMonth: input.budgetUsdMonth,
    hosts,
    allowUnboundedLabels,
    actionablePurposes,
    failUnboundedAboveUsd,
    metrics,
    logs,
    spans,
  };
}

function yamlString(value: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function planToYaml(plan: TelemetryPlan): string {
  const lines: string[] = [`service: ${yamlString(plan.service)}`];
  if (plan.team) lines.push(`team: ${yamlString(plan.team)}`);
  if (plan.hosts !== undefined) lines.push(`hosts: ${plan.hosts}`);
  if (plan.budgetUsdMonth !== undefined) lines.push(`budgetUsdMonth: ${plan.budgetUsdMonth}`);

  if (plan.metrics?.length) {
    lines.push("metrics:");
    for (const metric of plan.metrics) {
      lines.push(`  - name: ${yamlString(metric.name)}`);
      if (metric.type) lines.push(`    type: ${metric.type}`);
      if (metric.purpose) lines.push(`    purpose: ${metric.purpose}`);
      if (metric.intervalSeconds !== undefined) lines.push(`    intervalSeconds: ${metric.intervalSeconds}`);
      if (metric.buckets !== undefined) lines.push(`    buckets: ${metric.buckets}`);
      if (metric.nativeBuckets !== undefined) lines.push(`    nativeBuckets: ${metric.nativeBuckets}`);
      if (metric.datadogPercentileMetrics) {
        lines.push(`    datadogPercentileMetrics: ${metric.datadogPercentileMetrics}`);
      }
      if (metric.labels?.length) {
        lines.push("    labels:");
        for (const label of metric.labels) {
          lines.push(`      - name: ${yamlString(label.name)}`);
          lines.push(`        cardinality: ${label.cardinality}`);
          if (label.bounded !== undefined) lines.push(`        bounded: ${label.bounded}`);
        }
      }
    }
  }

  if (plan.logs?.length) {
    lines.push("logs:");
    for (const log of plan.logs) {
      lines.push(`  - name: ${yamlString(log.name)}`);
      lines.push(`    eventsPerSecond: ${log.eventsPerSecond}`);
      lines.push(`    avgBytes: ${log.avgBytes}`);
      if (log.level) lines.push(`    level: ${log.level}`);
      if (log.indexRatio !== undefined) lines.push(`    indexRatio: ${log.indexRatio}`);
      if (log.retentionDays !== undefined) lines.push(`    retentionDays: ${log.retentionDays}`);
      if (log.adaptiveDropRatio) lines.push(`    adaptiveDropRatio: ${log.adaptiveDropRatio}`);
      if (log.attributes?.length) {
        lines.push("    attributes:");
        for (const attribute of log.attributes) {
          lines.push(`      - name: ${yamlString(attribute.name)}`);
          if (attribute.kind) lines.push(`        kind: ${attribute.kind}`);
        }
      }
    }
  }

  if (plan.spans?.length) {
    lines.push("spans:");
    for (const span of plan.spans) {
      lines.push(`  - name: ${yamlString(span.name)}`);
      lines.push(`    spansPerSecond: ${span.spansPerSecond}`);
      lines.push(`    avgBytes: ${span.avgBytes}`);
      if (span.indexRatio !== undefined) lines.push(`    indexRatio: ${span.indexRatio}`);
      if (span.retentionDays !== undefined) lines.push(`    retentionDays: ${span.retentionDays}`);
      if (span.adaptiveDropRatio) lines.push(`    adaptiveDropRatio: ${span.adaptiveDropRatio}`);
      if (span.hasTraceId !== undefined) lines.push(`    hasTraceId: ${span.hasTraceId}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
