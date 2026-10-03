export const VENDOR_IDS = [
  "datadog",
  "grafana-cloud",
  "newrelic",
  "honeycomb",
  "cloudwatch",
] as const;

export type VendorId = (typeof VENDOR_IDS)[number];

export type MetricType = "gauge" | "counter" | "histogram" | "native_histogram";

export type MetricPurpose = "latency" | "traffic" | "errors" | "saturation" | "other";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type AttributeKind = "correlation" | "pii" | "identifier" | "dimension";

export type LabelDecl = {
  name: string;
  /** Distinct values. Independent labels multiply. Correlated labels (pod and node) overstate the product. */
  cardinality: number;
  /**
   * False when the label is an unbounded identifier (user id, email, request id).
   * Omit to infer from the name.
   */
  bounded?: boolean;
};

export type MetricDecl = {
  name: string;
  type?: MetricType;
  /** Finite histogram boundaries. The +Inf bucket, _sum, and _count are added for Prometheus-style vendors. */
  buckets?: number;
  /** Active buckets of a native histogram. Grafana bills these at 0.25 series each. */
  nativeBuckets?: number;
  /** Extra Datadog metrics created when percentile aggregations are enabled. */
  datadogPercentileMetrics?: number;
  /** Seconds between samples. Default 60. Drives Grafana DPM and Honeycomb metric events. */
  intervalSeconds?: number;
  purpose?: MetricPurpose;
  labels?: LabelDecl[];
};

export type AttributeDecl = {
  name: string;
  kind?: AttributeKind;
};

export type LogDecl = {
  name: string;
  eventsPerSecond: number;
  avgBytes: number;
  level?: LogLevel;
  /** Fraction of ingested events placed in a searchable index. Datadog bills this separately from ingest. */
  indexRatio?: number;
  retentionDays?: number;
  /** Fraction Grafana Adaptive Logs drops before the write meter. Process is still charged. */
  adaptiveDropRatio?: number;
  attributes?: AttributeDecl[];
};

export type SpanDecl = {
  name: string;
  spansPerSecond: number;
  avgBytes: number;
  /** Fraction of ingested spans retained in an index. Datadog only. */
  indexRatio?: number;
  retentionDays?: number;
  adaptiveDropRatio?: number;
  hasTraceId?: boolean;
};

export type TelemetryPlan = {
  service: string;
  team?: string;
  /** Soft monthly budget in USD. `signalquote check` fails when the focused vendor exceeds it. */
  budgetUsdMonth?: number;
  /**
   * Datadog paid hosts. Sets the custom-metric and span allotment, and the implicit `host` tag
   * when the metric does not already carry a host-like label.
   */
  hosts?: number;
  /**
   * Unbounded label names that stay warnings. They still appear on the receipt,
   * and they still affect the price, but they do not fail `signalquote check`.
   */
  allowUnboundedLabels?: string[];
  /**
   * Purposes that pass the actionable-purpose rule.
   * Default: latency, traffic, errors, saturation. Anything else is a warning, not a failure.
   */
  actionablePurposes?: MetricPurpose[];
  /**
   * An unbounded label fails the check only when dropping it would save at least this much
   * per month. Default 50. Set 0 to fail on every unbounded label.
   */
  failUnboundedAboveUsd?: number;
  metrics?: MetricDecl[];
  logs?: LogDecl[];
  spans?: SpanDecl[];
};

export type LineItem = {
  signal: "metrics" | "logs" | "traces" | "credit";
  name: string;
  detail: string;
  quantity: number;
  unit: string;
  usd: number;
};

export type SeriesBreakdown = {
  name: string;
  series: number;
  multiplier: number;
  topLabel: string | null;
  formula: string;
};

export type SourceRef = {
  title: string;
  url: string;
  asOf: string;
};

export type VendorQuote = {
  vendor: VendorId;
  displayName: string;
  usd: number;
  lineItems: LineItem[];
  assumptions: string[];
  sources: SourceRef[];
  series: SeriesBreakdown[];
};

export type FindingSeverity = "error" | "warn" | "info";

export type Finding = {
  severity: FindingSeverity;
  code: string;
  signal?: string;
  message: string;
  /** Dollars removed from the most expensive affected vendor if the recommendation is applied. */
  usdAtStake?: number;
  vendor?: VendorId;
};

export type YieldRuleId =
  | "bounded-labels"
  | "actionable-purpose"
  | "no-pii"
  | "correlation-id"
  | "debug-not-indexed"
  | "trace-id"
  | "sampled-index";

export type RuleStatus = "pass" | "warn" | "fail";

export type YieldRule = {
  id: YieldRuleId;
  status: RuleStatus;
  /** False only when status is fail. A warning is not a failure. */
  passed: boolean;
  reason: string;
};

/** Named rules for one signal. A rule can pass, warn, or fail. There is no combined score. */
export type YieldReview = {
  kind: "metric" | "log" | "span";
  name: string;
  rules: YieldRule[];
  /** Gross monthly USD on the vendor where this signal is most expensive. */
  usd: number;
  vendor?: VendorId;
};

export type PrimaryDriver = {
  metric: string;
  label: string;
  cardinality: number;
  /** Share of that metric's series removed by dropping the label, assuming independence. */
  shareOfSeries: number;
};

export type QuoteReport = {
  plan: NormalizedPlan;
  quotes: VendorQuote[];
  findings: Finding[];
  yields: YieldReview[];
  primaryDriver: PrimaryDriver | null;
  headline: string;
  catalogVersion: number;
  catalogAsOf: string;
};

export type NormalizedMetric = Required<
  Pick<MetricDecl, "name" | "type" | "buckets" | "nativeBuckets" | "datadogPercentileMetrics" | "intervalSeconds">
> & {
  purpose: MetricPurpose;
  labels: ResolvedLabel[];
};

export type ResolvedLabel = LabelDecl & { bounded: boolean; inferred: boolean };

export type NormalizedLog = Required<
  Pick<LogDecl, "name" | "eventsPerSecond" | "avgBytes" | "level" | "indexRatio" | "retentionDays" | "adaptiveDropRatio">
> & {
  attributes: ResolvedAttribute[];
};

export type ResolvedAttribute = AttributeDecl & { kind: AttributeKind; inferred: boolean };

export type NormalizedSpan = Required<
  Pick<SpanDecl, "name" | "spansPerSecond" | "avgBytes" | "indexRatio" | "retentionDays" | "adaptiveDropRatio" | "hasTraceId">
>;

export type NormalizedPlan = {
  service: string;
  team?: string;
  budgetUsdMonth?: number;
  hosts: number;
  allowUnboundedLabels: string[];
  actionablePurposes: MetricPurpose[];
  /** Unbounded labels below this monthly stake warn instead of failing the check. */
  failUnboundedAboveUsd: number;
  metrics: NormalizedMetric[];
  logs: NormalizedLog[];
  spans: NormalizedSpan[];
};

export type QuoteOptions = {
  vendors?: VendorId[];
  /** Which quote the budget gate and default narrative use. Defaults to the most expensive. */
  focusVendor?: VendorId;
  datadogPlan?: "pro" | "enterprise";
  datadogBilling?: "annual" | "on-demand";
  /** When true, also bill Metrics without Limits ingested custom metrics at $0.10 / 100. */
  datadogMetricsWithoutLimits?: boolean;
  newRelicDataPlus?: boolean;
  /**
   * Honeycomb can collapse metric samples that share a resource and timestamp into one event.
   * `per-series` prices the pessimistic case where every series is its own event.
   */
  honeycombMetricMode?: "per-resource" | "per-series";
  /** Assumed payload size of one metric sample on byte-metered vendors. Default 150. */
  bytesPerMetricSample?: number;
  rates?: RateOverrides;
  /** Merged with the plan's allowUnboundedLabels. These names warn instead of failing the check. */
  allowUnboundedLabels?: string[];
  /**
   * An unbounded label fails the check only when dropping it would save at least this much
   * per month. Default 50. Set 0 to fail on every unbounded label.
   */
  failUnboundedAboveUsd?: number;
  /** Default false. PII attributes warn unless this is set. */
  failOnPii?: boolean;
};

export type RateOverrides = {
  datadogUsdPerHundredCustomMetrics?: number;
  datadogLogIngestUsdPerGb?: number;
  datadogSpanIngestUsdPerGb?: number;
  /** Replaces Grafana's published series tiers with one rate per 1,000 billable series. */
  grafanaUsdPerThousandSeries?: number;
  newRelicUsdPerGb?: number;
  honeycombUsdPerMillionEvents?: number;
  /** Replaces CloudWatch's published metric tiers with a flat USD per metric-month. */
  cloudwatchUsdPerMetric?: number;
};

export type CheckOptions = QuoteOptions & {
  budgetUsd?: number;
  /** Default true. Unbounded labels fail the gate when they are not allowlisted and clear the dollar floor. */
  failOnUnboundedLabels?: boolean;
};

export type CheckResult = {
  ok: boolean;
  vendor: VendorId;
  quotedUsd: number;
  budgetUsd: number | null;
  overBudgetBy: number;
  failures: string[];
  report: QuoteReport;
};

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}
