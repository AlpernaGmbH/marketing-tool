import { afterEach, describe, expect, it } from "vitest";
import { whatsappUrl } from "@/components/tool/AlpernaPitch";
import { BAUSTEIN_NAMES, parseBausteine, usable } from "@/lib/pitch";

const full = (text = "Wir pflegen dein Profil. Du hast Ruhe.", beweis = "Live in zwei Wochen.") =>
  `---\neinstiegsangebot: "Onepage zum Fixpreis"\n---\n\n` +
  BAUSTEIN_NAMES.map((n) => `## ${n}\ntext: ${text}\nbeweis: ${beweis}\n`).join("\n");

describe("usable", () => {
  it("lehnt leer und TODO ab", () => {
    expect(usable(undefined)).toBe(false);
    expect(usable("")).toBe(false);
    expect(usable("TODO zwei Sätze")).toBe(false);
    expect(usable("todo: später")).toBe(false);
    expect(usable("Wir pflegen dein Profil.")).toBe(true);
  });
});

describe("parseBausteine", () => {
  it("liest alle sechs Bausteine und das Einstiegsangebot", () => {
    const b = parseBausteine(full());
    expect(b.issues).toEqual([]);
    expect(b.open).toEqual([]);
    expect(b.items.map((i) => i.name)).toEqual([...BAUSTEIN_NAMES]);
    expect(b.einstiegsangebot).toBe("Onepage zum Fixpreis");
  });
  it("meldet fehlende Abschnitte und Felder als Strukturfehler", () => {
    const b = parseBausteine("---\neinstiegsangebot: x\n---\n## Website\ntext: a\n");
    expect(b.issues).toContain("Abschnitt «Google Ads» fehlt");
    expect(b.issues).toContain("«Website»: «beweis» fehlt");
  });
  it("trennt offene TODO-Felder von Strukturfehlern", () => {
    const b = parseBausteine(full("TODO zwei Sätze", "TODO Beweis"));
    expect(b.issues).toEqual([]);
    expect(b.open).toContain("Website.text");
    expect(b.open).toContain("Google Ads.beweis");
    expect(b.open).toHaveLength(12);
  });
});

describe("whatsappUrl", () => {
  const OLD = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  afterEach(() => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = OLD;
  });
  it("baut wa.me mit Ziffern und vorausgefülltem Text, der das Tool nennt", () => {
    const url = whatsappUrl("+41 79 123 45 67", "ICP-Builder");
    expect(url).toMatch(/^https:\/\/wa\.me\/41791234567\?text=/);
    expect(decodeURIComponent(url!.split("text=")[1])).toContain("«ICP-Builder»");
  });
  it("gibt null ohne Nummer zurück", () => {
    expect(whatsappUrl(undefined)).toBeNull();
    expect(whatsappUrl("abc")).toBeNull();
  });
});
