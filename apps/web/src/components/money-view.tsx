import { formatUsd, type Finding, type VendorQuote, type YieldReview } from "signalquote";
import { Badge } from "@/components/ui/badge";

export function VendorBars({ quotes }: { quotes: VendorQuote[] }) {
  const max = Math.max(...quotes.map((quote) => quote.usd), 1);
  return (
    <div className="space-y-3">
      {quotes.map((quote) => {
        const width = quote.usd <= 0 ? 2 : Math.max(3, (Math.log10(quote.usd + 1) / Math.log10(max + 1)) * 100);
        return (
          <div key={quote.vendor} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
            <div className="truncate">{quote.displayName}</div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
            <div className="font-mono text-xs tabular-nums">{formatUsd(quote.usd)}</div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Bar length is logarithmic, so a small plan stays visible next to a cardinality bomb. The dollar figures are the quote.</p>
    </div>
  );
}

export function LineItems({ quote }: { quote: VendorQuote }) {
  const rows = quote.lineItems.filter((item) => item.usd !== 0 || item.quantity > 0);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">This vendor has nothing to bill for the current plan.</p>;
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {rows.map((item) => (
        <li key={`${item.signal}-${item.name}`} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
          <div>
            <div className="text-sm">{item.name}</div>
            <div className="text-xs leading-relaxed text-muted-foreground">{item.detail}</div>
          </div>
          <div className={`font-mono text-sm tabular-nums sm:text-right ${item.usd < 0 ? "text-emerald-800" : ""}`}>
            {formatUsd(item.usd)}
          </div>
        </li>
      ))}
    </ul>
  );
}

const findingVariant = {
  error: "destructive",
  warn: "outline",
  info: "secondary",
} as const;

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">No findings. The plan is quiet.</p>;
  }
  return (
    <ul className="space-y-3">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-${finding.signal ?? index}`} className="rounded-lg border border-border bg-card p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={findingVariant[finding.severity]}>{finding.severity}</Badge>
            <span className="font-mono text-xs">{finding.code}</span>
            {finding.usdAtStake !== undefined && finding.usdAtStake >= 1 ? (
              <span className="font-mono text-xs text-muted-foreground">{formatUsd(finding.usdAtStake)} at stake</span>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed">{finding.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function YieldList({ yields }: { yields: YieldReview[] }) {
  if (yields.length === 0) return null;
  return (
    <ul className="space-y-4">
      {yields.map((entry) => (
        <li key={`${entry.kind}-${entry.name}`} className="border-b border-border pb-3 last:border-0">
          <div className="text-sm">
            {entry.name}{" "}
            <span className="text-muted-foreground">
              {entry.kind} · {formatUsd(entry.usd)}/mo
            </span>
          </div>
          <ul className="mt-2 space-y-2">
            {entry.rules.map((rule) => (
              <li key={rule.id} className="text-xs leading-relaxed">
                <Badge variant={rule.status === "fail" ? "destructive" : rule.status === "warn" ? "outline" : "secondary"}>
                  {rule.status}
                </Badge>{" "}
                <span className="font-mono">{rule.id}</span>
                <span className="text-muted-foreground"> — {rule.reason}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
