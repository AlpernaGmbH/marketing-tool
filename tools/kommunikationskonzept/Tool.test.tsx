// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PitchProvider } from "@/components/tool/pitch-context";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import type { KonzeptOutput } from "./generator";
import { parseState } from "./logic";

// Durchlauf im Browser (jsdom): Formular für Verein und Betrieb, Prüfung, E-Mail-Fenster, Konzept von /api/generate (hier ein Stub),
// Ergebnis, CRM, Profil, Website-Scan, Anspruchsgruppen, Hinweis auf Alperna und «Angaben ändern».

type Call = { path: string; body: Record<string, unknown> };

const output: KonzeptOutput = {
  ausgangslage:
    "Der FC Trogen hat 180 Mitglieder, und die Zahl wächst. Heute laufen die Website, Instagram, WhatsApp-Gruppen und das Gemeindeblatt. Zwei Vorstandsmitglieder machen die Kommunikation und haben dafür 6 Stunden pro Monat.",
  ziele: [
    { ziel: "Mehr Kinder und Jugendliche für den Nachwuchs gewinnen", messgroesse: "Anmeldungen im Nachwuchs" },
    { ziel: "Neue Mitglieder aus Trogen und Umgebung gewinnen", messgroesse: "Neue Mitglieder im Vereinsjahr" },
  ],
  zielgruppen: [
    { name: "Mitglieder", erwartung: "Wissen, wann Training, Spiele und Anlässe stattfinden." },
    { name: "Sponsoren", erwartung: "Sehen, was ihr Beitrag im Verein bewirkt." },
  ],
  kernbotschaft: "Der FC Trogen bringt Kinder, Familien und Dorf auf dem Sportplatz zusammen.",
  kanalplan: [
    { kanal: "Website", zweck: "Termine, Kontakt und Anmeldung für den Nachwuchs.", rhythmus: "bei jeder Änderung", verantwortlich: "Betreuung Website" },
    { kanal: "Newsletter oder Mail (neu)", zweck: "Sponsoren zweimal im Jahr informieren.", rhythmus: "zweimal im Jahr", verantwortlich: "" },
  ],
  jahreskalender: [
    { monat: 6, anlass: "Dorffest", kommunikation: "Einladung im Gemeindeblatt, Bilder auf Instagram, Dank an die Helferinnen und Helfer." },
    { monat: 3, anlass: "Generalversammlung", kommunikation: "Einladung per Mail und Aushang, danach das Protokoll auf der Website." },
  ],
  rollen: [
    { rolle: "Verantwortliche für Instagram", aufgaben: "Plant und veröffentlicht die Beiträge.", stundenProMonat: 3 },
    { rolle: "Betreuung Website", aufgaben: "Hält Termine und Hinweise aktuell.", stundenProMonat: 2 },
  ],
  erfolgsmessung: ["Zahl der Mitglieder am Ende des Vereinsjahrs", "Anmeldungen zum Dorffest und zum Grümpelturnier"],
};

/** Konzept eines Betriebs, wie die KI es liefern darf: kein Wort aus der Welt der Vereine. */
const outputKmu: KonzeptOutput = {
  ausgangslage:
    "Die Malerei Keller hat 8 Mitarbeitende, und die Nachfrage ist stabil. Heute laufen das Google Business Profil und LinkedIn. Die Zeit für die Kommunikation beträgt 8 Stunden pro Monat.",
  ziele: [
    { ziel: "Neue Privatkundschaft in Gossau und Umgebung gewinnen", messgroesse: "Anfragen über die Website" },
    { ziel: "Lernende für die nächste Lehrstelle finden", messgroesse: "Bewerbungen auf offene Lehrstellen" },
  ],
  zielgruppen: [
    { name: "Privatkundschaft", erwartung: "Sehen Referenzen und wissen, wie sie eine Offerte anfragen." },
    { name: "Bewerbende", erwartung: "Erfahren, wie der Alltag in der Malerei aussieht." },
  ],
  kernbotschaft: "Die Malerei Keller streicht Fassaden und Räume in Gossau sauber, pünktlich und mit klaren Absprachen.",
  kanalplan: [
    { kanal: "Google Business Profil", zweck: "Öffnungszeiten, Bilder und Bewertungen pflegen.", rhythmus: "monatlich", verantwortlich: "Inhaberin" },
    { kanal: "LinkedIn", zweck: "Offene Lehrstellen und Einblicke in die Arbeit zeigen.", rhythmus: "zweimal im Monat", verantwortlich: "" },
  ],
  jahreskalender: [],
  rollen: [{ rolle: "Inhaberin", aufgaben: "Gibt die Beiträge frei und beantwortet Anfragen.", stundenProMonat: 4 }],
  erfolgsmessung: ["Zahl der Anfragen über die Website", "Zahl der Bewerbungen auf offene Lehrstellen"],
};

const ZWECK = "Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.";
const PROFIL = { firma: "FC Trogen", ort: "Trogen", kanton: "AR", organisationstyp: "verein" };
const ZWECK_KMU = "Malerei mit acht Mitarbeitenden, Fassaden und Innenräume für Privatkundschaft und Verwaltungen in Gossau und Umgebung.";
const PROFIL_KMU = { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", organisationstyp: "kmu" };

const CHECK_KEY = "mt:digitaler-auftritt-check";
/** Ergebnis des Marketing-Checks, wie parseCheckState es annimmt: Instagram verlinkt, Newsletter-Anmeldung, Google-Profil nicht gefunden. */
const CHECK_RESULT = {
  v: 1,
  score: 52,
  company: "Malerei Keller",
  url: "https://malerei-keller.ch",
  checkedAt: "2026-10-03T09:00:00.000Z",
  categories: [
    { id: "seo", score: 0.6, items: [] },
    { id: "social", score: 0.4, items: [], channels: [{ network: "instagram", label: "Instagram", linkedOnSite: true, freq: null, freqLabel: "Unbekannt", freqScore: 0.3 }] },
  ],
  massnahmen: [],
  facts: { hasNewsletter: true, gbpFound: false },
};
const CHECK_STATE = { v: 1, phase: "result", step: 0, answers: {}, form: { industry: "craft", socials: {} }, result: CHECK_RESULT };

/** /api/generate antwortet mit `reply`; /api/result und /api/lead sind in Ordnung. */
function mockApi(reply: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, output } })) {
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
      if (path === "/api/check") return new Response(`${JSON.stringify({ type: "result", result: CHECK_RESULT })}\n`, { status: 200 });
      return json({ ok: true });
    }),
  );
  return { calls, count: (p: string) => calls.filter((c) => c.path === p).length, last: (p: string) => calls.filter((c) => c.path === p).at(-1) };
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

const stored = () => parseState(JSON.parse(readLocal("mt:kommunikationskonzept") ?? "null"));
const storedProfile = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}") as Record<string, unknown>;

/** Füllt alle Pflichtfelder und einen Anlass; Kanäle bleiben, wie sie sind. */
async function fuelle(u: User) {
  await u.click(await screen.findByLabelText("Vereinszweck"));
  await u.paste(ZWECK);
  await u.type(screen.getByLabelText("Mitgliederzahl"), "180");
  await u.selectOptions(screen.getByLabelText("Entwicklung der Mitgliederzahl"), "waechst");
  await u.click(screen.getByRole("checkbox", { name: "Nachwuchs" }));
  await u.click(screen.getByRole("checkbox", { name: "Mitglieder gewinnen" }));
  await u.type(screen.getByLabelText("Name des Anlasses 1"), "Dorffest");
  await u.selectOptions(screen.getByLabelText("Monat von Anlass 1"), "6");
  await u.type(screen.getByLabelText("Stunden pro Monat für die Kommunikation"), "6");
}

/** Füllt die Pflichtfelder eines Betriebs; Kanäle bleiben, wie sie sind. */
async function fuelleKmu(u: User) {
  await u.click(await screen.findByLabelText("Was dein Betrieb tut"));
  await u.paste(ZWECK_KMU);
  await u.type(screen.getByLabelText("Mitarbeitende"), "8");
  await u.selectOptions(screen.getByLabelText("Entwicklung der Nachfrage"), "stabil");
  await u.click(screen.getByRole("checkbox", { name: "Neue Kundschaft gewinnen" }));
  await u.type(screen.getByLabelText("Stunden pro Monat für die Kommunikation"), "8");
}

async function erstellen(u: User) {
  await u.click(screen.getByRole("button", { name: "Konzept erstellen" }));
}

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

describe("Kommunikationskonzept im Browser: Verein", () => {
  it("zeigt das Formular mit allen Feldern, Auswahl und dem Satz, was an den Server geht", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Vereinszweck")).toHaveValue("");
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Ort")).toHaveValue("Trogen");
    expect(screen.getByLabelText("Kanton")).toHaveValue("AR");
    expect(screen.getByRole("radio", { name: "Verein" })).toBeChecked();
    expect(screen.getByLabelText("Mitgliederzahl")).toHaveValue(null);
    expect(within(screen.getByLabelText("Entwicklung der Mitgliederzahl")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bitte wählen", "wächst", "stabil", "schrumpft"]);
    expect(within(screen.getByRole("list", { name: "Ziele" })).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Mitglieder gewinnen",
      "Nachwuchs",
      "Helferinnen und Helfer",
      "Sponsoren",
      "Sichtbarkeit in der Gemeinde",
    ]);
    expect(within(screen.getByRole("list", { name: "Kanäle heute" })).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(screen.getByLabelText("Monat von Anlass 1")).getAllByRole("option")).toHaveLength(13);
    expect(screen.getByLabelText("Wer macht die Kommunikation? (freiwillig)")).toHaveValue("");
    expect(screen.getByLabelText("Stunden pro Monat für die Kommunikation")).toHaveValue(null);
    expect(screen.getByLabelText("Budget pro Jahr in CHF (freiwillig)")).toHaveValue(null);
    expect(screen.getByText(/an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konzept erstellen" })).toBeEnabled();
    expectCalmText("Formular");
  });

  it("schreibt den Typ nie ins Profil: Ohne Rechtsform gilt der Betrieb, mit «Verein» der Verein", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    mockApi();
    const first = render(<Tool />);
    expect(await screen.findByLabelText("Was dein Betrieb tut")).toBeInTheDocument();
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(storedProfile().organisationstyp).toBeUndefined();
    first.unmount();

    clearAllLocal();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "FC Trogen", organisationstyp: "verein" }));
    render(<Tool />);
    expect(await screen.findByLabelText("Vereinszweck")).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(storedProfile().organisationstyp).toBe("verein");
  });

  it("belegt die Kanäle aus dem Profil vor und sagt es", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL, kanaele: [{ name: "Instagram" }, { name: "WhatsApp-Gruppen" }, { name: "TikTok" }] }));
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Vereinszweck");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "WhatsApp-Gruppen" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Website" })).not.toBeChecked();
    expect(screen.getByText(/Vorbelegt aus deinem Firmenprofil\./)).toBeInTheDocument();
  });

  it("meldet, was fehlt, setzt den Fokus ins Feld und ruft den Server nicht an", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein" }));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await erstellen(u);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Gib den Namen deines Vereins an."));
    expect(screen.getByLabelText("Name des Vereins")).toHaveFocus();

    await u.type(screen.getByLabelText("Name des Vereins"), "FC Trogen");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("mindestens 20 Zeichen");
    expect(screen.getByLabelText("Vereinszweck")).toHaveFocus();

    await u.click(screen.getByLabelText("Vereinszweck"));
    await u.paste(ZWECK);
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Gib die Zahl der Mitglieder an");
    expect(screen.getByLabelText("Mitgliederzahl")).toHaveFocus();

    await u.type(screen.getByLabelText("Mitgliederzahl"), "180");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, wie sich die Mitgliederzahl entwickelt.");
    await u.selectOptions(screen.getByLabelText("Entwicklung der Mitgliederzahl"), "stabil");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens ein Ziel.");
    expect(screen.getByRole("checkbox", { name: "Mitglieder gewinnen" })).toHaveFocus();
    expect(m.count("/api/generate")).toBe(0);
  });

  it("meldet einen Anlass ohne Monat und einen zu kurzen Anlassnamen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await u.selectOptions(screen.getByLabelText("Monat von Anlass 1"), "");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle den Monat für «Dorffest».");
    expect(screen.getByLabelText("Monat von Anlass 1")).toHaveFocus();
    await u.selectOptions(screen.getByLabelText("Monat von Anlass 1"), "6");
    await u.clear(screen.getByLabelText("Name des Anlasses 1"));
    await u.type(screen.getByLabelText("Name des Anlasses 1"), "GV");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("«Generalversammlung» statt «GV»");
    expect(m.count("/api/generate")).toBe(0);
  });

  it("fügt Anlässe hinzu und entfernt sie, bis acht", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    const liste = await screen.findByRole("list", { name: "Anlässe im Jahr" });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    const add = screen.getByRole("button", { name: "Anlass hinzufügen" });
    await u.click(add);
    expect(screen.getByLabelText("Name des Anlasses 2")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Name des Anlasses 2"), "Turnier");
    await u.click(screen.getByRole("button", { name: "Anlass 1 entfernen" }));
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Name des Anlasses 1")).toHaveValue("Turnier");
    for (let i = 0; i < 7; i++) await u.click(add);
    expect(within(liste).getAllByRole("listitem")).toHaveLength(8);
    expect(add).toBeDisabled();
    expect(screen.getByText("8 von 8 Zeilen")).toBeInTheDocument();
  });

  it("erstellt das Konzept, zeigt Kapitel und Tabellen und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await u.click(screen.getByRole("checkbox", { name: "Website" }));
    await u.click(screen.getByRole("checkbox", { name: "WhatsApp-Gruppen" }));
    await u.type(screen.getByLabelText("Wer macht die Kommunikation? (freiwillig)"), "Zwei Vorstandsmitglieder");
    await u.type(screen.getByLabelText("Budget pro Jahr in CHF (freiwillig)"), "2000");
    await erstellen(u);

    const karte = await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect(within(karte).getByRole("heading", { name: "Dein Kommunikationskonzept" })).toHaveFocus();
    expect(within(karte).getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");
    const konzept = within(karte).getByTestId("konzept");
    for (const h of ["1. Ausgangslage", "2. Ziele", "3. Zielgruppen", "4. Kernbotschaft", "5. Kanalplan", "6. Jahreskalender", "7. Rollenverteilung", "8. Erfolgsmessung"]) {
      expect(within(konzept).getByRole("heading", { name: h })).toBeInTheDocument();
    }
    expect(within(konzept).getAllByRole("table")).toHaveLength(5);
    const rows = within(konzept).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.findIndex((r) => r.startsWith("MärzGeneralversammlung"))).toBeLessThan(rows.findIndex((r) => r.startsWith("JuniDorffest")));
    expect(within(karte).queryByTestId("platzhalter")).not.toBeInTheDocument();
    expect(karte).toHaveTextContent("Das Konzept ist eine Vorlage.");
    for (const name of ["Text kopieren", "PDF herunterladen", "Word herunterladen", "Angaben ändern", "Neu beginnen"]) expect(within(karte).getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vereinszweck")).not.toBeInTheDocument();

    // Anfrage an /api/generate: genau die Felder des Generators, nichts über die Person
    expect(m.count("/api/generate")).toBe(1);
    const body = m.last("/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("kommunikationskonzept");
    expect(body.input).toEqual({
      typ: "verein",
      betrieb: "FC Trogen",
      ort: "Trogen",
      kanton: "Appenzell Ausserrhoden",
      zweck: ZWECK,
      anzahl: 180,
      entwicklung: "waechst",
      ziele: ["mitglieder", "nachwuchs"],
      anlaesse: [{ name: "Dorffest", monat: 6 }],
      kanaele: ["website", "whatsapp"],
      wer: "Zwei Vorstandsmitglieder",
      stundenProMonat: 6,
      budget: 2000,
      gruppen: [],
    });
    expect(JSON.stringify(body)).not.toContain("anna@keller.ch");

    // CRM: lesbare Eingabe und Ausgabe, einmal
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")!.body as { tool: string; eingabe: string; ausgabe: string; firma?: string };
    expect(crm.tool).toBe("kommunikationskonzept");
    expect(crm.firma).toBe("FC Trogen");
    expect(crm.eingabe.split("\n")[0]).toBe("Verein: FC Trogen, Trogen (Appenzell Ausserrhoden)");
    expect(crm.eingabe).toContain("Mitglieder: 180, Zahl wächst");
    expect(crm.eingabe).toContain("Anlässe im Jahr: Dorffest (Juni)");
    expect(crm.eingabe).toContain("Kanäle heute: Website, WhatsApp-Gruppen");
    expect(crm.ausgabe.startsWith("# Kommunikationskonzept")).toBe(true);
    expect(crm.ausgabe).toContain("## 5. Kanalplan");
    expect(crm.ausgabe).not.toMatch(/^\{|\[object|undefined/);

    // Stand: Objekt unter «output», damit der Pfad-Fortschritt das Werkzeug als erledigt erkennt
    const s = stored();
    expect(s.output).toEqual(output);
    expect(s.input?.betrieb).toBe("FC Trogen");
    expect(JSON.parse(readLocal("mt:kommunikationskonzept") ?? "{}")).toMatchObject({ v: 1, output: { kernbotschaft: output.kernbotschaft } });

    // Profil: Kanäle heute nur, weil das Feld leer war
    expect(storedProfile().kanaele).toEqual([{ name: "Website" }, { name: "WhatsApp-Gruppen" }]);
    expectCalmText("Ergebnis");
  });

  it("lässt die Kanäle im Profil stehen, wenn dort schon welche sind", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL, kanaele: [{ name: "Facebook" }] }));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect(storedProfile().kanaele).toEqual([{ name: "Facebook" }]);
  });

  it("nimmt die Anspruchsgruppen mit, zeigt den Hinweis und schickt sie an die KI", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    writeLocal(
      "mt:anspruchsgruppen",
      JSON.stringify({
        v: 1,
        phase: "result",
        typ: "verein",
        gruppen: [
          { id: "g1", name: "Mitglieder", interesse: 5, einfluss: 4, beziehung: "eng", erwartung: "", bedarf: "" },
          { id: "g2", name: "Sponsoren", interesse: 4, einfluss: 5, beziehung: "lose", erwartung: "", bedarf: "" },
          { id: "g3", name: "Medien", interesse: 0, einfluss: 0, beziehung: "", erwartung: "", bedarf: "" },
        ],
        plan: [],
      }),
    );
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    const hinweis = screen.getByTestId("gruppen-hinweis");
    expect(hinweis).toHaveTextContent("Deine Anspruchsgruppen gehen mit: Mitglieder, Sponsoren.");
    expect(within(hinweis).getByRole("link", { name: "Anspruchsgruppen ändern" })).toHaveAttribute("href", "/tools/anspruchsgruppen");
    expect(screen.getByText(/und die Namen deiner Anspruchsgruppen mit Interesse und Einfluss/)).toBeInTheDocument();
    await erstellen(u);
    await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect((m.last("/api/generate")!.body as { input: { gruppen: unknown } }).input.gruppen).toEqual([
      { name: "Mitglieder", interesse: 5, einfluss: 4 },
      { name: "Sponsoren", interesse: 4, einfluss: 5 },
    ]);
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    expect((m.last("/api/result")!.body as { eingabe: string }).eingabe).toContain("Anspruchsgruppen: Mitglieder (Interesse 5, Einfluss 4); Sponsoren (Interesse 4, Einfluss 5)");
  });

  it("verweist ohne Anspruchsgruppen auf die Analyse und lässt es offen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    writeLocal("mt:anspruchsgruppen", "kein json");
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Vereinszweck");
    const hinweis = screen.getByTestId("gruppen-hinweis");
    expect(hinweis).toHaveTextContent("Noch keine Anspruchsgruppen gespeichert.");
    expect(within(hinweis).getByRole("link", { name: "Anspruchsgruppen-Analyse" })).toHaveAttribute("href", "/tools/anspruchsgruppen");
    expect(screen.queryByText(/und die Namen deiner Anspruchsgruppen/)).not.toBeInTheDocument();
  });

  it("nennt Platzhalter in eckigen Klammern über dem Konzept", async () => {
    const mit: KonzeptOutput = { ...output, ziele: [{ ziel: "Auf [Zielzahl] Mitglieder wachsen", messgroesse: "Mitglieder am Jahresende" }, output.ziele[1]] };
    mockApi(() => ({ status: 200, body: { ok: true, output: mit } }));
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    const karte = await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect(within(karte).getByTestId("platzhalter")).toHaveTextContent("Platzhalter ausfüllen: [Zielzahl]");
  });

  it("zeigt nach dem Neuladen das Konzept ohne neue Anfrage und ohne zweiten CRM-Eintrag", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Kommunikationskonzept" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vereinszweck")).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(1);
    expect(m.count("/api/result")).toBe(1);
  });

  it("öffnet mit «Angaben ändern» das Formular mit den Angaben, und «Neu beginnen» löscht das Konzept", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await u.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await erstellen(u);
    const karte = await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });

    await u.click(within(karte).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Vereinszweck")).toHaveValue(ZWECK);
    await waitFor(() => expect(screen.getByLabelText("Vereinszweck")).toHaveFocus());
    expect(screen.getByLabelText("Mitgliederzahl")).toHaveValue(180);
    expect(screen.getByLabelText("Entwicklung der Mitgliederzahl")).toHaveValue("waechst");
    expect(screen.getByRole("checkbox", { name: "Nachwuchs" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Helferinnen und Helfer" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByLabelText("Name des Anlasses 1")).toHaveValue("Dorffest");
    expect(screen.getByLabelText("Monat von Anlass 1")).toHaveValue("6");
    expect(screen.getByLabelText("Stunden pro Monat für die Kommunikation")).toHaveValue(6);
    await u.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Vereinszweck")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Vereinszweck")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein Kommunikationskonzept" })).not.toBeInTheDocument();
    expect(stored().output).toBeNull();
    expect(stored().input).toBeNull();
  });

  it("macht aus geänderten Angaben ein zweites Konzept und schickt auch das ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    const karte = await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    await u.click(within(karte).getByRole("button", { name: "Angaben ändern" }));
    await u.clear(await screen.findByLabelText("Mitgliederzahl"));
    await u.type(screen.getByLabelText("Mitgliederzahl"), "200");
    await erstellen(u);
    await waitFor(() => expect(m.count("/api/generate")).toBe(2));
    await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect((m.last("/api/generate")!.body as { input: { anzahl: number } }).input.anzahl).toBe(200);
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
    expect(stored().input?.anzahl).toBe(200);
  });

  it("meldet einen Fehler der KI ruhig, behält das Formular und speichert nichts", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi(() => ({ status: 502, body: { error: "ai_rejected" } }));
    const u = userEvent.setup();
    render(<Tool />);
    await fuelle(u);
    await erstellen(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert.");
    expect(screen.getByLabelText("Vereinszweck")).toHaveValue(ZWECK);
    expect(screen.getByLabelText("Mitgliederzahl")).toHaveValue(180);
    expect(screen.queryByRole("region", { name: "Dein Kommunikationskonzept" })).not.toBeInTheDocument();
    expect(stored().output).toBeNull();
    expect(m.count("/api/result")).toBe(0);
    expect(screen.getByRole("button", { name: "Konzept erstellen" })).toBeEnabled();
  });
});

describe("Kommunikationskonzept im Browser: Betrieb", () => {
  it("zeigt ohne Rechtsform den Wortlaut des Betriebs: Mitarbeitende, Nachfrage und Ziele für Kundschaft", async () => {
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Was dein Betrieb tut")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "KMU oder Selbständige" })).toBeChecked();
    expect(screen.getByLabelText("Mitarbeitende")).toHaveValue(null);
    expect(within(screen.getByLabelText("Entwicklung der Nachfrage")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bitte wählen", "wächst", "stabil", "schrumpft"]);
    expect(within(screen.getByRole("list", { name: "Ziele" })).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Neue Kundschaft gewinnen",
      "Stammkundschaft halten",
      "Fachkräfte und Lernende finden",
      "Bekanntheit in der Region",
    ]);
    expect(within(screen.getByRole("list", { name: "Kanäle heute" })).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual([
      "Website",
      "Google Business Profil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter oder Mail",
      "Gemeindeblatt oder Anzeiger",
      "Lokalpresse",
    ]);
    expect(screen.getByText(/Name, Ort und Kanton des Betriebs, Beschreibung, Zahl der Mitarbeitenden/)).toBeInTheDocument();
    expect(screen.getByText(/keine Namen von Kundschaft/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Vereinszweck|Mitgliederzahl|Vorstand|Generalversammlung/);
    expectCalmText("Formular des Betriebs");
  });

  it("meldet im Betrieb die Felder mit den Wörtern des Betriebs", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await erstellen(u);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an."));
    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Beschreib deinen Betrieb in mindestens 20 Zeichen");
    await u.click(screen.getByLabelText("Was dein Betrieb tut"));
    await u.paste(ZWECK_KMU);
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Gib die Zahl der Mitarbeitenden an");
    await u.type(screen.getByLabelText("Mitarbeitende"), "8");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, wie sich die Nachfrage entwickelt.");
    await u.selectOptions(screen.getByLabelText("Entwicklung der Nachfrage"), "stabil");
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens ein Ziel.");
    expect(screen.getByRole("checkbox", { name: "Neue Kundschaft gewinnen" })).toHaveFocus();
    expect(m.count("/api/generate")).toBe(0);
  });

  it("erstellt das Konzept für einen Betrieb: Typ «kmu», Zeile «Betrieb» im CRM, Untertitel und Hinweis im Wortlaut des Betriebs", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL_KMU));
    const m = mockApi(() => ({ status: 200, body: { ok: true, output: outputKmu } }));
    const u = userEvent.setup();
    render(<Tool />);
    await fuelleKmu(u);
    await u.click(screen.getByRole("checkbox", { name: "Fachkräfte und Lernende finden" }));
    await u.click(screen.getByRole("checkbox", { name: "Google Business Profil" }));
    await u.click(screen.getByRole("checkbox", { name: "LinkedIn" }));
    await erstellen(u);

    const karte = await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect(karte).toHaveTextContent("Das Konzept ist eine Vorlage. Die Geschäftsleitung prüft und ergänzt es, bevor es in die Jahresplanung geht.");
    expect(karte).not.toHaveTextContent(/Vorstand|Generalversammlung|Vereinsjahr/);

    const body = m.last("/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("kommunikationskonzept");
    expect(body.input).toMatchObject({
      typ: "kmu",
      betrieb: "Malerei Keller",
      ort: "Gossau",
      kanton: "St. Gallen",
      zweck: ZWECK_KMU,
      anzahl: 8,
      entwicklung: "stabil",
      ziele: ["neukunden", "fachkraefte"],
      kanaele: ["google", "linkedin"],
      stundenProMonat: 8,
      budget: 0,
    });
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")!.body as { eingabe: string; ausgabe: string; firma?: string };
    expect(crm.firma).toBe("Malerei Keller");
    expect(crm.eingabe.split("\n")[0]).toBe("Betrieb: Malerei Keller, Gossau (St. Gallen)");
    expect(crm.eingabe).toContain("Mitarbeitende: 8, Nachfrage stabil");
    expect(crm.eingabe).toContain("Ziele: Neue Kundschaft gewinnen, Fachkräfte und Lernende finden");
    expect(crm.ausgabe).toContain("Malerei Keller, Konzept für die Jahresplanung");
    expect(storedProfile().organisationstyp).toBe("kmu");
    expect(storedProfile().kanaele).toEqual([{ name: "Google Business Profil" }, { name: "LinkedIn" }]);
    expectCalmText("Ergebnis des Betriebs");
  });

  it("wechselt mit der Rechtsform Wortlaut, Ziele und Kanäle; Auswahl des anderen Typs zählt nicht mehr", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("checkbox", { name: "Nachwuchs" }));
    await u.click(screen.getByRole("checkbox", { name: "Aushang" }));
    expect(screen.getByLabelText("Vereinszweck")).toBeInTheDocument();

    await u.click(screen.getByRole("radio", { name: "KMU oder Selbständige" }));
    expect(await screen.findByLabelText("Was dein Betrieb tut")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Nachwuchs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Aushang" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Neue Kundschaft gewinnen" })).not.toBeChecked();
    expect(screen.getByLabelText("Firma")).toHaveValue("FC Trogen");
    expect(storedProfile().organisationstyp).toBe("kmu");

    await u.click(screen.getByLabelText("Was dein Betrieb tut"));
    await u.paste(ZWECK_KMU);
    await u.type(screen.getByLabelText("Mitarbeitende"), "8");
    await u.selectOptions(screen.getByLabelText("Entwicklung der Nachfrage"), "stabil");
    await u.type(screen.getByLabelText("Stunden pro Monat für die Kommunikation"), "8");
    // Das Ziel des Vereins ist nicht mehr gewählt: Es fehlt ein Ziel des Betriebs.
    await erstellen(u);
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens ein Ziel.");
    expect(m.count("/api/generate")).toBe(0);
  });
});

describe("Kommunikationskonzept im Browser: Website-Scan", () => {
  it("belegt die Kanäle aus der gespeicherten Website-Prüfung vor und sagt es", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL_KMU));
    writeLocal(CHECK_KEY, JSON.stringify(CHECK_STATE));
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Was dein Betrieb tut");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Website" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Newsletter oder Mail" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Google Business Profil" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Facebook" })).not.toBeChecked();
    expect(screen.getByText(/Vorbelegt aus der Website-Prüfung\./)).toBeInTheDocument();
    expect(screen.getByTestId("scan-stand")).toHaveTextContent("Gespeicherter Scan vom 03.10.2026: 3 Kanäle erkannt.");
  });

  it("sagt, dass Profil und Website-Prüfung die Kanäle vorbelegen, wenn beide etwas liefern", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL_KMU, kanaele: [{ name: "LinkedIn" }] }));
    writeLocal(CHECK_KEY, JSON.stringify(CHECK_STATE));
    mockApi();
    render(<Tool />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByText(/Vorbelegt aus deinem Firmenprofil und der Website-Prüfung\./)).toBeInTheDocument();
  });

  it("filtert die gefundenen Kanäle auf den Typ: Ein Verein bekommt kein LinkedIn und kein Google-Profil", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    writeLocal(CHECK_KEY, JSON.stringify({ ...CHECK_STATE, result: { ...CHECK_RESULT, facts: { hasNewsletter: false, gbpFound: true } } }));
    mockApi();
    render(<Tool />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.queryByRole("checkbox", { name: "LinkedIn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Google Business Profil" })).not.toBeInTheDocument();
  });

  it("prüft die Website, ergänzt die gewählten Kanäle um die gefundenen und schickt nichts ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL_KMU, website: "malerei-keller.ch" }));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    // Die Person hat schon einen Kanal gewählt: Er bleibt, die gefundenen kommen dazu.
    await u.click(await screen.findByRole("checkbox", { name: "Facebook" }));
    await u.click(screen.getByRole("button", { name: "Website prüfen" }));
    expect(await screen.findByTestId("scan-stand")).toHaveTextContent("Gespeicherter Scan vom 03.10.2026: 3 Kanäle erkannt.");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Facebook" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Website" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Newsletter oder Mail" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Website noch einmal prüfen" })).toBeEnabled();
    const check = m.calls.filter((c) => c.path === "/api/check");
    expect(check).toHaveLength(1);
    expect(check[0].body).toMatchObject({ company: "Malerei Keller", website: "malerei-keller.ch", city: "Gossau" });
    expect(JSON.stringify(check[0].body)).not.toContain("anna@keller.ch");
    expect(m.count("/api/result")).toBe(0);
    expect(m.count("/api/generate")).toBe(0);
  });

  it("meldet eine fehlende Website am Scan und lässt das Formular unberührt", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL_KMU));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Website prüfen" }));
    expect(await screen.findByTestId("scan-fehler")).toHaveTextContent("Bitte gib eine Website an.");
    expect(m.calls.filter((c) => c.path === "/api/check")).toHaveLength(0);
    expect(screen.queryByTestId("scan-stand")).not.toBeInTheDocument();
  });
});

describe("Kommunikationskonzept im Browser: Hinweis auf Alperna", () => {
  const pitchData = {
    toolName: "Kommunikationskonzept",
    toolSlug: "kommunikationskonzept",
    bausteine: [{ name: "Social Media" as const, text: "Wir betreuen deine Kanäle und halten den Rhythmus." }],
    whatsappNumber: "41791234567",
    erstgespraechUrl: "https://example.ch/erstgespraech",
  };
  const mitSocial: KonzeptOutput = {
    ...output,
    kanalplan: [
      { kanal: "Instagram", zweck: "Bilder von Spielen und vom Dorffest.", rhythmus: "wöchentlich", verantwortlich: "" },
      { kanal: "Facebook", zweck: "Termine und Berichte für Eltern.", rhythmus: "wöchentlich", verantwortlich: "" },
    ],
  };

  it("nennt bei zwei Social-Media-Kanälen und knapper Zeit den Baustein mit einem Satz aus dem Ergebnis", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi(() => ({ status: 200, body: { ok: true, output: mitSocial } }));
    const u = userEvent.setup();
    render(
      <PitchProvider data={pitchData}>
        <Tool />
      </PitchProvider>,
    );
    await fuelle(u);
    await erstellen(u);
    const pitch = await screen.findByTestId("result-pitch");
    expect(pitch).toHaveTextContent("Dein Konzept plant 2 Social-Media-Kanäle bei 6 Stunden im Monat.");
    expect(pitch).toHaveTextContent("Wir betreuen deine Kanäle");
    expect(within(pitch).getByRole("link", { name: "Kostenloses Erstgespräch" })).toHaveAttribute("href", "https://example.ch/erstgespraech");
    expect(within(pitch).getByRole("link", { name: "Kurz schreiben" }).getAttribute("href")).toContain(encodeURIComponent("Dein Konzept plant 2 Social-Media-Kanäle"));
    expect(pitch.textContent).not.toMatch(/CHF|Preis|ab \d/);
    expectCalmText("Ergebnis mit Hinweis");
  });

  it("zeigt keinen Hinweis, wenn das Konzept höchstens einen Social-Media-Kanal plant", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    mockApi();
    const u = userEvent.setup();
    render(
      <PitchProvider data={pitchData}>
        <Tool />
      </PitchProvider>,
    );
    await fuelle(u);
    await erstellen(u);
    await screen.findByRole("region", { name: "Dein Kommunikationskonzept" });
    expect(screen.queryByTestId("result-pitch")).not.toBeInTheDocument();
  });
});
