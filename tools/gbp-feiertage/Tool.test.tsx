// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import { downloadBytes } from "@/lib/download";
import Tool from "./Tool";

vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));

const sent: { url: string; body: Record<string, string> }[] = [];

function stubFetch() {
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      sent.push({ url: String(url), body: init?.body ? (JSON.parse(init.body) as Record<string, string>) : {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
}

function profile(p: Record<string, string>) {
  writeLocal(PROFILE_KEY, JSON.stringify(p));
}

beforeEach(() => {
  clearAllLocal();
  vi.mocked(downloadBytes).mockClear();
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function createList(user: ReturnType<typeof userEvent.setup>, year = "2027") {
  await user.selectOptions(screen.getByLabelText("Jahr"), year);
  await user.click(screen.getByRole("button", { name: "Liste erstellen" }));
}

describe("Feiertagsplaner: Formular", () => {
  it("zeigt Kanton, Jahr, sieben Tage mit Zeiten und die Feiertage des Kantons", () => {
    profile({ firma: "Malerei Keller", kanton: "SG" });
    render(<Tool />);
    expect(screen.getByLabelText("Kanton")).toHaveValue("SG");
    expect(screen.getByLabelText("Jahr")).toBeInTheDocument();
    const days = within(screen.getByRole("list", { name: "Öffnungszeiten" })).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    expect(screen.getByLabelText("Montag, Zeitfenster 1, von")).toHaveValue("08:00");
    expect(screen.getByLabelText("Montag, Zeitfenster 2, bis")).toHaveValue("17:30");
    expect(screen.getByLabelText("Samstag geöffnet")).not.toBeChecked();
    expect(screen.getByLabelText("Freitag geöffnet")).toBeChecked();
    const list = screen.getByRole("list", { name: "Feiertage" });
    expect(within(list).getByText("Karfreitag")).toBeInTheDocument();
    expect(within(list).getByText("Allerheiligen")).toBeInTheDocument();
    expect(within(list).queryByText("Tag der Arbeit")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Regel für Karfreitag")).toHaveValue("geschlossen");
  });

  it("sagt ohne Kanton, was zu tun ist, und fragt vor dem Ergebnis danach", async () => {
    render(<Tool />);
    expect(screen.getByText(/Wähl oben deinen Kanton/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Liste erstellen" }));
    expect(await screen.findByText("Wähl zuerst deinen Kanton.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Sonderöffnungszeiten" })).not.toBeInTheDocument();
  });

  it("sagt bei einem Kanton ohne geprüfte Liste, dass sie fehlt, und zeigt nur die eidgenössischen Tage", () => {
    profile({ kanton: "FR" });
    render(<Tool />);
    expect(screen.getByTestId("keine-liste")).toHaveTextContent("Für Freiburg haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.");
    const names = within(screen.getByRole("list", { name: "Feiertage" }))
      .getAllByRole("listitem")
      .map((li) => li.querySelector("span")?.textContent ?? "");
    expect(names).toHaveLength(4);
    expect(names.join(" ")).toMatch(/Neujahrstag.*Auffahrt.*Bundesfeiertag.*Weihnachtstag/);
  });

  it("zeigt Felder für Sonderzeiten erst bei der Regel «Sonderzeiten»", async () => {
    profile({ kanton: "SG" });
    render(<Tool />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Karfreitag, Sonderzeiten von")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Regel für Karfreitag"), "zeiten");
    expect(screen.getByLabelText("Karfreitag, Sonderzeiten von")).toBeInTheDocument();
    expect(screen.getByLabelText("Karfreitag, Sonderzeiten bis")).toBeInTheDocument();
  });

  it("weist im Formular darauf hin, dass ein Feiertag auf einen Sonntag fällt, und wechselt mit dem Jahr die Daten", async () => {
    profile({ kanton: "SG" });
    render(<Tool />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Jahr"), "2027");
    expect(screen.getByTestId("hinweis-bundesfeier")).toHaveTextContent("fällt auf einen Sonntag");
    expect(screen.getByTestId("feiertag-bundesfeier")).toHaveTextContent("So 01.08.2027");
    expect(screen.getByTestId("hinweis-weihnachten")).toHaveTextContent("fällt auf einen Samstag, an dem du ohnehin geschlossen hast");
    await user.selectOptions(screen.getByLabelText("Jahr"), "2026");
    expect(screen.getByTestId("feiertag-karfreitag")).toHaveTextContent("Fr 03.04.2026");
    expect(screen.queryByTestId("hinweis-karfreitag")).not.toBeInTheDocument();
  });

  it("meldet Sonderzeiten ohne Uhrzeit und zeigt kein Ergebnis", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Regel für Karfreitag"), "zeiten");
    await user.click(screen.getByRole("button", { name: "Liste erstellen" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join(" ")).toContain("Karfreitag: Trag bei Sonderzeiten «von» und «bis» ein");
    expect(screen.queryByRole("region", { name: "Deine Sonderöffnungszeiten" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("meldet ein Zeitfenster, bei dem «von» nicht vor «bis» liegt, mit dem Wochentag", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Dienstag, Zeitfenster 1, von"));
    await user.click(screen.getByRole("button", { name: "Liste erstellen" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join(" ")).toContain("Dienstag: Trag bei «von» und «bis» eine Uhrzeit ein");
    expect(screen.queryByRole("region", { name: "Deine Sonderöffnungszeiten" })).not.toBeInTheDocument();
  });
});

describe("Feiertagsplaner: Ergebnis", () => {
  it("zeigt die Liste zum Abtippen, speichert den Stand und schickt Eingabe und Ausgabe ins CRM", async () => {
    profile({ firma: "Malerei Keller", kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Regel für Karfreitag"), "zeiten");
    await user.type(screen.getByLabelText("Karfreitag, Sonderzeiten von"), "09:00");
    await user.type(screen.getByLabelText("Karfreitag, Sonderzeiten bis"), "12:00");
    await createList(user);

    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    const list = within(card).getByRole("list", { name: "Sonderöffnungszeiten" });
    const lines = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lines).toContain("Fr 26.03.2027, Karfreitag: 09:00 bis 12:00");
    expect(lines).toContain("Fr 01.01.2027, Neujahrstag: geschlossen");
    expect(lines).toContain("Mo 29.03.2027, Ostermontag: geschlossen");
    expect(lines).toContain("Mo 01.11.2027, Allerheiligen: geschlossen");
    expect(lines.some((l) => l?.includes("Bundesfeiertag"))).toBe(false); // 1. August 2027 ist ein Sonntag

    expect(within(card).getByRole("button", { name: "Liste kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Kalender (.ics) herunterladen" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "CSV herunterladen" })).toBeEnabled();
    expect(within(card).getByRole("link", { name: /Hilfe von Google/ })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/support\.google\.com\//));

    const state = JSON.parse(readLocal("mt:gbp-feiertage") ?? "{}") as { phase: string; kanton: string; jahr: number };
    expect(state).toMatchObject({ v: 1, phase: "result", kanton: "SG", jahr: 2027 });

    await waitFor(() => expect(sent.some((s) => s.url.includes("/api/result"))).toBe(true));
    const crm = sent.find((s) => s.url.includes("/api/result"))!.body;
    expect(crm.tool).toBe("gbp-feiertage");
    expect(crm.firma).toBe("Malerei Keller");
    expect(crm.eingabe.startsWith("Kanton: St. Gallen (SG)\nJahr: 2027")).toBe(true);
    expect(crm.ausgabe.startsWith("Sonderöffnungszeiten St. Gallen (SG) 2027\n")).toBe(true);
    expect(crm.ausgabe).toContain("Fr 26.03.2027, Karfreitag: 09:00 bis 12:00");
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1);
  });

  it("lädt Kalender und CSV mit Dateinamen nach Kanton und Jahr", async () => {
    profile({ firma: "Malerei Keller", kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await createList(user);
    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });

    await user.click(within(card).getByRole("button", { name: "Kalender (.ics) herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    const [icsBytes, icsName, icsMime] = vi.mocked(downloadBytes).mock.calls[0];
    expect(icsName).toBe("sonderoeffnungszeiten-sg-2027.ics");
    expect(icsMime).toContain("text/calendar");
    const ics = new TextDecoder().decode(icsBytes);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("TRIGGER:-P10D");
    expect(ics).toContain("SUMMARY:Karfreitag: geschlossen");
    expect(await within(card).findByText("Der Kalender wurde heruntergeladen.")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "CSV herunterladen" }));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(2));
    const [csvBytes, csvName] = vi.mocked(downloadBytes).mock.calls[1];
    expect(csvName).toBe("sonderoeffnungszeiten-sg-2027.csv");
    expect([...csvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(csvBytes)).toContain("Datum;Feiertag;Regel;von;bis");
  });

  it("fragt vor dem Download nach der Adresse, wenn keine bekannt ist, und lädt nichts bei «Später»", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await createList(user);
    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    // Die Adresse ist weg (Cookie abgelaufen, Merker gelöscht): erst das Fenster, bei «Später» kein Download.
    act(() => removeLocal(LEAD_KEY));
    await user.click(within(card).getByRole("button", { name: "CSV herunterladen" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    expect(downloadBytes).not.toHaveBeenCalled();
  });

  it("schreibt für einen Kanton ohne Liste nur die eidgenössischen Tage und den Hinweis", async () => {
    profile({ kanton: "VD" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await createList(user, "2026");
    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    expect(within(card).getByTestId("keine-liste")).toHaveTextContent("Für Waadt haben wir noch keine geprüfte Liste.");
    const lines = within(within(card).getByRole("list", { name: "Sonderöffnungszeiten" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    // Der 1. August 2026 fällt auf einen Samstag, an dem sonst geschlossen ist: nichts einzutragen.
    expect(lines).toEqual(["Do 01.01.2026, Neujahrstag: geschlossen", "Do 14.05.2026, Auffahrt: geschlossen", "Fr 25.12.2026, Weihnachtstag: geschlossen"]);
    expect(within(card).getByRole("list", { name: "Tage ohne Eintrag" })).toHaveTextContent("Sa 01.08.2026, Bundesfeiertag");
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten Eintrag im CRM", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await createList(user);
    await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    await waitFor(() => expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1));
    first.unmount();
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" })).toBeInTheDocument();
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück, behält die Angaben, und «Neu beginnen» setzt sie zurück", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Samstag geöffnet"));
    await createList(user);
    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("button", { name: "Liste erstellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Samstag geöffnet")).toBeChecked();
    expect(JSON.parse(readLocal("mt:gbp-feiertage") ?? "{}").phase).toBe("edit");

    await createList(user);
    const again = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    await user.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Liste erstellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Samstag geöffnet")).not.toBeChecked();
  });

  it("trägt einen Feiertag auf einen Sonntag nicht ein und nennt ihn unter «Nichts einzutragen»", async () => {
    profile({ kanton: "SG" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await createList(user); // 2027: der 1. August fällt auf einen Sonntag
    const card = await screen.findByRole("region", { name: "Deine Sonderöffnungszeiten" });
    const skipped = within(card).getByRole("list", { name: "Tage ohne Eintrag" });
    expect(skipped).toHaveTextContent("So 01.08.2027, Bundesfeiertag: fällt auf einen Sonntag");
  });
});
