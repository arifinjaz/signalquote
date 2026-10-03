#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { check } from "./check.js";
import { formatReport } from "./format.js";
import { quote } from "./quote.js";
import type { QuoteOptions, TelemetryPlan, VendorId } from "./types.js";
import { VENDOR_IDS } from "./types.js";

const help = `signalquote — the telemetry invoice, before you ship it

Usage
  signalquote quote [plan.yaml]
  signalquote check [plan.yaml] --budget 200 --vendor datadog
  signalquote vendors

Options
  --budget <usd>     Monthly budget. Defaults to budgetUsdMonth in the plan.
  --vendor <id>      Focus vendor: ${VENDOR_IDS.join(", ")}
  --billing <mode>   Datadog list rate: on-demand (default) or annual
  --data-plus        Quote New Relic Data Plus at $0.60/GB
  --help             Show this message

Exit codes
  0  quote printed, or the check passed
  1  the check failed (budget, or an unbounded label at or above the dollar floor)
  2  the plan could not be read
`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function readPlan(file: string | undefined): TelemetryPlan {
  const raw = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  const parsed = parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("The plan must be a YAML object with a service name.");
  }
  return parsed as TelemetryPlan;
}

function vendorOf(value: string | undefined): VendorId | undefined {
  if (!value) return undefined;
  if (!(VENDOR_IDS as readonly string[]).includes(value)) {
    fail(`Unknown vendor "${value}". Expected one of: ${VENDOR_IDS.join(", ")}`);
  }
  return value as VendorId;
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      budget: { type: "string" },
      vendor: { type: "string" },
      billing: { type: "string" },
      "data-plus": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(help);
    return;
  }

  const command = positionals[0];
  if (command === "vendors") {
    for (const vendor of VENDOR_IDS) console.log(vendor);
    return;
  }
  if (command !== "quote" && command !== "check") {
    fail(`Unknown command "${command}".\n\n${help}`);
  }

  const billing = values.billing ?? "on-demand";
  if (billing !== "annual" && billing !== "on-demand") {
    fail('--billing must be "annual" or "on-demand".');
  }

  let plan: TelemetryPlan;
  try {
    plan = readPlan(positionals[1]);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not read the plan.");
  }

  const options: QuoteOptions = {
    focusVendor: vendorOf(values.vendor),
    datadogBilling: billing,
    newRelicDataPlus: values["data-plus"] ?? false,
  };

  try {
    if (command === "quote") {
      const budget = values.budget === undefined ? undefined : Number(values.budget);
      if (budget !== undefined && Number.isNaN(budget)) fail("--budget must be a number.");
      console.log(formatReport(quote(budget === undefined ? plan : { ...plan, budgetUsdMonth: budget }, options), options.focusVendor));
      return;
    }

    const budget = values.budget === undefined ? undefined : Number(values.budget);
    if (budget !== undefined && Number.isNaN(budget)) fail("--budget must be a number.");
    const result = check(plan, { ...options, budgetUsd: budget });
    console.log(formatReport(result.report));
    if (!result.ok) {
      console.error("FAIL");
      for (const failure of result.failures) console.error(`  ${failure}`);
      process.exit(1);
    }
    console.log("PASS");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not quote this plan.");
  }
}

main();
