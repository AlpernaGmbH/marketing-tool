// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { isToolDone } from "@/lib/progress";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { FRAGEN, SAMPLE, type FrageId } from "./logic";
import Tool from "./Tool";

// Durchlauf im Browser (jsdom): Formular, Vorbefüllung aus dem Profil, Prüfung, Ergebnis nach dem E-Mail-Fenster, Ergebnis ins CRM.

const PROFIL = {
  firma: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  primaersegment: "Eigentümer älterer Einfamilienhäuser in Gossau",
  positionierung: "Wir streichen Fassaden für Familien in Gossau.",
};

function mockApi() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return { ok: true, status: 200, text: async () => "", json: async () => ({ ok: true }) };
    }),
  );
  return calls;
}

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

/** Beschriftung der Antwort mit den Punkten `p` auf die Frage `id`. */
const label = (id: FrageId, p: 0 | 1 | 2) => FRAGEN.find((f) => f.id === id)!.antworten[p].label;

async function beantworte(u: ReturnType<typeof userEvent.setup>, antworten: Partial<Record<FrageId, 0 | 1 | 2>>) {
  for (const [id, p] of Object.entries(antworten) as [FrageId, 0 | 1 | 2][]) await u.click(screen.getByLabelText(label(id, p)));
}

async function fuellBeispiel(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
}

describe("LinkedIn-Profil-Score im Browser", () => {
  it("zeigt acht Fragen als Gruppen, Firma und Branche aus dem Profil und die Zielgruppe aus dem Segment", async () => {
    mockApi();
    render(<Tool />);

    expect(await screen.findByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Branche")).toHaveValue("Malerei");
    expect(screen.getByLabelText("Für wen arbeitest du?")).toHaveValue("Eigentümer älterer Einfamilienhäuser in Gossau");
    expect(screen.getByText(/Aus deinem Firmenprofil übernommen/)).toBeInTheDocument();
    expect(screen.getByTestId("lp-positionierung")).toHaveTextContent("Wir streichen Fassaden für Familien in Gossau.");
    expect(screen.getByLabelText("Deine Headline (freiwillig)")).toHaveValue("");
    expect(screen.getByLabelText("Anfang deines Info-Texts (freiwillig)")).toHaveValue("");
    expect(screen.getByLabelText("Was erreichen deine Kundinnen und Kunden?")).toBeInTheDocument();
    expect(screen.getByLabelText("Was belegt es? (Zahl, Ort, Referenz; freiwillig)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Die Adresse meines Profils trägt meinen Namen/)).not.toBeChecked();

    for (const f of FRAGEN) {
      const gruppe = screen.getByRole("group", { name: new RegExp(f.text.replace(/[«»?]/g, ".")) });
      expect(within(gruppe).getAllByRole("radio")).toHaveLength(3);
    }
    // beste Antwort zuerst, wie in der Spec
    const headline = screen.getByRole("group", { name: /Was steht in deiner Headline/ });
    expect(within(headline).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Sie nennt, wem du wobei hilfst",
      "Nur Jobtitel und Firma",
      "Nur der Standardtext, den ich nie angepasst habe",
    ]);
    expect(screen.getByTestId("lp-fortschritt")).toHaveTextContent("0 von 8 Fragen beantwortet.");
    expect(screen.getByRole("button", { name: "Profil auswerten" })).toBeEnabled();
    // Der Text sagt offen, dass das Profil nicht gelesen wird
    expect(screen.getByText(/Das Werkzeug liest dein Profil nicht/)).toBeInTheDocument();
    expect(screen.getAllByText(/Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn/).length).toBeGreaterThan(0);
  });

  it("meldet unbeantwortete Fragen in einem role=alert, zeigt kein Ergebnis und schickt nichts", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);

    await u.click(await screen.findByRole("button", { name: "Profil auswerten" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Beantworte die acht Fragen zu deinem Profil.");

    await beantworte(u, { headline: 1, profilbild: 2, info: 0 });
    expect(screen.getByTestId("lp-fortschritt")).toHaveTextContent("3 von 8 Fragen beantwortet.");
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Es fehlt noch: Banner, Im Fokus, Erfahrung, Empfehlungen, Aktivität.");
    expect(screen.queryByRole("region", { name: "Dein LinkedIn-Profil-Score" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("wertet das Beispiel aus: Punktwert, Verbesserungen, Funde, drei Vorschläge mit Kopieren-Knöpfen und Ergebnis ins CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuellBeispiel(u);

    expect(screen.getByLabelText(label("headline", 1))).toBeChecked();
    expect(screen.getByLabelText("Deine Headline (freiwillig)")).toHaveValue("Malermeister bei Malerei Keller");
    expect(screen.getByLabelText("Für wen arbeitest du?")).toHaveValue("Familien in Gossau");
    expect(screen.getByTestId("lp-fortschritt")).toHaveTextContent("8 von 8 Fragen beantwortet.");
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));

    const card = await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
    expect(screen.getByRole("heading", { name: "Dein LinkedIn-Profil-Score" })).toHaveFocus();
    const meter = within(card).getByRole("meter", { name: "LinkedIn-Profil-Score" });
    expect(meter).toHaveAttribute("aria-valuenow", "42");
    expect(meter).toHaveAttribute("aria-valuetext", "42 von 100, Stufe Solide Basis");
    expect(within(card).getByTestId("lp-score")).toHaveTextContent("42von 100Solide Basis");
    expect(within(card).getByText(/Das Werkzeug hat dein LinkedIn-Profil nicht gelesen/)).toBeInTheDocument();

    const table = within(card).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Frage", "Antwort", "Punkte", "Gewicht"]);
    expect(within(table).getAllByRole("row")).toHaveLength(9);
    expect(within(table).getByRole("row", { name: /Aktivität Gar nicht 0 von 2 14/ })).toBeInTheDocument();

    expect(within(card).getByText(/^Aktivität \(14 Punkte offen\)\. Was fehlt:/)).toBeInTheDocument();
    expect(within(card).getByText(/^Headline \(10 Punkte offen\)\./)).toBeInTheDocument();
    expect(within(card).getByText(/^Headline: Nur ein Titel\./)).toBeInTheDocument();
    expect(within(card).getByText(/^Info-Text: Beginnt mit «Ich bin»\./)).toBeInTheDocument();
    expect(within(card).getByText(/^Profil-Adresse\./)).toBeInTheDocument();
    expect(within(card).getByText(/Geprüft wurde: Headline und Info-Text\. 3 Funde\./)).toBeInTheDocument();

    const vorschlaege = within(card).getByRole("list", { name: "Headline-Vorschläge" });
    const items = within(vorschlaege).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Ich helfe Familien in Gossau bei Fassadenanstrich und Farbberatung – Referenzen in Gossau, Flawil und Herisau");
    expect(items[1]).toHaveTextContent("Fassadenanstrich und Farbberatung für Familien in Gossau: Malerei Keller");
    for (const [i, name] of ["Vorschlag 1 kopieren", "Vorschlag 2 kopieren", "Vorschlag 3 kopieren"].entries()) {
      expect(within(items[i]).getByRole("button", { name })).toBeInTheDocument();
    }
    await u.click(within(items[1]).getByRole("button", { name: "Vorschlag 2 kopieren" }));
    expect(await navigator.clipboard.readText()).toBe("Fassadenanstrich und Farbberatung für Familien in Gossau: Malerei Keller");
    expect(await within(items[1]).findByRole("button", { name: "Kopiert" })).toBeInTheDocument();

    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expect(within(card).getByText("Hinweise")).toBeInTheDocument();

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("linkedin-profil");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).split("\n").slice(0, 3)).toEqual(["Betrieb: Malerei Keller", "Branche: Malerei", "Headline: Nur Jobtitel und Firma (1 von 2)"]);
    expect(String(body.eingabe)).toContain("Eingefügte Headline: Malermeister bei Malerei Keller");
    expect(String(body.eingabe)).not.toMatch(/[{}]/);
    expect(String(body.ausgabe)).toMatch(/^# LinkedIn-Profil-Score\n\n_Punktwert 42 von 100, Stufe «Solide Basis»_/);
    expect(String(body.ausgabe)).toContain("| Aktivität | Gar nicht | 0 von 2 | 14 |");
    expect(String(body.ausgabe)).toContain("1. Ich helfe Familien in Gossau bei Fassadenanstrich und Farbberatung");
    expect(String(body.eingabe)).not.toContain("positionierung");
    expect(String(body.ausgabe)).not.toContain("Wir streichen Fassaden für Familien in Gossau");
  });

  it("speichert das Ergebnis unter mt:linkedin-profil, zeigt es nach dem Neuladen wieder und schickt es nicht ein zweites Mal", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await fuellBeispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));
    await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });

    const stored = JSON.parse(readLocal("mt:linkedin-profil") ?? "null");
    expect(stored.v).toBe(1);
    expect(stored.phase).toBe("result");
    expect(stored.antworten).toEqual(SAMPLE.antworten);
    expect(stored.firma).toBe("Malerei Keller");
    expect(stored.output).toEqual({ score: 42, stufe: "Solide Basis" });
    expect(isToolDone(readLocal("mt:linkedin-profil"))).toBe(true);

    first.unmount();
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
    expect(within(card).getByRole("meter")).toHaveAttribute("aria-valuenow", "42");
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1);

    // Angaben ändern: zurück ins Formular mit den gespeicherten Werten; das Ergebnis zählt dann nicht mehr als erledigt
    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Deine Headline (freiwillig)")).toHaveValue("Malermeister bei Malerei Keller");
    expect(screen.getByLabelText(label("aktivitaet", 0))).toBeChecked();
    expect(screen.getByLabelText("Für wen arbeitest du?")).toHaveValue("Familien in Gossau");
    expect(JSON.parse(readLocal("mt:linkedin-profil") ?? "null").phase).toBe("edit");
    expect(isToolDone(readLocal("mt:linkedin-profil"))).toBe(false);
  });

  it("zeigt ohne Zielgruppe und Ergebnis einen Hinweis statt Vorschlägen", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    expect(await screen.findByLabelText("Für wen arbeitest du?")).toHaveValue("");
    await beantworte(u, { headline: 2, profilbild: 2, banner: 2, info: 2, fokus: 2, erfahrung: 2, empfehlungen: 2, aktivitaet: 2 });
    await u.click(screen.getByLabelText(/Die Adresse meines Profils trägt meinen Namen/));
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));

    const card = await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
    expect(within(card).getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(within(card).getByText("Stark")).toBeInTheDocument();
    expect(within(card).queryByRole("list", { name: "Headline-Vorschläge" })).not.toBeInTheDocument();
    expect(within(card).getByText(/Für Headline-Vorschläge fehlen Zielgruppe und Ergebnis\. Wähle «Angaben ändern»/)).toBeInTheDocument();
    expect(within(card).getByText(/Du hast bei allen acht Fragen die volle Punktzahl/)).toBeInTheDocument();
    expect(within(card).queryByText(/^Profil-Adresse\./)).not.toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    expect(String(calls.find((c) => c.path === "/api/result")!.body.eingabe)).toContain("Profil-Adresse mit Namen: ja");
  });

  it("fragt vor dem ersten Ergebnis nach der E-Mail-Adresse und lässt das Formular stehen, wenn das Fenster geschlossen wird", async () => {
    clearAllLocal();
    writeLocal(PROFILE_KEY, JSON.stringify(PROFIL));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuellBeispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Dein LinkedIn-Profil-Score" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Deine Headline (freiwillig)")).toHaveValue("Malermeister bei Malerei Keller");
    expect(screen.getByLabelText(label("fokus", 0))).toBeChecked();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("hält Antworten und Texte als Zwischenstand fest, bevor ausgewertet wird", async () => {
    mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await beantworte(u, { headline: 2, aktivitaet: 1 });
    await u.type(await screen.findByLabelText("Deine Headline (freiwillig)"), "Ich helfe KMU");
    await waitFor(() => expect(JSON.parse(readLocal("mt:linkedin-profil") ?? "null")?.headline).toBe("Ich helfe KMU"), { timeout: 3000 });
    const stand = JSON.parse(readLocal("mt:linkedin-profil") ?? "null");
    expect(stand.phase).toBe("edit");
    expect(stand.antworten).toEqual({ headline: 2, aktivitaet: 1 });
    first.unmount();

    render(<Tool />);
    expect(await screen.findByLabelText("Deine Headline (freiwillig)")).toHaveValue("Ich helfe KMU");
    expect(screen.getByLabelText(label("headline", 2))).toBeChecked();
    expect(screen.getByLabelText(label("aktivitaet", 1))).toBeChecked();
    expect(screen.getByTestId("lp-fortschritt")).toHaveTextContent("2 von 8 Fragen beantwortet.");
  });

  it("«Neu beginnen» löscht den Stand und setzt die Zielgruppe wieder aus dem Profil ein", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuellBeispiel(u);
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));
    await u.click(await screen.findByRole("button", { name: "Neu beginnen" }));

    expect(await screen.findByLabelText("Für wen arbeitest du?")).toHaveValue("Eigentümer älterer Einfamilienhäuser in Gossau");
    expect(screen.getByTestId("lp-fortschritt")).toHaveTextContent("0 von 8 Fragen beantwortet.");
    expect(screen.getByLabelText("Deine Headline (freiwillig)")).toHaveValue("");
    expect(isToolDone(readLocal("mt:linkedin-profil"))).toBe(false);
  });

  it("zählt Zeichen der Headline mit dem Richtwert und meldet eine zu lange Headline im Ergebnis", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fuellBeispiel(u);
    const feld = screen.getByLabelText("Deine Headline (freiwillig)");
    await u.clear(feld);
    await u.click(feld);
    const lang = `Ich helfe KMU bei Anfragen ${"x".repeat(220)}`;
    expect(lang).toHaveLength(247);
    await u.paste(lang);
    expect(screen.getByText(/247 Zeichen, Richtwert 220/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));
    const card = await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
    expect(within(card).getByText(/^Headline: Zu lang\. Was fehlt: Die Headline hat 247 Zeichen\. Der Richtwert liegt bei 220\./)).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
  });

  it("passt Beschriftung und Beispiele für einen Verein an und lässt die Zielgruppe leer, wenn das Profil keine hat", async () => {
    clearAllLocal();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein", firma: "FC Trogen" }));
    mockApi();
    const { container } = render(<Tool />);
    expect(await screen.findByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    expect(screen.getByLabelText("Tätigkeit des Vereins")).toHaveValue("");
    const zielgruppe = screen.getByLabelText("Für wen arbeitest du?");
    expect(zielgruppe).toHaveValue("");
    expect(zielgruppe).toHaveAttribute("placeholder", "Familien in Trogen");
    expect(screen.queryByTestId("lp-positionierung")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Was erreichen deine Kundinnen und Kunden?")).toHaveAttribute("placeholder", "Einstieg in den Fussball");
    for (const text of [container.textContent ?? "", "Familien in Trogen", "Einstieg in den Fussball", "Training für alle Altersstufen"]) {
      expect(brandHits(text.replace(/([a-zäöü.])([A-ZÄÖÜ])/g, "$1 $2"))).toEqual([]);
      expect(styleIssues(text)).toEqual([]);
    }
  });

  it("Formular und Ergebnis halten die Sperrliste und die Stilregeln ein", async () => {
    mockApi();
    const u = userEvent.setup();
    const { container } = render(<Tool />);
    await fuellBeispiel(u);
    const form = container.textContent ?? "";
    await u.click(screen.getByRole("button", { name: "Profil auswerten" }));
    await screen.findByRole("region", { name: "Dein LinkedIn-Profil-Score" });
    const result = container.textContent ?? "";
    for (const text of [form, result]) {
      expect(brandHits(text.replace(/([a-zäöü.])([A-ZÄÖÜ])/g, "$1 $2"))).toEqual([]);
      expect(styleIssues(text)).toEqual([]);
      expect(text).not.toMatch(/\bTools?\b/);
    }
  });
});
