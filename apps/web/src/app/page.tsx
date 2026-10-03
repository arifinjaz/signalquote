import Link from "next/link";
import { cardinalityBomb, afterTheFix, formatUsd, quote } from "signalquote";
import { VendorBars } from "@/components/money-view";
import { buttonVariants } from "@/components/ui/button";

const bomb = quote(cardinalityBomb);
const fixed = quote(afterTheFix);
const datadogBefore = bomb.quotes.find((entry) => entry.vendor === "datadog")?.usd ?? 0;
const datadogAfter = fixed.quotes.find((entry) => entry.vendor === "datadog")?.usd ?? 0;
const honeycomb = bomb.quotes.find((entry) => entry.vendor === "honeycomb")?.usd ?? 0;

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="mb-4 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Catalog v{bomb.catalogVersion} · {bomb.catalogAsOf}
          </p>
          <h1 className="max-w-xl text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            Know the invoice before the pull request merges.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            signalquote prices a service&apos;s logs, metrics, and traces against published list rates for Datadog,
            Grafana Cloud, New Relic, Honeycomb, and CloudWatch. It names the label that multiplied the series, and it
            checks each signal against a fixed list of rules.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/playground" className={buttonVariants({ size: "lg" })}>
              Quote a plan
            </Link>
            <Link href="/#related" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Related tools
            </Link>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-1 font-mono text-xs text-muted-foreground">checkout · payments · 10 hosts</div>
          <h2 className="font-serif text-3xl">One user_id label</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{bomb.headline}</p>
          <div className="mt-5">
            <VendorBars quotes={bomb.quotes} />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2">
          <div>
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Before</p>
            <p className="mt-2 font-serif text-4xl">{formatUsd(datadogBefore)}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Datadog, per month, with <span className="font-mono">user_id</span> at cardinality 20,000 on{" "}
              <span className="font-mono">checkout.requests</span>. Honeycomb quotes the same plan at{" "}
              {formatUsd(honeycomb)}, because an event does not get more expensive when you add a field.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">After the label is dropped</p>
            <p className="mt-2 font-serif text-4xl">{formatUsd(datadogAfter)}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Same routes, same status codes, access logs indexed at 2%, error logs kept whole with a trace id. The
              check passes a $500 budget. The gate is <span className="font-mono">signalquote check plan.yaml</span>.
            </p>
          </div>
        </div>
      </section>

      <section id="related" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl font-serif text-4xl leading-tight">Where this sits.</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          OpenCost allocates cluster spend. Infracost diffs Terraform cost in a pull request. Grafana cardinality
          management and Adaptive Metrics inspect series that are already stored. Cribl Stream reshapes metrics in a
          pipeline. The OpenTelemetry Collector cardinalityguardian processor, development stability, can tag or drop
          labels at runtime, and its dollar figure is one config field defaulting to $0.05. Vendor usage pages explain
          one invoice after the data exists.
        </p>
        <p className="mt-4 max-w-2xl leading-relaxed">
          signalquote reads a plan file and quotes five meters before the series exist. The checklist is separate from
          the price: unbounded labels, PII, a missing correlation id, indexed debug logs, a span with no trace id.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="font-serif text-4xl">Put the quote in the pipeline.</h2>
        <pre className="mt-6 overflow-x-auto rounded-xl border border-border bg-foreground p-5 font-mono text-sm leading-relaxed text-background">{`import { check } from "signalquote";

const result = check(plan, { focusVendor: "datadog" });
if (!result.ok) {
  console.error(result.failures.join("\\n"));
  process.exit(1);
}`}</pre>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The package is not on npm yet. From this repo, run the tests and this playground. Rates are public list prices
          from catalog v{bomb.catalogVersion}, checked {bomb.catalogAsOf}. They are not your contract and not an invoice.
          Override any rate when finance sends the order form. The worked examples live in{" "}
          <span className="font-mono">examples/</span>.
        </p>
      </section>
    </main>
  );
}
