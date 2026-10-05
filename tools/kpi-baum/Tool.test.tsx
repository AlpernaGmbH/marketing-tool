// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { downloadBytes } from "@/lib/download";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));

const sent: { url: string; body: Record<string, string> }[] = [];

beforeEach(() => {
  clearAllLocal();
  vi.mocked(downloadBytes).mockClear();
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
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

const profile = (p: Record<string, string>) => writeLocal(PROFILE_KEY, JSON.stringify(p));
const el = (id: string) => document.getElementById(id) as HTMLElement;
type User = ReturnType<typeof userEvent.setup>;

async function fillZiel(user: User) {
  await user.selectOptions(el("kb-art"), "auftraege");
  await user.type(el("kb-zielwert"), "30");
  await user.type(el("kb-ausgang"), "18");
  fireEvent.change(el("kb-ende"), { target: { value: "2026-12-31" } });
}

async function fillMarketingziel(user: User, n: number, p: { text: string; kanal: string; kpi: string; zielwert: string; quelle: string; zeitraum?: string }) {
  await user.type(el(`kb-z${n}-text`), p.text);
  if (p.kanal) await user.selectOptions(el(`kb-z${n}-kanal`), p.kanal);
  await user.selectOptions(el(`kb-z${n}-k1-kpi`), p.kpi);
  if (p.zielwert) await user.type(el(`kb-z${n}-k1-zielwert`), p.zielwert);
  if (p.zeitraum) await user.selectOptions(el(`kb-z${n}-k1-zeitraum`), p.zeitraum);
  if (p.quelle) await user.selectOptions(el(`kb-z${n}-k1-quelle`), p.quelle);
}

async function fillAll(user: User) {
  await fillZiel(user);
  await fillMarketingziel(user, 1, { text: "Mehr Anfragen über Google", kanal: "gbp", kpi: "anfragen", zielwert: "17", quelle: "Postfach und Telefonnotiz" });
  await user.selectOptions(el("kb-q-offerten"), "6");
  await user.selectOptions(el("kb-q-auftraege"), "4");
}

const create = (user: User) => user.click(screen.getByRole("button", { name: "Baum erstellen" }));
const optionTexts = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

describe("Ziel- und KPI-Baum: Formular", () => {
  it("zeigt die Felder mit Beschriftung und die Arten für KMU", () => {
    profile({ firma: "Malerei Keller", branche: "Malerei" });
    render(<Tool />);
    expect(screen.getByLabelText("Was willst du erreichen?")).toBe(el("kb-art"));
    expect(optionTexts(el("kb-art"))).toEqual(["Bitte wählen", "Umsatz in CHF", "Neue Kundinnen und Kunden", "Aufträge"]);
    expect(screen.getByLabelText("Wo stehst du heute?")).toBe(el("kb-ausgang"));
    expect(screen.getByLabelText("Bis wann?")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByLabelText("Marketingziel 1")).toHaveAttribute("placeholder", "Mehr Anfragen über Google");
    expect(screen.getByLabelText("Marketingziel 1")).toHaveAttribute("maxlength", "140");
    expect(optionTexts(el("kb-z1-kanal"))).toEqual([
      "Bitte wählen",
      "Website",
      "Google-Unternehmensprofil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter",
      "Empfehlungen",
      "Anlässe",
      "Print",
    ]);
    expect(optionTexts(el("kb-z1-k1-zeitraum"))).toEqual(["pro Monat", "pro Quartal", "gesamt bis zum Enddatum"]);
    expect(optionTexts(el("kb-z1-k1-kpi"))).toEqual([
      "Bitte wählen",
      "Anfragen",
      "Profilaufrufe",
      "Bewertungen",
      "Newsletter-Abos",
      "Website-Besuche",
      "Termine",
      "Anrufe",
      "Offerten",
      "Neukunden",
    ]);
    expect(screen.getByRole("button", { name: "Baum erstellen" })).toBeEnabled();
  });

  it("hat zu jedem Feld eine Beschriftung", () => {
    const { container } = render(<Tool />);
    for (const c of container.querySelectorAll("input, select, textarea")) {
      const labelled = (c as HTMLInputElement).labels?.length || c.getAttribute("aria-label");
      expect(labelled, `${c.tagName} ${c.id}`).toBeTruthy();
    }
  });

  it("zeigt Vereinen Mitglieder und Anmeldungen statt Kundschaft", () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    render(<Tool />);
    expect(screen.getByRole("group", { name: "Dein Verein" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("Fussball");
    expect(optionTexts(el("kb-art"))).toEqual(["Bitte wählen", "Neue Mitglieder", "Anmeldungen zum Anlass"]);
    expect(optionTexts(el("kb-z1-k1-kpi"))).toEqual([
      "Bitte wählen",
      "Anfragen",
      "Profilaufrufe",
      "Bewertungen",
      "Newsletter-Abos",
      "Website-Besuche",
      "Termine",
      "Anrufe",
      "Neumitglieder",
      "Anmeldungen",
    ]);
    expect(screen.getByLabelText("Marketingziel 1")).toHaveAttribute("placeholder", "Mehr Mitglieder über Instagram");
  });

  it("zeigt die Rückwärtsrechnung nur bei Kundschaft und Aufträgen", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    expect(screen.queryByText("3. Rückwärtsrechnung (freiwillig)")).not.toBeInTheDocument();
    await user.selectOptions(el("kb-art"), "umsatz");
    expect(screen.queryByText("3. Rückwärtsrechnung (freiwillig)")).not.toBeInTheDocument();
    await user.selectOptions(el("kb-art"), "kunden");
    expect(screen.getByText("3. Rückwärtsrechnung (freiwillig)")).toBeInTheDocument();
    expect(screen.getByLabelText("Wie viele von 10 Anfragen werden zu Offerten?")).toBe(el("kb-q-offerten"));
    expect(screen.getByLabelText("Wie viele von 10 Offerten werden zu Aufträgen?")).toBe(el("kb-q-auftraege"));
    expect(optionTexts(el("kb-q-offerten"))).toEqual(["Bitte wählen", ...Array.from({ length: 11 }, (_, n) => `${n} von 10`)]);
    await user.selectOptions(el("kb-q-offerten"), "5");
    expect(screen.getByRole("status")).toHaveTextContent("Für die Rückwärtsrechnung brauchst du beide Angaben.");
    await user.selectOptions(el("kb-q-auftraege"), "4");
    expect(screen.queryByText("Für die Rückwärtsrechnung brauchst du beide Angaben.")).not.toBeInTheDocument();
  });

  it("erlaubt höchstens drei Marketingziele und zwei Kennzahlen je Ziel", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    const add = () => user.click(screen.getByRole("button", { name: "Marketingziel hinzufügen" }));
    await add();
    await add();
    expect(el("kb-z3-text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marketingziel hinzufügen" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entfernen: Marketingziel 3" }));
    expect(el("kb-z3-text")).toBeNull();
    expect(screen.getByRole("button", { name: "Marketingziel hinzufügen" })).toBeInTheDocument();

    expect(el("kb-z1-k2-kpi")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kennzahl hinzufügen (Marketingziel 1)" }));
    expect(el("kb-z1-k2-kpi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kennzahl hinzufügen (Marketingziel 1)" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entfernen: Kennzahl 2 von Marketingziel 1" }));
    expect(el("kb-z1-k2-kpi")).toBeNull();
  });

  it("bietet die Messquellen der Kennzahl an und fragt bei «Andere» nach einem Text", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    expect(el("kb-z1-k1-quelle")).toBeDisabled();
    expect(optionTexts(el("kb-z1-k1-quelle"))).toEqual(["Wähl zuerst die Kennzahl"]);
    await user.selectOptions(el("kb-z1-k1-kpi"), "anfragen");
    expect(optionTexts(el("kb-z1-k1-quelle"))).toEqual(["Bitte wählen", "Postfach und Telefonnotiz", "Kontaktformular", "CRM oder Excel", "Andere"]);
    await user.selectOptions(el("kb-z1-k1-kpi"), "besuche");
    expect(optionTexts(el("kb-z1-k1-quelle"))).toEqual(["Bitte wählen", "Statistik des Hosters", "Umami oder ein anderes Statistikwerkzeug", "Andere"]);
    expect(screen.queryByLabelText("Eigene Messquelle")).not.toBeInTheDocument();
    await user.selectOptions(el("kb-z1-k1-quelle"), "andere");
    expect(screen.getByLabelText("Eigene Messquelle")).toBeInTheDocument();
    await user.selectOptions(el("kb-z1-k1-kpi"), "termine"); // wechselt die Kennzahl: Messquelle zurückgesetzt
    expect(screen.queryByLabelText("Eigene Messquelle")).not.toBeInTheDocument();
    expect(el("kb-z1-k1-quelle")).toHaveValue("");
  });

  it("meldet fehlende Angaben in einer Meldung (role alert), zeigt kein Ergebnis und schickt nichts", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await create(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Wähl, was du erreichen willst.");
    expect(screen.queryByRole("region", { name: "Dein Ziel- und KPI-Baum" })).not.toBeInTheDocument();
    await user.selectOptions(el("kb-art"), "auftraege");
    await user.type(el("kb-zielwert"), "30");
    fireEvent.change(el("kb-ende"), { target: { value: "2026-12-31" } });
    await create(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Nenne mindestens ein Marketingziel.");
    expect(sent).toHaveLength(0);
  });

  it("speichert den Entwurf im Browser und stellt ihn nach dem Neuladen wieder her", async () => {
    const first = render(<Tool />);
    const user = userEvent.setup();
    await fillZiel(user);
    await user.type(el("kb-z1-text"), "Mehr Anfragen über Google");
    await waitFor(() => expect(JSON.parse(readLocal("mt:kpi-baum") ?? "{}")).toMatchObject({ v: 1, phase: "edit", ziel: { art: "auftraege", zielwert: "30", ausgangswert: "18", ende: "2026-12-31" } }));
    first.unmount();
    render(<Tool />);
    expect(el("kb-art")).toHaveValue("auftraege");
    expect(el("kb-zielwert")).toHaveValue(30);
    expect(el("kb-ende")).toHaveValue("2026-12-31");
    expect(el("kb-z1-text")).toHaveValue("Mehr Anfragen über Google");
  });
});

describe("Ziel- und KPI-Baum: Ergebnis", () => {
  it("zeigt den Baum als Grafik und verschachtelte Liste, speichert den Stand und schickt Eingabe und Ausgabe ins CRM", async () => {
    profile({ firma: "Malerei Keller", branche: "Malerei" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);

    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    expect(within(card).queryByTestId("kb-hinweis")).not.toBeInTheDocument();

    const liste = within(card).getByRole("list", { name: "Der Baum als Liste" });
    expect(liste).toHaveTextContent("Unternehmensziel: 30 Aufträge bis 31.12.2026 (Ausgangswert: 18 Aufträge)");
    const mz = within(liste).getByRole("list", { name: "Marketingziele" });
    expect(within(mz).getAllByRole("listitem")[0]).toHaveTextContent("Marketingziel 1: Mehr Anfragen über Google (Kanal: Google-Unternehmensprofil)");
    expect(within(liste).getByRole("list", { name: "Kennzahlen zu Marketingziel 1" })).toHaveTextContent("Anfragen: 17 pro Monat (Quelle: Postfach und Telefonnotiz)");

    const bild = within(within(card).getByTestId("kb-svg")).getByRole("img");
    expect(bild).toHaveAttribute("aria-label", "Baum: Unternehmensziel 30 Aufträge bis 31.12.2026; 1 Marketingziel; 1 Kennzahl.");
    expect(bild.querySelectorAll("[data-node]")).toHaveLength(3);

    const tabellen = within(card).getAllByRole("table");
    expect(tabellen).toHaveLength(3); // SMART-Check, Rückwärtsrechnung, Messplan
    expect(within(tabellen[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Marketingziel", "Spezifisch", "Messbar", "Terminiert", "Plausibel", "Hinweis"]);
    expect(within(tabellen[1]).getByRole("row", { name: /Anfragen \(6 von 10 werden zur Offerte\) 50 17/ })).toBeInTheDocument();
    expect(within(tabellen[2]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["KPI", "Zielwert", "Zeitraum", "Ist", "Messquelle", "Rhythmus"]);
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "CSV-Vorlage herunterladen" })).toBeEnabled();

    expect(JSON.parse(readLocal("mt:kpi-baum") ?? "{}")).toMatchObject({
      v: 1,
      phase: "result",
      output: { datum: "2026-10-05", typ: "kmu", firma: "Malerei Keller", branche: "Malerei" },
      ziel: { art: "auftraege", zielwert: "30", ausgangswert: "18", ende: "2026-12-31" },
      rueckwaerts: { anfragenZuOfferten: "6", offertenZuAuftraegen: "4" },
    });

    await waitFor(() => expect(sent.some((s) => s.url.includes("/api/result"))).toBe(true));
    const crm = sent.find((s) => s.url.includes("/api/result"))!.body;
    expect(crm.tool).toBe("kpi-baum");
    expect(crm.firma).toBe("Malerei Keller");
    expect(crm.eingabe.startsWith("Betrieb: Malerei Keller\nBranche: Malerei\nUnternehmensziel: 30 Aufträge bis 31.12.2026 (Ausgangswert: 18 Aufträge)\nMarketingziel 1: Mehr Anfragen über Google")).toBe(true);
    expect(crm.eingabe).toContain("Rückwärtsrechnung (Annahmen): 6 von 10 Anfragen werden zu Offerten, 4 von 10 Offerten werden zu Aufträgen");
    expect(crm.ausgabe.startsWith("# Ziel- und KPI-Baum\n\n_30 Aufträge bis 31.12.2026_")).toBe(true);
    expect(crm.ausgabe).toContain("| Anfragen (6 von 10 werden zur Offerte) | 50 | 17 |");
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1);
  });

  it("zeigt bei einer Lücke den Hinweis oben und das Ergebnis trotzdem", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillZiel(user);
    await fillMarketingziel(user, 1, { text: "Anfragen", kanal: "", kpi: "anfragen", zielwert: "", quelle: "" });
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    expect(within(card).getByTestId("kb-hinweis")).toHaveTextContent("Hinweis: Beim Marketingziel fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.");
    const tabelle = within(card).getAllByRole("table")[0];
    const zeile = within(tabelle).getAllByRole("row")[1];
    expect(zeile).toHaveTextContent("1. Anfragen");
    expect(zeile).toHaveTextContent("fehlt");
    expect(zeile).toHaveTextContent("Der Text hat nur 8 Zeichen (mindestens 10) und es fehlt ein Kanal.");
    expect(zeile).toHaveTextContent("Bei «Anfragen» fehlen Zielwert und Messquelle.");
    expect(card).toHaveTextContent("Rückwärtsrechnung");
    expect(card).toHaveTextContent("Du hast die beiden Quoten nicht angegeben.");
  });

  it("zeigt bei einem Enddatum in der Vergangenheit ein Ergebnis mit Lücke bei «terminiert»", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    fireEvent.change(el("kb-ende"), { target: { value: "2026-09-01" } });
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    expect(within(card).getByTestId("kb-hinweis")).toBeInTheDocument();
    expect(card).toHaveTextContent("Das Enddatum 01.09.2026 liegt nicht nach heute (05.10.2026)");
  });

  it("fragt ohne bekannte Adresse zuerst, zeigt bei «Später» nichts und behält das Formular", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("region", { name: "Dein Ziel- und KPI-Baum" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baum erstellen" })).toBeEnabled();
    expect(el("kb-zielwert")).toHaveValue(30);
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(0);
  });

  it("lädt die CSV-Vorlage mit BOM, Semikolon und Monaten ab heute", async () => {
    profile({ firma: "Malerei Keller" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    await user.click(within(card).getByRole("button", { name: "CSV-Vorlage herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    const [bytes, name, mime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(name).toBe("kpi-messplan-malerei-keller.csv");
    expect(mime).toBe("text/csv;charset=utf-8");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("KPI;Zielwert;Quelle;Okt;Nov;Dez;Jan;Feb;Mär;Apr;Mai;Jun;Jul;Aug;Sep\r\n");
    expect(text).toContain("Anfragen;17 pro Monat;Postfach und Telefonnotiz;");
  });

  it("fragt vor dem CSV-Download nach der Adresse, wenn keine bekannt ist", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    window.localStorage.removeItem(LEAD_KEY);
    window.dispatchEvent(new Event("mt:storage"));
    await user.click(within(card).getByRole("button", { name: "CSV-Vorlage herunterladen" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(downloadBytes).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten Eintrag im CRM", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    await waitFor(() => expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1));
    first.unmount();
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" })).toBeInTheDocument();
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück, behält die Angaben, und «Neu beginnen» setzt sie zurück", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Baum erstellen" })).toBeInTheDocument();
    expect(el("kb-zielwert")).toHaveValue(30);
    expect(el("kb-z1-text")).toHaveValue("Mehr Anfragen über Google");
    expect(el("kb-q-auftraege")).toHaveValue("4");
    expect(JSON.parse(readLocal("mt:kpi-baum") ?? "{}").phase).toBe("edit");

    await create(user);
    const again = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    await waitFor(() => expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(2)); // ein zweites Ergebnis geht erneut ins CRM
    await user.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Baum erstellen" })).toBeInTheDocument();
    expect(el("kb-zielwert")).toHaveValue(null);
    expect(el("kb-z1-text")).toHaveValue("");
  });

  it("rechnet für Vereine mit Mitgliedern und ohne Rückwärtsrechnung", async () => {
    profile({ organisationstyp: "verein", firma: "FC Trogen", branche: "Fussball" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.selectOptions(el("kb-art"), "mitglieder");
    await user.type(el("kb-zielwert"), "40");
    fireEvent.change(el("kb-ende"), { target: { value: "2026-12-31" } });
    await fillMarketingziel(user, 1, { text: "Mehr Mitglieder über Instagram", kanal: "instagram", kpi: "neumitglieder", zielwert: "50", zeitraum: "gesamt", quelle: "Mitgliederliste" });
    expect(screen.queryByText("3. Rückwärtsrechnung (freiwillig)")).not.toBeInTheDocument();
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    expect(card).toHaveTextContent("Bis 31.12.2026 willst du 40 neue Mitglieder gewinnen.");
    expect(card).toHaveTextContent("Neumitglieder: 50 gesamt (Quelle: Mitgliederliste)");
    expect(card).toHaveTextContent("Die Kennzahl «Neumitglieder» ergibt bis zum Enddatum 50, mehr als dein Unternehmensziel (40).");
    expect(card).toHaveTextContent("Verein");
    expect(card).not.toHaveTextContent("Rückwärtsrechnung");
    await waitFor(() => expect(sent.some((s) => s.url.includes("/api/result"))).toBe(true));
    expect(sent.find((s) => s.url.includes("/api/result"))!.body.eingabe.startsWith("Verein: FC Trogen\nTätigkeit: Fussball\nUnternehmensziel: 40 neue Mitglieder bis 31.12.2026")).toBe(true);
  });

  it("verwendet in Formular und Ergebnis keine Wörter der Sperrliste", async () => {
    profile({ firma: "Malerei Keller", branche: "Malerei" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const { container } = render(<Tool />);
    const hart = (text: string) => brandHits(text).filter((h) => h.level === "hart");
    expect(hart(container.textContent ?? "")).toEqual([]);
    const user = userEvent.setup();
    await fillAll(user);
    await create(user);
    const card = await screen.findByRole("region", { name: "Dein Ziel- und KPI-Baum" });
    expect(hart(card.textContent ?? "")).toEqual([]);
    expect(card.textContent).not.toMatch(/NaN|undefined|!/);
  });
});
