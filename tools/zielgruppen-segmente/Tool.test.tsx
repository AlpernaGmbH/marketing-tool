// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Jedes Segment hat viele Felder und jede Eingabe schreibt den Stand; unter Last (ganze Suite) dauern die Abläufe länger.
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

function profile(p: Record<string, unknown>) {
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

type Daten = {
  name: string;
  beduerfnis: string;
  kaufmotiv: string;
  nutzen: string;
  groesse: string;
  kanaele?: string[];
  einwand?: string;
  zahlung: [number, string];
  erreich: [number, string];
  wettbewerb: [number, string];
};

const KELLER: Daten[] = [
  {
    name: "Hauseigentümer in Gossau",
    beduerfnis: "Fassade und Innenräume erneuern, ohne Stress",
    kaufmotiv: "Werterhalt",
    nutzen: "saubere Arbeit zum Fixpreis",
    groesse: "1200",
    kanaele: ["Empfehlungen", "Website"],
    zahlung: [4, "eher hoch"],
    erreich: [4, "eher leicht"],
    wettbewerb: [3, "mittel"],
  },
  {
    name: "Hausverwaltungen in der Region",
    beduerfnis: "Wohnungen schnell wieder vermieten",
    kaufmotiv: "Zeitersparnis",
    nutzen: "eine feste Ansprechperson und kurze Termine",
    groesse: "80",
    kanaele: ["Telefon und Gespräch", "LinkedIn"],
    einwand: "Wir haben schon einen festen Maler",
    zahlung: [5, "hoch"],
    erreich: [2, "eher schwer"],
    wettbewerb: [3, "mittel"],
  },
  {
    name: "Gewerbebetriebe in Gossau",
    beduerfnis: "Räume günstig auffrischen, ohne den Betrieb zu stören",
    kaufmotiv: "Kosten im Griff",
    nutzen: "Arbeiten am Wochenende zum Festpreis",
    groesse: "300",
    kanaele: ["Google-Unternehmensprofil", "Aushang und Flyer"],
    zahlung: [2, "eher gering"],
    erreich: [4, "eher leicht"],
    wettbewerb: [3, "mittel"],
  },
];

const feld = (nr: number, label: string) => screen.getByLabelText(`Segment ${nr}: ${label}`);
const setze = (nr: number, label: string, value: string) => fireEvent.change(feld(nr, label), { target: { value } });
const gruppe = (nr: number, label: string) => screen.getByRole("group", { name: `Segment ${nr}: ${label}` });

async function fuelle(user: User, nr: number, d: Daten) {
  setze(nr, "Name", d.name);
  setze(nr, "Hauptbedürfnis", d.beduerfnis);
  setze(nr, "Kaufmotiv", d.kaufmotiv);
  setze(nr, "Dein Nutzen", d.nutzen);
  setze(nr, "Wie viele mögliche Kundinnen und Kunden? (deine Schätzung)", d.groesse);
  if (d.einwand) setze(nr, "Typischer Einwand", d.einwand);
  for (const k of d.kanaele ?? []) await user.click(within(gruppe(nr, "Kanäle")).getByRole("checkbox", { name: k }));
  for (const [label, [wert, text]] of [
    ["Zahlungsbereitschaft", d.zahlung],
    ["Erreichbarkeit", d.erreich],
    ["Wettbewerbsdruck", d.wettbewerb],
  ] as const) {
    await user.click(within(gruppe(nr, label)).getByRole("radio", { name: `${wert} ${text}` }));
  }
}

async function erstellen(user: User) {
  await user.click(screen.getByRole("button", { name: "Segmente auswerten" }));
}

const warteAufFormular = () => screen.findByLabelText("Segment 1: Name");

/** Das Beispiel Malerei Keller in das Formular eintragen (zwei Startsegmente, ein drittes kommt dazu). */
async function kellerEintragen(user: User) {
  await warteAufFormular();
  await user.click(screen.getByRole("button", { name: "Segment hinzufügen" }));
  await screen.findByLabelText("Segment 3: Name");
  for (const [i, d] of KELLER.entries()) await fuelle(user, i + 1, d);
}

const KELLER_PROFIL = { firma: "Malerei Keller", branche: "Malerei", organisationstyp: "kmu" };

describe("Zielgruppen-Segmente: Formular", () => {
  it("zeigt zwei Startsegmente mit allen Feldern, Gruppen und Knöpfen", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    await warteAufFormular();
    expect(screen.getByRole("list", { name: "Deine Segmente" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-testid")?.startsWith("segment-"))).toHaveLength(2);
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    for (const nr of [1, 2]) {
      for (const l of ["Name", "Hauptbedürfnis", "Kaufmotiv", "Dein Nutzen", "Typischer Einwand"]) expect(feld(nr, l)).toHaveValue("");
      expect(feld(nr, "Wie viele mögliche Kundinnen und Kunden? (deine Schätzung)")).toHaveAttribute("type", "number");
      expect(gruppe(nr, "Kanäle")).toBeInTheDocument();
      expect(within(gruppe(nr, "Kanäle")).getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual([
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
    }
    expect(feld(1, "Name")).toHaveAttribute("placeholder", "Hauseigentümer in Gossau");
    expect(feld(1, "Kaufmotiv")).toHaveAttribute("placeholder", "Werterhalt");
    const zahlung = within(gruppe(1, "Zahlungsbereitschaft")).getAllByRole("radio").map((r) => r.closest("label")?.textContent);
    expect(zahlung).toEqual(["1 gering", "2 eher gering", "3 mittel", "4 eher hoch", "5 hoch"]);
    expect(within(gruppe(1, "Erreichbarkeit")).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "1 schwer",
      "2 eher schwer",
      "3 mittel",
      "4 eher leicht",
      "5 leicht",
    ]);
    expect(within(gruppe(2, "Wettbewerbsdruck")).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Segment hinzufügen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Segmente auswerten" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Entfernen: Segment 1" })).toBeEnabled();
    expect(screen.getByTestId("zs-status")).toHaveTextContent("2 von 4 Segmenten.");
  });

  it("nennt Richtwert und Einschätzung schon vor dem Ergebnis", async () => {
    render(<Tool />);
    await warteAufFormular();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Richtwert von Alperna, keine Statistik");
    expect(text).toContain("Einschätzungen, keine Statistik");
    expect(text).toContain("ohne KI");
  });

  it("heisst bei Vereinen «Zielgruppen des Vereins» und fragt nach dem Namen des Vereins", async () => {
    profile({ firma: "FC Trogen", organisationstyp: "verein" });
    render(<Tool />);
    await warteAufFormular();
    expect(screen.getByRole("list", { name: "Zielgruppen des Vereins" })).toBeInTheDocument();
    expect(screen.getByText("Zielgruppen des Vereins", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toBeInTheDocument();
    expect(feld(1, "Name")).toHaveAttribute("placeholder", "Eltern von Junioren in Trogen");
  });

  it("übernimmt die Namen der Zielgruppen aus dem Profil und fragt sie nicht erneut", async () => {
    profile({ ...KELLER_PROFIL, zielgruppen: [{ name: "Eltern von Junioren" }, { name: "Sponsoren" }, { name: "Gemeinde" }] });
    render(<Tool />);
    await warteAufFormular();
    expect(feld(1, "Name")).toHaveValue("Eltern von Junioren");
    expect(feld(2, "Name")).toHaveValue("Sponsoren");
    expect(feld(3, "Name")).toHaveValue("Gemeinde");
    expect(screen.getByTestId("zs-status")).toHaveTextContent("3 von 4 Segmenten.");
    // Noch nichts gespeichert, bis die Person etwas ändert.
    expect(readLocal("mt:zielgruppen-segmente")).toBeNull();
    setze(1, "Hauptbedürfnis", "Sicheres Training am Abend");
    const stand = JSON.parse(readLocal("mt:zielgruppen-segmente") ?? "{}") as { phase: string; segmente: { name: string; beduerfnis: string }[] };
    expect(stand.phase).toBe("edit");
    expect(stand.segmente.map((s) => s.name)).toEqual(["Eltern von Junioren", "Sponsoren", "Gemeinde"]);
    expect(stand.segmente[0].beduerfnis).toBe("Sicheres Training am Abend");
  });

  it("nimmt das Primärsegment als erstes Segment, wenn es keine Zielgruppen gibt", async () => {
    profile({ ...KELLER_PROFIL, primaersegment: "Hauseigentümer in Gossau" });
    render(<Tool />);
    await warteAufFormular();
    expect(feld(1, "Name")).toHaveValue("Hauseigentümer in Gossau");
    expect(feld(2, "Name")).toHaveValue("");
  });

  it("fügt Segmente hinzu und entfernt sie, höchstens vier und mindestens eines", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    const add = screen.getByRole("button", { name: "Segment hinzufügen" });
    await user.click(add);
    const drittes = await screen.findByLabelText("Segment 3: Name");
    expect(drittes).toHaveFocus();
    await user.click(add);
    expect(await screen.findByLabelText("Segment 4: Name")).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByTestId("zs-status")).toHaveTextContent("4 von 4 Segmenten.");

    setze(2, "Name", "Hausverwaltungen");
    await user.click(screen.getByRole("button", { name: "Entfernen: Segment 2" }));
    await waitFor(() => expect(screen.queryByLabelText("Segment 4: Name")).not.toBeInTheDocument());
    expect(screen.getByTestId("zs-status")).toHaveTextContent("Segment 2 entfernt. 3 von 4 Segmenten.");
    expect(screen.queryByDisplayValue("Hausverwaltungen")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segment hinzufügen" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Entfernen: Segment 2" }));
    await user.click(screen.getByRole("button", { name: "Entfernen: Segment 1" }));
    expect(screen.getByTestId("zs-status")).toHaveTextContent("1 von 4 Segmenten.");
    expect(screen.getByRole("button", { name: "Entfernen: Segment 1" })).toBeDisabled();
  });

  it("erlaubt höchstens vier Kanäle je Segment und gibt gewählte frei", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    const kanaele = gruppe(1, "Kanäle");
    for (const k of ["Website", "Instagram", "Facebook", "LinkedIn"]) await user.click(within(kanaele).getByRole("checkbox", { name: k }));
    expect(kanaele).toHaveTextContent("4 von 4 gewählt.");
    expect(within(kanaele).getByRole("checkbox", { name: "WhatsApp" })).toBeDisabled();
    expect(within(kanaele).getByRole("checkbox", { name: "Website" })).toBeEnabled();
    await user.click(within(kanaele).getByRole("checkbox", { name: "Website" }));
    expect(within(kanaele).getByRole("checkbox", { name: "WhatsApp" })).toBeEnabled();
    expect(kanaele).toHaveTextContent("3 von 4 gewählt.");
    // Das zweite Segment ist unabhängig.
    expect(within(gruppe(2, "Kanäle")).getByRole("checkbox", { name: "WhatsApp" })).toBeEnabled();
  });

  it("bedient die Skalen per Tastatur (Pfeiltasten wählen den nächsten Wert)", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    const radios = within(gruppe(1, "Zahlungsbereitschaft")).getAllByRole("radio");
    await user.click(radios[2]);
    expect(radios[2]).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(radios[3]).toBeChecked();
    expect(JSON.parse(readLocal("mt:zielgruppen-segmente") ?? "{}").segmente[0].zahlung).toBe(4);
    // Die Gruppen der anderen Segmente und Skalen bleiben unberührt.
    expect(within(gruppe(2, "Zahlungsbereitschaft")).getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(within(gruppe(1, "Erreichbarkeit")).getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
  });

  it("meldet fehlende Firma, leere Segmente und halbe Segmente in role=alert, ohne Ergebnis und ohne CRM", async () => {
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();

    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an.");
    expect(screen.getByLabelText("Firma")).toHaveFocus();

    await user.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Beschreibe mindestens ein Segment.");
    expect(feld(1, "Name")).toHaveFocus();

    setze(1, "Name", "Hauseigentümer in Gossau");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Segment 1: Beschreibe das Hauptbedürfnis.");
    expect(feld(1, "Hauptbedürfnis")).toHaveFocus();
    expect(feld(1, "Hauptbedürfnis")).toHaveAttribute("aria-invalid", "true");

    setze(1, "Hauptbedürfnis", "Fassade erneuern");
    setze(1, "Kaufmotiv", "Werterhalt");
    setze(1, "Dein Nutzen", "saubere Arbeit");
    setze(1, "Wie viele mögliche Kundinnen und Kunden? (deine Schätzung)", "12.5");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.");

    setze(1, "Wie viele mögliche Kundinnen und Kunden? (deine Schätzung)", "1200");
    await erstellen(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Segment 1: Wähle die Zahlungsbereitschaft von 1 bis 5.");
    expect(gruppe(1, "Zahlungsbereitschaft")).toHaveFocus();

    expect(screen.queryByRole("region", { name: "Deine Zielgruppen-Segmente" })).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});

describe("Zielgruppen-Segmente: Ergebnis", () => {
  it("zeigt Empfehlung, Matrix, Tabelle und Botschaften, speichert den Stand und schreibt Eingabe und Ausgabe ins CRM", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);

    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    const e = within(karte).getByTestId("zs-empfehlung");
    expect(within(e).getByTestId("zs-fokus")).toHaveTextContent(
      "Konzentriere dich zuerst auf «Hauseigentümer in Gossau»: Attraktivität 75, Erreichbarkeit 75. Es ist attraktiv, und du erreichst es gut.",
    );
    expect(within(e).getByTestId("zs-danach")).toHaveTextContent("Danach folgt «Gewerbebetriebe in Gossau» (Attraktivität 33, Erreichbarkeit 75).");
    expect(within(e).getByTestId("zs-zurueck")).toHaveTextContent("Vorerst nicht im Fokus: «Hausverwaltungen in der Region».");

    const matrix = within(karte).getByRole("img", { name: /^Vier-Felder-Matrix mit 3 Segmenten/ });
    expect(matrix).toHaveAttribute("aria-describedby", "zs-lage");
    expect(matrix.querySelectorAll("[data-segment]")).toHaveLength(3);
    expect(matrix.querySelectorAll("[data-legende]")).toHaveLength(3);
    const lage = within(karte).getByRole("list", { name: "Lage der Segmente" });
    expect(within(lage).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Segment 1, Hauseigentümer in Gossau: Attraktivität 75, Erreichbarkeit 75, Feld Zuerst bearbeiten, Primärsegment",
      "Segment 2, Hausverwaltungen in der Region: Attraktivität 52, Erreichbarkeit 25, Feld Aufbauen",
      "Segment 3, Gewerbebetriebe in Gossau: Attraktivität 33, Erreichbarkeit 75, Feld Mitnehmen",
    ]);
    const tabelle = within(karte).getByTestId("zs-tabelle");
    expect(within(tabelle).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Segment", "Attraktivität", "Erreichbarkeit", "Feld"]);
    expect(within(tabelle).getAllByRole("row").slice(1).map((r) => r.textContent)).toEqual([
      "1 Hauseigentümer in Gossau75" + "75Zuerst bearbeiten",
      "2 Hausverwaltungen in der Region52" + "25Aufbauen",
      "3 Gewerbebetriebe in Gossau33" + "75Mitnehmen",
    ]);

    const liste = within(karte).getByRole("list", { name: "Segmente nach Rangfolge" });
    const reihenfolge = within(liste).getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(reihenfolge).toEqual(["1 Hauseigentümer in Gossau", "3 Gewerbebetriebe in Gossau", "2 Hausverwaltungen in der Region"]);
    expect(within(karte).getByTestId("ergebnis-segment-1")).toHaveTextContent("Primärsegment");
    expect(within(karte).getByTestId("ergebnis-segment-3")).toHaveTextContent("Sekundärsegment");
    expect(within(karte).getByTestId("ergebnis-segment-2")).toHaveTextContent("Vorerst nicht im Fokus");
    expect(within(karte).getByTestId("botschaft-1")).toHaveTextContent(
      "Für Hauseigentümer in Gossau mit dem Bedürfnis «Fassade und Innenräume erneuern, ohne Stress» bieten wir saubere Arbeit zum Fixpreis.",
    );
    expect(within(karte).getByTestId("ergebnis-segment-2")).toHaveTextContent("Typischer Einwand: Wir haben schon einen festen Maler");
    expect(within(karte).getByTestId("zs-richtwert")).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    expect(within(karte).getByTestId("zs-richtwert")).toHaveTextContent("Einschätzung, keine Statistik");
    expect(within(karte).getByRole("list", { name: "Hinweise" }).querySelectorAll("li")).toHaveLength(3);

    for (const name of ["Text kopieren", "PDF herunterladen", "Word herunterladen", "Angaben ändern", "Neu beginnen", "Botschaft 1 kopieren", "Botschaft 2 kopieren"]) {
      expect(within(karte).getByRole("button", { name })).toBeInTheDocument();
    }

    const stand = JSON.parse(readLocal("mt:zielgruppen-segmente") ?? "{}") as { v: number; phase: string; segmente: unknown[]; output: { primaer: string; sekundaer: string; vorerstNicht: string[] } };
    expect(stand).toMatchObject({ v: 1, phase: "result", output: { primaer: "Hauseigentümer in Gossau", sekundaer: "Gewerbebetriebe in Gossau", vorerstNicht: ["Hausverwaltungen in der Region"] } });
    expect(stand.segmente).toHaveLength(3);

    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    const crm = crmCalls()[0].body;
    expect(crm.tool).toBe("zielgruppen-segmente");
    expect(crm.firma).toBe("Malerei Keller");
    expect(
      crm.eingabe.startsWith(
        "Betrieb: Malerei Keller\nBranche: Malerei\nSegment 1: Hauseigentümer in Gossau; Bedürfnis: Fassade und Innenräume erneuern, ohne Stress; Kaufmotiv: Werterhalt; Nutzen: saubere Arbeit zum Fixpreis; Grösse: 1'200; Kanäle: Website, Empfehlungen;",
      ),
    ).toBe(true);
    expect(crm.eingabe).toContain("Segment 2: Hausverwaltungen in der Region;");
    expect(crm.eingabe).toContain("Einwand: Wir haben schon einen festen Maler;");
    expect(crm.ausgabe.startsWith("# Zielgruppen-Segmente\n")).toBe(true);
    expect(crm.ausgabe).toContain("## Empfehlung\n\nKonzentriere dich zuerst auf «Hauseigentümer in Gossau»");
    expect(crm.ausgabe).toContain("| 1. Hauseigentümer in Gossau | 75 | 75 | Zuerst bearbeiten |");
  });

  it("schreibt Segmente und Primärsegment ins Profil, aber nur in leere Felder", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const erster = render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    const p = JSON.parse(readLocal(PROFILE_KEY) ?? "{}") as { primaersegment: string; zielgruppen: { name: string; beschreibung: string }[]; firma: string };
    expect(p.primaersegment).toBe("Hauseigentümer in Gossau");
    expect(p.zielgruppen.map((z) => z.name)).toEqual(["Hauseigentümer in Gossau", "Gewerbebetriebe in Gossau", "Hausverwaltungen in der Region"]);
    expect(p.zielgruppen[0].beschreibung).toBe("Hauptbedürfnis: Fassade und Innenräume erneuern, ohne Stress. Kaufmotiv: Werterhalt.");
    expect(p.firma).toBe("Malerei Keller");
    erster.unmount();

    // Zweiter Durchlauf mit vorhandenem Profil: nichts wird überschrieben.
    clearAllLocal();
    profile({ ...KELLER_PROFIL, primaersegment: "Eltern", zielgruppen: [{ name: "Eltern" }] });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    await warteAufFormular();
    const user2 = userEvent.setup();
    await user2.click(screen.getByRole("button", { name: "Segment hinzufügen" }));
    // Das Profil hat einen Namen; die Startliste hat Segment 1 «Eltern» und ein leeres zweites.
    await screen.findByLabelText("Segment 3: Name");
    await fuelle(user2, 1, { ...KELLER[0], name: "Eltern" });
    await fuelle(user2, 2, KELLER[1]);
    await erstellen(user2);
    await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    const q = JSON.parse(readLocal(PROFILE_KEY) ?? "{}") as { primaersegment: string; zielgruppen: { name: string }[] };
    expect(q.primaersegment).toBe("Eltern");
    expect(q.zielgruppen).toEqual([{ name: "Eltern" }]);
  });

  it("fokussiert die Überschrift des Ergebnisses", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const heading = await screen.findByRole("heading", { name: "Deine Zielgruppen-Segmente", level: 3 });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("fragt ohne Adresse zuerst nach ihr und zeigt bei «Später» weder Ergebnis noch CRM-Eintrag, die Eingaben bleiben", async () => {
    profile(KELLER_PROFIL);
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Deine Zielgruppen-Segmente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segmente auswerten" })).toBeEnabled();
    expect(feld(1, "Name")).toHaveValue("Hauseigentümer in Gossau");
    expect(within(gruppe(1, "Zahlungsbereitschaft")).getByRole("radio", { name: "4 eher hoch" })).toBeChecked();
    expect(crmCalls()).toHaveLength(0);
  });

  it("zeigt nach dem Neuladen wieder das Ergebnis, ohne zweiten CRM-Eintrag", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const erster = render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    erster.unmount();

    render(<Tool />);
    const wieder = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    expect(within(wieder).getByTestId("zs-fokus")).toHaveTextContent("«Hauseigentümer in Gossau»");
    expect(crmCalls()).toHaveLength(1);
  });

  it("führt mit «Angaben ändern» zum Formular zurück und rechnet nach einer Änderung neu (zweiter CRM-Eintrag)", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    await user.click(within(karte).getByRole("button", { name: "Angaben ändern" }));

    expect(await screen.findByRole("button", { name: "Segmente auswerten" })).toBeInTheDocument();
    expect(feld(2, "Name")).toHaveValue("Hausverwaltungen in der Region");
    expect(feld(2, "Typischer Einwand")).toHaveValue("Wir haben schon einen festen Maler");
    expect(JSON.parse(readLocal("mt:zielgruppen-segmente") ?? "{}").phase).toBe("edit");

    // Die Hausverwaltungen werden leicht erreichbar (Mittel 76 gegen 75): Sie rücken nach vorn.
    await user.click(within(gruppe(2, "Erreichbarkeit")).getByRole("radio", { name: "5 leicht" }));
    await erstellen(user);
    const neu = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    expect(within(neu).getByTestId("zs-fokus")).toHaveTextContent("«Hausverwaltungen in der Region»: Attraktivität 52, Erreichbarkeit 100");
    expect(within(neu).getByTestId("zs-danach")).toHaveTextContent("«Hauseigentümer in Gossau» (Attraktivität 75, Erreichbarkeit 75)");
    await waitFor(() => expect(crmCalls()).toHaveLength(2));
  });

  it("setzt mit «Neu beginnen» die Segmente zurück, lässt das Profil stehen und füllt die Namen aus dem Profil vor", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    await user.click(within(karte).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("button", { name: "Segmente auswerten" })).toBeInTheDocument();
    // Das Profil trägt jetzt die drei Segmente des Durchlaufs; die Namen stehen wieder da, alles andere ist leer.
    expect(feld(1, "Name")).toHaveValue("Hauseigentümer in Gossau");
    expect(feld(1, "Hauptbedürfnis")).toHaveValue("");
    expect(within(gruppe(1, "Zahlungsbereitschaft")).getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(readLocal("mt:zielgruppen-segmente")).toBe(JSON.stringify({ v: 1, phase: "edit", segmente: [] }));
  });

  it("beschreibt bei einem Segment nur, zeigt keine Matrix und führt mit dem Knopf zum zweiten Segment", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    await fuelle(user, 1, KELLER[0]);
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    expect(within(karte).getByTestId("zs-fokus")).toHaveTextContent("Du hast ein Segment beschrieben");
    expect(within(karte).getByTestId("zs-einzeln")).toHaveTextContent("Beschreib ein zweites Segment");
    expect(within(karte).queryByRole("img")).not.toBeInTheDocument();
    expect(within(karte).queryByTestId("zs-tabelle")).not.toBeInTheDocument();
    expect(within(karte).getAllByRole("heading", { level: 4 }).some((h) => h.textContent === "1 Hauseigentümer in Gossau")).toBe(true);
    expect(within(karte).getByTestId("ergebnis-segment-1")).toHaveTextContent("Attraktivität");
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    expect(crmCalls()[0].body.ausgabe).toContain("Mit einem Segment gibt es keine Matrix.");

    await user.click(within(karte).getByRole("button", { name: "Zweites Segment beschreiben" }));
    const zweites = await screen.findByLabelText("Segment 2: Name");
    expect(zweites).toHaveValue("");
    await waitFor(() => expect(zweites).toHaveFocus());
    expect(feld(1, "Name")).toHaveValue("Hauseigentümer in Gossau");
  });

  it("ignoriert ein völlig leeres Segment neben einem ausgefüllten", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    await fuelle(user, 2, KELLER[1]);
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    expect(within(karte).getByTestId("zs-einzeln")).toBeInTheDocument();
    expect(within(karte).getByTestId("ergebnis-segment-1")).toHaveTextContent("Hausverwaltungen in der Region");
  });

  it("fragt vor dem Download, wenn die Adresse abgelaufen ist, und lädt bei «Später» nichts", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    act(() => removeLocal(LEAD_KEY));
    await user.click(within(karte).getByRole("button", { name: "PDF herunterladen" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(karte).getByRole("button", { name: "PDF herunterladen" })).toBeEnabled();
  });

  it("rechnet Vereine mit «Zielgruppen» und nennt «Verein» im Dokument und im CRM", async () => {
    profile({ firma: "FC Trogen", branche: "Fussball", organisationstyp: "verein" });
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await warteAufFormular();
    await fuelle(user, 1, { ...KELLER[0], name: "Eltern von Junioren in Trogen", beduerfnis: "Sicheres Training am Abend", kaufmotiv: "Gemeinschaft", nutzen: "geprüfte Trainerinnen und Trainer" });
    await fuelle(user, 2, { ...KELLER[1], name: "Sponsoren aus der Region", beduerfnis: "Sichtbarkeit im Dorf", kaufmotiv: "Verbundenheit", nutzen: "Werbung am Spielfeldrand" });
    await erstellen(user);
    const karte = await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    expect(within(karte).getByText("Die Zielgruppen im Einzelnen")).toBeInTheDocument();
    expect(within(karte).getByTestId("zs-dokument")).toHaveTextContent("Verein");
    expect(within(karte).getByTestId("zs-dokument")).toHaveTextContent("Tätigkeit");
    await waitFor(() => expect(crmCalls()).toHaveLength(1));
    expect(crmCalls()[0].body.eingabe.startsWith("Verein: FC Trogen\nTätigkeit: Fussball\nSegment 1: Eltern von Junioren in Trogen;")).toBe(true);
  });

  it("enthält im sichtbaren Text nichts von der Sperrliste, kein Ausrufezeichen und keinen Gedankenstrich", async () => {
    profile(KELLER_PROFIL);
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await kellerEintragen(user);

    const sichtbar = () => (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
    const pruefe = (text: string) => {
      expect(brandHits(text)).toEqual([]);
      expect(text).not.toMatch(/!|—|ß|\bjetzt\b|\bnur noch\b|\bgarantiert\b/i);
    };
    pruefe(sichtbar());
    await erstellen(user);
    await screen.findByRole("region", { name: "Deine Zielgruppen-Segmente" });
    pruefe(sichtbar());
  });
});
