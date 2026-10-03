import { type ResolvedRates, sources } from "../catalog.js";
import { breakdownFor, cloudwatchFormula, type ResolvedSeries } from "../cardinality.js";
import { bytesToGb, formatCount, monthlyCount, priceTiers, roundCents } from "../money.js";
import type { LineItem, NormalizedPlan, QuoteOptions, VendorQuote } from "../types.js";

export function quoteCloudWatch(
  plan: NormalizedPlan,
  series: ResolvedSeries[],
  rates: ResolvedRates,
  _options: QuoteOptions,
): VendorQuote {
  const items: LineItem[] = [];
  const assumptions = [
    `US East (N. Virginia) list prices as of ${sources.cloudwatch.asOf}. Other regions differ. API request charges for PutMetricData are excluded.`,
    `Classic custom metrics use the catalog tiers (${rates.cloudwatchMetricTiers.map((tier) => `$${tier.usdEach.toFixed(2)} through ${Number.isFinite(tier.limit) ? tier.limit.toLocaleString("en-US") : "the rest"}`).join(", ")}). The published 35-metric example charges every metric, so no extra 10-metric free tier is subtracted.`,
    "A Prometheus-style histogram is one custom metric per bucket series. Gauges and counters are one metric per dimension combination. The host tag is not implied; add an instance dimension if each host emits its own metric.",
    `Standard log ingest is $${rates.cloudwatchLogIngestUsdPerGb.toFixed(2)}/GB after the first ${formatCount(rates.cloudwatchLogIngestFreeGb)} GB, plus $${rates.cloudwatchLogStorageUsdPerGbMonth.toFixed(2)} per GB-month stored. AWS describes that free tier as covering ingest, archive storage, and Logs Insights scans together, and its examples price storage on compressed bytes. This quote waives the free gigabytes on ingest only and estimates storage as uncompressed ingest × retention / 30 days.`,
    "The separate OpenTelemetry-metrics $0.50/GB product is not added on top of classic custom metrics.",
  ];

  let metricCount = 0;
  for (const entry of series) {
    metricCount += entry.cloudwatchSeries;
    items.push({
      signal: "metrics",
      name: entry.metric.name,
      detail: `${formatCount(entry.cloudwatchSeries)} custom metrics`,
      quantity: entry.cloudwatchSeries,
      unit: "metrics",
      usd: 0,
    });
  }
  if (metricCount > 0) {
    const usd =
      rates.cloudwatchUsdPerMetric !== null
        ? metricCount * rates.cloudwatchUsdPerMetric
        : priceTiers(metricCount, rates.cloudwatchMetricTiers);
    items.push({
      signal: "metrics",
      name: "Custom metric tiers",
      detail: `${formatCount(metricCount)} metrics across the published volume tiers`,
      quantity: metricCount,
      unit: "metrics",
      usd: roundCents(usd),
    });
  }

  let logGb = 0;
  let storedGb = 0;
  for (const log of plan.logs) {
    const gb = bytesToGb(monthlyCount(log.eventsPerSecond) * log.avgBytes);
    logGb += gb;
    storedGb += gb * (log.retentionDays / 30);
    items.push({
      signal: "logs",
      name: log.name,
      detail: `${formatCount(gb)} GB ingested, retained ${formatCount(log.retentionDays)} days`,
      quantity: gb,
      unit: "GB",
      usd: 0,
    });
  }
  if (logGb > 0) {
    const billable = Math.max(0, logGb - rates.cloudwatchLogIngestFreeGb);
    items.push({
      signal: "logs",
      name: "Log ingest",
      detail: `${formatCount(logGb)} GB, first ${formatCount(rates.cloudwatchLogIngestFreeGb)} GB at $0`,
      quantity: billable,
      unit: "GB",
      usd: roundCents(billable * rates.cloudwatchLogIngestUsdPerGb),
    });
    items.push({
      signal: "logs",
      name: "Log storage",
      detail: `${formatCount(storedGb)} GB-months stored`,
      quantity: storedGb,
      unit: "GB-month",
      usd: roundCents(storedGb * rates.cloudwatchLogStorageUsdPerGbMonth),
    });
  }

  return {
    vendor: "cloudwatch",
    displayName: "CloudWatch",
    usd: roundCents(items.reduce((total, item) => total + item.usd, 0)),
    lineItems: items,
    assumptions,
    sources: [sources.cloudwatch],
    series: series.map((entry) => breakdownFor(entry, entry.cloudwatchSeries, cloudwatchFormula(entry))),
  };
}
