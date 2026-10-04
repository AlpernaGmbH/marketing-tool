import { attr, decode, metaContent, textOf } from "@/lib/check/html";
import type { CheckItem } from "@/lib/check/types";

// Website und SEO: 16 gewichtete Prüfpunkte. Gewichte wie im Agentur-Tool (Stand 02.10.2026).

export type SeoPage = {
  url: URL;
  body: string;
  headers: Record<string, string>;
  /** Antwortzeit in Millisekunden. */
  ms: number;
};

export type SeoExtras = { robots: boolean; sitemap: boolean };

export type SeoResult = { score: number; items: CheckItem[]; title: string; description: string };

export function checkSeo(page: SeoPage, extras: SeoExtras): SeoResult {
  const html = page.body;
  const items: CheckItem[] = [];
  const add = (id: string, ok: boolean, label: string, detail: string, weight = 1) =>
    items.push({ id: `seo.${id}`, ok, label, detail, weight });

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  add(
    "title",
    title.length >= 10 && title.length <= 65,
    "Seitentitel",
    title ? `«${title.slice(0, 80)}», ${title.length} Zeichen (ideal 10 bis 65)` : "Kein Seitentitel gefunden",
    2,
  );

  const desc = metaContent(html, "description") ?? "";
  add(
    "description",
    desc.length >= 50 && desc.length <= 165,
    "Meta-Beschreibung",
    desc ? `${desc.length} Zeichen (ideal 50 bis 160)` : "Fehlt. Google wählt selbst einen Textausschnitt",
    2,
  );

  const h1s = (html.match(/<h1\b[\s\S]*?<\/h1>/gi) ?? []).map((h) => textOf(h)).filter(Boolean);
  add(
    "h1",
    h1s.length === 1,
    "Hauptüberschrift (H1)",
    h1s.length === 0 ? "Keine H1 gefunden" : h1s.length === 1 ? `«${h1s[0].slice(0, 70)}»` : `${h1s.length} H1-Überschriften (ideal: genau eine)`,
    1.5,
  );

  const https = page.url.protocol === "https:";
  add("https", https, "HTTPS-Verschlüsselung", https ? "Aktiv" : "Die Website läuft ohne HTTPS", 2);

  const viewport = /<meta[^>]+name=["']?viewport/i.test(html);
  add(
    "viewport",
    viewport,
    "Mobile-Optimierung (Viewport)",
    viewport ? "Vorhanden" : "Kein Viewport. Die Darstellung auf dem Handy ist vermutlich schlecht",
    2,
  );

  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] ?? "", "lang");
  add("lang", Boolean(lang), "Sprachangabe", lang ? `lang="${lang}"` : "Fehlt", 0.5);

  const canonical = /<link[^>]+rel=["']?canonical/i.test(html);
  add("canonical", canonical, "Canonical-Tag", canonical ? "Vorhanden" : "Fehlt. Das Risiko doppelter Inhalte steigt", 0.5);

  const og = Boolean(metaContent(html, "og:title") && metaContent(html, "og:image"));
  add(
    "og",
    og,
    "Vorschau für geteilte Links (Open Graph)",
    og ? "Titel und Bild für geteilte Links vorhanden" : "Fehlt. Geteilte Links sehen unattraktiv aus",
    1,
  );

  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(" ");
  const localBiz =
    /"@type"\s*:\s*"?(LocalBusiness|Restaurant|Store|Hotel|Dentist|MedicalBusiness|HealthAndBeautyBusiness|HairSalon|BeautySalon|AutoRepair|ProfessionalService|HomeAndConstructionBusiness|FoodEstablishment|Organization)/i.test(
      ld,
    );
  add(
    "schema",
    localBiz,
    "Strukturierte Daten (Schema.org)",
    localBiz ? "Firmendaten für Google hinterlegt" : ld ? "Vorhanden, aber ohne Firmenangaben" : "Fehlen. Google versteht Adresse und Öffnungszeiten schlechter",
    1,
  );

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgs.filter((t) => (attr(t, "alt") ?? "").length > 0).length;
  const altRatio = imgs.length ? withAlt / imgs.length : 1;
  add("alt", altRatio >= 0.8, "Bildbeschreibungen (Alt-Texte)", imgs.length ? `${withAlt} von ${imgs.length} Bildern beschrieben` : "Keine Bilder gefunden", 1);

  const noindex = /noindex/i.test(metaContent(html, "robots") ?? "") || /noindex/i.test(page.headers["x-robots-tag"] ?? "");
  add(
    "index",
    !noindex,
    "Indexierung durch Google",
    noindex ? "Die Seite ist auf «noindex» gesetzt und erscheint nicht bei Google" : "Erlaubt",
    3,
  );

  add("sitemap", extras.sitemap, "XML-Sitemap", extras.sitemap ? "Gefunden" : "Keine sitemap.xml gefunden", 1);
  add("robots", extras.robots, "robots.txt", extras.robots ? "Gefunden" : "Nicht gefunden", 0.5);

  const words = textOf(html)
    .split(" ")
    .filter((w) => w.length > 2).length;
  add("text", words >= 250, "Textumfang Startseite", `rund ${words} Wörter${words < 250 ? ", wenig Inhalt für Google" : ""}`, 1);

  const secs = (page.ms / 1000).toFixed(1).replace(".", ",");
  add("speed", page.ms < 2500, "Antwortzeit des Servers", `${secs} s${page.ms >= 2500 ? ", langsam" : ""}`, 1.5);

  const kb = Math.round(Buffer.byteLength(html) / 1024);
  add("size", kb < 600, "Grösse der HTML-Seite", `${kb} KB`, 0.5);

  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  const score = items.reduce((s, i) => s + (i.ok ? (i.weight ?? 1) : 0), 0) / total;
  return { score, items, title, description: desc };
}
