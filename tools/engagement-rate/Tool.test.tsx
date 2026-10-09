// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

// Durchlauf im Browser (jsdom): Formular, Prüfung, Ergebnis nach dem E-Mail-Fenster, Diagramm, Ergebnis ins CRM.

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
  writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" }));
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

describe("Engagement-Rate-Rechner im Browser", () => {
  // Der Standard ist seit Charge B1 der Kurzmodus; diese Tests prüfen den Weg «Beiträge einzeln» und starten darum mit diesem Stand.
  beforeEach(() => {
    writeLocal("mt:engagement-rate", JSON.stringify({ v: 1, phase: "edit", plattform: "instagram", follower: "", modus: "einzeln", posts: [] }));
  });

  it("zeigt Plattform, Follower und drei leere Beiträge mit Labels, die Nummer und Feld nennen", async () => {
    mockApi();
    render(<Tool />);

    expect(await screen.findByLabelText("Plattform")).toHaveValue("instagram");
    expect(within(screen.getByLabelText("Plattform")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Instagram", "LinkedIn", "Facebook", "TikTok"]);
    expect(screen.getByLabelText("Follower (oder Abonnenten) am Tag der Auswertung")).toHaveAttribute("type", "number");
    expect(screen.getByText(/«Insights»/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Beiträge" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    for (const label of ["Beitrag 1", "Beitrag 2: Kommentare", "Beitrag 3: Gespeichert", "Beitrag 3: Reichweite", "Beitrag 1: Likes", "Beitrag 2: Teilen"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByRole("button", { name: "Rate berechnen" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Beitrag 1 entfernen" })).toBeEnabled();
    expect(screen.getByTestId("er-anzahl")).toHaveTextContent("3 von 10 Beiträgen.");
  });

  it("die Plattform bestimmt die Felder: LinkedIn kennt Reaktionen, Reposts und Impressionen, kein «Gespeichert»", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Plattform"), "linkedin");

    expect(screen.getByLabelText("Beitrag 1: Reaktionen")).toBeInTheDocument();
    expect(screen.getByLabelText("Beitrag 1: Reposts")).toBeInTheDocument();
    expect(screen.getByLabelText("Beitrag 1: Impressionen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Beitrag 1: Gespeichert")).not.toBeInTheDocument();
    expect(screen.getByText(/«Beitragsanalysen»/)).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Plattform"), "tiktok");
    expect(screen.getByLabelText("Beitrag 1: Aufrufe")).toBeInTheDocument();
    expect(screen.getByText(/«Analysen»/)).toBeInTheDocument();
  });

  it("Beiträge hinzufügen bis zehn, entfernen bis einer; die Nummern rücken nach", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    const add = await screen.findByRole("button", { name: "Beitrag hinzufügen" });
    for (let i = 0; i < 7; i++) await u.click(add);
    expect(within(screen.getByRole("list", { name: "Beiträge" })).getAllByRole("listitem")).toHaveLength(10);
    expect(add).toBeDisabled();
    expect(screen.getByTestId("er-anzahl")).toHaveTextContent("Beitrag 10 hinzugefügt. 10 von 10 Beiträgen.");
    expect(screen.getByLabelText("Beitrag 10")).toBeInTheDocument();

    await u.type(screen.getByLabelText("Beitrag 3"), "Dritter");
    await u.click(screen.getByRole("button", { name: "Beitrag 2 entfernen" }));
    expect(screen.queryByLabelText("Beitrag 10")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Beitrag 2")).toHaveValue("Dritter");
    expect(add).toBeEnabled();
    expect(add).toHaveFocus();

    for (let i = 0; i < 8; i++) await u.click(screen.getByRole("button", { name: "Beitrag 1 entfernen" }));
    expect(within(screen.getByRole("list", { name: "Beiträge" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Beitrag 1 entfernen" })).toBeDisabled();
  });

  it("meldet fehlende Follower und fehlende Zahlen in einem role=alert und zeigt kein Ergebnis", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Rate berechnen" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Trage ein, wie viele Follower du am Tag der Auswertung hast.");
    expect(alert).toHaveTextContent("Trage für mindestens einen Beitrag Zahlen ein.");
    expect(screen.queryByRole("region", { name: "Deine Engagement-Rate" })).not.toBeInTheDocument();

    await u.type(screen.getByLabelText("Follower (oder Abonnenten) am Tag der Auswertung"), "1240");
    await u.type(screen.getByLabelText("Beitrag 1: Likes"), "1.5");
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Beitrag 1, Likes: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein.");
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("rechnet das Beispiel: Diagramm, Tabelle, Schnitt und Ergebnis ins CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
    expect(screen.getByLabelText("Beitrag 3")).toHaveValue("Vorher nachher Treppenhaus");
    expect(screen.getByLabelText("Beitrag 3: Gespeichert")).toHaveValue(24);
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));

    const card = await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    const chart = within(card).getByRole("img", { name: /^Balkendiagramm der Rate auf Follower je Beitrag auf Instagram\. Schnitt 5,6 %\./ });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    expect(chart.querySelectorAll("rect[data-nr]")).toHaveLength(5);
    expect(chart.querySelectorAll("line[data-schnitt]")).toHaveLength(1);
    expect(within(card).getByText(/der goldene Balken mit dem Rand ist der beste Beitrag/)).toBeInTheDocument();

    const table = within(card).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Beitrag", "Interaktionen", "Rate auf Follower", "Rate auf Reichweite"]);
    expect(within(table).getByRole("row", { name: /Beitrag 3: Vorher nachher Treppenhaus 123 9,92 % 5,32 %/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /^Schnitt 69,4 5,6 % 4,79 %$/ })).toBeInTheDocument();
    // das Diagramm steht über der Tabelle, die Tabelle ist seine Textalternative
    expect(chart.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByText(/Summe durch Summe: 347 Interaktionen bei 7'020 Reichweite ergeben 4,94 %/)).toBeInTheDocument();
    expect(within(card).getByText(/Bester Beitrag: Beitrag 3/)).toBeInTheDocument();
    expect(within(card).getByText(/Schwächster Beitrag: Beitrag 4/)).toBeInTheDocument();
    expect(within(card).getByText(/Der Durchschnitt internationaler Marken lag 2025 bei 0,48 % \(Socialinsider, nicht Schweiz\)/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "CSV herunterladen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deine Engagement-Rate" })).toHaveFocus();

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("engagement-rate");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).split("\n").slice(0, 3)).toEqual([
      "Plattform: Instagram",
      "Follower: 1'240",
      "Beitrag 1 «Fassade Gossau»: Likes 62, Kommentare 8, Teilen 5, Gespeichert 11, Reichweite 1'520",
    ]);
    expect(String(body.ausgabe)).toMatch(/^# Engagement-Rate\n/);
    expect(String(body.ausgabe)).toContain("| Schnitt | 69,4 | 5,6 % | 4,79 % |");
    expect(String(body.ausgabe)).toContain("- **Firma:** Malerei Keller");
  });

  it("speichert das Ergebnis unter mt:engagement-rate, zeigt es nach dem Neuladen wieder und schickt es nicht ein zweites Mal", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    await screen.findByRole("region", { name: "Deine Engagement-Rate" });

    const stored = JSON.parse(readLocal("mt:engagement-rate") ?? "null");
    expect(stored.v).toBe(1);
    expect(stored.phase).toBe("result");
    expect(stored.plattform).toBe("instagram");
    expect(stored.follower).toBe("1240");
    expect(stored.posts).toHaveLength(5);
    expect(stored.output.posts).toHaveLength(5);

    first.unmount();
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Deine Engagement-Rate" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1);

    // Angaben ändern führt zurück ins Formular mit den gespeicherten Werten; das Ergebnis zählt dann nicht mehr als erledigt
    await u.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Follower (oder Abonnenten) am Tag der Auswertung")).toHaveValue(1240);
    expect(JSON.parse(readLocal("mt:engagement-rate") ?? "null").phase).toBe("edit");
  });

  it("fragt vor dem ersten Ergebnis nach der E-Mail-Adresse und lässt das Formular stehen, wenn das Fenster geschlossen wird", async () => {
    clearAllLocal();
    writeLocal(PROFILE_KEY, JSON.stringify({ organisationstyp: "verein", firma: "FC Trogen" }));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    expect(await screen.findByLabelText("Name des Vereins")).toHaveValue("FC Trogen");
    await u.click(screen.getByRole("button", { name: "Beispiel einfügen" }));
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Deine Engagement-Rate" })).not.toBeInTheDocument();
    // Ohne gespeicherten Stand beginnt das Werkzeug im Kurzmodus; das Beispiel füllt die Summen und bleibt nach «Später» stehen.
    expect(screen.getByLabelText("Zahl der Beiträge")).toHaveValue(5);
    expect(screen.getByLabelText("Likes, Summe")).toHaveValue(245);
  });

  it("Formular und Ergebnis halten die Sperrliste und die Stilregeln ein", async () => {
    mockApi();
    const u = userEvent.setup();
    const { container } = render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
    const form = container.textContent ?? "";
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    const result = container.textContent ?? "";
    for (const text of [form, result]) {
      expect(brandHits(text.replace(/([a-zäöü.])([A-ZÄÖÜ])/g, "$1 $2"))).toEqual([]);
      expect(styleIssues(text)).toEqual([]);
      expect(text).not.toMatch(/\bTools?\b/);
    }
  });

  it("hält Zwischenstand in den Feldern fest, bevor gerechnet wird", async () => {
    mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await u.type(await screen.findByLabelText("Follower (oder Abonnenten) am Tag der Auswertung"), "800");
    await u.type(screen.getByLabelText("Beitrag 1: Likes"), "40");
    await waitFor(() => expect(JSON.parse(readLocal("mt:engagement-rate") ?? "null")?.follower).toBe("800"), { timeout: 3000 });
    first.unmount();

    render(<Tool />);
    expect(await screen.findByLabelText("Follower (oder Abonnenten) am Tag der Auswertung")).toHaveValue(800);
    expect(screen.getByLabelText("Beitrag 1: Likes")).toHaveValue(40);
  });
});

describe("Engagement-Rate-Rechner im Browser: Kurzmodus", () => {
  const fillKurz = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.type(screen.getByLabelText("Follower (oder Abonnenten) am Tag der Auswertung"), "1240");
    await u.type(screen.getByLabelText("Zahl der Beiträge"), "5");
    await u.type(screen.getByLabelText("Likes, Summe"), "245");
    await u.type(screen.getByLabelText("Kommentare, Summe"), "30");
    await u.type(screen.getByLabelText("Teilen, Summe"), "24");
    await u.type(screen.getByLabelText("Gespeichert, Summe"), "48");
    await u.type(screen.getByLabelText("Reichweite, Summe"), "7020");
  };

  it("beginnt im Kurzmodus: sieben Zahlenfelder statt Beitragszeilen, die Moduswahl steht davor", async () => {
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Plattform");
    const modus = screen.getByRole("radiogroup", { name: "Eingabe" });
    expect(within(modus).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0].textContent)).toEqual(["Summen über mehrere Beiträge", "Beiträge einzeln"]);
    expect(within(modus).getByRole("radio", { name: "Summen über mehrere Beiträge" })).toBeChecked();
    expect(screen.queryByRole("list", { name: "Beiträge" })).not.toBeInTheDocument();
    for (const label of ["Zahl der Beiträge", "Likes, Summe", "Kommentare, Summe", "Teilen, Summe", "Gespeichert, Summe", "Reichweite, Summe"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "number");
    }
    expect(screen.getByRole("button", { name: "Beispiel einfügen" })).toBeEnabled();
  });

  it("LinkedIn zeigt Reaktionen, Reposts und Impressionen, kein «Gespeichert»", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Plattform"), "linkedin");
    expect(screen.getByLabelText("Reaktionen, Summe")).toBeInTheDocument();
    expect(screen.getByLabelText("Reposts, Summe")).toBeInTheDocument();
    expect(screen.getByLabelText("Impressionen, Summe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gespeichert, Summe")).not.toBeInTheDocument();
  });

  it("meldet fehlende Zahlen der Reihe nach und zeigt kein Ergebnis", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Rate berechnen" }));
    const alert = document.getElementById("er-error")!;
    expect(alert).toHaveTextContent("Trage ein, wie viele Follower du am Tag der Auswertung hast.");
    expect(alert).toHaveTextContent("Trage ein, über wie viele Beiträge du die Summen bildest.");
    expect(alert).toHaveTextContent("Trage mindestens eine Summe ein, zum Beispiel die Likes.");
    expect(screen.queryByRole("region", { name: "Deine Engagement-Rate" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("«Beispiel einfügen» füllt die Summen der Malerei Keller; das Ergebnis zeigt die Kennzahlen ohne Diagramm, den Vergleich und geht ins CRM", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
    expect(screen.getByLabelText("Zahl der Beiträge")).toHaveValue(5);
    expect(screen.getByLabelText("Reichweite, Summe")).toHaveValue(7020);
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));

    const card = await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    expect(within(card).queryByRole("img", { name: /^Balkendiagramm/ })).not.toBeInTheDocument();
    // Kennzahlen und Tabelle nennen die 69,4 beide (Interaktionen je Beitrag, Interaktionen insgesamt je Beitrag)
    expect(within(card).getAllByText("69,4").length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText("5,6 %")).toBeInTheDocument(); // Rate auf Follower
    expect(within(card).getByText("4,94 %")).toBeInTheDocument(); // Rate auf Reichweite
    const table = within(card).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Zahl", "Summe über 5 Beiträge", "je Beitrag"]);
    expect(within(table).getByRole("row", { name: /^Likes 245 49$/ })).toBeInTheDocument();
    expect(within(card).getByText(/Der Durchschnitt internationaler Marken lag 2025 bei 0,48 % \(Socialinsider, nicht Schweiz\)/)).toBeInTheDocument();
    expect(within(card).getByText(/Du hast 4,44 % \(Likes und Kommentare, geteilt durch Follower, je Beitrag im Schnitt\)/)).toBeInTheDocument();
    expect(within(card).queryByText(/Bester Beitrag/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deine Engagement-Rate" })).toHaveFocus();

    const results = calls.filter((c) => c.path === "/api/result");
    expect(results).toHaveLength(1);
    const body = results[0].body as { eingabe: string; ausgabe: string };
    expect(body.eingabe).toContain("Summen über 5 Beiträge: Likes 245, Kommentare 30, Teilen 24, Gespeichert 48, Reichweite 7'020");
    expect(body.ausgabe).toContain("Rate auf Follower");
    expect(body.ausgabe).toContain("5,6 %");
  });

  it("LinkedIn: Ergebnis ohne Vergleichswert, mit dem Hinweis zu den Branchenwerten", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Plattform"), "linkedin");
    await u.type(screen.getByLabelText("Follower (oder Abonnenten) am Tag der Auswertung"), "800");
    await u.type(screen.getByLabelText("Zahl der Beiträge"), "4");
    await u.type(screen.getByLabelText("Reaktionen, Summe"), "120");
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    const card = await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    expect(within(card).getByText("Keine Einordnung gegen Branchenwerte, weil uns eine belastbare Quelle fehlt.")).toBeInTheDocument();
    expect(within(card).queryByText(/Durchschnitt internationaler Marken/)).not.toBeInTheDocument();
  });

  it("der Wechsel zwischen den Wegen behält die Zahlen beider; das Ergebnis bleibt nach dem Neuladen", async () => {
    mockApi();
    const u = userEvent.setup();
    const { unmount } = render(<Tool />);
    await screen.findByLabelText("Plattform");
    await fillKurz(u);
    await u.click(screen.getByRole("radio", { name: "Beiträge einzeln" }));
    expect(screen.getByRole("list", { name: "Beiträge" })).toBeInTheDocument();
    expect(screen.getByLabelText("Follower (oder Abonnenten) am Tag der Auswertung")).toHaveValue(1240); // gilt für beide Wege
    await u.click(screen.getByRole("radio", { name: "Summen über mehrere Beiträge" }));
    expect(screen.getByLabelText("Likes, Summe")).toHaveValue(245);
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    await screen.findByRole("region", { name: "Deine Engagement-Rate" });

    unmount();
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    expect(within(card).getAllByText("69,4").length).toBeGreaterThanOrEqual(1);
    const stored = JSON.parse(readLocal("mt:engagement-rate") ?? "null");
    expect(stored.modus).toBe("kurz");
    expect(stored.kurz.a).toBe("245");
    expect(stored.output.modus).toBe("kurz");
  });

  it("«Angaben ändern» und «Neu beginnen» führen zurück in den Kurzmodus mit den Zahlen bzw. leer", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beispiel einfügen" }));
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    await u.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Likes, Summe")).toHaveValue(245);
    await u.click(screen.getByRole("button", { name: "Rate berechnen" }));
    await screen.findByRole("region", { name: "Deine Engagement-Rate" });
    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Likes, Summe")).toHaveValue(null);
    expect(screen.getByRole("radio", { name: "Summen über mehrere Beiträge" })).toBeChecked();
  });
});
