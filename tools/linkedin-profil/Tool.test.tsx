// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import type { LinkedinOutput } from "./generator";
import { KI_AUSFALL, SAMPLE } from "./logic";

// Durchlauf im Browser (jsdom): Einfügen, Beispiel, Ladeansicht, Vorschläge der KI, Ausfall der KI mit Ergebnis aus den Regeln,
// Neu schreiben, Angaben ändern, Neu beginnen, Wiederherstellen. /api/generate wird durch eine Antwortliste ersetzt.

const KI: LinkedinOutput = {
  headlines: [
    { text: "Ich helfe Familien in Gossau beim Streichen ihrer Fassade", grund: "Nennt, wem du wobei hilfst." },
    { text: "Fassaden und Innenräume für Familien in Gossau und Flawil", grund: "Nennt die Orte, die du bedienst." },
    { text: "Malermeister in dritter Generation für Familien in Gossau", grund: "Die dritte Generation ist ein Beleg." },
  ],
  infoAnfang: "Familien in Gossau, Flawil und Herisau bekommen von uns Fassaden und Innenräume, die halten. Wir beraten bei der Farbwahl und streichen sauber.",
};

const KI_ZWEI: LinkedinOutput = {
  headlines: [
    { text: "Wir streichen Fassaden für Familien in Gossau und Herisau", grund: "Nennt die Leistung und die Kundschaft." },
    { text: "Farbberatung und Anstrich für Familien in Gossau", grund: "Zeigt zwei Leistungen auf einen Blick." },
    { text: "Malerei Keller: Fassaden für Familien in Flawil", grund: "Der Betrieb steht am Anfang." },
  ],
  infoAnfang: "Familien in Gossau bekommen eine Fassade, die lange hält. Wir streichen in Gossau, Flawil und Herisau und beraten bei der Farbwahl.",
};

type Call = { path: string; body: Record<string, unknown> };
type Reply = { status: number; body: unknown };

const ok = (output: LinkedinOutput): Reply => ({ status: 200, body: { ok: true, output } });
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

const PROFIL = { firma: "Malerei Keller", branche: "Malerei", primaersegment: "Familien in Gossau" };

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
  writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
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

const start = () => screen.findByRole("button", { name: "Profil prüfen" });
const card = () => screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
const state = () => JSON.parse(readLocal("mt:linkedin-profil") ?? "null");

async function beispiel(u: User) {
  await screen.findByLabelText("Firma");
  await u.click(screen.getByRole("button", { name: "Beispiel einfügen" }));
}

describe("LinkedIn-Profil im Browser", () => {
  it("zeigt das Formular mit Firma, Branche und Zielgruppe aus dem Profil, leeren Texten und dem Datenhinweis", async () => {
    mockApi([ok(KI)]);
    render(<Tool />);
    expect(await screen.findByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByLabelText("Für wen arbeitest du? (freiwillig)")).toHaveValue("Familien in Gossau");
    expect(screen.getByText(/Aus deinem Firmenprofil übernommen/)).toBeInTheDocument();
    expect(screen.getByLabelText("Deine Headline")).toHaveValue("");
    expect(screen.getByLabelText("Dein Info-Text")).toHaveValue("");
    expect(screen.getByText("0 Zeichen, Richtwert 220")).toBeInTheDocument();
    expect(screen.getByText(/Das Werkzeug liest dein Profil nicht/)).toBeInTheDocument();
    expect(screen.getByText(/Dafür gehen die beiden Texte, der Name deines Betriebs/)).toHaveTextContent("nicht deine E-Mail-Adresse");
    expect(screen.getByRole("button", { name: "Profil prüfen" })).toBeEnabled();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expectCalmText("Formular");
  });

  it("meldet leere Texte in einem role=alert und ruft den Server nicht auf", async () => {
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await start());
    expect(screen.getByRole("alert")).toHaveTextContent("Füge die Headline oder den Info-Text deines Profils ein.");
    expect(m.count("/api/generate")).toBe(0);
    expect(m.count("/api/result")).toBe(0);
  });

  it("füllt das Beispiel ein, zeigt beim Warten die Ladeansicht und danach das Ergebnis", async () => {
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
    await beispiel(u);
    expect(screen.getByLabelText("Deine Headline")).toHaveValue(SAMPLE.headline);
    expect(screen.getByLabelText("Dein Info-Text")).toHaveValue(SAMPLE.about);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    const loading = await screen.findByTestId("tool-loading");
    for (const step of ["Texte lesen", "Vorschläge schreiben", "Vorschläge kontrollieren"]) expect(loading).toHaveTextContent(step);
    // Das Formular ist nur ausgeblendet, nicht entfernt: Die Texte stehen noch darin.
    expect(screen.getByLabelText("Deine Headline")).toHaveValue(SAMPLE.headline);
    release(new Response(JSON.stringify({ ok: true, output: KI }), { status: 200 }));
    await card();
    expect(screen.queryByTestId("tool-loading")).not.toBeInTheDocument();
  });

  it("wertet das Beispiel aus: Punktwert 34, Verbesserungen, drei Headlines und neuer Anfang mit Kopieren-Knöpfen, Ergebnis ins CRM", async () => {
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));

    const region = await card();
    expect(within(region).getByRole("heading", { name: "Dein LinkedIn-Profil-Score" })).toHaveFocus();
    expect(region).toHaveTextContent("34");
    expect(region).toHaveTextContent("Ausbaufähig");
    expect(within(region).getByText(/Das Werkzeug hat dein LinkedIn-Profil nicht gelesen/)).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "Verbesserungen" })).toBeInTheDocument();
    expect(within(region).getByText(/^Sagt, wem du wobei hilfst \(Headline, 18 Punkte offen\)/)).toBeInTheDocument();
    expect(within(region).getByText(/^Beginnt mit dem Nutzen \(Info-Text, 16 Punkte offen\)/)).toBeInTheDocument();

    const ki = within(region).getByTestId("ki-hinweis");
    expect(ki).toHaveTextContent("Von einer KI formuliert.");
    const liste = within(region).getByRole("list", { name: "Headline-Vorschläge" });
    const items = within(liste).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(KI.headlines[0].text);
    expect(items[0]).toHaveTextContent(KI.headlines[0].grund);
    for (const [i, item] of items.entries()) expect(within(item).getByRole("button", { name: `Vorschlag ${i + 1} kopieren` })).toBeInTheDocument();
    expect(within(region).getByTestId("lp-info")).toHaveTextContent(KI.infoAnfang);
    expect(within(region).getByRole("button", { name: "Neuen Anfang kopieren" })).toBeInTheDocument();
    for (const name of ["Vorschläge neu schreiben", "Angaben ändern", "Neu beginnen"]) expect(within(region).getByRole("button", { name })).toBeEnabled();
    expect(screen.queryByLabelText("Deine Headline")).not.toBeInTheDocument();
    expect(within(region).getByText("Der Rest deines Profils")).toBeInTheDocument();

    // Anfrage: nur die Angaben des Werkzeugs, nie die Adresse
    expect(m.count("/api/generate")).toBe(1);
    const body = m.last("/api/generate")?.body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("linkedin-profil");
    expect(body.input).toMatchObject({
      betrieb: "Malerei Keller",
      branche: "Malerei",
      zielgruppe: "Familien in Gossau",
      headline: SAMPLE.headline,
      about: SAMPLE.about,
    });
    expect((body.input.hinweise as string[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("anna@keller.ch");

    // CRM: ein Eintrag mit lesbarer Eingabe und Ausgabe als Markdown
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")?.body as { tool: string; eingabe: string; ausgabe: string };
    expect(crm.tool).toBe("linkedin-profil");
    expect(crm.eingabe.split("\n").slice(0, 3)).toEqual(["Betrieb: Malerei Keller", "Branche: Malerei", "Zielgruppe: Familien in Gossau"]);
    expect(crm.eingabe).toContain(`Eingefügte Headline: ${SAMPLE.headline}`);
    expect(crm.ausgabe).toContain("34");
    expect(crm.ausgabe).toContain(KI.headlines[0].text);
    expect(crm.ausgabe).toContain(KI.infoAnfang);

    // Stand: Texte, Vorschläge und Punktwert, damit der Pfad das Werkzeug als erledigt zählt
    const s = state();
    expect(s.v).toBe(2);
    expect(s.phase).toBe("result");
    expect(s.ki).toEqual(KI);
    expect(s.kiAusfall).toBe(false);
    expect(s.output).toEqual({ score: 34, stufe: "Ausbaufähig" });
    expectCalmText("Ergebnis");
  });

  it("zeigt nach dem Neuladen dasselbe Ergebnis ohne neue Anfrage und ohne zweiten CRM-Eintrag", async () => {
    const m = mockApi([ok(KI)]);
    const u = userEvent.setup();
    const first = render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    await card();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    const region = await card();
    expect(within(region).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(within(region).getByRole("heading", { name: "Dein LinkedIn-Profil-Score" })).not.toHaveFocus();
    expect(m.count("/api/generate")).toBe(1);
    expect(m.count("/api/result")).toBe(1);
  });

  it("zeigt bei Ausfall der KI trotzdem Punktwert und Verbesserungen und meldet das Ergebnis einmal ans CRM", async () => {
    const m = mockApi([ausfall]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));

    const region = await card();
    expect(region).toHaveTextContent("34");
    expect(within(region).getByTestId("ki-ausfall")).toHaveTextContent(KI_AUSFALL);
    expect(within(region).queryByTestId("ki-hinweis")).not.toBeInTheDocument();
    expect(within(region).queryByRole("list", { name: "Headline-Vorschläge" })).not.toBeInTheDocument();
    expect(within(region).getByText(/^Sagt, wem du wobei hilfst/)).toBeInTheDocument();
    expect(within(region).getByRole("alert")).toBeEmptyDOMElement();

    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")?.body as { tool: string; ausgabe: string };
    expect(crm.tool).toBe("linkedin-profil");
    expect(crm.ausgabe).toContain("nicht erreichbar");
    expect(crm.ausgabe).toContain("34");
    expect(m.count("/api/generate")).toBe(1);

    const s = state();
    expect(s.phase).toBe("result");
    expect(s.ki).toBeNull();
    expect(s.kiAusfall).toBe(true);
    expect(s.output.score).toBe(34);
    expectCalmText("Ausfall");
  });

  it("holt die Vorschläge bei «Vorschläge neu schreiben» nach und schickt sie erneut ins CRM", async () => {
    const m = mockApi([ausfall, ok(KI_ZWEI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    const region = await card();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    await u.click(within(region).getByRole("button", { name: "Vorschläge neu schreiben" }));

    await waitFor(() => expect(screen.getByTestId("lp-info")).toHaveTextContent(KI_ZWEI.infoAnfang));
    expect(screen.queryByTestId("ki-ausfall")).not.toBeInTheDocument();
    expect(screen.getByTestId("lp-headline-1")).toHaveTextContent(KI_ZWEI.headlines[0].text);
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect((m.last("/api/result")?.body as { ausgabe: string }).ausgabe).toContain(KI_ZWEI.headlines[0].text);
    expect(state().kiAusfall).toBe(false);
  });

  it("lässt ein vorhandenes Ergebnis stehen, wenn das Neuschreiben scheitert, und meldet es unter dem Ergebnis", async () => {
    const m = mockApi([ok(KI), ausfall]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    const region = await card();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    await u.click(within(region).getByRole("button", { name: "Vorschläge neu schreiben" }));

    await waitFor(() => expect(within(region).getByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert."));
    expect(screen.getByTestId("lp-info")).toHaveTextContent(KI.infoAnfang);
    expect(screen.queryByTestId("ki-ausfall")).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(2);
    expect(m.count("/api/result")).toBe(1);
    expect(state().ki).toEqual(KI);
  });

  it("ändert die Angaben mit den bisherigen Werten und prüft nach dem Ändern neu", async () => {
    const m = mockApi([ok(KI), ok(KI_ZWEI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    const region = await card();
    await u.click(within(region).getByRole("button", { name: "Angaben ändern" }));

    const headline = await screen.findByLabelText("Deine Headline");
    expect(headline).toHaveValue(SAMPLE.headline);
    expect(screen.getByLabelText("Dein Info-Text")).toHaveValue(SAMPLE.about);
    await u.clear(headline);
    await u.type(headline, "Ich helfe Familien in Gossau seit 1987 beim Streichen");
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    await waitFor(() => expect(screen.getByTestId("lp-info")).toHaveTextContent(KI_ZWEI.infoAnfang));
    expect(m.count("/api/generate")).toBe(2);
    expect((m.last("/api/generate")?.body as { input: { headline: string } }).input.headline).toBe("Ich helfe Familien in Gossau seit 1987 beim Streichen");
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect(state().output.score).toBeGreaterThan(34);
  });

  it("beginnt bei «Neu beginnen» mit leeren Texten; die Zielgruppe kommt wieder aus dem Profil", async () => {
    mockApi([ok(KI)]);
    const u = userEvent.setup();
    render(<Tool />);
    await beispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil prüfen" }));
    const region = await card();
    await u.click(within(region).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Deine Headline")).toHaveValue("");
    expect(screen.getByLabelText("Dein Info-Text")).toHaveValue("");
    expect(screen.getByLabelText("Für wen arbeitest du? (freiwillig)")).toHaveValue("Familien in Gossau");
    expect(state().phase).toBe("edit");
  });

  it("meldet einen Stand einer früheren Fassung nicht als Ergebnis, sondern zeigt das leere Formular", async () => {
    writeLocal("mt:linkedin-profil", JSON.stringify({ v: 1, phase: "result", antworten: { headline: 2 }, headline: "Maler" }));
    mockApi([ok(KI)]);
    render(<Tool />);
    expect(await screen.findByLabelText("Deine Headline")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein LinkedIn-Profil-Score" })).not.toBeInTheDocument();
  });
});
