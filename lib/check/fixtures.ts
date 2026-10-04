import { analyze } from "@/lib/check/analyze";
import type { Fetcher, FetchResult } from "@/lib/check/net";
import type { CheckInput, CheckResult } from "@/lib/check/types";

// Feste Beispielergebnisse für Tests (nicht für den Betrieb). Läuft durch dieselbe Engine wie /api/check.

const HTML = `<!doctype html><html lang="de-CH"><head>
<title>Malerei Keller Gossau, Maler und Gipser</title>
<meta name="description" content="Malerei Keller in Gossau: Innen- und Aussenanstriche, Fassaden und Gipserarbeiten für Private und Gewerbe in der Ostschweiz.">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><h1>Maler und Gipser in Gossau</h1><p>Wir streichen Wände.</p>
<a href="https://www.instagram.com/malereikeller">Instagram</a></body></html>`;

const fetcher: Fetcher = async (raw) => {
  const url = new URL(raw);
  const missing = url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml";
  const res: FetchResult = { url, status: missing ? 404 : 200, ok: !missing, headers: {}, body: missing ? "" : HTML, ms: 400 };
  return res;
};

export const SAMPLE_INPUT: CheckInput = {
  company: "Malerei Keller",
  city: "Gossau",
  industry: "craft",
  website: "malerei-keller.ch",
  socials: { instagram: { url: "instagram.com/malereikeller", freq: "monthly" } },
};

export function sampleResult(over: Partial<CheckInput> = {}): Promise<CheckResult> {
  return analyze({ ...SAMPLE_INPUT, ...over }, { fetcher, now: () => new Date("2026-10-04T10:00:00Z") });
}
