import { type ResolvedRates, sources } from "../catalog.js";
import type { ResolvedSeries } from "../cardinality.js";
import { MONTH_SECONDS, bytesToGb, formatCount, monthlyCount, roundCents } from "../money.js";
import type { LineItem, NormalizedPlan, QuoteOptions, VendorQuote } from "../types.js";

export function quoteNewRelic(
  plan: NormalizedPlan,
  series: ResolvedSeries[],
  rates: ResolvedRates,
  options: QuoteOptions,
): VendorQuote {
  const bytesPerSample = options.bytesPerMetricSample ?? 150;
  const rate = options.newRelicDataPlus ? Math.max(rates.newRelicUsdPerGb, rates.newRelicDataPlusUsdPerGb) : rates.newRelicUsdPerGb;
  const items: LineItem[] = [];
  let totalGb = 0;

  for (const entry of series) {
    const samples = entry.grafanaSeries * (MONTH_SECONDS / entry.metric.intervalSeconds);
    const gb = bytesToGb(samples * bytesPerSample);
    totalGb += gb;
    items.push({
      signal: "metrics",
      name: entry.metric.name,
      detail: `${formatCount(samples)} samples × ${bytesPerSample} bytes`,
      quantity: gb,
      unit: "GB",
      usd: 0,
    });
  }

  for (const log of plan.logs) {
    const gb = bytesToGb(monthlyCount(log.eventsPerSecond) * log.avgBytes);
    totalGb += gb;
    items.push({
      signal: "logs",
      name: log.name,
      detail: `${formatCount(gb)} GB ingested`,
      quantity: gb,
      unit: "GB",
      usd: 0,
    });
  }

  for (const span of plan.spans) {
    const gb = bytesToGb(monthlyCount(span.spansPerSecond) * span.avgBytes);
    totalGb += gb;
    items.push({
      signal: "traces",
      name: span.name,
      detail: `${formatCount(gb)} GB ingested`,
      quantity: gb,
      unit: "GB",
      usd: 0,
    });
  }

  const billable = Math.max(0, totalGb - rates.newRelicIncludedGb);
  const ingestUsd = billable * rate;
  if (totalGb > 0 && ingestUsd > 0) {
    let assigned = 0;
    const priced = items.filter((item) => item.quantity > 0);
    priced.forEach((item, index) => {
      const share = index === priced.length - 1 ? ingestUsd - assigned : ingestUsd * (item.quantity / totalGb);
      const usd = roundCents(share);
      assigned += usd;
      item.usd = usd;
      item.detail += `. Share of ${formatCount(totalGb)} GB after the ${formatCount(rates.newRelicIncludedGb)} GB allowance`;
    });
  }

  return {
    vendor: "newrelic",
    displayName: "New Relic",
    usd: roundCents(items.reduce((total, item) => total + item.usd, 0)),
    lineItems: items,
    assumptions: [
      `Data ingest is $${rate.toFixed(2)}/GB after ${formatCount(rates.newRelicIncludedGb)} GB. User seats are excluded.`,
      options.newRelicDataPlus
        ? `Data Plus is quoted at $${rates.newRelicDataPlusUsdPerGb.toFixed(2)}/GB when that is above the configured rate.`
        : `Original data option. Pass newRelicDataPlus: true for the $${rates.newRelicDataPlusUsdPerGb.toFixed(2)}/GB Data Plus rate.`,
      `Metric bytes assume ${bytesPerSample} bytes per Prometheus-style sample. Set bytesPerMetricSample from a real payload if you have one. indexRatio does not reduce this quote, because New Relic bills what you send.`,
      "The 100 GB allowance is account-level. Quoting one service against it overstates the free tier once other services share the account.",
    ],
    sources: [sources.newRelic],
    series: [],
  };
}
