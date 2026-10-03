import rawCatalog from "./catalog/rates.json" with { type: "json" };
import type { RateOverrides, SourceRef } from "./types.js";

type IndexRate = { annual: number; onDemand: number };

type CatalogFile = {
  version: number;
  asOf: string;
  sources: Record<string, { title: string; url: string }>;
  datadog: {
    usdPerHundredCustomMetrics: number;
    usdPerHundredIngestedCustomMetrics: number;
    logIngestUsdPerGb: number;
    spanIngestUsdPerGb: number;
    indexedAllowancePerHost: { pro: number; enterprise: number };
    spanIngestAllowanceGbPerHost: number;
    spanIndexAllowancePerHost: number;
    indexUsdPerMillionEvents: Record<string, IndexRate>;
  };
  grafana: {
    seriesTiers: { upTo: number | null; usdPerThousand: number }[];
    processUsdPerGb: number;
    writeUsdPerGb: number;
    retainUsdPerGbPer30Days: number;
    includedGb: number;
    includedSeries: number;
    includedDpm: number;
  };
  newRelic: { usdPerGb: number; includedGb: number; dataPlusUsdPerGb: number };
  honeycomb: { usdPerMillionEvents: number; freeEvents: number; proMinimumUsd: number };
  cloudwatch: {
    metricTiers: { upTo: number | null; usdEach: number }[];
    logIngestUsdPerGb: number;
    logIngestFreeGb: number;
    logStorageUsdPerGbMonth: number;
  };
};

const catalog = parseCatalog(rawCatalog);

export const CATALOG_VERSION = catalog.version;
export const CATALOG_AS_OF = catalog.asOf;
export const CATALOG_STAMP = `Catalog v${CATALOG_VERSION}, list prices checked ${CATALOG_AS_OF}.`;

export const sources = Object.fromEntries(
  Object.entries(catalog.sources).map(([id, source]) => [id, { ...source, asOf: CATALOG_AS_OF }]),
) as {
  datadogList: SourceRef;
  datadogMetrics: SourceRef;
  datadogApm: SourceRef;
  grafanaPricing: SourceRef;
  grafanaMetrics: SourceRef;
  grafanaInvoice: SourceRef;
  newRelic: SourceRef;
  honeycomb: SourceRef;
  honeycombPricing: SourceRef;
  cloudwatch: SourceRef;
};

export const DATADOG_RETENTION_DAYS = [3, 7, 15, 30] as const;
export type DatadogRetention = (typeof DATADOG_RETENTION_DAYS)[number];

/** USD per million indexed events at each published retention. Annual and on-demand list only. */
export const DATADOG_INDEX_RATES = catalog.datadog.indexUsdPerMillionEvents as Record<DatadogRetention, IndexRate>;

export type { IndexRate };

export type ResolvedRates = {
  datadogUsdPerHundredCustomMetrics: number;
  datadogUsdPerHundredIngestedCustomMetrics: number;
  datadogLogIngestUsdPerGb: number;
  datadogSpanIngestUsdPerGb: number;
  datadogIndexedAllowancePerHost: { pro: number; enterprise: number };
  datadogSpanIngestAllowanceGbPerHost: number;
  datadogSpanIndexAllowancePerHost: number;
  grafanaSeriesTiers: { limit: number; usdPerThousand: number }[];
  grafanaUsdPerThousandSeries: number | null;
  grafanaProcessUsdPerGb: number;
  grafanaWriteUsdPerGb: number;
  grafanaRetainUsdPerGbPer30Days: number;
  grafanaIncludedGb: number;
  grafanaIncludedSeries: number;
  grafanaIncludedDpm: number;
  newRelicUsdPerGb: number;
  newRelicIncludedGb: number;
  newRelicDataPlusUsdPerGb: number;
  honeycombUsdPerMillionEvents: number;
  honeycombFreeEvents: number;
  honeycombProMinimumUsd: number;
  cloudwatchMetricTiers: { limit: number; usdEach: number }[];
  cloudwatchUsdPerMetric: number | null;
  cloudwatchLogIngestUsdPerGb: number;
  cloudwatchLogIngestFreeGb: number;
  cloudwatchLogStorageUsdPerGbMonth: number;
};

export function resolveRates(overrides: RateOverrides = {}): ResolvedRates {
  const datadog = catalog.datadog;
  const grafana = catalog.grafana;
  const cloudwatch = catalog.cloudwatch;
  return {
    datadogUsdPerHundredCustomMetrics: overrides.datadogUsdPerHundredCustomMetrics ?? datadog.usdPerHundredCustomMetrics,
    datadogUsdPerHundredIngestedCustomMetrics: datadog.usdPerHundredIngestedCustomMetrics,
    datadogLogIngestUsdPerGb: overrides.datadogLogIngestUsdPerGb ?? datadog.logIngestUsdPerGb,
    datadogSpanIngestUsdPerGb: overrides.datadogSpanIngestUsdPerGb ?? datadog.spanIngestUsdPerGb,
    datadogIndexedAllowancePerHost: datadog.indexedAllowancePerHost,
    datadogSpanIngestAllowanceGbPerHost: datadog.spanIngestAllowanceGbPerHost,
    datadogSpanIndexAllowancePerHost: datadog.spanIndexAllowancePerHost,
    grafanaSeriesTiers: grafana.seriesTiers.map((tier) => ({
      limit: tier.upTo === null ? Number.POSITIVE_INFINITY : tier.upTo,
      usdPerThousand: tier.usdPerThousand,
    })),
    grafanaUsdPerThousandSeries: overrides.grafanaUsdPerThousandSeries ?? null,
    grafanaProcessUsdPerGb: grafana.processUsdPerGb,
    grafanaWriteUsdPerGb: grafana.writeUsdPerGb,
    grafanaRetainUsdPerGbPer30Days: grafana.retainUsdPerGbPer30Days,
    grafanaIncludedGb: grafana.includedGb,
    grafanaIncludedSeries: grafana.includedSeries,
    grafanaIncludedDpm: grafana.includedDpm,
    newRelicUsdPerGb: overrides.newRelicUsdPerGb ?? catalog.newRelic.usdPerGb,
    newRelicIncludedGb: catalog.newRelic.includedGb,
    newRelicDataPlusUsdPerGb: catalog.newRelic.dataPlusUsdPerGb,
    honeycombUsdPerMillionEvents: overrides.honeycombUsdPerMillionEvents ?? catalog.honeycomb.usdPerMillionEvents,
    honeycombFreeEvents: catalog.honeycomb.freeEvents,
    honeycombProMinimumUsd: catalog.honeycomb.proMinimumUsd,
    cloudwatchMetricTiers: cloudwatch.metricTiers.map((tier) => ({
      limit: tier.upTo === null ? Number.POSITIVE_INFINITY : tier.upTo,
      usdEach: tier.usdEach,
    })),
    cloudwatchUsdPerMetric: overrides.cloudwatchUsdPerMetric ?? null,
    cloudwatchLogIngestUsdPerGb: cloudwatch.logIngestUsdPerGb,
    cloudwatchLogIngestFreeGb: cloudwatch.logIngestFreeGb,
    cloudwatchLogStorageUsdPerGbMonth: cloudwatch.logStorageUsdPerGbMonth,
  };
}

function parseCatalog(input: unknown): CatalogFile {
  const record = objectAt(input, "catalog");
  const version = numberAt(record, "version");
  if (!Number.isInteger(version) || version < 1) throw new Error("catalog version must be an integer >= 1");
  const asOf = stringAt(record, "asOf");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("catalog asOf must be YYYY-MM-DD");

  const sourcesInput = objectAt(record.sources, "sources");
  const sources: CatalogFile["sources"] = {};
  for (const [id, value] of Object.entries(sourcesInput)) {
    const source = objectAt(value, `sources.${id}`);
    const url = stringAt(source, `sources.${id}.url`);
    if (!url.startsWith("https://")) throw new Error(`sources.${id}.url must be an https URL`);
    sources[id] = { title: stringAt(source, `sources.${id}.title`), url };
  }

  const datadog = objectAt(record.datadog, "datadog");
  const indexRates = objectAt(datadog.indexUsdPerMillionEvents, "datadog.indexUsdPerMillionEvents");
  const parsedIndex: Record<string, IndexRate> = {};
  for (const days of ["3", "7", "15", "30"]) {
    const rate = objectAt(indexRates[days], `datadog.indexUsdPerMillionEvents.${days}`);
    parsedIndex[days] = {
      annual: moneyAt(rate, `datadog.indexUsdPerMillionEvents.${days}.annual`),
      onDemand: moneyAt(rate, `datadog.indexUsdPerMillionEvents.${days}.onDemand`),
    };
  }
  const allowance = objectAt(datadog.indexedAllowancePerHost, "datadog.indexedAllowancePerHost");

  const grafana = objectAt(record.grafana, "grafana");
  const newRelic = objectAt(record.newRelic, "newRelic");
  const honeycomb = objectAt(record.honeycomb, "honeycomb");
  const cloudwatch = objectAt(record.cloudwatch, "cloudwatch");

  return {
    version,
    asOf,
    sources,
    datadog: {
      usdPerHundredCustomMetrics: moneyAt(datadog, "datadog.usdPerHundredCustomMetrics"),
      usdPerHundredIngestedCustomMetrics: moneyAt(datadog, "datadog.usdPerHundredIngestedCustomMetrics"),
      logIngestUsdPerGb: moneyAt(datadog, "datadog.logIngestUsdPerGb"),
      spanIngestUsdPerGb: moneyAt(datadog, "datadog.spanIngestUsdPerGb"),
      indexedAllowancePerHost: {
        pro: countAt(allowance, "datadog.indexedAllowancePerHost.pro"),
        enterprise: countAt(allowance, "datadog.indexedAllowancePerHost.enterprise"),
      },
      spanIngestAllowanceGbPerHost: countAt(datadog, "datadog.spanIngestAllowanceGbPerHost"),
      spanIndexAllowancePerHost: countAt(datadog, "datadog.spanIndexAllowancePerHost"),
      indexUsdPerMillionEvents: parsedIndex,
    },
    grafana: {
      seriesTiers: tiersAt(grafana.seriesTiers, "grafana.seriesTiers", "usdPerThousand"),
      processUsdPerGb: moneyAt(grafana, "grafana.processUsdPerGb"),
      writeUsdPerGb: moneyAt(grafana, "grafana.writeUsdPerGb"),
      retainUsdPerGbPer30Days: moneyAt(grafana, "grafana.retainUsdPerGbPer30Days"),
      includedGb: countAt(grafana, "grafana.includedGb"),
      includedSeries: countAt(grafana, "grafana.includedSeries"),
      includedDpm: countAt(grafana, "grafana.includedDpm"),
    },
    newRelic: {
      usdPerGb: moneyAt(newRelic, "newRelic.usdPerGb"),
      includedGb: countAt(newRelic, "newRelic.includedGb"),
      dataPlusUsdPerGb: moneyAt(newRelic, "newRelic.dataPlusUsdPerGb"),
    },
    honeycomb: {
      usdPerMillionEvents: moneyAt(honeycomb, "honeycomb.usdPerMillionEvents"),
      freeEvents: countAt(honeycomb, "honeycomb.freeEvents"),
      proMinimumUsd: moneyAt(honeycomb, "honeycomb.proMinimumUsd"),
    },
    cloudwatch: {
      metricTiers: tiersAt(cloudwatch.metricTiers, "cloudwatch.metricTiers", "usdEach"),
      logIngestUsdPerGb: moneyAt(cloudwatch, "cloudwatch.logIngestUsdPerGb"),
      logIngestFreeGb: countAt(cloudwatch, "cloudwatch.logIngestFreeGb"),
      logStorageUsdPerGbMonth: moneyAt(cloudwatch, "cloudwatch.logStorageUsdPerGbMonth"),
    },
  };
}

function tiersAt<Key extends string>(
  value: unknown,
  path: string,
  priceKey: Key,
): ({ upTo: number | null } & Record<Key, number>)[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  let previous = 0;
  return value.map((entry, index) => {
    const tier = objectAt(entry, `${path}[${index}]`);
    const upTo = tier.upTo;
    if (upTo !== null && (typeof upTo !== "number" || upTo <= previous)) {
      throw new Error(`${path}[${index}].upTo must be null or a limit above the previous tier`);
    }
    if (index === value.length - 1 && upTo !== null) throw new Error(`${path} must end with an open tier (upTo: null)`);
    if (upTo !== null) previous = upTo;
    return { upTo, [priceKey]: moneyAt(tier, `${path}[${index}].${priceKey}`) } as { upTo: number | null } & Record<Key, number>;
  });
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function stringAt(record: Record<string, unknown>, path: string): string {
  const value = record[path.split(".").pop() ?? ""];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function numberAt(record: Record<string, unknown>, path: string): number {
  const value = record[path.split(".").pop() ?? ""];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}

function moneyAt(record: Record<string, unknown>, path: string): number {
  const value = numberAt(record, path);
  if (value < 0) throw new Error(`${path} must be >= 0`);
  return value;
}

function countAt(record: Record<string, unknown>, path: string): number {
  const value = numberAt(record, path);
  if (value < 0) throw new Error(`${path} must be >= 0`);
  return value;
}
