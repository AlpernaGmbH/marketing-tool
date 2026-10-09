// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Jede Karte hat sechs Felder und jede Eingabe schreibt den Stand; unter Last (ganze Suite) dauern die Abläufe länger.
vi.setConfig({ testTimeout: 30_000 });

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

const crmCalls = () => sent.filter((s) => s.url.includes("/api/result"));

function profile(p: Record<string, string>) {
  writeLocal(PROFILE_KEY, JSON.stringify(p));
}

beforeEach(() => {
  clearAllLocal();
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

async function bewerte(user: User, name: string, interesse: number, einfluss: number, beziehung?: string) {
  await user.selectOptions(screen.getByLabelText(`Interesse: ${name}`), String(interesse));
  await user.selectOptions(screen.getByLabelText(`Einfluss: ${name}`), String(einfluss));
  if (beziehung) await user.selectOptions(screen.getByLabelText(`Beziehung: ${name}`), beziehung);
}

/** Vier Gruppen des FC Trogen bewerten: drei Quadranten besetzt. */
async function fcBewerten(user: User) {
  await bewerte(user, "Mitglieder", 5, 4, "eng");
  await bewerte(user, "Sponsoren", 4, 5, "lose");
  await bewerte(user, "Gemeinde", 2, 5, "keine");
  await bewerte(user, "Medien", 3, 2);
}

async function erstellen(user: User) {
  await user.click(screen.getByRole("button", { name: "Analyse erstellen" }));
}

const FC = { firma: "FC Trogen", organisationstyp: "verein" };

describe("Anspruchsgruppen: Formular", () => {
  it("zeigt die Vorlage für Vereine mit acht Karten, Labels und Knöpfen", async () => {
    profile(FC);
    render(<Tool />);
    const list = await screen.findByRole("list", { name: "Anspruchsgruppen" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(8);
    expect(screen.getByLabelText("Gruppe 1")).toHaveValue("Mitglieder");
    expect(screen.getByLabelText("Gruppe 3")).toHaveValue("Vorstand");
    expect(screen.getByLabelText("Gruppe 8")).toHaveValue("Helferinnen und Helfer");
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    const first = within(cards[0]);
    expect(first.getByText("Gruppe")).toBeInTheDocument();
    expect(first.getByText("Interesse")).toBeInTheDocument();
    expect(first.getByText("Einfluss")).toBeInTheDocument();
    expect(first.getByText("Beziehung")).toBeInTheDocument();
    expect(first.getByText("Was sie erwartet")).toBeInTheDocument();
    expect(first.getByText("Was wir von ihr brauchen")).toBeInTheDocument();
    expect(first.getByRole("button", { name: "Entfernen: Mitglieder" })).toBeInTheDocument();
    const optionen = within(screen.getByLabelText("Interesse: Mitglieder")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(optionen).toEqual(["", "1", "2", "3", "4", "5"]);
    const beziehungen = within(screen.getByLabelText("Beziehung: Mitglieder")).getAllByRole("option").map((o) => o.textContent);
    expect(beziehungen).toEqual(["Bitte wählen", "eng", "gut", "lose", "keine"]);
    expect(screen.getByRole("button", { name: "Gruppe hinzufügen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Analyse erstellen" })).toBeEnabled();
    expect(screen.getByTestId("ag-status")).toHaveTextContent("8 von 12 Gruppen.");
  });

  it("zeigt ohne Profil die Vorlage für Betriebe und wechselt mit dem Typ, solange nichts eingetragen ist", async () => {
    render(<Tool />);
    expect(await screen.findByLabelText("Gruppe 1")).toHaveValue("Kunden");
    expect(screen.getByLabelText("Gruppe 4")).toHaveValue("Gemeinde und Behörden");
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Verein"));
    await waitFor(() => expect(screen.getByLabelText("Gruppe 1")).toHaveValue("Mitglieder"));
    expect(screen.queryByTestId("ag-typhinweis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toBeInTheDocument();
  });

  it("lässt die Gruppen bei eingetragenen Werten stehen, nennt die Vorlage im Hinweis und lädt sie auf Knopfdruck", async () => {
    profile({ firma: "Malerei Keller", organisationstyp: "kmu" });
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await bewerte(user, "Kunden", 5, 5);
    await user.click(screen.getByLabelText("Verein"));
    const hinweis = await screen.findByTestId("ag-typhinweis");
    expect(hinweis).toHaveTextContent("Du hast schon Angaben eingetragen, darum bleiben deine Gruppen stehen.");
    expect(hinweis).toHaveTextContent("Vorlage für Vereine");
    expect(screen.getByLabelText("Gruppe 1")).toHaveValue("Kunden");
    expect(screen.getByLabelText("Interesse: Kunden")).toHaveValue("5");

    await user.click(within(hinweis).getByRole("button", { name: "Vorlage laden" }));
    await waitFor(() => expect(screen.getByLabelText("Gruppe 1")).toHaveValue("Mitglieder"));
    expect(screen.queryByTestId("ag-typhinweis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Interesse: Mitglieder")).toHaveValue("");
  });

  it("meldet fehlenden Namen, zu wenige Gruppen und einen halben Wert in role=alert, ohne Ergebnis und ohne CRM", async () => {
    profile({ organisationstyp: "verein" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");

    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gib den Namen deines Vereins an.");
    expect(screen.getByLabelText("Name des Vereins")).toHaveFocus();

    await user.type(screen.getByLabelText("Name des Vereins"), "FC Trogen");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Bewerte mindestens zwei Gruppen mit Interesse und Einfluss.");

    await user.selectOptions(screen.getByLabelText("Interesse: Mitglieder"), "5");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Mitglieder: Wähle den Einfluss von 1 bis 5.");
    expect(screen.getByLabelText("Einfluss: Mitglieder")).toHaveFocus();
    expect(screen.getByLabelText("Einfluss: Mitglieder")).toHaveAttribute("aria-invalid", "true");

    expect(screen.queryByRole("region", { name: "Deine Anspruchsgruppen" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("verlangt einen Namen bei einer Karte mit Werten und fügt Gruppen hinzu und entfernt sie", async () => {
    profile(FC);
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");

    await user.click(screen.getByRole("button", { name: "Gruppe hinzufügen" }));
    const neu = await screen.findByLabelText("Gruppe 9");
    expect(neu).toHaveValue("");
    expect(neu).toHaveFocus();
    expect(screen.getByTestId("ag-status")).toHaveTextContent("9 von 12 Gruppen.");
    await user.selectOptions(screen.getByLabelText("Interesse: Gruppe 9"), "3");
    await user.selectOptions(screen.getByLabelText("Einfluss: Gruppe 9"), "3");
    await bewerte(user, "Mitglieder", 5, 5);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gruppe 9: Gib einen Namen an.");
    expect(neu).toHaveFocus();

    await user.type(neu, "Dorfladen");
    await user.click(screen.getByRole("button", { name: "Entfernen: Dorfladen" }));
    await waitFor(() => expect(screen.queryByLabelText("Gruppe 9")).not.toBeInTheDocument());
    expect(screen.getByTestId("ag-status")).toHaveTextContent("Gruppe «Dorfladen» entfernt. 8 von 12 Gruppen.");
    expect(screen.getByRole("button", { name: "Gruppe hinzufügen" })).toHaveFocus();
  });

  it("sperrt «Gruppe hinzufügen» bei zwölf Gruppen und bietet bei leerer Liste die Vorlage an", async () => {
    profile(FC);
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    const add = screen.getByRole("button", { name: "Gruppe hinzufügen" });
    for (let i = 0; i < 4; i++) await user.click(add);
    expect(await screen.findByLabelText("Gruppe 12")).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByTestId("ag-status")).toHaveTextContent("12 von 12 Gruppen.");

    for (let i = 0; i < 12; i++) await user.click(screen.getAllByRole("button", { name: /^Entfernen:/ })[0]);
    expect(await screen.findByTestId("ag-leer")).toHaveTextContent("Du hast alle Gruppen entfernt.");
    await user.click(within(screen.getByTestId("ag-leer")).getByRole("button", { name: "Vorlage laden" }));
    expect(await screen.findByLabelText("Gruppe 1")).toHaveValue("Mitglieder");
  });

  it("speichert jede Änderung sofort unter mt:anspruchsgruppen", async () => {
    profile(FC);
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await user.selectOptions(screen.getByLabelText("Beziehung: Vorstand"), "gut");
    await user.type(screen.getByLabelText("Was sie erwartet: Vorstand"), "Klare Ziele");
    const state = JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}") as { v: number; phase: string; typ: string; gruppen: { name: string; beziehung: string; erwartung: string }[] };
    expect(state).toMatchObject({ v: 1, phase: "edit", typ: "verein" });
    expect(state.gruppen).toHaveLength(8);
    expect(state.gruppen[2]).toMatchObject({ name: "Vorstand", beziehung: "gut", erwartung: "Klare Ziele" });
  });
});

describe("Anspruchsgruppen: Ergebnis", () => {
  it("zeigt Matrix, Liste, vier Karten und den Plan, speichert den Stand und schickt Eingabe und Ausgabe ins CRM", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await user.type(screen.getByLabelText("Was sie erwartet: Mitglieder"), "Training und klare Termine");
    await erstellen(user);

    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    expect(within(card).getByTestId("ag-zusammenfassung")).toHaveTextContent("4 Gruppen bewertet. Eng einbinden: 2, zufriedenstellen: 1, beobachten: 1.");
    expect(within(card).getByTestId("ag-richtwert")).toHaveTextContent("Richtwert von Alperna, keine Statistik");

    const matrix = within(card).getByRole("img", { name: "Matrix Einfluss und Interesse" });
    expect(matrix.querySelectorAll("circle")).toHaveLength(4);
    const lage = within(card).getByRole("list", { name: "Lage der Gruppen" });
    expect(within(lage).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1 Sponsoren: Interesse 4, Einfluss 5",
      "2 Mitglieder: Interesse 5, Einfluss 4",
      "3 Gemeinde: Interesse 2, Einfluss 5",
      "4 Medien: Interesse 3, Einfluss 2",
    ]);

    const quadranten = within(card).getByRole("list", { name: "Strategie je Quadrant" });
    expect(within(quadranten).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Eng einbinden", "Zufriedenstellen", "Informieren", "Beobachten"]);
    const eng = within(card).getByTestId("quadrant-eng-einbinden");
    expect(eng).toHaveTextContent("Sponsoren");
    expect(eng).toHaveTextContent("Mitglieder");
    expect(eng).toHaveTextContent("Beziehung aufbauen");
    expect(within(card).getByTestId("quadrant-informieren")).toHaveTextContent("Keine Gruppe in diesem Quadranten.");

    const plan = within(card).getByTestId("ag-plan");
    expect(within(plan).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Gruppe", "Quadrant", "Strategie", "Kanal", "Rhythmus", "Verantwortlich"]);
    expect(within(plan).getByLabelText("Sponsoren: Kanal")).toHaveValue("persönliches Gespräch");
    expect(within(plan).getByLabelText("Sponsoren: Rhythmus")).toHaveValue("monatlich");
    expect(within(plan).getByLabelText("Sponsoren: Verantwortlich")).toHaveValue("");
    expect(within(plan).getByLabelText("Gemeinde: Kanal")).toHaveValue("kurzer Bericht oder Anruf");
    expect(within(plan).getByLabelText("Medien: Rhythmus")).toHaveValue("jährlich, bei Anlass");

    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Neu beginnen" })).toBeInTheDocument();

    const state = JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}") as { v: number; phase: string; typ: string; plan: unknown[] };
    expect(state).toMatchObject({ v: 1, phase: "result", typ: "verein" });
    expect(state.plan).toHaveLength(4);

    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    const crm = crmCalls()[0].body;
    expect(crm.tool).toBe("anspruchsgruppen");
    expect(crm.firma).toBe("FC Trogen");
    expect(crm.eingabe.startsWith("Verein: FC Trogen\nGruppen (4 bewertet, Interesse und Einfluss von 1 bis 5):\nMitglieder: Interesse 5, Einfluss 4, Beziehung eng\n")).toBe(true);
    expect(crm.eingabe).toContain("Nicht bewertet: Nachwuchs und Eltern, Vorstand, Verbände, Helferinnen und Helfer");
    expect(crm.eingabe).toContain("Mitglieder: erwartet Training und klare Termine");
    expect(crm.ausgabe.startsWith("# Anspruchsgruppen-Analyse: FC Trogen\n")).toBe(true);
    expect(crm.ausgabe).toContain("## Eng einbinden\n- Sponsoren (Interesse 4, Einfluss 5), Beziehung aufbauen\n- Mitglieder (Interesse 5, Einfluss 4)");
    expect(crm.ausgabe).toContain("## Kommunikationsplan\n- Sponsoren: persönliches Gespräch, monatlich");
  });

  it("fokussiert die Überschrift des Ergebnisses", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const heading = await screen.findByRole("heading", { name: "Deine Anspruchsgruppen", level: 3 });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("fragt ohne Adresse zuerst nach ihr und zeigt bei «Später» weder Ergebnis noch CRM-Eintrag", async () => {
    profile(FC);
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Deine Anspruchsgruppen" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyse erstellen" })).toBeEnabled();
    expect(screen.getByLabelText("Interesse: Mitglieder")).toHaveValue("5");
    expect(sent.filter((s) => s.url.includes("/api/result"))).toHaveLength(0);
  });

  it("übernimmt Änderungen im Plan in den Stand und in die Dokumentansicht, ohne zweiten CRM-Eintrag", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    await waitFor(() => expect(crmCalls()).toHaveLength(1));

    const verantwortlich = within(card).getByLabelText("Mitglieder: Verantwortlich");
    await user.type(verantwortlich, "Anna Keller");
    expect(verantwortlich).toHaveValue("Anna Keller");
    const kanal = within(card).getByLabelText("Mitglieder: Kanal");
    await user.clear(kanal);
    await user.type(kanal, "Trainingsabend");

    const state = JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}") as { plan: { id: string; kanal: string; verantwortlich: string }[] };
    const eintrag = state.plan.find((p) => p.id === "g1");
    expect(eintrag).toMatchObject({ kanal: "Trainingsabend", verantwortlich: "Anna Keller" });
    expect(within(card).getByTestId("ag-dokument")).toHaveTextContent("Anna Keller");
    expect(within(card).getByTestId("ag-dokument")).toHaveTextContent("Trainingsabend");
    expect(crmCalls()).toHaveLength(1);
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis mit dem geänderten Plan, ohne zweiten Eintrag im CRM", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const first = render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    await user.type(within(card).getByLabelText("Gemeinde: Verantwortlich"), "Beat Hug");
    first.unmount();

    render(<Tool />);
    const again = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    expect(within(again).getByLabelText("Gemeinde: Verantwortlich")).toHaveValue("Beat Hug");
    expect(crmCalls()).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück, behält die Werte, und bei neuem Quadranten gilt der neue Vorschlag", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    await user.type(within(card).getByLabelText("Medien: Verantwortlich"), "Lea");
    await user.click(within(card).getByRole("button", { name: "Angaben ändern" }));

    expect(await screen.findByRole("button", { name: "Analyse erstellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Interesse: Mitglieder")).toHaveValue("5");
    expect(screen.getByLabelText("Beziehung: Sponsoren")).toHaveValue("lose");
    expect(JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}").phase).toBe("edit");

    // Medien rücken von «beobachten» nach «informieren»; die Verantwortliche bleibt, Kanal und Rhythmus folgen dem Quadranten.
    await user.selectOptions(screen.getByLabelText("Interesse: Medien"), "4");
    await erstellen(user);
    const again = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    expect(within(again).getByLabelText("Medien: Kanal")).toHaveValue("Newsletter oder Beitrag");
    expect(within(again).getByLabelText("Medien: Rhythmus")).toHaveValue("monatlich");
    expect(within(again).getByLabelText("Medien: Verantwortlich")).toHaveValue("Lea");
    await waitFor(() => expect(crmCalls()).toHaveLength(2));
  });

  it("setzt mit «Neu beginnen» die Vorlage zurück und lässt das Profil stehen", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    await user.click(within(card).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Analyse erstellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Gruppe 1")).toHaveValue("Mitglieder");
    expect(screen.getByLabelText("Interesse: Mitglieder")).toHaveValue("");
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}")).toMatchObject({ phase: "edit", typ: "verein" });
  });

  it("fragt vor dem Download, wenn die Adresse abgelaufen ist, und lädt bei «Später» nichts", async () => {
    profile(FC);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await fcBewerten(user);
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    act(() => removeLocal(LEAD_KEY));
    await user.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeEnabled();
  });

  it("rechnet Betriebe mit der Vorlage für Betriebe und nennt «Betrieb» im Dokument", async () => {
    profile({ firma: "Malerei Keller", organisationstyp: "kmu" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await screen.findByLabelText("Gruppe 1");
    await bewerte(user, "Kunden", 5, 5, "eng");
    await bewerte(user, "Banken", 2, 4, "gut");
    await erstellen(user);
    const card = await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    expect(within(card).getByTestId("quadrant-eng-einbinden")).toHaveTextContent("Kunden");
    expect(within(card).getByTestId("quadrant-zufriedenstellen")).toHaveTextContent("Banken");
    expect(within(card).getByTestId("ag-dokument")).toHaveTextContent("Betrieb");
    expect(within(card).getByTestId("ag-dokument")).toHaveTextContent("vor der Jahresplanung");
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    expect(crmCalls()[0].body.eingabe.startsWith("Betrieb: Malerei Keller\n")).toBe(true);
  });
});

// ---- Vorschlag der KI ------------------------------------------------------------------------------

describe("Anspruchsgruppen: Vorschlag der KI", () => {
  const VORSCHLAG = {
    gruppen: [
      { name: "Mitglieder", interesse: 5, einfluss: 4, beziehung: "eng", erwartung: "Erwartet klare Termine und gutes Training.", bedarf: "Braucht ihre Mithilfe am Dorffest." },
      { name: "Sponsoren", interesse: 3, einfluss: 5, beziehung: "lose", erwartung: "Erwartet Sichtbarkeit am Spielfeld.", bedarf: "Braucht ihre Beiträge für das Vereinshaus." },
      { name: "Gemeinde und Behörden", interesse: 2, einfluss: 5, beziehung: "keine", erwartung: "Erwartet Berichte und saubere Abrechnungen.", bedarf: "Braucht Beiträge und einen Platz." },
      { name: "Medien der Region", interesse: 2, einfluss: 2, beziehung: "lose", erwartung: "Erwartet Neuigkeiten zu Anlässen.", bedarf: "Braucht ihre Berichte vor dem Dorffest." },
      { name: "Eltern des Nachwuchses", interesse: 5, einfluss: 2, beziehung: "gut", erwartung: "Erwartet Sicherheit für ihre Kinder.", bedarf: "Braucht ihre Hilfe bei Fahrten." },
      { name: "Vorstand", interesse: 5, einfluss: 5, beziehung: "eng", erwartung: "Erwartet Einsatz und Verlässlichkeit.", bedarf: "Braucht Zeit für Sitzungen." },
    ],
  };
  const PROFIL = { firma: "FC Trogen", organisationstyp: "verein", rechtsform: "Verein", ort: "Trogen", branche: "Fussball" };

  /** /api/generate antwortet mit `reply`; alles andere wie im Rest dieser Datei. */
  function stubGenerate(reply: { status: number; body: unknown }) {
    sent.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        sent.push({ url: String(url), body: init?.body ? (JSON.parse(init.body) as Record<string, string>) : {} });
        if (String(url) === "/api/generate") return new Response(JSON.stringify(reply.body), { status: reply.status });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  }
  const generateCalls = () => sent.filter((s) => s.url === "/api/generate");

  beforeEach(() => writeLocal(LEAD_KEY, "anna@keller.ch"));

  async function angabenAusfuellen(user: User) {
    await user.click(await screen.findByRole("checkbox", { name: "Sponsoren" }));
    await user.click(screen.getByRole("checkbox", { name: "Mitgliederbeiträge" }));
    await user.type(screen.getByLabelText("Was steht in den nächsten zwölf Monaten an?"), "Neues Vereinshaus");
    await user.type(screen.getByLabelText("Welche Gruppen kennst du schon?"), "Sponsoren, Gemeinde");
  }

  it("zeigt die Rechtsform als Auswahl und die drei Angaben zum Umfeld, mit Hinweis auf den Weg der Daten", async () => {
    profile(PROFIL);
    stubGenerate({ status: 200, body: { ok: true, output: VORSCHLAG } });
    render(<Tool />);
    expect(await screen.findByRole("radio", { name: "Verein" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Betrieb" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Woher kommt das Geld?" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Woher kommt das Geld?" })).getAllByRole("checkbox").map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Mitgliederbeiträge",
      "Sponsoren",
      "Beiträge von Gemeinde oder Kanton",
      "Spenden",
      "Anlässe und Verkauf",
    ]);
    expect(screen.getByLabelText("Ort")).toHaveValue("Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("Fussball");
    expect(screen.getByText(/nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expect(generateCalls()).toHaveLength(0);
  });

  it("schlägt Gruppen aus den Angaben vor, zeigt eine Vorschau und ersetzt die Liste erst nach «Vorschlag übernehmen»", async () => {
    profile(PROFIL);
    stubGenerate({ status: 200, body: { ok: true, output: VORSCHLAG } });
    const user = userEvent.setup();
    render(<Tool />);
    await angabenAusfuellen(user);
    await user.click(screen.getByRole("button", { name: "Gruppen vorschlagen" }));

    const vorschau = await screen.findByTestId("ag-vorschau");
    expect(generateCalls()).toHaveLength(1);
    expect(generateCalls()[0].body).toEqual({
      tool: "anspruchsgruppen",
      input: {
        betrieb: "FC Trogen",
        typ: "verein",
        rechtsform: "Verein",
        branche: "Fussball",
        ort: "Trogen",
        finanzierung: ["Mitgliederbeiträge", "Sponsoren"],
        vorhaben: "Neues Vereinshaus",
        bekannte: "Sponsoren, Gemeinde",
      },
    });
    expect(JSON.stringify(generateCalls()[0].body)).not.toContain("anna@keller.ch");
    expect(within(vorschau).getAllByRole("listitem")).toHaveLength(6);
    expect(vorschau).toHaveTextContent("Gemeinde und Behörden");
    expect(vorschau).toHaveTextContent("Interesse 2, Einfluss 5, Zufriedenstellen");
    expect(vorschau).toHaveTextContent("Von einer KI formuliert");
    expect(within(vorschau).queryByTestId("ag-vorschlag-ersetzt")).not.toBeInTheDocument();
    // Die Liste ist noch die Vorlage mit acht Karten
    expect(within(screen.getByRole("list", { name: "Anspruchsgruppen" })).getAllByRole("listitem")).toHaveLength(8);

    await user.click(within(vorschau).getByRole("button", { name: "Vorschlag übernehmen" }));
    expect(screen.queryByTestId("ag-vorschau")).not.toBeInTheDocument();
    const cards = within(screen.getByRole("list", { name: "Anspruchsgruppen" })).getAllByRole("listitem");
    expect(cards).toHaveLength(6);
    expect(screen.getByLabelText("Gruppe 2")).toHaveValue("Sponsoren");
    expect(screen.getByLabelText("Interesse: Sponsoren")).toHaveValue("3");
    expect(screen.getByLabelText("Einfluss: Sponsoren")).toHaveValue("5");
    expect(screen.getByLabelText("Beziehung: Sponsoren")).toHaveValue("lose");
    expect(screen.getByTestId("ag-status")).toHaveTextContent("Vorschlag der KI übernommen. Prüfe die Werte.");
    // Der Vorschlag allein geht nicht ins CRM; das Ergebnis tut es mit den Angaben
    expect(crmCalls()).toHaveLength(0);
    await erstellen(user);
    await screen.findByRole("region", { name: "Deine Anspruchsgruppen" });
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    const eingabe = String(crmCalls()[0].body.eingabe);
    expect(eingabe).toContain("Finanzierung: Mitgliederbeiträge, Sponsoren");
    expect(eingabe).toContain("Vorhaben: Neues Vereinshaus");
    expect(eingabe).toContain("Bekannte Gruppen: Sponsoren, Gemeinde");
    expect(eingabe).toContain("Rechtsform: Verein");
  });

  it("weist darauf hin, dass der Vorschlag bewertete Gruppen ersetzt, und lässt die Liste bei «Verwerfen» stehen", async () => {
    profile(PROFIL);
    stubGenerate({ status: 200, body: { ok: true, output: VORSCHLAG } });
    const user = userEvent.setup();
    render(<Tool />);
    await bewerte(await (async () => user)(), "Mitglieder", 5, 4);
    await user.click(screen.getByRole("button", { name: "Gruppen vorschlagen" }));
    const vorschau = await screen.findByTestId("ag-vorschau");
    expect(within(vorschau).getByTestId("ag-vorschlag-ersetzt")).toHaveTextContent("Der Vorschlag ersetzt die jetzige Liste.");
    await user.click(within(vorschau).getByRole("button", { name: "Verwerfen" }));
    expect(screen.queryByTestId("ag-vorschau")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Anspruchsgruppen" })).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByLabelText("Interesse: Mitglieder")).toHaveValue("5");
  });

  it("zeigt bei einem Ausfall der KI einen ruhigen Satz, lässt die Vorlage stehen und schickt nichts ins CRM", async () => {
    profile(PROFIL);
    stubGenerate({ status: 502, body: { error: "ai_failed" } });
    const user = userEvent.setup();
    render(<Tool />);
    await user.click(await screen.findByRole("button", { name: "Gruppen vorschlagen" }));
    expect(await screen.findByTestId("ag-vorschlag-fehler")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal. Du kannst die Gruppen auch von Hand bewerten.");
    expect(screen.queryByTestId("ag-vorschau")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Anspruchsgruppen" })).getAllByRole("listitem")).toHaveLength(8);
    expect(crmCalls()).toHaveLength(0);
  });

  it("verlangt den Namen und ruft den Server ohne ihn nicht auf", async () => {
    profile({ organisationstyp: "verein", rechtsform: "Verein" });
    stubGenerate({ status: 200, body: { ok: true, output: VORSCHLAG } });
    const user = userEvent.setup();
    render(<Tool />);
    await user.click(await screen.findByRole("button", { name: "Gruppen vorschlagen" }));
    expect(await screen.findByTestId("ag-vorschlag-fehler")).toHaveTextContent("Gib den Namen deines Vereins an.");
    expect(generateCalls()).toHaveLength(0);
  });

  it("behält die Angaben nach dem Neuladen", async () => {
    profile(PROFIL);
    stubGenerate({ status: 200, body: { ok: true, output: VORSCHLAG } });
    const user = userEvent.setup();
    const first = render(<Tool />);
    await angabenAusfuellen(user);
    await waitFor(() => expect(JSON.parse(readLocal("mt:anspruchsgruppen") ?? "{}").angaben?.vorhaben).toBe("Neues Vereinshaus"));
    first.unmount();
    render(<Tool />);
    expect(await screen.findByLabelText("Was steht in den nächsten zwölf Monaten an?")).toHaveValue("Neues Vereinshaus");
    expect(screen.getByLabelText("Welche Gruppen kennst du schon?")).toHaveValue("Sponsoren, Gemeinde");
    expect(screen.getByRole("checkbox", { name: "Sponsoren" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Spenden" })).not.toBeChecked();
  });
});
