// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { BEISPIEL_INPUT, BEISPIEL_KONTAKT, BEISPIEL_OUTPUT } from "./beispiel";
import Tool from "./Tool";

// Der Ablauf im Browser gegen einen Stub von /api/generate und /api/result: Formular, Fenster entfällt (Adresse bekannt),
// Ergebnis mit Prüfung, Checkliste und Empfängern, CRM ohne Kontaktdaten, Stand nach dem Neuladen.

const PROFIL = {
  firma: "Malerei Keller",
  ort: "Gossau",
  kanton: "SG",
  website: "malerei-keller.ch",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
};

type Call = { path: string; body: Record<string, unknown> };

function mockApi(generate: { status: number; body: unknown } = { status: 200, body: { ok: true, output: BEISPIEL_OUTPUT } }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/generate") return json(generate.body, generate.status);
      if (path === "/api/result" || path === "/api/lead") return json({ ok: true });
      return json({}, 404);
    }),
  );
  return { calls, of: (p: string) => calls.filter((c) => c.path === p) };
}

async function fillForm(u: ReturnType<typeof userEvent.setup>) {
  await u.selectOptions(screen.getByLabelText("Anlass"), "jubilaeum");
  const fill = async (label: string, text: string) => {
    const field = screen.getByLabelText(label);
    await u.clear(field);
    await u.click(field);
    await u.paste(text);
  };
  await fill("Was ist passiert oder passiert?", BEISPIEL_INPUT.was);
  await fill("Wann?", BEISPIEL_INPUT.wann);
  await fill("Wo?", BEISPIEL_INPUT.wo);
  await fill("Wer ist beteiligt?", BEISPIEL_INPUT.wer);
  await fill("Warum ist das für die Region von Bedeutung?", BEISPIEL_INPUT.warum);
  await fill("Zitat einer Person (freiwillig)", BEISPIEL_INPUT.zitat);
  await fill("Name und Funktion", BEISPIEL_INPUT.zitatVon);
  await fill("Bildangebot (freiwillig)", BEISPIEL_INPUT.bild);
  await fill("Name der Kontaktperson", BEISPIEL_KONTAKT.name);
  await fill("Telefon der Kontaktperson (freiwillig)", BEISPIEL_KONTAKT.telefon);
  await fill("E-Mail der Kontaktperson (freiwillig)", BEISPIEL_KONTAKT.email);
  await fill("Deine Empfänger (freiwillig)", "Appenzeller Zeitung, Redaktion Gossau\nGemeindeblatt Gossau");
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

describe("Medienmitteilung: Ablauf im Browser", () => {
  it("zeigt das Formular mit Ort als Vorschlag für «Wo?» und meldet fehlende Angaben, ohne den Server zu fragen", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    expect(await screen.findByRole("button", { name: "Medienmitteilung erstellen" })).toBeEnabled();
    expect(screen.getByLabelText("Wo?")).toHaveValue("Gossau");
    expect(screen.getByTestId("positionierung-hinweis")).toHaveTextContent("Der Malerbetrieb in Gossau, der Termine hält.");
    for (const name of ["Anlass", "Was ist passiert oder passiert?", "Wann?", "Wer ist beteiligt?", "Zitat einer Person (freiwillig)", "Name der Kontaktperson", "Deine Empfänger (freiwillig)"]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    const options = within(screen.getByLabelText("Anlass")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Bitte wählen", "Eröffnung", "Jubiläum", "Auszeichnung", "Anlass oder Veranstaltung", "Neues Angebot", "Personelles", "Anderes"]);
    await u.click(screen.getByRole("button", { name: "Medienmitteilung erstellen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wähle den Anlass.");
    expect(m.of("/api/generate")).toHaveLength(0);
  });

  it("erstellt die Mitteilung, prüft sie und schickt ins CRM nichts von den Kontaktdaten", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByRole("button", { name: "Medienmitteilung erstellen" });
    await fillForm(u);
    await u.click(screen.getByRole("button", { name: "Medienmitteilung erstellen" }));

    const card = await screen.findByRole("region", { name: "Deine Medienmitteilung" });
    expect(screen.getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");

    // Die KI bekommt die Angaben, aber weder Kontaktdaten noch Empfänger.
    const gen = m.of("/api/generate");
    expect(gen).toHaveLength(1);
    expect(gen[0].body).toEqual({ tool: "medienmitteilung", input: BEISPIEL_INPUT });
    expect(JSON.stringify(gen[0].body)).not.toContain(BEISPIEL_KONTAKT.telefon);
    expect(JSON.stringify(gen[0].body)).not.toContain("Appenzeller Zeitung");

    // Das CRM bekommt lesbare Angaben und die Mitteilung, ebenfalls ohne Kontaktdaten.
    await waitFor(() => expect(m.of("/api/result")).toHaveLength(1));
    const crm = m.of("/api/result")[0].body as { tool: string; eingabe: string; ausgabe: string };
    expect(crm.tool).toBe("medienmitteilung");
    expect(crm.eingabe.startsWith("Betrieb: Malerei Keller\nOrt: Gossau, St. Gallen\nAnlass: Jubiläum\nWas: Die Malerei Keller feiert")).toBe(true);
    expect(crm.ausgabe.startsWith("# Medienmitteilung\n")).toBe(true);
    expect(crm.ausgabe).toContain("Malerei Keller feiert 40 Jahre");
    for (const geheim of [BEISPIEL_KONTAKT.telefon, BEISPIEL_KONTAKT.email, "Appenzeller Zeitung"]) {
      expect(crm.eingabe).not.toContain(geheim);
      expect(crm.ausgabe).not.toContain(geheim);
    }

    // Prüfung: sieben Regeln, alle erfüllt.
    const pruefung = within(card).getByRole("list", { name: "Prüfung" });
    const punkte = within(pruefung).getAllByRole("listitem");
    expect(punkte).toHaveLength(7);
    for (const p of punkte) expect(p).toHaveAttribute("data-ok", "true");
    expect(within(card).getByTestId("pruefung-lead")).toHaveTextContent("Der Lead hat 30 Wörter.");
    expect(within(card).getByText("Lead höchstens 40 Wörter, Gesamtlänge 250 bis 400 Wörter: Richtwert von Alperna, keine Statistik.")).toBeInTheDocument();

    // Mitteilung mit Zitat, Boilerplate und Kontakt.
    const mitteilung = within(card).getByTestId("mitteilung");
    expect(mitteilung).toHaveTextContent("Medienmitteilung, Gossau,");
    expect(mitteilung).toHaveTextContent("sagt Anna Keller, Inhaberin.");
    expect(mitteilung).toHaveTextContent("Über Malerei Keller");
    expect(mitteilung).toHaveTextContent("Kontakt für Rückfragen");
    expect(mitteilung).toHaveTextContent(BEISPIEL_KONTAKT.telefon);

    // Checkliste mit den Empfängern, Anleitung «Empfänger finden», Knöpfe.
    const checkliste = within(card).getByRole("list", { name: "Versand-Checkliste" });
    const eintraege = within(checkliste).getAllByRole("listitem").map((li) => li.textContent);
    expect(eintraege).toContain("Senden an: Appenzeller Zeitung, Redaktion Gossau");
    expect(eintraege).toContain("Senden an: Gemeindeblatt Gossau");
    expect(eintraege).toContain("Betreffzeile: «Medienmitteilung: Malerei Keller feiert 40 Jahre mit einem Tag der offenen Tür»");
    expect(within(card).getByRole("list", { name: "Empfänger finden" })).toHaveTextContent("«Gossau Anzeiger Redaktion»");
    for (const name of ["Text kopieren", "PDF herunterladen", "Word herunterladen", "Als E-Mail-Text kopieren", "Angaben ändern", "Neu beginnen"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }

    // Stand im Browser: Ergebnis (Pfad-Fortschritt), Kontakt und Empfänger nur dort.
    const stand = JSON.parse(readLocal("mt:medienmitteilung") ?? "null") as Record<string, unknown>;
    expect(stand.v).toBe(1);
    expect(stand.output).toEqual(BEISPIEL_OUTPUT);
    expect(stand.kontakt).toEqual(BEISPIEL_KONTAKT);
    expect(stand.empfaenger).toEqual(["Appenzeller Zeitung, Redaktion Gossau", "Gemeindeblatt Gossau"]);
  });

  it("zeigt nach dem Neuladen das Ergebnis ohne neue Anfrage, und «Angaben ändern» füllt das Formular", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await screen.findByRole("button", { name: "Medienmitteilung erstellen" });
    await fillForm(u);
    await u.click(screen.getByRole("button", { name: "Medienmitteilung erstellen" }));
    await screen.findByRole("region", { name: "Deine Medienmitteilung" });
    first.unmount();

    const calls = m.calls.length;
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Deine Medienmitteilung" });
    expect(m.calls.length).toBe(calls);
    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(screen.getByLabelText("Wann?")).toHaveValue(BEISPIEL_INPUT.wann);
    expect(screen.getByLabelText("Name der Kontaktperson")).toHaveValue(BEISPIEL_KONTAKT.name);
    expect(screen.getByLabelText("Deine Empfänger (freiwillig)")).toHaveValue("Appenzeller Zeitung, Redaktion Gossau\nGemeindeblatt Gossau");
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });

  it("meldet einen Ausfall der KI ruhig und lässt das Formular stehen", async () => {
    mockApi({ status: 502, body: { error: "ai_rejected" } });
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByRole("button", { name: "Medienmitteilung erstellen" });
    await fillForm(u);
    await u.click(screen.getByRole("button", { name: "Medienmitteilung erstellen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert.");
    expect(screen.queryByRole("region", { name: "Deine Medienmitteilung" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Wann?")).toHaveValue(BEISPIEL_INPUT.wann);
  });
});
