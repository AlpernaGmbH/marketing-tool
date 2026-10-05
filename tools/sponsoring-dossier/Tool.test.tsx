// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { downloadBytes } from "@/lib/download";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import { BEISPIEL_FORM, BEISPIEL_KI } from "./beispiel";
import { kiSignatur, type Form } from "./logic";
import Tool from "./Tool";

// Der Ablauf im Browser gegen einen Stub von /api/generate, /api/result und den Schriften: Formular, Ergebnis mit Ampel,
// Dossier, freiwillige KI-Texte, Downloads, CRM ohne Kontaktdaten, Stand nach dem Neuladen.

vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));

const PROFIL = { organisationstyp: "verein", firma: "FC Trogen", ort: "Trogen", kanton: "AR" };
const STATE_KEY = "mt:sponsoring-dossier";

type Call = { path: string; body: Record<string, unknown> };

function mockApi(generate: { status: number; body: unknown } = { status: 200, body: { ok: true, output: BEISPIEL_KI } }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const p = String(input);
      calls.push({ path: p, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (p === "/api/generate") return json(generate.body, generate.status);
      if (p === "/api/result" || p === "/api/lead") return json({ ok: true });
      if (p.startsWith("/fonts/")) return new Response(new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p))), { status: 200 });
      return json({}, 404);
    }),
  );
  return { calls, of: (p: string) => calls.filter((c) => c.path === p) };
}

function seed(form: Form = BEISPIEL_FORM, extra: Record<string, unknown> = {}) {
  writeLocal(STATE_KEY, JSON.stringify({ v: 1, phase: "edit", form, ki: null, kiSig: "", ...extra }));
}

const erstellen = () => screen.findByRole("button", { name: "Dossier erstellen" });

beforeEach(() => {
  clearAllLocal();
  vi.mocked(downloadBytes).mockClear();
  writeLocal(LEAD_KEY, "anna@keller.ch");
  writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

describe("Sponsoring-Dossier: Formular", () => {
  it("zeigt alle Felder mit Beschriftung, Profilwerte vorbefüllt, und drei Pakete mit Vorschlägen", async () => {
    mockApi();
    render(<Tool />);
    expect(await erstellen()).toBeEnabled();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Ort")).toHaveValue("Trogen");
    expect(screen.getByLabelText("Kanton")).toHaveValue("AR");
    for (const name of [
      "Website",
      "Anlass oder Saison (freiwillig)",
      "Mitglieder",
      "Davon Aktive (freiwillig)",
      "Zuschauer pro Anlass (freiwillig)",
      "Anlässe pro Jahr (freiwillig)",
      "Follower auf Instagram (freiwillig)",
      "Follower auf Facebook (freiwillig)",
      "Website-Besuche pro Monat (freiwillig)",
      "Medienberichte pro Jahr (freiwillig)",
      "Welche Betriebe passen zu euch, und warum?",
      "Bisherige Sponsoren und Partner (nenne nur Betriebe, die einverstanden sind)",
      "Name der Ansprechperson",
      "Funktion (freiwillig)",
      "Telefon (freiwillig)",
      "E-Mail der Ansprechperson (freiwillig)",
      "Vereinsfarbe",
      "Stichworte zum Verein",
    ]) {
      expect(screen.getByLabelText(name), name).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Vereinsfarbe")).toHaveValue("#111a28");
    for (const [n, vorschlag] of [[1, "Bronze"], [2, "Silber"], [3, "Gold"]] as const) {
      expect(screen.getByLabelText(`Paket ${n}: Name`)).toHaveValue(vorschlag);
      expect(screen.getByLabelText(`Paket ${n}: Preis in CHF`)).toHaveValue(null);
      for (const l of ["Logo auf Trikot", "Logo auf Bande", "Logo auf Website", "Logo im Newsletter", "Nennung bei Anlässen", "Stand am Anlass", "Nennung in Medienmitteilungen"]) {
        expect(screen.getByLabelText(`Paket ${n}: ${l}`)).not.toBeChecked();
      }
      expect(screen.getByLabelText(`Paket ${n}: Beiträge auf Social Media pro Jahr`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Paket ${n}: Tickets oder Einladungen pro Jahr`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Paket ${n}: Weitere Gegenleistung (freiwillig)`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("kontakt-hinweis")).toHaveTextContent("gehen aber nicht an die KI und nicht an Alperna");
  });

  it("meldet fehlende Angaben der Reihe nach in einer Meldung mit role alert, ohne den Server zu fragen", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    expect(await screen.findByRole("alert")).toHaveTextContent("Gib die Zahl der Mitglieder an.");
    expect(document.getElementById("sd-error")).toHaveTextContent("Gib die Zahl der Mitglieder an.");
    await u.type(screen.getByLabelText("Mitglieder"), "280");
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Beschreib in ein paar Worten, welche Betriebe zu euch passen");
    await u.type(screen.getByLabelText("Welche Betriebe passen zu euch, und warum?"), "Betriebe aus Trogen und Speicher");
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Gib mindestens ein Paket mit Preis und einer Gegenleistung an.");
    await u.type(screen.getByLabelText("Paket 2: Preis in CHF"), "30");
    await u.click(screen.getByLabelText("Paket 2: Logo auf Bande"));
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Paket 2: Der Preis muss zwischen CHF 50.- und CHF 100'000.- liegen.");
    expect(m.calls).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Dein Sponsoring-Dossier" })).not.toBeInTheDocument();
  });

  it("weist eine zu helle Vereinsfarbe ab, am Feld und beim Erstellen", async () => {
    mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await erstellen();
    fireEvent.change(screen.getByLabelText("Vereinsfarbe"), { target: { value: "#ffd700" } });
    expect(await screen.findByTestId("farbe-hinweis")).toHaveTextContent("Diese Farbe ist auf Papier zu hell.");
    expect(screen.getByLabelText("Vereinsfarbe")).toHaveAttribute("aria-invalid", "true");
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Diese Farbe ist auf Papier zu hell.");
    fireEvent.change(screen.getByLabelText("Vereinsfarbe"), { target: { value: "#1b3a6b" } });
    expect(screen.queryByTestId("farbe-hinweis")).not.toBeInTheDocument();
    expect(screen.getByTestId("farbe-wert")).toHaveTextContent("#1B3A6B");
  });

  it("speichert jede Eingabe sofort unter mt:sponsoring-dossier mit phase edit", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await erstellen();
    await u.type(screen.getByLabelText("Mitglieder"), "120");
    await u.type(screen.getByLabelText("Paket 1: Preis in CHF"), "500");
    await u.click(screen.getByLabelText("Paket 1: Logo auf Website"));
    await u.type(screen.getByLabelText("Welche Betriebe passen zu euch, und warum?"), "Betriebe aus der Region ");
    const stand = JSON.parse(readLocal(STATE_KEY) ?? "null") as { v: number; phase: string; form: Form };
    expect(stand.v).toBe(1);
    expect(stand.phase).toBe("edit");
    expect(stand.form.zahlen.mitglieder).toBe("120");
    expect(stand.form.pakete[0]).toMatchObject({ name: "Bronze", preis: "500", haken: ["website"] });
    expect(stand.form.zielgruppe).toBe("Betriebe aus der Region ");
  });
});

describe("Sponsoring-Dossier: Ergebnis ohne KI", () => {
  it("zeigt Ampel und Dossier, schickt Eingabe und Ausgabe ohne Kontaktdaten ins CRM und ruft die KI nicht", async () => {
    const m = mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());

    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(m.of("/api/generate")).toHaveLength(0);
    // Fokus auf der Überschrift des Ergebnisses (Tastatur und Screenreader)
    await waitFor(() => expect(within(card).getByRole("heading", { name: "Dein Sponsoring-Dossier" })).toHaveFocus());

    // Ampel: Farbe plus Text, nie nur Farbe
    const ampel = within(card).getByRole("list", { name: "Einschätzung je Paket" });
    const punkte = within(ampel).getAllByRole("listitem");
    expect(punkte).toHaveLength(3);
    expect(punkte.map((p) => p.getAttribute("data-stufe"))).toEqual(["gruen", "gruen", "gelb"]);
    expect(punkte[0]).toHaveTextContent("Bronze: passt (grün)");
    expect(punkte[0]).toHaveTextContent("Preis CHF 500.-, Rahmen CHF 600.- (4 Punkte, Faktor 1,5): 83 % des Rahmens.");
    expect(punkte[2]).toHaveTextContent("Gold: eher hoch (gelb)");
    expect(punkte[2]).toHaveTextContent("Preis CHF 6'000.-, Rahmen CHF 3'600.- (24 Punkte, Faktor 1,5): 167 % des Rahmens.");
    expect(within(card).getByTestId("ampel-hinweis")).toHaveTextContent("Einschätzung von Alperna, keine Marktdaten.");
    expect(within(card).getByTestId("ampel-regel")).toHaveTextContent("zwischen 60 und 140 % des Rahmens");

    // Dossier
    const dossier = within(card).getByTestId("dossier");
    expect(dossier).toHaveTextContent("Sponsoring FC Trogen");
    expect(dossier).toHaveTextContent("Saison 2026/27, Trogen AR");
    expect(dossier).toHaveTextContent("Der Verein in Zahlen");
    expect(dossier).toHaveTextContent("Alle Zahlen sind Angaben des Vereins.");
    expect(dossier).toHaveTextContent("Pakete im Vergleich");
    expect(dossier).toHaveTextContent("CHF 6'000.-");
    expect(dossier).toHaveTextContent("Schreinerei Eugster");
    expect(dossier).toHaveTextContent("Lea Frei, Präsidentin");
    expect(dossier).not.toHaveTextContent("eher hoch");
    expect(dossier).not.toHaveTextContent("Porträt des Vereins");
    const tabellen = within(dossier).getAllByRole("table");
    expect(tabellen).toHaveLength(2);
    const tabelle = tabellen[1];
    const kopf = within(tabelle).getAllByRole("columnheader").map((h) => h.textContent);
    expect(kopf).toEqual(["Gegenleistung", "Bronze", "Silber", "Gold"]);

    // KI-Knopf aktiv, weil Stichworte da sind
    expect(within(card).getByRole("button", { name: "Texte von der KI schreiben lassen" })).toBeEnabled();
    expect(within(card).queryByTestId("ki-hinweis")).not.toBeInTheDocument();
    for (const name of ["Text kopieren", "PDF herunterladen", "Word herunterladen", "Angaben ändern", "Neu beginnen"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }

    // Stand: Ergebnis erkennt der Pfad-Fortschritt an phase result
    const stand = JSON.parse(readLocal(STATE_KEY) ?? "null") as { v: number; phase: string; form: Form; ki: unknown };
    expect(stand).toMatchObject({ v: 1, phase: "result", ki: null });
    expect(stand.form.verein).toBe("FC Trogen");
    expect(stand.form.ort).toBe("Trogen");

    // CRM: lesbare Angaben und Markdown, ohne Kontaktdaten, ohne Namen der Referenzen, mit der Einschätzung vorne
    await waitFor(() => expect(m.of("/api/result")).toHaveLength(1));
    const crm = m.of("/api/result")[0].body as { tool: string; firma: string; eingabe: string; ausgabe: string };
    expect(crm.tool).toBe("sponsoring-dossier");
    expect(crm.firma).toBe("FC Trogen");
    expect(crm.eingabe.startsWith("Verein: FC Trogen\nOrt: Trogen AR\nAnlass oder Saison: Saison 2026/27\nMitglieder: 280")).toBe(true);
    expect(crm.eingabe).toContain("Bronze: CHF 500.-; Logo auf Website, Logo im Newsletter, Nennung bei Anlässen");
    expect(crm.ausgabe.startsWith("Einschätzung von Alperna, keine Marktdaten: Bronze CHF 500.- passt (Rahmen CHF 600.-)")).toBe(true);
    expect(crm.ausgabe).toContain("# Sponsoring FC Trogen");
    for (const geheim of ["Lea Frei", "071 000 00 00", "fc-trogen.example", "Eugster", "Zuberbühler", "Gegründet 1948"]) {
      expect(crm.eingabe).not.toContain(geheim);
      expect(crm.ausgabe).not.toContain(geheim);
    }
  });

  it("zeigt nach dem Neuladen das Ergebnis ohne neue Anfrage, und «Angaben ändern» füllt das Formular", async () => {
    const m = mockApi();
    seed();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await u.click(await erstellen());
    await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    await waitFor(() => expect(m.of("/api/result")).toHaveLength(1));
    first.unmount();

    const calls = m.calls.length;
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(m.calls.length).toBe(calls);
    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Dossier erstellen" })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
    expect(screen.getByLabelText("Mitglieder")).toHaveValue(280);
    expect(screen.getByLabelText("Paket 2: Preis in CHF")).toHaveValue(1500);
    expect(screen.getByLabelText("Paket 2: Logo auf Bande")).toBeChecked();
    expect(screen.getByLabelText("Paket 1: Logo auf Bande")).not.toBeChecked();
    expect(screen.getByLabelText("Name der Ansprechperson")).toHaveValue("Lea Frei");
    expect(JSON.parse(readLocal(STATE_KEY) ?? "{}").phase).toBe("edit");
  });

  it("setzt mit «Neu beginnen» die Angaben zurück, das Profil bleibt", async () => {
    mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    await u.click(within(card).getByRole("button", { name: "Neu beginnen" }));
    expect(await erstellen()).toBeInTheDocument();
    expect(screen.getByLabelText("Mitglieder")).toHaveValue(null);
    expect(screen.getByLabelText("Paket 1: Name")).toHaveValue("Bronze");
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
  });

  it("fragt vor dem Ergebnis nach der Adresse, wenn keine bekannt ist, und zeigt bei «Später» kein Ergebnis", async () => {
    const m = mockApi();
    seed();
    removeLocal(LEAD_KEY);
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("region", { name: "Dein Sponsoring-Dossier" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dossier erstellen" })).toBeInTheDocument();
    expect(m.of("/api/result")).toHaveLength(0);
    expect(JSON.parse(readLocal(STATE_KEY) ?? "{}").phase).toBe("edit");
  });
});

describe("Sponsoring-Dossier: Downloads", () => {
  it("lädt das PDF und Word mit Dateinamen nach dem Verein und kopiert den Text frei", async () => {
    mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });

    await u.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [pdfBytes, pdfName, pdfMime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(pdfName).toBe("sponsoring-dossier-fc-trogen.pdf");
    expect(pdfMime).toBe("application/pdf");
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");

    await u.click(within(card).getByRole("button", { name: "Word herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(2), { timeout: 15000 });
    const [docxBytes, docxName, docxMime] = vi.mocked(downloadBytes).mock.calls[1];
    expect(docxName).toBe("sponsoring-dossier-fc-trogen.docx");
    expect(docxMime).toContain("wordprocessingml");
    expect(Array.from(docxBytes.slice(0, 2))).toEqual([0x50, 0x4b]); // ZIP
  }, 30000);

  it("fragt vor dem Download nach der Adresse, wenn keine bekannt ist, und lädt bei «Später» nichts", async () => {
    mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    act(() => removeLocal(LEAD_KEY));
    await u.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(downloadBytes).not.toHaveBeenCalled();
  });
});

describe("Sponsoring-Dossier: freiwillige KI-Texte", () => {
  it("lässt den Knopf aus und sagt warum, solange die Stichworte fehlen; das Dossier bleibt vollständig", async () => {
    const m = mockApi();
    seed({ ...BEISPIEL_FORM, stichworte: "" });
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(within(card).getByRole("button", { name: "Texte von der KI schreiben lassen" })).toBeDisabled();
    expect(within(card).getByTestId("ki-leer")).toHaveTextContent("Für die KI-Texte brauchst du Stichworte zum Verein (mindestens 10 Zeichen).");
    expect(within(card).getByTestId("dossier")).toHaveTextContent("Pakete im Vergleich");
    expect(m.of("/api/generate")).toHaveLength(0);
  });

  it("schreibt drei Absätze ins Dossier, schickt der KI nur die erlaubten Angaben und gibt die Absätze zusätzlich ins CRM", async () => {
    const m = mockApi();
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    await waitFor(() => expect(m.of("/api/result")).toHaveLength(1));

    expect(within(card).getByTestId("ki-daten")).toHaveTextContent("nicht deine E-Mail-Adresse, nicht die Kontaktdaten und nicht die Referenzen");
    await u.click(within(card).getByRole("button", { name: "Texte von der KI schreiben lassen" }));

    await waitFor(() => expect(within(card).getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest."));
    const dossier = within(card).getByTestId("dossier");
    expect(dossier).toHaveTextContent("Porträt des Vereins");
    expect(dossier).toHaveTextContent(BEISPIEL_KI.portraet);
    expect(dossier).toHaveTextContent("Warum Sponsoring hier wirkt");
    expect(dossier).toHaveTextContent(BEISPIEL_KI.warum);
    expect(dossier).toHaveTextContent(BEISPIEL_KI.dank);

    // Anfrage an /api/generate: Werkzeug und Eingabe, ohne Kontakt, Referenzen, Website
    const gen = m.of("/api/generate");
    expect(gen).toHaveLength(1);
    const body = gen[0].body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("sponsoring-dossier");
    expect(Object.keys(body.input).sort()).toEqual(["ort", "pakete", "stichworte", "verein", "zahlen", "zielgruppe"]);
    expect(body.input).toMatchObject({ verein: "FC Trogen", ort: "Trogen AR" });
    for (const geheim of ["Lea Frei", "071 000 00 00", "fc-trogen.example", "Eugster", "anna@keller.ch"]) expect(JSON.stringify(body)).not.toContain(geheim);

    // Zweiter Eintrag im CRM: die Angaben an die KI und die drei Absätze
    await waitFor(() => expect(m.of("/api/result")).toHaveLength(2));
    const crm = m.of("/api/result")[1].body as { eingabe: string; ausgabe: string };
    expect(crm.eingabe).toContain("Stichworte: Gegründet 1948");
    expect(crm.ausgabe.startsWith("Porträt des Vereins\n")).toBe(true);
    expect(crm.ausgabe).toContain("Dank und nächste Schritte");

    // Stand mit den Absätzen und der Signatur
    const stand = JSON.parse(readLocal(STATE_KEY) ?? "null") as { phase: string; ki: unknown; kiSig: string };
    expect(stand.phase).toBe("result");
    expect(stand.ki).toEqual(BEISPIEL_KI);
    expect(stand.kiSig).toBe(kiSignatur({ ...BEISPIEL_FORM, verein: "FC Trogen", ort: "Trogen", kanton: "AR", website: "" }));
  });

  it("meldet einen Ausfall der KI ruhig, ohne das Dossier zu ändern", async () => {
    mockApi({ status: 502, body: { error: "ai_rejected" } });
    seed();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await erstellen());
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    await u.click(within(card).getByRole("button", { name: "Texte von der KI schreiben lassen" }));
    await waitFor(() => expect(document.getElementById("sd-ki-error")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal."));
    expect(within(card).getByTestId("dossier")).not.toHaveTextContent("Porträt des Vereins");
    expect(within(card).getByRole("button", { name: "Texte von der KI schreiben lassen" })).toBeEnabled();
  });

  it("behält die KI-Texte, wenn sich nur Kontakt oder Farbe ändern, und wirft sie weg, wenn sich ein Preis ändert", async () => {
    mockApi();
    const form = { ...BEISPIEL_FORM, verein: "FC Trogen", ort: "Trogen", kanton: "AR", website: "" };
    seed(BEISPIEL_FORM, { phase: "result", ki: BEISPIEL_KI, kiSig: kiSignatur(form) });
    const u = userEvent.setup();
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(within(card).getByTestId("dossier")).toHaveTextContent(BEISPIEL_KI.portraet);

    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    await u.clear(await screen.findByLabelText("Funktion (freiwillig)"));
    await u.type(screen.getByLabelText("Funktion (freiwillig)"), "Kassierin");
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    const again = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(within(again).getByTestId("dossier")).toHaveTextContent(BEISPIEL_KI.portraet);
    expect(within(again).getByTestId("dossier")).toHaveTextContent("Lea Frei, Kassierin");

    await u.click(within(again).getByRole("button", { name: "Angaben ändern" }));
    const preis = await screen.findByLabelText("Paket 1: Preis in CHF");
    await u.clear(preis);
    await u.type(preis, "600");
    await u.click(screen.getByRole("button", { name: "Dossier erstellen" }));
    const neu = await screen.findByRole("region", { name: "Dein Sponsoring-Dossier" });
    expect(within(neu).getByTestId("dossier")).not.toHaveTextContent(BEISPIEL_KI.portraet);
    expect(JSON.parse(readLocal(STATE_KEY) ?? "{}")).toMatchObject({ ki: null, kiSig: "" });
  });
});
