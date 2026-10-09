// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { downloadBytes } from "@/lib/download";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));
vi.setConfig({ testTimeout: 20000 });

const sent: { url: string; body: Record<string, string> }[] = [];

beforeEach(() => {
  clearAllLocal();
  vi.mocked(downloadBytes).mockClear();
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      // Schriften für das PDF kommen aus public/fonts, alles andere gilt als CRM-Aufruf.
      if (String(url).startsWith("/fonts/")) return new Response(fs.readFileSync(path.join(process.cwd(), "public", String(url))), { status: 200 });
      // Die Frage an den Server nach der gemerkten Adresse (ToolShell) ist kein Aufruf ins CRM.
      if (String(url) === "/api/gate") return new Response(JSON.stringify({ email: null }), { status: 200 });
      sent.push({ url: String(url), body: init?.body ? (JSON.parse(init.body) as Record<string, string>) : {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  // Nur das Datum ist festgelegt; Zeitgeber laufen echt (Entprellung des Speicherns, Wartezeiten der Tests).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const profile = (p: Record<string, unknown>) => writeLocal(PROFILE_KEY, JSON.stringify(p));
const el = (id: string) => document.getElementById(id) as HTMLElement;
const setText = (id: string, value: string) => fireEvent.change(el(id), { target: { value } });
type User = ReturnType<typeof userEvent.setup>;

const KELLER_PROFIL = { firma: "Malerei Keller", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei" };

/** Die Stammdaten von Malerei Keller, Gossau. */
function fillStamm() {
  setText("vz-strasse", "Wilerstrasse 24");
  setText("vz-plz", "9200");
  setText("vz-telefon", "071 123 45 67");
  setText("vz-oeffnungszeiten", "Mo bis Fr 7.30 bis 17.00 Uhr");
  setText("vz-beschreibung", "Malerarbeiten für Haus und Wohnung in Gossau und Umgebung.");
}

/** Das Beispiel der Seite: Google mit zwei Abweichungen, Apple und Bing offen, local.ch ohne Angabe, Gemeinde und Verband unklar. */
async function fillBeispiel(user: User) {
  fillStamm();
  await user.click(el("vz-google-unternehmensprofil-status-ja"));
  setText("vz-google-unternehmensprofil-name", "Malerei Keller");
  setText("vz-google-unternehmensprofil-adresse", "Wilerstr. 24, 9200 Gossau");
  setText("vz-google-unternehmensprofil-telefon", "071 123 45 67");
  await user.click(el("vz-apple-business-status-nein"));
  await user.click(el("vz-bing-places-status-nein"));
  await user.click(el("vz-local-search-ch-status-ja"));
}

const pruefen = (user: User) => user.click(screen.getByRole("button", { name: "Verzeichnisse prüfen" }));
const karte = () => screen.findByRole("region", { name: "Deine Verzeichnis-Prüfung" });
const crm = () => sent.filter((s) => s.url.includes("/api/result"));
const group = (name: string) => screen.getByRole("group", { name: `${name}: Bist du schon eingetragen?` });

describe("Verzeichnis-Check: Formular", () => {
  it("zeigt die Stammdaten aus dem Profil und die eigenen Felder mit Beschriftung", () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Ort")).toHaveValue("Gossau");
    expect(screen.getByLabelText("Website")).toHaveValue("malerei-keller.ch");
    expect(screen.queryByLabelText("Branche")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Strasse und Nummer")).toBe(el("vz-strasse"));
    expect(screen.getByLabelText("PLZ")).toBe(el("vz-plz"));
    expect(screen.getByLabelText("Telefon", { selector: "#vz-telefon" })).toBeInTheDocument();
    expect(screen.getByLabelText("Öffnungszeiten")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Kurzbeschreibung")).toHaveAttribute("maxlength", "300");
    expect(el("vz-strasse")).toHaveAttribute("maxlength", "80");
    expect(screen.getByRole("button", { name: "Verzeichnisse prüfen" })).toBeEnabled();
    expect(screen.getByTestId("branche-hinweis")).toHaveTextContent("Branche im Profil: Malerei");
    expect(screen.getByText(/Die Plattformen haben eigene Grenzen/)).toBeInTheDocument();
  });

  it("hat zu jedem Feld eine Beschriftung", async () => {
    const { container } = render(<Tool />);
    const user = userEvent.setup();
    await user.click(el("vz-google-unternehmensprofil-status-ja"));
    const controls = container.querySelectorAll("input, select, textarea");
    expect(controls.length).toBeGreaterThan(20);
    for (const c of controls) {
      const labelled = (c as HTMLInputElement).labels?.length || c.getAttribute("aria-label");
      expect(labelled, `${c.tagName} ${c.id}`).toBeTruthy();
    }
  });

  it("zeigt für Vereine «Dein Verein» und «Name des Vereins»", () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", ort: "Trogen" });
    render(<Tool />);
    expect(screen.getByRole("group", { name: "Dein Verein" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
  });

  it("zeigt die Verzeichnisse in der Reihenfolge der Aufgabenliste, mit «Weiss ich nicht» vorgewählt", () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const gruppen = screen.getAllByTestId("verzeichnis-gruppe").map((g) => g.getAttribute("data-id"));
    expect(gruppen).toEqual(["google-unternehmensprofil", "apple-business", "bing-places", "local-search-ch", "frei-gemeinde", "frei-verband", "frei-anderes"]);
    const g = within(group("Google Unternehmensprofil"));
    expect(g.getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Ja", "Nein", "Weiss ich nicht"]);
    expect(el("vz-google-unternehmensprofil-status-unklar")).toBeChecked();
    expect(group("Apple Business (früher Apple Business Connect)")).toBeInTheDocument();
    expect(group("local.ch und search.ch")).toBeInTheDocument();
    expect(group("Gewerbeverzeichnis deiner Gemeinde")).toBeInTheDocument();
    expect(group("Branchenverband oder Gewerbeverein")).toBeInTheDocument();
    expect(group("Anderes Verzeichnis")).toBeInTheDocument();
    expect(screen.getByTestId("fortschritt")).toHaveTextContent("6 Verzeichnisse in der Liste. Eingetragen: 0, nicht eingetragen: 0, offen: 6.");
  });

  it("blendet Tripadvisor nach der Branche aus dem Profil ein: Gastgewerbe vorn, unbekannt mit Zusatz, sonst nicht", () => {
    profile({ ...KELLER_PROFIL, branche: "Restaurant" });
    const first = render(<Tool />);
    expect(screen.getAllByTestId("verzeichnis-gruppe")[0]).toHaveAttribute("data-id", "tripadvisor");
    expect(group("Tripadvisor")).toBeInTheDocument();
    first.unmount();

    profile({ ...KELLER_PROFIL, branche: "" });
    const second = render(<Tool />);
    expect(group("Tripadvisor (falls es zu deiner Branche passt)")).toBeInTheDocument();
    expect(screen.getByTestId("branche-hinweis")).toHaveTextContent("Im Profil steht keine Branche");
    second.unmount();

    profile(KELLER_PROFIL);
    render(<Tool />);
    expect(screen.queryByRole("group", { name: /Tripadvisor/ })).not.toBeInTheDocument();
  });

  it("öffnet bei «Ja» den Bereich «Wie lautet der Eintrag dort?» und schliesst ihn bei «Nein»", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    expect(screen.queryByText("Wie lautet der Eintrag dort?")).not.toBeInTheDocument();
    await user.click(el("vz-bing-places-status-ja"));
    const bereich = within(group("Bing Places for Business")).getByTestId("eintrag-dort");
    expect(within(bereich).getByText("Wie lautet der Eintrag dort?")).toBeInTheDocument();
    expect(within(bereich).getByLabelText("Name im Eintrag bei Bing Places for Business")).toBe(el("vz-bing-places-name"));
    expect(within(bereich).getByLabelText("Adresse im Eintrag bei Bing Places for Business")).toBe(el("vz-bing-places-adresse"));
    expect(within(bereich).getByLabelText("Telefon im Eintrag bei Bing Places for Business")).toBe(el("vz-bing-places-telefon"));
    expect(screen.getByTestId("fortschritt")).toHaveTextContent("Eingetragen: 1, nicht eingetragen: 0, offen: 5");
    await user.click(el("vz-bing-places-status-nein"));
    expect(screen.queryByText("Wie lautet der Eintrag dort?")).not.toBeInTheDocument();
    expect(screen.getByTestId("fortschritt")).toHaveTextContent("Eingetragen: 0, nicht eingetragen: 1, offen: 5");
  });

  it("zeigt die beiden Schreibweisen der Telefonnummer", () => {
    render(<Tool />);
    expect(screen.getByTestId("telefon-hilfe")).toHaveTextContent("Eine Schweizer Nummer, zum Beispiel 071 123 45 67.");
    setText("vz-telefon", "0711234567");
    expect(screen.getByTestId("telefon-hilfe")).toHaveTextContent("Wird so geschrieben: +41 71 123 45 67 oder 071 123 45 67.");
    setText("vz-telefon", "12");
    expect(screen.getByTestId("telefon-hilfe")).toHaveTextContent("Eine Schweizer Nummer");
  });

  it("benennt das freie Verzeichnis nach der Eingabe und nimmt es nur mit Namen in die Liste", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    expect(screen.getByTestId("fortschritt")).toHaveTextContent("6 Verzeichnisse in der Liste");
    await user.type(el("vz-frei-anderes-bezeichnung"), "Gossauer Branchenbuch");
    expect(group("Gossauer Branchenbuch")).toBeInTheDocument();
    expect(screen.getByTestId("fortschritt")).toHaveTextContent("7 Verzeichnisse in der Liste");
  });

  it("meldet ein leeres Formular, fragt nicht nach der Adresse und schickt nichts", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    await pruefen(user);
    const fehler = await screen.findByRole("alert");
    expect(fehler).toHaveTextContent("Trag oben die Firma ein.");
    expect(fehler).toHaveTextContent("Trag oben den Ort ein.");
    expect(fehler).toHaveTextContent("Gib Strasse und Nummer an");
    expect(fehler).toHaveTextContent("Gib eine Schweizer PLZ mit vier Ziffern an");
    expect(fehler).toHaveTextContent("Trag die Telefonnummer ein");
    expect(el("vz-strasse")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Verzeichnis-Prüfung" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("meldet eine falsche PLZ und eine falsche Telefonnummer, und die Meldung verschwindet beim Tippen", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    fillStamm();
    setText("vz-plz", "92");
    setText("vz-telefon", "abc");
    await pruefen(user);
    const fehler = await screen.findByRole("alert");
    expect(fehler).toHaveTextContent("Gib eine Schweizer PLZ mit vier Ziffern an, zum Beispiel 9200.");
    expect(fehler).toHaveTextContent("Gib eine Schweizer Nummer an, zum Beispiel 071 123 45 67.");
    expect(fehler).not.toHaveTextContent("Strasse und Nummer");
    expect(el("vz-plz")).toHaveAttribute("aria-invalid", "true");
    expect(el("vz-telefon")).toHaveAttribute("aria-invalid", "true");
    expect(el("vz-strasse")).toHaveAttribute("aria-invalid", "false");
    expect(sent).toHaveLength(0);
    setText("vz-plz", "9200");
    expect(screen.getByTestId("fehler")).toBeEmptyDOMElement();
    setText("vz-telefon", "12");
    await pruefen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("zu viele oder zu wenige Stellen");
  });

  it("speichert den Entwurf im Browser und stellt ihn nach dem Neuladen wieder her", async () => {
    profile(KELLER_PROFIL);
    const first = render(<Tool />);
    const user = userEvent.setup();
    fillStamm();
    await user.click(el("vz-apple-business-status-nein"));
    await user.click(el("vz-local-search-ch-status-ja"));
    setText("vz-local-search-ch-adresse", "Wilerstr. 24");
    await waitFor(() => expect(JSON.parse(readLocal("mt:verzeichnisse") ?? "{}")).toMatchObject({ v: 1, phase: "edit", input: { strasse: "Wilerstrasse 24", plz: "9200" } }));
    await waitFor(() => expect(JSON.parse(readLocal("mt:verzeichnisse") ?? "{}").input.funde["local-search-ch"]).toEqual({ name: "", adresse: "Wilerstr. 24", telefon: "" }));
    first.unmount();
    render(<Tool />);
    expect(el("vz-strasse")).toHaveValue("Wilerstrasse 24");
    expect(el("vz-telefon")).toHaveValue("071 123 45 67");
    expect(el("vz-apple-business-status-nein")).toBeChecked();
    expect(el("vz-local-search-ch-status-ja")).toBeChecked();
    expect(el("vz-local-search-ch-adresse")).toHaveValue("Wilerstr. 24");
    expect(el("vz-bing-places-status-unklar")).toBeChecked();
  });
});

describe("Verzeichnis-Check: Ergebnis", () => {
  it("zeigt Eintrag, Aufgabenliste und Abweichungen, speichert den Stand und schickt Eingabe und Ausgabe ins CRM", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);

    const card = await karte();
    expect(within(card).getByTestId("zusammenfassung")).toHaveTextContent("6 Verzeichnisse in der Liste: 2 zum Eintragen, 2 zum Suchen, 1 zum Prüfen, 1 zum Angleichen.");
    expect(within(card).getByTestId("feld-name")).toHaveTextContent("Malerei Keller");
    expect(within(card).getByTestId("feld-adresse")).toHaveTextContent("Wilerstrasse 24, 9200 Gossau");
    expect(within(card).getByTestId("feld-telefon")).toHaveTextContent("+41 71 123 45 67");
    expect(within(card).getByTestId("feld-telefonNational")).toHaveTextContent("071 123 45 67");
    expect(within(card).getByTestId("feld-website")).toHaveTextContent("https://malerei-keller.ch");

    const liste = within(card).getByRole("list", { name: "Aufgaben nach Wichtigkeit" });
    const aufgaben = within(liste).getAllByTestId("aufgabe");
    expect(aufgaben.map((a) => a.getAttribute("data-status"))).toEqual(["angleichen", "eintragen", "eintragen", "pruefen", "suchen", "suchen"]);
    expect(aufgaben.map((a) => within(a).getByText(/^(Google|Apple|Bing|local|Gewerbe|Branchenverband)/).textContent)).toEqual([
      "Google Unternehmensprofil",
      "Apple Business (früher Apple Business Connect)",
      "Bing Places for Business",
      "local.ch und search.ch",
      "Gewerbeverzeichnis deiner Gemeinde",
      "Branchenverband oder Gewerbeverein",
    ]);
    expect(aufgaben[0]).toHaveTextContent("Angleichen");
    expect(aufgaben[1]).toHaveTextContent("Prüfe die Bedingungen auf der Seite des Anbieters.");
    expect(aufgaben[2]).toHaveTextContent("Laut Anbieter kostenlos.");
    expect(aufgaben[3]).toHaveTextContent("Prüfe, ob Name, Adresse und Telefon wie oben lauten");
    expect(aufgaben[4]).toHaveTextContent("Suchen, ob du schon drin bist");
    expect(within(card).getByText("Die Reihenfolge ist ein Richtwert von Alperna, keine Statistik.")).toBeInTheDocument();

    const abw = within(card).getAllByTestId("abweichung");
    expect(abw).toHaveLength(2);
    expect(abw.map((a) => a.getAttribute("data-art"))).toEqual(["str-abkuerzung", "telefon-format"]);
    expect(abw[0]).toHaveTextContent("Dort: Wilerstr. 24, 9200 Gossau");
    expect(abw[0]).toHaveTextContent("Soll: Wilerstrasse 24, 9200 Gossau");
    expect(abw[0]).toHaveTextContent("Gleich, aber anders geschrieben");
    expect(abw[1]).toHaveTextContent("Soll: +41 71 123 45 67");

    expect(within(card).getByTestId("quellenzeile")).toHaveTextContent("Angaben zu den Verzeichnissen: Eigene Seiten der Anbieter");
    expect(within(card).getByTestId("quellenzeile")).toHaveTextContent("Stand 05.10.2026.");
    expect(within(card).getByText(/Der Check ruft keine Verzeichnisse ab/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Ganzen Eintrag kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Name kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Neu beginnen" })).toBeInTheDocument();

    const stand = JSON.parse(readLocal("mt:verzeichnisse") ?? "{}");
    expect(stand).toMatchObject({
      v: 1,
      phase: "result",
      input: { strasse: "Wilerstrasse 24", plz: "9200", telefon: "071 123 45 67" },
      output: { firma: "Malerei Keller", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei", datum: "05.10.2026" },
    });
    expect(stand.input.status["bing-places"]).toBe("nein");
    expect(stand.input.funde["google-unternehmensprofil"].adresse).toBe("Wilerstr. 24, 9200 Gossau");

    await waitFor(() => expect(crm()).toHaveLength(1));
    const body = crm()[0].body;
    expect(body.tool).toBe("verzeichnisse");
    expect(body.firma).toBe("Malerei Keller");
    expect(body.eingabe.split("\n").slice(0, 3)).toEqual(["Firma: Malerei Keller", "Ort: Gossau", "PLZ: 9200"]);
    expect(body.eingabe).toContain("Google Unternehmensprofil: Ja (Eintrag dort: Name «Malerei Keller», Adresse «Wilerstr. 24, 9200 Gossau», Telefon «071 123 45 67»)");
    expect(body.eingabe).toContain("Bing Places for Business: Nein");
    expect(body.ausgabe.startsWith("# Verzeichnis-Check: Malerei Keller")).toBe(true);
    expect(body.ausgabe).toContain("6 Verzeichnisse in der Liste");
    expect(body.ausgabe).not.toMatch(/[{}]|undefined|NaN/);
  });

  it("verlinkt nur auf https-Adressen aus der Datei, in neuem Tab mit rel noopener noreferrer", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const a of links) {
      expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^https:\/\//);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    const apple = within(within(card).getAllByTestId("aufgabe")[1]).getByRole("link", { name: /Zur Seite des Anbieters/ });
    expect(apple).toHaveAttribute("href", "https://support.apple.com/de-ch/guide/business/abcb98816a34/web");
    const google = within(within(card).getAllByTestId("aufgabe")[0]).getByRole("link", { name: /Zum Verzeichnis/ });
    expect(google).toHaveAttribute("href", "https://business.google.com/de/business-profile/");
    // Freie Plätze haben keinen Link
    expect(within(within(card).getAllByTestId("aufgabe")[4]).queryByRole("link")).not.toBeInTheDocument();
  });

  it("kopiert ein Feld in die Zwischenablage", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    fireEvent.click(within(card).getByRole("button", { name: "Telefon kopieren" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("+41 71 123 45 67"));
    fireEvent.click(within(card).getByRole("button", { name: "Ganzen Eintrag kopieren" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("Name: Malerei Keller\nAdresse: Wilerstrasse 24, 9200 Gossau\nTelefon: +41 71 123 45 67\nWebsite: https://malerei-keller.ch\nÖffnungszeiten: Mo bis Fr 7.30 bis 17.00 Uhr\nKurzbeschreibung: Malerarbeiten für Haus und Wohnung in Gossau und Umgebung."));
  });

  it("fragt ohne bekannte Adresse zuerst, zeigt bei «Später» nichts und behält das Formular", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("region", { name: "Deine Verzeichnis-Prüfung" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verzeichnisse prüfen" })).toBeEnabled();
    expect(el("vz-strasse")).toHaveValue("Wilerstrasse 24");
    expect(el("vz-google-unternehmensprofil-adresse")).toHaveValue("Wilerstr. 24, 9200 Gossau");
    expect(crm()).toHaveLength(0);
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten Eintrag im CRM", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    await karte();
    await waitFor(() => expect(crm()).toHaveLength(1));
    first.unmount();
    render(<Tool />);
    expect(await karte()).toBeInTheDocument();
    expect(crm()).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück, behält die Angaben, und «Neu beginnen» setzt sie zurück", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Verzeichnisse prüfen" })).toBeInTheDocument();
    expect(el("vz-strasse")).toHaveValue("Wilerstrasse 24");
    expect(el("vz-google-unternehmensprofil-status-ja")).toBeChecked();
    expect(el("vz-google-unternehmensprofil-adresse")).toHaveValue("Wilerstr. 24, 9200 Gossau");
    expect(JSON.parse(readLocal("mt:verzeichnisse") ?? "{}").phase).toBe("edit");

    // Adresse bei Google angeglichen: eine Abweichung weniger, ein zweiter Eintrag im CRM
    setText("vz-google-unternehmensprofil-adresse", "Wilerstrasse 24, 9200 Gossau");
    await pruefen(user);
    const again = await karte();
    expect(within(again).getAllByTestId("abweichung")).toHaveLength(1);
    await waitFor(() => expect(crm()).toHaveLength(2));

    await user.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Verzeichnisse prüfen" })).toBeInTheDocument();
    expect(el("vz-strasse")).toHaveValue("");
    expect(el("vz-google-unternehmensprofil-status-unklar")).toBeChecked();
  });

  it("zeigt «In Ordnung» und keine Abweichung, wenn der Eintrag dort gleich lautet", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    fillStamm();
    await user.click(el("vz-bing-places-status-ja"));
    setText("vz-bing-places-name", "Malerei Keller");
    setText("vz-bing-places-telefon", "+41 71 123 45 67");
    await pruefen(user);
    const card = await karte();
    const bing = within(card)
      .getAllByTestId("aufgabe")
      .find((a) => a.getAttribute("data-id") === "bing-places")!;
    expect(bing).toHaveAttribute("data-status", "ok");
    expect(bing).toHaveTextContent("In Ordnung");
    expect(within(card).queryByTestId("abweichung")).not.toBeInTheDocument();
  });

  it("nimmt Tripadvisor bei einem Restaurant als erste Aufgabe in die Liste", async () => {
    profile({ ...KELLER_PROFIL, firma: "Restaurant Sonne", branche: "Restaurant" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    fillStamm();
    await pruefen(user);
    const card = await karte();
    const erste = within(card).getAllByTestId("aufgabe")[0];
    expect(erste).toHaveAttribute("data-id", "tripadvisor");
    expect(erste).toHaveTextContent("Tripadvisor");
    expect(erste).toHaveTextContent("Nach dem Beanspruchen lässt du deine Identität überprüfen.");
    expect(within(card).getAllByTestId("aufgabe")).toHaveLength(7);
  });

  it("lädt das PDF herunter", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    await user.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [bytes, name, mime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(name).toBe("verzeichnisse-malerei-keller.pdf");
    expect(mime).toBe("application/pdf");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  }, 30000);

  it("fragt vor dem Download zuerst nach der Adresse, wenn sie fehlt, und lädt bei «Später» nichts herunter", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    removeLocal(LEAD_KEY);
    await user.click(within(card).getByRole("button", { name: "Word herunterladen" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(downloadBytes).not.toHaveBeenCalled();
    expect(within(card).getByText(/Für Dateien brauchen wir deine E-Mail-Adresse/)).toBeInTheDocument();
  });

  it("verwendet in Formular und Ergebnis keine Wörter der Sperrliste und keine Ausrufezeichen", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const { container } = render(<Tool />);
    const hart = (text: string) => brandHits(text).filter((h) => h.level === "hart");
    expect(hart(container.textContent ?? "")).toEqual([]);
    expect(container.textContent).not.toMatch(/!|—/);
    const user = userEvent.setup();
    await fillBeispiel(user);
    await pruefen(user);
    const card = await karte();
    expect(hart(card.textContent ?? "")).toEqual([]);
    expect(card.textContent).not.toMatch(/NaN|undefined|!|—/);
  });
});
