import { formatCount } from "./money.js";
import { isHostLikeLabel } from "./names.js";
import type { NormalizedMetric, NormalizedPlan, ResolvedLabel, SeriesBreakdown } from "./types.js";

export type ResolvedSeries = {
  metric: NormalizedMetric;
  labelProduct: number;
  topLabel: ResolvedLabel | null;
  unboundedLabels: ResolvedLabel[];
  datadogSeries: number;
  datadogHostFactor: number;
  datadogImplicitHost: boolean;
  grafanaSeries: number;
  cloudwatchSeries: number;
  histogramMultiplier: number;
};

export function labelProduct(labels: ResolvedLabel[]): number {
  if (labels.length === 0) return 1;
  return labels.reduce((product, label) => product * label.cardinality, 1);
}

export function prometheusMultiplier(metric: NormalizedMetric): number {
  if (metric.type === "histogram") return metric.buckets + 3;
  if (metric.type === "native_histogram") return metric.nativeBuckets;
  return 1;
}

function topLabel(labels: ResolvedLabel[]): ResolvedLabel | null {
  if (labels.length === 0) return null;
  return labels.reduce((best, label) => (label.cardinality > best.cardinality ? label : best));
}

export function formulaParts(metric: NormalizedMetric, hostFactor: number, extra?: string): string[] {
  const parts = metric.labels.map((label) => `${formatCount(label.cardinality)} ${label.name}`);
  if (hostFactor > 1) parts.push(`${formatCount(hostFactor)} hosts`);
  if (extra) parts.push(extra);
  return parts;
}

export function formatFormula(parts: string[], total: number, unit: string): string {
  if (parts.length === 0) return `${formatCount(total)} ${unit}`;
  return `${parts.join(" × ")} = ${formatCount(total)} ${unit}`;
}

export function resolveSeries(plan: NormalizedPlan): ResolvedSeries[] {
  return plan.metrics.map((metric) => {
    const product = labelProduct(metric.labels);
    const hasHostDimension = metric.labels.some((label) => isHostLikeLabel(label.name));
    const implicitHost = plan.hosts > 0 && !hasHostDimension;
    const hostFactor = implicitHost ? plan.hosts : 1;
    const percentileFactor = 1 + metric.datadogPercentileMetrics;
    const datadogSeries = product * hostFactor * percentileFactor;
    const multiplier = prometheusMultiplier(metric);
    const grafanaSeries =
      metric.type === "native_histogram" ? product * metric.nativeBuckets * 0.25 : product * multiplier;
    const cloudwatchSeries = product * (metric.type === "gauge" || metric.type === "counter" ? 1 : multiplier);
    const unboundedLabels = metric.labels.filter((label) => !label.bounded);
    return {
      metric,
      labelProduct: product,
      topLabel: topLabel(metric.labels),
      unboundedLabels,
      datadogSeries,
      datadogHostFactor: hostFactor,
      datadogImplicitHost: implicitHost,
      grafanaSeries,
      cloudwatchSeries,
      histogramMultiplier: multiplier,
    };
  });
}

export function breakdownFor(series: ResolvedSeries, count: number, formula: string): SeriesBreakdown {
  return {
    name: series.metric.name,
    series: count,
    multiplier: series.histogramMultiplier,
    topLabel: series.topLabel?.name ?? null,
    formula,
  };
}

export function datadogFormula(series: ResolvedSeries): string {
  const streams = 1 + series.metric.datadogPercentileMetrics;
  const extra = streams > 1 ? `${formatCount(streams)} Datadog metric streams` : undefined;
  return formatFormula(formulaParts(series.metric, series.datadogHostFactor, extra), series.datadogSeries, "custom metrics");
}

export function grafanaFormula(series: ResolvedSeries): string {
  const metric = series.metric;
  const extra =
    metric.type === "histogram"
      ? `${formatCount(series.histogramMultiplier)} histogram series`
      : metric.type === "native_histogram"
        ? `${formatCount(metric.nativeBuckets)} buckets × 0.25`
        : undefined;
  return formatFormula(formulaParts(metric, 1, extra), series.grafanaSeries, "active series");
}

export function cloudwatchFormula(series: ResolvedSeries): string {
  const extra =
    series.metric.type === "histogram" || series.metric.type === "native_histogram"
      ? `${formatCount(series.histogramMultiplier)} histogram series`
      : undefined;
  return formatFormula(formulaParts(series.metric, 1, extra), series.cloudwatchSeries, "custom metrics");
}

export function resourceCardinality(plan: NormalizedPlan): number {
  let best = plan.hosts > 0 ? plan.hosts : 1;
  for (const metric of plan.metrics) {
    for (const label of metric.labels) {
      if (isHostLikeLabel(label.name)) best = Math.max(best, label.cardinality);
    }
  }
  return best;
}
