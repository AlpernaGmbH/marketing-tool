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
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
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
      sent.push({ url: String(url), body: init?.body ? (JSON.parse(init.body) as Record<string, string>) : {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;
const profile = (p: Record<string, unknown>) => writeLocal(PROFILE_KEY, JSON.stringify(p));
const profileNow = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}") as Record<string, unknown>;
const stand = () => JSON.parse(readLocal("mt:kanalstrategie") ?? "{}");
const el = (id: string) => document.getElementById(id) as HTMLElement;
const crm = () => sent.filter((s) => s.url.includes("/api/result"));
const erstellen = (user: User) => user.click(screen.getByRole("button", { name: "Kanäle bewerten" }));
const ergebnisKarte = () => screen.findByRole("region", { name: "Deine Kanalstrategie" });
const KELLER_PROFIL = { firma: "Malerei Keller, Gossau", branche: "Malerei", organisationstyp: "kmu" };

/** Malerei Keller, Gossau: Anfragen, Privatpersonen, sie suchen aktiv, Region, 2 bis 3 Stunden, Text und Foto, heute Website und Facebook. */
async function kellerEintragen(user: User) {
  await user.click(el("ks-ziel-anfragen"));
  await user.click(el("ks-kundschaft-privat"));
  await user.click(el("ks-suche-aktiv"));
  await user.click(el("ks-gebiet-region"));
  await user.selectOptions(el("ks-zeit"), "2");
  await user.click(el("ks-faehigkeit-text"));
  await user.click(el("ks-faehigkeit-foto"));
  await user.click(el("ks-heute-website"));
  await user.click(el("ks-heute-facebook"));
}

const karten = (root: HTMLElement, rolle: string) => within(root).queryAllByTestId("kanal-karte").filter((k) => k.getAttribute("data-rolle") === rolle);
const kartenKeys = (root: HTMLElement, rolle: string) => karten(root, rolle).map((k) => k.getAttribute("data-kanal"));

describe("Kanalstrategie: Formular", () => {
  it("zeigt die Grunddaten, vier Radiogruppen, die Zeit, zwei Gruppen mit Kästchen und den Knopf", () => {
    render(<Tool />);
    expect(screen.getByRole("group", { name: "Dein Betrieb" })).toBeInTheDocument();
    expect(screen.getByLabelText("Firma")).toBeInTheDocument();
    expect(screen.getByLabelText("Branche")).toBeInTheDocument();

    const optionen = (name: string) => within(screen.getByRole("group", { name })).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent);
    expect(optionen("Was soll dein Auftritt zuerst erreichen?")).toEqual(["Anfragen und Aufträge", "Bekanntheit in der Region", "Stammkundschaft binden", "Fachkräfte und Lernende finden"]);
    expect(optionen("Wen willst du erreichen?")).toEqual(["Privatpersonen", "Firmen", "Beides"]);
    expect(optionen("Suchen die Leute aktiv nach dir?")).toEqual(["Ja, sie suchen, wenn sie etwas brauchen", "Nein, ich muss erst Aufmerksamkeit wecken", "Beides"]);
    expect(optionen("Wie gross ist dein Einzugsgebiet?")).toEqual(["Mein Ort und die Umgebung", "Meine Region oder mein Kanton", "Die ganze Schweiz"]);

    const zeit = screen.getByLabelText("Zeit pro Woche für den Auftritt") as HTMLSelectElement;
    expect(zeit).toBe(el("ks-zeit"));
    expect(Array.from(zeit.options).map((o) => o.textContent)).toEqual(["Bitte wählen", "Bis 1 Stunde", "2 bis 3 Stunden", "4 bis 6 Stunden", "Mehr als 6 Stunden"]);
    expect(Array.from(zeit.options).map((o) => o.value)).toEqual(["", "1", "2", "3", "4"]);

    const faehigkeiten = within(screen.getByRole("group", { name: "Was könnt ihr gut?" })).getAllByRole("checkbox");
    expect(faehigkeiten.map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Text", "Foto", "Video", "Gestaltung"]);
    const heute = within(screen.getByRole("group", { name: "Wo seid ihr heute aktiv?" })).getAllByRole("checkbox");
    expect(heute.map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Google-Unternehmensprofil",
      "Website",
      "Verzeichnisse",
      "WhatsApp",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "TikTok",
      "YouTube",
      "Newsletter",
    ]);
    expect(heute.every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Kanäle bewerten" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("0 von 6 Pflichtangaben gemacht");
    expect(document.body.textContent).toContain("Das Werkzeug sagt dir, was zu deinen Angaben passt, nicht, was auf einer Plattform gerade am meisten Reichweite bringt.");
  });

  it("hat zu jedem Feld eine Beschriftung", () => {
    const { container } = render(<Tool />);
    const controls = container.querySelectorAll("input, select, textarea");
    expect(controls.length).toBeGreaterThan(25);
    for (const c of controls) {
      const labelled = (c as HTMLInputElement).labels?.length || c.getAttribute("aria-label");
      expect(labelled, `${c.tagName} ${c.id}`).toBeTruthy();
    }
  });

  it("füllt Firma, Branche und die heutigen Kanäle aus dem Profil vor und lässt die Person sie ändern", async () => {
    profile({ ...KELLER_PROFIL, kanaele: [{ name: "Instagram" }, { name: "Website" }, { name: "TikTok" }, { name: "Pinterest" }] });
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller, Gossau"));
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    const gewaehlt = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[id^='ks-heute-']:checked")).map((c) => c.id);
    await waitFor(() => expect(gewaehlt()).toEqual(["ks-heute-website", "ks-heute-instagram", "ks-heute-tiktok"]));
    expect(screen.getByText(/Vorgewählt aus deinem Firmenprofil/)).toBeInTheDocument();
    await user.click(el("ks-heute-website"));
    expect(gewaehlt()).toEqual(["ks-heute-instagram", "ks-heute-tiktok"]);
    expect(stand().input.heute).toEqual(["instagram", "tiktok"]);
    expect(screen.queryByText(/Vorgewählt aus deinem Firmenprofil/)).not.toBeInTheDocument();
  });

  it("wählt nichts vor, wenn das Profil keinen passenden Kanal nennt", async () => {
    profile({ ...KELLER_PROFIL, kanaele: [{ name: "Pinterest" }, { name: "Google Ads" }] });
    render(<Tool />);
    await waitFor(() => expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller, Gossau"));
    expect(document.querySelectorAll("input[id^='ks-heute-']:checked")).toHaveLength(0);
    expect(screen.queryByText(/Vorgewählt aus deinem Firmenprofil/)).not.toBeInTheDocument();
  });

  it("zeigt Vereinen eigene Ziele, Zielgruppen und Bezeichnungen", async () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    render(<Tool />);
    await waitFor(() => expect(screen.getByRole("group", { name: "Dein Verein" })).toBeInTheDocument());
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("Fussball");
    const optionen = (name: string) => within(screen.getByRole("group", { name })).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent);
    expect(optionen("Was soll dein Auftritt zuerst erreichen?")).toEqual(["Mitglieder gewinnen", "Anlässe füllen", "Sponsoren und Gönner finden", "Freiwillige finden"]);
    expect(optionen("Wen willst du erreichen?")).toEqual(["Mitglieder und Publikum", "Firmen und Sponsoren", "Beides"]);
  });

  it("verwirft das Ziel, wenn die Person zwischen Betrieb und Verein wechselt", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller, Gossau"));
    await user.click(el("ks-ziel-anfragen"));
    expect(el("ks-ziel-anfragen")).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Verein" }));
    expect(await screen.findByRole("group", { name: "Dein Verein" })).toBeInTheDocument();
    expect(el("ks-ziel-mitglieder")).not.toBeChecked();
    expect(document.querySelectorAll("input[name='ks-ziel']:checked")).toHaveLength(0);
  });

  it("meldet fehlende Angaben der Reihe nach in einer Meldung, setzt den Fokus und schickt nichts", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    const meldung = async (text: string, fokus: string) => {
      await erstellen(user);
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      await waitFor(() => expect(document.activeElement).toBe(el(fokus)));
    };
    await meldung("Gib den Namen deines Betriebs an.", "ks-firma");
    fireEvent.change(el("ks-firma"), { target: { value: "Malerei Keller" } });
    await meldung("Wähle, was dein Auftritt zuerst erreichen soll.", "ks-ziel");
    await user.click(el("ks-ziel-anfragen"));
    await meldung("Wähle, wen du erreichen willst.", "ks-kundschaft");
    await user.click(el("ks-kundschaft-privat"));
    await meldung("Wähle, ob die Leute aktiv nach dir suchen.", "ks-suche");
    await user.click(el("ks-suche-aktiv"));
    await meldung("Wähle dein Einzugsgebiet.", "ks-gebiet");
    await user.click(el("ks-gebiet-ort"));
    await meldung("Wähle, wie viel Zeit du pro Woche hast.", "ks-zeit");
    expect(screen.getByRole("status")).toHaveTextContent("5 von 6 Pflichtangaben gemacht");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Kanalstrategie" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("nennt bei Vereinen den Namen des Vereins", async () => {
    profile({ organisationstyp: "verein" });
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("group", { name: "Dein Verein" })).toBeInTheDocument());
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gib den Namen deines Vereins an.");
  });

  it("speichert den Stand im Browser und stellt ihn nach dem Neuladen wieder her", async () => {
    profile(KELLER_PROFIL);
    const first = render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await waitFor(() => expect(stand()).toMatchObject({ v: 1, phase: "edit", input: { typ: "kmu", ziel: "anfragen", kundschaft: "privat", suche: "aktiv", gebiet: "region", zeit: 2, faehigkeiten: ["text", "foto"], heute: ["website", "facebook"] } }));
    first.unmount();
    render(<Tool />);
    expect(await screen.findByLabelText("Firma")).toHaveValue("Malerei Keller, Gossau");
    expect(el("ks-ziel-anfragen")).toBeChecked();
    expect(el("ks-kundschaft-privat")).toBeChecked();
    expect(el("ks-suche-aktiv")).toBeChecked();
    expect(el("ks-gebiet-region")).toBeChecked();
    expect(el("ks-zeit")).toHaveValue("2");
    expect(el("ks-faehigkeit-text")).toBeChecked();
    expect(el("ks-faehigkeit-video")).not.toBeChecked();
    expect(el("ks-heute-facebook")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("6 von 6 Pflichtangaben gemacht");
  });

  it("übersteht kaputte Daten im Speicher", async () => {
    writeLocal("mt:kanalstrategie", "{kaputt");
    render(<Tool />);
    expect(await screen.findByRole("button", { name: "Kanäle bewerten" })).toBeEnabled();
    expect(document.querySelectorAll("input[name='ks-ziel']:checked")).toHaveLength(0);
  });
});

describe("Kanalstrategie: Ergebnis", () => {
  it("zeigt die Kanalkarten nach Rolle, die Tabelle, das Pausieren und den Plan für Malerei Keller", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);

    const card = await ergebnisKarte();
    // Nach dem Absenden springt der Fokus auf die Überschrift des Ergebnisses
    await waitFor(() => expect(document.activeElement).toBe(within(card).getByRole("heading", { level: 3, name: "Deine Kanalstrategie" })));
    expect(within(card).getByTestId("ks-aussage")).toHaveTextContent("Basis: Website, Google-Unternehmensprofil und Verzeichnisse. Fokus: WhatsApp.");
    expect(kartenKeys(card, "basis")).toEqual(["website", "gbp", "verzeichnisse"]);
    expect(kartenKeys(card, "fokus")).toEqual(["whatsapp"]);
    expect(kartenKeys(card, "ergaenzung")).toEqual([]);
    expect(kartenKeys(card, "vorerst")).toEqual(["facebook", "instagram", "linkedin", "youtube", "newsletter", "tiktok"]);
    expect(within(card).getAllByTestId("kanal-karte")).toHaveLength(10);

    // Listen mit Namen, Rolle als Text
    expect(within(card).getByRole("list", { name: "Basis-Kanäle" })).toBeInTheDocument();
    expect(within(card).getByRole("list", { name: "Fokus-Kanäle" })).toBeInTheDocument();
    expect(within(card).getByRole("list", { name: "Kanäle, die vorerst nicht dran sind" })).toBeInTheDocument();
    expect(within(card).queryByRole("list", { name: "Ergänzungs-Kanäle" })).not.toBeInTheDocument();
    const wa = karten(card, "fokus")[0];
    expect(within(wa).getByRole("heading", { level: 5 })).toHaveTextContent("WhatsApp");
    expect(within(wa).getByTestId("kanal-rolle")).toHaveTextContent("Fokus");
    expect(within(wa).getByTestId("kanal-passung")).toHaveTextContent("passt gut");
    expect(wa).toHaveTextContent("Passt zu deinem Ziel «Anfragen und Aufträge»; erreicht Privatpersonen.");
    expect(wa).toHaveTextContent("Erster Schritt: Richte WhatsApp Business ein");
    expect(within(wa).getByRole("link", { name: "WhatsApp-Link mit QR" })).toHaveAttribute("href", "/tools/whatsapp-link");
    expect(within(wa).getByRole("link", { name: "QR-Set für Flyer und Aufkleber" })).toHaveAttribute("href", "/tools/qr-set");
    expect(within(wa).getByRole("meter", { name: "Passung WhatsApp" })).toHaveAttribute("aria-valuetext", "passt gut");

    // Heute aktiv: Website (Basis) und Facebook (vorerst)
    const fb = karten(card, "vorerst")[0];
    expect(fb).toHaveTextContent("Heute aktiv");
    expect(fb).toHaveTextContent("Dieser Kanal passt nur teilweise, für den Fokus reicht es nicht.");
    expect(within(fb).queryByTestId("kanal-schritt")).not.toBeInTheDocument();
    expect(within(karten(card, "basis")[0]).getByRole("link", { name: "Digitaler-Auftritt-Check" })).toHaveAttribute("href", "/tools/digitaler-auftritt-check");
    expect(karten(card, "basis")[0]).toHaveTextContent("Lies deine Startseite wie eine fremde Person"); // Website ist heute aktiv
    expect(karten(card, "basis")[1]).toHaveTextContent("Lege dein Google-Unternehmensprofil an"); // Profil ist neu

    // Pausieren
    const pausieren = within(card).getByTestId("ks-pausieren");
    expect(within(pausieren).getByRole("heading", { name: "Das kannst du pausieren" })).toBeInTheDocument();
    expect(within(pausieren).getAllByRole("listitem")).toHaveLength(1);
    expect(pausieren).toHaveTextContent("Facebook: Du bist heute dort aktiv.");
    expect(pausieren).toHaveTextContent("Prüfe vor dem Pausieren, ob über diesen Kanal Anfragen kommen");

    // 90 Tage
    const plan = within(card).getByRole("list", { name: "Plan für die nächsten drei Monate" });
    expect(within(plan).getAllByRole("listitem", { hidden: false }).filter((li) => li.getAttribute("data-testid")?.startsWith("monat-"))).toHaveLength(3);
    expect(within(card).getByTestId("monat-1")).toHaveTextContent("Basis aufbauen");
    expect(within(card).getByTestId("monat-2")).toHaveTextContent("WhatsApp");
    expect(within(card).getByTestId("monat-3")).toHaveTextContent("Prüfen und anpassen");

    // Tabelle
    const tabelle = within(card).getByTestId("ks-tabelle");
    expect(tabelle.closest("div")).toHaveClass("overflow-x-auto");
    expect(within(tabelle).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Kanal", "Rolle", "Passung", "Begründung"]);
    expect(within(tabelle).getAllByRole("row")).toHaveLength(11);

    // Hinweise und Rechnung
    expect(within(card).getByRole("list", { name: "Hinweise" }).querySelectorAll("li")).toHaveLength(3);
    expect(within(card).getByTestId("ks-richtwert")).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    expect(card).toHaveTextContent("nicht, was auf einer Plattform gerade am meisten Reichweite bringt");

    // Knöpfe
    for (const name of ["Text kopieren", "PDF herunterladen", "Word herunterladen", "Angaben ändern", "Neu beginnen"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("zeigt die Passung nur als Wort und keine Ziffer ausser «Monat 1 bis 3»", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const card = await ergebnisKarte();
    const text = (card.textContent ?? "").replace(/Monat [123]/g, "Monat");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toContain("%");
    for (const k of within(card).getAllByTestId("kanal-passung")) expect(["passt gut", "passt teilweise", "passt wenig"]).toContain(k.textContent);
  });

  it("schickt Eingabe und Ausgabe als lesbaren Text ins CRM, speichert den Stand und schreibt die Kanäle ins leere Profil", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    await ergebnisKarte();

    expect(stand()).toMatchObject({
      v: 1,
      phase: "result",
      input: { typ: "kmu", ziel: "anfragen", zeit: 2, heute: ["website", "facebook"] },
      output: { basis: ["website", "gbp", "verzeichnisse"], fokus: ["whatsapp"], ergaenzung: [], vorerst: ["facebook", "instagram", "linkedin", "youtube", "newsletter", "tiktok"] },
    });
    await waitFor(() => expect(crm()).toHaveLength(1));
    const body = crm()[0].body;
    expect(body.tool).toBe("kanalstrategie");
    expect(body.firma).toBe("Malerei Keller, Gossau");
    expect(body.eingabe.split("\n")).toHaveLength(9);
    expect(body.eingabe.startsWith("Betrieb: Malerei Keller, Gossau\nBranche: Malerei\nZiel: Anfragen und Aufträge\nKundschaft: Privatpersonen")).toBe(true);
    expect(body.eingabe).toContain("Zeit pro Woche: 2 bis 3 Stunden");
    expect(body.eingabe).toContain("Heute aktiv: Website, Facebook");
    expect(body.ausgabe.startsWith("# Kanalstrategie\n\n_Fokus: WhatsApp_")).toBe(true);
    expect(body.ausgabe).toContain("- Basis: Website, Google-Unternehmensprofil und Verzeichnisse");
    expect(body.ausgabe).not.toMatch(/[{}]|undefined|NaN/);
    expect(profileNow().kanaele).toEqual([
      { name: "Website", url: "" },
      { name: "Google-Unternehmensprofil", url: "" },
      { name: "Verzeichnisse", url: "" },
      { name: "WhatsApp", url: "" },
    ]);
  });

  it("überschreibt vorhandene Kanäle im Profil nicht", async () => {
    profile({ ...KELLER_PROFIL, kanaele: [{ name: "Instagram", url: "instagram.com/malereikeller" }] });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(el("ks-heute-instagram")).toBeChecked());
    await user.click(el("ks-ziel-anfragen"));
    await user.click(el("ks-kundschaft-privat"));
    await user.click(el("ks-suche-aktiv"));
    await user.click(el("ks-gebiet-region"));
    await user.selectOptions(el("ks-zeit"), "2");
    await user.click(el("ks-faehigkeit-text"));
    await user.click(el("ks-faehigkeit-foto"));
    await erstellen(user);
    const card = await ergebnisKarte();
    expect(profileNow().kanaele).toEqual([{ name: "Instagram", url: "instagram.com/malereikeller" }]);
    // Der Vorschlag aus dem Profil gilt als «heute aktiv» und steht im Stand fest
    expect(stand().input.heute).toEqual(["instagram"]);
    expect(within(card).getByTestId("ks-pausieren")).toHaveTextContent("Instagram: Du bist heute dort aktiv.");
  });

  it("hält das Ergebnis stabil, auch wenn das Profil nach dem Absenden Kanäle bekommt", async () => {
    profile(KELLER_PROFIL); // keine Kanäle im Profil
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const card = await ergebnisKarte();
    // Das Profil enthält jetzt Basis und Fokus; das Ergebnis darf sich nicht verändern
    await waitFor(() => expect((profileNow().kanaele as unknown[] | undefined)?.length).toBe(4));
    expect(within(card).getByTestId("ks-aussage")).toHaveTextContent("Fokus: WhatsApp.");
    expect(within(card).getByTestId("ks-pausieren")).toHaveTextContent("Facebook");
    expect(within(card).getByTestId("ks-pausieren").querySelectorAll("li")).toHaveLength(1);
    expect(stand().input.heute).toEqual(["website", "facebook"]);
  });

  it("fragt ohne bekannte Adresse zuerst, zeigt bei «Später» nichts und behält das Formular", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("region", { name: "Deine Kanalstrategie" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kanäle bewerten" })).toBeEnabled();
    expect(el("ks-ziel-anfragen")).toBeChecked();
    expect(el("ks-zeit")).toHaveValue("2");
    expect(el("ks-faehigkeit-foto")).toBeChecked();
    expect(stand().phase).toBe("edit");
    expect(crm()).toHaveLength(0);
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten Eintrag im CRM", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    await ergebnisKarte();
    await waitFor(() => expect(crm()).toHaveLength(1));
    first.unmount();
    render(<Tool />);
    const card = await ergebnisKarte();
    expect(within(card).getByTestId("ks-aussage")).toHaveTextContent("Fokus: WhatsApp.");
    expect(crm()).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück; mehr Zeit ergibt einen zweiten Fokus und einen zweiten Eintrag im CRM", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const card = await ergebnisKarte();
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Kanäle bewerten" })).toBeInTheDocument();
    expect(el("ks-ziel-anfragen")).toBeChecked();
    expect(el("ks-zeit")).toHaveValue("2");
    expect(el("ks-heute-facebook")).toBeChecked();
    expect(stand().phase).toBe("edit");

    await user.selectOptions(el("ks-zeit"), "3");
    await erstellen(user);
    const again = await ergebnisKarte();
    expect(kartenKeys(again, "fokus")).toEqual(["newsletter", "whatsapp"]);
    expect(within(again).getByTestId("ks-aussage")).toHaveTextContent("Fokus: Newsletter und WhatsApp.");
    await waitFor(() => expect(crm()).toHaveLength(2));

    await user.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Kanäle bewerten" })).toBeInTheDocument();
    expect(document.querySelectorAll("input[name='ks-ziel']:checked")).toHaveLength(0);
    expect(el("ks-zeit")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("1 von 6 Pflichtangaben gemacht"); // die Firma bleibt im Profil
  });

  it("bleibt ohne Fähigkeit bei den Basis-Kanälen und sagt es", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.click(el("ks-ziel-anfragen"));
    await user.click(el("ks-kundschaft-privat"));
    await user.click(el("ks-suche-aktiv"));
    await user.click(el("ks-gebiet-ort"));
    await user.selectOptions(el("ks-zeit"), "4");
    await erstellen(user);
    const card = await ergebnisKarte();
    expect(within(card).getByTestId("ks-aussage")).toHaveTextContent("Basis: Website, Google-Unternehmensprofil und Verzeichnisse. Kein Fokus-Kanal.");
    expect(kartenKeys(card, "fokus")).toEqual([]);
    expect(within(card).getByTestId("ks-fokus-leer")).toHaveTextContent("Du hast keine Fähigkeit angegeben. Darum bleibt es bei den Basis-Kanälen.");
    expect(within(card).queryByTestId("ks-pausieren")).not.toBeInTheDocument();
    expect(within(card).getByRole("list", { name: "Hinweise" })).toHaveTextContent("bleibt es bei den Basis-Kanälen");
    expect(within(card).getByTestId("monat-2")).toHaveTextContent("Es gibt keinen Fokus-Kanal");
  });

  it("wertet für Vereine mit Vereinsbegriffen aus", async () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen"));
    await user.click(el("ks-ziel-mitglieder"));
    await user.click(el("ks-kundschaft-privat"));
    await user.click(el("ks-suche-wecken"));
    await user.click(el("ks-gebiet-ort"));
    await user.selectOptions(el("ks-zeit"), "2");
    await user.click(el("ks-faehigkeit-text"));
    await user.click(el("ks-faehigkeit-foto"));
    await erstellen(user);
    const card = await ergebnisKarte();
    expect(within(card).getByTestId("ks-aussage")).toHaveTextContent("Basis: Website und Verzeichnisse. Fokus: Instagram.");
    expect(karten(card, "fokus")[0]).toHaveTextContent("Passt zu deinem Ziel «Mitglieder gewinnen»; erreicht Mitglieder und Publikum");
    expect(card).toHaveTextContent("Anfragen und Anmeldungen");
    expect(card.textContent).not.toMatch(/Betrieb|Kundschaft|Kunden/);
    await waitFor(() => expect(crm()).toHaveLength(1));
    expect(crm()[0].body.eingabe.startsWith("Verein: FC Trogen\nTätigkeit: Fussball\nZiel: Mitglieder gewinnen\nZielgruppe: Mitglieder und Publikum")).toBe(true);
    expect(crm()[0].body.ausgabe).toContain("**Verein:** FC Trogen");
  });

  it("lädt PDF und Word über die Adresse herunter", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const card = await ergebnisKarte();
    await user.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [bytes, name, mime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(name).toBe("kanalstrategie-malerei-keller-gossau.pdf");
    expect(mime).toBe("application/pdf");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    await user.click(within(card).getByRole("button", { name: "Word herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(2), { timeout: 15000 });
    expect(vi.mocked(downloadBytes).mock.calls[1][1]).toBe("kanalstrategie-malerei-keller-gossau.docx");
  }, 40000);

  it("verwendet in Formular und Ergebnis keine Wörter der Sperrliste", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const { container } = render(<Tool />);
    const hart = (text: string) => brandHits(text).filter((h) => h.level === "hart");
    expect(hart(container.textContent ?? "")).toEqual([]);
    expect(container.textContent).not.toMatch(/!|—|jetzt|nur noch|garantiert/);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const card = await ergebnisKarte();
    expect(hart(card.textContent ?? "")).toEqual([]);
    expect(card.textContent).not.toMatch(/NaN|undefined|!|—|jetzt|nur noch|garantiert/);
  });
});
