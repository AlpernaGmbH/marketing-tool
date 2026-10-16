import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";

describe("csvCell", () => {
  it("lässt einfachen Text unverändert", () => {
    expect(csvCell("Website")).toBe("Website");
    expect(csvCell("")).toBe("");
    expect(csvCell("12,5")).toBe("12,5");
  });
  it("setzt Anführungszeichen bei Semikolon, Anführungszeichen und Zeilenumbruch", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('sie sagt "ja"')).toBe('"sie sagt ""ja"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("stellt Formelanfängen ein Hochkomma voran", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+41 71 000 00 00")).toBe("'+41 71 000 00 00");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x";"y")')).toBe('"\'=HYPERLINK(""x"";""y"")"');
  });
});
