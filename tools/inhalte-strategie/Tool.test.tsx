// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { parseState } from "./logic";
import { input as beispielInput, output } from "./testdata";

// Durchlauf im Browser (jsdom): Formular mit Vorbelegung, Prüfung, E-Mail-Fenster, Strategie von /api/generate (hier ein Stub),
// Ergebnis, CRM, Profil, Neuladen, «Angaben ändern» und die Fehlerfälle der Route.

// Das Ergebnis ist ein grosser Baum, und die Rollen-Abfragen von jsdom sind dafür langsam (sie laufen im Verbund mit allen Tests noch langsamer).
vi.setConfig({ testTimeout: 20_000 });
const findeKarte = () => screen.findByRole("region", { name: "Deine Inhaltsstrategie" }, { timeout: 5_000 });

type Call = { path: string; body: Record<string, unknown> };

const ANGEBOT = "Fassaden und Innenräume streichen, Farbberatung vor Ort. Fragen: Was kostet eine Fassade? Wie lange hält die Farbe?";
const PROFIL = {
  firma: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  primaersegment: "Hausbesitzer in Gossau und Umgebung",
  marke: { tonalitaet: { so: "Ruhig und konkret.", anrede: "du" } },
  kanaele: [{ name: "Instagram" }, { name: "Google Unternehmensprofil" }],
};

/** /api/generate antwortet mit `reply`; /api/result und /api/lead sind in Ordnung. */
function mockApi(reply: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, output: output() } })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/generate") {
        const r = reply();
        return json(r.body, r.status);
      }
      return json({ ok: true });
    }),
  );
  return {
    calls,
    count: (p: string) => calls.filter((c) => c.path === p).length,
    last: (p: string) => calls.filter((c) => c.path === p).at(-1),
    all: (p: string) => calls.filter((c) => c.path === p),
  };
}

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

const stored = () => parseState(JSON.parse(readLocal("mt:inhalte-strategie") ?? "null"));
const storedProfile = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}") as Record<string, unknown>;

/** Wählt das Ziel, fügt das Angebot ein und wählt die Beiträge pro Woche; Kanäle und Säulen bleiben, wie sie sind. */
async function fuelle(u: User, ziel = "Anfragen und Aufträge", angebot = ANGEBOT) {
  await u.click(await screen.findByRole("radio", { name: ziel }));
  await u.click(screen.getByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?"));
  await u.paste(angebot);
  await u.selectOptions(screen.getByLabelText("Wie viele Beiträge pro Woche sind realistisch?"), "2");
}

const erstellen = (u: User) => u.click(screen.getByRole("button", { name: "Strategie erstellen" }));

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
    expect(t, `${where}: ${t}`).not.toMatch(/!|\bjetzt\b|—|ß/i);
  }
}

describe("Inhaltsstrategie im Browser", () => {
  it("zeigt das Formular mit Vorbelegung aus dem Profil, Auswahl und dem Satz, was an den Server geht", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL, contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }, { name: "Region" }] }));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue("");
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByLabelText("Ort")).toHaveValue("Gossau");
    expect(screen.getByRole("radio", { name: "KMU oder Selbständige" })).toBeChecked();

    const gruppe = screen.getByRole("radiogroup", { name: "Wofür soll dein Inhalt da sein?" });
    expect(within(gruppe).getAllByRole("radio").map((r) => (r.parentElement as HTMLElement).textContent)).toEqual([
      "Anfragen und Aufträge",
      "Bekanntheit in der Region",
      "Stammkundschaft binden",
      "Fachkräfte und Lernende finden",
    ]);
    for (const r of within(gruppe).getAllByRole("radio")) expect(r).not.toBeChecked();

    expect(screen.getByLabelText("Was macht euch besonders? (freiwillig)")).toHaveValue("");
    expect(screen.getByLabelText("Hauptzielgruppe (freiwillig)")).toHaveValue("Hausbesitzer in Gossau und Umgebung");
    expect([1, 2, 3, 4, 5].map((n) => (screen.getByLabelText(`Säule ${n}`) as HTMLInputElement).value)).toEqual(["Fassaden", "Team", "Region", "", ""]);
    expect(screen.getByRole("link", { name: "Themensäulen" })).toHaveAttribute("href", "/tools/inhalte-saeulen");

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Google-Beitrag" })).toBeChecked();
    for (const name of ["Facebook", "LinkedIn", "Newsletter", "Website"]) expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    expect(screen.getAllByText(/Vorbelegt aus deinem Firmenprofil\./).length).toBeGreaterThanOrEqual(3);

    const beitraege = screen.getByLabelText("Wie viele Beiträge pro Woche sind realistisch?");
    expect(beitraege).toHaveValue("");
    expect(within(beitraege).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bitte wählen", "1 Beitrag pro Woche", "2 Beiträge pro Woche", "3 Beiträge pro Woche", "5 Beiträge pro Woche"]);

    expect(screen.getByTestId("profil-hinweis")).toHaveTextContent("Aus deinem Profil geht als Hintergrund mit an die KI: Positionierung und Tonalität.");
    expect(screen.getByRole("link", { name: "Bearbeiten" })).toHaveAttribute("href", "/profil");
    expect(screen.getByTestId("ki-weg")).toHaveTextContent("an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse");
    expect(screen.getByTestId("ki-weg")).toHaveTextContent("dazu Positionierung und Tonalität aus deinem Profil");
    expect(screen.getByRole("button", { name: "Strategie erstellen" })).toBeEnabled();
    expectCalmText("Formular");
  });

  it("zeigt bei leerem Profil Instagram und Google-Beitrag, fünf leere Säulen und keinen Profil-Hinweis", async () => {
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Hauptzielgruppe (freiwillig)");
    expect(screen.getByLabelText("Hauptzielgruppe (freiwillig)")).toHaveValue("");
    expect([1, 2, 3, 4, 5].map((n) => (screen.getByLabelText(`Säule ${n}`) as HTMLInputElement).value)).toEqual(["", "", "", "", ""]);
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Google-Beitrag" })).toBeChecked();
    expect(screen.queryByTestId("profil-hinweis")).not.toBeInTheDocument();
    expect(screen.queryByText(/Vorbelegt aus deinem Firmenprofil\./)).not.toBeInTheDocument();
    expect(screen.getByTestId("ki-weg")).not.toHaveTextContent("aus deinem Profil");
  });

  it("zeigt für einen Verein die Ziele und Fragen mit Vereinsbegriffen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "FC Trogen", ort: "Trogen", organisationstyp: "verein" }));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Was bietet dein Verein an, und was fragen Mitglieder und Interessierte am häufigsten?")).toHaveValue("");
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByRole("radio", { name: "Verein" })).toBeChecked();
    const gruppe = screen.getByRole("radiogroup", { name: "Wofür soll dein Inhalt da sein?" });
    expect(within(gruppe).getAllByRole("radio").map((r) => (r.parentElement as HTMLElement).textContent)).toEqual([
      "Mitglieder gewinnen",
      "Anlässe füllen",
      "Sponsoren finden",
      "Freiwillige finden",
    ]);
    expect(screen.getByTestId("ki-weg")).toHaveTextContent("Dafür gehen Verein, Branche, Ort");
    expectCalmText("Verein");
  });

  it("meldet, was fehlt, setzt den Fokus ins Feld und ruft den Server nicht an", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await erstellen(u);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an."));
    expect(screen.getByLabelText("Firma")).toHaveFocus();

    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, wofür dein Inhalt da sein soll.");
    expect(screen.getByRole("radio", { name: "Anfragen und Aufträge" })).toHaveFocus();

    await u.click(screen.getByRole("radio", { name: "Bekanntheit in der Region" }));
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("mindestens 20 Zeichen");
    expect(screen.getByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveFocus();

    await u.click(screen.getByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?"));
    await u.paste(ANGEBOT);
    await u.type(screen.getByLabelText("Säule 1"), "Fassaden");
    await u.type(screen.getByLabelText("Säule 2"), "Team");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Gib drei bis fünf Säulen an oder lass alle Felder leer");
    expect(screen.getByLabelText("Säule 3")).toHaveFocus();

    await u.type(screen.getByLabelText("Säule 3"), "team");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Zwei Säulen heissen «team».");
    expect(screen.getByLabelText("Säule 3")).toHaveFocus();

    await u.clear(screen.getByLabelText("Säule 3"));
    await u.type(screen.getByLabelText("Säule 3"), "Region");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, wie viele Beiträge pro Woche realistisch sind.");
    expect(screen.getByLabelText("Wie viele Beiträge pro Woche sind realistisch?")).toHaveFocus();
    expect(m.count("/api/generate")).toBe(0);
  });

  it("meldet, wenn kein Kanal gewählt ist", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await u.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await u.click(screen.getByRole("checkbox", { name: "Google-Beitrag" }));
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens einen Kanal.");
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toHaveFocus();
    expect(m.count("/api/generate")).toBe(0);
  });

  it("erstellt die Strategie, zeigt Kapitel, Tabellen und Hinweise und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByLabelText("Was macht euch besonders? (freiwillig)"));
    await u.paste("Termine werden gehalten, zwei Lehrlinge.");
    await fuelle(u);
    await erstellen(u);

    const karte = await findeKarte();
    expect(within(karte).getByRole("heading", { name: "Deine Inhaltsstrategie" })).toHaveFocus();
    expect(within(karte).getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");
    expect(within(karte).queryByTestId("platzhalter")).not.toBeInTheDocument();

    const strategie = within(karte).getByTestId("strategie");
    for (const kapitel of ["Kernbotschaft", "Ziele und Messgrössen", "Zielgruppen", "Themen", "Rollen der Kanäle", "Rhythmus", "Die ersten 90 Tage", "Woran ihr merkt, ob es wirkt", "Das lassen wir weg"]) {
      expect(within(strategie).getByRole("heading", { name: kapitel })).toBeInTheDocument();
    }
    expect(strategie).toHaveTextContent(output().kernbotschaft);
    expect(strategie).toHaveTextContent("Monat 1: Aufbauen");
    expect(strategie).toHaveTextContent("Monat 3: Prüfen und anpassen");
    expect(within(strategie).getAllByRole("table")).toHaveLength(2);
    const kanalTabelle = within(strategie).getAllByRole("table")[1];
    expect(within(kanalTabelle).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Kanal", "Rolle", "Formate"]);
    expect(within(kanalTabelle).getByRole("cell", { name: "Foto, Kurzvideo" })).toBeInTheDocument();
    expect(strategie).not.toHaveTextContent("Von einer KI formuliert.");

    expect(within(karte).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(karte).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(karte).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(karte).getByRole("link", { name: "Säulen vertiefen" })).toHaveAttribute("href", "/tools/inhalte-saeulen");
    expect(within(karte).getByRole("link", { name: "Plan nach Zeitbudget" })).toHaveAttribute("href", "/tools/posting-plan");
    for (const name of ["Angaben ändern", "Neu beginnen"]) expect(within(karte).getByRole("button", { name })).toBeInTheDocument();

    // Anfrage an /api/generate: genau die Felder des Generators, nichts über die Person
    expect(m.count("/api/generate")).toBe(1);
    const body = m.last("/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("inhalte-strategie");
    expect(body.input).toEqual({
      betrieb: "Malerei Keller",
      organisationstyp: "kmu",
      branche: "Malerei",
      ort: "Gossau",
      ziel: "anfragen",
      angebot: ANGEBOT,
      besonders: "Termine werden gehalten, zwei Lehrlinge.",
      zielgruppe: "Hausbesitzer in Gossau und Umgebung",
      saeulen: [],
      kanaele: ["instagram", "google"],
      beitraegeProWoche: "2",
      positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
      tonalitaet: "Ruhig und konkret.",
    });
    expect(JSON.stringify(body)).not.toContain("anna@keller.ch");

    // CRM: lesbare Eingabe und Ausgabe, einmal
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")!.body as { tool: string; eingabe: string; ausgabe: string; firma?: string };
    expect(crm.tool).toBe("inhalte-strategie");
    expect(crm.firma).toBe("Malerei Keller");
    expect(crm.eingabe.split("\n").slice(0, 7)).toEqual([
      "Betrieb: Malerei Keller",
      "Art: KMU",
      "Ort: Gossau",
      "Branche: Malerei",
      "Ziel: Anfragen und Aufträge",
      "Kanäle: Instagram, Google-Beitrag",
      "Beiträge pro Woche: 2",
    ]);
    expect(crm.eingabe).toContain("Säulen: keine angegeben, die KI schlägt vor");
    expect(crm.ausgabe.startsWith("# Inhaltsstrategie")).toBe(true);
    expect(crm.ausgabe).toContain(output().kernbotschaft);
    expect(crm.ausgabe).toContain("| Kanal | Rolle | Formate |");
    expect(crm.ausgabe).not.toMatch(/^\{|\[object/);

    // Stand: Phase «result» und Objekt unter «output», damit der Pfad-Fortschritt das Werkzeug als erledigt erkennt
    const raw = JSON.parse(readLocal("mt:inhalte-strategie") ?? "null") as Record<string, unknown>;
    expect(raw.phase).toBe("result");
    expect(raw.v).toBe(1);
    expect(stored().output).toEqual(output());
    expect(stored().input).toEqual(body.input);
    expectCalmText("Ergebnis");
  });

  it("schreibt die Säulen ins Profil, wenn dort keine stehen, und lässt vorhandene stehen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    await findeKarte();
    await waitFor(() => expect(storedProfile().contentSaeulen).toEqual(output().saeulen.map((s) => ({ name: s.name, beschreibung: s.rolle }))));
    expect(storedProfile().firma).toBe("Malerei Keller");
    first.unmount();

    clearAllLocal();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const eigene = [{ name: "Eigene Säule", beschreibung: "Von Hand." }, { name: "Zweite Säule" }, { name: "Dritte Säule" }];
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL, contentSaeulen: eigene }));
    const m = mockApi();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    await findeKarte();
    expect(storedProfile().contentSaeulen).toEqual(eigene);
    // Die Säulen aus dem Profil gehen als Angabe mit
    expect((m.last("/api/generate")!.body as { input: { saeulen: string[] } }).input.saeulen).toEqual(["Eigene Säule", "Zweite Säule", "Dritte Säule"]);
  });

  it("schickt getippte Säulen und Zielgruppe statt der Vorbelegung und wählt Kanäle nach", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u, "Stammkundschaft binden");
    await u.clear(screen.getByLabelText("Hauptzielgruppe (freiwillig)"));
    await u.type(screen.getByLabelText("Hauptzielgruppe (freiwillig)"), "Familien in Gossau");
    await u.type(screen.getByLabelText("Säule 1"), "Fassaden vorher und nachher");
    await u.type(screen.getByLabelText("Säule 2"), "Fragen aus dem Alltag");
    await u.type(screen.getByLabelText("Säule 4"), "Team und Region");
    await u.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await u.click(screen.getByRole("checkbox", { name: "LinkedIn" }));
    await erstellen(u);
    await findeKarte();
    expect((m.last("/api/generate")!.body as { input: Record<string, unknown> }).input).toMatchObject({
      ziel: "bindung",
      zielgruppe: "Familien in Gossau",
      saeulen: ["Fassaden vorher und nachher", "Fragen aus dem Alltag", "Team und Region"],
      kanaele: ["linkedin", "google"],
    });
  });

  it("nennt Platzhalter in eckigen Klammern über der Strategie", async () => {
    mockApi(() => ({ status: 200, body: { ok: true, output: { ...output(), niemals: ["Beiträge über [Anlass in deiner Gemeinde] ohne Bild, weil sie nichts zeigen.", output().niemals[1]] } } }));
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    const karte = await findeKarte();
    expect(within(karte).getByTestId("platzhalter")).toHaveTextContent("Platzhalter ausfüllen: [Anlass in deiner Gemeinde]");
  });

  it("zeigt nach dem Neuladen das Ergebnis ohne neue Anfrage und ohne zweiten CRM-Eintrag", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const first = render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    await findeKarte();
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    expect(await findeKarte()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Strategie erstellen" })).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(1);
    expect(m.count("/api/result")).toBe(1);
  });

  it("öffnet mit «Angaben ändern» das Formular mit den Angaben, «Abbrechen» bringt das Ergebnis zurück, «Neu beginnen» löscht es", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    render(<Tool />);
    await fuelle(u, "Bekanntheit in der Region");
    await u.type(screen.getByLabelText("Säule 1"), "Fassaden");
    await u.type(screen.getByLabelText("Säule 2"), "Team");
    await u.type(screen.getByLabelText("Säule 3"), "Region");
    await erstellen(u);
    const karte = await findeKarte();

    await u.click(within(karte).getByRole("button", { name: "Angaben ändern" }));
    const angebot = await screen.findByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?");
    expect(angebot).toHaveValue(ANGEBOT);
    await waitFor(() => expect(angebot).toHaveFocus());
    expect(screen.getByRole("radio", { name: "Bekanntheit in der Region" })).toBeChecked();
    expect(screen.getByLabelText("Wie viele Beiträge pro Woche sind realistisch?")).toHaveValue("2");
    expect([1, 2, 3, 4, 5].map((n) => (screen.getByLabelText(`Säule ${n}`) as HTMLInputElement).value)).toEqual(["Fassaden", "Team", "Region", "", ""]);
    expect(screen.getByLabelText("Hauptzielgruppe (freiwillig)")).toHaveValue("Hausbesitzer in Gossau und Umgebung");
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    await u.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Säule 1")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Deine Inhaltsstrategie" })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Deine Inhaltsstrategie" })).not.toBeInTheDocument();
    expect(stored().output).toBeNull();
    expect(stored().input).toBeNull();
    // Nach dem Neubeginn stehen die Säulen aus der Strategie im Profil und sind wieder vorbelegt
    expect((screen.getByLabelText("Säule 1") as HTMLInputElement).value).toBe(output().saeulen[0].name);
  });

  it("schickt nach «Angaben ändern» eine neue Anfrage und ein zweites Ergebnis ins CRM", async () => {
    const zweite = { ...output(), kernbotschaft: "Die Malerei Keller streicht in Gossau Fassaden, die lange halten, und hält jeden zugesagten Termin." };
    let n = 0;
    const m = mockApi(() => ({ status: 200, body: { ok: true, output: n++ === 0 ? output() : zweite } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    const karte = await findeKarte();
    await u.click(within(karte).getByRole("button", { name: "Angaben ändern" }));
    await u.click(await screen.findByRole("radio", { name: "Stammkundschaft binden" }));
    await erstellen(u);
    await waitFor(() => expect(m.count("/api/generate")).toBe(2));
    await waitFor(() => expect(screen.getByTestId("strategie")).toHaveTextContent(zweite.kernbotschaft));
    expect((m.all("/api/generate")[1].body as { input: { ziel: string } }).input.ziel).toBe("bindung");
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect(stored().output?.kernbotschaft).toBe(zweite.kernbotschaft);
  });

  it("schickt für einen Verein den Typ und das Ziel in Vereinswörtern", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "FC Trogen", ort: "Trogen", organisationstyp: "verein", kanaele: [{ name: "Website" }, { name: "Instagram" }] }));
    render(<Tool />);
    await u.click(await screen.findByRole("radio", { name: "Sponsoren finden" }));
    await u.click(screen.getByLabelText("Was bietet dein Verein an, und was fragen Mitglieder und Interessierte am häufigsten?"));
    await u.paste("Fussballclub mit Aktiven, Senioren und Juniorinnen. Fragen: Ab welchem Alter kann man mitmachen?");
    await u.selectOptions(screen.getByLabelText("Wie viele Beiträge pro Woche sind realistisch?"), "1");
    await erstellen(u);
    const karte = await findeKarte();
    expect(within(karte).getByTestId("strategie")).toHaveTextContent("Sponsoren finden");
    expect((m.last("/api/generate")!.body as { input: Record<string, unknown> }).input).toMatchObject({ betrieb: "FC Trogen", organisationstyp: "verein", ziel: "bindung", kanaele: ["instagram", "website"], beitraegeProWoche: "1" });
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")!.body as { eingabe: string };
    expect(crm.eingabe.split("\n").slice(0, 2)).toEqual(["Verein: FC Trogen", "Art: Verein"]);
    expect(crm.eingabe).toContain("Ziel: Sponsoren finden");
  });

  it("fragt ohne Adresse zuerst nach ihr und ruft die Route erst danach; «Später» lässt das Formular stehen", async () => {
    clearAllLocal();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    let dialog = await screen.findByRole("dialog");
    expect(m.count("/api/generate")).toBe(0);
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue(ANGEBOT);
    expect(m.count("/api/generate")).toBe(0);

    await erstellen(u);
    dialog = await screen.findByRole("dialog");
    await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await findeKarte()).toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(1);
    expect(JSON.stringify(m.last("/api/generate")!.body)).not.toContain("anna@keller.ch");
  });

  it("zeigt bei 403 «gate» das Fenster erneut und wiederholt die Anfrage einmal", async () => {
    writeLocal(LEAD_KEY, "alt@keller.ch");
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    let n = 0;
    const m = mockApi(() => (n++ === 0 ? { status: 403, body: { error: "gate" } } : { status: 200, body: { ok: true, output: output() } }));
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("E-Mail")).toHaveValue("");
    await u.type(within(dialog).getByLabelText("E-Mail"), "neu@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    expect(await findeKarte()).toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(2);
    expect(m.all("/api/generate")[1].body).toEqual(m.all("/api/generate")[0].body);
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
  });

  it.each([
    [429, { error: "rate_limited" }, "Das waren viele Anfragen in kurzer Zeit."],
    [503, { error: "capacity" }, "Die KI ist heute ausgelastet."],
    [502, { error: "ai_rejected", detail: "zahl" }, "Die KI hat keinen brauchbaren Entwurf geliefert."],
    [400, { error: "invalid" }, "Bitte prüfe deine Angaben und versuch es noch einmal."],
  ])("meldet den Fehler %i der Route ruhig, behält das Formular und schickt nichts ins CRM", async (status, body, text) => {
    const m = mockApi(() => ({ status, body }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue(ANGEBOT);
    expect(screen.getByRole("button", { name: "Strategie erstellen" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Deine Inhaltsstrategie" })).not.toBeInTheDocument();
    expect(m.count("/api/result")).toBe(0);
    expect(stored().output).toBeNull();
  });

  it("meldet einen Ausfall des Netzes ruhig", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Die Verbindung hat nicht geklappt.");
    expect(stored().output).toBeNull();
  });

  it("verwirft eine Antwort, die nicht zum Schema passt, im Browser", async () => {
    const m = mockApi(() => ({ status: 200, body: { ok: true, output: { kernbotschaft: "nur ein Feld" } } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert.");
    expect(m.count("/api/result")).toBe(0);
  });

  it("füllt das Formular aus der gespeicherten Eingabe, wenn nur das Ergebnis kaputt ist", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    writeLocal("mt:inhalte-strategie", JSON.stringify({ v: 1, phase: "result", input: { ...beispielInput, ziel: "fachkraefte", kanaele: ["linkedin"] }, output: { kernbotschaft: "kaputt" } }));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue(beispielInput.angebot);
    expect(screen.getByRole("radio", { name: "Fachkräfte und Lernende finden" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Deine Inhaltsstrategie" })).not.toBeInTheDocument();
  });

  it("zeigt bei kaputtem Stand das leere Formular", async () => {
    writeLocal("mt:inhalte-strategie", "{kaputt");
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Deine Inhaltsstrategie" })).not.toBeInTheDocument();
  });
});
