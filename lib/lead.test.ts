import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/tests/helpers";
import { buildPayload, drainLeads, forwardToN8n, leadSchema } from "@/lib/lead";

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

describe("drainLeads", () => {
  const lead = (n: number) => JSON.stringify({ name: `Anna ${n}`, firma: "Keller", email: `anna${n}@keller.ch`, telefon: "", tool: "x", kategorie: "strategie", quelle: "tools.alperna.ch", zeit: "2026-10-04T10:00:00.000Z" });
  const okFetch = () => vi.fn(async (...args: [string, RequestInit?]) => (void args, new Response("{}", { status: 200 })));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("schickt alle wartenden Leads der Reihe nach und leert die Warteschlange", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example/hook");
    const store = new MemoryStore();
    store.leads.push(lead(1), lead(2), lead(3));
    const f = okFetch();
    expect(await drainLeads(store, f as unknown as typeof fetch)).toEqual({ sent: 3, waiting: 0, invalid: 0 });
    expect(store.leads).toEqual([]);
    expect(f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).email)).toEqual(["anna1@keller.ch", "anna2@keller.ch", "anna3@keller.ch"]);
  });

  it("bricht beim ersten Fehler ab: Gesendetes fällt weg, der Rest bleibt in der richtigen Reihenfolge", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example/hook");
    const store = new MemoryStore();
    store.leads.push(lead(1), lead(2), lead(3));
    let calls = 0;
    const f = vi.fn(async () => new Response("{}", { status: ++calls === 2 ? 500 : 200 }));
    expect(await drainLeads(store, f as unknown as typeof fetch)).toEqual({ sent: 1, waiting: 2, invalid: 0 });
    expect(store.leads).toEqual([lead(2), lead(3)]);
    expect(f).toHaveBeenCalledTimes(2); // nach dem Fehler wird nicht weiter geklopft
  });

  it("lässt alles liegen, wenn n8n nicht konfiguriert oder nicht erreichbar ist", async () => {
    const store = new MemoryStore();
    store.leads.push(lead(1));
    expect(await drainLeads(store, okFetch() as unknown as typeof fetch)).toEqual({ sent: 0, waiting: 1, invalid: 0 }); // ohne N8N_WEBHOOK_URL
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example/hook");
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await drainLeads(store, down as unknown as typeof fetch)).toEqual({ sent: 0, waiting: 1, invalid: 0 });
    expect(store.leads).toEqual([lead(1)]);
  });

  it("wirft einen unlesbaren Eintrag weg, statt alle dahinter zu blockieren", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example/hook");
    const store = new MemoryStore();
    store.leads.push("kein json", '{"x":1}', lead(1));
    expect(await drainLeads(store, okFetch() as unknown as typeof fetch)).toEqual({ sent: 1, waiting: 0, invalid: 2 });
    expect(store.leads).toEqual([]);
  });

  it("macht bei leerer Warteschlange nichts", async () => {
    const f = okFetch();
    expect(await drainLeads(new MemoryStore(), f as unknown as typeof fetch)).toEqual({ sent: 0, waiting: 0, invalid: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it("nimmt je Lauf höchstens 50 Leads", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example/hook");
    const store = new MemoryStore();
    for (let i = 0; i < 70; i++) store.leads.push(lead(i));
    expect(await drainLeads(store, okFetch() as unknown as typeof fetch)).toMatchObject({ sent: 50 });
    expect(store.leads).toHaveLength(20); // der Rest geht beim nächsten Lauf
  });
});

