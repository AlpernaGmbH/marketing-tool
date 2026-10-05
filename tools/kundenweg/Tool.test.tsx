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
type User = ReturnType<typeof userEvent.setup>;

type Eingabe = { frage: string; punkte: string[]; inhalt: "ja" | "teilweise" | "nein" | ""; verantwortlich: string };
/** Malerei Keller, Gossau: vier Phasen abgedeckt, Entscheiden fehlt (rot), Vergleichen nur teilweise (gelb). */
const KELLER: Eingabe[] = [
  { frage: "Wer streicht Fassaden in Gossau?", punkte: ["website", "gbp"], inhalt: "ja", verantwortlich: "Anna Keller" },
  { frage: "Was kostet ein Anstrich, wie läuft es ab?", punkte: ["website"], inhalt: "ja", verantwortlich: "Anna Keller" },
  { frage: "Warum Keller und nicht der andere Maler?", punkte: ["website", "empfehlungen"], inhalt: "teilweise", verantwortlich: "Anna Keller" },
  { frage: "Kann ich dem vertrauen, und wie melde ich mich?", punkte: ["website", "telefon"], inhalt: "nein", verantwortlich: "Markus Keller" },
  { frage: "Was passiert nach meiner Zusage?", punkte: ["telefon"], inhalt: "ja", verantwortlich: "Markus Keller" },
  { frage: "Wem erzähle ich davon?", punkte: ["gbp", "empfehlungen"], inhalt: "ja", verantwortlich: "" },
];

/** Text in ein Feld setzen (ein Ereignis statt eines je Zeichen: das Formular hat über 70 Felder und jsdom braucht sonst Sekunden). */
const setText = (id: string, value: string) => fireEvent.change(el(id), { target: { value } });

async function fillPhase(user: User, n: number, p: Eingabe) {
  if (p.frage) setText(`kw-p${n}-frage`, p.frage);
  for (const k of p.punkte) await user.click(el(`kw-p${n}-punkt-${k}`));
  if (p.inhalt) await user.click(el(`kw-p${n}-inhalt-${p.inhalt}`));
  if (p.verantwortlich) setText(`kw-p${n}-verantwortlich`, p.verantwortlich);
}
async function fillAll(user: User, eingaben: Eingabe[] = KELLER) {
  for (const [i, p] of eingaben.entries()) await fillPhase(user, i + 1, p);
}

const create = (user: User, name = "Kundenweg erstellen") => user.click(screen.getByRole("button", { name }));
const crm = () => sent.filter((s) => s.url.includes("/api/result"));
const ergebnisKarte = () => screen.findByRole("region", { name: "Dein Kundenweg" });

describe("Kundenweg-Mapper: Formular", () => {
  it("zeigt sechs Abschnitte mit Beschriftung, Platzhalter und Grenzen", () => {
    render(<Tool />);
    const legends = ["Aufmerksam werden", "Informieren", "Vergleichen", "Entscheiden", "Kaufen oder Nutzen", "Weiterempfehlen"];
    for (const [i, name] of legends.entries()) {
      const n = i + 1;
      const group = screen.getByRole("group", { name });
      expect(group).toBe(screen.getByTestId(`phase-${n}`));
      const frage = within(group).getByLabelText(`Phase ${n}: Was fragt sich die Kundschaft?`);
      expect(frage).toBe(el(`kw-p${n}-frage`));
      expect(frage).toHaveAttribute("maxlength", "160");
      expect(frage).toHaveValue("");
      expect(within(group).getByLabelText(`Phase ${n}: Verantwortlich`)).toHaveAttribute("maxlength", "60");
      expect(within(group).getByRole("group", { name: `Phase ${n}: Wo begegnet die Kundschaft dir?` })).toBeInTheDocument();
      expect(within(group).getByRole("group", { name: `Phase ${n}: Gibt es dafür Inhalt?` })).toBeInTheDocument();
    }
    expect(el("kw-p1-frage")).toHaveAttribute("placeholder", "Wer macht so etwas in meiner Nähe?");
    expect(el("kw-p2-frage")).toHaveAttribute("placeholder", "Was kostet das, wie läuft es ab?");
    expect(el("kw-p3-frage")).toHaveAttribute("placeholder", "Warum dieser Betrieb und nicht der andere?");
    expect(el("kw-p4-frage")).toHaveAttribute("placeholder", "Kann ich dem vertrauen, und wie melde ich mich?");
    expect(el("kw-p5-frage")).toHaveAttribute("placeholder", "Was passiert nach meiner Zusage?");
    expect(el("kw-p6-frage")).toHaveAttribute("placeholder", "Wem erzähle ich davon?");
    expect(screen.getByRole("button", { name: "Kundenweg erstellen" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("0 von 6 Phasen beschrieben");
  });

  it("bietet je Phase zwölf Berührungspunkte und die Antworten Ja, Teilweise, Nein ohne Vorauswahl", () => {
    render(<Tool />);
    const gruppe = within(screen.getByTestId("phase-3")).getByRole("group", { name: "Phase 3: Wo begegnet die Kundschaft dir?" });
    const boxen = within(gruppe).getAllByRole("checkbox");
    expect(within(gruppe).getAllByRole("checkbox").map((b) => (b as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Website",
      "Google-Unternehmensprofil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter",
      "Empfehlungen",
      "Anlässe",
      "Aushang und Flyer",
      "Lokalzeitung und Anzeiger",
      "Telefon und Gespräch",
      "WhatsApp",
    ]);
    expect(boxen.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    const radios = within(screen.getByRole("group", { name: "Phase 3: Gibt es dafür Inhalt?" })).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Ja", "Teilweise", "Nein"]);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/Keine Auswahl zählt wie «Nein»/)).toBeInTheDocument();
  });

  it("hat zu jedem Feld eine Beschriftung", () => {
    const { container } = render(<Tool />);
    const controls = container.querySelectorAll("input, select, textarea");
    expect(controls.length).toBeGreaterThan(6 * 17);
    for (const c of controls) {
      const labelled = (c as HTMLInputElement).labels?.length || c.getAttribute("aria-label");
      expect(labelled, `${c.tagName} ${c.id}`).toBeTruthy();
    }
  });

  it("füllt Firma und Branche aus dem Profil vor", () => {
    profile({ firma: "Malerei Keller", branche: "Malerei" });
    render(<Tool />);
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByRole("group", { name: "Dein Betrieb" })).toBeInTheDocument();
  });

  it("kreuzt die Kanäle aus dem Profil nur in Phase 1 und 2 vor und lässt die Person sie ändern", async () => {
    profile({ firma: "Malerei Keller", kanaele: [{ name: "Instagram" }, { name: "Website" }, { name: "TikTok" }] });
    render(<Tool />);
    const user = userEvent.setup();
    const checked = (n: number) => ["website", "instagram", "telefon"].filter((k) => (el(`kw-p${n}-punkt-${k}`) as HTMLInputElement).checked);
    await waitFor(() => expect(checked(1)).toEqual(["website", "instagram"]));
    expect(checked(2)).toEqual(["website", "instagram"]);
    expect(checked(3)).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("2 von 6 Phasen beschrieben");

    await user.click(el("kw-p1-punkt-website"));
    setText("kw-p3-frage", "Warum ihr?");
    expect(checked(1)).toEqual(["instagram"]); // die Wahl der Person gilt, der Vorschlag kommt nicht zurück
    expect(checked(2)).toEqual(["website", "instagram"]);
    expect(checked(3)).toEqual([]);
  });

  it("macht keinen Vorschlag, wenn das Profil keinen passenden Kanal nennt", async () => {
    profile({ kanaele: [{ name: "Google Ads" }, { name: "TikTok" }] });
    render(<Tool />);
    await waitFor(() => expect(screen.getByLabelText("Firma")).toBeEnabled());
    expect(document.querySelectorAll("input[type=checkbox]:checked")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("0 von 6 Phasen beschrieben");
  });

  it("zeigt Vereinen «Mitmachen», den Weg zur Mitgliedschaft und eigene Platzhalter", () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    render(<Tool />);
    expect(screen.getByRole("group", { name: "Dein Verein" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("Fussball");
    expect(screen.getByRole("group", { name: "Mitmachen" })).toBe(screen.getByTestId("phase-5"));
    expect(screen.queryByRole("group", { name: "Kaufen oder Nutzen" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Weiterempfehlen" })).toBeInTheDocument();
    expect(el("kw-p1-frage")).toHaveAttribute("placeholder", "Gibt es in meiner Nähe einen Verein dafür?");
    expect(el("kw-p5-frage")).toHaveAttribute("placeholder", "Wie werde ich Mitglied, und was passiert danach?");
    expect(screen.getByRole("button", { name: "Weg zur Mitgliedschaft erstellen" })).toBeEnabled();
  });

  it("meldet ein leeres Formular in einer Meldung (role alert), fragt nicht nach der Adresse und schickt nichts", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    await create(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Beschreibe mindestens eine Phase");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dein Kundenweg" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("speichert den Entwurf im Browser und stellt ihn nach dem Neuladen wieder her", async () => {
    const first = render(<Tool />);
    const user = userEvent.setup();
    await fillPhase(user, 2, KELLER[1]);
    await waitFor(() => expect(JSON.parse(readLocal("mt:kundenweg") ?? "{}")).toMatchObject({ v: 1, phase: "edit", typ: "kmu" }));
    await waitFor(() => expect(JSON.parse(readLocal("mt:kundenweg") ?? "{}").phasen[1]).toEqual({ frage: KELLER[1].frage, punkte: ["website"], inhalt: "ja", verantwortlich: "Anna Keller" }));
    first.unmount();
    render(<Tool />);
    expect(el("kw-p2-frage")).toHaveValue(KELLER[1].frage);
    expect(el("kw-p2-punkt-website")).toBeChecked();
    expect(el("kw-p2-inhalt-ja")).toBeChecked();
    expect(el("kw-p2-verantwortlich")).toHaveValue("Anna Keller");
    expect(el("kw-p1-frage")).toHaveValue("");
  });
});

describe("Kundenweg-Mapper: Ergebnis", () => {
  it("zeigt Karten, Lückenliste und Hinweise, speichert den Stand und schickt Eingabe und Ausgabe ins CRM", async () => {
    profile({ firma: "Malerei Keller, Gossau", branche: "Malerei und Gipserei" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);

    const card = await ergebnisKarte();
    expect(within(card).getByTestId("gesamtaussage")).toHaveTextContent("4 von 6 Phasen sind abgedeckt. Die wichtigste Lücke liegt in der Phase «Entscheiden»: Es gibt keinen Inhalt dafür.");
    expect(within(card).getByRole("meter", { name: "Phasen abgedeckt" })).toHaveAttribute("aria-valuenow", "4");

    const karten = within(within(card).getByRole("list", { name: "Kundenweg in sechs Phasen" })).getAllByTestId("phase-karte");
    expect(karten).toHaveLength(6);
    expect(karten.map((k) => within(k).getByRole("heading", { level: 4 }).textContent)).toEqual([
      "Aufmerksam werden",
      "Informieren",
      "Vergleichen",
      "Entscheiden",
      "Kaufen oder Nutzen",
      "Weiterempfehlen",
    ]);
    // Die Stufe steht als Text, nie nur als Farbe.
    expect(karten.map((k) => within(k).getByTestId("stufe").textContent)).toEqual(["Abgedeckt", "Abgedeckt", "Teilweise", "Lücke", "Abgedeckt", "Abgedeckt"]);
    expect(karten.map((k) => k.getAttribute("data-stufe"))).toEqual(["ok", "ok", "gelb", "rot", "ok", "ok"]);
    expect(karten[0]).toHaveTextContent("Website, Google-Unternehmensprofil");
    expect(karten[0]).toHaveTextContent("Anna Keller");
    expect(karten[5]).toHaveTextContent("Niemand verantwortlich");

    const liste = within(card).getByRole("list", { name: "Lücken nach Dringlichkeit" });
    const luecken = within(liste).getAllByTestId("luecke");
    expect(luecken).toHaveLength(2);
    expect(luecken[0]).toHaveTextContent("Phase 4: Entscheiden");
    expect(luecken[0]).toHaveTextContent("Lücke");
    expect(luecken[0]).toHaveTextContent("Es gibt keinen Inhalt dafür");
    expect(luecken[0]).toHaveTextContent("Klarer nächster Schritt: Anruf, WhatsApp oder Termin");
    expect(within(luecken[0]).getByRole("link", { name: "WhatsApp-Link mit QR" })).toHaveAttribute("href", "/tools/whatsapp-link");
    expect(luecken[1]).toHaveTextContent("Phase 3: Vergleichen");
    expect(luecken[1]).toHaveTextContent("Teilweise");
    expect(within(luecken[1]).getByRole("link", { name: "Bewertungs-Kit für Google" })).toHaveAttribute("href", "/tools/bewertungs-kit");
    expect(card).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    expect(within(card).getByRole("heading", { name: "Drei Hinweise" })).toBeInTheDocument();

    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();

    expect(JSON.parse(readLocal("mt:kundenweg") ?? "{}")).toMatchObject({
      v: 1,
      phase: "result",
      typ: "kmu",
      output: { firma: "Malerei Keller, Gossau", branche: "Malerei und Gipserei", datum: "05.10.2026" },
    });

    await waitFor(() => expect(crm()).toHaveLength(1));
    const body = crm()[0].body;
    expect(body.tool).toBe("kundenweg");
    expect(body.firma).toBe("Malerei Keller, Gossau");
    expect(body.eingabe.split("\n")).toHaveLength(6);
    expect(body.eingabe.startsWith("1. Aufmerksam werden: Frage: Wer streicht Fassaden in Gossau? | Berührungspunkte: Website, Google-Unternehmensprofil | Inhalt: Ja | Verantwortlich: Anna Keller")).toBe(true);
    expect(body.ausgabe.startsWith("# Kundenweg: Malerei Keller, Gossau")).toBe(true);
    expect(body.ausgabe).toContain("4 von 6 Phasen sind abgedeckt.");
    expect(body.ausgabe).not.toMatch(/[{}]|undefined/);
  });

  it("fragt ohne bekannte Adresse zuerst, zeigt bei «Später» nichts und behält das Formular", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("region", { name: "Dein Kundenweg" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kundenweg erstellen" })).toBeEnabled();
    expect(el("kw-p4-frage")).toHaveValue(KELLER[3].frage);
    expect(el("kw-p4-inhalt-nein")).toBeChecked();
    expect(crm()).toHaveLength(0);
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten Eintrag im CRM", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    await ergebnisKarte();
    await waitFor(() => expect(crm()).toHaveLength(1));
    first.unmount();
    render(<Tool />);
    expect(await ergebnisKarte()).toBeInTheDocument();
    expect(crm()).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück, behält die Angaben, und «Neu beginnen» setzt sie zurück", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await ergebnisKarte();
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Kundenweg erstellen" })).toBeInTheDocument();
    expect(el("kw-p3-frage")).toHaveValue(KELLER[2].frage);
    expect(el("kw-p3-inhalt-teilweise")).toBeChecked();
    expect(el("kw-p4-punkt-telefon")).toBeChecked();
    expect(JSON.parse(readLocal("mt:kundenweg") ?? "{}").phase).toBe("edit");

    // Inhalt in Phase 4 nachgetragen: eine Lücke weniger, ein zweiter Eintrag im CRM
    await user.click(el("kw-p4-inhalt-ja"));
    await create(user);
    const again = await ergebnisKarte();
    expect(within(again).getByTestId("gesamtaussage")).toHaveTextContent("5 von 6 Phasen sind abgedeckt.");
    expect(within(again).getAllByTestId("luecke")).toHaveLength(1);
    await waitFor(() => expect(crm()).toHaveLength(2));

    await user.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Kundenweg erstellen" })).toBeInTheDocument();
    expect(el("kw-p1-frage")).toHaveValue("");
    expect(el("kw-p4-inhalt-ja")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("0 von 6 Phasen beschrieben");
  });

  it("zeigt bei sechs abgedeckten Phasen keine Lücke", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(
      user,
      KELLER.map((p) => ({ ...p, inhalt: "ja", verantwortlich: p.verantwortlich || "Anna Keller" })),
    );
    await create(user);
    const card = await ergebnisKarte();
    expect(within(card).getByTestId("gesamtaussage")).toHaveTextContent("6 von 6 Phasen sind abgedeckt. Es gibt keine Lücke.");
    expect(within(card).queryByTestId("luecke")).not.toBeInTheDocument();
    expect(card).toHaveTextContent("Es gibt nichts zu ergänzen.");
  });

  it("wertet für Vereine den Weg zur Mitgliedschaft aus, mit «Mitmachen»", async () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillPhase(user, 1, { frage: "Gibt es in Trogen einen Fussballverein?", punkte: ["website", "aushang"], inhalt: "ja", verantwortlich: "Lea Frei" });
    await fillPhase(user, 5, { frage: "Wie werde ich Mitglied?", punkte: ["website"], inhalt: "nein", verantwortlich: "Lea Frei" });
    await create(user, "Weg zur Mitgliedschaft erstellen");
    const card = await screen.findByRole("region", { name: "Dein Weg zur Mitgliedschaft" });
    const karten = within(within(card).getByRole("list", { name: "Weg zur Mitgliedschaft in sechs Phasen" })).getAllByTestId("phase-karte");
    expect(within(karten[4]).getByRole("heading", { level: 4 })).toHaveTextContent("Mitmachen");
    const mitmachen = within(card).getAllByTestId("luecke").find((l) => l.textContent?.includes("Phase 5: Mitmachen"));
    expect(mitmachen).toHaveTextContent("Es gibt keinen Inhalt dafür");
    expect(mitmachen).toHaveTextContent("Beitritt in wenigen Schritten");
    expect(card).toHaveTextContent("Schnuppertraining oder Probetermin");
    await waitFor(() => expect(crm()).toHaveLength(1));
    expect(crm()[0].body.eingabe).toContain("5. Mitmachen: Frage: Wie werde ich Mitglied?");
    expect(crm()[0].body.ausgabe.startsWith("# Weg zur Mitgliedschaft: FC Trogen")).toBe(true);
  });

  it("lädt das PDF im Querformat herunter", async () => {
    profile({ firma: "Malerei Keller, Gossau" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await ergebnisKarte();
    await user.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [bytes, name, mime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(name).toBe("kundenweg-malerei-keller-gossau.pdf");
    expect(mime).toBe("application/pdf");
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
  }, 30000);

  it("verwendet in Formular und Ergebnis keine Wörter der Sperrliste", async () => {
    profile({ firma: "Malerei Keller", branche: "Malerei" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const { container } = render(<Tool />);
    const hart = (text: string) => brandHits(text).filter((h) => h.level === "hart");
    expect(hart(container.textContent ?? "")).toEqual([]);
    expect(container.textContent).not.toMatch(/customer[- ]?journey|touch ?point|funnel/i);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await ergebnisKarte();
    expect(hart(card.textContent ?? "")).toEqual([]);
    expect(card.textContent).not.toMatch(/NaN|undefined|!/);
    expect(card.textContent).not.toMatch(/customer[- ]?journey|touch ?point|funnel/i);
  });
});
