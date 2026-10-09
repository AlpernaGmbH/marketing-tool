// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_AT_KEY, PROFILE_EXPIRED_KEY, PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { ProfilEditor, summaryRows } from "./ProfilEditor";

const stored = () => JSON.parse(readLocal(PROFILE_KEY) ?? "{}");
let downloads: { download: string; blobText?: Promise<string> }[] = [];
let lastBlob: Blob | null = null;

beforeEach(() => {
  clearAllLocal();
  downloads = [];
  lastBlob = null;
  URL.createObjectURL = vi.fn((b: Blob) => ((lastBlob = b), "blob:test"));
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ download: this.download });
  });
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.restoreAllMocks();
});

const jsonFile = (obj: unknown, name = "profil.json") => new File([typeof obj === "string" ? obj : JSON.stringify(obj)], name, { type: "application/json" });

describe("ProfilEditor", () => {
  it("speichert Eingaben sofort im Browser und entfernt geleerte Felder", async () => {
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await u.type(screen.getByLabelText("Ort"), "Gossau");
    await u.selectOptions(screen.getByLabelText("Kanton"), "SG");
    await u.click(screen.getByText(/Mehr Angaben/));
    await u.click(screen.getByRole("radio", { name: "GmbH" }));
    expect(stored()).toMatchObject({ firma: "Malerei Keller", ort: "Gossau", kanton: "SG", rechtsform: "GmbH", organisationstyp: "kmu" });

    await u.clear(screen.getByLabelText("Ort"));
    expect(stored().ort).toBeUndefined();
    expect(stored().firma).toBe("Malerei Keller");
  });

  it("wechselt Beschriftung und Grössen, wenn es ein Verein ist, und setzt die Grösse zurück", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "FC Trogen", groesse: "10-49" }));
    const u = userEvent.setup();
    render(<ProfilEditor />);
    expect(await screen.findByLabelText("Firma")).toBeInTheDocument();
    await u.click(screen.getByText(/Mehr Angaben/));
    await u.click(screen.getByRole("radio", { name: "Verein" }));
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(stored().organisationstyp).toBe("verein");
    expect(stored().rechtsform).toBe("Verein");
    expect(stored().groesse).toBeUndefined();
    expect(within(screen.getByLabelText("Grösse")).getByRole("option", { name: "bis 50 Mitglieder" })).toBeInTheDocument();
  });

  it("zeigt in der Auswahl Verein und Stiftung getrennt, mit «KMU oder Selbständige» als Standard", async () => {
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.click(screen.getByText(/Mehr Angaben/));
    expect(screen.getByRole("radio", { name: "KMU oder Selbständige" })).toBeChecked();
    await u.click(screen.getByRole("radio", { name: "Stiftung" }));
    expect(stored()).toMatchObject({ rechtsform: "Stiftung", organisationstyp: "verein" });
    expect(screen.getByRole("radio", { name: "Verein" })).not.toBeChecked();
    await u.click(screen.getByRole("radio", { name: "KMU oder Selbständige" }));
    expect(stored().rechtsform).toBeUndefined();
    expect(stored().organisationstyp).toBe("kmu");
  });

  it("zeigt die Branche mit Hinweis, zu welcher der gemeinsamen Liste sie gehört, und setzt sie per Knopf", async () => {
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.type(screen.getByLabelText("Branche"), "Malerei");
    expect(screen.getByTestId("branche-hinweis")).toHaveTextContent("Gehört in den Werkzeugen zu: Handwerk");
    await u.click(screen.getByRole("button", { name: "Fitness und Sport" }));
    expect(stored().branche).toBe("Fitness und Sport");
    expect(screen.getByRole("button", { name: "Fitness und Sport" })).toHaveAttribute("aria-pressed", "true");
    await u.clear(screen.getByLabelText("Branche"));
    await u.type(screen.getByLabelText("Branche"), "Raumfahrt");
    expect(screen.getByTestId("branche-hinweis")).toHaveTextContent("Passt zu keiner Branche der Liste");
  });

  it("zählt die Angaben im Fortschritt und nennt, bis wann das Profil gilt", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei" }));
    writeLocal(PROFILE_AT_KEY, String(Date.now()));
    render(<ProfilEditor />);
    expect(await screen.findByTestId("profil-fortschritt")).toHaveTextContent("3 von 5 Angaben");
    expect(screen.getByRole("meter", { name: "Angaben im Profil" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText(/Das Profil gilt bis \d{2}\.\d{2}\.\d{4} und verlängert sich mit jeder Nutzung/)).toBeInTheDocument();
  });

  it("löscht ein Profil, das länger als zwölf Monate ungenutzt blieb, und sagt es einmal", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Alt GmbH" }));
    writeLocal(PROFILE_AT_KEY, String(Date.now() - 366 * 24 * 60 * 60 * 1000));
    const u = userEvent.setup();
    render(<ProfilEditor />);
    expect(await screen.findByRole("status")).toHaveTextContent("länger als zwölf Monate ungenutzt");
    expect(readLocal(PROFILE_KEY)).toBeNull();
    expect(screen.getByLabelText("Firma")).toHaveValue("");
    await u.click(screen.getByRole("button", { name: "Verstanden" }));
    expect(readLocal(PROFILE_EXPIRED_KEY)).toBeNull();
  });

  it("behält ein Profil innerhalb der zwölf Monate und ergänzt den Zeitpunkt bei älteren Profilen ohne", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Keller AG" }));
    render(<ProfilEditor />);
    expect(await screen.findByLabelText("Firma")).toHaveValue("Keller AG");
    await waitFor(() => expect(readLocal(PROFILE_AT_KEY)).toMatch(/^\d{13}$/));
  });

  it("warnt, wenn der Browser nichts dauerhaft speichert", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("gesperrt");
    });
    render(<ProfilEditor />);
    expect(await screen.findByRole("alert")).toHaveTextContent("speichert nichts dauerhaft");
  });

  it("verlinkt leere Angaben mit dem Werkzeug, das sie füllt, und zeigt gefüllte als Haken", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ zielgruppen: [{ name: "Hausbesitzer" }] }));
    render(<ProfilEditor />);
    expect(await screen.findByText("Hausbesitzer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Personas/ })).toHaveAttribute("href", "/tools/persona");
    expect(screen.getByRole("link", { name: /Marketingbudget pro Jahr/ })).toHaveAttribute("href", "/tools/budget-planer");
    expect(screen.queryByRole("link", { name: /Zielgruppen/ })).not.toBeInTheDocument();
  });

  it("exportiert das Profil als JSON-Datei mit Datum im Namen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", kanton: "SG" }));
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.click(await screen.findByRole("button", { name: "Profil exportieren (JSON)" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].download).toMatch(/^alperna-firmenprofil-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await lastBlob!.text());
    expect(data.version).toBe(1);
    expect(data.profile).toEqual({ firma: "Malerei Keller", kanton: "SG" });
  });

  it("sperrt den Export, solange das Profil leer ist", async () => {
    render(<ProfilEditor />);
    expect(await screen.findByRole("button", { name: "Profil exportieren (JSON)" })).toBeDisabled();
  });

  it("importiert in ein leeres Profil direkt und meldet ignorierte Angaben", async () => {
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.upload(screen.getByLabelText("Profil-Datei auswählen"), jsonFile({ profile: { firma: "FC Trogen", kanton: "xx" } }));
    expect(await screen.findByRole("status")).toHaveTextContent("Profil geladen. 1 unbekannte oder ungültige Angaben");
    expect(stored()).toEqual({ firma: "FC Trogen" });
  });

  it("fragt vor dem Ersetzen eines vorhandenen Profils", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Alt" }));
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.upload(screen.getByLabelText("Profil-Datei auswählen"), jsonFile({ firma: "Neu" }));
    const dialog = await screen.findByRole("dialog");
    expect(stored().firma).toBe("Alt");
    await u.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(stored().firma).toBe("Alt");

    await u.upload(screen.getByLabelText("Profil-Datei auswählen"), jsonFile({ firma: "Neu" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Ersetzen" }));
    await waitFor(() => expect(stored().firma).toBe("Neu"));
  });

  it("zeigt eine verständliche Meldung bei kaputter Datei und ändert nichts", async () => {
    const u = userEvent.setup();
    render(<ProfilEditor />);
    await u.upload(screen.getByLabelText("Profil-Datei auswählen"), jsonFile("{kaputt"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Das ist keine gültige JSON-Datei.");
    expect(readLocal(PROFILE_KEY)).toBeNull();
  });

  it("löscht nach Bestätigung Profil, Zwischenstände und Merkliste, aber nichts Fremdes", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Keller" }));
    writeLocal("mt:icp-builder", "{}");
    writeLocal("mt:merkliste", "[]");
    window.localStorage.setItem("fremd", "bleibt");
    const u = userEvent.setup();
    render(<ProfilEditor />);

    await u.click(await screen.findByRole("button", { name: "Alles löschen" }));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(readLocal(PROFILE_KEY)).not.toBeNull();

    await u.click(screen.getByRole("button", { name: "Alles löschen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Alles löschen" }));
    await waitFor(() => expect(readLocal(PROFILE_KEY)).toBeNull());
    expect(readLocal("mt:icp-builder")).toBeNull();
    expect(readLocal("mt:merkliste")).toBeNull();
    expect(window.localStorage.getItem("fremd")).toBe("bleibt");
    window.localStorage.removeItem("fremd");
  });
});

describe("summaryRows", () => {
  it("zeigt «noch leer» ohne Angaben und fasst Listen zusammen", () => {
    expect(summaryRows({}).every((r) => r.value === "noch leer")).toBe(true);
    const rows = summaryRows({
      zielgruppen: [{ name: "Hausbesitzer" }, { name: "Genossenschaften" }],
      budgetJahr: 12500,
      kanaele: [{ kanal: "Google" }],
      marke: { werte: ["Handwerk", "Verlässlichkeit"] },
    });
    const get = (l: string) => rows.find((r) => r.label === l)?.value;
    expect(get("Zielgruppen")).toBe("Hausbesitzer, Genossenschaften");
    expect(get("Marketingbudget pro Jahr")).toBe("CHF 12'500.-");
    expect(get("Kanäle")).toBe("1 Kanäle");
    expect(get("Markenwerte")).toBe("Handwerk, Verlässlichkeit");
    expect(rows.find((r) => r.label === "Personas")?.slug).toBe("persona");
    expect(get("Personas")).toBe("noch leer");
  });
});
