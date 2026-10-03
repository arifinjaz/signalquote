# signalquote

Quote the monthly cost of logs, metrics, and traces before they ship.

The package is not on npm yet. From this repository, build it and run the CLI against a plan file. After it is published:

```bash
npm install signalquote
```

```ts
import { check } from "signalquote";

const result = check(plan, { focusVendor: "datadog" });
if (!result.ok) {
  console.error(result.failures.join("\n"));
  process.exit(1);
}
```

Or from a YAML plan:

```bash
npx signalquote check examples/checkout-bomb.yaml --vendor datadog
```

Exit `0` when the focused vendor is inside budget and no unbounded label is above the dollar floor. Exit `1` when the budget or that label fails the check. Exit `2` when the plan cannot be read.

## What a plan looks like

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
      - name: user_id
        cardinality: 20000
logs:
  - name: checkout.access
    eventsPerSecond: 30
    avgBytes: 700
    level: info
    indexRatio: 1
    retentionDays: 15
spans:
  - name: checkout.charge
    spansPerSecond: 80
    avgBytes: 2000
    indexRatio: 0.1
```

`cardinality` is your estimate of distinct values. The quote multiplies that number. It does not measure a running service.

`bounded` is optional. Omit it and a fixed name list treats `user_id`, `email`, `request_id`, `order_id`, and similar names as unbounded. Any other name is treated as bounded. Set `bounded: true` or `bounded: false` when the guess is wrong. Cardinality does not decide `bounded`.

`allowUnboundedLabels` names labels that stay on the receipt but do not fail `signalquote check`. An unbounded label also stays a warning when dropping it would save less than `failUnboundedAboveUsd` (default $50 a month). Set that to `0` to fail on every unbounded label.

`purpose: other` warns. It does not fail the check. The default passing set is latency, traffic, errors, and saturation. Add a purpose to `actionablePurposes` when a business metric should pass the rule.

On Datadog that counter, with a 5-value status label and 10 hosts added the way the checkout example does, is 40 × 5 × 20,000 × 10 = 40,000,000 custom metrics. The library multiplies by `hosts` only when the metric has no host-like label of its own.

## What you get back

`quote(plan)` returns one receipt per vendor. The report's first line includes the catalog version and the date the list prices were checked.

- **Datadog** — custom-metric cardinality, host allotment, log ingest vs index, span ingest vs index. Annual and on-demand list rates. Month-to-month is not a separate mode; override the rate if that is your contract.
- **Grafana Cloud** — active series, data points per minute, histogram buckets, process / write / retain.
- **New Relic** — gigabytes after the included allowance. Data Plus is a flag, not the default.
- **Honeycomb** — events. Cardinality is not a meter. Metric data-point overage has no public unit price, so it is not dollarized.
- **CloudWatch** — classic custom-metric tiers (US East) and log ingest plus storage. Storage is an uncompressed estimate, and the free gigabytes are waived on ingest only.

Each receipt lists assumptions and the public page the rate came from.

Findings name an unbounded label and the dollars that label is worth. A separate checklist runs named rules: `bounded-labels`, `actionable-purpose`, `no-pii`, `correlation-id`, `debug-not-indexed`, `trace-id`, and `sampled-index`. Each rule is pass, warn, or fail, with the reason. `actionable-purpose` warns and does not fail the check. `no-pii` warns unless `failOnPii` is set. There is no combined score.

## This is not an invoice

Rates are list prices from [`src/catalog/rates.json`](src/catalog/rates.json). Negotiated commits, Adaptive Metrics, and 95th-percentile billing move the real bill. Override a rate when finance has the order form:

```ts
quote(plan, {
  datadogBilling: "annual",
  rates: { datadogUsdPerHundredCustomMetrics: 3 },
});
```

## Update a rate

The numbers live in `src/catalog/rates.json`. The pricing functions only read that file.

1. Open the vendor page linked from `sources` in the file.
2. Change the number. If the page does not publish a unit price, do not guess. Leave the count in the quote and say so in that vendor's assumptions.
3. Set `asOf` to the day you checked (`YYYY-MM-DD`) and bump `version` by 1.
4. Run `npm test` from the repository root. The tier and cardinality tests lock the arithmetic. If a vendor's published example changed, update the test in the same pull request.

The same steps are in the repository [CONTRIBUTING.md](../../CONTRIBUTING.md).

A new vendor is one function that returns line items, assumptions, and sources, plus a block in `rates.json`, plus a test that locks a published example.

MIT licensed.
