import { describe, expect, it } from "vitest";
import {
  A4,
  EMPTY_STATE,
  HINWEISE,
  KIND_KEYS,
  MAX_LABEL,
  MAX_TARGETS,
  SAMPLE_TARGETS,
  SHEET,
  TARGET_KINDS,
  ausgabeText,
  buildCodes,
  buildWaLink,
  defaultLabel,
  eingabeText,
  formProblem,
  initialTargets,
  labelAfterKindChange,
  layoutA4,
  normalizePhone,
  normalizeTarget,
  parseState,
  readWhatsappNumber,
  rowProblems,
  setFilename,
  svgFromModules,
  targetProblem,
  zipFilename,
  type Target,
} from "./logic";

const t = (kind: Target["kind"], input: string, label = defaultLabel(kind) || "Link"): Target => ({ kind, input, label });

describe("qr-set: Arten", () => {
  it("kennt sieben Arten mit Vorschlag für sechs davon", () => {
    expect(TARGET_KINDS.map((k) => k.key)).toEqual([...KIND_KEYS]);
    expect(defaultLabel("website")).toBe("Unsere Website");
    expect(defaultLabel("instagram")).toBe("Instagram");
    expect(defaultLabel("linkedin")).toBe("LinkedIn");
    expect(defaultLabel("whatsapp")).toBe("Schreib uns auf WhatsApp");
    expect(defaultLabel("google")).toBe("Bewerte uns auf Google");
    expect(defaultLabel("pdf")).toBe("Speisekarte");
    expect(defaultLabel("other")).toBe("");
  });

  it("lässt die Beschriftung beim Wechsel der Art dem Vorschlag folgen, nur solange sie nicht eigen ist", () => {
    expect(labelAfterKindChange("", "website", "instagram")).toBe("Instagram");
    expect(labelAfterKindChange("Unsere Website", "website", "google")).toBe("Bewerte uns auf Google");
    expect(labelAfterKindChange("Zur Preisliste", "website", "pdf")).toBe("Zur Preisliste");
  });
});

describe("qr-set: Website, PDF, anderer Link", () => {
  it("ergänzt https:// und zeigt die Adresse ohne Schema", () => {
    expect(normalizeTarget("website", "malerei-keller.ch")).toEqual({ url: "https://malerei-keller.ch/", display: "malerei-keller.ch" });
    expect(normalizeTarget("website", "www.malerei-keller.ch/kontakt/")).toEqual({ url: "https://www.malerei-keller.ch/kontakt/", display: "malerei-keller.ch/kontakt" });
    expect(normalizeTarget("pdf", "http://malerei-keller.ch/preisliste.pdf")?.url).toBe("http://malerei-keller.ch/preisliste.pdf");
    expect(normalizeTarget("other", "https://example.org/a?b=1")).toEqual({ url: "https://example.org/a?b=1", display: "example.org/a?b=1" });
  });

  it("lehnt Adressen ohne Host, mit anderem Schema oder mit Leerzeichen ab", () => {
    expect(normalizeTarget("website", "")).toBeNull();
    expect(normalizeTarget("website", "   ")).toBeNull();
    expect(normalizeTarget("website", "https://")).toBeNull();
    expect(normalizeTarget("website", "localhost")).toBeNull();
    expect(normalizeTarget("website", "ftp://malerei-keller.ch")).toBeNull();
    expect(normalizeTarget("website", "mailto:info@malerei-keller.ch")).toBeNull();
    expect(normalizeTarget("website", "javascript:alert(1)")).toBeNull();
    expect(normalizeTarget("website", "malerei keller.ch")).toBeNull();
    expect(normalizeTarget("other", "nur text")).toBeNull();
  });
});

describe("qr-set: Instagram", () => {
  it("macht aus einem Handle mit oder ohne @ die Profiladresse", () => {
    expect(normalizeTarget("instagram", "@malereikeller")).toEqual({ url: "https://www.instagram.com/malereikeller/", display: "instagram.com/malereikeller" });
    expect(normalizeTarget("instagram", "malerei.keller_1")?.url).toBe("https://www.instagram.com/malerei.keller_1/");
  });

  it("liest das Handle aus einer Profiladresse", () => {
    expect(normalizeTarget("instagram", "https://www.instagram.com/malereikeller/?hl=de")?.url).toBe("https://www.instagram.com/malereikeller/");
    expect(normalizeTarget("instagram", "instagram.com/malereikeller")?.display).toBe("instagram.com/malereikeller");
  });

  it("lehnt Handles mit Sonderzeichen, zu langen Namen oder fremder Domain ab", () => {
    expect(normalizeTarget("instagram", "@malerei keller")).toBeNull();
    expect(normalizeTarget("instagram", "maler/keller")).toBeNull();
    expect(normalizeTarget("instagram", "a".repeat(31))).toBeNull();
    expect(normalizeTarget("instagram", "@")).toBeNull();
    expect(normalizeTarget("instagram", "https://instagram.com.example.org/x")).toBeNull();
  });
});

describe("qr-set: LinkedIn", () => {
  it("nimmt nur linkedin.com-Adressen", () => {
    expect(normalizeTarget("linkedin", "linkedin.com/company/malerei-keller")?.url).toBe("https://linkedin.com/company/malerei-keller");
    expect(normalizeTarget("linkedin", "https://www.linkedin.com/in/peter-keller/")?.display).toBe("linkedin.com/in/peter-keller");
    expect(normalizeTarget("linkedin", "https://www.xing.com/profile/peter")).toBeNull();
    expect(normalizeTarget("linkedin", "https://linkedin.com.evil.org/x")).toBeNull();
    expect(normalizeTarget("linkedin", "peter-keller")).toBeNull();
  });
});

describe("qr-set: WhatsApp", () => {
  it("normalisiert Schweizer Nummern in sechs Schreibweisen auf dieselbe E.164", () => {
    const forms = ["079 123 45 67", "0791234567", "+41 79 123 45 67", "0041791234567", "079/123.45.67", "(079) 123-45-67"];
    for (const f of forms) expect(normalizePhone(f)?.e164, f).toBe("41791234567");
    expect(normalizePhone("079 123 45 67")?.display).toBe("+41 79 123 45 67");
  });

  it("lehnt zu kurze, zu lange, ausländische und unleserliche Nummern ab", () => {
    expect(normalizePhone("079 123 45")).toBeNull();
    expect(normalizePhone("079 123 45 678")).toBeNull();
    expect(normalizePhone("+49 171 1234567")).toBeNull();
    expect(normalizePhone("079 abc 45 67")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("+41 0 79 123 45 67")).toBeNull();
  });

  it("macht aus Nummer oder wa.me-Link den wa.me-Link mit lesbarer Nummer", () => {
    expect(normalizeTarget("whatsapp", "079 123 45 67")).toEqual({ url: "https://wa.me/41791234567", display: "+41 79 123 45 67" });
    expect(normalizeTarget("whatsapp", "https://wa.me/41791234567?text=Guten%20Tag")?.url).toBe("https://wa.me/41791234567?text=Guten%20Tag");
    expect(normalizeTarget("whatsapp", "wa.me/41791234567")?.url).toBe("https://wa.me/41791234567");
    expect(normalizeTarget("whatsapp", "https://api.whatsapp.com/send?phone=41791234567")?.url).toBe("https://wa.me/41791234567");
    expect(normalizeTarget("whatsapp", "https://wa.me/491711234567")).toBeNull();
    expect(buildWaLink("41791234567", "Grüezi\nFrage")).toBe("https://wa.me/41791234567?text=Gr%C3%BCezi%0AFrage");
  });
});

describe("qr-set: Google-Bewertung", () => {
  it("nimmt Google-Links und sonst nichts", () => {
    expect(normalizeTarget("google", "https://g.page/r/abc123/review")?.display).toBe("g.page/r/abc123/review");
    expect(normalizeTarget("google", "search.google.com/local/writereview?placeid=XYZ")?.url).toBe("https://search.google.com/local/writereview?placeid=XYZ");
    expect(normalizeTarget("google", "https://maps.app.goo.gl/abc")).not.toBeNull();
    expect(normalizeTarget("google", "https://www.google.ch/maps/place/x")).not.toBeNull();
    expect(normalizeTarget("google", "https://malerei-keller.ch/bewertung")).toBeNull();
    expect(normalizeTarget("google", "https://notgoogle.com/review")).toBeNull();
  });
});

describe("qr-set: Prüfung", () => {
  it("meldet fehlende Adresse, falsche Adresse, fehlende und zu lange Beschriftung", () => {
    expect(targetProblem(t("website", "", "Unsere Website"))).toBe("Gib eine Adresse an.");
    expect(targetProblem(t("website", "nur text", "Unsere Website"))).toMatch(/keine gültige Adresse/);
    expect(targetProblem(t("linkedin", "xing.com/x", "LinkedIn"))).toMatch(/LinkedIn-Adresse/);
    expect(targetProblem(t("whatsapp", "12", "WhatsApp"))).toMatch(/Schweizer Nummer/);
    expect(targetProblem(t("google", "malerei-keller.ch", "Google"))).toMatch(/kein Google-Link/);
    expect(targetProblem(t("website", "malerei-keller.ch", ""))).toBe("Gib eine Beschriftung an.");
    expect(targetProblem(t("website", "malerei-keller.ch", "   "))).toBe("Gib eine Beschriftung an.");
    expect(targetProblem(t("website", "malerei-keller.ch", "x".repeat(MAX_LABEL + 1)))).toMatch(/zu lang/);
    expect(targetProblem(t("website", "malerei-keller.ch", "x".repeat(MAX_LABEL)))).toBeNull();
    expect(targetProblem({ kind: "x" as Target["kind"], input: "a.ch", label: "a" })).toBe("Wähle eine Art.");
  });

  it("erkennt doppelte Ziele auch in anderer Schreibweise", () => {
    const ziele = [t("website", "malerei-keller.ch"), t("other", "https://Malerei-Keller.ch/", "Link"), t("instagram", "@keller")];
    expect(rowProblems(ziele)).toEqual([null, "Dieselbe Adresse wie Ziel 1.", null]);
    expect(formProblem(ziele)).toBe("Ziel 2: Dieselbe Adresse wie Ziel 1.");
  });

  it("verlangt mindestens ein und höchstens sechs Ziele", () => {
    expect(formProblem([])).toBe("Füge mindestens ein Ziel hinzu.");
    const seven = Array.from({ length: 7 }, (_, i) => t("other", `https://example.org/${i}`, `Link ${i}`));
    expect(formProblem(seven)).toBe(`Höchstens ${MAX_TARGETS} Ziele sind möglich.`);
    expect(formProblem(seven.slice(0, 6))).toBeNull();
    expect(formProblem(SAMPLE_TARGETS)).toBeNull();
  });
});

describe("qr-set: Codes", () => {
  it("baut aus dem Beispiel der Malerei Keller vier Codes mit Adresse und Anzeige", () => {
    const codes = buildCodes(SAMPLE_TARGETS);
    expect(codes.map((c) => [c.nr, c.label, c.url, c.display])).toEqual([
      [1, "Unsere Website", "https://malerei-keller.ch/", "malerei-keller.ch"],
      [2, "Bewerte uns auf Google", "https://g.page/r/malerei-keller/review", "g.page/r/malerei-keller/review"],
      [3, "Schreib uns auf WhatsApp", "https://wa.me/41791234567", "+41 79 123 45 67"],
      [4, "Instagram", "https://www.instagram.com/malereikeller/", "instagram.com/malereikeller"],
    ]);
    expect(codes[1].kindLabel).toBe("Google-Bewertung");
  });

  it("lässt ungültige und doppelte Zeilen weg und nummeriert neu", () => {
    const codes = buildCodes([t("website", "nur text"), t("website", "a.ch"), t("other", "https://a.ch/", "Link"), t("instagram", "@b")]);
    expect(codes.map((c) => c.nr)).toEqual([1, 2]);
    expect(codes.map((c) => c.url)).toEqual(["https://a.ch/", "https://www.instagram.com/b/"]);
  });
});

describe("qr-set: Druckbogen", () => {
  const inside = (c: { x: number; y: number; w: number; h: number }) => c.x >= 0 && c.y >= 0 && c.x + c.w <= A4.w && c.y + c.h <= A4.h;
  // Benachbarte Felder teilen sich eine Kante; eine Toleranz fängt Rundungsfehler der Gleitkommarechnung ab.
  const EPS = 1e-6;
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

  it("legt 1 bis 6 Codes im Raster 2 × 3 innerhalb von A4 ohne Überlappung", () => {
    for (let n = 1; n <= 6; n++) {
      const cells = layoutA4(n);
      expect(cells).toHaveLength(n);
      for (const c of cells) {
        expect(inside(c), `Feld ${c.nr} bei n=${n}`).toBe(true);
        const q = { x: c.qr.x, y: c.qr.y, w: c.qr.size, h: c.qr.size };
        expect(inside(q)).toBe(true);
        expect(q.x >= c.x && q.x + q.w <= c.x + c.w && q.y >= c.y && q.y + q.h <= c.y + c.h, "Code im Feld").toBe(true);
        expect(c.qr.size).toBeCloseTo(50 * (72 / 25.4), 5);
        expect(c.labelY).toBeLessThan(c.qr.y);
        expect(c.urlY).toBeLessThan(c.labelY);
        expect(c.urlY).toBeGreaterThan(c.y);
        expect(c.centerX).toBeCloseTo(c.x + c.w / 2, 5);
      }
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j]), `${i} und ${j}`).toBe(false);
    }
    expect(layoutA4(6).map((c) => c.nr)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ist auf der Seite zentriert, hält Kopf und Fuss frei und kappt unsinnige Zahlen", () => {
    const cells = layoutA4(6);
    const left = Math.min(...cells.map((c) => c.x));
    const right = Math.max(...cells.map((c) => c.x + c.w));
    expect(left).toBeCloseTo(A4.w - right, 5);
    expect(Math.max(...cells.map((c) => c.y + c.h))).toBeLessThanOrEqual(A4.h - SHEET.top);
    expect(Math.min(...cells.map((c) => c.y))).toBeGreaterThanOrEqual(SHEET.bottom);
    expect(cells[0].x).toBeLessThan(cells[1].x);
    expect(cells[0].y).toBeGreaterThan(cells[2].y);
    expect(layoutA4(0)).toEqual([]);
    expect(layoutA4(-3)).toEqual([]);
    expect(layoutA4(99)).toHaveLength(6);
    expect(layoutA4(Number.NaN)).toEqual([]);
  });
});

describe("qr-set: Dateien und SVG", () => {
  it("bildet saubere Dateinamen", () => {
    expect(zipFilename(1, "Unsere Website", "svg")).toBe("1-unsere-website.svg");
    expect(zipFilename(3, "Schreib uns auf WhatsApp", "png")).toBe("3-schreib-uns-auf-whatsapp.png");
    expect(zipFilename(2, "Bäckerei Müller & Söhne", "svg")).toBe("2-baeckerei-mueller-soehne.svg");
    expect(zipFilename(4, "///", "png")).toBe("4-qr-code.png");
    expect(setFilename("Malerei Keller, Gossau")).toBe("qr-set-malerei-keller-gossau");
    expect(setFilename("")).toBe("qr-set");
    expect(setFilename(undefined)).toBe("qr-set");
  });

  it("zeichnet Module als Pfad mit Ruhezone von vier Modulen", () => {
    const svg = svgFromModules([
      [true, true, false],
      [false, true, false],
      [false, false, true],
    ]);
    expect(svg).toContain('viewBox="0 0 11 11"');
    expect(svg).toContain('width="50mm"');
    expect(svg).toContain("M4 4h2v1h-2z");
    expect(svg).toContain("M5 5h1v1h-1z");
    expect(svg).toContain("M6 6h1v1h-1z");
    expect(svg).toContain('fill="#000000"');
    expect(svgFromModules([], 30, 0)).toContain('viewBox="0 0 0 0"');
  });
});

describe("qr-set: Texte fürs CRM", () => {
  it("nennt in der Eingabe Firma und je Ziel Art, Adresse und Beschriftung", () => {
    const text = eingabeText(SAMPLE_TARGETS, "Malerei Keller");
    expect(text.split("\n")[0]).toBe("Firma: Malerei Keller");
    expect(text).toContain("Ziel 1: Website, malerei-keller.ch, Beschriftung «Unsere Website»");
    expect(text).toContain("Ziel 3: WhatsApp, 079 123 45 67, Beschriftung «Schreib uns auf WhatsApp»");
    expect(eingabeText(SAMPLE_TARGETS)).not.toMatch(/^Firma/);
    expect(eingabeText([])).toBe("");
  });

  it("listet in der Ausgabe jede Adresse und nennt Druckbogen und ZIP", () => {
    const text = ausgabeText(buildCodes(SAMPLE_TARGETS));
    expect(text.split("\n")[0]).toBe("4 QR-Codes");
    expect(text).toContain("1. Unsere Website: https://malerei-keller.ch/");
    expect(text).toContain("3. Schreib uns auf WhatsApp: https://wa.me/41791234567");
    expect(text.trimEnd().endsWith("Druckbogen und ZIP erzeugt")).toBe(true);
    expect(ausgabeText(buildCodes([t("website", "a.ch")]))).toMatch(/^1 QR-Code\n/);
    expect(text).not.toContain("{");
  });

  it("hält die Hinweise als Richtwert und nennt die Norm", () => {
    expect(HINWEISE.join(" ")).toMatch(/Richtwert von Alperna, keine Statistik/);
    expect(HINWEISE.join(" ")).toContain("ISO/IEC 18004");
    expect(HINWEISE.join(" ")).not.toMatch(/!|—/);
  });
});

describe("qr-set: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const bad of [null, undefined, "x", 1, [], {}, { v: 2, ziele: [] }, { v: 1 }, { v: 1, ziele: "nein" }]) {
      expect(parseState(bad), JSON.stringify(bad)).toEqual(EMPTY_STATE);
    }
  });

  it("lässt kaputte Zeilen weg, kürzt Texte und kappt auf sechs Ziele", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      ziele: [t("website", "a.ch"), null, { kind: "x", input: "a" }, { kind: "pdf", input: 7 }, { kind: "other", input: "b".repeat(600), label: "c".repeat(60) }],
    });
    expect(s.ziele).toHaveLength(2);
    expect(s.ziele[1].input).toHaveLength(500);
    expect(s.ziele[1].label).toHaveLength(MAX_LABEL);
    const many = parseState({ v: 1, phase: "edit", ziele: Array.from({ length: 9 }, (_, i) => t("other", `https://a.ch/${i}`, "L")) });
    expect(many.ziele).toHaveLength(6);
  });

  it("hält «result» nur, wenn alle Ziele gültig sind", () => {
    expect(parseState({ v: 1, phase: "result", ziele: SAMPLE_TARGETS }).phase).toBe("result");
    expect(parseState({ v: 1, phase: "result", ziele: [t("website", "nur text")] }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result", ziele: [] }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "sonst", ziele: SAMPLE_TARGETS }).phase).toBe("edit");
  });

  it("liest die Nummer aus dem Stand des WhatsApp-Werkzeugs und schlägt Ziele vor", () => {
    expect(readWhatsappNumber({ v: 1, phase: "result", nummer: "079 123 45 67", text: "" })).toBe("079 123 45 67");
    expect(readWhatsappNumber({ v: 1, phase: "edit", nummer: "12", text: "" })).toBeNull();
    expect(readWhatsappNumber(null)).toBeNull();
    expect(readWhatsappNumber("x")).toBeNull();
    expect(initialTargets("malerei-keller.ch", "079 123 45 67")).toEqual([
      { kind: "website", input: "malerei-keller.ch", label: "Unsere Website" },
      { kind: "whatsapp", input: "079 123 45 67", label: "Schreib uns auf WhatsApp" },
    ]);
    expect(initialTargets(undefined, null)).toEqual([{ kind: "website", input: "", label: "Unsere Website" }]);
    expect(initialTargets("  ", null)[0].input).toBe("");
  });
});
