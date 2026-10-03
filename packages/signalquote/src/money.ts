export const MONTH_SECONDS = 30 * 24 * 60 * 60;
export const DECIMAL_GB = 1_000_000_000;

export function roundCents(usd: number): number {
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

export function formatUsd(usd: number): string {
  const abs = Math.abs(usd);
  const digits = abs >= 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd);
}

export function formatCount(value: number): string {
  const digits = Number.isInteger(value) ? 0 : value >= 100 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function monthlyCount(perSecond: number, monthSeconds = MONTH_SECONDS): number {
  return perSecond * monthSeconds;
}

export function bytesToGb(bytes: number): number {
  return bytes / DECIMAL_GB;
}

export function sumUsd(items: { usd: number }[]): number {
  return roundCents(items.reduce((total, item) => total + item.usd, 0));
}

export type Tier = { limit: number; usdEach: number };

/** Price `quantity` units across sequential tiers. `limit` is the cumulative top of the tier. */
export function priceTiers(quantity: number, tiers: Tier[]): number {
  let remaining = Math.max(0, quantity);
  let cursor = 0;
  let cost = 0;
  for (const tier of tiers) {
    const room = tier.limit - cursor;
    const take = Math.min(remaining, room);
    cost += take * tier.usdEach;
    remaining -= take;
    cursor = tier.limit;
    if (remaining <= 0) break;
  }
  return cost;
}
