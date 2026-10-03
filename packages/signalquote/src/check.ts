import { quote } from "./quote.js";
import type { CheckOptions, CheckResult, TelemetryPlan, VendorId } from "./types.js";

export function check(plan: TelemetryPlan, options: CheckOptions = {}): CheckResult {
  const report = quote(plan, options);
  const vendor: VendorId =
    options.focusVendor ??
    (report.quotes.some((entry) => entry.vendor === "datadog") ? "datadog" : (report.quotes[0]?.vendor ?? "datadog"));
  const quoted = report.quotes.find((entry) => entry.vendor === vendor);
  const quotedUsd = quoted?.usd ?? 0;
  const budgetUsd = options.budgetUsd ?? report.plan.budgetUsdMonth ?? null;
  const overBudgetBy = budgetUsd === null ? 0 : Math.max(0, roundBudget(quotedUsd - budgetUsd));
  const failOnPii = options.failOnPii ?? false;
  const failOnUnbounded = options.failOnUnboundedLabels ?? true;
  const failures: string[] = [];

  if (budgetUsd !== null && overBudgetBy > 0) {
    failures.push(
      `${quoted?.displayName ?? vendor} quotes ${quotedUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })} which is over the ${budgetUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })} budget by ${overBudgetBy.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
    );
  }

  for (const finding of report.findings) {
    if (finding.code === "UNBOUNDED_METRIC_LABEL" && failOnUnbounded && finding.severity === "error") {
      failures.push(finding.message);
    }
    if (finding.code === "PII_ATTRIBUTE" && failOnPii) failures.push(finding.message);
  }

  return {
    ok: failures.length === 0,
    vendor,
    quotedUsd,
    budgetUsd,
    overBudgetBy,
    failures,
    report,
  };
}

function roundBudget(value: number): number {
  return Math.round(value * 100) / 100;
}
