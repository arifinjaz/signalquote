import type { Metadata } from "next";
import { CATALOG_AS_OF, CATALOG_VERSION, DATADOG_INDEX_RATES, resolveRates, sources } from "signalquote";

export const metadata: Metadata = {
  title: "Pricing models — signalquote",
  description: "How signalquote turns a telemetry plan into a monthly quote, and which list prices it uses.",
};

const rates = resolveRates();

export default function ModelsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
      <header>
        <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
          Catalog v{CATALOG_VERSION} · {CATALOG_AS_OF}
        </p>
        <h1 className="mt-2 font-serif text-5xl tracking-tight">What the quote is willing to claim.</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Every number is read from <span className="font-mono">packages/signalquote/src/catalog/rates.json</span>, or
          it is an assumption printed on the receipt. A contract, a commit discount, or Adaptive Metrics will move the
          real invoice. Pass a rate override when you know yours. To change a list price, edit that file, set{" "}
          <span className="font-mono">asOf</span>, and bump <span className="font-mono">version</span>.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">The month</h2>
        <p className="leading-relaxed">
          Volume uses a 30-day month and decimal gigabytes (1,000,000,000 bytes), which is how these vendors describe a
          GB. Label cardinality multiplies only when the labels are independent. A pod label and a node label are
          correlated; the product is an upper bound. Set the cardinality to the measured combination when you have it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">Datadog</h2>
        <p className="leading-relaxed">
          A custom metric is one series per metric name plus tag values, including the host tag. Pro includes {rates.datadogIndexedAllowancePerHost.pro} custom metrics per host, Enterprise{" "}
          {rates.datadogIndexedAllowancePerHost.enterprise}. Above that, the list rate is{" "}
          {`$${rates.datadogUsdPerHundredCustomMetrics.toFixed(2)}`} per 100. Logs are{" "}
          {`$${rates.datadogLogIngestUsdPerGb.toFixed(2)}`} per ingested GB plus an index rate per million events. Spans include 150 GB and 1 million indexed spans per APM host. Host
          subscription fees are left out so the quote stays about the telemetry, not the agent license.
        </p>
        <RateTable
          headers={["Retention", "Annual list", "On-demand list"]}
          rows={([3, 7, 15, 30] as const).map((days) => [
            `${days} days`,
            money(DATADOG_INDEX_RATES[days].annual),
            money(DATADOG_INDEX_RATES[days].onDemand),
          ])}
        />
        <SourceList ids={["datadogList", "datadogMetrics", "datadogApm"]} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">Grafana Cloud</h2>
        <p className="leading-relaxed">
          Billable series are the greater of active series and total data points per minute, because{" "}
          {rates.grafanaIncludedDpm} DPM per series is included and a 15-second scrape is four. The first{" "}
          {rates.grafanaIncludedSeries.toLocaleString("en-US")} series are included, then{" "}
          {rates.grafanaSeriesTiers
            .filter((tier) => tier.usdPerThousand > 0)
            .map((tier) => `$${tier.usdPerThousand.toFixed(2)}`)
            .join(", ")}{" "}
          per thousand. A classic histogram is finite buckets + 3 (the +Inf bucket, <span className="font-mono">_sum</span>
          , and <span className="font-mono">_count</span>). Native histogram buckets count at a quarter of a series.
          Logs and traces are {money(rates.grafanaProcessUsdPerGb)}/GB to process, {money(rates.grafanaWriteUsdPerGb)}
          /GB to write after {rates.grafanaIncludedGb} GB, and {money(rates.grafanaRetainUsdPerGbPer30Days)}/GB for each
          extra 30 days of retention. The $19 platform fee is account-level and excluded.
        </p>
        <SourceList ids={["grafanaPricing", "grafanaMetrics", "grafanaInvoice"]} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">New Relic</h2>
        <p className="leading-relaxed">
          Original ingest is {money(rates.newRelicUsdPerGb)}/GB after {rates.newRelicIncludedGb} GB. Data Plus is{" "}
          {money(rates.newRelicDataPlusUsdPerGb)}/GB. User seats are not in the quote. Metric bytes assume 150 bytes per
          sample unless you override{" "}
          <span className="font-mono">bytesPerMetricSample</span>. The free allowance is account-level, so a
          single-service quote spends capacity the rest of the company also uses.
        </p>
        <SourceList ids={["newRelic"]} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">Honeycomb</h2>
        <p className="leading-relaxed">
          The July 2026 Pro rate is {money(rates.honeycombUsdPerMillionEvents)} per million events. The free tier is{" "}
          {rates.honeycombFreeEvents.toLocaleString("en-US")} events. Usage above that is quoted at least{" "}
          {money(rates.honeycombProMinimumUsd)}, the smallest Pro plan. Cardinality is
          free: a user id on an event does not create a new billable series. Metric samples that share a resource and
          an interval collapse into one event, which is the documented ingest behavior. Time-series data-point overage
          has no public unit price here, so it is counted in the assumptions and not converted to dollars.
        </p>
        <SourceList ids={["honeycomb", "honeycombPricing"]} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">CloudWatch</h2>
        <p className="leading-relaxed">
          US East (N. Virginia) classic custom metrics:{" "}
          {rates.cloudwatchMetricTiers
            .map((tier) =>
              Number.isFinite(tier.limit)
                ? `${money(tier.usdEach)} through ${tier.limit.toLocaleString("en-US")}`
                : `${money(tier.usdEach)} after that`,
            )
            .join(", ")}
          . The published 255,000-metric example lands on $27,250, and the test locks that figure. Standard logs are{" "}
          {money(rates.cloudwatchLogIngestUsdPerGb)}/GB after the first {rates.cloudwatchLogIngestFreeGb} GB, plus{" "}
          {money(rates.cloudwatchLogStorageUsdPerGbMonth)} per GB-month stored. Storage is estimated uncompressed, and
          the free gigabytes are waived on ingest only. PutMetricData request charges are excluded. The separate
          OpenTelemetry-metrics $0.50/GB product is not added on top.
        </p>
        <SourceList ids={["cloudwatch"]} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-3xl">Checks</h2>
        <p className="leading-relaxed">
          Each signal passes, warns, or fails on named rules. There is no combined score.{" "}
          <span className="font-mono">bounded-labels</span> fails when a label is declared unbounded, or when its name
          matches the identifier heuristic and <span className="font-mono">bounded</span> was left unset.{" "}
          <span className="font-mono">actionable-purpose</span> warns, and does not fail the check, when purpose is
          outside latency, traffic, errors, and saturation. <span className="font-mono">no-pii</span> warns by default
          and fails the check when <span className="font-mono">failOnPii</span> is set. The other rules are{" "}
          <span className="font-mono">correlation-id</span>, <span className="font-mono">debug-not-indexed</span>,{" "}
          <span className="font-mono">trace-id</span>, and <span className="font-mono">sampled-index</span> (a full span
          index above 50 spans/s). The receipt prints the reason next to each result.
        </p>
      </section>
    </main>
  );
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function RateTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/60 font-mono text-xs">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")} className="border-t border-border">
              {row.map((cell) => (
                <td key={cell} className="px-3 py-2 font-mono text-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceList({ ids }: { ids: (keyof typeof sources)[] }) {
  return (
    <ul className="text-sm">
      {ids.map((id) => (
        <li key={id}>
          <a className="underline" href={sources[id].url}>
            {sources[id].title}
          </a>
        </li>
      ))}
    </ul>
  );
}
