# Contributing

## How to update a rate

The numbers live in [`packages/signalquote/src/catalog/rates.json`](packages/signalquote/src/catalog/rates.json). The pricing functions only read that file.

1. Open the vendor page linked from `sources` in that file.
2. Change the number. If the page does not publish a unit price, do not invent one. Leave the count in the quote and say so in that vendor's assumptions. Honeycomb time-series data points are the current example: the pricing page publishes an allotment, not an overage price.
3. Set `asOf` to the day you checked the page (`YYYY-MM-DD`) and bump `version` by 1.
4. Run `npm test` from the repository root. The tier and cardinality tests lock the arithmetic. The checkout example locks Datadog at $2,000,757, so a rate change updates that test and the receipt in the root README in the same pull request.

A new vendor is one function that returns line items, assumptions, and sources, plus a block in `rates.json`, plus a test that locks a published example.

## Good first issues

File one of these and add the `good first issue` label:

- **Datadog month-to-month index rates.** The [pricing list](https://www.datadoghq.com/pricing/list/) has a column between annual and on-demand. `rates.json` stores those two. Add the month-to-month numbers and a billing mode, with a test that locks one published cell: 15-day indexed logs at $2.04 per million.
- **`--fail-on-pii`.** `check(plan, { failOnPii: true })` already fails the process. The CLI does not expose the flag.
- **One more unbounded label name.** The name list is `UNBOUNDED_LABEL` in [`packages/signalquote/src/names.ts`](packages/signalquote/src/names.ts). Add a name it misses, a test that the heuristic flags it, and a test that `bounded: true` overrides the guess.
