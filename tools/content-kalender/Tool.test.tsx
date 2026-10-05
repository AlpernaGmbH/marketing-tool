// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

const downloads: { name: string; mime: string; text: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string, mime: string) => downloads.push({ name, mime, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) }),
}));

const profile = { organisationstyp: "kmu", firma: "Malerei Keller", ort: "Gossau", kanton: "SG", branche: "Malerei und Gipserei", kanaele: [{ name: "Instagram" }, { name: "Newsletter" }] };

let posts: { url: string; body: Record<string, string> }[] = [];

beforeEach(() => {
  clearAllLocal();
  posts = [];
  downloads.length = 0;
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

describe("content-kalender: Werkzeug im Browser", () => {
  it("fragt zuerst die Adresse, zeigt dann den Kalender und schickt Eingabe und Ausgabe ans CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();

    // Vorbelegung aus dem Profil: Handwerk, Instagram und Newsletter
    await waitFor(() => expect(screen.getByLabelText("Branche für Vorschläge")).toHaveValue("handwerk"));
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Newsletter" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Google-Beitrag" })).not.toBeChecked();
    expect(screen.queryByText("Dein Content-Kalender")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kalender erstellen" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Content-Kalender" });
    expect(within(card).getByTestId("ck-summary")).toHaveTextContent("für Malerei Keller, St. Gallen (SG), Branche Handwerk. Kanäle: Instagram, Newsletter.");
    for (const month of ["Januar", "Mai", "Dezember"]) expect(within(card).getByRole("list", { name: month })).toBeInTheDocument();
    expect(within(card).getAllByRole("heading", { level: 4 }).filter((h) => /\b2026$/.test(h.textContent ?? ""))).toHaveLength(12);
    const mai = within(within(card).getByRole("list", { name: "Mai" })).getAllByRole("listitem");
    expect(mai[0]).toHaveTextContent("10.05.2026, Sonntag: Muttertag");
    expect(mai[0]).toHaveTextContent("Vorschlag: Danke an alle Mütter");
    expect(mai[0]).toHaveTextContent("Kanäle: Instagram, Newsletter");
    expect(within(card).getByRole("list", { name: "März" })).toHaveTextContent("Keine Einträge in diesem Monat.");
    expect(within(card).getByTestId("ck-quellen")).toHaveTextContent("Schulferien sind für 21 Kantone belegt");
    expect(within(card).getByRole("button", { name: "Kalender (.ics)" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "CSV" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();

    // CRM: erst /api/lead, dann /api/result mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.tool).toBe("content-kalender");
    expect(result.firma).toBe("Malerei Keller");
    expect(result.eingabe.split("\n")[0]).toBe("Kanton: St. Gallen (SG)");
    expect(result.eingabe).toContain("Kanäle: Instagram, Newsletter");
    expect(result.ausgabe.startsWith("# Content-Kalender 2026, Malerei Keller")).toBe(true);
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Stand: phase «result» (Pfad-Fortschritt), nach dem Neuladen steht das Ergebnis ohne neue Anfrage
    const saved = JSON.parse(readLocal("mt:content-kalender")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", kanton: "SG", branche: "handwerk", kanaele: ["instagram", "newsletter"] });
    cleanup();
    posts = [];
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Content-Kalender" })).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("fügt eigene Termine hinzu und entfernt sie; sie stehen im Kalender", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Datum")).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Termin hinzufügen" }));
    expect(await screen.findByText("Wähle ein gültiges Datum für den Termin.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Datum"), "2026-11-14");
    await user.type(screen.getByLabelText("Titel"), "Tag der offenen Tür{Enter}");
    const list = screen.getByRole("list", { name: "Eigene Termine" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("14.11.2026: Tag der offenen Tür");
    expect(screen.getByText("1 von 20 Terminen.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kalender erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Content-Kalender" });
    expect(within(within(card).getByRole("list", { name: "November" })).getByText("14.11.2026, Samstag: Tag der offenen Tür")).toBeInTheDocument();
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    expect(posts.find((p) => p.url === "/api/result")!.body.eingabe).toContain("Eigene Termine: 14.11.2026 Tag der offenen Tür");

    // «Angaben ändern» zeigt das Formular mit dem Termin; «Entfernen» nimmt ihn heraus
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    await user.click(await screen.findByRole("button", { name: /Termin entfernen/ }));
    expect(within(screen.getByRole("list", { name: "Eigene Termine" })).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("lädt Kalenderdatei und CSV herunter, wenn die Adresse bekannt ist", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Kalender erstellen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Kalender erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Content-Kalender" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(card).getByTestId("ck-ics"));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("content-kalender-2026-malerei-keller.ics");
    expect(downloads[0].mime).toContain("text/calendar");
    expect(downloads[0].text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(downloads[0].text).toContain("SUMMARY:Content: Muttertag\r\n");

    await user.click(within(card).getByTestId("ck-csv"));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[1].name).toBe("content-kalender-2026-malerei-keller.csv");
    expect(downloads[1].text.startsWith("\uFEFFDatum;Art;Titel;Vorschlag;Format;Kanäle\r\n")).toBe(true);
  });

  it("meldet einen fehlenden Kanton, ohne das Fenster zu öffnen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Kalender erstellen" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Kalender erstellen" }));
    expect(await screen.findByText(/Wähle in den Grunddaten deinen Kanton/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("verlangt mindestens einen Kanal", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await user.click(screen.getByRole("checkbox", { name: "Newsletter" }));
    await user.click(screen.getByRole("button", { name: "Kalender erstellen" }));
    expect(await screen.findByText("Wähle mindestens einen Kanal.")).toBeInTheDocument();
  });
});
