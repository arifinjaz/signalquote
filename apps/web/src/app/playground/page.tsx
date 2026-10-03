import type { Metadata } from "next";
import { Playground } from "@/components/playground";

export const metadata: Metadata = {
  title: "Playground — signalquote",
  description: "Quote a telemetry plan across Datadog, Grafana Cloud, New Relic, Honeycomb, and CloudWatch.",
};

export default function PlaygroundPage() {
  return (
    <main>
      <Playground />
    </main>
  );
}
