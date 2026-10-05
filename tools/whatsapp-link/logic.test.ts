import { describe, expect, it } from "vitest";
import {
  A4,
  A7,
  EMPTY_STATE,
  MAX_TEXT,
  PHONE_ERROR_CH,
  PHONE_ERROR_LENGTH,
  PT_PER_MM,
  TEMPLATE_KEYS,
  TEMPLATES,
  ausgabeText,
  buildWaLink,
  buttonSnippet,
  cellContent,
  cleanText,
  contains,
  eingabeText,
  escapeHtml,
  isUntouched,
  messageFor,
  normalizePhone,
  overlaps,
  parseState,
  phoneProblem,
  qrFilename,
  stickerFilename,
  stickerLayout,
} from "./logic";

const E164 = "41791234567";

describe("whatsapp-link: normalizePhone", () => {
  it("bringt sechs Schreibweisen auf dieselbe E.164", () => {
    const forms = ["079 123 45 67", "0791234567", "+41 79 123 45 67", "0041791234567", "079/123.45.67", "+41 (0)79-123-45-67"];
    for (const f of forms) expect(normalizePhone(f)?.e164, f).toBe(E164);
  });

  it("nimmt auch 41791234567 ohne Plus und 0041 mit Leerzeichen", () => {
    expect(normalizePhone("41791234567")?.e164).toBe(E164);
    expect(normalizePhone("00 41 79 123 45 67")?.e164).toBe(E164);
  });

  it("liefert beide Anzeigeformate", () => {
    const p = normalizePhone("+41791234567");
    expect(p?.display).toBe("079 123 45 67");
    expect(p?.displayInternational).toBe("+41 79 123 45 67");
    expect(normalizePhone("071 222 33 44")?.display).toBe("071 222 33 44");
  });

  it("lehnt zu kurze, zu lange, fremde, leere Nummern und Buchstaben ab", () => {
    for (const bad of ["079 123 45 6", "079 123 45 678", "+49 170 1234567", "0049 170 1234567", "", "   ", "abc", "079 ABC 45 67", "+41 079 123 45 67 1"]) {
      expect(normalizePhone(bad), bad).toBeNull();
    }
  });

  it("lehnt eine Null als erste Ziffer nach der Vorwahl ab", () => {
    expect(normalizePhone("+41 09 123 45 67")).toBeNull();
    expect(normalizePhone("0091234567")).toBeNull();
  });
});

describe("whatsapp-link: phoneProblem", () => {
  it("meldet nichts bei gültigen Nummern", () => {
    expect(phoneProblem("079 123 45 67")).toBeNull();
    expect(phoneProblem("+41 79 123 45 67")).toBeNull();
  });

  it("unterscheidet «keine Schweizer Nummer» und «falsche Stellenzahl»", () => {
    expect(phoneProblem("")).toBe(PHONE_ERROR_CH);
    expect(phoneProblem("Hallo")).toBe(PHONE_ERROR_CH);
    expect(phoneProblem("+49 170 1234567")).toBe(PHONE_ERROR_CH);
    expect(phoneProblem("079 123 45 6")).toBe(PHONE_ERROR_LENGTH);
    expect(phoneProblem("079 123 45 678")).toBe(PHONE_ERROR_LENGTH);
    expect(phoneProblem("+41 79 123 45")).toBe(PHONE_ERROR_LENGTH);
  });
});

describe("whatsapp-link: Vorlagen", () => {
  it("füllt die Firma ein", () => {
    expect(messageFor("anfrage", "Malerei Keller")).toBe("Guten Tag Malerei Keller, ich habe eine Frage zu …");
    expect(messageFor("rueckruf", "  FC Trogen  ")).toBe("Guten Tag FC Trogen, bitte ruft mich zurück. Ich bin erreichbar: …");
  });

  it("kommt ohne Firma aus und lässt «Eigener Text» leer", () => {
    expect(messageFor("anfrage")).toBe("Guten Tag, ich habe eine Frage zu …");
    expect(messageFor("offerte", "")).toBe("Guten Tag, ich hätte gern eine Offerte für …");
    expect(messageFor("eigener", "Malerei Keller")).toBe("");
  });

  it("hat fünf Vorlagen mit Label, alle unter der Höchstlänge", () => {
    expect(TEMPLATE_KEYS).toHaveLength(5);
    for (const k of TEMPLATE_KEYS) {
      expect(TEMPLATES[k].label.length).toBeGreaterThan(0);
      expect(messageFor(k, "Malerei Keller").length).toBeLessThanOrEqual(MAX_TEXT);
    }
  });
});

describe("whatsapp-link: buildWaLink", () => {
  it("baut den Link ohne Text", () => {
    expect(buildWaLink(E164)).toBe("https://wa.me/41791234567");
    expect(buildWaLink(E164, "   ")).toBe("https://wa.me/41791234567");
  });

  it("hängt den Text codiert an", () => {
    expect(buildWaLink(E164, "Guten Tag Malerei Keller, ich habe eine Frage zu …")).toBe(
      "https://wa.me/41791234567?text=Guten%20Tag%20Malerei%20Keller%2C%20ich%20habe%20eine%20Frage%20zu%20%E2%80%A6",
    );
  });

  it("codiert Umlaute und behält Zeilenumbrüche als %0A", () => {
    const link = buildWaLink(E164, "Grüezi\r\nZeile zwei & «drei»?");
    expect(link).toBe("https://wa.me/41791234567?text=Gr%C3%BCezi%0AZeile%20zwei%20%26%20%C2%ABdrei%C2%BB%3F");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Grüezi\nZeile zwei & «drei»?");
  });

  it("kürzt auf die Höchstlänge", () => {
    expect(cleanText("x".repeat(MAX_TEXT + 50))).toHaveLength(MAX_TEXT);
  });
});

describe("whatsapp-link: buttonSnippet", () => {
  it("baut einen Link ohne Skript mit Inline-Stil", () => {
    const s = buttonSnippet("https://wa.me/41791234567");
    expect(s).toBe(
      '<a href="https://wa.me/41791234567" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0F0F0E;color:#FFFDF8;font:500 16px/1.2 system-ui,sans-serif;text-decoration:none">Schreib uns auf WhatsApp</a>',
    );
    expect(s).not.toMatch(/<script|onclick/i);
  });

  it("escapt & und Anführungszeichen in href und Beschriftung", () => {
    const s = buttonSnippet('https://wa.me/41791234567?text=a&b="c"', 'Schreib "uns" & Co');
    expect(s).toContain('href="https://wa.me/41791234567?text=a&amp;b=&quot;c&quot;"');
    expect(s).toContain(">Schreib &quot;uns&quot; &amp; Co</a>");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });
});

describe("whatsapp-link: Aufkleber-Bogen", () => {
  const page = { x: 0, y: 0, w: A4.w, h: A4.h };

  it("legt vier A7-Felder innerhalb von A4 an, ohne Überlappung", () => {
    const { cells, marks } = stickerLayout();
    expect(cells).toHaveLength(4);
    for (const c of cells) {
      expect(contains(page, c)).toBe(true);
      expect(c.w).toBeCloseTo(74 * PT_PER_MM, 3);
      expect(c.h).toBeCloseTo(105 * PT_PER_MM, 3);
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(overlaps(cells[i], cells[j])).toBe(false);
    expect(A7.w * 2).toBeLessThan(A4.w);
    expect(A7.h * 2).toBeLessThan(A4.h);
    expect(marks.length).toBe(12);
    for (const m of marks) {
      for (const v of [m.x1, m.x2]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [m.y1, m.y2]) expect(v).toBeGreaterThanOrEqual(0);
      expect(Math.max(m.x1, m.x2)).toBeLessThanOrEqual(A4.w);
      expect(Math.max(m.y1, m.y2)).toBeLessThanOrEqual(A4.h);
    }
  });

  it("setzt QR-Code und Textzeilen innerhalb jedes Feldes, QR über 2 cm", () => {
    for (const cell of stickerLayout().cells) {
      const c = cellContent(cell);
      expect(contains(cell, c.qr)).toBe(true);
      expect(c.qr.w / PT_PER_MM).toBeGreaterThanOrEqual(20);
      for (const line of [c.firma, c.satz, c.nummer, c.nummerIntl, c.fuss]) {
        expect(line.y).toBeGreaterThan(cell.y);
        expect(line.y + line.size).toBeLessThan(cell.y + cell.h);
      }
      expect(c.satz.y - c.satz.size - 3).toBeGreaterThan(c.qr.y + c.qr.h);
      expect(c.nummer.y + c.nummer.size).toBeLessThan(c.qr.y);
    }
  });

  it("erkennt Überlappung und Enthaltensein richtig", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: 1, w: 10, h: 5 })).toBe(false);
  });
});

describe("whatsapp-link: Dateinamen", () => {
  it("nennt die Firma, wenn es eine gibt", () => {
    expect(stickerFilename("Malerei Keller, Gossau")).toBe("whatsapp-aufkleber-malerei-keller-gossau.pdf");
    expect(stickerFilename("")).toBe("whatsapp-aufkleber.pdf");
    expect(qrFilename(undefined, "png")).toBe("whatsapp-qr.png");
    expect(qrFilename("Café Zürich", "svg")).toBe("whatsapp-qr-cafe-zuerich.svg");
  });
});

describe("whatsapp-link: CRM-Texte", () => {
  it("nennt die Angaben je Zeile, die Nummer so wie eingegeben", () => {
    const t = eingabeText({ nummer: "079 123 45 67", vorlage: "termin", text: "Guten Tag,\nich möchte einen Termin." });
    expect(t.split("\n")).toEqual(["WhatsApp-Nummer: 079 123 45 67", "Vorlage: Terminwunsch", "Nachricht: Guten Tag, / ich möchte einen Termin."]);
    expect(eingabeText({ nummer: "", vorlage: "eigener", text: "" })).toContain("Nachricht: keine");
  });

  it("gibt Link, Nummer, Nachricht und den Hinweis auf QR und Aufkleber aus", () => {
    const phone = normalizePhone("079 123 45 67")!;
    const t = ausgabeText({ phone, text: "Guten Tag Malerei Keller, ich habe eine Frage zu …", firma: "Malerei Keller" });
    expect(t.startsWith("Link: https://wa.me/41791234567?text=Guten%20Tag")).toBe(true);
    expect(t).toContain("Nummer: +41 79 123 45 67");
    expect(t).toContain("Firma: Malerei Keller");
    expect(t).toContain("Nachricht: Guten Tag Malerei Keller, ich habe eine Frage zu …");
    expect(t.endsWith("QR und Aufkleber erzeugt")).toBe(true);
    expect(ausgabeText({ phone, text: "" })).not.toContain("Firma:");
  });
});

describe("whatsapp-link: parseState", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { v: 2 }, { v: 1, phase: 7 }]) expect(parseState(bad)).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1, phase: "result", nummer: 12, vorlage: "zzz", text: { a: 1 } })).toEqual(EMPTY_STATE);
  });

  it("nimmt einen gültigen Stand und kürzt lange Texte", () => {
    const s = parseState({ v: 1, phase: "result", nummer: "079 123 45 67", vorlage: "offerte", text: "x".repeat(MAX_TEXT + 10) });
    expect(s.phase).toBe("result");
    expect(s.vorlage).toBe("offerte");
    expect(s.text).toHaveLength(MAX_TEXT);
  });

  it("fällt auf «edit» zurück, wenn «result» ohne gültige Nummer gespeichert ist", () => {
    expect(parseState({ v: 1, phase: "result", nummer: "+49 170", vorlage: "anfrage", text: "" }).phase).toBe("edit");
    expect(isUntouched(EMPTY_STATE)).toBe(true);
    expect(isUntouched({ ...EMPTY_STATE, text: "Hallo" })).toBe(false);
  });
});
