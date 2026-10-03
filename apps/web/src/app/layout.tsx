import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "signalquote — the telemetry invoice, before you ship it",
  description:
    "An open-source library that quotes the monthly cost of logs, metrics, and traces across Datadog, Grafana Cloud, New Relic, Honeycomb, and CloudWatch before a pull request merges.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} antialiased`}>
        <SiteHeader />
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-muted-foreground sm:px-6">
          signalquote is not affiliated with Datadog, Grafana Labs, New Relic, Honeycomb, or Amazon Web Services. MIT
          licensed.
        </footer>
      </body>
    </html>
  );
}
