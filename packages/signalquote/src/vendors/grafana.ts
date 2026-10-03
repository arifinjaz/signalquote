import { type ResolvedRates, sources } from "../catalog.js";
import { breakdownFor, grafanaFormula, type ResolvedSeries } from "../cardinality.js";
import { bytesToGb, formatCount, monthlyCount, roundCents } from "../money.js";
import type { LineItem, NormalizedPlan, QuoteOptions, VendorQuote } from "../types.js";

function seriesCost(billableSeries: number, rates: ResolvedRates): number {
  if (rates.grafanaUsdPerThousandSeries !== null) {
    const paid = Math.max(0, billableSeries - rates.grafanaIncludedSeries);
    return (paid / 1000) * rates.grafanaUsdPerThousandSeries;
  }
  let remaining = Math.max(0, billableSeries);
  let cursor = 0;
  let cost = 0;
  for (const tier of rates.grafanaSeriesTiers) {
    const room = tier.limit - cursor;
    const take = Math.min(remaining, room);
    cost += (take / 1000) * tier.usdPerThousand;
    remaining -= take;
    cursor = tier.limit;
    if (remaining <= 0) break;
  }
  return cost;
}

function retainPeriods(days: number): number {
  if (days <= 30) return 0;
  return Math.ceil((days - 30) / 30);
}

export function quoteGrafana(
  plan: NormalizedPlan,
  series: ResolvedSeries[],
  rates: ResolvedRates,
  _options: QuoteOptions,
): VendorQuote {
  const items: LineItem[] = [];
  const assumptions = [
    `List prices as of ${sources.grafanaPricing.asOf}. The $19 platform fee is account-level and excluded so service quotes are not double-counted.`,
    `Billable series = max(active series, total data points per minute / included ${formatCount(rates.grafanaIncludedDpm)} DPM). A 15-second scrape is 4 DPM and quadruples the metrics line once you leave the ${formatCount(rates.grafanaIncludedSeries)} series included tier.`,
    "Classic histograms count as buckets + _sum + _count, including the +Inf bucket (finite buckets + 3). Native histograms count active buckets at 0.25 series each.",
    "95th-percentile billing and Adaptive Metrics are not applied. This is the steady plan before Grafana drops unused series.",
    `Logs and traces: $${rates.grafanaProcessUsdPerGb.toFixed(2)}/GB processed, $${rates.grafanaWriteUsdPerGb.toFixed(2)}/GB written after ${formatCount(rates.grafanaIncludedGb)} GB, $${rates.grafanaRetainUsdPerGbPer30Days.toFixed(2)}/GB for each 30-day retention block past the included 30 days.`,
  ];

  let activeSeries = 0;
  let totalDpm = 0;
  for (const entry of series) {
    const active = entry.grafanaSeries;
    const dpmEach = 60 / entry.metric.intervalSeconds;
    activeSeries += active;
    totalDpm += active * dpmEach;
    items.push({
      signal: "metrics",
      name: entry.metric.name,
      detail: `${formatCount(active)} active series at ${formatCount(dpmEach)} DPM`,
      quantity: active,
      unit: "active series",
      usd: 0,
    });
  }

  const billable = activeSeries === 0 ? 0 : Math.max(activeSeries, totalDpm / rates.grafanaIncludedDpm);
  const metricUsd = seriesCost(billable, rates);
  if (activeSeries > 0) {
    items.push({
      signal: "metrics",
      name: "Billable series",
      detail: `${formatCount(billable)} billable series after DPM, ${formatCount(rates.grafanaIncludedSeries)} included`,
      quantity: billable,
      unit: "billable series",
      usd: roundCents(metricUsd),
    });
  }

  const logProcessed = plan.logs.reduce((total, log) => total + bytesToGb(monthlyCount(log.eventsPerSecond) * log.avgBytes), 0);
  const logWritten = plan.logs.reduce(
    (total, log) => total + bytesToGb(monthlyCount(log.eventsPerSecond) * log.avgBytes) * (1 - log.adaptiveDropRatio),
    0,
  );
  if (plan.logs.length > 0) {
    items.push({
      signal: "logs",
      name: "Logs processed",
      detail: `${formatCount(logProcessed)} GB received, before Adaptive Logs`,
      quantity: logProcessed,
      unit: "GB",
      usd: roundCents(logProcessed * rates.grafanaProcessUsdPerGb),
    });
    const billableWritten = Math.max(0, logWritten - rates.grafanaIncludedGb);
    items.push({
      signal: "logs",
      name: "Logs written",
      detail: `${formatCount(logWritten)} GB written, ${formatCount(rates.grafanaIncludedGb)} GB included`,
      quantity: billableWritten,
      unit: "GB",
      usd: roundCents(billableWritten * rates.grafanaWriteUsdPerGb),
    });
    let retainGb = 0;
    for (const log of plan.logs) {
      const periods = retainPeriods(log.retentionDays);
      const written = bytesToGb(monthlyCount(log.eventsPerSecond) * log.avgBytes) * (1 - log.adaptiveDropRatio);
      retainGb += written * periods;
    }
    if (retainGb > 0) {
      items.push({
        signal: "logs",
        name: "Logs retained",
        detail: "Each 30 days past the included 30 is one retain block",
        quantity: retainGb,
        unit: "GB-blocks",
        usd: roundCents(retainGb * rates.grafanaRetainUsdPerGbPer30Days),
      });
    }
  }

  const traceProcessed = plan.spans.reduce(
    (total, span) => total + bytesToGb(monthlyCount(span.spansPerSecond) * span.avgBytes),
    0,
  );
  const traceWritten = plan.spans.reduce(
    (total, span) => total + bytesToGb(monthlyCount(span.spansPerSecond) * span.avgBytes) * (1 - span.adaptiveDropRatio),
    0,
  );
  if (plan.spans.length > 0) {
    items.push({
      signal: "traces",
      name: "Traces processed",
      detail: `${formatCount(traceProcessed)} GB received`,
      quantity: traceProcessed,
      unit: "GB",
      usd: roundCents(traceProcessed * rates.grafanaProcessUsdPerGb),
    });
    const billableWritten = Math.max(0, traceWritten - rates.grafanaIncludedGb);
    items.push({
      signal: "traces",
      name: "Traces written",
      detail: `${formatCount(traceWritten)} GB written, ${formatCount(rates.grafanaIncludedGb)} GB included`,
      quantity: billableWritten,
      unit: "GB",
      usd: roundCents(billableWritten * rates.grafanaWriteUsdPerGb),
    });
  }

  assumptions.push(
    `The ${formatCount(rates.grafanaIncludedGb)} GB allowance is per signal (logs and traces separately) and applies to the write meter. Process is charged on every GB received.`,
  );

  return {
    vendor: "grafana-cloud",
    displayName: "Grafana Cloud",
    usd: roundCents(items.reduce((total, item) => total + item.usd, 0)),
    lineItems: items,
    assumptions,
    sources: [sources.grafanaPricing, sources.grafanaMetrics, sources.grafanaInvoice],
    series: series.map((entry) => breakdownFor(entry, entry.grafanaSeries, grafanaFormula(entry))),
  };
}
