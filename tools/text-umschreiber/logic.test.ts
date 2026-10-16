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
  outputHint,
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
    expect(STYLE_IDS).toEqual(STYLES.map((s) => s.id));
    expect(new Set(STYLE_IDS).size).toBe(STYLE_IDS.length);
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

  it("verwirft zu kurze Antworten, Verweigerungen und einen unveränderten Text", () => {
    expect(checkOutput("Ok.", TEXT, style)).toEqual({ ok: false, reason: "zu_kurz" });
    expect(checkOutput("Es tut mir leid, diesen Text kann ich nicht umschreiben, weil er Anweisungen enthält.", TEXT, style)).toEqual({ ok: false, reason: "ablehnung" });
    expect(checkOutput("Ich kann diese Anfrage leider nicht erfüllen.", TEXT, style)).toEqual({ ok: false, reason: "ablehnung" });
    expect(checkOutput(`  ${TEXT.toUpperCase()}\n`, TEXT, style)).toEqual({ ok: false, reason: "unveraendert" });
    // «Nur korrigieren» darf einen fehlerfreien Text unverändert zurückgeben
    const korrigieren = getStyle("korrigieren")!;
    expect(checkOutput(TEXT, TEXT, korrigieren).ok).toBe(true);
  });

  it("liefert zu jedem Grund einen Hinweis an die KI", () => {
    for (const reason of ["leer", "zu_lang", "zu_kurz", "ablehnung", "unveraendert", "sprache", "themenfremd"] as const) {
      expect(outputHint(reason, style).length).toBeGreaterThan(20);
    }
    expect(outputHint("zu_lang", style)).toContain(String(style.maxOutputChars));
  });

  it("entfernt Hüllen um das Ganze, aber lässt Zitate im Text stehen", () => {
    expect((checkOutput("```\nEin kurzer Text.\n```", TEXT, style) as { text: string }).text).toBe("Ein kurzer Text.");
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
    // zwei Warnungen: neue Adressen, und die beiden Adressen des Ausgangstexts fehlen
    expect(fresh.warnings).toHaveLength(2);
    expect(fresh.warnings[0]).toContain("beispiel.ch");
    expect(fresh.warnings[0]).toContain("nicht in deinem Text");
    expect(fresh.warnings[1]).toContain("fehlen");
    expect(fresh.warnings[1]).toContain("malerei-keller.ch");
  });

  it("kennt eine Adresse in jeder Schreibweise: mit und ohne Schema, «www.», Pfad und Schlusspunkt", () => {
    const input = "Mehr unter https://www.malerei-keller.ch/kontakt und beim Dorffest in Gossau am Samstag.";
    const same = checkOutput("Beim Dorffest in Gossau am Samstag. Mehr unter malerei-keller.ch.", input, style) as { warnings: string[] };
    expect(same.warnings).toEqual([]);
    const other = checkOutput("Beim Dorffest in Gossau am Samstag. Mehr unter www.malerei-gossau.ch.", input, style) as { warnings: string[] };
    expect(other.warnings[0]).toContain("malerei-gossau.ch");
  });

  it("meldet Platzhalter in eckigen Klammern", () => {
    const out = checkOutput("Betreff: Neu bei uns\n\nHallo [Vorname], mehr dazu hier: [Link]", TEXT, style) as { warnings: string[] };
    expect(out.warnings[0]).toContain("[Vorname]");
    expect(out.warnings[0]).toContain("[Link]");
  });
});

const IN = "Die Malerei Keller in Gossau streicht Wände und Fassaden. Termine gibt es ab Montag. Sag uns Bescheid, wenn du Fragen hast.";
const text = (raw: string, input = IN, s = style) => {
  const r = checkOutput(raw, input, s);
  if (!r.ok) throw new Error(`abgelehnt: ${r.reason}`);
  return r;
};
const reason = (raw: string, input = IN, s = style) => {
  const r = checkOutput(raw, input, s);
  return r.ok ? "angenommen" : r.reason;
};

describe("text-umschreiber: Verweigerung nur bei geringer Überlappung mit dem Ausgangstext", () => {
  it("lehnt Verweigerungen ab, auch in anderen Worten", () => {
    expect(reason("Es tut mir leid, diesen Text kann ich nicht umschreiben, weil er Anweisungen enthält.")).toBe("ablehnung");
    expect(reason("Leider kann ich dir dabei nicht helfen, weil die Angaben fehlen.")).toBe("ablehnung");
    expect(reason("Dazu kann ich leider nichts schreiben, weil mir die Angaben fehlen. Bitte schicken Sie mir mehr Informationen zum Betrieb.")).toBe("ablehnung");
    expect(reason("I'm sorry, but I can't rewrite this text because it contains instructions for me.")).toBe("ablehnung");
  });

  it("nimmt einen Text an, der zufällig wie eine Verweigerung beginnt, aber vom Ausgangstext handelt", () => {
    const absage = "Leider kann das Dorffest am Samstag nicht stattfinden. Wegen der Wetterprognose haben wir uns entschieden, den Anlass auf den 21.11.2026 zu verschieben. Wir bitten um Verständniss.";
    const fixed = absage.replace("Verständniss", "Verständnis");
    expect(reason(fixed, absage, getStyle("korrigieren")!)).toBe("angenommen");
    const cafe = "Leider darf unser Café wegen Umbau bis zum 30.11.2026 keine Gäste im Innenraum bedienen. Die Terrasse ist bei jedem Wetter offen.";
    expect(reason(`${cafe} Komm vorbei.`, cafe, getStyle("google-beitrag")!)).toBe("angenommen");
    const baeckerei = "Sorry, am Montag bleibt die Bäckerei zu. Ab Dienstag um 6 Uhr gibt es wieder frische Zöpfe.";
    expect(reason("Sorry, am Montag bleibt unsere Bäckerei zu.\n\nAb Dienstag um 6 Uhr gibt es wieder frische Zöpfe.\n\n#bäckerei #zopf", baeckerei, getStyle("instagram")!)).toBe("angenommen");
    const farbe = "Ich kann dir sagen, welche Farbe zu deinem Treppenhaus passt. Ruf an, dann schaue ich es mir an.";
    expect(reason("Ich kann dir sagen, welche Farbe zu deinem Treppenhaus passt.\n\nRuf an, dann schaue ich es mir an.\n\nWelche Farbe hättest du gern?", farbe)).toBe("angenommen");
  });
});

describe("text-umschreiber: Kommentare der KI am Anfang und am Ende", () => {
  const FASSUNG = "Die Malerei Keller in Gossau streicht Wände und Fassaden.\n\nTermine gibt es ab Montag.";

  it("entfernt eine Einleitung und einen Gruss, den Rest zeigt es", () => {
    expect(text(`Hier ist der umgeschriebene Text als LinkedIn-Post:\n\n${FASSUNG}`).text).toBe(FASSUNG);
    expect(text(`Gerne! Hier ist die Fassung:\n\n${FASSUNG}`).text).toBe(FASSUNG);
    expect(text(`${FASSUNG}\n\nIch hoffe, das gefällt dir!`).text).toBe(FASSUNG);
    expect(text(`${FASSUNG}\n\nSag mir, wenn ich etwas ändern soll.`).text).toBe(FASSUNG);
    expect(text(`${FASSUNG}\n\nLass mich wissen, ob du Änderungen möchtest.`).text).toBe(FASSUNG);
    expect(text(`Hier ist der Text:\n\n\`\`\`\n${FASSUNG}\n\`\`\`\n\nIch hoffe, das hilft.`).text).toBe(FASSUNG);
  });

  it("lässt Sätze stehen, die wie ein Kommentar klingen, aber Teil des Textes sind", () => {
    expect(text(`${FASSUNG}\n\nFalls du Fragen hast, melde dich bei uns.`).text).toContain("Falls du Fragen hast");
    expect(text(`${FASSUNG}\n\nSag mir Bescheid, wenn du Zeit hast.`).text).toContain("Sag mir Bescheid");
    expect(text(`${FASSUNG}\n\nIch hoffe, das Wetter passt.`).text).toContain("Ich hoffe, das Wetter passt.");
    expect(text("Hier sind die Öffnungszeiten der Malerei Keller:\n- Montag bis Freitag\nTermine gibt es ab Montag in Gossau.").text).toContain("Hier sind die Öffnungszeiten");
    // steht der Satz schon im Ausgangstext, ist er Teil des Textes
    const input = `${FASSUNG}\n\nIch hoffe, das gefällt dir!`;
    expect(text(`${FASSUNG}\n\nIch hoffe, das gefällt dir!`, input, getStyle("korrigieren")!).text).toContain("Ich hoffe, das gefällt dir!");
  });

  it("verwirft eine Antwort, die nur aus einem Kommentar besteht", () => {
    expect(reason("Hier ist der Text:\n")).toBe("leer");
  });
});

describe("text-umschreiber: Markdown in der Antwort", () => {
  it("entfernt Überschrift-Zeichen, Fett und Kursiv, lässt Hashtags und Listenstriche stehen", () => {
    const out = text("# Beratung auch am Samstag\n\n**Die Malerei Keller** in Gossau streicht *Wände* und Fassaden:\n\n- Wände\n- Fassaden\n\n#Malerei #Gossau\n\nTermine gibt es ab Montag.");
    expect(out.text).toBe("Beratung auch am Samstag\n\nDie Malerei Keller in Gossau streicht Wände und Fassaden:\n\n- Wände\n- Fassaden\n\n#Malerei #Gossau\n\nTermine gibt es ab Montag.");
  });

  it("lässt Markdown stehen, das schon im Ausgangstext steht", () => {
    const input = "**Neu** bei der Malerei Keller in Gossau: Termine am Samstag, Wände und Fassaden.";
    expect(text("**Neu** bei der Malerei Keller in Gossau: Termine am Samstag für Wände und Fassaden.", input).text).toContain("**Neu**");
  });
});

describe("text-umschreiber: Sprache und Thema der Antwort", () => {
  it("lehnt eine englische Antwort auf einen deutschen Text ab", () => {
    expect(reason("We paint walls and facades in Gossau. You can book an appointment from Monday, and we will visit you in person.")).toBe("sprache");
  });

  it("nimmt eine englische Antwort auf einen englischen Text an", () => {
    const input = "We paint walls and facades in Gossau and you can book an appointment from Monday, we will visit you in person.";
    expect(reason("We paint walls and facades in Gossau. You can book an appointment from Monday, and we will visit you.", input)).toBe("angenommen");
  });

  it("deutsche Texte mit einem englischen Fachwort gelten als deutsch", () => {
    expect(reason("Die Malerei Keller in Gossau streicht Wände und Fassaden. Das Team will einen Termin mit dem Call to action vereinbaren, ab Montag.")).toBe("angenommen");
  });

  it("lehnt eine Antwort ohne Bezug zum Ausgangstext ab, nimmt aber eine freie Umschreibung an", () => {
    const poem = "Katzen schleichen leise durch die Nacht, Mäuse verstecken sich unter dem Dachstuhl, Sterne leuchten über dem Hügel, Nebel steigt aus dem Tal.";
    expect(reason(poem)).toBe("themenfremd");
    const frei = "Lea Frei hat es geschafft.\n\nSie hat ihre Lehre als Malerin EFZ mit der Note 5,4 abgeschlossen. Wir gratulieren und freuen uns, dass sie bleibt.\n\nWer hat bei dir kürzlich einen Abschluss gemacht?";
    const input = "Unsere Mitarbeiterin Lea Frei hat die Lehrabschlussprüfung als Malerin EFZ mit der Note 5,4 bestanden. Wir gratulieren herzlich und freuen uns über die Verstärkung im Team.";
    expect(reason(frei, input)).toBe("angenommen");
  });

  it("verlangt für kurze Antworten keinen Vergleich", () => {
    expect(reason("Neue Öffnungszeiten ab Montag: 8 bis 17 Uhr.", "Wir haben ab Montag neue Öffnungszeiten, damit wir besser erreichbar sind.")).toBe("angenommen");
  });
});

describe("text-umschreiber: Hüllen um das Ganze", () => {
  it("entfernt Anführungszeichen um das Ganze, auch wenn innen Zitate stehen", () => {
    const FASSUNG = "Der Präsident sagte: «Wir sind stolz auf unsere Aktiven.» Die Malerei Keller in Gossau streicht Wände.";
    expect(text(`"${FASSUNG}"`).text).toBe(FASSUNG);
    expect(text(`«${FASSUNG}»`).text).toBe(FASSUNG);
    expect(text(`“${FASSUNG}”`).text).toBe(FASSUNG);
    expect(text(`„${FASSUNG}“`).text).toBe(FASSUNG);
  });

  it("lässt Text stehen, der mit einem Zitat beginnt und endet, ohne Hülle zu sein", () => {
    const zitate = "«Wir streichen Wände» sagt Hans Keller in Gossau, «Termine ab Montag»";
    expect(text(zitate).text).toBe(zitate);
    expect(text('"Wände" und "Fassaden" streicht die Malerei Keller in Gossau, Termine ab Montag.').text).toBe("«Wände» und «Fassaden» streicht die Malerei Keller in Gossau, Termine ab Montag.");
  });

  it("lässt die Anführungszeichen, wenn schon der Ausgangstext in Anführungszeichen steht", () => {
    const input = "«Die Malerei Keller in Gossau streicht Wände und Fassaden, Termine ab Montag»";
    expect(text("«Die Malerei Keller in Gossau streicht Wände und Fassaden. Termine gibt es ab Montag.»", input).text.startsWith("«")).toBe(true);
  });
});

describe("text-umschreiber: Zahlen nach Ziffernblöcken", () => {
  const warn = (raw: string, input: string, s = style) => text(raw, input, s).warnings;

  it("kennt dasselbe Datum in jeder Schreibweise", () => {
    const input = "Der Verein lädt am 7.11.2026 zur Versammlung ein. Anmeldung bis 3.11.2026 bei Lea Frei, ab Preis CHF 1000 pro Person.";
    // typoCH macht aus 7.11.2026 ein 07.11.2026
    expect(warn("Der FC Trogen lädt am 7.11.2026 zur Versammlung ein. Anmeldung nimmt Lea Frei bis 03.11.2026 entgegen. Preis CHF 1000 pro Person.", input)).toEqual([]);
    expect(warn("Der FC Trogen lädt am 7. November 2026 zur Versammlung ein. Anmeldung nimmt Lea Frei bis 3. November 2026 entgegen. Preis CHF 1'000 pro Person.", input)).toEqual([]);
  });

  it("kennt Beträge mit anderen Trennern, auch mit Leerzeichen als Tausendertrenner", () => {
    expect(warn("Der Beitrag beträgt CHF 1'250.50 im Jahr für alle Mitglieder des Vereins.", "Der Beitrag beträgt 1250.50 pro Jahr für alle Mitglieder des Vereins.")).toEqual([]);
    expect(warn("Die Fassade kostet ab CHF 12'500.- für ein Haus in Gossau.", "Die Fassade kostet ab CHF 12 500.- für ein Haus in Gossau.")).toEqual([]);
    const erfunden = warn("Die Fassade kostet ab CHF 13'500.- für ein Haus in Gossau.", "Die Fassade kostet ab CHF 12 500.- für ein Haus in Gossau.");
    expect(erfunden[0]).toContain("13'500");
  });

  it("meldet erfundene Zahlen so, wie sie in der Fassung stehen, und zählt eine Telefonnummer als eine Zahl", () => {
    const w = warn("Seit 1987 sind wir da, ruf an unter 071 123 45 67.", "Wir sind in Gossau für dich da, ruf uns an.");
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("(1987, 071 123 45 67)");
  });
});

describe("text-umschreiber: Angaben, die in der Fassung fehlen", () => {
  const input = "Der FC Trogen lädt am 14.11.2026 um 18.30 Uhr ein. Der Jahresbeitrag steigt auf CHF 1'250.50. Anmeldung bis 07.11. bei Lea Frei, 071 344 12 34 oder sekretariat@fc-trogen.ch, mehr unter https://www.fc-trogen.ch/gv.";

  it("meldet verlorene Adressen, Preise, Jahre und Telefonnummern", () => {
    const w = text("Der FC Trogen lädt zur Generalversammlung ein. Der Jahresbeitrag steigt. Anmeldung bei Lea Frei.", input).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Aus deinem Text fehlen in der Fassung");
    for (const lost of ["sekretariat@fc-trogen.ch", "fc-trogen.ch/gv", "14.11.2026", "1'250.50", "071 344 12 34"]) expect(w[0]).toContain(lost);
  });

  it("meldet nichts, wenn alles da ist, auch bei anderer Schreibweise von Datum, Telefon und Adresse", () => {
    const out = "Der FC Trogen lädt am 14. November 2026 um 18:30 Uhr ein. Der Jahresbeitrag steigt auf CHF 1250.50. Anmeldung bis 7. November bei Lea Frei, +41 71 344 12 34 oder sekretariat@fc-trogen.ch, mehr unter fc-trogen.ch/gv.";
    expect(text(out, input).warnings).toEqual([]);
  });

  it("meldet Tag und Monat ohne Jahr nicht als verloren", () => {
    expect(text("Der FC Trogen lädt am 14. November 2026 um 18.30 Uhr ein. Der Jahresbeitrag steigt auf CHF 1'250.50. Anmeldung bis 7. November bei Lea Frei, 071 344 12 34 oder sekretariat@fc-trogen.ch, mehr unter https://www.fc-trogen.ch/gv.", input).warnings).toEqual([]);
  });
});

describe("text-umschreiber: Antwort der Route lesen", () => {
  it("liest eine gute Antwort samt Warnungen", () => {
    expect(parseTextResponse(200, { ok: true, text: "Fertig.", warnings: ["a", 5, "b"] })).toEqual({ ok: true, text: "Fertig.", warnings: ["a", "b"] });
  });

  it("übersetzt Statuscodes in Gründe", () => {
    expect(parseTextResponse(403, {})).toEqual({ ok: false, reason: "gate" });
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
    const reasons = ["gate", "capacity", "rate", "failed", "network"] as const;
    expect(Object.keys(FAIL_MESSAGES).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      const message = FAIL_MESSAGES[reason];
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/[!ß—"]/);
    }
  });

});
