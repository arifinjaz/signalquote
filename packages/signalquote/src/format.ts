import { formatUsd } from "./money.js";
import type { QuoteReport, VendorId } from "./types.js";

export function formatReport(report: QuoteReport, only?: VendorId): string {
  const lines: string[] = [];
  const team = report.plan.team ? ` · ${report.plan.team}` : "";
  lines.push(
    `signalquote  ${report.plan.service}${team}  ·  ${report.plan.hosts} hosts  ·  catalog v${report.catalogVersion} · ${report.catalogAsOf}`,
  );
  lines.push(report.headline);
  lines.push("");

  const quotes = only ? report.quotes.filter((quote) => quote.vendor === only) : report.quotes;
  for (const quote of quotes) {
    lines.push(`${quote.displayName.toUpperCase()}  ${formatUsd(quote.usd)} / month`);
    for (const item of quote.lineItems) {
      if (item.usd === 0 && item.signal !== "credit") continue;
      const money = formatUsd(item.usd).padStart(14);
      lines.push(`  ${money}  ${item.name}`);
      lines.push(`                ${item.detail}`);
    }
    if (quote.series.length > 0) {
      const driver = quote.series.reduce((best, entry) => (entry.series > best.series ? entry : best));
      lines.push(`  series        ${driver.formula}`);
    }
    lines.push("");
  }

  if (report.findings.length > 0) {
    lines.push("FINDINGS");
    for (const finding of report.findings) {
      const stake = finding.usdAtStake && finding.usdAtStake >= 1 ? `  (${formatUsd(finding.usdAtStake)} at stake)` : "";
      lines.push(`  ${finding.severity.toUpperCase().padEnd(5)} ${finding.code}${stake}`);
      lines.push(`         ${finding.message}`);
    }
    lines.push("");
  }

  if (report.yields.length > 0) {
    lines.push("CHECKS");
    for (const entry of report.yields) {
      lines.push(`  ${entry.kind.padEnd(6)} ${entry.name}  ${formatUsd(entry.usd)}/mo`);
      for (const rule of entry.rules) {
        lines.push(`    ${rule.status.padEnd(4)}  ${rule.id}`);
        lines.push(`          ${rule.reason}`);
      }
    }
    lines.push("");
  }

  lines.push("List prices, not an invoice. Override rates to match a contract. Month is 30 days.");
  return lines.join("\n");
}
