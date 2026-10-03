import type { NormalizedPlan, RuleStatus, VendorQuote, YieldReview, YieldRule } from "./types.js";

/** A full span index fails this rule only above this rate. The threshold is part of the rule. */
export const FULL_INDEX_SPANS_PER_SECOND = 50;

function rule(id: YieldRule["id"], status: RuleStatus, reason: string): YieldRule {
  return { id, status, passed: status !== "fail", reason };
}

function costOf(quotes: VendorQuote[], name: string): { usd: number; vendor?: VendorQuote["vendor"] } {
  let best = { usd: 0, vendor: undefined as VendorQuote["vendor"] | undefined };
  for (const quote of quotes) {
    const direct = quote.lineItems
      .filter((item) => item.name === name || item.name === `${name} index`)
      .reduce((total, item) => total + Math.max(0, item.usd), 0);
    let allocated = direct;
    if (allocated === 0 && quote.vendor === "grafana-cloud") {
      const billable = quote.lineItems.find((item) => item.name === "Billable series")?.usd ?? 0;
      const totalSeries = quote.series.reduce((total, entry) => total + entry.series, 0);
      const mine = quote.series.find((entry) => entry.name === name)?.series ?? 0;
      if (totalSeries > 0 && mine > 0) allocated = billable * (mine / totalSeries);
    }
    if (allocated === 0 && quote.vendor === "cloudwatch") {
      const billable = quote.lineItems.find((item) => item.name === "Custom metric tiers")?.usd ?? 0;
      const totalSeries = quote.series.reduce((total, entry) => total + entry.series, 0);
      const mine = quote.series.find((entry) => entry.name === name)?.series ?? 0;
      if (totalSeries > 0 && mine > 0) allocated = billable * (mine / totalSeries);
    }
    if (allocated > best.usd) best = { usd: allocated, vendor: quote.vendor };
  }
  return best;
}

export function reviewYield(plan: NormalizedPlan, quotes: VendorQuote[], failOnPii = false): YieldReview[] {
  const reviews: YieldReview[] = [];

  for (const metric of plan.metrics) {
    const unbounded = metric.labels.filter((label) => !label.bounded);
    const purposeAccepted = new Set(plan.actionablePurposes).has(metric.purpose);
    const rules = [
      rule(
        "bounded-labels",
        unbounded.length === 0 ? "pass" : "fail",
        unbounded.length === 0
          ? "Every label is bounded."
          : `${unbounded.map((label) => `${label.name} (${label.cardinality.toLocaleString("en-US")} values)`).join(", ")} ${unbounded.length === 1 ? "is an unbounded identifier" : "are unbounded identifiers"}.`,
      ),
      rule(
        "actionable-purpose",
        purposeAccepted ? "pass" : "warn",
        purposeAccepted
          ? `Purpose is ${metric.purpose}.`
          : `Purpose is ${metric.purpose}. This is a warning. The default set is latency, traffic, errors, and saturation. A business counter can stay on other, or you can add its purpose to actionablePurposes.`,
      ),
    ];
    const cost = costOf(quotes, metric.name);
    reviews.push({ kind: "metric", name: metric.name, rules, usd: cost.usd, vendor: cost.vendor });
  }

  for (const log of plan.logs) {
    const pii = log.attributes.filter((attribute) => attribute.kind === "pii");
    const correlated = log.attributes.some((attribute) => attribute.kind === "correlation");
    const debugIndexed = log.level === "debug" && log.indexRatio > 0;
    const rules = [
      rule(
        "no-pii",
        pii.length === 0 ? "pass" : failOnPii ? "fail" : "warn",
        pii.length === 0
          ? "No attribute is marked PII."
          : failOnPii
            ? `${pii.map((attribute) => attribute.name).join(", ")} ${pii.length === 1 ? "is" : "are"} marked PII. failOnPii is set, so this fails the check.`
            : `${pii.map((attribute) => attribute.name).join(", ")} ${pii.length === 1 ? "is" : "are"} marked PII. This warns unless failOnPii is set.`,
      ),
      rule(
        "correlation-id",
        correlated ? "pass" : "fail",
        correlated ? "Has a correlation id." : "No attribute is a trace id, span id, or request id.",
      ),
      rule(
        "debug-not-indexed",
        debugIndexed ? "fail" : "pass",
        log.level !== "debug"
          ? `Level is ${log.level}, so the indexed-debug rule does not apply.`
          : debugIndexed
            ? `Debug logs are indexed (indexRatio ${log.indexRatio}).`
            : "Debug logs are not indexed.",
      ),
    ];
    const cost = costOf(quotes, log.name);
    reviews.push({ kind: "log", name: log.name, rules, usd: cost.usd, vendor: cost.vendor });
  }

  for (const span of plan.spans) {
    const fullyIndexed = span.indexRatio === 1 && span.spansPerSecond > FULL_INDEX_SPANS_PER_SECOND;
    const rules = [
      rule(
        "trace-id",
        span.hasTraceId ? "pass" : "fail",
        span.hasTraceId ? "Trace id is present." : "No trace id, so the span cannot be walked.",
      ),
      rule(
        "sampled-index",
        fullyIndexed ? "fail" : "pass",
        fullyIndexed
          ? `Every span is indexed at ${span.spansPerSecond} spans/s. This rule fails when indexRatio is 1 above ${FULL_INDEX_SPANS_PER_SECOND} spans/s.`
          : span.indexRatio < 1
            ? `Index ratio is ${span.indexRatio}.`
            : `${span.spansPerSecond} spans/s is at or under the ${FULL_INDEX_SPANS_PER_SECOND} spans/s threshold for a full index.`,
      ),
    ];
    const cost = costOf(quotes, span.name);
    reviews.push({ kind: "span", name: span.name, rules, usd: cost.usd, vendor: cost.vendor });
  }

  return reviews;
}
