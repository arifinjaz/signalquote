import { type ResolvedRates, sources } from "../catalog.js";
import { resourceCardinality, type ResolvedSeries } from "../cardinality.js";
import { formatCount, monthlyCount, roundCents } from "../money.js";
import type { LineItem, NormalizedPlan, QuoteOptions, VendorQuote } from "../types.js";

export function quoteHoneycomb(
  plan: NormalizedPlan,
  series: ResolvedSeries[],
  rates: ResolvedRates,
  options: QuoteOptions,
): VendorQuote {
  const mode = options.honeycombMetricMode ?? "per-resource";
  const items: LineItem[] = [];
  let events = 0;

  const logEvents = plan.logs.reduce((total, log) => total + monthlyCount(log.eventsPerSecond), 0);
  const spanEvents = plan.spans.reduce((total, span) => total + monthlyCount(span.spansPerSecond), 0);
  events += logEvents + spanEvents;
  if (logEvents > 0) {
    items.push({
      signal: "logs",
      name: "Log events",
      detail: "Every log you send is one event. Indexing is not a separate meter.",
      quantity: logEvents,
      unit: "events",
      usd: 0,
    });
  }
  if (spanEvents > 0) {
    items.push({
      signal: "traces",
      name: "Span events",
      detail: "Every span you send is one event.",
      quantity: spanEvents,
      unit: "events",
      usd: 0,
    });
  }

  let metricEvents = 0;
  if (mode === "per-series") {
    for (const entry of series) {
      const samples = entry.datadogSeries * (monthlyCount(1) / entry.metric.intervalSeconds);
      metricEvents += samples;
    }
  } else if (series.length > 0) {
    const resources = resourceCardinality(plan);
    const intervals = new Set(series.map((entry) => entry.metric.intervalSeconds));
    for (const interval of intervals) {
      metricEvents += resources * (monthlyCount(1) / interval);
    }
  }

  if (metricEvents > 0) {
    events += metricEvents;
    items.push({
      signal: "metrics",
      name: mode === "per-resource" ? "Metrics collapsed per resource" : "Metrics as one event per series",
      detail:
        mode === "per-resource"
          ? "Samples that share a resource and interval collapse into one event, which is how Honeycomb describes metric ingest."
          : "Pessimistic mode: every series sample is its own event. High cardinality is no longer free.",
      quantity: metricEvents,
      unit: "events",
      usd: 0,
    });
  }

  let usd = 0;
  if (events > rates.honeycombFreeEvents) {
    const usage = (events / 1_000_000) * rates.honeycombUsdPerMillionEvents;
    usd = Math.max(rates.honeycombProMinimumUsd, usage);
  }

  if (events > 0 && usd > 0) {
    let assigned = 0;
    const priced = items.filter((item) => item.quantity > 0);
    priced.forEach((item, index) => {
      const share = index === priced.length - 1 ? usd - assigned : usd * (item.quantity / events);
      const line = roundCents(share);
      assigned += line;
      item.usd = line;
    });
  } else if (events > 0) {
    items.push({
      signal: "credit",
      name: "Free tier",
      detail: `${formatCount(events)} events inside the ${formatCount(rates.honeycombFreeEvents)} free tier`,
      quantity: events,
      unit: "events",
      usd: 0,
    });
  }

  return {
    vendor: "honeycomb",
    displayName: "Honeycomb",
    usd: roundCents(items.reduce((total, item) => total + item.usd, 0)),
    lineItems: items,
    assumptions: [
      `Pro list rate is $${rates.honeycombUsdPerMillionEvents.toFixed(2)} per million events. Free tier is ${formatCount(rates.honeycombFreeEvents)} events. Usage above the free tier is quoted at least $${rates.honeycombProMinimumUsd.toFixed(0)}, which is the smallest Pro plan.`,
      "Cardinality does not change the event price. A user_id field on a span costs the same as a status code. Volume does.",
      "Time-series metric data points are a separate allotment (Free 100M, Pro from 250M) without a public overage rate in this catalog, so they are not dollarized. per-resource mode counts collapsed metric events instead.",
      "indexRatio is ignored. Honeycomb has no index meter; sample before you send.",
    ],
    sources: [sources.honeycomb, sources.honeycombPricing],
    series: [],
  };
}
