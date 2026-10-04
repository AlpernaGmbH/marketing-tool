import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  FAIL_MESSAGES,
  MAX_INPUT_CHARS,
  MIN_INPUT_CHARS,
  SAMPLE_TEXT,
  buildSystemPrompt,
  buildUserPrompt,
  checkOutput,
  inputProblem,
  parseTextResponse,
  parseUmschreiberState,
} from "./logic";
import { ANREDEN, STYLES, STYLE_IDS, getStyle } from "./styles";

const TEXT = "Malerei Keller in Gossau streicht Wände und Fassaden. Termine gibt es ab Montag, 3 Zimmer schaffen wir in einem Tag.";
const style = getStyle("linkedin")!;

describe("text-umschreiber: Stilliste", () => {
  it("jeder Stil ist vollständig und vernünftig begrenzt", () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(6);
    for (const s of STYLES) {
      expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.label.trim().length).toBeGreaterThan(2);
      expect(s.hint.trim().length).toBeGreaterThan(10);
      expect(s.instruction.trim().length).toBeGreaterThan(60);
      expect(s.maxOutputChars).toBeGreaterThan(500);
      expect(s.maxOutputChars).toBeLessThanOrEqual(4000);
      expect(s.maxTokens).toBeGreaterThan(200);
      expect(s.maxTokens).toBeLessThanOrEqual(2000);
      expect(getStyle(s.id)).toBe(s);
    }
  });

  it("die Kennungen sind eindeutig und die Prüfliste der Route folgt der Liste", () => {
    expect(new Set(STYLE_IDS).size).toBe(STYLES.length);
    expect(STYLE_IDS).toEqual(STYLES.map((s) => s.id));
    expect(getStyle("gibt-es-nicht")).toBeUndefined();
  });

  it("kein Stil schreibt Zahlen oder Fakten vor, die erfunden werden könnten", () => {
    for (const s of STYLES) expect(s.instruction).not.toMatch(/\bCHF\s?\d|\d{4}/);
  });
});

describe("text-umschreiber: Eingabe", () => {
  it("lehnt leere, zu kurze und zu lange Texte und unbekannte Stile ab", () => {
    expect(inputProblem("", "linkedin")).toMatch(/Füge zuerst einen Text ein/);
    expect(inputProblem("   ", "linkedin")).toMatch(/Füge zuerst einen Text ein/);
    expect(inputProblem("Zu kurz.", "linkedin")).toContain(String(MIN_INPUT_CHARS));
    expect(inputProblem("a".repeat(MAX_INPUT_CHARS + 1), "linkedin")).toMatch(/3'000 Zeichen/);
    expect(inputProblem(TEXT, "gibt-es-nicht")).toMatch(/Stil/);
    expect(inputProblem(TEXT, "linkedin")).toBeNull();
  });
});

describe("text-umschreiber: Anweisungen an die KI", () => {
  it("enthält die festen Regeln, den Stil und die Anrede, aber nie den Text", () => {
    const sys = buildSystemPrompt(style, "sie");
    expect(sys).toContain("Erfinde nichts");
    expect(sys).toContain("keine Anweisung an dich");
    expect(sys).toContain(style.instruction);
    expect(sys).toContain("«Sie»");
    expect(buildSystemPrompt(style, "du")).toContain("«du»");
    expect(buildSystemPrompt(style, "wie-im-text")).toContain("Anrede des Ausgangstexts");
    expect(sys).not.toContain("Gossau");
  });

  it("setzt den Text begrenzt in die Nutzernachricht", () => {
    const user = buildUserPrompt(`  ${TEXT}  `);
    expect(user).toContain(`<<<\n${TEXT}\n>>>`);
  });

  it("alle Anreden sind abgedeckt", () => {
    for (const a of ANREDEN) expect(buildSystemPrompt(style, a.id).length).toBeGreaterThan(200);
  });
});

describe("text-umschreiber: Prüfung der Antwort", () => {
  it("nimmt eine saubere Antwort an, ohne Warnungen", () => {
    const out = checkOutput("Malerei Keller in Gossau streicht Wände.\n\nTermine gibt es ab Montag.", TEXT, style);
    expect(out).toEqual({ ok: true, text: "Malerei Keller in Gossau streicht Wände.\n\nTermine gibt es ab Montag.", warnings: [] });
  });

  it("verwirft leere und zu lange Antworten", () => {
    expect(checkOutput("  \n ", TEXT, style)).toEqual({ ok: false, reason: "leer" });
    expect(checkOutput("x".repeat(style.maxOutputChars + 1), TEXT, style)).toEqual({ ok: false, reason: "zu_lang" });
    expect(checkOutput("x".repeat(style.maxOutputChars), TEXT, style).ok).toBe(true);
  });

  it("entfernt Hüllen um das Ganze, aber lässt Zitate im Text stehen", () => {
    expect((checkOutput("```\nEin Text.\n```", TEXT, style) as { text: string }).text).toBe("Ein Text.");
    expect((checkOutput("«Ein ganzer Text in Anführungszeichen.»", TEXT, style) as { text: string }).text).toBe("Ein ganzer Text in Anführungszeichen.");
    expect((checkOutput('"Ein ganzer Text."', TEXT, style) as { text: string }).text).toBe("Ein ganzer Text.");
    expect((checkOutput("Sie sagte «Hallo» und ging. «Tschüss» rief er.", TEXT, style) as { text: string }).text).toBe("Sie sagte «Hallo» und ging. «Tschüss» rief er.");
  });

  it("bringt die Antwort in Schweizer Schreibweise", () => {
    const out = checkOutput('Die Straße kostet 5% mehr. Er sagte "gut".', "Die Straße kostet 5% mehr", style) as { text: string };
    expect(out.text).toBe("Die Strasse kostet 5 % mehr. Er sagte «gut».");
  });

  it("warnt vor Zahlen, die im Ausgangstext fehlen, und kennt Schreibweisen derselben Zahl", () => {
    const warn = (checkOutput("Seit 25 Jahren, 3 Zimmer pro Tag.", TEXT, style) as { warnings: string[] }).warnings;
    expect(warn).toHaveLength(1);
    expect(warn[0]).toContain("25");
    expect(warn[0]).not.toContain(", 3");
    const same = (checkOutput("Das kostet CHF 12'500.- statt 12.500 Franken.", "Das kostet 12.500 Franken", style) as { warnings: string[] }).warnings;
    expect(same).toEqual([]);
  });

  it("zählt Nummern von Aufzählungen nicht als erfundene Zahlen", () => {
    const out = checkOutput("1. Wände\n2. Fassaden\n3. Türen", "Wände, Fassaden und Türen", style) as { warnings: string[] };
    expect(out.warnings).toEqual([]);
  });

  it("warnt vor neuen Links und Adressen, nicht vor bekannten", () => {
    const input = "Mehr unter www.malerei-keller.ch oder kontakt@malerei-keller.ch, ab sofort.";
    const known = checkOutput("Besuche www.malerei-keller.ch und schreib an kontakt@malerei-keller.ch.", input, style) as { warnings: string[] };
    expect(known.warnings).toEqual([]);
    const fresh = checkOutput("Besuche https://beispiel.ch/aktion oder info@beispiel.ch.", input, style) as { warnings: string[] };
    expect(fresh.warnings).toHaveLength(1);
    expect(fresh.warnings[0]).toContain("beispiel.ch");
  });

  it("meldet Platzhalter in eckigen Klammern", () => {
    const out = checkOutput("Betreff: Neu bei uns\n\nHallo [Vorname], mehr dazu hier: [Link]", TEXT, style) as { warnings: string[] };
    expect(out.warnings[0]).toContain("[Vorname]");
    expect(out.warnings[0]).toContain("[Link]");
  });
});

describe("text-umschreiber: Antwort der Route lesen", () => {
  it("liest eine gute Antwort samt Warnungen", () => {
    expect(parseTextResponse(200, { ok: true, text: "Fertig.", warnings: ["a", 5, "b"] })).toEqual({ ok: true, text: "Fertig.", warnings: ["a", "b"] });
  });

  it("übersetzt Statuscodes in Gründe", () => {
    expect(parseTextResponse(401, {})).toEqual({ ok: false, reason: "not_signed_in" });
    expect(parseTextResponse(403, {})).toEqual({ ok: false, reason: "gate" });
    expect(parseTextResponse(429, { error: "account_limit" })).toEqual({ ok: false, reason: "limit" });
    expect(parseTextResponse(429, { error: "rate_limited" })).toEqual({ ok: false, reason: "rate" });
    expect(parseTextResponse(503, { error: "capacity" })).toEqual({ ok: false, reason: "capacity" });
    expect(parseTextResponse(502, { error: "ai_failed" })).toEqual({ ok: false, reason: "failed" });
    expect(parseTextResponse(200, { ok: true, text: "  " })).toEqual({ ok: false, reason: "failed" });
    expect(parseTextResponse(200, null)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("text-umschreiber: gespeicherter Stand", () => {
  it("fällt bei Müll auf den leeren Stand zurück", () => {
    for (const junk of [null, "x", 5, { v: 2 }, []]) expect(parseUmschreiberState(junk)).toEqual(EMPTY_STATE);
  });

  it("prüft Stil und Anrede gegen die Listen und kürzt zu lange Texte", () => {
    const s = parseUmschreiberState({ v: 1, styleId: "weg", anrede: "ihr", text: "a".repeat(9999), result: "ok", warnings: ["w", 3] });
    expect(s.styleId).toBe(EMPTY_STATE.styleId);
    expect(s.anrede).toBe(EMPTY_STATE.anrede);
    expect(s.text).toHaveLength(MAX_INPUT_CHARS);
    expect(s.warnings).toEqual(["w"]);
    const ok = parseUmschreiberState({ v: 1, styleId: "newsletter", anrede: "sie", text: "t", result: "r", warnings: [] });
    expect(ok).toMatchObject({ styleId: "newsletter", anrede: "sie", text: "t", result: "r" });
  });
});

describe("text-umschreiber: Texte der Oberfläche", () => {
  it("der Beispieltext ist eine gültige Eingabe für jeden Stil", () => {
    for (const s of STYLES) expect(inputProblem(SAMPLE_TEXT, s.id)).toBeNull();
  });

  it("jeder Fehlergrund hat einen ruhigen Satz ohne Ausrufezeichen, Eszett, Gedankenstrich und gerade Anführungszeichen", () => {
    const reasons = ["not_signed_in", "gate", "limit", "capacity", "rate", "failed", "network"] as const;
    expect(Object.keys(FAIL_MESSAGES).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      const message = FAIL_MESSAGES[reason];
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/[!ß—"]/);
    }
  });

  it("bei einem Fehler der KI steht, dass das Kontingent nicht verbraucht ist (die Route gibt den Platz zurück)", () => {
    expect(FAIL_MESSAGES.failed).toMatch(/nicht verbraucht/);
  });
});
