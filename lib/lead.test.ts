import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/tests/helpers";
import { CLIP_CHARS, buildPayload, clipText, drainLeads, forwardToN8n } from "@/lib/lead";
import { leadSchema, resultSchema } from "@/lib/lead-schema";

const valid = { email: "Anna@Keller.ch", consent: true, tool: "x" };
const ergebnis = { email: "anna@keller.ch", consent: true, firma: " Malerei Keller ", tool: "x", eingabe: "Website: keller.ch", ausgabe: "# Ergebnis" };

describe("leadSchema (Zugang v3: Adresse Pflicht, Einwilligung freiwillig)", () => {
  it("akzeptiert Adresse plus Einwilligung und normalisiert die E-Mail", () => {
    const r = leadSchema.safeParse({ ...valid, honeypot: "" });
    expect(r.success && r.data.email).toBe("anna@keller.ch");
  });
  it("macht die Einwilligung freiwillig: ohne Häkchen oder ohne Feld gilt «nein»", () => {
    const aus = leadSchema.safeParse({ ...valid, consent: false });
    expect(aus.success && aus.data.consent).toBe(false);
    const fehlt = leadSchema.safeParse({ email: valid.email, tool: valid.tool });
    expect(fehlt.success && fehlt.data.consent).toBe(false);
    const an = leadSchema.safeParse(valid);
    expect(an.success && an.data.consent).toBe(true);
    expect(leadSchema.safeParse({ ...valid, consent: "ja" }).success).toBe(false);
  });
  it("lehnt ungültige oder überlange Adressen und fehlendes Werkzeug ab", () => {
    expect(leadSchema.safeParse({ ...valid, email: "keller" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, email: `${"a".repeat(250)}@keller.ch` }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, tool: "" }).success).toBe(false);
  });
  it("lehnt ein ausgefülltes Honeypot-Feld ab", () => {
    expect(leadSchema.safeParse({ ...valid, honeypot: "http://spam.example" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, honeypot: "" }).success).toBe(true);
  });
  it("kennt weder Name noch Firma noch Telefon mehr (die Felder fallen stillschweigend weg)", () => {
    const r = leadSchema.safeParse({ ...valid, name: "Anna", firma: "Keller", telefon: "071" });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["consent", "email", "tool"]);
  });
});

describe("resultSchema", () => {
  it("nimmt Werkzeug, Eingabe, Ausgabe und optional die Firma", () => {
    expect(resultSchema.safeParse({ tool: "x", eingabe: "", ausgabe: "" }).success).toBe(true);
    const r = resultSchema.safeParse({ tool: "x", eingabe: "a", ausgabe: "b", firma: " Keller " });
    expect(r.success && r.data.firma).toBe("Keller");
  });
  it("begrenzt Eingabe und Ausgabe auf 20'000 Zeichen und die Firma auf 200", () => {
    expect(resultSchema.safeParse({ tool: "x", eingabe: "a".repeat(20_001), ausgabe: "" }).success).toBe(false);
    expect(resultSchema.safeParse({ tool: "x", eingabe: "", ausgabe: "a".repeat(20_001) }).success).toBe(false);
    expect(resultSchema.safeParse({ tool: "x", eingabe: "", ausgabe: "", firma: "a".repeat(201) }).success).toBe(false);
  });
});

describe("clipText", () => {
  it("lässt kurze Texte unverändert, vereinheitlicht Zeilenenden und trimmt", () => {
    expect(clipText("  Hallo\r\nWelt \n")).toBe("Hallo\nWelt");
  });
  it("kürzt auf höchstens 1'900 Zeichen und markiert den Schnitt", () => {
    const out = clipText("x".repeat(5000));
    expect(out.length).toBeLessThanOrEqual(CLIP_CHARS);
    expect(out.endsWith(" …")).toBe(true);
    expect(clipText("abcdefgh", 5)).toBe("abc …");
  });
});

describe("buildPayload", () => {
  it("enthält genau die erlaubten Felder, Name und Telefon leer", () => {
    const p = buildPayload(ergebnis, "strategie", new Date("2026-10-03T10:00:00Z"));
    expect(Object.keys(p).sort()).toEqual(["ausgabe", "eingabe", "einwilligung", "email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"].sort());
    expect(p).toMatchObject({ name: "", telefon: "", firma: "Malerei Keller", email: "anna@keller.ch", tool: "x", kategorie: "strategie", quelle: "tools.alperna.ch", zeit: "2026-10-03T10:00:00.000Z" });
  });
  it("trägt die Einwilligung als «ja» oder «nein» ins CRM", () => {
    expect(buildPayload(ergebnis, "strategie").einwilligung).toBe("ja");
    expect(buildPayload({ ...ergebnis, consent: false }, "strategie").einwilligung).toBe("nein");
  });
  it("kürzt Eingabe und Ausgabe fürs CRM und verträgt eine fehlende Firma", () => {
    const p = buildPayload({ ...ergebnis, firma: undefined, ausgabe: "y".repeat(3000) }, "content");
    expect(p.firma).toBe("");
    expect(p.ausgabe.length).toBeLessThanOrEqual(CLIP_CHARS);
    expect(p.eingabe).toBe("Website: keller.ch");
  });
});

describe("forwardToN8n", () => {
  const payload = buildPayload(ergebnis, "strategie");
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
  const lead = (n: number) =>
    JSON.stringify({ name: "", firma: "Keller", email: `anna${n}@keller.ch`, telefon: "", tool: "x", kategorie: "strategie", quelle: "tools.alperna.ch", zeit: "2026-10-04T10:00:00.000Z", eingabe: `Eingabe ${n}`, ausgabe: `Ausgabe ${n}` });
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
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body)).ausgabe).toBe("Ausgabe 1");
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
