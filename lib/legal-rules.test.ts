import { describe, expect, it } from "vitest";
import { checkLegalFile, parseLegalMeta } from "@/lib/legal-rules";

function file(front: Record<string, string>, body = "Text"): string {
  const head = Object.entries(front)
    .map(([k, v]) => `${k}: "${v}"`)
    .join("\n");
  return `---\n${head}\n---\n\n${body}\n`;
}

const DRAFT = { titel: "T", stand: "2026-10-05", quelle: "UWG Art. 3", status: "entwurf", geprueft: "nein", geprueft_von: "", geprueft_am: "" };
const DONE = { ...DRAFT, status: "geprueft", geprueft: "ja", geprueft_von: "Lisa Muster, Rechtsanwältin", geprueft_am: "2026-10-20" };
const codes = (issues: { level: string; code: string }[], level = "error") => issues.filter((i) => i.level === level).map((i) => i.code);

describe("checkLegalFile", () => {
  it("ein Entwurf mit Vermerk ist ein Hinweis, kein Fehler", () => {
    const issues = checkLegalFile("a.md", file(DRAFT, "**ENTWURF, NICHT GEPRÜFT.**\nPRÜFEN: eins\nPRÜFEN: zwei\n[OFFEN: x]"));
    expect(codes(issues)).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "warn", code: "legal-entwurf" });
    expect(issues[0].message).toContain("2 Prüffrage(n), 1 fehlende Tatsache(n)");
  });

  it("verlangt stand, quelle, status und geprueft", () => {
    expect(codes(checkLegalFile("a.md", file({ titel: "T" })))).toEqual(["legal-stand", "legal-quelle", "legal-status", "legal-geprueft"]);
    expect(codes(checkLegalFile("a.md", file({ ...DRAFT, stand: "5.10.2026" })))).toEqual(["legal-stand"]);
  });

  it("verlangt den Entwurfs-Vermerk im Text eines Entwurfs", () => {
    expect(codes(checkLegalFile("a.md", file(DRAFT, "ohne Vermerk")))).toEqual(["legal-vermerk"]);
  });

  it("eine geprüfte Datei braucht Prüfer und Datum und darf nichts Offenes enthalten", () => {
    expect(checkLegalFile("a.md", file(DONE))).toEqual([]);
    expect(codes(checkLegalFile("a.md", file({ ...DONE, geprueft_von: "", geprueft_am: "" })))).toEqual(["legal-pruefer", "legal-pruefer"]);
    expect(codes(checkLegalFile("a.md", file(DONE, "PRÜFEN: noch offen")))).toEqual(["legal-offen"]);
    expect(codes(checkLegalFile("a.md", file(DONE, "Satz [OFFEN: Frist]")))).toEqual(["legal-fehlt"]);
    expect(codes(checkLegalFile("a.md", file(DONE, "ENTWURF, NICHT GEPRÜFT")))).toEqual(["legal-entwurf"]);
  });

  it("meldet einen Widerspruch zwischen status und geprueft", () => {
    expect(codes(checkLegalFile("a.md", file({ ...DONE, geprueft: "nein" })))).toContain("legal-widerspruch");
    expect(codes(checkLegalFile("a.md", file({ ...DONE, status: "entwurf" })))).toContain("legal-widerspruch");
  });
});

describe("parseLegalMeta", () => {
  it("gibt stand und Freigabe zurück, null bei unbrauchbarem Kopf", () => {
    expect(parseLegalMeta(file(DRAFT))).toEqual({ stand: "2026-10-05", geprueft: false });
    expect(parseLegalMeta(file(DONE))).toEqual({ stand: "2026-10-05", geprueft: true });
    expect(parseLegalMeta(file({ titel: "T" }))).toBeNull();
  });
});
