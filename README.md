# signalquote

The telemetry invoice, before you ship it.

signalquote is a TypeScript library and a CLI in this repository. You describe the logs, metrics, and spans a service will emit. It quotes the month on Datadog, Grafana Cloud, New Relic, Honeycomb, and CloudWatch, using each vendor's own meter, and it names the label that multiplied the series.

Install it from npm and gate a plan in CI or locally:

```bash
npm install signalquote
npx signalquote check plan.yaml --vendor datadog
```

There is no hosted playground. From this repo, `npm install` then `npm run dev` serves one at http://127.0.0.1:43123.

signalquote is not affiliated with Datadog, Grafana Labs, New Relic, Honeycomb, or Amazon Web Services. MIT licensed: [LICENSE](LICENSE).

## A plan

Cardinality is an input. The `20000` below is the author's estimate of distinct `user_id` values, not a measurement. The quote is only as good as that guess.

`bounded` is also an input when you set it. Leave it off and a fixed name list treats `user_id`, `email`, `request_id`, `order_id`, and similar names as unbounded. Every other name is treated as bounded. That guess misses names it has never seen and can flag a name that is actually a small set. Set `bounded: true` or `bounded: false` when it is wrong. The number of values does not decide it.

```yaml
service: checkout
team: payments
hosts: 10
budgetUsdMonth: 200
metrics:
  - name: checkout.requests
    type: counter
    purpose: traffic
    labels:
      - name: http.route
        cardinality: 40
        bounded: true
      - name: http.status_code
        cardinality: 5
        bounded: true
      - name: user_id
        cardinality: 20000
```

The rest of the file is in [`examples/checkout-bomb.yaml`](examples/checkout-bomb.yaml). From this repo:

```bash
node packages/signalquote/dist/cli.js check examples/checkout-bomb.yaml --vendor datadog
```

The check exits 1. The receipt names the label and the dollars:

```text
40 http.route × 5 http.status_code × 20,000 user_id × 10 hosts = 40,000,000 custom metrics

ERROR UNBOUNDED_METRIC_LABEL  ($1,999,900 at stake)
       user_id on checkout.requests is an unbounded identifier (20,000 values). Dropping it saves about $1,999,900 a month on Datadog. Put that id on a span or a sampled log, not on a metric.

FAIL
  Datadog quotes $2,000,757.00 which is over the $200.00 budget by $2,000,557.00.
  user_id on checkout.requests is an unbounded identifier (20,000 values). Dropping it saves about $1,999,900 a month on Datadog. Put that id on a span or a sampled log, not on a metric.
```

That $2,000,757 is the whole file at Datadog's on-demand list: the 40,000,000 series at $5 per 100 custom metrics, the duration histogram, a $50 credit for 100 custom metrics per Pro host across 10 hosts, plus log ingest, the 15-day index, and indexed spans. Those rates match the [pricing list](https://www.datadoghq.com/pricing/list/) and the [custom metrics](https://docs.datadoghq.com/account_management/billing/custom_metrics/) and [APM](https://docs.datadoghq.com/account_management/billing/apm_tracing_profiler/) billing pages checked on 2026-10-02. The $50 credit is only the allotment inside the custom-metric meter. Infrastructure and APM host subscriptions are a different bill, and they are not in this quote.

Dropping `user_id` leaves 40 × 5 × 10 = 2,000 Datadog custom metrics and saves about $1,999,900. The rest of the file is still $857: the counter that remains, the duration histogram, the fully indexed access log, and the fully indexed spans, after that $50 allotment. That is over the $200 budget, so [`examples/checkout-fixed.yaml`](examples/checkout-fixed.yaml) is this plan without `user_id` and with the budget set to $1,000.

```bash
node packages/signalquote/dist/cli.js check examples/checkout-fixed.yaml --vendor datadog
```

The check exits 0:

```text
40 http.route × 5 http.status_code × 10 hosts = 2,000 custom metrics

PASS
```

The process exits 0 because the budget holds and no unbounded label is left. The receipt still warns that `user.email` looks like PII, and the full span index fails its checklist rule. Those do not fail the check.

Grafana does not add a host tag unless the plan declares one, so the same counter is 4,000,000 active series there. Honeycomb's event price does not change when the label is added.

An unbounded label fails that check when it is not listed in `allowUnboundedLabels` and dropping it would save at least `failUnboundedAboveUsd` (default $50 a month). Below that, or on the allowlist, it stays a warning. Set `failUnboundedAboveUsd: 0` to fail on every unbounded label. A `purpose` outside latency, traffic, errors, and saturation warns and does not fail the check. Add the purpose to `actionablePurposes` if a business metric such as `orders_placed` should pass the rule.

## What it quotes

A plan is a YAML file you can diff in a pull request. The same plan is priced five ways:

- Datadog bills **custom-metric series**, with a per-host allotment, and bills **log ingest and log index** as different meters. Span ingest and indexed spans are different meters too.
- Grafana Cloud bills **active series and data points per minute**. A 15-second scrape is four times the metrics line of a 60-second scrape. A classic histogram counts finite buckets plus the +Inf bucket, `_sum`, and `_count`.
- New Relic bills **gigabytes** after the included allowance. New Relic samples are sized at 150 bytes each, an assumption you can override.
- Honeycomb bills **events**. A `user_id` field does not create a new series. Time-series data points have a separate allotment and no public overage price in this catalog, so they are counted and not converted to dollars.
- CloudWatch bills **custom-metric tiers** (US East list prices) and standard log ingest plus storage.

Rates are list prices, not an invoice. A contract, a commit, Adaptive Metrics, or 95th-percentile billing will move the real bill. Override a rate when you have the order form.

## Related tools

These already exist. signalquote does not replace them.

| Tool | What it does |
| --- | --- |
| [OpenCost](https://github.com/opencost/opencost) | Allocates Kubernetes and cloud spend from a running cluster. |
| [Infracost](https://www.infracost.io/) | Diffs infrastructure cost in a pull request. It prices Terraform resources, not telemetry meters. |
| [Grafana cardinality management](https://grafana.com/docs/grafana-cloud/platform/cost-management-and-billing/analyze-costs/metrics-costs/prometheus-metrics-costs/cardinality-management/) and [Adaptive Metrics](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/adaptive-telemetry/adaptive-metrics/introduction/) | Inspect series that are already in Grafana Cloud and recommend aggregations. |
| [Cribl Stream](https://cribl.io/blog/cut-costs-not-visibility-the-cribl-way-to-metrics/) | Aggregates and routes metrics in a pipeline, before they land in a vendor. |
| [cardinalityguardian](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/cardinalityguardianprocessor) | OpenTelemetry Collector processor, development stability, that can tag or drop exploding labels at runtime. Its dollar figure is one config field, `estimated_cost_per_metric_month`, default `$0.05`. |
| Vendor usage pages | Datadog Plan & Usage, Grafana Cost Management, New Relic usage, Honeycomb usage, and the CloudWatch pricing examples. Each one explains a single invoice after the data exists. |

signalquote reads the plan in CI, before the series exist, and prices it with the meter each of those five vendors publishes.

## Checks

Each signal is checked against named rules. There is no combined score.

| Rule | Result |
| --- | --- |
| `bounded-labels` | Fails when a label is `bounded: false`, or when `bounded` is omitted and the name is on the identifier list. |
| `actionable-purpose` | Warns when purpose is outside the configured set. Default set: latency, traffic, errors, saturation. Does not fail the check. |
| `no-pii` | Warns by default, fails with `failOnPii`. |
| `correlation-id` | Fails when a log has no trace id, span id, or request id. |
| `debug-not-indexed` | Fails when a debug log has `indexRatio` above 0. |
| `trace-id` | Fails when a span is marked without a trace id. |
| `sampled-index` | Fails when every span is indexed and the rate is above 50 spans/s. |

The process fails when the focused vendor is over budget, or an unbounded label is above the dollar floor and not allowlisted. The failure names the label and the dollars.

## Run the playground

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43123. The cardinality-bomb preset quotes five vendors. Dropping `user_id` requotes the plan.

## Use the library

After the package is published:

```bash
npm install signalquote
npx signalquote check plan.yaml --vendor datadog
```

```ts
import { check } from "signalquote";

const result = check(plan, { focusVendor: "datadog" });
if (!result.ok) {
  console.error(result.failures.join("\n"));
  process.exit(1);
}
```

Exit `0` when the check passes. Exit `1` when the budget or an unbounded label above the dollar floor fails it. Exit `2` when the plan cannot be read.

A pull request, once the package is published, can run the same command. This is a workflow for your repository. Replace `telemetry/**/*.yaml` and `telemetry/checkout.yaml` with your plan path, and replace `datadog` with the vendor you want to gate. It runs only when a plan file changes:

```yaml
name: telemetry-cost

on:
  pull_request:
    paths: ["telemetry/**/*.yaml"]

jobs:
  signalquote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx signalquote check telemetry/checkout.yaml --vendor datadog
```

Worked plans live in [`examples/`](examples). Pricing assumptions and the catalog date are on the playground's pricing models page and on every receipt.

## Rates

List prices live in [`packages/signalquote/src/catalog/rates.json`](packages/signalquote/src/catalog/rates.json), separate from the pricing functions. The file has a `version` and an `asOf` date. Every text report and every vendor receipt prints both.

To change a rate, edit that file, set `asOf` to the day you checked the vendor page, and bump `version`. If the page does not publish a unit price, do not invent one: count the units and say so. The steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Test

```bash
npm test
```
