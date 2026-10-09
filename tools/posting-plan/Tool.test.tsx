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

const profile = {
  organisationstyp: "kmu",
  firma: "Malerei Keller",
  ort: "Gossau",
  kanaele: [{ name: "Instagram" }, { name: "Google Business Profil" }],
  contentSaeulen: [{ name: "Vorher und nachher" }, { name: "Einblick in den Alltag" }, { name: "Tipps vom Maler" }],
};

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

const ready = () => waitFor(() => expect(screen.getByRole("button", { name: "Plan erstellen" })).toBeEnabled());

describe("posting-plan: Werkzeug im Browser", () => {
  it("fragt zuerst die Adresse, zeigt dann den Plan und schickt Eingabe und Ausgabe ans CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();

    // Vorbelegung aus dem Profil: Instagram und Google-Unternehmensprofil, drei Säulen, Text gewählt
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Google-Unternehmensprofil" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Facebook" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Text" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Foto" })).not.toBeChecked();
    expect(within(screen.getByTestId("pp-saeulen-profil")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Vorher und nachher",
      "Einblick in den Alltag",
      "Tipps vom Maler",
    ]);
    expect(screen.queryByLabelText("Säule 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dein Posting-Plan" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("checkbox", { name: "Foto" }));
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Posting-Plan" });
    const plan = within(card).getByTestId("pp-plan");
    expect(within(plan).getAllByRole("table")).toHaveLength(6); // Wochenansicht, vier Wochen und die Annahmen
    const raster = within(plan).getByTestId("visual-grid");
    expect(within(raster).getByRole("heading", { name: "Die vier Wochen im Überblick" })).toBeInTheDocument();
    expect(within(raster).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Woche 1", "Woche 2", "Woche 3", "Woche 4"]);
    expect(within(raster).getAllByText("Produktion").length).toBe(4); // an jedem Produktionstag
    expect(within(card).queryByTestId("result-pitch")).not.toBeInTheDocument(); // ohne Anbieter (Test) kein Hinweis
    expect(plan).toHaveTextContent("3 pro Woche, 12 in vier Wochen");
    expect(plan).toHaveTextContent("Montag: 1,25 Stunden für 3 Beiträge am Stück");
    expect(plan).toHaveTextContent("Der Aufwand je Format ist eine Annahme von Alperna, keine Statistik.");
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "CSV" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();

    // CRM: lesbare Eingabe und Ausgabe, genau ein Ergebnis
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.tool).toBe("posting-plan");
    expect(result.firma).toBe("Malerei Keller");
    expect(result.eingabe.split("\n")[0]).toBe("Stunden pro Woche: 4");
    expect(result.eingabe).toContain("Kanäle: Instagram, Google-Profil");
    expect(result.eingabe).toContain("Fähigkeiten: Text, Foto");
    expect(result.ausgabe.startsWith("# Posting-Plan für vier Wochen\n")).toBe(true);
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Stand: phase «result» (Pfad-Fortschritt); nach dem Neuladen steht der Plan ohne neue Anfrage
    const saved = JSON.parse(readLocal("mt:posting-plan")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", input: { stunden: 4, kanaele: ["instagram", "google"], faehigkeiten: ["text", "foto"], produktionstag: "Montag" } });
    expect(saved.output.wochen).toHaveLength(4);
    cleanup();
    posts = [];
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Posting-Plan" })).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("meldet fehlende Stunden, ohne das Fenster zu öffnen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    expect(await screen.findByText(/Gib die Stunden pro Woche als Zahl an/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "0");
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    expect(await screen.findByText("Gib die Stunden pro Woche an, zwischen 0,5 und 20.")).toBeInTheDocument();
  });

  it("ohne Säulen im Profil: Zeilen «Säule n», eine Säule genügt, bis fünf lassen sich hinzufügen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...profile, contentSaeulen: undefined }));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.getByLabelText("Säule 1")).toBeEnabled();
    expect(screen.getByLabelText("Säule 2")).toBeEnabled();
    expect(screen.queryByLabelText("Säule 3")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Content-Säulen" })).toHaveAttribute("href", "/tools/content-saeulen");

    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "3.5");
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    expect(await screen.findByText("Nenne mindestens eine Säule.")).toBeInTheDocument();

    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Säule hinzufügen" }));
    expect(screen.getByLabelText("Säule 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Säule hinzufügen" })).toBeDisabled();

    await user.type(screen.getByLabelText("Säule 1"), "Tipps vom Maler");
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Posting-Plan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Ohne Foto oder Video hat Instagram kein Format: Der Plan nennt es, nur das Google-Profil bleibt.
    expect(within(card).getByTestId("pp-plan")).toHaveTextContent("Tipps vom Maler (4)");
    expect(within(card).getByTestId("pp-plan")).toHaveTextContent("Instagram: Für diesen Kanal fehlt eine Fähigkeit.");
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    expect(posts.find((p) => p.url === "/api/result")!.body.eingabe).toContain("Stunden pro Woche: 3,5");
  });

  it("zeigt den Hinweis «Für diesen Kanal fehlt eine Fähigkeit» und verlangt ein Format", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...profile, kanaele: [{ name: "Instagram" }] }));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Google-Unternehmensprofil" })).not.toBeChecked();
    expect(screen.getByTestId("pp-kanal-hinweis")).toHaveTextContent("Instagram: Für diesen Kanal fehlt eine Fähigkeit.");

    await user.click(screen.getByRole("checkbox", { name: "Foto" }));
    expect(screen.getByTestId("pp-kanal-hinweis")).toHaveTextContent("");
    await user.click(screen.getByRole("checkbox", { name: "Foto" }));

    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    expect(await screen.findByText(/Für die gewählten Kanäle fehlt eine Fähigkeit/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("verlangt mindestens einen Kanal", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await user.click(screen.getByRole("checkbox", { name: "Google-Unternehmensprofil" }));
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    expect(await screen.findByText("Wähle mindestens einen Kanal.")).toBeInTheDocument();
  });

  it("überschriebener Aufwand und Produktionstag landen im Plan", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.getByLabelText("Aufwand: Karussell")).toHaveValue(1.5);
    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("checkbox", { name: "Foto" }));
    await user.selectOptions(screen.getByLabelText("Produktionstag"), "Freitag");
    const story = screen.getByLabelText("Aufwand: Story");
    await user.clear(story);
    await user.type(story, "0.5");
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    const plan = (await screen.findByRole("region", { name: "Dein Posting-Plan" })).querySelector("[data-testid=pp-plan]") as HTMLElement;
    expect(plan).toHaveTextContent("Freitag: 1,5 Stunden für 3 Beiträge am Stück");
    expect(plan.textContent).toMatch(/Story0,5 Stunden \(angepasst\)/);
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const body = posts.find((p) => p.url === "/api/result")!.body;
    expect(body.eingabe).toContain("Produktionstag: Freitag");
    expect(body.eingabe).toContain("Aufwand angepasst: Story 0,5 Stunden");
  });

  it("lädt die CSV herunter, wenn die Adresse bekannt ist, ohne Fenster", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("checkbox", { name: "Foto" }));
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Posting-Plan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(card).getByTestId("pp-csv"));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("posting-plan-malerei-keller.csv");
    expect(downloads[0].mime).toContain("text/csv");
    expect(downloads[0].text.startsWith("﻿Woche;Tag;Kanal;Format;Säule;Aufwand in Stunden\r\n")).toBe(true);
    expect(downloads[0].text).toContain("1;Dienstag;Google-Profil;Google-Beitrag;");
  });

  it("«Angaben ändern» zeigt das Formular mit den Werten, «Zurück zum Plan» den Plan ohne neue Anfrage", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await user.type(screen.getByLabelText("Stunden pro Woche für Beiträge"), "4");
    await user.click(screen.getByRole("checkbox", { name: "Foto" }));
    await user.click(screen.getByRole("button", { name: "Plan erstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Posting-Plan" });
    await waitFor(() => expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1));

    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Stunden pro Woche für Beiträge")).toHaveValue(4);
    expect(screen.getByRole("checkbox", { name: "Foto" })).toBeChecked();
    expect(JSON.parse(readLocal("mt:posting-plan")!).phase).toBe("edit");

    await user.click(screen.getByRole("button", { name: "Zurück zum Plan" }));
    expect(await screen.findByRole("region", { name: "Dein Posting-Plan" })).toBeInTheDocument();
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Stunden pro Woche für Beiträge")).toHaveValue(null);
    expect(screen.queryByRole("button", { name: "Zurück zum Plan" })).not.toBeInTheDocument();
  });
});
