import { CATALOG_AS_OF, CATALOG_STAMP, CATALOG_VERSION, resolveRates } from "./catalog.js";
import { resolveSeries, type ResolvedSeries } from "./cardinality.js";
import { formatUsd } from "./money.js";
import { normalizePlan } from "./plan.js";
import type {
  Finding,
  NormalizedPlan,
  PrimaryDriver,
  QuoteOptions,
  QuoteReport,
  TelemetryPlan,
  VendorId,
  VendorQuote,
} from "./types.js";
import { VENDOR_IDS } from "./types.js";
import { quoteCloudWatch } from "./vendors/cloudwatch.js";
import { quoteDatadog } from "./vendors/datadog.js";
import { quoteGrafana } from "./vendors/grafana.js";
import { quoteHoneycomb } from "./vendors/honeycomb.js";
import { quoteNewRelic } from "./vendors/newrelic.js";
import { reviewYield } from "./yield.js";

function vendorsOf(options: QuoteOptions): VendorId[] {
  const vendors = options.vendors ?? [...VENDOR_IDS];
  const unknown = vendors.filter((vendor) => !VENDOR_IDS.includes(vendor));
  if (unknown.length > 0) {
    throw new Error(`Unknown vendor: ${unknown.join(", ")}`);
  }
  return vendors;
}

export function priceNormalized(plan: NormalizedPlan, series: ResolvedSeries[], options: QuoteOptions = {}): VendorQuote[] {
  const rates = resolveRates(options.rates);
  const quotes: VendorQuote[] = [];
  for (const vendor of vendorsOf(options)) {
    if (vendor === "datadog") quotes.push(quoteDatadog(plan, series, rates, options));
    if (vendor === "grafana-cloud") quotes.push(quoteGrafana(plan, series, rates, options));
    if (vendor === "newrelic") quotes.push(quoteNewRelic(plan, series, rates, options));
    if (vendor === "honeycomb") quotes.push(quoteHoneycomb(plan, series, rates, options));
    if (vendor === "cloudwatch") quotes.push(quoteCloudWatch(plan, series, rates, options));
  }
  for (const quote of quotes) quote.assumptions.unshift(CATALOG_STAMP);
  return quotes;
}

function metricUsd(quote: VendorQuote): number {
  return quote.lineItems
    .filter((item) => item.signal === "metrics" || item.name === "Host allotment")
    .reduce((total, item) => total + item.usd, 0);
}

function dropLabel(plan: NormalizedPlan, metricName: string, labelName: string): NormalizedPlan {
  return {
    ...plan,
    metrics: plan.metrics.map((metric) =>
      metric.name === metricName ? { ...metric, labels: metric.labels.filter((label) => label.name !== labelName) } : metric,
    ),
  };
}

function stakeForLabel(
  plan: NormalizedPlan,
  quotes: VendorQuote[],
  options: QuoteOptions,
  metricName: string,
  labelName: string,
): { usd: number; vendor?: VendorId } {
  const nextPlan = dropLabel(plan, metricName, labelName);
  const nextQuotes = priceNormalized(nextPlan, resolveSeries(nextPlan), options);
  const deltas = quotes.flatMap((current) => {
    const after = nextQuotes.find((candidate) => candidate.vendor === current.vendor);
    if (!after) return [];
    return [{ vendor: current.vendor, usd: metricUsd(current) - metricUsd(after) }];
  });
  const datadog = deltas.find((entry) => entry.vendor === "datadog" && entry.usd > 1);
  if (datadog) return datadog;
  return deltas.reduce((best, entry) => (entry.usd > best.usd ? entry : best), {
    usd: 0,
    vendor: undefined as VendorId | undefined,
  });
}

function findingsFor(plan: NormalizedPlan, series: ResolvedSeries[], quotes: VendorQuote[], options: QuoteOptions): Finding[] {
  const findings: Finding[] = [];
  if (plan.metrics.length + plan.logs.length + plan.spans.length === 0) {
    findings.push({
      severity: "info",
      code: "EMPTY_PLAN",
      message: "This plan emits nothing, so the quote is zero. Add the metrics, logs, and spans the service actually sends.",
    });
  }

  for (const entry of series) {
    for (const label of entry.unboundedLabels) {
      const stake = stakeForLabel(plan, quotes, options, entry.metric.name, label.name);
      const allow = new Set([...(plan.allowUnboundedLabels ?? []), ...(options.allowUnboundedLabels ?? [])]);
      const floor = options.failUnboundedAboveUsd ?? plan.failUnboundedAboveUsd;
      const allowed = allow.has(label.name);
      const expensive = stake.usd >= floor;
      const note = allowed
        ? ` ${label.name} is on allowUnboundedLabels, so this stays a warning.`
        : expensive
          ? ""
          : ` That is under the ${formatUsd(floor)} check, so this stays a warning.`;
      findings.push({
        severity: allowed || !expensive ? "warn" : "error",
        code: "UNBOUNDED_METRIC_LABEL",
        signal: entry.metric.name,
        vendor: stake.vendor,
        usdAtStake: stake.usd,
        message: `${label.name} on ${entry.metric.name} is an unbounded identifier (${label.cardinality.toLocaleString("en-US")} values). Dropping it saves about ${formatUsd(stake.usd)} a month on ${stake.vendor ? display(stake.vendor) : "the priced vendors"}. Put that id on a span or a sampled log, not on a metric.${note}`,
      });
    }

    const leader = entry.topLabel;
    const seriesCount = Math.max(entry.datadogSeries, entry.grafanaSeries, entry.cloudwatchSeries);
    if (leader && leader.cardinality >= 1000 && leader.bounded && seriesCount > 10_000) {
      const stake = stakeForLabel(plan, quotes, options, entry.metric.name, leader.name);
      findings.push({
        severity: "warn",
        code: "HIGH_CARDINALITY",
        signal: entry.metric.name,
        vendor: stake.vendor,
        usdAtStake: stake.usd,
        message: `${leader.name} on ${entry.metric.name} is marked bounded but has ${leader.cardinality.toLocaleString("en-US")} values. Confirm that set cannot grow with users, requests, or pods.`,
      });
    }

    if (entry.metric.type === "histogram" && entry.histogramMultiplier >= 12 && entry.labelProduct > 100) {
      findings.push({
        severity: "info",
        code: "HISTOGRAM_MULTIPLIER",
        signal: entry.metric.name,
        message: `${entry.metric.name} has ${entry.metric.buckets} finite buckets, which is ${entry.histogramMultiplier} Prometheus series per label set (+Inf, _sum, and _count). Grafana and CloudWatch feel that multiplier. Datadog distributions do not, unless you enable extra percentile metrics.`,
      });
    }
  }

  for (const log of plan.logs) {
    const correlated = log.attributes.some((attribute) => attribute.kind === "correlation");
    if (!correlated && (log.level === "error" || log.level === "warn" || log.indexRatio > 0)) {
      findings.push({
        severity: log.level === "error" ? "warn" : "info",
        code: "MISSING_CORRELATION",
        signal: log.name,
        message: `${log.name} has no trace, span, or request id. During an incident this line cannot be joined to the failing request.`,
      });
    }
    for (const attribute of log.attributes.filter((candidate) => candidate.kind === "pii")) {
      findings.push({
        severity: "warn",
        code: "PII_ATTRIBUTE",
        signal: log.name,
        message: `${attribute.name} on ${log.name} looks like PII. Redact it before ingest. Do not put it in a metric label.`,
      });
    }
    if (log.level === "debug" && log.indexRatio > 0 && log.eventsPerSecond >= 1) {
      findings.push({
        severity: "warn",
        code: "DEBUG_INDEXED",
        signal: log.name,
        message: `${log.name} indexes debug logs at ${log.eventsPerSecond} events/s. Index an error sample and leave the rest unindexed.`,
      });
    }
  }

  for (const span of plan.spans) {
    if (!span.hasTraceId) {
      findings.push({
        severity: "warn",
        code: "MISSING_CORRELATION",
        signal: span.name,
        message: `${span.name} is marked without a trace id. A span that cannot be walked is an expensive event.`,
      });
    }
  }

  return findings;
}

function display(vendor: VendorId): string {
  const names: Record<VendorId, string> = {
    datadog: "Datadog",
    "grafana-cloud": "Grafana Cloud",
    newrelic: "New Relic",
    honeycomb: "Honeycomb",
    cloudwatch: "CloudWatch",
  };
  return names[vendor];
}

function primaryDriver(series: ResolvedSeries[]): PrimaryDriver | null {
  let best: PrimaryDriver | null = null;
  for (const entry of series) {
    const label = entry.topLabel;
    if (!label || label.cardinality < 2) continue;
    const share = 1 - 1 / label.cardinality;
    if (!best || share > best.shareOfSeries) {
      best = { metric: entry.metric.name, label: label.name, cardinality: label.cardinality, shareOfSeries: share };
    }
  }
  return best;
}

export function quote(plan: TelemetryPlan, options: QuoteOptions = {}): QuoteReport {
  const normalized = normalizePlan(plan);
  const series = resolveSeries(normalized);
  const quotes = priceNormalized(normalized, series, options).sort((a, b) => b.usd - a.usd);
  const driver = primaryDriver(series);
  const yields = reviewYield(normalized, quotes, options.failOnPii ?? false);
  const findings = findingsFor(normalized, series, quotes, options);
  const ranked = quotes.map((entry) => `${entry.displayName} ${formatUsd(entry.usd)}/mo`).join(" · ");
  const headline = driver
    ? `${ranked}. ${driver.label} on ${driver.metric} multiplies that metric by ${driver.cardinality.toLocaleString("en-US")}.`
    : ranked || "Nothing to quote.";

  return {
    plan: normalized,
    quotes,
    findings,
    yields,
    primaryDriver: driver,
    headline,
    catalogVersion: CATALOG_VERSION,
    catalogAsOf: CATALOG_AS_OF,
  };
}

export function tryQuote(
  plan: TelemetryPlan,
  options: QuoteOptions = {},
): { ok: true; report: QuoteReport } | { ok: false; error: string } {
  try {
    return { ok: true, report: quote(plan, options) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not quote this plan" };
  }
}
