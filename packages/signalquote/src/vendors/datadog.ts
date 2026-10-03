import {
  DATADOG_INDEX_RATES,
  DATADOG_RETENTION_DAYS,
  type DatadogRetention,
  type ResolvedRates,
  sources,
} from "../catalog.js";
import { breakdownFor, datadogFormula, type ResolvedSeries } from "../cardinality.js";
import { bytesToGb, formatCount, monthlyCount, roundCents } from "../money.js";
import type { LineItem, NormalizedPlan, QuoteOptions, VendorQuote } from "../types.js";
import { PlanError } from "../types.js";

function snapRetention(days: number): { billedDays: DatadogRetention; note: string | null } {
  if ((DATADOG_RETENTION_DAYS as readonly number[]).includes(days)) {
    return { billedDays: days as DatadogRetention, note: null };
  }
  const ceiling = DATADOG_RETENTION_DAYS.find((published) => published >= days);
  if (!ceiling) {
    return {
      billedDays: 30,
      note: `${days}-day retention is longer than Datadog's published 30-day list rate. Quoted at 30 days; a custom retention contract can cost more.`,
    };
  }
  return {
    billedDays: ceiling,
    note: `${days}-day retention is quoted at Datadog's published ${ceiling}-day list rate.`,
  };
}

function indexRate(days: number, billing: "annual" | "on-demand"): { usdPerMillion: number; note: string | null; billedDays: number } {
  const snapped = snapRetention(days);
  const rates = DATADOG_INDEX_RATES[snapped.billedDays];
  return {
    usdPerMillion: billing === "annual" ? rates.annual : rates.onDemand,
    note: snapped.note,
    billedDays: snapped.billedDays,
  };
}

export function quoteDatadog(
  plan: NormalizedPlan,
  series: ResolvedSeries[],
  rates: ResolvedRates,
  options: QuoteOptions,
): VendorQuote {
  const billing = options.datadogBilling ?? "on-demand";
  const datadogPlan = options.datadogPlan ?? "pro";
  const allowancePerHost = rates.datadogIndexedAllowancePerHost[datadogPlan];
  const allowance = allowancePerHost * plan.hosts;
  const items: LineItem[] = [];
  const assumptions = [
    `List prices as of ${sources.datadogList.asOf}. A negotiated contract replaces these rates; pass rates.datadogUsdPerHundredCustomMetrics to match yours.`,
    `Custom metrics use the cardinality model: one billable series per unique metric name plus tag values, averaged hourly. This quote uses the declared steady state, not an hourly average.`,
    `Indexed custom metrics are ${formatCount(allowancePerHost)} per ${datadogPlan} host (${formatCount(allowance)} across ${formatCount(plan.hosts)} hosts) at $${rates.datadogUsdPerHundredCustomMetrics} per 100 above the allotment (${billing} list).`,
    "Infrastructure and APM host fees are excluded. Allotments still apply.",
    "A distribution is one custom metric per tag set. Histogram buckets multiply Grafana and CloudWatch, not Datadog, unless datadogPercentileMetrics is set.",
    "indexRatio changes the index meter only. Ingest GB is everything you send.",
    "The public list also has a month-to-month column between annual and on-demand. This quote uses annual or on-demand. Pass a rate override for a month-to-month contract.",
  ];

  let metricSeries = 0;
  let implicitHost = false;
  for (const entry of series) {
    metricSeries += entry.datadogSeries;
    implicitHost = implicitHost || entry.datadogImplicitHost;
    const gross = (entry.datadogSeries / 100) * rates.datadogUsdPerHundredCustomMetrics;
    items.push({
      signal: "metrics",
      name: entry.metric.name,
      detail: datadogFormula(entry),
      quantity: entry.datadogSeries,
      unit: "custom metrics",
      usd: roundCents(gross),
    });
  }
  if (implicitHost) {
    assumptions.push(
      `Metrics without a host, pod, or instance label are multiplied by ${formatCount(plan.hosts)} paid hosts. Datadog adds the host tag. If pod and host are correlated, set a host-like label to the real combination count instead.`,
    );
  }

  if (allowance > 0 && metricSeries > 0) {
    const covered = Math.min(metricSeries, allowance);
    const credit = (covered / 100) * rates.datadogUsdPerHundredCustomMetrics;
    items.push({
      signal: "credit",
      name: "Host allotment",
      detail: `${formatCount(covered)} of ${formatCount(allowance)} included custom metrics`,
      quantity: covered,
      unit: "custom metrics",
      usd: roundCents(-credit),
    });
  }

  if (options.datadogMetricsWithoutLimits && metricSeries > allowance) {
    const ingestedAllowance = rates.datadogIndexedAllowancePerHost[datadogPlan] * plan.hosts;
    const ingestedBillable = Math.max(0, metricSeries - ingestedAllowance);
    items.push({
      signal: "metrics",
      name: "Metrics without Limits ingest",
      detail: `${formatCount(ingestedBillable)} ingested custom metrics above the allotment`,
      quantity: ingestedBillable,
      unit: "ingested custom metrics",
      usd: roundCents((ingestedBillable / 100) * rates.datadogUsdPerHundredIngestedCustomMetrics),
    });
    assumptions.push("Metrics without Limits adds $0.10 per 100 ingested custom metrics above the same per-host allotment, on top of indexed custom metrics.");
  }

  for (const log of plan.logs) {
    const events = monthlyCount(log.eventsPerSecond);
    const gb = bytesToGb(events * log.avgBytes);
    items.push({
      signal: "logs",
      name: log.name,
      detail: `${formatCount(gb)} GB ingested`,
      quantity: gb,
      unit: "GB ingested",
      usd: roundCents(gb * rates.datadogLogIngestUsdPerGb),
    });
    if (log.indexRatio > 0) {
      const indexed = events * log.indexRatio;
      const rate = indexRate(log.retentionDays, billing);
      if (rate.note) assumptions.push(`${log.name}: ${rate.note}`);
      items.push({
        signal: "logs",
        name: `${log.name} index`,
        detail: `${formatCount(indexed)} indexed events at the ${rate.billedDays}-day ${billing} rate`,
        quantity: indexed,
        unit: "indexed events",
        usd: roundCents((indexed / 1_000_000) * rate.usdPerMillion),
      });
    }
  }

  const spanGb = plan.spans.reduce((total, span) => total + bytesToGb(monthlyCount(span.spansPerSecond) * span.avgBytes), 0);
  const spanIndexed = plan.spans.reduce(
    (total, span) => total + monthlyCount(span.spansPerSecond) * span.indexRatio,
    0,
  );
  if (plan.spans.length > 0) {
    const ingestAllowance = rates.datadogSpanIngestAllowanceGbPerHost * plan.hosts;
    const billableGb = Math.max(0, spanGb - ingestAllowance);
    items.push({
      signal: "traces",
      name: "Ingested spans",
      detail: `${formatCount(spanGb)} GB sent, ${formatCount(ingestAllowance)} GB included with ${formatCount(plan.hosts)} APM hosts`,
      quantity: billableGb,
      unit: "GB over allotment",
      usd: roundCents(billableGb * rates.datadogSpanIngestUsdPerGb),
    });
    const indexAllowance = rates.datadogSpanIndexAllowancePerHost * plan.hosts;
    const billableIndexed = Math.max(0, spanIndexed - indexAllowance);
    const retention = Math.max(...plan.spans.map((span) => span.retentionDays));
    const rate = indexRate(retention, billing);
    if (rate.note) assumptions.push(`Indexed spans: ${rate.note}`);
    items.push({
      signal: "traces",
      name: "Indexed spans",
      detail: `${formatCount(spanIndexed)} indexed spans, ${formatCount(indexAllowance)} included, ${rate.billedDays}-day ${billing} rate`,
      quantity: billableIndexed,
      unit: "indexed spans over allotment",
      usd: roundCents((billableIndexed / 1_000_000) * rate.usdPerMillion),
    });
    assumptions.push("Span ingest includes 150 GB per APM host and indexed spans include 1 million per APM host. Hosts with no APM still need an APM subscription for that allotment; the host fee itself is not in this quote.");
  }

  if (billing === "annual") {
    assumptions.push("Annual list rates are lower than on-demand. Switch datadogBilling to on-demand to quote month-to-month list.");
  }

  const usd = roundCents(items.reduce((total, item) => total + item.usd, 0));
  if (!Number.isFinite(usd)) throw new PlanError("Datadog quote overflowed. Reduce declared cardinality.");

  return {
    vendor: "datadog",
    displayName: "Datadog",
    usd,
    lineItems: items,
    assumptions: unique(assumptions),
    sources: [sources.datadogList, sources.datadogMetrics, sources.datadogApm],
    series: series.map((entry) => breakdownFor(entry, entry.datadogSeries, datadogFormula(entry))),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
