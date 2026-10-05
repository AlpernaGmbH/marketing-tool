// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { styleIssues } from "@/lib/content-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { addDays } from "@/tools/content-kalender/logic";
import { todayIso } from "./logic";
import Tool from "./Tool";

const downloads: { name: string; mime: string; text: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string, mime: string) => downloads.push({ name, mime, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) }),
}));

// Die Schriften für das PDF liegen im Browser unter /fonts; im Test prüfen wir nur, dass der Knopf das Dokument übergibt.
const pdfCalls: { header: string[]; rows: number }[] = [];
vi.mock("./export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export")>()),
  pdfFile: async (doc: { blocks: { type: string; header?: string[]; rows?: string[][] }[] }) => {
    const table = doc.blocks.find((b) => b.type === "table");
    pdfCalls.push({ header: table?.header ?? [], rows: table?.rows?.length ?? 0 });
    return { bytes: new TextEncoder().encode("%PDF-test"), filename: "zeitplan-test.pdf", mime: "application/pdf" };
  },
}));

const heute = todayIso(new Date());
const IN_ZWEI_MONATEN = addDays(heute, 60);
const profile = { organisationstyp: "kmu", firma: "Malerei Keller", ort: "Gossau", kanton: "SG", kanaele: [{ name: "Instagram" }, { name: "Newsletter" }] };
const NAME = "Tag der offenen Tür Malerei Keller";

let posts: { url: string; body: Record<string, string> }[] = [];

beforeEach(() => {
  clearAllLocal();
  posts = [];
  downloads.length = 0;
  pdfCalls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Zeitplan erstellen" })).toBeEnabled());
}

async function fill(user: ReturnType<typeof userEvent.setup>, opts: { name?: string; datum?: string } = {}) {
  await user.type(screen.getByLabelText("Name des Anlasses"), opts.name ?? NAME);
  await user.type(screen.getByLabelText("Datum des Anlasses"), opts.datum ?? IN_ZWEI_MONATEN);
}

describe("anlass-planer: Werkzeug im Browser", () => {
  it("fragt zuerst die Adresse, zeigt dann den Zeitplan, hakt ab und schickt Eingabe und Ausgabe ans CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();

    // Vorbelegung aus dem Profil: Instagram und Newsletter; erste Art für KMU ist der Tag der offenen Tür
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Newsletter" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Website" })).not.toBeChecked();
    expect(screen.getByLabelText("Was planst du?")).toHaveValue("tag-der-offenen-tuer");
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.queryByRole("region", { name: "Dein Zeitplan" })).not.toBeInTheDocument();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Zeitplan" });
    expect(within(card).getByTestId("ap-titel")).toHaveTextContent(NAME);
    const liste = within(card).getByRole("list", { name: "Aufgaben" });
    const gruppen = within(liste).getAllByTestId("ap-gruppe");
    expect(gruppen.length).toBeGreaterThan(5);
    expect(within(gruppen[0]).getByRole("heading", { level: 4 })).toHaveTextContent(/^\d+ Wochen? vorher$/);
    expect(within(liste).getByRole("list", { name: "Anlasstag" })).toBeInTheDocument();
    expect(within(liste).getByRole("list", { name: "1 Woche danach" })).toBeInTheDocument();
    const aufgaben = within(liste).getAllByRole("checkbox");
    expect(aufgaben.length).toBeGreaterThanOrEqual(15);
    expect(within(card).getByRole("checkbox", { name: "Ankündigung auf Instagram veröffentlichen" })).toBeInTheDocument();
    expect(within(card).queryByRole("checkbox", { name: "Ankündigung auf der Website veröffentlichen" })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Werkzeug öffnen: Ankündigung auf Instagram veröffentlichen" })).toHaveAttribute("href", "/tools/post-generator");
    expect(within(card).getByTestId("ap-fortschritt")).toHaveTextContent(`0 von ${aufgaben.length} erledigt`);

    // CRM: erst /api/lead, dann einmal /api/result mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.tool).toBe("anlass-planer");
    expect(result.firma).toBe("Malerei Keller");
    expect(result.eingabe.split("\n")[0]).toBe("Art: Tag der offenen Tür");
    expect(result.eingabe).toContain(`Name: ${NAME}`);
    expect(result.eingabe).toContain("Kanäle: Instagram, Newsletter");
    expect(result.eingabe).toContain("Bezahlte Inserate: nein");
    expect(result.ausgabe.startsWith(`# Zeitplan: ${NAME}\n`)).toBe(true);
    expect(result.ausgabe).toContain("| Datum | Aufgabe | Kanal |");
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Abhaken ändert den Plan nicht und schickt nichts
    await user.click(within(card).getByRole("checkbox", { name: "Ziel und Budget klären" }));
    expect(within(card).getByRole("checkbox", { name: "Ziel und Budget klären" })).toBeChecked();
    expect(within(card).getByTestId("ap-fortschritt")).toHaveTextContent(`1 von ${aufgaben.length} erledigt`);
    expect(within(card).getAllByRole("checkbox")).toHaveLength(aufgaben.length);
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Stand: phase «result» (Pfad-Fortschritt), Haken gespeichert; nach dem Neuladen steht alles ohne neue Anfrage da
    const saved = JSON.parse(readLocal("mt:anlass-planer")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", erledigt: ["g-ziel"], input: { typ: "tag-der-offenen-tuer", name: NAME, datum: IN_ZWEI_MONATEN, kanaele: ["instagram", "newsletter"], organisation: "kmu" } });
    cleanup();
    posts = [];
    render(<Tool />);
    const again = await screen.findByRole("region", { name: "Dein Zeitplan" });
    expect(within(again).getByRole("checkbox", { name: "Ziel und Budget klären" })).toBeChecked();
    expect(within(again).getByTestId("ap-fortschritt")).toHaveTextContent(`1 von ${aufgaben.length} erledigt`);
    expect(posts).toHaveLength(0);
  });

  it("meldet ein Datum in der Vergangenheit, ohne das Fenster zu öffnen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { datum: addDays(heute, -1) });
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const meldung = await screen.findByText(/Das Datum liegt in der Vergangenheit/);
    expect(meldung.closest("[role=alert]")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dein Zeitplan" })).not.toBeInTheDocument();
  });

  it("meldet einen zu kurzen Namen, ein fehlendes Datum und einen fehlenden Kanal", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    await user.type(screen.getByLabelText("Name des Anlasses"), "ab");
    await user.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await user.click(screen.getByRole("checkbox", { name: "Newsletter" }));
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    expect(await screen.findByText(/mindestens 3 Zeichen/)).toBeInTheDocument();
    expect(screen.getByText("Wähle das Datum des Anlasses.")).toBeInTheDocument();
    expect(screen.getByText("Wähle mindestens einen Kanal.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Anlasses")).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fügt mit der Checkbox für Inserate zwei Aufgaben ein", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "Wir schalten bezahlte Inserate" }));
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Zeitplan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(card).getByRole("checkbox", { name: "Inserat planen und buchen" })).toBeInTheDocument();
    expect(within(card).getByRole("checkbox", { name: "Inserat prüfen" })).toBeInTheDocument();
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    expect(posts.find((p) => p.url === "/api/result")!.body.eingabe).toContain("Bezahlte Inserate: ja");
  });

  it("stellt für Vereine Dorffest und Generalversammlung an den Anfang der Auswahl", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein", firma: "FC Trogen" }));
    render(<Tool />);
    await ready();
    await waitFor(() => expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen"));
    const select = screen.getByLabelText("Was planst du?");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Dorffest oder Vereinsfest", "Generalversammlung", "Tag der offenen Tür", "Eröffnung", "Jubiläum", "Messe oder Marktstand"]);
    expect(select).toHaveValue("dorffest");
    // ohne Angabe im Profil: Website, Instagram, Aushang und Flyer
    expect(screen.getByRole("checkbox", { name: "Website" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Aushang und Flyer" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "WhatsApp" })).not.toBeChecked();
  });

  it("lädt Kalenderdatei und PDF herunter, wenn die Adresse bekannt ist", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Zeitplan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Kalender (.ics) herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("zeitplan-tag-der-offenen-tuer-malerei-keller.ics");
    expect(downloads[0].mime).toContain("text/calendar");
    expect(downloads[0].text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(downloads[0].text).toContain(`DTSTART;VALUE=DATE:${IN_ZWEI_MONATEN.replace(/-/g, "")}`);

    await user.click(within(card).getByRole("button", { name: "Zeitplan (PDF) herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[1].name).toBe("zeitplan-test.pdf");
    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0].header).toEqual(["Datum", "Aufgabe", "Kanal", "Erledigt"]);
    expect(pdfCalls[0].rows).toBeGreaterThan(10);

    // Word und Kopieren kommen aus DocumentExport, PDF dort nicht doppelt
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "PDF herunterladen" })).not.toBeInTheDocument();
  });

  it("zeigt Angaben ändern mit den gespeicherten Werten und behält die Haken bei gleicher Art und gleichem Datum", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Zeitplan" });
    await user.click(within(card).getByRole("checkbox", { name: "Datum und Ort sichern" }));

    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Name des Anlasses")).toHaveValue(NAME);
    expect(screen.getByLabelText("Datum des Anlasses")).toHaveValue(IN_ZWEI_MONATEN);
    await user.click(screen.getByRole("checkbox", { name: "WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const neu = await screen.findByRole("region", { name: "Dein Zeitplan" });
    expect(within(neu).getByRole("checkbox", { name: "Datum und Ort sichern" })).toBeChecked();
    expect(within(neu).getByRole("checkbox", { name: "Einladung per WhatsApp an Kontakte und Gruppen senden" })).not.toBeChecked();
    await waitFor(() => expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(2));

    // «Neu beginnen» leert Formular und Haken
    await user.click(within(neu).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Name des Anlasses")).toHaveValue("");
    expect(JSON.parse(readLocal("mt:anlass-planer")!)).toMatchObject({ phase: "edit", input: null, erledigt: [] });
  });

  it("ignoriert einen kaputten Stand im Speicher", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:anlass-planer", "{kaputt");
    render(<Tool />);
    await ready();
    expect(screen.getByLabelText("Name des Anlasses")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein Zeitplan" })).not.toBeInTheDocument();
  });

  it("hält in Formular und Ergebnis die Regeln für Ton und Schreibweise ein", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    const form = document.body.textContent ?? "";
    expect(form).toContain("Richtwert von Alperna, keine Statistik");
    expect(styleIssues(form)).toEqual([]);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Zeitplan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Zeitplan" });
    const result = card.textContent ?? "";
    expect(result).toContain("Richtwert von Alperna, keine Statistik");
    expect(styleIssues(result)).toEqual([]);
    expect(result).not.toMatch(/nur noch|jetzt|[!—]/);
  });
});
