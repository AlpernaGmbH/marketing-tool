import { describe, expect, it } from "vitest";
import { analyze, normalizeUrl } from "@/lib/check/analyze";
import { detectAll } from "@/lib/check/detect";
import { checkGoogleBusiness } from "@/lib/check/gbp";
import { buildMassnahmen } from "@/lib/check/massnahmen";
import type { Fetcher, FetchResult } from "@/lib/check/net";
import { checkSocial } from "@/lib/check/social";
import { CHECK_STEPS, CheckError, type CheckCategory, type CheckInput, type CheckStepId } from "@/lib/check/types";

const WORDS = Array.from({ length: 300 }, (_, i) => `Wort${i}`).join(" ");

const GOOD = `<!doctype html><html lang="de-CH"><head>
<title>Malerei Keller Gossau, Maler und Gipser</title>
<meta name="description" content="Malerei Keller in Gossau: Innen- und Aussenanstriche, Fassaden und Gipserarbeiten für Private und Gewerbe in der Ostschweiz.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://keller.ch/">
<meta property="og:title" content="Malerei Keller"><meta property="og:image" content="https://keller.ch/og.png">
<script type="application/ld+json">{"@type":"LocalBusiness","name":"Malerei Keller"}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
</head><body>
<h1>Maler und Gipser in Gossau</h1>
<p>${WORDS}</p>
<img src="a.jpg" alt="Fassade in Gossau"><img src="b.jpg" alt="Team">
<a href="https://www.instagram.com/malereikeller">Instagram</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Teilen</a>
<a href="https://calendly.com/keller/besichtigung">Termin buchen</a>
<a href="https://maps.app.goo.gl/abc">Anfahrt</a>
<form action="https://keller.us1.list-manage.com/subscribe"><input type="email" name="EMAIL"> Newsletter</form>
</body></html>`;

const POOR = `<html><head></head><body><p>Hallo</p></body></html>`;
const NOINDEX = `<html lang="de"><head><title>Baustelle bitte warten</title><meta name="robots" content="noindex,nofollow"></head><body><h1>A</h1><h1>B</h1></body></html>`;

function res(url: string, body: string, init: Partial<FetchResult> = {}): FetchResult {
  return { url: new URL(url), status: 200, ok: true, headers: {}, body, ms: 300, ...init };
}

/** Fetcher mit festen Antworten: Startseite, robots.txt und sitemap.xml. */
function fakeFetcher(html: string, extra: { robots?: string; sitemap?: string; init?: Partial<FetchResult> } = {}): Fetcher {
  return async (raw) => {
    const url = new URL(raw);
    if (url.pathname === "/robots.txt") {
      return extra.robots ? res(raw, extra.robots) : res(raw, "Not found", { status: 404, ok: false });
    }
    if (url.pathname === "/sitemap.xml") {
      return extra.sitemap ? res(raw, extra.sitemap) : res(raw, "Not found", { status: 404, ok: false });
    }
    return res(raw, html, extra.init);
  };
}

const input = (over: Partial<CheckInput> = {}): CheckInput => ({ company: "Malerei Keller", city: "Gossau", industry: "craft", website: "keller.ch", ...over });

describe("normalizeUrl", () => {
  it("ergänzt https und trimmt", () => {
    expect(normalizeUrl("  keller.ch ")).toBe("https://keller.ch/");
    expect(normalizeUrl("www.keller.ch/leistungen")).toBe("https://www.keller.ch/leistungen");
    expect(normalizeUrl("http://keller.ch")).toBe("http://keller.ch/");
  });
  it.each(["", "   ", "ftp://keller.ch", "javascript:alert(1)", "localhost", "http://127.0.0.1", "https://user:pw@keller.ch", "keine adresse"])(
    "lehnt %j ab",
    (raw) => {
      expect(() => normalizeUrl(raw)).toThrow(CheckError);
    },
  );
});

describe("analyze: gute Website", () => {
  it("bewertet eine vollständige Seite und erzeugt keine SEO-Massnahmen", async () => {
    const r = await analyze(input(), {
      fetcher: fakeFetcher(GOOD, { robots: "User-agent: *\nSitemap: https://keller.ch/sitemap.xml", sitemap: "<urlset></urlset>" }),
      now: () => new Date("2026-10-04T10:00:00Z"),
    });
    const seo = r.categories.find((c) => c.id === "seo")!;
    expect(seo.score).toBe(1);
    expect(seo.items.every((i) => i.ok)).toBe(true);
    expect(r.checkedAt).toBe("2026-10-04T10:00:00.000Z");
    expect(r.facts.tracking.ga4).toBe(true);
    expect(r.facts.hasNewsletter).toBe(true);
    expect(r.facts.hasBooking).toBe(true);
    expect(r.facts.gbpFound).toBe("wahrscheinlich");
    expect(r.facts.gbpVerified).toBe(false);
    expect(r.facts.title).toBe("Malerei Keller Gossau, Maler und Gipser");
    expect(r.massnahmen.some((m) => m.itemId.startsWith("seo."))).toBe(false);
  });

  it("ignoriert Teilen-Knöpfe als Social-Kanal", () => {
    const found = detectAll(GOOD);
    expect(found.socialLinks.instagram).toContain("instagram.com/malereikeller");
    expect(found.socialLinks.facebook).toBeUndefined();
  });

  it("erkennt Newsletter-System und Buchungs-Anbieter beim Namen", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(GOOD) });
    const nl = r.categories.find((c) => c.id === "newsletter")!;
    const booking = r.categories.find((c) => c.id === "booking")!;
    expect(nl.items[0].detail).toContain("Mailchimp");
    expect(booking.items[0].detail).toContain("Calendly");
  });
});

describe("analyze: schwache Website", () => {
  it("findet die Lücken und ordnet die Massnahmen nach Wirkung", async () => {
    const r = await analyze(input({ website: "http://keller.ch" }), { fetcher: fakeFetcher(POOR) });
    const failed = r.categories.find((c) => c.id === "seo")!.items.filter((i) => !i.ok).map((i) => i.id);
    expect(failed).toEqual(expect.arrayContaining(["seo.title", "seo.description", "seo.h1", "seo.https", "seo.viewport", "seo.og", "seo.schema", "seo.sitemap", "seo.text"]));
    expect(r.score).toBeLessThan(40);
    const rank = { hoch: 0, mittel: 1, gering: 2 } as const;
    const wirkungen = r.massnahmen.map((m) => rank[m.wirkung]);
    expect(wirkungen).toEqual([...wirkungen].sort((a, b) => a - b));
    expect(r.massnahmen[0].wirkung).toBe("hoch");
  });

  it("meldet noindex und mehrere H1", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(NOINDEX) });
    const items = Object.fromEntries(r.categories[0].items.map((i) => [i.id, i]));
    expect(items["seo.index"].ok).toBe(false);
    expect(items["seo.h1"].detail).toContain("2 H1");
    expect(r.massnahmen.find((m) => m.itemId === "seo.index")?.wirkung).toBe("hoch");
  });

  it("erkennt noindex im Header", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(GOOD, { init: { headers: { "x-robots-tag": "noindex" } } }) });
    expect(r.categories[0].items.find((i) => i.id === "seo.index")?.ok).toBe(false);
  });

  it("wertet langsame Antworten ab", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(GOOD, { init: { ms: 4200 } }) });
    expect(r.categories[0].items.find((i) => i.id === "seo.speed")).toMatchObject({ ok: false, detail: "4,2 s, langsam" });
  });
});

describe("analyze: Gewichtung", () => {
  it("setzt Shop und Buchung nach Branche (craft: Shop 0, Buchung 3,5)", async () => {
    const r = await analyze(input({ industry: "craft" }), { fetcher: fakeFetcher(POOR) });
    const w = Object.fromEntries(r.categories.map((c) => [c.id, c.weight]));
    expect(w).toEqual({ seo: 25, gbp: 20, social: 20, sea: 12, newsletter: 9, shop: 0, booking: 3.5 });
  });

  it("setzt Shop und Buchung für Gastronomie (Shop 0, Buchung 7)", async () => {
    const r = await analyze(input({ industry: "gastro" }), { fetcher: fakeFetcher(POOR) });
    expect(r.categories.find((c) => c.id === "booking")!.weight).toBe(7);
    expect(r.categories.find((c) => c.id === "shop")!.weight).toBe(0);
  });

  it("fällt bei unbekannter Branche auf «other» zurück", async () => {
    const r = await analyze(input({ industry: "raumschiff" }), { fetcher: fakeFetcher(POOR) });
    expect(r.industry).toBe("other");
    expect(r.categories.find((c) => c.id === "shop")!.weight).toBe(3.5);
  });

  it("ergibt die Gesamtpunktzahl als gewichtetes Mittel", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(POOR) });
    const w = r.categories.filter((c) => c.weight > 0);
    const expected = Math.round((w.reduce((s, c) => s + c.score * c.weight, 0) / w.reduce((s, c) => s + c.weight, 0)) * 100);
    expect(r.score).toBe(expected);
  });

  it("markiert fehlenden Shop bei geringer Relevanz als Hinweis, nicht als Mangel", async () => {
    const r = await analyze(input({ industry: "craft" }), { fetcher: fakeFetcher(POOR) });
    const shop = r.categories.find((c) => c.id === "shop")!.items[0];
    expect(shop).toMatchObject({ ok: false, info: true });
    expect(r.massnahmen.find((m) => m.itemId === "shop.shop")).toBeUndefined();
  });

  it("zählt fehlende Werbung in der Punktzahl, aber nicht als Mangel", async () => {
    const r = await analyze(input(), { fetcher: fakeFetcher(POOR) });
    const sea = r.categories.find((c) => c.id === "sea")!;
    expect(sea.items.find((i) => i.id === "sea.ads")).toMatchObject({ ok: false, info: true });
    expect(r.massnahmen.some((m) => m.itemId === "sea.ads" || m.itemId === "sea.meta")).toBe(false);
    expect(r.massnahmen.some((m) => m.itemId === "sea.analytics")).toBe(true);
  });
});

describe("analyze: Ablauf und Fehler", () => {
  it("meldet die Schritte in fester Reihenfolge, jeden mit Start und Ende", async () => {
    const events: string[] = [];
    await analyze(input(), { fetcher: fakeFetcher(GOOD), onStep: (id: CheckStepId, state) => events.push(`${id}:${state}`) });
    expect(events).toEqual(CHECK_STEPS.flatMap((s) => [`${s.id}:start`, `${s.id}:done`]));
  });

  it("versucht http, wenn https scheitert", async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (raw) => {
      seen.push(raw);
      if (raw.startsWith("https://")) throw new CheckError("Die Website konnte nicht geladen werden.", "unreachable");
      return fakeFetcher(POOR)(raw);
    };
    const r = await analyze(input(), { fetcher });
    expect(seen[0]).toBe("https://keller.ch/");
    expect(seen[1]).toBe("http://keller.ch/");
    expect(r.url).toBe("http://keller.ch/");
  });

  it("gibt blockierte Adressen unverändert weiter und versucht kein http", async () => {
    let calls = 0;
    const fetcher: Fetcher = async () => {
      calls++;
      throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
    };
    await expect(analyze(input(), { fetcher })).rejects.toMatchObject({ code: "blocked" });
    expect(calls).toBe(1);
  });

  it("erklärt gesperrte Abrufe und Fehlerseiten verständlich", async () => {
    await expect(analyze(input(), { fetcher: fakeFetcher("", { init: { status: 403, ok: false } }) })).rejects.toThrow("automatische Abrufe");
    await expect(analyze(input(), { fetcher: fakeFetcher("", { init: { status: 404, ok: false } }) })).rejects.toThrow("Fehler 404");
  });

  it("meldet nicht erreichbare Websites", async () => {
    const fetcher: Fetcher = async () => {
      throw new CheckError("x", "unreachable");
    };
    await expect(analyze(input(), { fetcher })).rejects.toMatchObject({ code: "unreachable", message: expect.stringContaining("Stimmt die Adresse") });
  });

  it("verwendet den Hostnamen, wenn kein Firmenname angegeben ist", async () => {
    const r = await analyze(input({ company: "  " }), { fetcher: fakeFetcher(POOR) });
    expect(r.company).toBe("keller.ch");
  });
});

describe("checkSocial", () => {
  it("rechnet die Formel der Engine: ein Kanal, wöchentlich, verlinkt", () => {
    const r = checkSocial({ instagram: { url: "instagram.com/keller", freq: "weekly" } }, { instagram: "https://instagram.com/keller" });
    expect(r.score).toBeCloseTo(0.55 * 0.8 + 0.25 * 0.8 + 0.1 * (1 / 3) + 0.1 * 1, 10);
    expect(r.items.find((i) => i.id === "social.freq.instagram")?.ok).toBe(true);
  });

  it("ohne Kanäle: Punktzahl 0 und ein Prüfpunkt", () => {
    const r = checkSocial(undefined, {});
    expect(r.score).toBe(0);
    expect(r.items.map((i) => i.id)).toEqual(["social.none"]);
  });

  it("behandelt eine fehlende Häufigkeit als Annahme und macht daraus keine Massnahme", () => {
    const fromSite = checkSocial(undefined, { linkedin: "https://linkedin.com/company/keller" });
    expect(fromSite.channels[0]).toMatchObject({ freq: null, freqScore: 0.3, freqAssumed: true });
    const given = checkSocial({ facebook: { url: "facebook.com/keller" } }, {});
    expect(given.channels[0]).toMatchObject({ freq: "monthly", freqAssumed: true });
    const cat: CheckCategory = { id: "social", title: "Social Media", weight: 20, score: given.score, items: [...fromSite.items, ...given.items] };
    expect(buildMassnahmen([cat]).some((m) => m.itemId.startsWith("social.freq."))).toBe(false);
  });

  it("macht aus einer angegebenen seltenen Häufigkeit eine Massnahme mit dem Kanalnamen", () => {
    const r = checkSocial({ tiktok: { url: "tiktok.com/@keller", freq: "rare" } }, {});
    const cat: CheckCategory = { id: "social", title: "Social Media", weight: 20, score: r.score, items: r.items };
    expect(buildMassnahmen([cat]).find((m) => m.itemId === "social.freq.tiktok")?.titel).toContain("TikTok");
  });
});

describe("checkGoogleBusiness", () => {
  const base = { company: "Malerei Keller", city: "Gossau", website: "https://keller.ch/" };
  const places = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("ohne Schlüssel: nicht bestätigt, Hinweis nur aus dem Maps-Link", async () => {
    expect(await checkGoogleBusiness(base, false)).toMatchObject({ verified: false, found: "unbekannt", score: 0.25 });
    expect(await checkGoogleBusiness(base, true)).toMatchObject({ verified: false, found: "wahrscheinlich", score: 0.5 });
  });

  it("bewertet einen gefundenen Eintrag", async () => {
    const r = await checkGoogleBusiness(base, false, {
      placesKey: "k",
      fetchImpl: places({
        places: [
          {
            displayName: { text: "Malerei Keller" },
            formattedAddress: "Gossau SG",
            rating: 4.8,
            userRatingCount: 52,
            websiteUri: "https://www.keller.ch",
            regularOpeningHours: {},
            photos: new Array(10).fill({}),
            googleMapsUri: "https://maps.google.com/?cid=1",
          },
        ],
      }),
    });
    expect(r.verified).toBe(true);
    expect(r.found).toBe(true);
    expect(r.items.every((i) => i.ok)).toBe(true);
    expect(r.score).toBeCloseTo(0.4 + 0.15 + 0.15 * (1.3 / 1.5) + 0.1 + 0.1 + 0.1, 10);
  });

  it("meldet einen fehlenden Eintrag als bestätigt nicht vorhanden", async () => {
    const r = await checkGoogleBusiness(base, false, { placesKey: "k", fetchImpl: places({ places: [] }) });
    expect(r).toMatchObject({ verified: true, found: false, score: 0 });
    const cat: CheckCategory = { id: "gbp", title: "GBP", weight: 20, score: 0, items: r.items, verified: true };
    expect(buildMassnahmen([cat])[0].titel).toContain("anlegen");
  });

  it("fällt bei Fehlern der Schnittstelle auf den Hinweis zurück", async () => {
    expect((await checkGoogleBusiness(base, false, { placesKey: "k", fetchImpl: places({}, false) })).verified).toBe(false);
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await checkGoogleBusiness(base, true, { placesKey: "k", fetchImpl: boom })).found).toBe("wahrscheinlich");
  });

  it("formuliert die Massnahme ohne Bestätigung als Prüfauftrag, nicht als Mangel", () => {
    const cat: CheckCategory = {
      id: "gbp",
      title: "GBP",
      weight: 20,
      score: 0.25,
      verified: false,
      items: [{ id: "gbp.profile", ok: false, label: "Google-Business-Profil", detail: "" }],
    };
    expect(buildMassnahmen([cat])[0].titel).toContain("Prüfen");
  });
});
