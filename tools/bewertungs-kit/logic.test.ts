import { describe, expect, it } from "vitest";
import {
  DEFAULT_FARBE,
  DRUCK,
  EMPTY_STATE,
  FARBE_FORM_MELDUNG,
  FARBE_HELL_MELDUNG,
  LEER_MELDUNG,
  LINK_MELDUNG,
  PAGES,
  SMS_KURZ,
  SMS_MAX,
  TEMPLATES,
  anredeFromProfile,
  ausgabeText,
  buildTexts,
  contrast,
  eingabeText,
  farbProblem,
  fillTemplate,
  formProblem,
  isGoogleReviewLink,
  isTooLight,
  linkProblem,
  luminance,
  mm,
  normalizeHex,
  parseHex,
  parseState,
  placeIdProblem,
  placeIdUrl,
  resolveUrl,
  reviewUrl,
  standLayout,
  stickerLayout,
  type Box,
} from "./logic";

const PLACE_ID = "ChIJgUbEo8cfqokR5lP9_Wh_DaM";
const G_PAGE = "https://g.page/r/CaBcDeFgHiJkLmNo/review";
const WRITE = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;

const inside = (b: Box, page: { w: number; h: number }) => b.x >= 0 && b.y >= 0 && b.x + b.w <= page.w && b.y + b.h <= page.h;
const within = (inner: Box, outer: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe("bewertungs-kit: linkProblem", () => {
  it("akzeptiert die Google-Hosts mit https", () => {
    for (const url of [
      G_PAGE,
      WRITE,
      "https://maps.google.com/?cid=12345678901234567890",
      "https://www.google.com/maps/place/Malerei+Keller/@47.4,9.2,17z",
      "https://google.com/maps/place/x",
      "https://goo.gl/maps/AbCdEf",
      "https://maps.app.goo.gl/AbCdEf",
    ]) {
      expect(linkProblem(url), url).toBeNull();
      expect(isGoogleReviewLink(` ${url} `)).toBe(true);
    }
  });

  it("lehnt http statt https ab", () => {
    expect(linkProblem("http://g.page/r/CaBcDeFgHiJkLmNo/review")).toBe(LINK_MELDUNG);
  });

  it("lehnt fremde Hosts und google.com ohne /maps ab", () => {
    expect(linkProblem("https://www.yelp.ch/biz/malerei-keller")).toBe(LINK_MELDUNG);
    expect(linkProblem("https://g.page.evil.ch/r/abc/review")).toBe(LINK_MELDUNG);
    expect(linkProblem("https://www.google.com/search?q=malerei+keller")).toBe(LINK_MELDUNG);
    expect(linkProblem("https://goo.gl/abc")).toBe(LINK_MELDUNG);
    expect(linkProblem("kein link")).toBe(LINK_MELDUNG);
  });

  it("meldet eine leere Eingabe", () => {
    expect(linkProblem("   ")).toBe(LEER_MELDUNG);
  });
});

describe("bewertungs-kit: Place-ID", () => {
  it("akzeptiert eine gültige Place-ID und baut den Link", () => {
    expect(placeIdProblem(PLACE_ID)).toBeNull();
    expect(placeIdUrl(` ${PLACE_ID} `)).toBe(WRITE);
    expect(reviewUrl(PLACE_ID)).toBe(WRITE);
  });

  it("lehnt leere, zu kurze, zu lange und Place-IDs mit Leerzeichen ab", () => {
    expect(placeIdProblem("")).toMatch(/Place-ID/);
    expect(placeIdProblem("ChIJ12345")).toMatch(/10 bis 300/);
    expect(placeIdProblem("x".repeat(301))).toMatch(/10 bis 300/);
    expect(placeIdProblem("x".repeat(300))).toBeNull();
    expect(placeIdProblem("ChIJ gUbEo8cfqokR")).toMatch(/Leerzeichen/);
  });

  it("reviewUrl nimmt Links nur von Google und sonst nur Place-IDs", () => {
    expect(reviewUrl(G_PAGE)).toBe(G_PAGE);
    expect(reviewUrl("https://evil.ch/x")).toBeNull();
    expect(reviewUrl("evil.ch")).toBeNull();
    expect(reviewUrl("")).toBeNull();
  });

  it("resolveUrl gibt dem Link den Vorrang vor der Place-ID", () => {
    expect(resolveUrl({ link: G_PAGE, placeId: PLACE_ID })).toBe(G_PAGE);
    expect(resolveUrl({ link: "", placeId: PLACE_ID })).toBe(WRITE);
    expect(resolveUrl({ link: "https://evil.ch", placeId: PLACE_ID })).toBeNull();
    expect(resolveUrl({ link: "", placeId: "" })).toBeNull();
  });
});

describe("bewertungs-kit: Farbe", () => {
  it("rechnet Helligkeit und Kontrast nach WCAG", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrast("#fff", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(parseHex("#ABC")).toEqual([170, 187, 204]);
    expect(parseHex("0F0F0E")).toEqual([15, 15, 14]);
  });

  it("erkennt zu helle Farben auf Papier", () => {
    expect(isTooLight("#FFD700")).toBe(true);
    expect(isTooLight("#999999")).toBe(true);
    expect(farbProblem("#FFD700")).toBe(FARBE_HELL_MELDUNG);
  });

  it("lässt dunkle Farben durch", () => {
    expect(isTooLight(DEFAULT_FARBE)).toBe(false);
    expect(isTooLight("#111A28")).toBe(false);
    expect(isTooLight("#808080")).toBe(false);
    expect(farbProblem("#26324A")).toBeNull();
  });

  it("meldet ungültige Hex-Werte", () => {
    expect(parseHex("rot")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(luminance("rot")).toBeNull();
    expect(isTooLight("rot")).toBe(false);
    expect(farbProblem("rot")).toBe(FARBE_FORM_MELDUNG);
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("rot")).toBe(DEFAULT_FARBE);
  });
});

describe("bewertungs-kit: Vorlagen", () => {
  const firma = "Malerei Keller";

  it("setzt Firma und Link in jede Vorlage ein, mit Platzhaltern [Name] und [Auftrag]", () => {
    for (const anrede of ["du", "sie"] as const) {
      const t = buildTexts(anrede, firma, G_PAGE);
      for (const text of [t.sms, t.whatsapp, t.email]) {
        expect(text).toContain(G_PAGE);
        expect(text).toContain(firma);
        expect(text).toContain("[Name]");
        expect(text).not.toContain("{firma}");
        expect(text).not.toContain("{link}");
        expect(text).not.toMatch(/fünf Sterne|Rabatt|Gutschein|Geschenk/i);
        expect(text).not.toContain("!");
      }
      expect(t.whatsapp).toContain("[Auftrag]");
      expect(t.email.startsWith("Betreff: ")).toBe(true);
      expect(t.email.split("\n\n").length).toBeGreaterThanOrEqual(4);
    }
  });

  it("unterscheidet Du und Sie", () => {
    const du = buildTexts("du", firma, G_PAGE);
    const sie = buildTexts("sie", firma, G_PAGE);
    expect(du.whatsapp).toMatch(/\bdu\b/);
    expect(du.whatsapp).not.toMatch(/\bSie\b/);
    expect(sie.whatsapp).toMatch(/\bSie\b/);
    expect(sie.whatsapp).not.toMatch(/\bdu\b/);
    expect(sie.email).toContain("Ihren Auftrag");
  });

  it("hält die SMS unter 160 Zeichen, auch mit dem langen Place-ID-Link", () => {
    expect(buildTexts("du", firma, G_PAGE).sms.length).toBeLessThanOrEqual(SMS_MAX);
    expect(buildTexts("sie", firma, G_PAGE).sms.length).toBeLessThanOrEqual(SMS_MAX);
    const lang = buildTexts("sie", "Keller Malerei und Gipserei GmbH, Gossau SG", WRITE);
    expect(lang.sms.length).toBeLessThanOrEqual(SMS_MAX);
    expect(lang.sms).toBe(fillTemplate(SMS_KURZ.sie, { firma: "", link: WRITE }));
    expect(lang.sms).toContain(WRITE);
  });

  it("fillTemplate lässt den Link in Ruhe und bringt den Text in Schweizer Schreibweise", () => {
    const link = "https://search.google.com/local/writereview?placeid=ab1%2Fcd";
    expect(fillTemplate('Danke "sehr" {firma}: {link}', { firma: " Keller ", link })).toBe(`Danke «sehr» Keller: ${link}`);
    expect(TEMPLATES.du.sms).not.toContain("«");
  });
});

describe("bewertungs-kit: Anrede aus dem Profil", () => {
  it("liest das Feld anrede oder erkennt Sie/Du im Text", () => {
    expect(anredeFromProfile({ marke: { tonalitaet: { anrede: "sie" } } })).toBe("sie");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Wir schreiben per Du, kurz und direkt." } } })).toBe("du");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Kurze Sätze. Wir sagen Ihnen, wann wir kommen." } } })).toBe("sie");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Du bekommst eine klare Antwort." } } })).toBe("du");
  });

  it("bleibt leer ohne Hinweis", () => {
    expect(anredeFromProfile({})).toBe("");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Sie kommen pünktlich." } } })).toBe("");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Kurz und freundlich." } } })).toBe("");
    expect(anredeFromProfile(null)).toBe("");
  });
});

describe("bewertungs-kit: formProblem", () => {
  const ok = { link: G_PAGE, placeId: "", anrede: "du" as const, farbe: "#0F0F0E" };

  it("prüft in der Reihenfolge Firma, Link, Anrede, Farbe", () => {
    expect(formProblem(ok, { firma: "" })).toMatch(/Betrieb/);
    expect(formProblem({ ...ok, link: "", placeId: "" }, { firma: "Keller" })).toBe(LEER_MELDUNG);
    expect(formProblem({ ...ok, link: "https://evil.ch" }, { firma: "Keller" })).toBe(LINK_MELDUNG);
    expect(formProblem({ ...ok, link: "", placeId: "kurz" }, { firma: "Keller" })).toMatch(/10 bis 300/);
    expect(formProblem({ ...ok, anrede: "" }, { firma: "Keller" })).toMatch(/Anrede/);
    expect(formProblem({ ...ok, farbe: "#FFD700" }, { firma: "Keller" })).toBe(FARBE_HELL_MELDUNG);
    expect(formProblem(ok, { firma: "Keller" })).toBeNull();
    expect(formProblem({ ...ok, link: "", placeId: PLACE_ID }, { firma: "Keller" })).toBeNull();
  });
});

describe("bewertungs-kit: Druckmasse", () => {
  it("rechnet Millimeter in Punkt", () => {
    expect(mm(25.4)).toBeCloseTo(72, 6);
    expect(PAGES.a6.w).toBeCloseTo(297.64, 1);
    expect(PAGES.a5.h).toBeCloseTo(595.28, 1);
    expect(PAGES.a4.w).toBeCloseTo(595.28, 1);
  });

  it("legt Rahmen und QR-Code der Aufsteller innerhalb der Seite", () => {
    for (const size of ["a6", "a5"] as const) {
      const l = standLayout(size);
      expect(inside(l.frame, l.page)).toBe(true);
      expect(within(l.qr, l.frame)).toBe(true);
      expect(within(l.qr2, l.frame)).toBe(true);
      expect(l.qr.w).toBe(l.qr.h);
      expect(l.qr.x + l.qr.w / 2).toBeCloseTo(l.page.w / 2, 6);
      // Titel und Satz liegen über dem QR-Code, die Fusszeile unter ihm
      expect(l.page.h - l.textTop - l.text).toBeGreaterThan(l.qr.y + l.qr.h);
      expect(l.page.h - l.footTop).toBeLessThan(l.qr.y);
      expect(l.page.h - l.footTop).toBeGreaterThan(l.frame.y);
    }
    expect(standLayout("a5").qr.w).toBeGreaterThan(standLayout("a6").qr.w);
  });

  it("verteilt 8 Aufkleber 50 × 50 mm ohne Überlappung auf A4", () => {
    const s = stickerLayout();
    expect(s.cells).toHaveLength(8);
    expect(s.cell).toBeCloseTo(mm(50), 6);
    for (const c of s.cells) {
      expect(inside(c, s.page)).toBe(true);
      expect(c.w).toBeCloseTo(mm(50), 6);
      expect(c.h).toBeCloseTo(mm(50), 6);
      expect(s.qr + 2 * s.pad).toBeLessThan(c.h);
    }
    for (let i = 0; i < s.cells.length; i++) {
      for (let j = i + 1; j < s.cells.length; j++) {
        const a = s.cells[i];
        const b = s.cells[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `Zellen ${i} und ${j}`).toBe(false);
      }
    }
    // zentriert
    const minX = Math.min(...s.cells.map((c) => c.x));
    const maxX = Math.max(...s.cells.map((c) => c.x + c.w));
    expect(minX).toBeCloseTo(s.page.w - maxX, 6);
  });
});

describe("bewertungs-kit: Stand und CRM", () => {
  it("parseState liefert bei kaputten Daten den leeren Stand", () => {
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState("x")).toEqual(EMPTY_STATE);
    expect(parseState([1])).toEqual(EMPTY_STATE);
    expect(parseState({ v: 2, phase: "result" })).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1, phase: "result", link: 5, anrede: "ihr", farbe: "rot" })).toEqual(EMPTY_STATE);
  });

  it("parseState behält ein vollständiges Ergebnis und stuft ein unvollständiges auf «edit» zurück", () => {
    const full = { v: 1, phase: "result", link: G_PAGE, placeId: "", anrede: "sie", farbe: "#26324a" };
    expect(parseState(full)).toEqual({ ...full, farbe: "#26324A" });
    expect(parseState({ ...full, link: "", placeId: PLACE_ID })).toMatchObject({ phase: "result", placeId: PLACE_ID });
    expect(parseState({ ...full, anrede: "" })).toMatchObject({ phase: "edit", link: G_PAGE });
    expect(parseState({ ...full, farbe: "#FFD700" })).toMatchObject({ phase: "edit", farbe: "#FFD700" });
    expect(parseState({ ...full, link: "https://evil.ch" })).toMatchObject({ phase: "edit" });
    expect(parseState({ v: 1, phase: "edit", link: G_PAGE, placeId: "", anrede: "du", farbe: "#0F0F0E" }).phase).toBe("edit");
  });

  it("eingabeText nennt Firma, Link oder Place-ID, Anrede und Farbe je Zeile", () => {
    expect(eingabeText({ link: G_PAGE, placeId: "", anrede: "du", farbe: "#0f0f0e" }, "Malerei Keller")).toBe(
      `Firma: Malerei Keller\nBewertungslink: ${G_PAGE}\nAnrede: Du\nAkzentfarbe: #0F0F0E`,
    );
    expect(eingabeText({ link: "", placeId: PLACE_ID, anrede: "", farbe: "#26324A" }, "")).toBe(
      `Firma: keine Angabe\nPlace-ID: ${PLACE_ID}\nAnrede: keine Angabe\nAkzentfarbe: #26324A`,
    );
  });

  it("ausgabeText beginnt mit dem Link und enthält die drei Vorlagen", () => {
    const t = buildTexts("sie", "Malerei Keller", G_PAGE);
    const out = ausgabeText(G_PAGE, "sie", t);
    expect(out.startsWith(`Bewertungslink: ${G_PAGE}\n\nErzeugt: Aufsteller A6`)).toBe(true);
    expect(out).toContain(`## SMS (Sie)\n${t.sms}`);
    expect(out).toContain(`## WhatsApp (Sie)\n${t.whatsapp}`);
    expect(out).toContain(`## E-Mail (Sie)\n${t.email}`);
  });
});

describe("bewertungs-kit: Beispiel aus dem Seitentext", () => {
  it("ist die WhatsApp-Vorlage in der Du-Fassung für Malerei Keller", () => {
    const text = buildTexts("du", "Malerei Keller", "https://g.page/r/…/review").whatsapp;
    expect(text).toBe(
      [
        "Hallo [Name]",
        "Danke für deinen Auftrag ([Auftrag]). Wir hoffen, du bist zufrieden.",
        "Magst du uns auf Google bewerten? Das dauert eine Minute und hilft anderen aus der Region bei der Wahl: https://g.page/r/…/review",
        "Eine ehrliche Bewertung reicht uns.",
        "Grüsse, Malerei Keller",
      ].join("\n"),
    );
    expect(DRUCK.satz("Malerei Keller", "du")).toBe("Bewerte Malerei Keller auf Google");
    expect(DRUCK.aufkleber("du")).toBe("Bewerte uns auf Google");
    expect(DRUCK.aufkleber("sie")).toBe("Bewerten Sie uns auf Google");
    expect(DRUCK.danke("sie")).toBe("Danke für Ihre Bewertung");
  });
});
