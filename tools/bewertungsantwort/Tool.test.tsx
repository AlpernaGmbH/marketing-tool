// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY, sanitizeProfile } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { PLATZHALTER, type BewertungOutput } from "./generator";
import { fallbackVorlagen } from "./logic";

// Durchlauf im Browser (jsdom): Formular, Vorbefüllung aus dem Profil, E-Mail vorhanden, Antwort der KI, CRM, Ausfall der KI
// mit fester Vorlage, Neu formulieren, Angaben ändern, Neu beginnen. /api/generate wird durch eine Antwortliste ersetzt.

const SIGN = "Ruth Keller, Malerei Keller";
const BEWERTUNG = "Die Fassade sieht gut aus. Der Maler kam aber zwei Tage später als abgemacht, und angerufen hat niemand.";

const KI: BewertungOutput = {
  varianten: [
    { ton: "sachlich", text: `Guten Tag\nDanke für Ihre Rückmeldung. Es tut uns leid, dass Sie warten mussten. Wir sprechen gern mit Ihnen: ${PLATZHALTER}.\nFreundliche Grüsse\n${SIGN}` },
    { ton: "herzlich", text: `Guten Tag\nVielen Dank für das Lob für die Fassade. Rufen Sie uns an, wenn wir etwas klären können: ${PLATZHALTER}.\nFreundliche Grüsse\n${SIGN}` },
  ],
};

const KI_ZWEI: BewertungOutput = {
  varianten: [
    { ton: "ruhig", text: `Guten Tag\nDanke, dass Sie sich Zeit genommen haben. Wir bedauern den Eindruck und melden uns gern: ${PLATZHALTER}.\nFreundliche Grüsse\n${SIGN}` },
    { ton: "kurz", text: `Guten Tag\nDanke für die Rückmeldung zur Fassade. Gern sprechen wir mit Ihnen: ${PLATZHALTER}.\nFreundliche Grüsse\n${SIGN}` },
  ],
};

type Call = { path: string; body: Record<string, unknown> };
type Reply = { status: number; body: unknown };

const ok = (output: BewertungOutput): Reply => ({ status: 200, body: { ok: true, output } });
const ausfall: Reply = { status: 502, body: { error: "ai_failed" } };

/** /api/lead und /api/result ok; /api/generate antwortet der Reihe nach, die letzte Antwort gilt weiter. */
function mockApi(replies: Reply[]) {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/lead" || path === "/api/result") return json({ ok: true });
      if (path === "/api/generate") {
        const r = replies[Math.min(n++, replies.length - 1)];
        return json(r.body, r.status);
      }
      return json({}, 404);
    }),
  );
  return {
    calls,
    count: (p: string) => calls.filter((c) => c.path === p).length,
    last: (p: string) => calls.filter((c) => c.path === p).at(-1),
  };
}

const PROFIL = {
  firma: "Malerei Keller",
  marke: {
    werte: ["Zuverlässigkeit", "Klarheit"],
    woerter: { verwenden: ["Termin"], vermeiden: ["perfekt", "günstig"] },
    bewertungsregeln: ["immer zum Besuch im Laden einladen"],
    tonalitaet: { so: "ruhig", anrede: "sie" },
  },
};

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

/** Alle sichtbaren Texte, Platzhalter und Namen (aria-label) der Seite, ein Eintrag je Element. */
function pageTexts(): string[] {
  const out: string[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.children.length === 0 && el.textContent?.trim()) out.push(el.textContent.trim());
    for (const attr of ["placeholder", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

function expectCalmText(where: string) {
  for (const t of pageTexts()) {
    expect(brandHits(t), `${where}: ${t}`).toEqual([]);
    expect(t, `${where}: ${t}`).not.toMatch(/!|\bjetzt\b|—|ß|\bTool\b/i);
  }
}

/** Füllt Unterschrift, Bewertung und Sterne; die Anrede kommt aus dem Profil oder wird gewählt. */
async function fill(u: User, opts: { sterne?: string; anrede?: string; unterschrift?: string } = {}) {
  if (opts.anrede) await u.selectOptions(screen.getByLabelText("Anrede"), opts.anrede);
  await u.type(screen.getByLabelText("Unterschrift"), opts.unterschrift ?? SIGN);
  await u.click(screen.getByLabelText("Text der Bewertung"));
  await u.paste(BEWERTUNG);
  await u.click(within(screen.getByRole("radiogroup", { name: "Sterne" })).getByRole("radio", { name: opts.sterne ?? "3 Sterne" }));
}

const card = () => screen.findByRole("region", { name: "Deine Antwort" });
const state = () => JSON.parse(readLocal("mt:bewertungsantwort") ?? "null");

describe("Bewertungsantwort im Browser", () => {
  it("zeigt das Formular mit allen Feldern, vorbefüllt aus dem Profil, in ruhigem Ton", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi([ok(KI)]);
    render(<Tool />);
    expect(await screen.findByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Anrede")).toHaveValue("sie");
    expect(within(screen.getByLabelText("Anrede")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bitte wählen", "Du", "Sie"]);
    const laenge = screen.getByRole("radiogroup", { name: "Länge" });
    expect(within(laenge).getAllByRole("radio")).toHaveLength(2);
    expect(within(laenge).getByRole("radio", { name: /^Kurz/ })).toBeChecked();
    expect(within(laenge).getByRole("radio", { name: /^Mittel/ })).not.toBeChecked();
    expect(screen.getByLabelText("Unterschrift")).toHaveValue("");
    expect(screen.getByLabelText("Text der Bewertung")).toHaveValue("");
    expect(screen.getByText("Nur den Text, keinen Namen der Person.")).toBeInTheDocument();
    const sterne = screen.getByRole("radiogroup", { name: "Sterne" });
    expect(within(sterne).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0].textContent)).toEqual(["1 Stern", "2 Sterne", "3 Sterne", "4 Sterne", "5 Sterne"]);
    expect(screen.getByLabelText("Regel 1")).toHaveValue("immer zum Besuch im Laden einladen");
    expect(screen.getByLabelText("Regel 2")).toHaveValue("");
    expect(screen.getByLabelText("Regel 3")).toHaveValue("");
    expect(screen.getByTestId("profil-hinweis")).toHaveTextContent("Aus deinem Profil geht mit: Werte: Zuverlässigkeit, Klarheit; zu vermeidende Wörter: perfekt, günstig.");
    expect(screen.getByRole("button", { name: "Antwort schreiben" })).toBeEnabled();
    expect(screen.getByText(/Dafür gehen der Text der Bewertung, die Sterne, der Name deines Betriebs/)).toHaveTextContent("nicht deine E-Mail-Adresse");
    expectCalmText("Formular");
  });

  it("zeigt beim Schreiben die Ladeansicht mit den Schritten dieses Werkzeugs und danach die Antwort", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/generate") return new Promise<Response>((resolve) => (release = resolve));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const loading = await screen.findByTestId("tool-loading");
    expect(loading).toHaveTextContent("Bewertung lesen");
    for (const step of ["Bewertung lesen", "Antworten schreiben", "Antworten kontrollieren"]) expect(loading).toHaveTextContent(step);
    expect(loading).toHaveTextContent("Deine Eingaben bleiben erhalten.");
    // Das Formular ist nur ausgeblendet, nicht entfernt: Die Bewertung steht noch darin.
    expect(screen.getByLabelText("Text der Bewertung", { selector: "textarea" })).toHaveValue(BEWERTUNG);
    release(new Response(JSON.stringify({ ok: true, output: KI }), { status: 200 }));
    await card();
    expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument();
  });

  it("meldet fehlende Angaben der Reihe nach in role=alert und ruft den Server nicht auf", async () => {
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    const start = await screen.findByRole("button", { name: "Antwort schreiben" });
    await u.click(start);
    expect(screen.getByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an.");
    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await u.click(start);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, ob du die Person duzt oder siezt.");
    await u.selectOptions(screen.getByLabelText("Anrede"), "du");
    await u.click(start);
    expect(screen.getByRole("alert")).toHaveTextContent("Gib an, wie du die Antwort unterschreibst");
    await u.type(screen.getByLabelText("Unterschrift"), "Ruth");
    await u.click(start);
    expect(screen.getByRole("alert")).toHaveTextContent("Füge den Text der Bewertung ein.");
    await u.click(screen.getByLabelText("Text der Bewertung"));
    await u.paste(BEWERTUNG);
    await u.click(start);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle die Sterne der Bewertung.");
    expect(m.count("/api/generate")).toBe(0);
    expect(m.count("/api/result")).toBe(0);
  });

  it("schreibt die Antwort, zeigt zwei Varianten, schickt Eingabe und Ausgabe ins CRM und legt die Regeln im Profil ab", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.type(screen.getByLabelText("Regel 2"), "nie Rabatte versprechen");
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));

    const region = await card();
    expect(within(region).getByRole("heading", { name: "Deine Antwort" })).toHaveFocus();
    expect(within(region).getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert. Prüfe die Antwort, bevor du sie veröffentlichst.");
    expect(within(region).getByTestId("platzhalter")).toHaveTextContent(`Platzhalter ausfüllen: ${PLATZHALTER}`);
    const liste = within(region).getByRole("list", { name: "Varianten" });
    const items = within(liste).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { name: "Variante 1: sachlich" })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("Danke für Ihre Rückmeldung.");
    expect(within(items[1]).getByRole("heading", { name: "Variante 2: herzlich" })).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: "Variante 1 kopieren" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Variante 2 kopieren" })).toBeInTheDocument();
    for (const name of ["Neu formulieren", "Angaben ändern", "Neu beginnen"]) expect(within(region).getByRole("button", { name })).toBeEnabled();
    expect(screen.queryByLabelText("Text der Bewertung")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vorlage-hinweis")).not.toBeInTheDocument();

    // Anfrage: nur die Angaben des Werkzeugs, nie die Adresse
    expect(m.count("/api/generate")).toBe(1);
    expect(m.last("/api/generate")?.body).toEqual({
      tool: "bewertungsantwort",
      input: {
        betrieb: "Malerei Keller",
        anrede: "sie",
        laenge: "kurz",
        unterschrift: SIGN,
        bewertung: BEWERTUNG,
        sterne: 3,
        regeln: ["immer zum Besuch im Laden einladen", "nie Rabatte versprechen"],
        werte: ["Zuverlässigkeit", "Klarheit"],
        vermeiden: ["perfekt", "günstig"],
      },
    });
    expect(JSON.stringify(m.last("/api/generate")?.body)).not.toContain("anna@keller.ch");

    // CRM: ein Eintrag mit lesbarer Eingabe und Ausgabe als Markdown
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")?.body as { tool: string; eingabe: string; ausgabe: string };
    expect(crm.tool).toBe("bewertungsantwort");
    expect(crm.eingabe.split("\n").slice(0, 4)).toEqual(["Betrieb: Malerei Keller", "Sterne: 3", "Anrede: Sie", "Länge: Kurz"]);
    expect(crm.eingabe).toContain(`Bewertung: ${BEWERTUNG}`);
    expect(crm.eingabe).not.toContain("Ruth Keller");
    expect(crm.ausgabe.startsWith("# Antwort auf eine Bewertung")).toBe(true);
    expect(crm.ausgabe).toContain("## Variante 1: sachlich");
    expect(crm.ausgabe).toContain(SIGN);

    // Profil: Regeln ersetzt, Werte und Wörter bleiben
    const profil = sanitizeProfile(JSON.parse(readLocal(PROFILE_KEY) ?? "{}"));
    expect(profil.marke?.bewertungsregeln).toEqual(["immer zum Besuch im Laden einladen", "nie Rabatte versprechen"]);
    expect(profil.marke?.werte).toEqual(["Zuverlässigkeit", "Klarheit"]);
    expect(profil.marke?.woerter).toEqual(PROFIL.marke.woerter);

    // Stand: Eingabe und Entwurf, damit der Pfad das Werkzeug als erledigt zählt
    const s = state();
    expect(s.v).toBe(1);
    expect(s.output).toEqual(KI);
    expect(s.input.sterne).toBe(3);
    expect(s.vorlage).toBe(false);
    expectCalmText("Ergebnis");
  });

  it("zeigt nach dem Neuladen dieselbe Antwort ohne neue Anfrage und ohne zweiten CRM-Eintrag", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    const first = render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    await card();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    const region = await card();
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByRole("heading", { name: "Deine Antwort" })).not.toHaveFocus();
    expect(m.count("/api/generate")).toBe(1);
    expect(m.count("/api/result")).toBe(1);
  });

  it("zeigt bei Ausfall der KI die feste Vorlage, meldet «Vorlage (ohne KI)» einmal und zählt den Pfad nicht als erledigt", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ausfall]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u, { sterne: "2 Sterne" });
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));

    const region = await card();
    expect(within(region).getByTestId("vorlage-hinweis")).toHaveTextContent("Die KI ist gerade nicht erreichbar; hier eine feste Vorlage.");
    expect(within(region).queryByTestId("ki-hinweis")).not.toBeInTheDocument();
    const vorlagen = fallbackVorlagen(2, "sie", "Malerei Keller", SIGN);
    const items = within(within(region).getByRole("list", { name: "Varianten" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(vorlagen[0].text.split("\n")[1]);
    expect(within(region).getByTestId("platzhalter")).toBeInTheDocument();
    expect(within(region).getByRole("alert")).toBeEmptyDOMElement();

    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect(m.last("/api/result")?.body).toMatchObject({ tool: "bewertungsantwort", ausgabe: "Vorlage (ohne KI)" });
    expect((m.last("/api/result")?.body as { eingabe: string }).eingabe).toContain("Sterne: 2");
    expect(m.count("/api/generate")).toBe(1);

    const s = state();
    expect(s.output).toBeNull();
    expect(s.vorlage).toBe(true);
    expect(s.input.sterne).toBe(2);
    expectCalmText("Vorlage");
  });

  it("ersetzt die Vorlage bei «Neu formulieren» durch den Entwurf der KI und schickt ihn ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ausfall, ok(KI_ZWEI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const region = await card();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    await u.click(within(region).getByRole("button", { name: "Neu formulieren" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Deine Antwort" })).toHaveTextContent("Variante 1: ruhig"));
    expect(screen.queryByTestId("vorlage-hinweis")).not.toBeInTheDocument();
    expect(screen.getByTestId("ki-hinweis")).toBeInTheDocument();
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect((m.last("/api/result")?.body as { ausgabe: string }).ausgabe).toContain("## Variante 1: ruhig");
    expect(state().output).toEqual(KI_ZWEI);
    expect(state().vorlage).toBe(false);
  });

  it("behält den Entwurf der KI, wenn «Neu formulieren» ausfällt, und sagt es ruhig", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ok(KI), ausfall]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const region = await card();
    await u.click(within(region).getByRole("button", { name: "Neu formulieren" }));

    await waitFor(() => expect(within(screen.getByRole("region", { name: "Deine Antwort" })).getByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert"));
    const after = screen.getByRole("region", { name: "Deine Antwort" });
    expect(within(after).getByRole("heading", { name: "Variante 1: sachlich" })).toBeInTheDocument();
    expect(within(after).queryByTestId("vorlage-hinweis")).not.toBeInTheDocument();
    expect(state().output).toEqual(KI);
    expect(m.count("/api/generate")).toBe(2);
    expect(m.count("/api/result")).toBe(1);
  });

  it("zeigt bei ungültigen Angaben (400) die Meldung im Formular und keine Vorlage", async () => {
    mockApi([{ status: 400, body: { error: "invalid" } }]);
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bitte prüfe deine Angaben und versuch es noch einmal."));
    expect(screen.queryByRole("region", { name: "Deine Antwort" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Text der Bewertung")).toHaveValue(BEWERTUNG);
    expect(state()).toBeNull();
  });

  it("bietet bei der Tagesgrenze der KI (503) ebenfalls die feste Vorlage an", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi([{ status: 503, body: { error: "capacity" } }]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u, { sterne: "5 Sterne" });
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const region = await card();
    expect(within(region).getByTestId("vorlage-hinweis")).toBeInTheDocument();
    // Vier und fünf Sterne: Dank, kein Gesprächsangebot, kein Platzhalter
    expect(within(region).queryByTestId("platzhalter")).not.toBeInTheDocument();
    expect(region).toHaveTextContent("Vielen Dank");
  });

  it("führt über «Angaben ändern» zurück ins Formular mit den gespeicherten Angaben und über «Neu beginnen» zu einem leeren", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi([ok(KI), ok(KI_ZWEI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const region = await card();

    await u.click(within(region).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Text der Bewertung")).toHaveValue(BEWERTUNG);
    expect(screen.getByLabelText("Text der Bewertung")).toHaveFocus();
    expect(screen.getByLabelText("Unterschrift")).toHaveValue(SIGN);
    expect(within(screen.getByRole("radiogroup", { name: "Sterne" })).getByRole("radio", { name: "3 Sterne" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
    await u.click(within(screen.getByRole("radiogroup", { name: "Sterne" })).getByRole("radio", { name: "1 Stern" }));
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    const neu = await screen.findByRole("region", { name: "Deine Antwort" });
    await waitFor(() => expect(neu).toHaveTextContent("Variante 1: ruhig"));
    expect((m.calls.filter((c) => c.path === "/api/generate")[1].body as { input: { sterne: number } }).input.sterne).toBe(1);

    await u.click(within(neu).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Text der Bewertung")).toHaveValue("");
    // Anrede und Unterschrift der letzten Angaben bleiben als Vorschlag; Sterne sind leer
    expect(screen.getByLabelText("Anrede")).toHaveValue("sie");
    expect(screen.getByLabelText("Unterschrift")).toHaveValue(SIGN);
    for (const r of within(screen.getByRole("radiogroup", { name: "Sterne" })).getAllByRole("radio")) expect(r).not.toBeChecked();
    expect(state().output).toBeNull();
    expect(state().input.unterschrift).toBe(SIGN);
  });

  it("lässt eine zu lange Regel aus dem Profil im Profil stehen, auch wenn das Formular sie gekürzt zeigt", async () => {
    const lang = "Wir laden bei Lob immer zum Besuch im Laden ein und bei Kritik zu einem Gespräch am Telefon, weil wir Missverständnisse am liebsten gleich klären";
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", marke: { bewertungsregeln: [lang], tonalitaet: { anrede: "du" } } }));
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Firma");
    const feld = screen.getByLabelText("Regel 1") as HTMLInputElement;
    expect(feld.value.length).toBeLessThanOrEqual(120);
    expect(lang.startsWith(feld.value)).toBe(true);
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Antwort schreiben" }));
    await card();
    const gesendet = (m.last("/api/generate")?.body as { input: { regeln: string[] } }).input.regeln;
    expect(gesendet).toEqual([feld.value]);
    expect(sanitizeProfile(JSON.parse(readLocal(PROFILE_KEY) ?? "{}")).marke?.bewertungsregeln).toEqual([lang]);
  });

  it("sagt, wenn das Profil mehr als drei Regeln hat, dass hier die ersten drei erscheinen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", marke: { bewertungsregeln: ["eins", "zwei", "drei", "vier"] } }));
    mockApi([ok(KI)]);
    render(<Tool />);
    await screen.findByLabelText("Firma");
    expect(screen.getByLabelText("Regel 3")).toHaveValue("drei");
    expect(screen.getByText(/In deinem Profil stehen 4 Regeln; hier erscheinen die ersten drei/)).toBeInTheDocument();
  });
});
