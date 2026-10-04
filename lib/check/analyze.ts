import { detectAll } from "@/lib/check/detect";
import { checkGoogleBusiness, type GbpOptions } from "@/lib/check/gbp";
import { MAX_ANALYZED_HTML } from "@/lib/check/html";
import { INDUSTRIES, isIndustryKey } from "@/lib/check/industries";
import { buildMassnahmen } from "@/lib/check/massnahmen";
import { safeFetch, type Fetcher, type FetchResult } from "@/lib/check/net";
import { checkSeo } from "@/lib/check/seo";
import { checkSocial } from "@/lib/check/social";
import { isIP } from "node:net";
import {
  CheckError,
  INDUSTRY_LABELS,
  type CheckCategory,
  type CheckInput,
  type CheckItem,
  type CheckResult,
  type CheckStepId,
  type IndustryKey,
} from "@/lib/check/types";

// Marketing-Check: Port der Analyse-Engine aus dem Agentur-Tool (Stand 02.10.2026).
// Gewichte und Punktzahlen sind gleich geblieben. Jede Aussage trägt eine Kennung (item.id),
// auf die Massnahmen und die spätere KI-Auswertung verweisen.

const REL = { hoch: 1, mittel: 0.5, gering: 0 } as const;

/** Macht aus Eingaben wie «keller-maler.ch» eine abrufbare https-Adresse. */
export function normalizeUrl(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) throw new CheckError("Bitte gib eine Website an.", "invalid");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) {
    throw new CheckError("Es sind nur Adressen mit http oder https erlaubt.", "invalid");
  }
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new CheckError("Das ist keine gültige Website-Adresse.", "invalid");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) throw new CheckError("Bitte gib den Domainnamen an, nicht eine IP-Adresse.", "invalid");
  if (!host.includes(".") || host.endsWith(".")) throw new CheckError("Bitte gib eine gültige Website-Adresse an.", "invalid");
  if (u.username || u.password) throw new CheckError("Bitte gib die Adresse ohne Zugangsdaten an.", "invalid");
  return u.toString();
}

export type AnalyzeOptions = {
  /** Austauschbar für Tests. */
  fetcher?: Fetcher;
  onStep?: (id: CheckStepId, state: "start" | "done") => void;
  gbp?: GbpOptions;
  now?: () => Date;
};

function failure(status: number): CheckError {
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    return new CheckError(`Die Website lässt automatische Abrufe nicht zu (Fehler ${status}). Der Check kann sie so nicht prüfen.`, "unreachable");
  }
  return new CheckError(`Die Website antwortet mit Fehler ${status}.`, "unreachable");
}

async function loadPage(website: string, fetcher: Fetcher): Promise<FetchResult> {
  let page: FetchResult | undefined;
  try {
    page = await fetcher(website);
  } catch (e) {
    if (e instanceof CheckError && e.code === "blocked") throw e;
    // https fehlgeschlagen: noch einmal mit http versuchen (alte Websites ohne Zertifikat).
    if (website.startsWith("https://")) {
      try {
        page = await fetcher(website.replace("https://", "http://"));
      } catch {
        /* unten */
      }
    }
    if (!page) throw new CheckError("Die Website konnte nicht geladen werden. Stimmt die Adresse?", "unreachable");
  }
  if (!page.ok) throw failure(page.status);
  return page;
}

const info = (item: CheckItem, relevance: "hoch" | "mittel" | "gering"): CheckItem => (relevance === "gering" && !item.ok ? { ...item, info: true } : item);

export async function analyze(input: CheckInput, options: AnalyzeOptions = {}): Promise<CheckResult> {
  const fetcher = options.fetcher ?? safeFetch;
  const step = (id: CheckStepId, state: "start" | "done") => options.onStep?.(id, state);

  const industry: IndustryKey = isIndustryKey(input.industry) ? input.industry : "other";
  const ind = INDUSTRIES[industry];
  const website = normalizeUrl(input.website);

  step("fetch", "start");
  const loaded = await loadPage(website, fetcher);
  // Die Analyse liest höchstens MAX_ANALYZED_HTML Zeichen: Das hält den Aufwand auch bei böswilligem HTML klein.
  const page = { ...loaded, body: loaded.body.slice(0, MAX_ANALYZED_HTML) };
  const origin = page.url.origin;
  const [robots, sitemap] = await Promise.all([
    fetcher(`${origin}/robots.txt`, { maxBytes: 100_000, timeout: 6000 }).catch(() => null),
    fetcher(`${origin}/sitemap.xml`, { maxBytes: 200_000, timeout: 6000 }).catch(() => null),
  ]);
  // Zeilenform «Regel: Wert». Eine Fehlerseite mit Status 200, auf der irgendwo «allow» steht, ist keine robots.txt.
  const hasRobots = Boolean(robots?.ok && /^\s*(?:user-agent|disallow|allow|sitemap)\s*:/im.test(robots.body));
  const hasSitemap = Boolean((sitemap?.ok && /<urlset|<sitemapindex/i.test(sitemap.body)) || /sitemap:/i.test(robots?.body ?? ""));
  step("fetch", "done");

  const html = page.body;
  const found = detectAll(html);

  step("seo", "start");
  const seo = checkSeo(page, { robots: hasRobots, sitemap: hasSitemap });
  step("seo", "done");

  step("gbp", "start");
  const gbp = await checkGoogleBusiness({ company: input.company, city: input.city, website: page.url.toString() }, found.mapsLink, options.gbp);
  step("gbp", "done");

  step("social", "start");
  const social = checkSocial(input.socials, found.socialLinks);
  step("social", "done");

  step("detect", "start");
  const t = found.tracking;
  const analytics = t.ga4 || t.gtm;
  const sea: CheckItem[] = [
    {
      id: "sea.analytics",
      ok: analytics,
      label: "Web-Analyse (Google Analytics oder Tag Manager)",
      detail: analytics ? "Eingebunden, Besucherzahlen werden gemessen" : "Nicht gefunden. Der Erfolg der Website ist nicht messbar",
    },
    {
      id: "sea.ads",
      ok: t.gads,
      info: !t.gads,
      label: "Google-Ads-Conversion-Tracking",
      detail: t.gads ? "Gefunden, deutet auf aktive Google-Werbung hin" : "Nicht gefunden, keine Hinweise auf Google Ads",
    },
    {
      id: "sea.meta",
      ok: t.meta,
      info: !t.meta,
      label: "Meta Pixel (Facebook- und Instagram-Werbung)",
      detail: t.meta ? "Gefunden" : "Nicht gefunden. Retargeting auf Instagram und Facebook ist so nicht möglich",
    },
  ];
  const seaScore = (analytics ? 0.4 : 0) + (t.gads ? 0.4 : 0) + (t.meta ? 0.2 : 0);

  const nlSystems = found.newsletterSystems.length ? ` (${found.newsletterSystems.join(", ")})` : "";
  const shopSystems = found.shopSystems.length ? ` (${found.shopSystems.join(", ")})` : "";
  const bookSystems = found.bookingSystems.length ? ` (${found.bookingSystems.join(", ")})` : "";

  const categories: CheckCategory[] = [
    { id: "seo", title: "Website und SEO", weight: 25, score: seo.score, items: seo.items },
    { id: "gbp", title: "Google-Business-Profil", weight: 20, score: gbp.score, items: gbp.items, verified: gbp.verified },
    { id: "social", title: "Social Media", weight: 20, score: social.score, items: social.items, channels: social.channels, selfReported: true },
    {
      id: "sea",
      title: "Online-Werbung und Tracking",
      weight: 12,
      score: seaScore,
      items: sea,
      note: "Ob Anzeigen tatsächlich laufen, zeigt das Google Ads Transparency Center. Werbung ist keine Pflicht: Fehlende Werbung senkt die Punktzahl, steht aber nicht als Mangel in der Liste.",
    },
    {
      id: "newsletter",
      title: "Newsletter",
      weight: 9,
      score: found.hasNewsletter ? 1 : 0,
      items: [
        {
          id: "newsletter.signup",
          ok: found.hasNewsletter,
          label: "Newsletter-Anmeldung",
          detail: found.hasNewsletter ? `Gefunden${nlSystems}` : "Keine Anmeldung gefunden. Mit E-Mail bleibst du günstig mit Stammkundschaft in Kontakt",
        },
      ],
    },
    {
      id: "shop",
      title: "Online-Shop",
      relevance: ind.shop,
      weight: 7 * REL[ind.shop],
      score: found.hasShop ? 1 : 0,
      hint: ind.shopHint,
      items: [
        info(
          {
            id: "shop.shop",
            ok: found.hasShop,
            label: "Online-Shop",
            detail: found.hasShop ? `Gefunden${shopSystems}` : ind.shop === "gering" ? "Kein Shop, für deine Branche meist auch nicht nötig" : "Kein Online-Shop gefunden",
          },
          ind.shop,
        ),
      ],
    },
    {
      id: "booking",
      title: "Online-Buchung",
      relevance: ind.booking,
      weight: 7 * REL[ind.booking],
      score: found.hasBooking ? 1 : 0,
      hint: ind.bookingHint,
      items: [
        info(
          {
            id: "booking.booking",
            ok: found.hasBooking,
            label: "Online-Buchung oder Reservation",
            detail: found.hasBooking ? `Gefunden${bookSystems}` : ind.booking === "gering" ? "Keine Online-Buchung, für deine Branche meist nicht nötig" : "Keine Online-Buchung gefunden",
          },
          ind.booking,
        ),
      ],
    },
  ];
  step("detect", "done");

  step("score", "start");
  const weighted = categories.filter((c) => c.weight > 0);
  const total = weighted.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((weighted.reduce((s, c) => s + c.score * c.weight, 0) / total) * 100);
  const massnahmen = buildMassnahmen(categories);
  step("score", "done");

  return {
    v: 1,
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
    company: input.company.trim() || page.url.hostname,
    city: input.city?.trim() ?? "",
    industry,
    industryLabel: INDUSTRY_LABELS[industry],
    url: page.url.toString(),
    score,
    categories,
    facts: {
      hasShop: found.hasShop,
      hasBooking: found.hasBooking,
      hasNewsletter: found.hasNewsletter,
      tracking: { ...found.tracking },
      gbpFound: gbp.found,
      gbpVerified: gbp.verified,
      socialCount: social.channels.length,
      seoScore: Math.round(seo.score * 100),
      shopRelevance: ind.shop,
      bookingRelevance: ind.booking,
      title: seo.title,
      description: seo.description,
    },
    massnahmen,
  };
}
