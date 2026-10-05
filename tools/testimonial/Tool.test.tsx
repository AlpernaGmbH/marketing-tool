// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { isToolDone } from "@/lib/progress";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { buildAnfrage, buildReferenz, type AnfrageInput, type ReferenzInput } from "./logic";

// Durchlauf im Browser (jsdom): beide Wege, Prüfung, E-Mail-Fenster, Ergebnis, Kopieren, CRM, Stand unter mt:testimonial.

type Call = { path: string; body: Record<string, unknown> };

function mockApi(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }),
  );
  return calls;
}

const crm = (calls: Call[]) => calls.filter((c) => c.path === "/api/result");

const PROFIL = { firma: "Malerei Keller", ort: "Gossau", organisationstyp: "kmu" };

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
  writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

const ZITAT =
  "Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag. Herr Keller hat erst die Feuchte im Putz gemessen, bevor er gestrichen hat. Ich würde die Malerei jederzeit weiterempfehlen.";
const MITTE = "Herr Keller hat erst die Feuchte im Putz gemessen, bevor er gestrichen hat.";

const REFERENZ: ReferenzInput = {
  zitat: ZITAT,
  ohne: [MITTE],
  nennung: "vorname-ort",
  name: "Regula",
  ortFirma: "Gossau",
  funktion: "",
  gemacht: "Fassadenanstrich an einem Einfamilienhaus",
  ausgangslage: "Die Fassade blätterte nach drei Wintern ab",
  getan: "Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen",
  ergebnis: "Die Fassade hält seit zwei Jahren",
  firma: "Malerei Keller",
};

const ANFRAGE: AnfrageInput = {
  anrede: "du",
  kanal: "whatsapp",
  vorname: "Regula",
  leistung: "den Anstrich der Fassade in Gossau",
  fragen: ["lage", "ueberzeugt", "veraendert"],
  freigabe: "vorname-ort",
  firma: "Malerei Keller",
};

/** Alle sichtbaren Texte, Platzhalter und Namen (aria-label) der Seite, ein Eintrag je Element. */
function pageTexts(): string[] {
  const out: string[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.children.length === 0 && el.textContent?.trim()) out.push(el.textContent.trim());
    for (const attr of ["placeholder", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

function expectCalmText(where: string) {
  for (const t of pageTexts()) {
    expect(brandHits(t), `${where}: ${t}`).toEqual([]);
    expect(t, `${where}: ${t}`).not.toMatch(/!|\bjetzt\b|—|ß/i);
  }
}

/** Fügt Text wörtlich ein (auch eckige Klammern, Anführungszeichen). */
async function paste(u: User, label: string, value: string) {
  await u.click(screen.getByLabelText(label));
  await u.paste(value);
}

async function fuelleAnfrage(u: User) {
  await u.type(await screen.findByLabelText("Vorname der Person"), "Regula");
  await paste(u, "Was habt ihr zusammen gemacht?", "den Anstrich der Fassade in Gossau");
}

async function waehleReferenz(u: User) {
  await u.click(await screen.findByRole("radio", { name: "Ich habe ein Zitat und baue die Referenz" }));
}

async function fuelleReferenz(u: User, r: Partial<ReferenzInput> = {}) {
  const v = { ...REFERENZ, ...r };
  await paste(u, "Zitat der Kundschaft", v.zitat);
  if (v.nennung !== "anonym") await paste(u, "Name", v.name);
  if (v.nennung === "vorname-ort" || v.nennung === "name-firma") await paste(u, "Ort oder Firma", v.ortFirma);
  await paste(u, "Was habt ihr gemacht?", v.gemacht);
  await paste(u, "Ausgangslage", v.ausgangslage);
  await paste(u, "Was habt ihr getan?", v.getan);
  if (v.ergebnis) await paste(u, "Ergebnis (freiwillig)", v.ergebnis);
}

async function gateEmail(u: User) {
  const dialog = await screen.findByRole("dialog");
  await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
  await u.click(within(dialog).getByRole("checkbox"));
  await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
}

describe("Testimonial-Baukasten im Browser: Formular", () => {
  it("hält im Formular beider Wege und in beiden Ergebnissen die Sperrliste und die Schreibregeln ein", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await screen.findByLabelText("Vorname der Person");
    expectCalmText("Formular Weg 1");
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")).toHaveLength(2);
    expectCalmText("Meldungen Weg 1");
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    await screen.findByRole("region", { name: "Deine Nachricht" });
    expectCalmText("Ergebnis Weg 1");
    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    await waehleReferenz(u);
    expectCalmText("Formular Weg 2");
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")).toHaveLength(6);
    expectCalmText("Meldungen Weg 2");
    await fuelleReferenz(u);
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    await screen.findByRole("region", { name: "Deine Referenz" });
    expectCalmText("Ergebnis Weg 2");
  });

  it("zeigt die Radiogruppe «Was brauchst du?», Weg 1 als Standard und die Felder mit Beschriftung", async () => {
    render(<Tool />);
    const gruppe = await screen.findByRole("radiogroup", { name: "Was brauchst du?" });
    const radios = within(gruppe).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Ich möchte um ein Zitat bitten", "Ich habe ein Zitat und baue die Referenz"]);
    expect(radios[0]).toBeChecked();
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByRole("radiogroup", { name: "Wie sprichst du die Person an?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Du" })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Wie erreichst du sie?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "WhatsApp" })).toBeChecked();
    expect(screen.getByLabelText("Vorname der Person")).toHaveValue("");
    expect(screen.getByLabelText("Was habt ihr zusammen gemacht?")).toHaveAttribute("placeholder", "den Anstrich der Fassade in Gossau");
    const fragen = screen.getByRole("group", { name: "Leitfragen" });
    const boxen = within(fragen).getAllByRole("checkbox");
    expect(boxen).toHaveLength(6);
    expect(boxen.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, true, false, false, false]);
    expect(within(fragen).getByRole("checkbox", { name: "Wie war die Lage, bevor wir angefangen haben?" })).toBeChecked();
    expect(screen.getByTestId("tb-fragen-zaehler")).toHaveTextContent("Gewählt: 3.");
    expect(screen.getByRole("radiogroup", { name: "Freigabe" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Vorname und Ort" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Nachricht erstellen" })).toBeEnabled();
  });

  it("meldet fehlende Angaben in einer Liste, setzt den Fokus ins erste Feld und fragt noch nicht nach der Adresse", async () => {
    clearAllLocal();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await screen.findByLabelText("Vorname der Person");
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Gib den Vornamen der Person an.",
      "Schreib kurz, was ihr zusammen gemacht habt.",
    ]);
    expect(screen.getByLabelText("Vorname der Person")).toHaveFocus();
    expect(screen.getByLabelText("Vorname der Person")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    // Sobald die Person tippt, verschwindet die Meldung
    await u.type(screen.getByLabelText("Vorname der Person"), "R");
    expect(within(screen.getByRole("alert")).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("meldet ohne Firma «Gib den Namen deines Betriebs an.», bei einem Verein «… deines Vereins an.»", async () => {
    clearAllLocal();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await screen.findByLabelText("Vorname der Person");
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")[0]).toHaveTextContent("Gib den Namen deines Betriebs an.");
    expect(screen.getByLabelText("Firma")).toHaveFocus();
    await u.click(screen.getByRole("radio", { name: "Verein" }));
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")[0]).toHaveTextContent("Gib den Namen deines Vereins an.");
    expect(screen.getByLabelText("Name des Vereins")).toHaveFocus();
    expect(screen.getByLabelText("Was habt ihr zusammen gemacht?")).toHaveAttribute("placeholder", "das Jugendturnier in Trogen");
  });

  it("verlangt zwei bis drei Leitfragen und zählt live mit", async () => {
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    const frage = (name: string) => screen.getByRole("checkbox", { name });
    await u.click(frage("Was hat dich überzeugt, uns zu beauftragen?"));
    await u.click(frage("Was hat sich für dich verändert?"));
    expect(screen.getByTestId("tb-fragen-zaehler")).toHaveTextContent("Gewählt: 1.");
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens zwei Leitfragen.");
    expect(frage("Wie war die Lage, bevor wir angefangen haben?")).toHaveFocus();
    await u.click(frage("Was hat dich überzeugt, uns zu beauftragen?"));
    await u.click(frage("Was hat sich für dich verändert?"));
    await u.click(frage("Was hat dich überrascht?"));
    expect(screen.getByTestId("tb-fragen-zaehler")).toHaveTextContent("Gewählt: 4.");
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle höchstens drei Leitfragen.");
  });

  it("macht beim Wechsel zu Weg 2 die Zitat-Felder sichtbar und blendet Namensfelder je nach Nennung ein und aus", async () => {
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    expect(screen.queryByLabelText("Vorname der Person")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Zitat der Kundschaft")).toHaveValue("");
    expect(screen.getByTestId("tb-saetze-leer")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Wie soll die Person genannt werden?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Vorname und Ort" })).toBeChecked();
    for (const label of ["Name", "Ort oder Firma", "Funktion (freiwillig)", "Was habt ihr gemacht?", "Ausgangslage", "Was habt ihr getan?", "Ergebnis (freiwillig)"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    await u.click(screen.getByRole("radio", { name: "Voller Name" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ort oder Firma")).not.toBeInTheDocument();
    await u.click(screen.getByRole("radio", { name: "Name und Firma" }));
    expect(screen.getByLabelText("Ort oder Firma")).toBeInTheDocument();
    await u.click(screen.getByRole("radio", { name: "Ohne Namen" }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ort oder Firma")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Funktion (freiwillig)")).not.toBeInTheDocument();
  });
});

describe("Testimonial-Baukasten im Browser: Weg 1, Zitat anfragen", () => {
  it("erstellt drei Fassungen, zeigt Zeichenzahl und Hinweise und schickt Eingabe und Ausgabe ohne Vorname einmal ins CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    expect(calls).toHaveLength(0); // vor dem Ergebnis geht nichts raus
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));

    const card = await screen.findByRole("region", { name: "Deine Nachricht" });
    expect(within(card).getByRole("heading", { name: "Deine Nachricht" })).toHaveFocus();
    const erwartet = buildAnfrage(ANFRAGE);
    const liste = within(card).getByRole("list", { name: "Fassungen der Nachricht" });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(3);
    for (const f of erwartet.fassungen) {
      expect(within(card).getByTestId(`tb-fassung-${f.id}-text`).textContent).toBe(f.text);
      expect(within(card).getByTestId(`tb-fassung-${f.id}-zeichen`)).toHaveTextContent(`${f.zeichen} Zeichen`);
      expect(within(card).getByRole("button", { name: f.copyLabel })).toBeInTheDocument();
    }
    expect(within(card).getByTestId("tb-fassung-kurz")).toHaveTextContent("Passt zu deinem Weg");
    expect(within(card).getByTestId("tb-fassung-kurz-text")).toHaveTextContent("Hallo Regula");
    expect(within(card).getByTestId("tb-fassung-kurz-text")).toHaveTextContent("Darf ich dein Zitat mit Vorname und Ort zeigen?");
    expect(within(card).getByTestId("tb-fassung-kurz-text")).toHaveTextContent("Grüsse, Malerei Keller");
    const hinweise = within(card).getByRole("list", { name: "Hinweise zur Nachricht" });
    expect(hinweise).toHaveTextContent("Fragen stellst, die man mit zwei Sätzen beantworten kann");
    expect(hinweise).toHaveTextContent("etwa einer Woche");
    expect(within(card).getByTestId("tb-nachfass")).toHaveTextContent("Hallo Regula, ich wollte kurz nachfragen");
    expect(within(card).getByRole("button", { name: "Nachfass-Satz kopieren" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "PDF herunterladen" })).not.toBeInTheDocument();

    // Das Ergebnis geht einmal ins CRM, ohne den Vornamen der Person
    await waitFor(() => expect(crm(calls)).toHaveLength(1));
    const body = crm(calls)[0].body;
    expect(body.tool).toBe("testimonial");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).startsWith("Weg: Zitat anfragen\nAnrede: Du\nKanal: WhatsApp\nVorname: ja\n")).toBe(true);
    expect(String(body.eingabe)).not.toContain("Regula");
    expect(String(body.ausgabe).startsWith("## Kurz, für WhatsApp\nHallo [Vorname]\nDanke für den Anstrich der Fassade in Gossau.")).toBe(true);
    expect(String(body.ausgabe)).not.toContain("Regula");

    // Der Stand zählt für den Pfad als erledigt und enthält die Angaben
    const saved = JSON.parse(readLocal("mt:testimonial")!);
    expect(saved).toMatchObject({ v: 1, modus: "anfrage", phase: "result", anfrage: { anrede: "du", kanal: "whatsapp", vorname: "Regula", freigabe: "vorname-ort" } });
    expect(saved.anfrage.fragen).toEqual(["lage", "ueberzeugt", "veraendert"]);
    expect(isToolDone(readLocal("mt:testimonial"))).toBe(true);
  });

  it("stellt bei E-Mail die persönliche Fassung nach vorn", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("radio", { name: "E-Mail" }));
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Nachricht" });
    const items = within(within(card).getByRole("list", { name: "Fassungen der Nachricht" })).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-testid"))).toEqual(["tb-fassung-persoenlich", "tb-fassung-kurz", "tb-fassung-foermlich"]);
    expect(items[0]).toHaveTextContent("Passt zu deinem Weg");
    expect(items[0]).toHaveTextContent("Betreff: Darf ich dich um ein Zitat bitten?");
  });

  it("schreibt in der Sie-Fassung «Guten Tag» und Sie-Fragen", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("radio", { name: "Sie" }));
    await u.click(screen.getByRole("radio", { name: "Voller Name" }));
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Nachricht" });
    const text = within(card).getByTestId("tb-fassung-kurz-text");
    expect(text).toHaveTextContent("Guten Tag Regula");
    expect(text).toHaveTextContent("Was hat Sie überzeugt, uns zu beauftragen?");
    expect(text).toHaveTextContent("Darf ich Ihr Zitat mit Ihrem vollen Namen zeigen?");
    expect(JSON.parse(readLocal("mt:testimonial")!).anfrage).toMatchObject({ anrede: "sie", freigabe: "voller-name" });
  });

  it("liefert «Im Gespräch» einen Leitfaden statt der Briefe", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("radio", { name: "Im Gespräch" }));
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Nachricht" });
    expect(within(card).queryByRole("list", { name: "Fassungen der Nachricht" })).not.toBeInTheDocument();
    const leitfaden = within(card).getByRole("region", { name: "Gesprächsleitfaden" });
    expect(within(leitfaden).getByTestId("tb-leitfaden-einstieg")).toHaveTextContent("Hallo Regula. Danke noch einmal für den Anstrich der Fassade in Gossau.");
    expect(within(within(leitfaden).getByRole("list", { name: "Leitfragen im Gespräch" })).getAllByRole("listitem")).toHaveLength(3);
    expect(within(leitfaden).getByTestId("tb-leitfaden-schluss")).toHaveTextContent("Ich lese dir vor, was ich notiert habe.");
    expect(within(leitfaden).getByRole("button", { name: "Leitfaden kopieren" })).toBeInTheDocument();
    await waitFor(() => expect(crm(calls)).toHaveLength(1));
    expect(String(crm(calls)[0].body.eingabe)).toContain("Kanal: Im Gespräch");
    expect(String(crm(calls)[0].body.ausgabe).startsWith("## Gesprächsleitfaden\nHallo [Vorname].")).toBe(true);
  });

  it("kopiert eine Fassung in die Zwischenablage", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    await screen.findByRole("region", { name: "Deine Nachricht" });
    await u.click(screen.getByRole("button", { name: "Kurze Fassung kopieren" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildAnfrage(ANFRAGE).fassungen[0].text));
    expect(screen.getAllByRole("button", { name: "Kopiert" })).toHaveLength(1);
  });

  it("fragt ohne Adresse zuerst nach ihr und zeigt bei «Später» weder Ergebnis noch CRM-Eintrag", async () => {
    removeLocal(LEAD_KEY);
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Vorname der Person")).toHaveValue("Regula");
    expect(screen.queryByRole("region", { name: "Deine Nachricht" })).not.toBeInTheDocument();
    expect(crm(calls)).toHaveLength(0);
    // Mit Adresse erscheint das Ergebnis
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    await gateEmail(u);
    expect(await screen.findByRole("region", { name: "Deine Nachricht" })).toBeInTheDocument();
    await waitFor(() => expect(crm(calls)).toHaveLength(1));
  });
});

describe("Testimonial-Baukasten im Browser: Weg 2, Referenz bauen", () => {
  it("meldet fehlende Angaben und einen fehlenden Satz in einer Liste", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Füge das Zitat der Kundschaft ein.",
      "Gib den Namen der Person an.",
      "Gib den Ort der Person an.",
      "Schreib kurz, was ihr gemacht habt.",
      "Beschreib die Ausgangslage.",
      "Beschreib, was ihr getan habt.",
    ]);
    expect(screen.getByLabelText("Zitat der Kundschaft")).toHaveFocus();
    expect(screen.getByLabelText("Zitat der Kundschaft")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await fuelleReferenz(u, { ohne: [] });
    for (const box of within(screen.getByRole("group", { name: "Diese Sätze in der Kachel zeigen" })).getAllByRole("checkbox")) await u.click(box);
    expect(screen.getByTestId("tb-saetze-zaehler")).toHaveTextContent("0 von 3 Sätzen gewählt");
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Wähle mindestens einen Satz für die Kachel."]);
    expect(screen.getByRole("checkbox", { name: ZITAT.split(". ")[0] + "." })).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it("zeigt die Sätze des Zitats als Checkboxen, alle vorgewählt, und kürzt nur ganze Sätze mit […]", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await paste(u, "Zitat der Kundschaft", ZITAT);
    const gruppe = screen.getByRole("group", { name: "Diese Sätze in der Kachel zeigen" });
    const boxen = within(gruppe).getAllByRole("checkbox");
    expect(boxen.map((b) => b.closest("label")?.textContent)).toEqual([
      "Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag.",
      MITTE,
      "Ich würde die Malerei jederzeit weiterempfehlen.",
    ]);
    expect(boxen.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByTestId("tb-saetze-zaehler")).toHaveTextContent("3 von 3 Sätzen gewählt");
    await u.click(within(gruppe).getByRole("checkbox", { name: MITTE }));
    expect(screen.getByTestId("tb-saetze-zaehler")).toHaveTextContent("2 von 3 Sätzen gewählt");
    // Kürzel im Zitat teilen nicht
    await u.clear(screen.getByLabelText("Zitat der Kundschaft"));
    await paste(u, "Zitat der Kundschaft", "Dr. Meier lobte uns. Das war Nr. 1 im Dorf!");
    expect(within(screen.getByRole("group", { name: "Diese Sätze in der Kachel zeigen" })).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("baut Kachel, Kurz-Referenz, Beitrag, Fallstudie und Prüfliste und schickt das Zitat als «Zitat der Kundschaft» einmal ins CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await fuelleReferenz(u);
    await u.click(screen.getByRole("checkbox", { name: MITTE }));
    expect(calls).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));

    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    expect(within(card).getByRole("heading", { name: "Deine Referenz" })).toHaveFocus();
    const erwartet = buildReferenz(REFERENZ);
    expect(within(card).getByTestId("tb-kachel-zitat").textContent).toBe(erwartet.kachel.zitat);
    expect(within(card).getByTestId("tb-kachel-zitat")).toHaveTextContent("noch aus wie am ersten Tag. […] Ich würde die Malerei");
    expect(within(card).getByTestId("tb-kachel-quelle")).toHaveTextContent("Regula, Gossau");
    expect(within(card).getByTestId("tb-kurz").textContent).toBe(erwartet.kurz.join(" "));
    expect(within(card).getByTestId("tb-linkedin-text").textContent).toBe(erwartet.linkedin);
    expect(within(card).getByTestId("tb-instagram-text").textContent).toBe(erwartet.instagram);
    expect(within(card).getByTestId("tb-linkedin-zaehler")).toHaveTextContent(/^\d+ Zeichen, davon \d+ vor der Faltkante$/);
    expect(within(card).getByTestId("tb-fallstudie-titel")).toHaveTextContent("Fassadenanstrich an einem Einfamilienhaus für Regula aus Gossau");
    expect(within(card).getByTestId("tb-fallstudie")).toHaveTextContent("Das Zitat im Wortlaut");
    expect(within(card).getByTestId("tb-fallstudie")).toHaveTextContent(MITTE);
    for (const name of ["Kachel kopieren", "Kurz-Referenz kopieren", "LinkedIn-Text kopieren", "Instagram-Text kopieren", "Text kopieren", "PDF herunterladen", "Word herunterladen"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
    const pruefliste = within(card).getByRole("list", { name: "Prüfliste" });
    expect(within(pruefliste).getAllByRole("listitem").map((li) => li.textContent)).toEqual(erwartet.pruefliste);
    expect(within(card).getByText("Bei Zweifeln frag eine Fachperson.")).toBeInTheDocument();
    const hinweise = within(card).getByRole("list", { name: "Hinweise zu deinen Texten" });
    expect(hinweise).toHaveTextContent("Du zeigst nur einen Teil des Zitats.");

    await waitFor(() => expect(crm(calls)).toHaveLength(1));
    const body = crm(calls)[0].body;
    expect(body.tool).toBe("testimonial");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).startsWith(`Weg: Referenz bauen\nZitat der Kundschaft: ${ZITAT}\nGezeigte Sätze: 2 von 3\nNennung: Vorname und Ort\nGenannt wird: Regula, Gossau\n`)).toBe(true);
    expect(String(body.ausgabe).startsWith("## Zitat-Kachel\n«Die Fassade sieht nach zwei Wintern")).toBe(true);

    const saved = JSON.parse(readLocal("mt:testimonial")!);
    expect(saved).toMatchObject({ v: 1, modus: "referenz", phase: "result", referenz: { nennung: "vorname-ort", name: "Regula", ohne: [MITTE] } });
    expect(isToolDone(readLocal("mt:testimonial"))).toBe(true);
  });

  it("nennt bei «Ohne Namen» nirgends einen Namen, auch nicht im CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await paste(u, "Name", "Regula Meier");
    await u.click(screen.getByRole("radio", { name: "Ohne Namen" }));
    await fuelleReferenz(u, { nennung: "anonym" });
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    expect(within(card).getByTestId("tb-kachel-quelle")).toHaveTextContent("Eine Kundin oder ein Kunde");
    expect(card.textContent).not.toContain("Regula");
    expect(card.textContent).not.toContain("Meier");
    expect(within(card).getByTestId("tb-fallstudie-titel")).toHaveTextContent("für unsere Kundschaft");
    expect(within(card).getByTestId("tb-linkedin-text").textContent).not.toContain("Danke an");
    expect(within(card).getByRole("list", { name: "Prüfliste" })).toHaveTextContent("ohne Namen erscheint");
    await waitFor(() => expect(crm(calls)).toHaveLength(1));
    const body = crm(calls)[0].body;
    expect(String(body.eingabe)).not.toContain("Regula");
    expect(String(body.eingabe)).not.toContain("Genannt wird");
    expect(String(body.ausgabe)).not.toContain("Regula");
  });

  it("weist auf Floskeln in den eigenen Texten hin, nicht im Zitat, und erinnert ohne Ergebnis an einen Beleg", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await fuelleReferenz(u, {
      zitat: "Eine ganzheitliche Lösung, ehrlich. Wir sind sehr zufrieden mit allem.",
      ohne: [],
      ausgangslage: "Ein innovatives Projekt in Gossau",
      ergebnis: "",
    });
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    const hinweise = within(card).getByRole("list", { name: "Hinweise zu deinen Texten" });
    expect(hinweise).toHaveTextContent("In «Ausgangslage» steht «innovativ»");
    expect(hinweise.textContent).not.toContain("ganzheitlich");
    expect(within(card).getByTestId("tb-kurz").textContent?.split(". ")).toHaveLength(2);
    expect(within(card).getByRole("list", { name: "Prüfliste" })).toHaveTextContent("Kannst du noch ein Ergebnis ergänzen?");
    expect(within(card).getByTestId("tb-fallstudie")).not.toHaveTextContent("Ergebnis");
  });

  it("nennt ein sehr kurzes Zitat «sehr kurz», ohne Zahl", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await fuelleReferenz(u, { zitat: "Sehr gute Arbeit, danke vielmals.", ohne: [] });
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    const hinweis = within(card).getByRole("list", { name: "Hinweise zu deinen Texten" });
    expect(hinweis).toHaveTextContent("Das Zitat ist sehr kurz.");
    expect(hinweis.textContent).not.toMatch(/\b40\b|\b280\b/);
  });

  it("fragt vor dem Download, wenn die Adresse abgelaufen ist, und lädt bei «Später» nichts", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await fuelleReferenz(u);
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    act(() => removeLocal(LEAD_KEY));
    await u.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeEnabled();
  });
});

describe("Testimonial-Baukasten im Browser: Stand", () => {
  it("zeigt nach dem Neuladen das Ergebnis wieder, ohne zweiten CRM-Eintrag", async () => {
    const calls = mockApi();
    const u = userEvent.setup({ delay: null });
    const { unmount } = render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    await screen.findByRole("region", { name: "Deine Nachricht" });
    await waitFor(() => expect(crm(calls)).toHaveLength(1));
    unmount();
    cleanup();
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Deine Nachricht" })).toBeInTheDocument();
    expect(screen.getByTestId("tb-fassung-kurz-text")).toHaveTextContent("Hallo Regula");
    expect(crm(calls)).toHaveLength(1);
  });

  it("stellt Weg 2 aus dem Speicher wieder her", async () => {
    mockApi();
    writeLocal("mt:testimonial", JSON.stringify({ v: 1, modus: "referenz", phase: "result", referenz: REFERENZ }));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Deine Referenz" });
    expect(within(card).getByTestId("tb-kachel-quelle")).toHaveTextContent("Regula, Gossau");
  });

  it("«Angaben ändern» führt zum Formular mit allen Angaben, «Neu beginnen» leert nur den gewählten Weg", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await fuelleAnfrage(u);
    await u.click(screen.getByRole("button", { name: "Nachricht erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Nachricht" });
    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Vorname der Person")).toHaveValue("Regula");
    expect(screen.getByLabelText("Vorname der Person")).toHaveFocus();
    expect(screen.getByLabelText("Was habt ihr zusammen gemacht?")).toHaveValue("den Anstrich der Fassade in Gossau");
    expect(JSON.parse(readLocal("mt:testimonial")!).phase).toBe("edit");
    // Weg 2 füllen, ergibt ein Ergebnis, «Neu beginnen» lässt Weg 1 stehen
    await waehleReferenz(u);
    await fuelleReferenz(u);
    await u.click(screen.getByRole("button", { name: "Referenz bauen" }));
    const card2 = await screen.findByRole("region", { name: "Deine Referenz" });
    await u.click(within(card2).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Zitat der Kundschaft")).toHaveValue("");
    const saved = JSON.parse(readLocal("mt:testimonial")!);
    expect(saved).toMatchObject({ modus: "referenz", phase: "edit", anfrage: { vorname: "Regula" }, referenz: { zitat: "" } });
  });

  it("speichert Eingaben und den gewählten Weg nach kurzer Zeit im Browser", async () => {
    mockApi();
    const u = userEvent.setup({ delay: null });
    render(<Tool />);
    await waehleReferenz(u);
    await paste(u, "Zitat der Kundschaft", "Das war eine gute Zusammenarbeit.");
    await waitFor(() => expect(JSON.parse(readLocal("mt:testimonial") ?? "{}")).toMatchObject({ modus: "referenz", referenz: { zitat: "Das war eine gute Zusammenarbeit." } }), {
      timeout: 2000,
    });
  });

  it("startet bei kaputten Daten mit leerem Formular", async () => {
    mockApi();
    writeLocal("mt:testimonial", "{kaputt");
    render(<Tool />);
    expect(await screen.findByLabelText("Vorname der Person")).toHaveValue("");
    cleanup();
    writeLocal("mt:testimonial", JSON.stringify({ v: 1, modus: "referenz", phase: "result", referenz: { zitat: 5 } }));
    render(<Tool />);
    expect(await screen.findByLabelText("Zitat der Kundschaft")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Deine Referenz" })).not.toBeInTheDocument();
  });

  it("übernimmt Du oder Sie aus dem Firmenprofil", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ ...PROFIL, marke: { tonalitaet: { anrede: "sie" } } }));
    render(<Tool />);
    expect(await screen.findByRole("radio", { name: "Sie" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Du" })).not.toBeChecked();
  });
});
