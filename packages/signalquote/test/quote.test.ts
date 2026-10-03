import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CATALOG_AS_OF, CATALOG_VERSION } from "../src/catalog.js";
import { check } from "../src/check.js";
import { afterTheFix, cardinalityBomb, debugLogFlood } from "../src/examples.js";
import { formatReport } from "../src/format.js";
import { MONTH_SECONDS } from "../src/money.js";
import { planToYaml } from "../src/plan.js";
import { quote } from "../src/quote.js";
import { PlanError, type TelemetryPlan, type VendorId } from "../src/types.js";

function vendor(plan: TelemetryPlan, id: VendorId) {
  const report = quote(plan);
  const found = report.quotes.find((entry) => entry.vendor === id);
  if (!found) throw new Error(`missing ${id}`);
  return { report, quote: found };
}

describe("Datadog cardinality", () => {
  it("prices a user_id label as custom metrics, minus the host allotment", () => {
    const plan: TelemetryPlan = {
      service: "checkout",
      hosts: 10,
      metrics: [
        {
          name: "checkout.requests",
          type: "counter",
          labels: [
            { name: "http.route", cardinality: 40, bounded: true },
            { name: "http.status_code", cardinality: 5, bounded: true },
            { name: "user_id", cardinality: 20000 },
          ],
        },
      ],
    };
    const { quote: datadog, report } = vendor(plan, "datadog");
    // 40 × 5 × 20,000 × 10 hosts = 40,000,000 series. $5 / 100, minus 1,000 included.
    expect(datadog.usd).toBe(1_999_950);
    expect(report.findings.some((finding) => finding.code === "UNBOUNDED_METRIC_LABEL")).toBe(true);
    const stake = report.findings.find((finding) => finding.code === "UNBOUNDED_METRIC_LABEL")?.usdAtStake ?? 0;
    expect(stake).toBeGreaterThan(1_900_000);
    expect(report.primaryDriver?.label).toBe("user_id");
  });

  it("does not multiply by hosts when a pod label is already present", () => {
    const plan: TelemetryPlan = {
      service: "checkout",
      hosts: 10,
      metrics: [
        {
          name: "checkout.requests",
          labels: [
            { name: "pod", cardinality: 10, bounded: true },
            { name: "http.status_code", cardinality: 5, bounded: true },
          ],
        },
      ],
    };
    const { quote: datadog } = vendor(plan, "datadog");
    // 50 series, inside the 1,000 metric allotment.
    expect(datadog.usd).toBe(0);
  });

  it("bills log ingest and the 15-day on-demand index separately", () => {
    const plan: TelemetryPlan = {
      service: "checkout",
      hosts: 1,
      logs: [{ name: "access", eventsPerSecond: 100, avgBytes: 500, indexRatio: 1, retentionDays: 15 }],
    };
    const { quote: datadog } = vendor(plan, "datadog");
    const events = 100 * MONTH_SECONDS;
    const gb = (events * 500) / 1e9;
    const expected = gb * 0.1 + (events / 1e6) * 2.55;
    expect(datadog.usd).toBeCloseTo(expected, 2);
  });

  it("snaps an unlisted retention up to the next published Datadog rate", () => {
    const plan: TelemetryPlan = {
      service: "checkout",
      logs: [{ name: "access", eventsPerSecond: 1, avgBytes: 200, retentionDays: 10, indexRatio: 1 }],
    };
    const { quote: datadog } = vendor(plan, "datadog");
    const index = datadog.lineItems.find((item) => item.name === "access index");
    expect(index?.detail).toContain("15-day");
  });
});

describe("Grafana Cloud", () => {
  it("charges tiered series rates above the 10,000 included", () => {
    const plan: TelemetryPlan = {
      service: "api",
      hosts: 1,
      metrics: [{ name: "api.requests", labels: [{ name: "pod", cardinality: 50000, bounded: true }] }],
    };
    const { quote: grafana } = vendor(plan, "grafana-cloud");
    // 50,000 - 10,000 included = 40,000 × $6.50 / 1,000.
    expect(grafana.usd).toBe(260);
  });

  it("quadruples billable series at a 15 second interval", () => {
    const plan: TelemetryPlan = {
      service: "api",
      metrics: [
        {
          name: "api.requests",
          intervalSeconds: 15,
          labels: [{ name: "pod", cardinality: 20000, bounded: true }],
        },
      ],
    };
    const { quote: grafana } = vendor(plan, "grafana-cloud");
    // 20,000 series × 4 DPM = 80,000 billable. 70,000 paid × $6.50 / 1,000.
    expect(grafana.usd).toBe(455);
  });

  it("splits logs into process, write, and retain", () => {
    const gb = 1000;
    const eventsPerSecond = (gb * 1e9) / (1000 * MONTH_SECONDS);
    const plan: TelemetryPlan = {
      service: "api",
      logs: [{ name: "app", eventsPerSecond, avgBytes: 1000, retentionDays: 90, indexRatio: 1 }],
    };
    const { quote: grafana } = vendor(plan, "grafana-cloud");
    const process = gb * 0.05;
    const write = (gb - 50) * 0.4;
    const retain = gb * 0.1 * 2;
    expect(grafana.usd).toBeCloseTo(process + write + retain, 2);
  });

  it("counts classic histogram buckets, sum, and count", () => {
    const plan: TelemetryPlan = {
      service: "api",
      metrics: [
        {
          name: "http.duration",
          type: "histogram",
          buckets: 12,
          labels: [
            { name: "route", cardinality: 20, bounded: true },
            { name: "status", cardinality: 5, bounded: true },
          ],
        },
      ],
    };
    const { quote: grafana } = vendor(plan, "grafana-cloud");
    const row = grafana.lineItems.find((item) => item.name === "http.duration");
    expect(row?.quantity).toBe(100 * 15);
    const datadog = vendor(plan, "datadog").quote.lineItems.find((item) => item.name === "http.duration");
    expect(datadog?.quantity).toBe(100);
    expect(datadog?.detail).toContain("= 100 custom metrics");
    expect(datadog?.detail).not.toContain("histogram");
  });
});

describe("other vendors", () => {
  it("gives New Relic the first 100 GB", () => {
    const gb = 150;
    const eventsPerSecond = (gb * 1e9) / (1000 * MONTH_SECONDS);
    const plan: TelemetryPlan = {
      service: "api",
      logs: [{ name: "app", eventsPerSecond, avgBytes: 1000 }],
    };
    const { quote: nr } = vendor(plan, "newrelic");
    expect(nr.usd).toBeCloseTo(50 * 0.4, 2);
  });

  it("keeps Honeycomb cardinality off the event meter and floors Pro at $150", () => {
    const quiet: TelemetryPlan = {
      service: "api",
      hosts: 10,
      metrics: [{ name: "api.requests", labels: [{ name: "user_id", cardinality: 50000 }] }],
    };
    expect(vendor(quiet, "honeycomb").quote.usd).toBe(0);

    const eventsPerSecond = 30_000_000 / MONTH_SECONDS;
    const pro: TelemetryPlan = {
      service: "api",
      logs: [{ name: "app", eventsPerSecond, avgBytes: 200 }],
    };
    expect(vendor(pro, "honeycomb").quote.usd).toBe(150);

    const eventsPerSecondLarge = 100_000_000 / MONTH_SECONDS;
    const large: TelemetryPlan = {
      service: "api",
      logs: [{ name: "app", eventsPerSecond: eventsPerSecondLarge, avgBytes: 200 }],
    };
    expect(vendor(large, "honeycomb").quote.usd).toBe(300);
  });

  it("matches the CloudWatch 255,000 metric example", () => {
    const plan: TelemetryPlan = {
      service: "fleet",
      hosts: 0,
      metrics: [{ name: "app.stat", labels: [{ name: "instance", cardinality: 255000, bounded: true }] }],
    };
    expect(vendor(plan, "cloudwatch").quote.usd).toBe(27250);
  });

  it("waives the first 5 GB of CloudWatch log ingest", () => {
    const gb = 30;
    const eventsPerSecond = (gb * 1e9) / (500 * MONTH_SECONDS);
    const plan: TelemetryPlan = {
      service: "api",
      logs: [{ name: "app", eventsPerSecond, avgBytes: 500, retentionDays: 30 }],
    };
    const { quote: cw } = vendor(plan, "cloudwatch");
    const ingest = 25 * 0.5;
    const storage = 30 * 0.03;
    expect(cw.usd).toBeCloseTo(ingest + storage, 2);
  });
});

describe("the gate", () => {
  it("rejects the cardinality bomb and accepts the fixed plan", () => {
    const failed = check(cardinalityBomb);
    expect(failed.ok).toBe(false);
    expect(failed.vendor).toBe("datadog");
    expect(failed.failures.some((failure) => failure.includes("user_id"))).toBe(true);
    expect(failed.quotedUsd).toBeGreaterThan(failed.budgetUsd ?? 0);

    const passed = check(afterTheFix);
    expect(passed.ok).toBe(true);
    expect(passed.quotedUsd).toBeLessThan(500);
  });

  it("warns on a cheap or allowlisted unbounded label and does not fail the check", () => {
    const cheap = check({
      service: "api",
      hosts: 1,
      budgetUsdMonth: 100,
      metrics: [{ name: "api.requests", labels: [{ name: "user_id", cardinality: 2 }] }],
    });
    expect(cheap.ok).toBe(true);
    expect(cheap.report.findings.find((finding) => finding.code === "UNBOUNDED_METRIC_LABEL")?.severity).toBe("warn");

    const allowed = check(
      {
        ...cardinalityBomb,
        budgetUsdMonth: 10_000_000,
        allowUnboundedLabels: ["user_id"],
      },
      { budgetUsd: 10_000_000 },
    );
    expect(allowed.ok).toBe(true);
    expect(allowed.failures.some((failure) => failure.includes("user_id"))).toBe(false);
  });

  it("warns when a metric purpose is outside the default set", () => {
    const report = quote({
      service: "orders",
      metrics: [{ name: "orders_placed", purpose: "other", labels: [{ name: "region", cardinality: 4, bounded: true }] }],
    });
    const purpose = report.yields.find((entry) => entry.name === "orders_placed")?.rules.find((rule) => rule.id === "actionable-purpose");
    expect(purpose?.status).toBe("warn");
    expect(purpose?.passed).toBe(true);
    expect(check({ service: "orders", budgetUsdMonth: 1000, metrics: [{ name: "orders_placed", purpose: "other" }] }).ok).toBe(true);
  });

  it("flags indexed debug logs that an investigation cannot join", () => {
    const report = quote(debugLogFlood);
    const codes = report.findings.map((finding) => finding.code);
    expect(codes).toContain("DEBUG_INDEXED");
    expect(codes).toContain("PII_ATTRIBUTE");
    expect(codes).toContain("MISSING_CORRELATION");
    const log = report.yields.find((entry) => entry.name === "catalog.debug");
    const pii = log?.rules.find((rule) => rule.id === "no-pii");
    expect(pii?.status).toBe("warn");
    expect(pii?.passed).toBe(true);
    const failed = log?.rules.filter((rule) => !rule.passed).map((rule) => rule.id);
    expect(failed).toEqual(["correlation-id", "debug-not-indexed"]);
    expect(log?.rules.every((rule) => rule.reason.length > 0)).toBe(true);
    const strict = check(debugLogFlood, { failOnPii: true });
    expect(strict.report.yields.find((entry) => entry.name === "catalog.debug")?.rules.find((rule) => rule.id === "no-pii")?.status).toBe(
      "fail",
    );
    expect(strict.failures.some((failure) => failure.includes("user.email"))).toBe(true);
    expect(check(debugLogFlood).failures.some((failure) => failure.includes("user.email"))).toBe(false);
  });

  it("rejects an invalid plan", () => {
    expect(() => quote({ service: "api", metrics: [{ name: "m", labels: [{ name: "route", cardinality: 0 }] }] })).toThrow(
      PlanError,
    );
  });

  it("round-trips the example plan through YAML", () => {
    const yaml = planToYaml(cardinalityBomb);
    const parsed = parse(yaml) as TelemetryPlan;
    expect(quote(parsed).quotes.find((entry) => entry.vendor === "datadog")?.usd).toBe(
      quote(cardinalityBomb).quotes.find((entry) => entry.vendor === "datadog")?.usd,
    );
    expect(formatReport(quote(cardinalityBomb))).toContain("UNBOUNDED_METRIC_LABEL");
  });

  it("quotes the checked-in example file", () => {
    const raw = readFileSync(fileURLToPath(new URL("../../../examples/checkout-bomb.yaml", import.meta.url)), "utf8");
    const parsed = parse(raw) as TelemetryPlan;
    const result = check(parsed);
    expect(result.ok).toBe(false);
    // On-demand list, 2026-10-02: $5/100 custom metrics, 100 per Pro host, plus the log and span lines.
    expect(result.quotedUsd).toBe(2_000_757);
    const requests = result.report.quotes
      .find((entry) => entry.vendor === "datadog")
      ?.series.find((entry) => entry.name === "checkout.requests");
    // 40 routes × 5 status codes × 20,000 user ids × 10 hosts.
    expect(requests?.series).toBe(40_000_000);
    expect(requests?.formula).toContain("40,000,000");
    expect(formatReport(result.report)).toContain(`catalog v${CATALOG_VERSION} · ${CATALOG_AS_OF}`);
    const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");
    expect(readme).toContain("$2,000,757");
    expect(readme).toContain("$1,999,900");
  });

  it("passes the fixed example once user_id is gone and the budget covers what remains", () => {
    const raw = readFileSync(fileURLToPath(new URL("../../../examples/checkout-fixed.yaml", import.meta.url)), "utf8");
    const result = check(parse(raw) as TelemetryPlan);
    expect(result.ok).toBe(true);
    expect(result.quotedUsd).toBe(857);
    const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");
    expect(readme).toContain("$857");
    expect(readme).toContain("checkout-fixed.yaml");
  });
});
