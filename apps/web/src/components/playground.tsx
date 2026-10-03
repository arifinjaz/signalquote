"use client";

import { useMemo, useState } from "react";
import { parse } from "yaml";
import {
  afterTheFix,
  cardinalityBomb,
  debugLogFlood,
  formatReport,
  formatUsd,
  inferLabelBounded,
  planToYaml,
  tryQuote,
  type LogLevel,
  type MetricPurpose,
  type MetricType,
  type TelemetryPlan,
  type VendorId,
} from "signalquote";
import { FindingList, LineItems, VendorBars, YieldList } from "@/components/money-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const presets = [
  { id: "bomb", label: "Cardinality bomb", plan: cardinalityBomb },
  { id: "fixed", label: "After the fix", plan: afterTheFix },
  { id: "debug", label: "Indexed debug logs", plan: debugLogFlood },
] as const;

const metricTypes: MetricType[] = ["counter", "gauge", "histogram", "native_histogram"];
const purposes: MetricPurpose[] = ["traffic", "latency", "errors", "saturation", "other"];
const levels: LogLevel[] = ["debug", "info", "warn", "error"];

function clonePlan(plan: TelemetryPlan): TelemetryPlan {
  return structuredClone(plan);
}

function numberValue(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function Playground() {
  const [plan, setPlan] = useState<TelemetryPlan>(() => clonePlan(cardinalityBomb));
  const [preset, setPreset] = useState("bomb");
  const [vendor, setVendor] = useState<VendorId>("datadog");
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => tryQuote(plan), [plan]);
  const yaml = useMemo(() => planToYaml(plan), [plan]);

  function loadPreset(id: string) {
    const found = presets.find((entry) => entry.id === id);
    if (!found) return;
    setPreset(found.id);
    setPlan(clonePlan(found.plan));
    setPasteError(null);
  }

  function edit(next: TelemetryPlan) {
    setPreset("custom");
    setPlan(next);
  }

  function dropDriver() {
    if (!result.ok || !result.report.primaryDriver) return;
    const driver = result.report.primaryDriver;
    edit({
      ...plan,
      metrics: (plan.metrics ?? []).map((metric) =>
        metric.name === driver.metric
          ? { ...metric, labels: (metric.labels ?? []).filter((label) => label.name !== driver.label) }
          : metric,
      ),
    });
  }

  async function copyYaml() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function applyPaste() {
    try {
      const parsed = parse(paste);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setPasteError("Paste a YAML object with a service name.");
        return;
      }
      const checked = tryQuote(parsed as TelemetryPlan);
      if (!checked.ok) {
        setPasteError(checked.error);
        return;
      }
      setPasteError(null);
      edit(parsed as TelemetryPlan);
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "Could not parse that YAML.");
    }
  }

  const report = result.ok ? result.report : null;
  const focus = report?.quotes.find((entry) => entry.vendor === vendor) ?? report?.quotes[0];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section className="space-y-6">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Quote a service</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Describe what the service emits. The receipt updates from the same function the CLI runs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((entry) => (
            <Button key={entry.id} variant={preset === entry.id ? "default" : "outline"} onClick={() => loadPreset(entry.id)}>
              {entry.label}
            </Button>
          ))}
          {preset === "custom" ? <Badge variant="secondary">Edited</Badge> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service">
            <Input value={plan.service} onChange={(event) => edit({ ...plan, service: event.target.value })} />
          </Field>
          <Field label="Team">
            <Input value={plan.team ?? ""} onChange={(event) => edit({ ...plan, team: event.target.value })} />
          </Field>
          <Field label="Datadog hosts">
            <Input
              type="number"
              min={0}
              value={plan.hosts ?? 1}
              onChange={(event) => {
                const hosts = numberValue(event.target.value);
                if (hosts === null) return;
                edit({ ...plan, hosts });
              }}
            />
          </Field>
          <Field label="Monthly budget, USD">
            <Input
              type="number"
              min={0}
              value={plan.budgetUsdMonth ?? 0}
              onChange={(event) => {
                const budgetUsdMonth = numberValue(event.target.value);
                if (budgetUsdMonth === null) return;
                edit({ ...plan, budgetUsdMonth });
              }}
            />
          </Field>
        </div>

        <SignalBlock title="Metrics" onAdd={() => edit({ ...plan, metrics: [...(plan.metrics ?? []), blankMetric()] })}>
          {(plan.metrics ?? []).map((metric, index) => (
            <div key={`metric-${index}`} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <Input
                  aria-label={`Metric ${index + 1} name`}
                  value={metric.name}
                  onChange={(event) => updateMetric(plan, edit, index, { name: event.target.value })}
                />
                <Button variant="ghost" onClick={() => edit({ ...plan, metrics: plan.metrics?.filter((_, item) => item !== index) })}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type">
                  <Select
                    value={metric.type ?? "gauge"}
                    onValueChange={(value) => {
                      if (metricTypes.includes(value as MetricType)) {
                        updateMetric(plan, edit, index, { type: value as MetricType });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {metricTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Purpose">
                  <Select
                    value={metric.purpose ?? "other"}
                    onValueChange={(value) => {
                      if (purposes.includes(value as MetricPurpose)) {
                        updateMetric(plan, edit, index, { purpose: value as MetricPurpose });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {purposes.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {purpose}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Interval, seconds">
                  <Input
                    type="number"
                    min={1}
                    value={metric.intervalSeconds ?? 60}
                    onChange={(event) => {
                      const intervalSeconds = numberValue(event.target.value);
                      if (intervalSeconds === null) return;
                      updateMetric(plan, edit, index, { intervalSeconds });
                    }}
                  />
                </Field>
              </div>
              {(metric.labels ?? []).map((label, labelIndex) => (
                <div key={`label-${labelIndex}`} className="grid grid-cols-[1fr_6rem_auto_auto] items-end gap-2">
                  <Field label={labelIndex === 0 ? "Label" : ""}>
                    <Input
                      aria-label={`Label ${labelIndex + 1} name`}
                      value={label.name}
                      onChange={(event) => updateLabel(plan, edit, index, labelIndex, { name: event.target.value })}
                    />
                  </Field>
                  <Field label={labelIndex === 0 ? "Values" : ""}>
                    <Input
                      aria-label={`Label ${labelIndex + 1} cardinality`}
                      type="number"
                      min={1}
                      value={label.cardinality}
                      onChange={(event) => {
                        const cardinality = numberValue(event.target.value);
                        if (cardinality === null) return;
                        updateLabel(plan, edit, index, labelIndex, { cardinality });
                      }}
                    />
                  </Field>
                  <label className="flex h-8 items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={label.bounded ?? inferLabelBounded(label.name)}
                      onChange={(event) => updateLabel(plan, edit, index, labelIndex, { bounded: event.target.checked })}
                    />
                    Bounded
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateMetric(plan, edit, index, {
                        labels: metric.labels?.filter((_, item) => item !== labelIndex),
                      })
                    }
                  >
                    Drop
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateMetric(plan, edit, index, {
                    labels: [...(metric.labels ?? []), { name: "region", cardinality: 3, bounded: true }],
                  })
                }
              >
                Add label
              </Button>
            </div>
          ))}
        </SignalBlock>

        <SignalBlock title="Logs" onAdd={() => edit({ ...plan, logs: [...(plan.logs ?? []), blankLog()] })}>
          {(plan.logs ?? []).map((log, index) => (
            <div key={`log-${index}`} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label={`Log ${index + 1} name`}
                  value={log.name}
                  onChange={(event) => updateLog(plan, edit, index, { name: event.target.value })}
                />
                <Button variant="ghost" onClick={() => edit({ ...plan, logs: plan.logs?.filter((_, item) => item !== index) })}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Events / second">
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={log.eventsPerSecond}
                    onChange={(event) => {
                      const eventsPerSecond = numberValue(event.target.value);
                      if (eventsPerSecond === null) return;
                      updateLog(plan, edit, index, { eventsPerSecond });
                    }}
                  />
                </Field>
                <Field label="Average bytes">
                  <Input
                    type="number"
                    min={1}
                    value={log.avgBytes}
                    onChange={(event) => {
                      const avgBytes = numberValue(event.target.value);
                      if (avgBytes === null) return;
                      updateLog(plan, edit, index, { avgBytes });
                    }}
                  />
                </Field>
                <Field label="Level">
                  <Select
                    value={log.level ?? "info"}
                    onValueChange={(value) => {
                      if (levels.includes(value as LogLevel)) updateLog(plan, edit, index, { level: value as LogLevel });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Index ratio">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    value={log.indexRatio ?? 1}
                    onChange={(event) => {
                      const indexRatio = numberValue(event.target.value);
                      if (indexRatio === null) return;
                      updateLog(plan, edit, index, { indexRatio });
                    }}
                  />
                </Field>
                <Field label="Retention, days">
                  <Input
                    type="number"
                    min={1}
                    value={log.retentionDays ?? 15}
                    onChange={(event) => {
                      const retentionDays = numberValue(event.target.value);
                      if (retentionDays === null) return;
                      updateLog(plan, edit, index, { retentionDays });
                    }}
                  />
                </Field>
                <Field label="Attribute names, comma separated">
                  <Input
                    value={(log.attributes ?? []).map((attribute) => attribute.name).join(", ")}
                    onChange={(event) =>
                      updateLog(plan, edit, index, {
                        attributes: event.target.value
                          .split(",")
                          .map((name) => name.trim())
                          .filter(Boolean)
                          .map((name) => ({ name })),
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </SignalBlock>

        <SignalBlock title="Spans" onAdd={() => edit({ ...plan, spans: [...(plan.spans ?? []), blankSpan()] })}>
          {(plan.spans ?? []).map((span, index) => (
            <div key={`span-${index}`} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label={`Span ${index + 1} name`}
                  value={span.name}
                  onChange={(event) => updateSpan(plan, edit, index, { name: event.target.value })}
                />
                <Button variant="ghost" onClick={() => edit({ ...plan, spans: plan.spans?.filter((_, item) => item !== index) })}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Spans / second">
                  <Input
                    type="number"
                    min={0}
                    value={span.spansPerSecond}
                    onChange={(event) => {
                      const spansPerSecond = numberValue(event.target.value);
                      if (spansPerSecond === null) return;
                      updateSpan(plan, edit, index, { spansPerSecond });
                    }}
                  />
                </Field>
                <Field label="Average bytes">
                  <Input
                    type="number"
                    min={1}
                    value={span.avgBytes}
                    onChange={(event) => {
                      const avgBytes = numberValue(event.target.value);
                      if (avgBytes === null) return;
                      updateSpan(plan, edit, index, { avgBytes });
                    }}
                  />
                </Field>
                <Field label="Index ratio">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    value={span.indexRatio ?? 1}
                    onChange={(event) => {
                      const indexRatio = numberValue(event.target.value);
                      if (indexRatio === null) return;
                      updateSpan(plan, edit, index, { indexRatio });
                    }}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={span.hasTraceId !== false}
                    onChange={(event) => updateSpan(plan, edit, index, { hasTraceId: event.target.checked })}
                  />
                  Has trace id
                </label>
              </div>
            </div>
          ))}
        </SignalBlock>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-2xl">Plan YAML</h2>
            <Button variant="outline" size="sm" onClick={copyYaml}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-foreground p-3 font-mono text-xs leading-relaxed text-background">
            {yaml}
          </pre>
          <Label htmlFor="paste-plan">Paste a plan and apply it</Label>
          <textarea
            id="paste-plan"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder="service: billing&#10;hosts: 4&#10;metrics: []"
            className="min-h-28 w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-xs"
          />
          <Button variant="secondary" onClick={applyPaste} disabled={paste.trim() === ""}>
            Apply pasted plan
          </Button>
          {pasteError ? <p className="text-sm text-destructive">{pasteError}</p> : null}
        </div>
      </section>

      <aside className="space-y-5 lg:sticky lg:top-20">
        {!report || !focus ? (
          <div className="rounded-xl border border-destructive/40 bg-card p-5">
            <h2 className="font-serif text-3xl">This plan cannot be quoted</h2>
            <p className="mt-2 text-sm leading-relaxed">{result.ok ? "" : result.error}</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div>
              <div className="font-mono text-xs text-muted-foreground">
                {report.plan.service}
                {report.plan.team ? ` · ${report.plan.team}` : ""} · catalog v{report.catalogVersion} · {report.catalogAsOf}
              </div>
              <h2 className="mt-1 font-serif text-3xl leading-tight">
                {focus.displayName} {formatUsd(focus.usd)}
                <span className="text-lg text-muted-foreground"> / month</span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{report.headline}</p>
            </div>

            {report.plan.budgetUsdMonth !== undefined ? (
              <p className={`font-mono text-xs ${focus.usd > report.plan.budgetUsdMonth ? "text-destructive" : "text-emerald-800"}`}>
                {focus.usd > report.plan.budgetUsdMonth ? "Over" : "Inside"} the {formatUsd(report.plan.budgetUsdMonth)} budget
                {vendor === focus.vendor ? "" : ` on ${focus.displayName}`}
              </p>
            ) : null}

            {report.primaryDriver ? (
              <Button onClick={dropDriver}>
                Drop {report.primaryDriver.label} and requote
              </Button>
            ) : null}

            <VendorBars quotes={report.quotes} />

            <Tabs value={focus.vendor} onValueChange={(value) => setVendor(value as VendorId)}>
              <TabsList className="flex h-auto w-full flex-wrap">
                {report.quotes.map((entry) => (
                  <TabsTrigger key={entry.vendor} value={entry.vendor}>
                    {entry.displayName}
                  </TabsTrigger>
                ))}
              </TabsList>
              {report.quotes.map((entry) => (
                <TabsContent key={entry.vendor} value={entry.vendor} className="mt-4 space-y-4">
                  <LineItems quote={entry} />
                  <details className="text-xs leading-relaxed text-muted-foreground">
                    <summary className="cursor-pointer text-foreground">Assumptions and sources</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {entry.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                    <ul className="mt-2 space-y-1">
                      {entry.sources.map((source) => (
                        <li key={source.url}>
                          <a className="underline" href={source.url}>
                            {source.title}
                          </a>{" "}
                          · as of {source.asOf}
                        </li>
                      ))}
                    </ul>
                  </details>
                </TabsContent>
              ))}
            </Tabs>

            <div>
              <h3 className="mb-2 font-serif text-2xl">Findings</h3>
              <FindingList findings={report.findings} />
            </div>
            <div>
              <h3 className="mb-2 font-serif text-2xl">Checks</h3>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                Named rules. Each line is pass, warn, or fail, with the reason. There is no combined score.
              </p>
              <YieldList yields={report.yields} />
            </div>
            <details>
              <summary className="cursor-pointer font-mono text-xs">Plain-text report</summary>
              <pre className="mt-2 overflow-auto text-xs leading-relaxed whitespace-pre-wrap">{formatReport(report, focus.vendor)}</pre>
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label ? <Label>{label}</Label> : <span className="block h-5" />}
      {children}
    </div>
  );
}

function SignalBlock({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">{title}</h2>
        <Button variant="outline" size="sm" onClick={onAdd}>
          Add
        </Button>
      </div>
      {children}
    </section>
  );
}

function blankMetric() {
  return {
    name: "app.requests",
    type: "counter" as const,
    purpose: "traffic" as const,
    intervalSeconds: 60,
    labels: [{ name: "http.status_code", cardinality: 5, bounded: true }],
  };
}

function blankLog() {
  return {
    name: "app.log",
    eventsPerSecond: 1,
    avgBytes: 400,
    level: "info" as const,
    indexRatio: 1,
    retentionDays: 15,
    attributes: [{ name: "trace_id" }],
  };
}

function blankSpan() {
  return {
    name: "app.request",
    spansPerSecond: 1,
    avgBytes: 800,
    indexRatio: 0.1,
    retentionDays: 15,
    hasTraceId: true,
  };
}

function updateMetric(
  plan: TelemetryPlan,
  edit: (plan: TelemetryPlan) => void,
  index: number,
  patch: Partial<NonNullable<TelemetryPlan["metrics"]>[number]>,
) {
  edit({
    ...plan,
    metrics: (plan.metrics ?? []).map((metric, item) => (item === index ? { ...metric, ...patch } : metric)),
  });
}

function updateLabel(
  plan: TelemetryPlan,
  edit: (plan: TelemetryPlan) => void,
  metricIndex: number,
  labelIndex: number,
  patch: Partial<NonNullable<NonNullable<TelemetryPlan["metrics"]>[number]["labels"]>[number]>,
) {
  const metric = plan.metrics?.[metricIndex];
  if (!metric) return;
  updateMetric(plan, edit, metricIndex, {
    labels: (metric.labels ?? []).map((label, item) => (item === labelIndex ? { ...label, ...patch } : label)),
  });
}

function updateLog(
  plan: TelemetryPlan,
  edit: (plan: TelemetryPlan) => void,
  index: number,
  patch: Partial<NonNullable<TelemetryPlan["logs"]>[number]>,
) {
  edit({
    ...plan,
    logs: (plan.logs ?? []).map((log, item) => (item === index ? { ...log, ...patch } : log)),
  });
}

function updateSpan(
  plan: TelemetryPlan,
  edit: (plan: TelemetryPlan) => void,
  index: number,
  patch: Partial<NonNullable<TelemetryPlan["spans"]>[number]>,
) {
  edit({
    ...plan,
    spans: (plan.spans ?? []).map((span, item) => (item === index ? { ...span, ...patch } : span)),
  });
}
