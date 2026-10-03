import type { TelemetryPlan } from "./types.js";

/** A user id on a metric. The receipt is the talk track. */
export const cardinalityBomb: TelemetryPlan = {
  service: "checkout",
  team: "payments",
  hosts: 10,
  budgetUsdMonth: 200,
  metrics: [
    {
      name: "checkout.requests",
      type: "counter",
      purpose: "traffic",
      intervalSeconds: 60,
      labels: [
        { name: "http.route", cardinality: 40, bounded: true },
        { name: "http.status_code", cardinality: 5, bounded: true },
        { name: "user_id", cardinality: 20000 },
      ],
    },
    {
      name: "checkout.duration",
      type: "histogram",
      purpose: "latency",
      buckets: 12,
      intervalSeconds: 60,
      labels: [
        { name: "http.route", cardinality: 40, bounded: true },
        { name: "http.status_code", cardinality: 5, bounded: true },
      ],
    },
  ],
  logs: [
    {
      name: "checkout.access",
      eventsPerSecond: 30,
      avgBytes: 700,
      level: "info",
      indexRatio: 1,
      retentionDays: 15,
      attributes: [{ name: "user.email" }],
    },
  ],
  spans: [
    {
      name: "checkout.charge",
      spansPerSecond: 80,
      avgBytes: 2000,
      indexRatio: 1,
      retentionDays: 15,
      hasTraceId: true,
    },
  ],
};

/** Same service after the label is removed and logs are sampled. */
export const afterTheFix: TelemetryPlan = {
  service: "checkout",
  team: "payments",
  hosts: 10,
  budgetUsdMonth: 500,
  metrics: [
    {
      name: "checkout.requests",
      type: "counter",
      purpose: "traffic",
      intervalSeconds: 60,
      labels: [
        { name: "http.route", cardinality: 40, bounded: true },
        { name: "http.status_code", cardinality: 5, bounded: true },
      ],
    },
    {
      name: "checkout.duration",
      type: "histogram",
      purpose: "latency",
      buckets: 12,
      intervalSeconds: 60,
      labels: [
        { name: "http.route", cardinality: 40, bounded: true },
        { name: "http.status_code", cardinality: 5, bounded: true },
      ],
    },
  ],
  logs: [
    {
      name: "checkout.access",
      eventsPerSecond: 50,
      avgBytes: 800,
      level: "info",
      indexRatio: 0.02,
      retentionDays: 15,
      attributes: [{ name: "request_id", kind: "correlation" }],
    },
    {
      name: "checkout.error",
      eventsPerSecond: 0.5,
      avgBytes: 600,
      level: "error",
      indexRatio: 1,
      retentionDays: 15,
      attributes: [{ name: "trace_id", kind: "correlation" }],
    },
  ],
  spans: [
    {
      name: "checkout.charge",
      spansPerSecond: 40,
      avgBytes: 1500,
      indexRatio: 0.1,
      retentionDays: 15,
      hasTraceId: true,
    },
  ],
};

/** Healthy metrics, indexed debug logs, no join key. */
export const debugLogFlood: TelemetryPlan = {
  service: "catalog",
  team: "browse",
  hosts: 8,
  budgetUsdMonth: 300,
  metrics: [
    {
      name: "catalog.search",
      type: "counter",
      purpose: "traffic",
      intervalSeconds: 60,
      labels: [
        { name: "http.route", cardinality: 6, bounded: true },
        { name: "http.status_code", cardinality: 4, bounded: true },
      ],
    },
  ],
  logs: [
    {
      name: "catalog.debug",
      eventsPerSecond: 200,
      avgBytes: 900,
      level: "debug",
      indexRatio: 1,
      retentionDays: 15,
      attributes: [{ name: "user.email" }],
    },
  ],
};

export const examples = {
  cardinalityBomb,
  afterTheFix,
  debugLogFlood,
} as const;
