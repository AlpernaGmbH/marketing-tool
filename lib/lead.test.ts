import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayload, forwardToN8n, leadSchema } from "@/lib/lead";

const valid = { name: "Anna Keller", firma: "Malerei Keller", email: "Anna@Keller.ch", consent: true, tool: "x" };

describe("leadSchema", () => {
  it("akzeptiert ein vollständiges Formular und normalisiert die E-Mail", () => {
    const r = leadSchema.safeParse({ ...valid, telefon: "+41 71 123 45 67" });
    expect(r.success && r.data.email).toBe("anna@keller.ch");
  });
  it("verlangt Einwilligung", () => {
    expect(leadSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
  });
  it("lehnt ungültige E-Mail, zu kurzen Namen und Buchstaben im Telefon ab", () => {
    expect(leadSchema.safeParse({ ...valid, email: "keller" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, telefon: "abc" }).success).toBe(false);
  });
  it("lehnt ein ausgefülltes Honeypot-Feld ab", () => {
    expect(leadSchema.safeParse({ ...valid, honeypot: "http://spam.example" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, honeypot: "" }).success).toBe(true);
  });
});

describe("buildPayload", () => {
  it("enthält genau die erlaubten Felder", () => {
    const input = leadSchema.parse({ ...valid, honeypot: "" });
    const p = buildPayload(input, "strategie", new Date("2026-10-03T10:00:00Z"));
    expect(Object.keys(p).sort()).toEqual(
      ["email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"].sort(),
    );
    expect(p.quelle).toBe("tools.alperna.ch");
    expect(p.zeit).toBe("2026-10-03T10:00:00.000Z");
    expect(p.telefon).toBe("");
  });
});

describe("forwardToN8n", () => {
  const payload = buildPayload(leadSchema.parse(valid), "strategie");
  afterEach(() => {
    delete process.env.N8N_WEBHOOK_URL;
  });

  it("gibt false ohne N8N_WEBHOOK_URL zurück und ruft nichts auf", async () => {
    const f = vi.fn();
    expect(await forwardToN8n(payload, f as unknown as typeof fetch)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("sendet JSON per POST mit Timeout und gibt bei 200 true zurück", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/x";
    const f = vi.fn().mockResolvedValue({ ok: true });
    expect(await forwardToN8n(payload, f as unknown as typeof fetch)).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://n8n.example/webhook/x");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual(payload);
  });
  it("gibt bei 500 und bei Netzwerkfehler false zurück, ohne zu werfen", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/x";
    expect(await forwardToN8n(payload, vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch)).toBe(false);
    expect(await forwardToN8n(payload, vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch)).toBe(false);
  });
});
