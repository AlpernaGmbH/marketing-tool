// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { styleIssues } from "@/lib/content-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { addDays } from "@/tools/feiertagskalender/logic";
import { todayIso } from "./logic";
import Tool from "./Tool";

const downloads: { name: string; mime: string; text: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string, mime: string) => downloads.push({ name, mime, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) }),
}));

const heute = todayIso(new Date());
const START = addDays(heute, 7);
const ENDE = addDays(START, 55); // acht Wochen, das Ende zählt mit
const profile = { organisationstyp: "kmu", firma: "Malerei Keller", branche: "Malerei", ort: "Gossau", primaersegment: "Hausbesitzer in Gossau", kanaele: [{ name: "Instagram" }, { name: "Newsletter" }] };
const HAUPTBOTSCHAFT = "Wir streichen deine Fassade sauber und zum vereinbarten Termin.";
const botschaftenStand = {
  v: 1,
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", zielgruppe: "Hausbesitzer", angebot: "Fassaden streichen und Wände malen", wirkung: "Vertrauen in saubere Arbeit", beweise: "", anrede: "du", positionierung: "", primaersegment: "", personas: [] },
  output: {
    hauptbotschaft: HAUPTBOTSCHAFT,
    botschaften: [1, 2, 3].map((n) => ({ fuer: `Gruppe ${n}`, satz: `Ein Satz für die Gruppe ${n} mit genug Zeichen`, beleg: `Beleg für die Gruppe ${n}` })),
    kanaele: { website: "w".repeat(50), googleProfil: "g".repeat(50), instagram: "i".repeat(40), offerteOderMail: "o".repeat(70) },
    telefonsatz: "t".repeat(40),
    nichtSagen: ["Dass wir alles können", "Dass wir die Günstigsten sind", "Ein Preis ohne Besichtigung"],
  },
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

async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Kampagne planen" })).toBeEnabled());
}

async function fill(user: ReturnType<typeof userEvent.setup>, opts: { start?: string; ende?: string; budget?: string; angebot?: string } = {}) {
  if (opts.angebot !== "") await user.type(screen.getByLabelText("Angebot oder Anreiz (freiwillig)"), opts.angebot ?? "Herbstaktion Fassadenanstrich");
  await user.type(screen.getByLabelText("Start"), opts.start ?? START);
  await user.type(screen.getByLabelText("Ende"), opts.ende ?? ENDE);
  if (opts.budget) await user.type(screen.getByLabelText("Budget in CHF (freiwillig)"), opts.budget);
}

describe("kampagnen-planer: Werkzeug im Browser", () => {
  it("füllt vor, fragt die Adresse, zeigt den Plan und schickt Eingabe und Ausgabe ans CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();

    // Vorbefüllung: Firma, Branche, Zielgruppe (Primärsegment), Kernbotschaft (Kernbotschaften), Kanäle aus dem Profil
    await waitFor(() => expect(screen.getByLabelText("Für wen?")).toHaveValue("Hausbesitzer in Gossau"));
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByLabelText("Kernbotschaft in einem Satz")).toHaveValue(HAUPTBOTSCHAFT);
    expect(screen.getByLabelText("Was soll die Kampagne bringen?")).toHaveValue("anfragen");
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Newsletter" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Website" })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Dein Kampagnenplan" })).not.toBeInTheDocument();

    await fill(user, { budget: "1200" });
    expect(screen.getByTestId("kp-wochen")).toHaveTextContent("Das sind 8 Wochen.");
    await user.selectOptions(screen.getByLabelText("Was soll die Kampagne bringen?"), "angebot");
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    expect(within(card).getByRole("heading", { level: 4, name: "Herbstaktion Fassadenanstrich" })).toBeInTheDocument();
    const phasen = within(card).getByRole("list", { name: "Phasen" });
    const zeilen = within(phasen).getAllByTestId("kp-phase");
    expect(zeilen.map((z) => z.getAttribute("data-phase"))).toEqual(["vorbereitung", "anlauf", "haupt", "nachfassen"]);
    expect(zeilen[2]).toHaveTextContent("Hauptphase");
    expect(zeilen[2]).toHaveTextContent("Woche 4 bis 7");
    expect(zeilen[2]).toHaveTextContent("CHF 720.-");
    const wochen = within(card).getAllByTestId("kp-woche");
    expect(wochen).toHaveLength(8);
    expect(within(card).getByRole("list", { name: "Wochenplan" })).toBeInTheDocument();
    expect(within(wochen[1]).getByTestId("kp-woche-budget")).toHaveTextContent("CHF 150.-");
    expect(within(wochen[0]).getByTestId("kp-woche-budget")).toHaveTextContent("–");
    // Massnahmen nur für die gewählten Kanäle (Instagram, Newsletter) und intern
    const kanaele = new Set(within(card).getAllByTestId("kp-massnahme").map((m) => m.getAttribute("data-kanal")));
    expect(kanaele).toEqual(new Set(["intern", "instagram", "newsletter"]));
    expect(within(card).getByRole("list", { name: "Massnahmen Woche 1" })).toBeInTheDocument();
    expect(within(card).getAllByRole("link", { name: "Werkzeug öffnen: Beiträge vorplanen" })[0]).toHaveAttribute("href", "/tools/caption-baukasten");
    // Kennzahlen mit Link auf den Ziel- und KPI-Baum
    const kennzahlen = within(card).getByRole("list", { name: "Kennzahlen" });
    expect(within(kennzahlen).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Anfragen", "Termine"]);
    expect(within(card).getByRole("link", { name: "Ziel- und KPI-Baum" })).toHaveAttribute("href", "/tools/kpi-baum");
    expect(within(card).getByTestId("kp-kpi-hinweis")).toHaveTextContent("Zielwerte setzt du im Ziel- und KPI-Baum.");
    expect(within(card).getByRole("list", { name: "Hinweise" }).querySelectorAll("li")).toHaveLength(3);
    expect(within(card).getByTestId("kp-verteilung")).toHaveTextContent("Anlauf 25 %, Hauptphase 60 %, Nachfassen 15 %");
    expect(within(card).getByTestId("kp-richtwert")).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    // keine verbotenen Wörter im ganzen Ergebnis (ohne die Eingaben der Person ist es derselbe Text)
    expect(styleIssues(card.textContent ?? "").filter((i) => i.level === "error")).toEqual([]);

    // CRM: erst /api/lead, dann einmal /api/result mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.tool).toBe("kampagnen-planer");
    expect(result.firma).toBe("Malerei Keller");
    expect(result.eingabe.split("\n")[0]).toBe("Ziel: Ein Angebot bewerben");
    expect(result.eingabe).toContain("Zielgruppe: Hausbesitzer in Gossau");
    expect(result.eingabe).toContain(`Kernbotschaft: ${HAUPTBOTSCHAFT}`);
    expect(result.eingabe).toContain("Angebot: Herbstaktion Fassadenanstrich");
    expect(result.eingabe).toContain("Kanäle: Instagram, Newsletter");
    expect(result.eingabe).toContain("(8 Wochen)");
    expect(result.eingabe).toContain("Budget: CHF 1'200.-");
    expect(result.ausgabe.startsWith("# Kampagnenbrief\n")).toBe(true);
    expect(result.ausgabe.slice(0, 1900)).toContain("## Wochenplan");
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Stand: phase «result» (Pfad-Fortschritt); nach dem Neuladen steht alles ohne neue Anfrage da
    const saved = JSON.parse(readLocal("mt:kampagnen-planer")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", input: { ziel: "angebot", zielgruppe: "Hausbesitzer in Gossau", botschaft: HAUPTBOTSCHAFT, angebot: "Herbstaktion Fassadenanstrich", kanaele: ["instagram", "newsletter"], start: START, ende: ENDE, budget: 1200, organisation: "kmu" } });
    cleanup();
    posts = [];
    render(<Tool />);
    const again = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    expect(within(again).getAllByTestId("kp-woche")).toHaveLength(8);
    expect(posts).toHaveLength(0);
  });

  it("lässt die Kernbotschaft leer, wenn «Kernbotschaften» nichts gespeichert hat, und trifft keine Annahme", async () => {
    render(<Tool />);
    await ready();
    expect(screen.getByLabelText("Kernbotschaft in einem Satz")).toHaveValue("");
    expect(screen.getByLabelText("Für wen?")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Kernbotschaften" })).toHaveAttribute("href", "/tools/botschaften");
    // ohne Profil: Website, Instagram sowie Aushang und Flyer
    expect(screen.getByRole("checkbox", { name: "Website" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Aushang und Flyer" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "WhatsApp" })).not.toBeChecked();
  });

  it("ignoriert einen Stand von «Kernbotschaften», dessen Form nicht passt", async () => {
    writeLocal("mt:botschaften", JSON.stringify({ v: 1, hauptbotschaft: "Das steht am falschen Ort und zählt nicht." }));
    render(<Tool />);
    await ready();
    expect(screen.getByLabelText("Kernbotschaft in einem Satz")).toHaveValue("");
  });

  it("meldet einen Start in der Vergangenheit, ohne das Fenster zu öffnen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { start: addDays(heute, -1), ende: addDays(heute, 60) });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const meldung = await screen.findByText(/Der Start liegt in der Vergangenheit/);
    expect(meldung.closest("[role=alert]")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dein Kampagnenplan" })).not.toBeInTheDocument();
  });

  it("meldet einen zu kurzen und einen zu langen Zeitraum", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { ende: addDays(START, 6) });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    expect(await screen.findByText(/weniger als 2 Wochen/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ende")).toHaveFocus();

    const ende = screen.getByLabelText("Ende");
    await user.clear(ende);
    await user.type(ende, addDays(START, 112));
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    expect(await screen.findByText(/mehr als 16 Wochen/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("meldet fehlende Angaben, eine kurze Kernbotschaft, kein Datum, keinen Kanal und ein krummes Budget", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...profile, primaersegment: undefined }));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked());
    await user.type(screen.getByLabelText("Kernbotschaft in einem Satz"), "kurz");
    await user.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await user.click(screen.getByRole("checkbox", { name: "Newsletter" }));
    await user.type(screen.getByLabelText("Budget in CHF (freiwillig)"), "12.5");
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    expect(await screen.findByText("Schreib auf, für wen die Kampagne ist.")).toBeInTheDocument();
    expect(screen.getByText(/mit mindestens 10 Zeichen/)).toBeInTheDocument();
    expect(screen.getByText("Wähle mindestens einen Kanal.")).toBeInTheDocument();
    expect(screen.getByText("Wähle das Startdatum.")).toBeInTheDocument();
    expect(screen.getByText("Wähle das Enddatum.")).toBeInTheDocument();
    expect(screen.getByText(/Gib das Budget in ganzen Franken an/)).toBeInTheDocument();
    expect(screen.getByLabelText("Für wen?")).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zeigt ohne Budget keine Beträge", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { angebot: "" });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("kp-woche-budget")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("kp-verteilung")).not.toBeInTheDocument();
    expect(card.textContent).not.toContain("CHF");
    expect(within(card).getByTestId("kp-ueberblick")).toHaveTextContent("kein Budget angegeben");
    expect(within(card).getByRole("heading", { level: 4, name: "Anfragen gewinnen" })).toBeInTheDocument();
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    expect(posts.find((p) => p.url === "/api/result")!.body.eingabe).toContain("Budget: kein Budget angegeben");
  });

  it("lädt die Kalenderdatei herunter, wenn die Adresse bekannt ist, und bietet Kopieren, PDF und Word an", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { budget: "1200" });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Kalender (.ics) herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("kampagne-herbstaktion-fassadenanstrich.ics");
    expect(downloads[0].mime).toContain("text/calendar");
    expect(downloads[0].text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(downloads[0].text).toContain(`DTSTART;VALUE=DATE:${START.replace(/-/g, "")}`);
    expect(downloads[0].text.match(/BEGIN:VEVENT/g)).toHaveLength(6);

    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
  });

  it("fragt vor dem Download der Kalenderdatei nach der Adresse, wenn keine bekannt ist, und lädt danach herunter", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    const gespeichert = { v: 1, phase: "result", input: { ziel: "anfragen", zielgruppe: "Hausbesitzer", botschaft: HAUPTBOTSCHAFT, angebot: "", kanaele: ["website"], start: START, ende: ENDE, budget: 0, organisation: "kmu" }, output: { erstellt: heute } };
    writeLocal("mt:kampagnen-planer", JSON.stringify(gespeichert));
    render(<Tool />);
    const user = userEvent.setup();
    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    await user.click(within(card).getByRole("button", { name: "Kalender (.ics) herunterladen" }));
    const dialog = await screen.findByRole("dialog");
    expect(downloads).toHaveLength(0);
    await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("kampagne-anfragen-gewinnen.ics");
    expect(posts.some((p) => p.url === "/api/result")).toBe(false); // der Download schickt kein zweites Ergebnis
  });

  it("zeigt Angaben ändern mit den gespeicherten Werten und schickt das neue Ergebnis erneut", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal("mt:botschaften", JSON.stringify(botschaftenStand));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { budget: "1200" });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });

    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Angebot oder Anreiz (freiwillig)")).toHaveValue("Herbstaktion Fassadenanstrich");
    expect(screen.getByLabelText("Start")).toHaveValue(START);
    expect(screen.getByLabelText("Ende")).toHaveValue(ENDE);
    expect(screen.getByLabelText("Budget in CHF (freiwillig)")).toHaveValue(1200);
    await user.click(screen.getByRole("checkbox", { name: "WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const neu = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    expect(within(neu).getAllByTestId("kp-massnahme").some((m) => m.getAttribute("data-kanal") === "whatsapp")).toBe(true);
    await waitFor(() => expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(2));

    // «Neu beginnen» leert Formular und Stand
    await user.click(within(neu).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Angebot oder Anreiz (freiwillig)")).toHaveValue("");
    expect(JSON.parse(readLocal("mt:kampagnen-planer")!)).toMatchObject({ phase: "edit", input: null });
  });

  it("zeigt für Vereine Name und Tätigkeit des Vereins und Kennzahlen für Anmeldungen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" }));
    writeLocal(LEAD_KEY, "vorstand@fctrogen.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await waitFor(() => expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen"));
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("Fussball");
    await user.type(screen.getByLabelText("Für wen?"), "Kinder von sechs bis zehn Jahren aus Trogen");
    await user.type(screen.getByLabelText("Kernbotschaft in einem Satz"), "Fussball spielen, Freunde finden, im Dorf dabei sein.");
    await user.selectOptions(screen.getByLabelText("Was soll die Kampagne bringen?"), "anmeldungen");
    await fill(user, { angebot: "Schnuppertraining im Herbst" });
    await user.click(screen.getByRole("button", { name: "Kampagne planen" }));
    const card = await screen.findByRole("region", { name: "Dein Kampagnenplan" });
    const kennzahlen = within(card).getByRole("list", { name: "Kennzahlen" });
    expect(within(kennzahlen).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Anmeldungen"]);
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    expect(posts.find((p) => p.url === "/api/result")!.body.firma).toBe("FC Trogen");
  });

  it("ignoriert einen kaputten Stand im Speicher", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:kampagnen-planer", "{kaputt");
    render(<Tool />);
    await ready();
    expect(screen.getByLabelText("Angebot oder Anreiz (freiwillig)")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein Kampagnenplan" })).not.toBeInTheDocument();
  });

  it("verwendet in allen festen Texten der Seite keine verbotenen Wörter", async () => {
    render(<Tool />);
    await ready();
    const text = document.body.textContent ?? "";
    expect(styleIssues(text).filter((i) => i.level === "error")).toEqual([]);
  });
});
