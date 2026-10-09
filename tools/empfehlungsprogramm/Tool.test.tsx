// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { parseState } from "./logic";

// Durchlauf im Browser (jsdom): Formular, E-Mail-Fenster, Ergebnis, CRM, Dateien, Stand nach dem Neuladen.
// Die Schriften kommen aus public/fonts, der QR-Code für den Bildschirm wird ersetzt (jsdom hat kein Canvas).

const downloads = vi.hoisted(() => [] as { name: string; mime: string; size: number }[]);
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string, mime: string) => {
    downloads.push({ name, mime, size: bytes.length });
  },
}));
vi.mock("@/lib/export/fonts", async (orig) => {
  const real = await orig<typeof import("@/lib/export/fonts")>();
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
  return {
    ...real,
    loadPdfFonts: async () => ({
      title: read(real.FONT_PATHS.title),
      heading: read(real.FONT_PATHS.heading),
      body: read(real.FONT_PATHS.body),
      bodyMedium: read(real.FONT_PATHS.bodyMedium),
    }),
  };
});
vi.mock("./export", async (orig) => {
  const real = await orig<typeof import("./export")>();
  return { ...real, qrDataUrl: async () => "data:image/png;base64,iVBORw0KGgo=" };
});

type Call = { path: string; body: Record<string, unknown> };

function mockApi(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (p: string, init?: RequestInit) => {
      calls.push({ path: p, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return { ok: true, status: 200, text: async () => "", json: async () => ({ ok: true }) };
    }),
  );
  return calls;
}

const KELLER = { firma: "Malerei Keller, Gossau", ort: "Gossau", website: "malerei-keller.ch" };

beforeEach(() => {
  clearAllLocal();
  downloads.length = 0;
  writeLocal(LEAD_KEY, "anna@keller.ch");
  writeLocal(PROFILE_KEY, JSON.stringify(KELLER));
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

/** Füllt das Formular der Malerei Keller bis zum Knopf «Programm entwerfen». */
async function fill(u: User, opts: { anrede?: "Du" | "Sie"; kanal?: string; anreiz?: string; beide?: boolean } = {}) {
  await u.type(await screen.findByLabelText(/^(Kundenwert pro Jahr|Jahresbeitrag pro Mitglied) in CHF$/), "3000");
  await u.type(screen.getByLabelText("Marge in Prozent"), "25");
  await u.selectOptions(screen.getByLabelText("Anreiz"), opts.anreiz ?? "Gutschein");
  await u.selectOptions(screen.getByLabelText("Kanal der Ansprache"), opts.kanal ?? "Karte beim Auftrag");
  if (opts.beide !== false) await u.click(screen.getByRole("checkbox", { name: "Beide Seiten belohnen" }));
  await u.click(screen.getByRole("radio", { name: opts.anrede ?? "Du" }));
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

describe("Empfehlungsprogramm im Browser", () => {
  it("führt vom Formular zum Ergebnis, schickt Eingabe und Ausgabe ins CRM und zeigt Anreiz, Mechanik, Vorlagen", async () => {
    writeLocal("mt:whatsapp-link", JSON.stringify({ v: 1, phase: "result", nummer: "079 123 45 67", vorlage: "anfrage", text: "" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    // Formular: Grunddaten aus dem Profil, Pflichtfelder, Nummer erscheint nur bei WhatsApp oder Karte
    expect(await screen.findByLabelText("Firma")).toHaveValue("Malerei Keller, Gossau");
    expect(screen.getByLabelText("Website")).toHaveValue("malerei-keller.ch");
    expect(screen.queryByLabelText("WhatsApp-Nummer")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Anreiz")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Bitte wählen",
      "Rabatt auf den nächsten Auftrag",
      "Gutschein",
      "Spende an einen Verein",
      "Zusatzleistung",
      "Nichts Materielles (Dank und Sichtbarkeit)",
    ]);
    expect(within(screen.getByLabelText("Kanal der Ansprache")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Bitte wählen",
      "WhatsApp",
      "E-Mail",
      "Persönlich",
      "Karte beim Auftrag",
    ]);
    expectCalmText("Formular");

    // Fehlermeldungen in role="alert", Fokus im Feld
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Gib den Kundenwert pro Jahr an.");
    expect(screen.getByLabelText("Kundenwert pro Jahr in CHF")).toHaveFocus();
    await u.type(screen.getByLabelText("Kundenwert pro Jahr in CHF"), "3000");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    await u.type(screen.getByLabelText("Marge in Prozent"), "25");
    expect(screen.getByTestId("ep-db")).toHaveTextContent("Deckungsbeitrag: CHF 750.- pro Jahr.");
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, was die Person als Dank bekommt.");
    await u.selectOptions(screen.getByLabelText("Anreiz"), "Gutschein");
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle, wie du um Empfehlungen bittest.");
    await u.selectOptions(screen.getByLabelText("Kanal der Ansprache"), "Karte beim Auftrag");

    // Die Nummer ist aus dem WhatsApp-Werkzeug vorbelegt
    expect(await screen.findByLabelText("WhatsApp-Nummer")).toHaveValue("079 123 45 67");
    await u.clear(screen.getByLabelText("WhatsApp-Nummer"));
    await u.type(screen.getByLabelText("WhatsApp-Nummer"), "12345");
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Diese Nummer hat zu viele oder zu wenige Stellen.");
    expect(screen.getByLabelText("WhatsApp-Nummer")).toHaveFocus();
    await u.clear(screen.getByLabelText("WhatsApp-Nummer"));
    await u.type(screen.getByLabelText("WhatsApp-Nummer"), "079 123 45 67");
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle die Anrede: Du oder Sie.");
    await u.click(screen.getByRole("checkbox", { name: "Beide Seiten belohnen" }));
    await u.click(screen.getByRole("radio", { name: "Du" }));
    expect(calls).toHaveLength(0); // vor dem Ergebnis geht nichts raus
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));

    // Ergebnis
    const card = await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    expect(within(card).getByTestId("anreiz-spanne")).toHaveTextContent("CHF 40.- bis CHF 75.- je Seite");
    expect(within(card).getByTestId("anreiz-kasten")).toHaveTextContent("Deckungsbeitrag");
    expect(within(card).getByTestId("anreiz-richtwert")).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    // Rechenmodell: ohne Zahl der Kundschaft ein Beispiel mit 100, drei Szenarien, Zurückverdient-Zeit
    const modell = within(card).getByTestId("modell");
    expect(modell).toHaveTextContent("Eine gewonnene Kundin bringt dir netto");
    expect(modell).toHaveTextContent("Beispiel mit 100 Kundinnen und Kunden");
    for (const label of ["Vorsichtig: 2 % empfehlen", "Realistisch: 5 % empfehlen", "Mutig: 10 % empfehlen"]) expect(modell).toHaveTextContent(label);
    expect(modell).toHaveTextContent("zurückverdient");
    expect(modell).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    const mechanik = within(card).getByRole("list", { name: "Mechanik" });
    expect(within(mechanik).getAllByRole("listitem")).toHaveLength(5);
    expect(mechanik).toHaveTextContent("Auftrag abgeschlossen.");
    expect(mechanik).toHaveTextContent("Dank und Anreiz an beide.");
    const vorlagen = within(card).getByRole("list", { name: "Vorlagen" });
    expect(within(vorlagen).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).getByTestId("vorlage-bitte")).toHaveTextContent("Als Dank gibt es für dich und die empfohlene Person je CHF 60.- als Gutschein.");
    expect(within(card).getByTestId("vorlage-bitte")).toHaveTextContent("https://wa.me/41791234567");
    expect(within(card).getByRole("button", { name: "Bitte um Empfehlung kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Nachricht an Empfohlene kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Dank kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Einseiter kopieren" })).toBeInTheDocument();
    for (const name of ["Einseiter (PDF)", "Word", "Karte A6 (PDF)", "Angaben ändern", "Neu beginnen"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(await within(card).findByTestId("qr-image")).toBeInTheDocument();
    expect(within(card).getByTestId("qr-hinweis")).toHaveTextContent("WhatsApp-Chat mit 079 123 45 67");
    expectCalmText("Ergebnis");

    // Das Ergebnis geht einmal ins CRM, mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("empfehlungsprogramm");
    expect(body.firma).toBe("Malerei Keller, Gossau");
    expect(String(body.eingabe).split("\n")).toEqual([
      "Betrieb: Malerei Keller, Gossau",
      "Website: malerei-keller.ch",
      "Kundenwert pro Jahr: CHF 3'000.-",
      "Marge: 25 %",
      "Kundschaft pro Jahr: keine Angabe (Beispiel mit 100)",
      "Anreiz: Gutschein",
      "Beide Seiten belohnen: ja",
      "Kanal: Karte beim Auftrag",
      "WhatsApp-Nummer: 079 123 45 67",
      "Anrede: Du",
    ]);
    expect(String(body.ausgabe).startsWith("# Empfehlungsprogramm Malerei Keller, Gossau")).toBe(true);
    expect(String(body.ausgabe)).toContain("CHF 40.- bis CHF 75.- je Seite");

    // Stand für den Pfad
    expect(parseState(JSON.parse(readLocal("mt:empfehlungsprogramm")!))).toMatchObject({ v: 1, phase: "result", form: { kundenwert: "3000", kanal: "karte", beide: true, anrede: "du" } });
  });

  it("schaltet die Vorlagen zwischen Du und Sie um und lädt Einseiter, Word und Karte herunter", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fill(u, { kanal: "WhatsApp" });
    await u.type(await screen.findByLabelText("WhatsApp-Nummer"), "0791234567");
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    const card = await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));

    expect(within(card).getByRole("button", { name: "Du", pressed: true })).toBeInTheDocument();
    expect(within(card).getByTestId("vorlage-dank")).toHaveTextContent("Danke, dass du uns weiterempfohlen hast.");
    await u.click(within(card).getByRole("button", { name: "Sie" }));
    expect(within(card).getByRole("button", { name: "Sie", pressed: true })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Du", pressed: false })).toBeInTheDocument();
    expect(within(card).getByTestId("vorlage-dank")).toHaveTextContent("Danke, dass Sie uns weiterempfohlen haben.");
    expect(within(card).getByTestId("vorlage-bitte")).toHaveTextContent("Guten Tag [Name]");

    await u.click(within(card).getByRole("button", { name: "Einseiter (PDF)" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    await u.click(within(card).getByRole("button", { name: "Word" }));
    await waitFor(() => expect(downloads).toHaveLength(2));
    await u.click(within(card).getByRole("button", { name: "Karte A6 (PDF)" }));
    await waitFor(() => expect(downloads).toHaveLength(3));
    expect(downloads.map((d) => d.name)).toEqual([
      "empfehlungsprogramm-malerei-keller-gossau.pdf",
      "empfehlungsprogramm-malerei-keller-gossau.docx",
      "empfehlungskarte-a6-malerei-keller-gossau.pdf",
    ]);
    expect(downloads.map((d) => d.mime)).toEqual(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf"]);
    expect(downloads.every((d) => d.size > 1000)).toBe(true);
    expect(within(card).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fragt vor dem Ergebnis nach der Adresse; «Später» lässt das Formular stehen und schickt nichts", async () => {
    clearAllLocal(); // keine Adresse bekannt
    writeLocal(PROFILE_KEY, JSON.stringify(KELLER));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fill(u);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Marge in Prozent")).toHaveValue(25);
    expect(screen.queryByRole("region", { name: "Dein Empfehlungsprogramm" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("zeigt nach dem Neuladen das Ergebnis ohne zweiten CRM-Eintrag, «Angaben ändern» und «Neu beginnen» führen zurück", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await fill(u, { anreiz: "Nichts Materielles (Dank und Sichtbarkeit)", kanal: "Persönlich", beide: false });
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    expect(screen.getByTestId("anreiz-spanne")).toHaveTextContent("Ohne Betrag: Dank und Sichtbarkeit");
    expect(screen.getByTestId("anerkennung").querySelectorAll("li")).toHaveLength(3);
    expect(screen.queryByTestId("anreiz-richtwert")).not.toBeInTheDocument();
    expect(screen.getByTestId("qr-hinweis")).toHaveTextContent("führt auf malerei-keller.ch");

    first.unmount();
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Marge in Prozent")).toHaveValue(25);
    expect(screen.getByLabelText("Kanal der Ansprache")).toHaveValue("persoenlich");
    expect(screen.getByLabelText("Anreiz")).toHaveValue("ideell");
    expect(JSON.parse(readLocal("mt:empfehlungsprogramm")!).phase).toBe("edit");

    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Marge in Prozent")).toHaveValue(null);
    expect(parseState(JSON.parse(readLocal("mt:empfehlungsprogramm")!)).phase).toBe("edit");
  });

  it("wechselt bei einem Verein die Bezeichnungen und nennt Mitglied und Eintritt", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein", firma: "FC Trogen", website: "fc-trogen.ch" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    expect(await screen.findByLabelText("Jahresbeitrag pro Mitglied in CHF")).toBeInTheDocument();
    expect(screen.getByText("Dein Verein")).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.queryByLabelText(/Kundenwert/)).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Kanal der Ansprache")).getByRole("option", { name: "Karte beim Anlass" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Anreiz")).getByRole("option", { name: "Ermässigung auf den nächsten Jahresbeitrag" })).toBeInTheDocument();
    expect(screen.getByText("Anrede deiner Mitglieder")).toBeInTheDocument();

    await fill(u, { kanal: "Karte beim Anlass", anreiz: "Ermässigung auf den nächsten Jahresbeitrag" });
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    const card = await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    expect(within(card).getByRole("list", { name: "Mechanik" })).toHaveTextContent("Mitglied ist zufrieden.");
    expect(within(card).getByRole("list", { name: "Mechanik" })).toHaveTextContent("Eintritt kommt zustande.");
    expect(within(card).getByTestId("vorlage-dank")).toHaveTextContent("Die Empfehlung hat zu einem Eintritt geführt");
    expect(card.textContent).not.toMatch(/Auftrag|Kundenwert|Kundschaft/);
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(String(body.eingabe)).toContain("Verein: FC Trogen");
    expect(String(body.eingabe)).toContain("Jahresbeitrag pro Mitglied: CHF 3'000.-");
    expectCalmText("Verein");
  });

  it("zeigt bei E-Mail den Hinweis zum Versand und lässt die Nummer weg", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fill(u, { kanal: "E-Mail" });
    expect(screen.queryByLabelText("WhatsApp-Nummer")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Programm entwerfen" }));
    const card = await screen.findByRole("region", { name: "Dein Empfehlungsprogramm" });
    expect(within(card).getByTestId("hinweise")).toHaveTextContent(
      "Versand nur an Personen, die dir ihre Adresse im Rahmen eines Auftrags gegeben haben; Werbung per E-Mail hat Regeln; ein Werkzeug dazu ist geplant.",
    );
    expect(within(card).getByTestId("qr-hinweis")).toHaveTextContent("führt auf malerei-keller.ch");
    expect(within(card).getByRole("list", { name: "Mechanik" })).toHaveTextContent("Du schickst eine E-Mail");
  });
});
