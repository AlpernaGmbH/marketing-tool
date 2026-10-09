import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { flattenBlocks, toMarkdown, type DocBlock } from "@/lib/export/model";
import {
  BASIS_REIHENFOLGE,
  EMPTY_STATE,
  ERGAENZUNG_MAX,
  FIELD_IDS,
  GEBIET_KEYS,
  GRENZE_NOTE,
  HOECHSTSUMME,
  KANAELE,
  KANAL_KEYS,
  KANAL_LINKS,
  KUNDSCHAFT_KEYS,
  KUNDSCHAFT_LABEL,
  PAUSIEREN_TITEL,
  PFLICHTANGABEN,
  RICHTWERT_NOTE,
  SCHWELLE_ERGAENZUNG,
  SCHWELLE_FOKUS,
  SUCHE_KEYS,
  ZEITEN,
  ZIELE,
  angaben,
  ausgabeText,
  auswerten,
  basisKanaele,
  begriffe,
  eignung,
  eingabeText,
  emptyInput,
  fehlendeFaehigkeit,
  fokusMax,
  geprueft,
  heuteAusProfil,
  heuteOf,
  hinweiseFor,
  kanalOf,
  kurzergebnis,
  listText,
  mitTyp,
  parseState,
  passungOf,
  profilePatch,
  rechnungFor,
  moeglich,
  KEIN_BEITRAG_ZUM_ZIEL,
  teilwerte,
  toDocument,
  typOf,
  validate,
  vergleiche,
  zieleFor,
  ausschluss,
  type Auswertung,
  type FaehigkeitKey,
  type Geprueft,
  type Input,
  type KanalKey,
  type Rolle,
} from "./logic";
import config from "./tool.config";

// ---- Beispiele ---------------------------------------------------------------------------------

/** Malerei Keller, Gossau: das Beispiel im Seitentext. */
const KELLER: Input = {
  typ: "kmu",
  ziel: "anfragen",
  kundschaft: "privat",
  suche: "aktiv",
  gebiet: "region",
  zeit: 2,
  faehigkeiten: ["text", "foto"],
  heute: ["website", "facebook"],
};
const KONTEXT = { firma: "Malerei Keller, Gossau", branche: "Malerei" };
const ALLE: FaehigkeitKey[] = ["text", "foto", "video", "gestaltung"];
/** Ein Verein, der viele Kanäle gut brauchen kann. */
const FC_TROGEN: Input = { typ: "verein", ziel: "mitglieder", kundschaft: "privat", suche: "wecken", gebiet: "ort", zeit: 2, faehigkeiten: ["text", "foto"], heute: [] };
/** WhatsApp und Instagram liegen hier gleichauf (Gleichstand). */
const GLEICHSTAND: Input = { typ: "kmu", ziel: "anfragen", kundschaft: "privat", suche: "beides", gebiet: "ort", zeit: 2, faehigkeiten: ALLE, heute: [] };

const mit = (base: Input, patch: Partial<Input>): Input => ({ ...base, ...patch });
const werte = (input: Input): Auswertung => {
  const a = auswerten(input);
  if (!a) throw new Error("Eingabe unvollständig");
  return a;
};
const keys = (list: { key: KanalKey }[]): KanalKey[] => list.map((k) => k.key);
const rolleOf = (a: Auswertung, key: KanalKey): Rolle => a.kanaele.find((k) => k.key === key)?.rolle as Rolle;

function blockText(blocks: DocBlock[]): string[] {
  return flattenBlocks(blocks).flatMap((b): string[] => {
    switch (b.type) {
      case "heading":
      case "paragraph":
        return [b.text];
      case "list":
        return b.items;
      case "table":
        return [...b.header, ...b.rows.flat()];
      case "facts":
        return b.items.flatMap((f) => [f.label, f.value]);
    }
  });
}

/** Alle erzeugten Texte einer Auswertung, Dokument eingeschlossen. */
function alleTexte(a: Auswertung): string[] {
  const doc = toDocument(a, KONTEXT);
  return [
    a.aussage,
    ...a.hinweise,
    ...a.monate.flatMap((m) => [m.titel, m.text, ...m.punkte.flatMap((p) => [p.kanal, p.aufgabe])]),
    ...a.kanaele.flatMap((k) => [k.label, k.beschreibung, k.passungText, k.begruendung, k.grund, k.schritt, k.aufgabe, ...k.links.map((l) => l.name)]),
    a.fokusLeer ?? "",
    ...blockText(doc.blocks),
    doc.subtitle ?? "",
  ];
}

// ---- Katalog -----------------------------------------------------------------------------------

describe("Kanalstrategie: Kanäle und Konstanten", () => {
  it("kennt zehn Kanäle in fester Reihenfolge", () => {
    expect(KANAL_KEYS).toEqual(["gbp", "website", "verzeichnisse", "whatsapp", "instagram", "facebook", "linkedin", "tiktok", "youtube", "newsletter"]);
    expect(KANAELE.map((k) => k.label)).toEqual([
      "Google-Unternehmensprofil",
      "Website",
      "Verzeichnisse",
      "WhatsApp",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "TikTok",
      "YouTube",
      "Newsletter",
    ]);
  });

  it("hält alle Eigenschaften in den Bereichen 0 bis 3, 0 bis 2 und Zeitstufe 1 bis 4", () => {
    for (const k of KANAELE) {
      expect(Object.keys(k.ziele).sort(), k.key).toEqual(ZIELE.map((zl) => zl.key).sort());
      for (const v of Object.values(k.ziele)) expect([0, 1, 2, 3]).toContain(v);
      for (const group of [k.kundschaft, k.suche, k.gebiet]) for (const v of Object.values(group)) expect([0, 1, 2]).toContain(v);
      expect([1, 2, 3, 4]).toContain(k.aufwand);
      expect(k.beschreibung.length).toBeGreaterThan(20);
    }
  });

  it("verlangt für jeden Kanal ausser der Website eine Fähigkeit und kennt «Foto oder Video» als Gruppe", () => {
    for (const k of KANAELE) if (k.key !== "website") expect(k.faehigkeit.length, k.key).toBeGreaterThan(0);
    expect(kanalOf("website").faehigkeit).toEqual([]);
    expect(kanalOf("instagram").faehigkeit[0]).toEqual(expect.arrayContaining(["foto", "video"]));
    expect(kanalOf("tiktok").faehigkeit).toEqual([["video"]]);
  });

  it("hat vier Ziele je Typ und die Schwellen in sinnvoller Reihenfolge", () => {
    expect(zieleFor("kmu").map((zl) => zl.label)).toEqual(["Anfragen und Aufträge", "Bekanntheit in der Region", "Stammkundschaft binden", "Fachkräfte und Lernende finden"]);
    expect(zieleFor("verein").map((zl) => zl.label)).toEqual(["Mitglieder gewinnen", "Anlässe füllen", "Sponsoren und Gönner finden", "Freiwillige finden"]);
    expect(SCHWELLE_ERGAENZUNG).toBeLessThan(SCHWELLE_FOKUS);
    expect(HOECHSTSUMME).toBe(9);
    expect(ZEITEN.map((zt) => zt.label)).toEqual(["Bis 1 Stunde", "2 bis 3 Stunden", "4 bis 6 Stunden", "Mehr als 6 Stunden"]);
  });

  it("bildet typOf aus dem Profil ab", () => {
    expect(typOf("verein")).toBe("verein");
    expect(typOf("kmu")).toBe("kmu");
    expect(typOf(undefined)).toBe("kmu");
  });
});

// ---- Eignung -----------------------------------------------------------------------------------

describe("Kanalstrategie: Eignung und Passung", () => {
  const g = (input: Input): Geprueft => {
    const r = geprueft(input);
    if (!r) throw new Error("unvollständig");
    return r;
  };

  it("summiert Ziel, Kundschaft, Suchverhalten und Gebiet durch die Höchstsumme", () => {
    // WhatsApp bei Keller: Ziel 2, Privatpersonen 2, aktiv 1, Region 1 = 6 von 9
    expect(teilwerte(kanalOf("whatsapp"), g(KELLER))).toEqual({ ziel: 2, kundschaft: 2, suche: 1, gebiet: 1 });
    expect(eignung(kanalOf("whatsapp"), g(KELLER))).toBe(67);
    // Website bei Keller: 3 + 2 + 2 + 2 = 9 von 9
    expect(eignung(kanalOf("website"), g(KELLER))).toBe(100);
  });

  it("rechnet «Beides» bei Kundschaft und Suchverhalten mit dem besseren Wert", () => {
    const li = kanalOf("linkedin");
    const privat = teilwerte(li, g(mit(KELLER, { kundschaft: "privat" }))).kundschaft;
    const firmen = teilwerte(li, g(mit(KELLER, { kundschaft: "firmen" }))).kundschaft;
    const beides = teilwerte(li, g(mit(KELLER, { kundschaft: "beides" }))).kundschaft;
    expect(privat).toBe(0);
    expect(firmen).toBe(2);
    expect(beides).toBe(2);
    const ig = kanalOf("instagram");
    expect(teilwerte(ig, g(mit(KELLER, { suche: "aktiv" }))).suche).toBe(0);
    expect(teilwerte(ig, g(mit(KELLER, { suche: "wecken" }))).suche).toBe(2);
    expect(teilwerte(ig, g(mit(KELLER, { suche: "beides" }))).suche).toBe(2);
  });

  it("nimmt bei Vereinen die Spalte «Mitglieder» statt «Privatpersonen»", () => {
    const wa = kanalOf("whatsapp");
    expect(wa.kundschaft.privat).toBe(2);
    const tt = kanalOf("youtube");
    // YouTube: Privatpersonen 2, Mitglieder 1
    expect(teilwerte(tt, g(mit(KELLER, { kundschaft: "privat" }))).kundschaft).toBe(2);
    expect(teilwerte(tt, g(mit(FC_TROGEN, { kundschaft: "privat" }))).kundschaft).toBe(1);
    expect(teilwerte(tt, g(mit(FC_TROGEN, { kundschaft: "beides" }))).kundschaft).toBe(2);
  });

  it("bleibt für jede Kombination zwischen 0 und 100", () => {
    for (const k of KANAELE) {
      for (const zl of ZIELE) {
        for (const kundschaft of KUNDSCHAFT_KEYS) {
          for (const suche of SUCHE_KEYS) {
            for (const gebiet of GEBIET_KEYS) {
              const e = eignung(k, { typ: zl.typ, ziel: zl.key, kundschaft, suche, gebiet });
              expect(e).toBeGreaterThanOrEqual(0);
              expect(e).toBeLessThanOrEqual(100);
              expect(Number.isInteger(e)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("ordnet die Passung an den Schwellen zu", () => {
    expect(passungOf(SCHWELLE_FOKUS)).toBe("gut");
    expect(passungOf(SCHWELLE_FOKUS - 1)).toBe("teilweise");
    expect(passungOf(SCHWELLE_ERGAENZUNG)).toBe("teilweise");
    expect(passungOf(SCHWELLE_ERGAENZUNG - 1)).toBe("wenig");
    expect(passungOf(0)).toBe("wenig");
    expect(passungOf(100)).toBe("gut");
  });
});

// ---- Fähigkeit und Zeit ------------------------------------------------------------------------

describe("Kanalstrategie: Fähigkeit und Zeit", () => {
  it("findet die erste fehlende Gruppe von Fähigkeiten", () => {
    expect(fehlendeFaehigkeit(kanalOf("tiktok"), ["text", "foto"])).toEqual(["video"]);
    expect(fehlendeFaehigkeit(kanalOf("tiktok"), ["video"])).toBeNull();
    expect(fehlendeFaehigkeit(kanalOf("instagram"), ["text"])).toEqual(expect.arrayContaining(["foto", "video"]));
    expect(fehlendeFaehigkeit(kanalOf("instagram"), ["video"])).toBeNull();
    expect(fehlendeFaehigkeit(kanalOf("instagram"), ["foto"])).toBeNull();
    expect(fehlendeFaehigkeit(kanalOf("website"), [])).toBeNull();
  });

  it("nennt den Grund im Wortlaut der Spec, zuerst die Fähigkeit, dann die Zeit", () => {
    expect(ausschluss(kanalOf("tiktok"), { faehigkeiten: ["text"], zeit: 4 })).toBe("Du hast die Fähigkeit Video nicht angegeben.");
    expect(ausschluss(kanalOf("instagram"), { faehigkeiten: ["text"], zeit: 4 })).toBe(
      "Du hast keine der Fähigkeiten Foto, Video oder Gestaltung angegeben.",
    );
    expect(ausschluss(kanalOf("newsletter"), { faehigkeiten: ["text"], zeit: 2 })).toBe("Dafür brauchst du mehr Zeit pro Woche, als du angegeben hast.");
    // beides fehlt: die Fähigkeit steht zuerst
    expect(ausschluss(kanalOf("tiktok"), { faehigkeiten: [], zeit: 1 })).toContain("Fähigkeit Video");
    expect(ausschluss(kanalOf("newsletter"), { faehigkeiten: ["text"], zeit: 3 })).toBeNull();
  });

  it("macht einen Kanal ohne die Fähigkeit nie zu Fokus oder Ergänzung, auch wenn er gut passt", () => {
    const a = werte(mit(KELLER, { zeit: 4, faehigkeiten: ["text", "foto"], suche: "wecken", kundschaft: "privat" }));
    for (const key of ["tiktok", "youtube"] as const) {
      const k = a.kanaele.find((x) => x.key === key);
      expect(k?.rolle).toBe("vorerst");
      expect(k?.grund).toBe("Du hast die Fähigkeit Video nicht angegeben.");
    }
    const mitVideo = werte(mit(KELLER, { zeit: 4, faehigkeiten: ["text", "foto", "video"], suche: "wecken", kundschaft: "privat" }));
    expect(["fokus", "ergaenzung"]).toContain(rolleOf(mitVideo, "youtube"));
  });

  it("macht einen Kanal mit zu wenig Zeit nie zu Fokus oder Ergänzung", () => {
    const a = werte(mit(KELLER, { zeit: 2, faehigkeiten: ALLE }));
    expect(kanalOf("newsletter").aufwand).toBeGreaterThan(2);
    const nl = a.kanaele.find((x) => x.key === "newsletter");
    expect(nl?.rolle).toBe("vorerst");
    expect(nl?.passung).toBe("gut");
    expect(nl?.grund).toBe("Dafür brauchst du mehr Zeit pro Woche, als du angegeben hast.");
  });

  it("lässt bei Zeitstufe 1 nur Kanäle der Stufe 1 zu", () => {
    const a = werte(mit(FC_TROGEN, { zeit: 1, faehigkeiten: ALLE }));
    for (const k of [...a.fokus, ...a.ergaenzung]) expect(kanalOf(k.key).aufwand).toBe(1);
    expect(rolleOf(a, "instagram")).toBe("vorerst");
  });
});

// ---- Basis -------------------------------------------------------------------------------------

describe("Kanalstrategie: Rolle Basis", () => {
  const basis = (patch: Partial<Input>, base: Input = KELLER) => {
    const g = geprueft(mit(base, patch));
    if (!g) throw new Error("unvollständig");
    return basisKanaele(g);
  };

  it("macht die Website immer zur Basis, bei jedem Ziel und Gebiet", () => {
    for (const zl of ZIELE) {
      for (const gebiet of GEBIET_KEYS) {
        const g = geprueft({ ...KELLER, typ: zl.typ, ziel: zl.key, gebiet });
        expect(g && basisKanaele(g)).toContain("website");
      }
    }
  });

  it("macht das Google-Unternehmensprofil zur Basis bei einem Betrieb mit Ort oder Region", () => {
    expect(basis({ gebiet: "ort", ziel: "bekanntheit" })).toContain("gbp");
    expect(basis({ gebiet: "region", ziel: "binden" })).toContain("gbp");
  });

  it("macht das Google-Unternehmensprofil zur Basis bei einem Betrieb mit dem Ziel Anfragen, auch schweizweit", () => {
    expect(basis({ gebiet: "schweiz", ziel: "anfragen" })).toContain("gbp");
  });

  it("macht das Google-Unternehmensprofil nicht zur Basis bei schweizweitem Gebiet ohne das Ziel Anfragen", () => {
    expect(basis({ gebiet: "schweiz", ziel: "bekanntheit" })).not.toContain("gbp");
    expect(basis({ gebiet: "schweiz", ziel: "binden" })).not.toContain("gbp");
  });

  it("macht das Google-Unternehmensprofil bei Vereinen nie zur Basis", () => {
    expect(basis({ gebiet: "ort" }, FC_TROGEN)).not.toContain("gbp");
    expect(basis({ gebiet: "ort", ziel: "sponsoren" }, FC_TROGEN)).not.toContain("gbp");
  });

  it("macht Verzeichnisse zur Basis bei Ort oder Region", () => {
    expect(basis({ gebiet: "ort" })).toContain("verzeichnisse");
    expect(basis({ gebiet: "region" })).toContain("verzeichnisse");
    expect(basis({ gebiet: "ort" }, FC_TROGEN)).toContain("verzeichnisse");
  });

  it("macht Verzeichnisse nicht zur Basis bei schweizweitem Gebiet", () => {
    expect(basis({ gebiet: "schweiz" })).not.toContain("verzeichnisse");
  });

  it("macht Verzeichnisse nicht zur Basis beim Ziel Fachkräfte oder Freiwillige", () => {
    expect(basis({ ziel: "fachkraefte", gebiet: "ort" })).not.toContain("verzeichnisse");
    expect(basis({ ziel: "freiwillige", gebiet: "ort" }, FC_TROGEN)).not.toContain("verzeichnisse");
    expect(basis({ ziel: "fachkraefte", gebiet: "ort" })).toContain("gbp");
  });

  it("gibt die Basis in der Reihenfolge Website, Google-Unternehmensprofil, Verzeichnisse aus", () => {
    expect(BASIS_REIHENFOLGE).toEqual(["website", "gbp", "verzeichnisse"]);
    expect(keys(werte(KELLER).basis)).toEqual(["website", "gbp", "verzeichnisse"]);
    expect(keys(werte(mit(KELLER, { gebiet: "schweiz", ziel: "bekanntheit" })).basis)).toEqual(["website"]);
  });

  it("nennt den Grund der Basis aus den Angaben", () => {
    const a = werte(KELLER);
    expect(a.basis.find((k) => k.key === "gbp")?.begruendung).toContain("Dein Gebiet ist lokal");
    const schweiz = werte(mit(KELLER, { gebiet: "schweiz" }));
    expect(schweiz.basis.find((k) => k.key === "gbp")?.begruendung).toContain("Du willst Anfragen");
  });
});

// ---- Fokus und Ergänzung -----------------------------------------------------------------------

describe("Kanalstrategie: Rollen Fokus, Ergänzung und Vorerst nicht", () => {
  it("setzt bei Zeitstufe 1 und 2 höchstens einen Fokus-Kanal, bei 3 und 4 höchstens zwei", () => {
    expect([1, 2, 3, 4].map((z) => fokusMax(z as 1 | 2 | 3 | 4))).toEqual([1, 1, 2, 2]);
    const anzahl = (zeit: 1 | 2 | 3 | 4) => werte(mit(FC_TROGEN, { zeit, faehigkeiten: ALLE, gebiet: "region" })).fokus.length;
    expect(anzahl(1)).toBeLessThanOrEqual(1);
    expect(anzahl(2)).toBe(1);
    expect(anzahl(3)).toBe(2);
    expect(anzahl(4)).toBe(2);
  });

  it("wählt als Fokus den Kanal mit der höchsten Eignung unter den übrigen", () => {
    const a = werte(mit(FC_TROGEN, { zeit: 3, faehigkeiten: ALLE }));
    const eignungen = a.fokus.map((k) => k.eignung);
    expect(eignungen).toEqual([...eignungen].sort((x, y) => y - x));
    const rest = a.vorerst.filter((k) => moeglich(kanalOf(k.key), a.input));
    for (const k of rest) expect(k.eignung).toBeLessThanOrEqual(Math.min(...eignungen));
    for (const k of a.fokus) {
      expect(k.eignung).toBeGreaterThanOrEqual(SCHWELLE_FOKUS);
      expect(a.basis.map((b) => b.key)).not.toContain(k.key);
    }
  });

  it("macht einen Kanal unter der Fokus-Schwelle nicht zum Fokus", () => {
    // Keller: Facebook und Instagram liegen unter der Schwelle; WhatsApp ist der einzige Fokus
    const a = werte(KELLER);
    expect(keys(a.fokus)).toEqual(["whatsapp"]);
    expect(a.kanaele.find((k) => k.key === "facebook")?.eignung).toBeLessThan(SCHWELLE_FOKUS);
    expect(rolleOf(a, "facebook")).toBe("vorerst");
    expect(a.kanaele.find((k) => k.key === "facebook")?.grund).toBe("Dieser Kanal passt nur teilweise, für den Fokus reicht es nicht.");
  });

  it("gibt Ergänzungen nur bei Zeitstufe 4 und höchstens zwei, jede über der niedrigeren Schwelle", () => {
    const vier = werte(mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, gebiet: "region", ziel: "anlaesse" }));
    expect(vier.ergaenzung.length).toBeGreaterThan(0);
    expect(vier.ergaenzung.length).toBeLessThanOrEqual(ERGAENZUNG_MAX);
    for (const k of vier.ergaenzung) expect(k.eignung).toBeGreaterThanOrEqual(SCHWELLE_ERGAENZUNG);
    for (const zeit of [1, 2, 3] as const) expect(werte(mit(FC_TROGEN, { zeit, faehigkeiten: ALLE })).ergaenzung).toEqual([]);
  });

  it("gibt keine Ergänzung unter der niedrigeren Schwelle", () => {
    const a = werte(mit(KELLER, { zeit: 4, faehigkeiten: ALLE }));
    for (const k of a.ergaenzung) expect(k.eignung).toBeGreaterThanOrEqual(SCHWELLE_ERGAENZUNG);
    const linkedin = a.kanaele.find((k) => k.key === "linkedin");
    expect(linkedin?.eignung).toBeLessThan(SCHWELLE_ERGAENZUNG);
    expect(linkedin?.rolle).toBe("vorerst");
    expect(linkedin?.grund).toBe("Dieser Kanal passt zu wenig zu deinen Angaben.");
  });

  it("belegt jeden der zehn Kanäle genau einmal mit genau einer Rolle", () => {
    for (const input of [KELLER, FC_TROGEN, GLEICHSTAND, mit(KELLER, { zeit: 4, faehigkeiten: ALLE })]) {
      const a = werte(input);
      expect(a.kanaele).toHaveLength(10);
      expect(new Set(keys(a.kanaele)).size).toBe(10);
      expect(a.basis.length + a.fokus.length + a.ergaenzung.length + a.vorerst.length).toBe(10);
      expect(a.kanaele.map((k) => k.rolle)).toEqual([...a.basis, ...a.fokus, ...a.ergaenzung, ...a.vorerst].map((k) => k.rolle));
    }
  });

  it("bleibt ohne Fähigkeit bei den Basis-Kanälen, mit Hinweis", () => {
    const a = werte(mit(KELLER, { faehigkeiten: [], zeit: 4 }));
    expect(a.fokus).toEqual([]);
    expect(a.ergaenzung).toEqual([]);
    expect(keys(a.basis)).toEqual(["website", "gbp", "verzeichnisse"]);
    expect(a.fokusLeer).toBe("Du hast keine Fähigkeit angegeben. Darum bleibt es bei den Basis-Kanälen.");
    expect(a.aussage).toBe("Basis: Website, Google-Unternehmensprofil und Verzeichnisse. Kein Fokus-Kanal.");
    expect(a.hinweise[1]).toContain("keine Fähigkeit angegeben");
    expect(a.monate[1].punkte).toEqual([]);
    expect(a.monate[1].text).toContain("Es gibt keinen Fokus-Kanal");
  });

  it("sagt, warum es keinen Fokus gibt, wenn kein Kanal gut genug passt", () => {
    const a = werte(mit(KELLER, { kundschaft: "firmen", faehigkeiten: ["text", "foto"] }));
    expect(a.fokus).toEqual([]);
    expect(a.fokusLeer).toBe("Kein weiterer Kanal passt gut genug zu deinen Angaben.");
    expect(a.aussage).toBe("Basis: Website, Google-Unternehmensprofil und Verzeichnisse. Kein Fokus-Kanal.");
  });

  it("sagt, wenn Fähigkeiten, Zeit und Ziel keinen weiteren Kanal zulassen", () => {
    const keiner = werte(mit(KELLER, { zeit: 1, faehigkeiten: ["gestaltung"], heute: [] }));
    expect(keiner.fokusLeer).toBe("Mit deinen Fähigkeiten, deiner Zeit und deinem Ziel ist kein weiterer Kanal möglich.");
    const fach = werte({ typ: "kmu", ziel: "fachkraefte", kundschaft: "privat", suche: "aktiv", gebiet: "ort", zeit: 1, faehigkeiten: ["text"], heute: [] });
    expect(fach.fokus).toEqual([]);
    expect(fach.fokusLeer).toBe("Mit deinen Fähigkeiten, deiner Zeit und deinem Ziel ist kein weiterer Kanal möglich.");
  });

  it("macht einen Kanal, der zum Ziel nichts beiträgt, nie zu Fokus oder Ergänzung", () => {
    // Ziel Fachkräfte: Verzeichnisse haben keinen Beitrag, obwohl Kundschaft, Suchverhalten und Gebiet passen
    const a = werte({ typ: "kmu", ziel: "fachkraefte", kundschaft: "privat", suche: "aktiv", gebiet: "ort", zeit: 4, faehigkeiten: ALLE, heute: [] });
    const v = a.kanaele.find((k) => k.key === "verzeichnisse");
    expect(v?.eignung).toBeGreaterThanOrEqual(SCHWELLE_FOKUS);
    expect(v?.rolle).toBe("vorerst");
    expect(v?.grund).toBe(KEIN_BEITRAG_ZUM_ZIEL);
    for (const k of [...a.fokus, ...a.ergaenzung]) expect(teilwerte(kanalOf(k.key), a.input).ziel).toBeGreaterThan(0);
    expect(moeglich(kanalOf("verzeichnisse"), a.input)).toBe(false);
    expect(moeglich(kanalOf("linkedin"), a.input)).toBe(true);
  });

  it("lässt bei Gleichstand den Kanal gewinnen, den die Person heute schon bespielt", () => {
    const ohne = werte(GLEICHSTAND);
    const wa = ohne.kanaele.find((k) => k.key === "whatsapp");
    const ig = ohne.kanaele.find((k) => k.key === "instagram");
    expect(wa?.eignung).toBe(ig?.eignung);
    expect(keys(ohne.fokus)).toEqual(["whatsapp"]); // feste Reihenfolge: WhatsApp steht vor Instagram
    const mitInstagram = werte(mit(GLEICHSTAND, { heute: ["instagram"] }));
    expect(keys(mitInstagram.fokus)).toEqual(["instagram"]);
    expect(rolleOf(mitInstagram, "whatsapp")).toBe("vorerst");
    const mitBeiden = werte(mit(GLEICHSTAND, { heute: ["instagram", "whatsapp"] }));
    expect(keys(mitBeiden.fokus)).toEqual(["whatsapp"]);
  });

  it("vergleicht erst nach Eignung, dann nach «heute aktiv», dann nach der festen Reihenfolge", () => {
    const z = (wert: number, aktiv: boolean, index: number) => ({ wert, aktiv, index });
    const sorted = [z(60, false, 1), z(70, false, 5), z(60, true, 8), z(60, false, 0)].sort(vergleiche);
    expect(sorted.map((x) => [x.wert, x.aktiv, x.index])).toEqual([
      [70, false, 5],
      [60, true, 8],
      [60, false, 0],
      [60, false, 1],
    ]);
  });

  it("ordnet «Vorerst nicht» zuerst nach möglichen, dann nach ausgeschlossenen Kanälen", () => {
    const a = werte(KELLER);
    const grenze = a.vorerst.findIndex((k) => !moeglich(kanalOf(k.key), a.input));
    expect(grenze).toBeGreaterThan(0);
    expect(a.vorerst.slice(0, grenze).every((k) => moeglich(kanalOf(k.key), a.input))).toBe(true);
    expect(a.vorerst.slice(grenze).every((k) => !moeglich(kanalOf(k.key), a.input))).toBe(true);
  });

  it("nennt die Gründe, wenn Fokus oder Ergänzungen schon besetzt sind", () => {
    const eins = werte(mit(FC_TROGEN, { zeit: 2, faehigkeiten: ALLE }));
    const gut = eins.vorerst.filter((k) => k.passung === "gut" && moeglich(kanalOf(k.key), eins.input));
    expect(gut.length).toBeGreaterThan(0);
    expect(gut[0].grund).toBe("Dieser Kanal passt gut, aber deine Zeit reicht für einen Fokus-Kanal, und der ist schon besetzt.");
    const zwei = werte(mit(FC_TROGEN, { zeit: 3, faehigkeiten: ALLE, ziel: "anlaesse", gebiet: "region" }));
    const gut2 = zwei.vorerst.filter((k) => k.passung === "gut" && moeglich(kanalOf(k.key), zwei.input));
    for (const k of gut2) expect(k.grund).toBe("Dieser Kanal passt gut, aber deine Zeit reicht für zwei Fokus-Kanäle, und die sind schon besetzt.");
    const vier = werte(mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, ziel: "anlaesse", gebiet: "region" }));
    const rest = vier.vorerst.filter((k) => k.passung !== "wenig" && moeglich(kanalOf(k.key), vier.input));
    for (const k of rest) expect(k.grund).toMatch(/Ergänzungen sind (aber )?schon besetzt/);
  });

  it("zeigt «Das kannst du pausieren» nur für heute aktive Kanäle mit der Rolle «Vorerst nicht»", () => {
    const a = werte(KELLER);
    expect(keys(a.pausieren)).toEqual(["facebook"]);
    const mehr = werte(mit(KELLER, { heute: ["facebook", "instagram", "tiktok", "whatsapp", "website"] }));
    expect(keys(mehr.pausieren).sort()).toEqual(["facebook", "instagram", "tiktok"]);
    expect(werte(mit(KELLER, { heute: [] })).pausieren).toEqual([]);
    expect(werte(mit(KELLER, { heute: ["website", "whatsapp"] })).pausieren).toEqual([]);
  });

  it("macht aus dem Beispiel Malerei Keller die erwartete Aussage", () => {
    const a = werte(KELLER);
    expect(a.aussage).toBe("Basis: Website, Google-Unternehmensprofil und Verzeichnisse. Fokus: WhatsApp.");
    expect(keys(a.vorerst)).toEqual(["facebook", "instagram", "linkedin", "youtube", "newsletter", "tiktok"]);
    expect(a.fokusLeer).toBeNull();
  });
});

// ---- Verein ------------------------------------------------------------------------------------

describe("Kanalstrategie: Verein statt Betrieb", () => {
  it("braucht andere Begriffe", () => {
    expect(begriffe("verein")).toMatchObject({ verein: true, einrichtung: "Verein", zielgruppe: "deine Zielgruppe", anfragen: "Anfragen und Anmeldungen" });
    expect(begriffe("kmu")).toMatchObject({ verein: false, einrichtung: "Betrieb", zielgruppe: "deine Kundschaft", anfragen: "Anfragen" });
    expect(KUNDSCHAFT_LABEL.verein).toEqual({ privat: "Mitglieder und Publikum", firmen: "Firmen und Sponsoren", beides: "Beides" });
    expect(KUNDSCHAFT_LABEL.kmu).toEqual({ privat: "Privatpersonen", firmen: "Firmen", beides: "Beides" });
  });

  it("schreibt für Vereine weder «Betrieb» noch «Kundschaft» in die Texte", () => {
    for (const input of [FC_TROGEN, mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, kundschaft: "beides", heute: ["tiktok", "linkedin"] }), mit(FC_TROGEN, { faehigkeiten: [] })]) {
      const text = alleTexte(werte(input)).join("\n");
      expect(text, "Betrieb").not.toMatch(/Betrieb/);
      expect(text, "Kundschaft").not.toMatch(/Kundschaft/);
      expect(text, "Kunden").not.toMatch(/Kunden/);
    }
    const doc = toDocument(werte(FC_TROGEN), { firma: "FC Trogen", branche: "Fussball" });
    expect(blockText(doc.blocks).join("\n")).toContain("Verein: FC Trogen".replace("Verein: ", "")); // Name steht im Überblick
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items.map((f) => f.label)).toEqual(expect.arrayContaining(["Verein", "Tätigkeit", "Zielgruppe"]));
  });

  it("verwendet für Vereine Anmeldungen, Mitglieder und das Vereinsverzeichnis", () => {
    const a = werte(FC_TROGEN);
    expect(a.hinweise[2]).toContain("Anfragen und Anmeldungen");
    expect(a.basis.find((k) => k.key === "verzeichnisse")?.schritt).toContain("Vereinsverzeichnis");
    expect(a.kanaele.find((k) => k.key === "instagram")?.begruendung).toContain("Mitglieder und Publikum");
    const doc = toDocument(a, { firma: "FC Trogen", branche: "Fussball" });
    expect(blockText(doc.blocks).join("\n")).toContain("Anfragen und Anmeldungen");
    expect(werte(KELLER).hinweise[2]).not.toContain("Anmeldungen");
  });

  it("wählt für Vereine das Ziel aus den Vereinszielen und wertet Mitglieder als Kundschaft", () => {
    const a = werte(FC_TROGEN);
    expect(keys(a.basis)).toEqual(["website", "verzeichnisse"]);
    expect(keys(a.fokus)).toEqual(["instagram"]);
    expect(a.kanaele.find((k) => k.key === "instagram")?.begruendung).toContain("«Mitglieder gewinnen»");
  });

  it("verwirft ein Ziel, das nicht zum Typ passt", () => {
    expect(mitTyp({ ...KELLER, ziel: "anfragen" }, "verein").ziel).toBe("");
    expect(mitTyp({ ...KELLER, ziel: "anfragen" }, "kmu").ziel).toBe("anfragen");
    expect(mitTyp({ ...FC_TROGEN, ziel: "sponsoren" }, "kmu").ziel).toBe("");
    expect(mitTyp({ ...FC_TROGEN, ziel: "sponsoren" }, "verein")).toMatchObject({ typ: "verein", ziel: "sponsoren" });
    expect(auswerten({ ...KELLER, typ: "verein" })).toBeNull();
  });
});

// ---- Links -------------------------------------------------------------------------------------

describe("Kanalstrategie: Links auf andere Werkzeuge", () => {
  const toolsDir = path.join(process.cwd(), "tools");
  const alle = [...new Map(Object.values(KANAL_LINKS).flatMap((l) => [...l]).map((l) => [l.slug, l])).values()];

  it("verweist nur auf vorhandene tools-Ordner mit dem richtigen Namen", () => {
    expect(alle.length).toBeGreaterThanOrEqual(9);
    for (const l of alle) {
      const dir = path.join(toolsDir, l.slug);
      expect(fs.existsSync(dir), l.slug).toBe(true);
      const config = fs.readFileSync(path.join(dir, "tool.config.ts"), "utf8");
      expect(config, l.slug).toContain(`slug: "${l.slug}"`);
      expect(/\bname:\s*"([^"]+)"/.exec(config)?.[1], l.slug).toBe(l.name);
    }
  });

  it("verlinkt die Kanäle wie in der Spec", () => {
    const slugs = (key: KanalKey) => KANAL_LINKS[key].map((l) => l.slug);
    expect(slugs("gbp")).toEqual(["bewertungs-kit", "gbp-feiertage"]);
    expect(slugs("whatsapp")).toEqual(["whatsapp-link", "qr-set"]);
    expect(slugs("website")).toEqual(["digitaler-auftritt-check"]);
    expect(slugs("newsletter")).toEqual(["newsletter-check"]);
    for (const key of ["instagram", "facebook", "linkedin"] as const) expect(slugs(key)).toEqual(expect.arrayContaining(["content-saeulen", "posting-plan"]));
    expect(slugs("linkedin")).toContain("linkedin-profil");
  });

  it("gibt Basis-, Fokus- und Ergänzungs-Kanälen einen Schritt, «Vorerst nicht» keinen", () => {
    const a = werte(mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, gebiet: "region", ziel: "anlaesse" }));
    for (const k of [...a.basis, ...a.fokus, ...a.ergaenzung]) {
      expect(k.schritt.length, k.key).toBeGreaterThan(30);
      expect(k.links.map((l) => l.slug), k.key).toEqual(KANAL_LINKS[k.key].map((l) => l.slug));
    }
    for (const k of a.vorerst) {
      expect(k.schritt).toBe("");
      expect(k.links).toEqual([]);
    }
    expect(a.basis.find((k) => k.key === "website")?.links.map((l) => l.slug)).toEqual(["digitaler-auftritt-check"]);
  });

  it("unterscheidet den Schritt für einen neuen und einen schon aktiven Kanal", () => {
    const neu = werte(mit(KELLER, { heute: [] })).basis.find((k) => k.key === "gbp")?.schritt;
    const aktiv = werte(mit(KELLER, { heute: ["gbp"] })).basis.find((k) => k.key === "gbp")?.schritt;
    expect(neu).toContain("Lege dein Google-Unternehmensprofil an");
    expect(aktiv).toContain("Prüfe Öffnungszeiten");
    expect(neu).not.toBe(aktiv);
  });
});

// ---- Texte: Ziffern, Sperrliste ----------------------------------------------------------------

describe("Kanalstrategie: erzeugte Texte", () => {
  const proben = (): Auswertung[] => {
    const out: Auswertung[] = [];
    for (const zl of ZIELE)
      for (const kundschaft of KUNDSCHAFT_KEYS)
        for (const suche of SUCHE_KEYS)
          for (const gebiet of GEBIET_KEYS)
            for (const zeit of [1, 2, 3, 4] as const)
              for (const faehigkeiten of [[], ALLE] as FaehigkeitKey[][])
                out.push(werte({ typ: zl.typ, ziel: zl.key, kundschaft, suche, gebiet, zeit, faehigkeiten, heute: zeit % 2 === 0 ? [...KANAL_KEYS] : [] }));
    return out;
  };

  it("enthält keine Ziffer ausser «Monat 1 bis 3» und kein Prozentzeichen", () => {
    for (const a of proben()) {
      const text = alleTexte(a).join("\n").replace(/Monat [123]/g, "Monat");
      expect(text).not.toMatch(/\d/);
      expect(text).not.toContain("%");
    }
  });

  it("zeigt die Passung nur als Wort", () => {
    const a = werte(KELLER);
    expect(new Set(a.kanaele.map((k) => k.passungText))).toEqual(new Set(["passt gut", "passt teilweise", "passt wenig"]));
    expect(a.kanaele.every((k) => !/\d/.test(k.passungText))).toBe(true);
  });

  it("enthält keine Wörter der Sperrliste und keine verbotenen Zeichen", () => {
    for (const a of proben()) {
      const text = alleTexte(a).join("\n") + "\n" + toMarkdown(toDocument(a, KONTEXT));
      expect(brandHits(text).filter((h) => h.level === "hart")).toEqual([]);
      expect(text).not.toMatch(/!|—|ß|jetzt|nur noch|garantiert|Nr\. ?1/i);
      expect(text).not.toMatch(/["“”„]/);
    }
  });

  it("nennt den Richtwert und die Grenze des Werkzeugs", () => {
    const text = alleTexte(werte(KELLER)).join("\n");
    expect(text).toContain(RICHTWERT_NOTE);
    expect(text).toContain(GRENZE_NOTE);
    expect(GRENZE_NOTE).toBe("Das Werkzeug sagt dir, was zu deinen Angaben passt, nicht, was auf einer Plattform gerade am meisten Reichweite bringt.");
    expect(rechnungFor("kmu").join(" ")).toContain(RICHTWERT_NOTE);
    expect(rechnungFor("kmu").join(" ")).toContain("Kundschaft");
    expect(rechnungFor("verein").join(" ")).not.toContain("Kundschaft");
  });
});

// ---- Hinweise und Plan -------------------------------------------------------------------------

describe("Kanalstrategie: Hinweise und 90-Tage-Plan", () => {
  it("gibt immer genau drei Hinweise", () => {
    for (const input of [KELLER, FC_TROGEN, mit(KELLER, { faehigkeiten: [], zeit: 1 }), mit(KELLER, { zeit: 4, suche: "wecken" })]) {
      expect(werte(input).hinweise).toHaveLength(3);
    }
  });

  it("rät bei wenig Zeit zu einem Kanal richtig", () => {
    for (const zeit of [1, 2] as const) expect(werte(mit(KELLER, { zeit })).hinweise[0]).toContain("Ein Kanal richtig ist besser als drei halb");
    for (const zeit of [3, 4] as const) expect(werte(mit(KELLER, { zeit })).hinweise[0]).toContain("einen Kanal nach dem anderen");
  });

  it("weist ohne Fähigkeit auf die Basis-Kanäle hin und nennt sonst die Fähigkeiten", () => {
    expect(werte(mit(KELLER, { faehigkeiten: [] })).hinweise[1]).toContain("bleibt es bei den Basis-Kanälen");
    expect(werte(KELLER).hinweise[1]).toContain("Deine Fähigkeiten (Text, Foto)");
  });

  it("warnt bei «Aufmerksamkeit wecken» ohne Foto- oder Video-Fähigkeit", () => {
    const warnung = "Wer erst Aufmerksamkeit wecken muss, braucht meist Bilder oder Videos";
    expect(werte(mit(KELLER, { suche: "wecken", faehigkeiten: ["text"] })).hinweise[2]).toContain(warnung);
    expect(werte(mit(KELLER, { suche: "beides", faehigkeiten: [] })).hinweise[2]).toContain(warnung);
    expect(werte(mit(KELLER, { suche: "wecken", faehigkeiten: ["foto"] })).hinweise[2]).not.toContain(warnung);
    expect(werte(mit(KELLER, { suche: "wecken", faehigkeiten: ["video"] })).hinweise[2]).not.toContain(warnung);
    expect(werte(mit(KELLER, { suche: "aktiv", faehigkeiten: ["text"] })).hinweise[2]).not.toContain(warnung);
    expect(hinweiseFor(geprueft(KELLER) as Geprueft)).toEqual(werte(KELLER).hinweise);
  });

  it("legt Basis in Monat 1, Fokus in Monat 2 und «Prüfen und anpassen» in Monat 3", () => {
    const a = werte(KELLER);
    expect(a.monate.map((m) => m.nr)).toEqual([1, 2, 3]);
    expect(a.monate[0].titel).toBe("Basis aufbauen");
    expect(a.monate[0].punkte.map((p) => p.kanal)).toEqual(["Website", "Google-Unternehmensprofil", "Verzeichnisse"]);
    expect(a.monate[1].titel).toBe("Fokus");
    expect(a.monate[1].text).toBe("Konzentriere dich auf deinen Fokus-Kanal.");
    expect(a.monate[1].punkte.map((p) => p.kanal)).toEqual(["WhatsApp"]);
    expect(a.monate[2].titel).toBe("Prüfen und anpassen");
    expect(a.monate[2].punkte).toEqual([]);
    for (const m of a.monate) for (const p of m.punkte) expect(p.aufgabe.length).toBeGreaterThan(10);
  });

  it("legt die Ergänzung in Monat 3, wenn es eine gibt, und spricht dann von mehreren Fokus-Kanälen", () => {
    const a = werte(mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, gebiet: "region", ziel: "anlaesse" }));
    expect(a.ergaenzung.length).toBeGreaterThan(0);
    expect(a.monate[2].titel).toBe("Ergänzung");
    expect(a.monate[2].punkte.map((p) => p.kanal)).toEqual(a.ergaenzung.map((k) => k.label));
    expect(a.fokus).toHaveLength(2);
    expect(a.monate[1].text).toBe("Konzentriere dich auf deine Fokus-Kanäle.");
  });
});

// ---- Dokument ----------------------------------------------------------------------------------

describe("Kanalstrategie: Dokument", () => {
  const überschriften = (blocks: DocBlock[], level: 1 | 2 = 1) => blocks.filter((b) => b.type === "heading" && b.level === level).map((b) => (b.type === "heading" ? b.text : ""));

  it("baut Kopf, Überblick, Tabelle, Rollen, Pausieren, Plan, Hinweise und Annahmen in dieser Reihenfolge", () => {
    const doc = toDocument(werte(KELLER), KONTEXT);
    expect(doc.title).toBe("Kanalstrategie");
    expect(doc.subtitle).toBe("Fokus: WhatsApp");
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.filename).toBe("kanalstrategie-malerei-keller-gossau");
    expect(überschriften(doc.blocks)).toEqual([
      "Überblick",
      "Das Ergebnis in Kürze",
      "Alle Kanäle im Überblick",
      "Basis",
      "Fokus",
      "Vorerst nicht",
      PAUSIEREN_TITEL,
      "Die nächsten drei Monate",
      "Hinweise",
      "So ist gerechnet",
    ]);
    expect(überschriften(doc.blocks, 2)).toEqual(["Monat 1: Basis aufbauen", "Monat 2: Fokus", "Monat 3: Prüfen und anpassen"]);
  });

  it("zeigt im Überblick Ziel, Kundschaft, Suchverhalten, Gebiet, Zeit, Fähigkeiten und heutige Kanäle", () => {
    const doc = toDocument(werte(KELLER), KONTEXT);
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items).toEqual([
      { label: "Betrieb", value: "Malerei Keller, Gossau" },
      { label: "Branche", value: "Malerei" },
      { label: "Ziel", value: "Anfragen und Aufträge" },
      { label: "Kundschaft", value: "Privatpersonen" },
      { label: "Suchverhalten", value: "Ja, sie suchen, wenn sie etwas brauchen" },
      { label: "Einzugsgebiet", value: "Meine Region oder mein Kanton" },
      { label: "Zeit pro Woche", value: "zwei bis drei Stunden" },
      { label: "Fähigkeiten", value: "Text, Foto" },
      { label: "Heute aktiv", value: "Website, Facebook" },
    ]);
  });

  it("enthält eine Tabelle Kanal, Rolle, Passung, Begründung mit allen zehn Kanälen", () => {
    const doc = toDocument(werte(KELLER), KONTEXT);
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type !== "table") return;
    expect(table.header).toEqual(["Kanal", "Rolle", "Passung", "Begründung"]);
    expect(table.rows).toHaveLength(10);
    expect(table.rows[0]).toEqual(["Website", "Basis", "passt gut", expect.stringContaining("Grundlage")]);
    expect(table.rows[3][0]).toBe("WhatsApp");
    expect(table.rows[3][1]).toBe("Fokus");
    expect(table.rows.every((r) => r.length === 4 && r.every((c) => c.length > 0))).toBe(true);
    expect(table.widths).toHaveLength(4);
  });

  it("schreibt «Das kannst du pausieren» mit einem Satz je Kanal und der Aufforderung zur Prüfung", () => {
    const doc = toDocument(werte(KELLER), KONTEXT);
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === PAUSIEREN_TITEL);
    const liste = doc.blocks[i + 1];
    const hinweis = doc.blocks[i + 2];
    expect(liste.type === "list" && liste.items).toEqual(["Facebook: Du bist heute dort aktiv. Dieser Kanal passt nur teilweise, für den Fokus reicht es nicht."]);
    expect(hinweis.type === "paragraph" && hinweis.text).toContain("Prüfe vor dem Pausieren, ob über diesen Kanal Anfragen kommen");
    expect(hinweis.type === "paragraph" && hinweis.text).toContain("nicht, dass er nichts bringt");
  });

  it("lässt «Das kannst du pausieren» weg, wenn kein heutiger Kanal betroffen ist", () => {
    const doc = toDocument(werte(mit(KELLER, { heute: [] })), KONTEXT);
    expect(überschriften(doc.blocks)).not.toContain(PAUSIEREN_TITEL);
  });

  it("nennt statt des Fokus den Grund, wenn es keinen gibt, und führt Ergänzungen nur bei Zeitstufe 4", () => {
    const ohne = toDocument(werte(mit(KELLER, { faehigkeiten: [] })), KONTEXT);
    const i = ohne.blocks.findIndex((b) => b.type === "heading" && b.text === "Fokus");
    const absatz = ohne.blocks[i + 1];
    expect(absatz.type === "paragraph" && absatz.text).toBe("Du hast keine Fähigkeit angegeben. Darum bleibt es bei den Basis-Kanälen.");
    expect(ohne.subtitle).toBe("Basis: Website, Google-Unternehmensprofil und Verzeichnisse");
    expect(überschriften(ohne.blocks)).not.toContain("Ergänzung");
    const mitErg = toDocument(werte(mit(FC_TROGEN, { zeit: 4, faehigkeiten: ALLE, gebiet: "region", ziel: "anlaesse" })), { firma: "FC Trogen", branche: "" });
    expect(überschriften(mitErg.blocks)).toContain("Ergänzung");
  });

  it("nimmt die Werkzeug-Links mit Adresse in die Abschnitte auf", () => {
    const text = blockText(toDocument(werte(KELLER), KONTEXT).blocks).join("\n");
    expect(text).toContain("Bewertungs-Kit für Google (tools.alperna.ch/tools/bewertungs-kit)");
    expect(text).toContain("WhatsApp-Link mit QR (tools.alperna.ch/tools/whatsapp-link)");
  });

  it("lässt die Branche weg, wenn sie fehlt, und nennt ohne Firma «keine Angabe»", () => {
    const doc = toDocument(werte(KELLER), { firma: "", branche: "" });
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items.map((f) => f.label)).not.toContain("Branche");
    expect(facts?.type === "facts" && facts.items[0]).toEqual({ label: "Betrieb", value: "keine Angabe" });
    expect(doc.firma).toBeUndefined();
    expect(doc.filename).toBe("kanalstrategie-betrieb");
    expect(toDocument(werte(FC_TROGEN), { firma: "", branche: "" }).filename).toBe("kanalstrategie-verein");
  });

  it("macht aus dem Dokument ein Markdown ohne Platzhalter", () => {
    const md = ausgabeText(werte(KELLER), KONTEXT);
    expect(md.startsWith("# Kanalstrategie\n\n_Fokus: WhatsApp_")).toBe(true);
    expect(md).toContain("| Kanal | Rolle | Passung | Begründung |");
    expect(md).not.toMatch(/undefined|NaN|\[object/);
    expect(md.includes("TO" + "DO")).toBe(false);
    expect(md).toBe(toMarkdown(toDocument(werte(KELLER), KONTEXT)));
  });
});

// ---- Eingabe fürs CRM --------------------------------------------------------------------------

describe("Kanalstrategie: Angaben und Ergebnis fürs CRM", () => {
  it("schreibt die Angaben je Zeile in Klartext", () => {
    const a = werte(KELLER);
    expect(eingabeText(a.input, KONTEXT).split("\n")).toEqual([
      "Betrieb: Malerei Keller, Gossau",
      "Branche: Malerei",
      "Ziel: Anfragen und Aufträge",
      "Kundschaft: Privatpersonen",
      "Suchverhalten: Ja, sie suchen, wenn sie etwas brauchen",
      "Einzugsgebiet: Meine Region oder mein Kanton",
      "Zeit pro Woche: 2 bis 3 Stunden",
      "Fähigkeiten: Text, Foto",
      "Heute aktiv: Website, Facebook",
    ]);
  });

  it("schreibt bei Vereinen «Verein», «Tätigkeit» und «Zielgruppe» und bei leeren Listen «keine»", () => {
    const a = werte(mit(FC_TROGEN, { faehigkeiten: [], heute: [] }));
    const text = eingabeText(a.input, { firma: "FC Trogen", branche: "Fussball" });
    expect(text.split("\n")[0]).toBe("Verein: FC Trogen");
    expect(text).toContain("Tätigkeit: Fussball");
    expect(text).toContain("Zielgruppe: Mitglieder und Publikum");
    expect(text).toContain("Fähigkeiten: keine");
    expect(text).toContain("Heute aktiv: keine");
  });

  it("enthält weder JSON noch Platzhalter und bleibt kurz genug, dass die Aussage im Anfang steht", () => {
    const a = werte(KELLER);
    const ein = eingabeText(a.input, KONTEXT);
    const aus = ausgabeText(a, KONTEXT);
    expect(ein).not.toMatch(/[{}]|undefined|NaN/);
    expect(aus).not.toMatch(/[{}]|undefined|NaN/);
    expect(ein.length).toBeLessThan(1900);
    expect(aus.indexOf("Basis: Website")).toBeLessThan(900);
    expect(aus.indexOf("Fokus: WhatsApp")).toBeLessThan(900);
  });
});

// ---- Profil ------------------------------------------------------------------------------------

describe("Kanalstrategie: Profil", () => {
  it("bildet Kanäle aus dem Profil per Wortvergleich auf die Liste ab und ignoriert Unbekanntes", () => {
    expect(heuteAusProfil([{ name: "Instagram" }, { name: "website" }, { name: "TikTok" }])).toEqual(["website", "instagram", "tiktok"]);
    expect(heuteAusProfil([{ name: "Google Unternehmensprofil" }, { name: "WhatsApp Business" }, { name: "E-Mail-Newsletter" }, { name: "Facebook-Seite" }])).toEqual([
      "gbp",
      "whatsapp",
      "facebook",
      "newsletter",
    ]);
    expect(heuteAusProfil([{ name: "local.ch" }, { name: "YouTube-Kanal" }, { name: "LinkedIn" }])).toEqual(["verzeichnisse", "linkedin", "youtube"]);
    expect(heuteAusProfil([{ name: "Google Ads" }, { name: "Pinterest" }, { name: "Telefon" }])).toEqual([]);
  });

  it("liest auch den Schlüssel «kanal», lässt Doppel weg und übersteht kaputte Einträge", () => {
    expect(heuteAusProfil([{ kanal: "Instagram" }, { name: "Instagram" }, { name: "" }, { name: 5 }, null, "Facebook", [], {}])).toEqual(["instagram"]);
    expect(heuteAusProfil(undefined)).toEqual([]);
    expect(heuteAusProfil([])).toEqual([]);
  });

  it("nimmt die Wahl der Person vor dem Vorschlag aus dem Profil", () => {
    const profil = { kanaele: [{ name: "Instagram" }] };
    expect(heuteOf({ heute: null }, profil)).toEqual(["instagram"]);
    expect(heuteOf({ heute: ["facebook"] }, profil)).toEqual(["facebook"]);
    expect(heuteOf({ heute: [] }, profil)).toEqual([]);
    expect(heuteOf({ heute: null }, {})).toEqual([]);
  });

  it("schreibt Basis und Fokus als Kanäle ins Profil, aber nur in ein leeres Feld", () => {
    const a = werte(KELLER);
    expect(profilePatch({}, a)).toEqual({
      kanaele: [
        { name: "Website", url: "" },
        { name: "Google-Unternehmensprofil", url: "" },
        { name: "Verzeichnisse", url: "" },
        { name: "WhatsApp", url: "" },
      ],
    });
    expect(profilePatch({ kanaele: [] }, a)).toHaveProperty("kanaele");
    expect(profilePatch({ kanaele: [{ name: "Instagram" }] }, a)).toEqual({});
  });
});

// ---- Eingabe und Prüfung -----------------------------------------------------------------------

describe("Kanalstrategie: Prüfung der Angaben", () => {
  it("meldet die fehlenden Angaben der Reihe nach", () => {
    let input = emptyInput();
    expect(validate("", input)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: FIELD_IDS.firma });
    expect(validate("   ", input)?.fieldId).toBe(FIELD_IDS.firma);
    expect(validate("Keller", input)).toEqual({ message: "Wähle, was dein Auftritt zuerst erreichen soll.", fieldId: FIELD_IDS.ziel });
    input = mit(input, { ziel: "anfragen" });
    expect(validate("Keller", input)).toEqual({ message: "Wähle, wen du erreichen willst.", fieldId: FIELD_IDS.kundschaft });
    input = mit(input, { kundschaft: "privat" });
    expect(validate("Keller", input)).toEqual({ message: "Wähle, ob die Leute aktiv nach dir suchen.", fieldId: FIELD_IDS.suche });
    input = mit(input, { suche: "aktiv" });
    expect(validate("Keller", input)).toEqual({ message: "Wähle dein Einzugsgebiet.", fieldId: FIELD_IDS.gebiet });
    input = mit(input, { gebiet: "ort" });
    expect(validate("Keller", input)).toEqual({ message: "Wähle, wie viel Zeit du pro Woche hast.", fieldId: FIELD_IDS.zeit });
    input = mit(input, { zeit: 1 });
    expect(validate("Keller", input)).toBeNull();
  });

  it("verlangt bei Vereinen den Namen des Vereins und ein Vereinsziel", () => {
    expect(validate("", emptyInput("verein"))?.message).toBe("Gib den Namen deines Vereins an.");
    expect(validate("FC Trogen", mit(FC_TROGEN, { ziel: "anfragen" }))?.fieldId).toBe(FIELD_IDS.ziel);
    expect(validate("FC Trogen", FC_TROGEN)).toBeNull();
  });

  it("lässt Fähigkeiten und heutige Kanäle leer zu", () => {
    expect(validate("Keller", mit(KELLER, { faehigkeiten: [], heute: [] }))).toBeNull();
    expect(validate("Keller", mit(KELLER, { heute: null }))).toBeNull();
  });

  it("zählt die Pflichtangaben", () => {
    expect(PFLICHTANGABEN).toBe(6);
    expect(angaben("", emptyInput())).toBe(0);
    expect(angaben("Keller", emptyInput())).toBe(1);
    expect(angaben("Keller", KELLER)).toBe(6);
    expect(angaben("Keller", mit(KELLER, { ziel: "mitglieder" }))).toBe(5); // Ziel passt nicht zum Typ
  });

  it("liefert für unvollständige Angaben kein Ergebnis", () => {
    expect(auswerten(emptyInput())).toBeNull();
    expect(auswerten(mit(KELLER, { zeit: 0 }))).toBeNull();
    expect(auswerten(mit(KELLER, { gebiet: "" }))).toBeNull();
    expect(geprueft(mit(KELLER, { heute: null }))?.heute).toEqual([]);
  });
});

// ---- Gespeicherter Stand -----------------------------------------------------------------------

describe("Kanalstrategie: parseState", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "kaputt", 5, [], {}, { v: 2 }, { v: 1, phase: "result" }, { v: "1" }]) {
      const s = parseState(raw);
      expect(s.phase, JSON.stringify(raw)).toBe("edit");
      expect(s.input).toEqual(emptyInput());
      expect(s.output).toBeUndefined();
    }
    expect(parseState(null)).toEqual(EMPTY_STATE);
  });

  it("liest eine gespeicherte Eingabe und wirft Ungültiges weg", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      input: { typ: "verein", ziel: "anfragen", kundschaft: "firmen", suche: "ja", gebiet: "region", zeit: 7, faehigkeiten: ["video", "tanzen", "text", "text"], heute: ["facebook", "pinterest", 4, "facebook"] },
    });
    expect(s.input).toEqual({ typ: "verein", ziel: "", kundschaft: "firmen", suche: "", gebiet: "region", zeit: 0, faehigkeiten: ["text", "video"], heute: ["facebook"] });
    expect(parseState({ v: 1, input: { heute: "website" } }).input.heute).toBeNull();
    expect(parseState({ v: 1, input: { heute: [] } }).input.heute).toEqual([]);
  });

  it("berechnet das Ergebnis beim Lesen neu und ignoriert einen gespeicherten Wert", () => {
    const s = parseState({ v: 1, phase: "result", input: KELLER, output: { basis: ["tiktok"], fokus: ["tiktok"], ergaenzung: [], vorerst: [] } });
    expect(s.phase).toBe("result");
    expect(s.output).toEqual({
      basis: ["website", "gbp", "verzeichnisse"],
      fokus: ["whatsapp"],
      ergaenzung: [],
      vorerst: ["facebook", "instagram", "linkedin", "youtube", "newsletter", "tiktok"],
    });
    expect(s.output).toEqual(kurzergebnis(werte(KELLER)));
    expect(s.input).toEqual(KELLER);
  });

  it("fällt auf «edit» zurück, wenn ein Ergebnis gespeichert ist, aber Angaben fehlen", () => {
    const s = parseState({ v: 1, phase: "result", input: { ...KELLER, zeit: 0 } });
    expect(s.phase).toBe("edit");
    expect(s.output).toBeUndefined();
    expect(s.input.ziel).toBe("anfragen");
  });

  it("friert fehlende heutige Kanäle beim Ergebnis als leere Liste ein", () => {
    const s = parseState({ v: 1, phase: "result", input: { ...KELLER, heute: null } });
    expect(s.phase).toBe("result");
    expect(s.input.heute).toEqual([]);
  });

  it("erkennt der Pfad-Fortschritt als erledigt: Phase «result» im gespeicherten Stand", () => {
    const stand = parseState({ v: 1, phase: "result", input: KELLER });
    expect(JSON.parse(JSON.stringify(stand))).toMatchObject({ v: 1, phase: "result" });
    expect(typeof stand.output).toBe("object");
  });
});

// ---- Seitentext --------------------------------------------------------------------------------

describe("Kanalstrategie: Seitentext und Konfiguration", () => {
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "tools", "kanalstrategie.md"), "utf8");
  const { data, content } = matter(raw);
  const beispiel = (content.split(/^## /m).find((s) => s.startsWith("Beispiel")) ?? "").replace(/[>*]/g, "");

  it("hält das Beispiel Malerei Keller gegen die Rechnung", () => {
    const a = werte(KELLER);
    const fokus = a.fokus[0];
    const pause = a.pausieren[0];
    const vorerst = a.vorerst.filter((k) => k !== pause);
    expect(beispiel).toContain("Malerei Keller, Gossau");
    expect(beispiel).toContain(ZEITEN[1].worte);
    expect(beispiel).toContain(`Heute aktiv: ${listText(KELLER.heute!.map((k) => kanalOf(k).label))}.`);
    expect(beispiel).toContain(`Basis: ${listText(a.basis.map((k) => k.label))}.`);
    expect(beispiel).toContain(`Fokus: ${fokus.label}, ${fokus.passungText}. Erster Schritt: ${fokus.schritt}`);
    expect(beispiel).toContain(`Das kannst du pausieren: ${pause.label}. ${pause.grund} Prüfe zuerst, ob dort Anfragen herkommen.`);
    expect(beispiel).toContain(`Vorerst nicht: ${listText(vorerst.map((k) => k.label))}.`);
    expect(beispiel).toContain("Für Newsletter reicht die Zeit nicht, für YouTube und TikTok fehlt die Fähigkeit Video.");
    expect(a.kanaele.find((k) => k.key === "newsletter")?.grund).toContain("mehr Zeit");
    expect(a.kanaele.find((k) => k.key === "youtube")?.grund).toContain("Video");
    expect(a.kanaele.find((k) => k.key === "tiktok")?.grund).toContain("Video");
    expect(beispiel).toContain(`Monat 1 ${a.monate[0].titel}, Monat 2 ${fokus.label}, Monat 3 ${a.monate[2].titel.toLowerCase()}.`);
  });

  it("stimmt in Tagline, Keyword und Verwandten mit tool.config.ts überein", () => {
    expect(data.tagline).toBe(config.tagline);
    expect(config.tagline.length).toBeLessThanOrEqual(110);
    expect(data.h1).toBe("Kanalstrategie für Schweizer KMU");
    expect(config.keyword).toBe("Kanalstrategie");
    expect(config.slug).toBe("kanalstrategie");
    expect(config.related).toEqual(["zielgruppen-segmente", "posting-plan", "kundenweg"]);
    expect(config.writesProfile).toEqual(["kanaele"]);
    expect(config.needsServer).toBe(false);
    expect(config.outputs).toEqual(["copy", "pdf", "docx"]);
    expect(config.pathStep).toEqual({ path: "strategie", order: 12 });
  });
});
