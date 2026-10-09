// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { parseTextcheckState } from "@/tools/textcheck/logic";
import Tool from "./Tool";
import type { PostOutput } from "./generator";
import { EMPTY_FORM, MERKLISTE_KEY, STORAGE_KEY, compose, parseState, toInput } from "./logic";

// Durchlauf im Browser (jsdom): Formular, E-Mail-Fenster, Beitrag von /api/generate (hier ein Stub), Ergebnis mit Hook-Wahl,
// Vorschau, Hashtags, Entwürfe, CRM, Übergabe an den Textcheck und gemerkte Ideen.

type Call = { path: string; body: Record<string, unknown> };

const output: PostOutput = {
  hooks: ["Warum blättert der Anstrich schon nach wenigen Wintern ab?", "Ein Anstrich hält nur so gut wie der Untergrund darunter."],
  hauptteil:
    "Diese Woche haben wir in Gossau eine Fassade neu gestrichen. Der alte Anstrich blätterte nach wenigen Wintern ab.\n\nDer Grund war einfach: Der Untergrund war beim letzten Mal noch feucht. Dann haftet die Farbe schlecht.\n\nDarum messen wir die Feuchtigkeit, bevor wir den ersten Strich setzen. Erst wenn die Wand trocken ist, streichen wir.",
  cta: "Was hast du an deiner Fassade erlebt? Schreib es uns in die Kommentare.",
  hinweis: "Ein Foto der Fassade vor und nach dem Anstrich würde den Beitrag stärken.",
};

const IDEE = "Diese Woche haben wir in Gossau eine Fassade gestrichen, deren alter Anstrich nach wenigen Wintern abblätterte.";

/** /api/generate antwortet mit `reply`; /api/result und /api/lead sind in Ordnung. */
function mockApi(reply: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, output } })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path === "/api/generate") {
        const r = reply();
        return json(r.body, r.status);
      }
      return json({ ok: true });
    }),
  );
  return { calls, count: (p: string) => calls.filter((c) => c.path === p).length, last: (p: string) => calls.filter((c) => c.path === p).at(-1) };
}

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

/** Die Idee einfügen (kürzer und schneller als Tippen) und den Knopf drücken. */
async function schreibe(u: User, idee = IDEE) {
  await u.click(await screen.findByLabelText("Deine Idee in ein bis drei Sätzen"));
  await u.paste(idee);
  await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
}

const stored = () => parseState(JSON.parse(readLocal(STORAGE_KEY) ?? "null"));

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

describe("Post-Generator im Browser", () => {
  it("zeigt das Formular mit Standardwerten, Beschriftungen und dem Satz, was an den Server geht", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", positionierung: "Der Malerbetrieb, der Termine hält.", marke: { werte: ["Verlässlich"], tonalitaet: { so: "ruhig" } }, contentSaeulen: [{ name: "Team und Lehre" }] }));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveValue("");
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Plattform")).toHaveValue("instagram");
    expect(screen.getByLabelText("Format")).toHaveValue("geschichte");
    expect(screen.getByLabelText("Ziel der Aufforderung")).toHaveValue("kommentar");
    expect(screen.getByLabelText("Anrede")).toHaveValue("du");
    expect(screen.getByLabelText("Säule")).toHaveValue("");
    expect(screen.getByLabelText("Emojis erlauben")).not.toBeChecked();
    expect(within(screen.getByLabelText("Plattform")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Instagram", "LinkedIn", "Facebook", "Google-Beitrag"]);
    expect(within(screen.getByLabelText("Ziel der Aufforderung")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Kommentieren", "Direktnachricht", "Follower gewinnen", "Website-Besuche", "Speichern", "Verkauf", "Termin", "Bewerbung", "Anmeldung", "Teilen"]);
    expect(within(screen.getByLabelText("Säule")).getAllByRole("option").map((o) => o.textContent)).toEqual(["keine", "Team und Lehre"]);
    expect(screen.getByTestId("profil-hinweis")).toHaveTextContent("Aus deinem Profil geht mit: Positionierung, Werte und Tonalität.");
    expect(screen.getByRole("link", { name: "Bearbeiten" })).toHaveAttribute("href", "/profil");
    expect(screen.getByText(/an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expect(screen.getByText(/dazu Positionierung, Werte und Tonalität aus deinem Profil/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beitrag schreiben" })).toBeEnabled();
    expectCalmText("Formular");
  });

  it("blendet die Säule und den Profil-Hinweis aus, wenn das Profil nichts liefert", async () => {
    mockApi();
    render(<Tool />);
    await screen.findByLabelText("Deine Idee in ein bis drei Sätzen");
    expect(screen.queryByLabelText("Säule")).not.toBeInTheDocument();
    expect(screen.queryByTestId("profil-hinweis")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gemerkte Idee übernehmen")).not.toBeInTheDocument();
  });

  it("meldet, was fehlt, setzt den Fokus ins Feld und ruft den Server nicht an", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByRole("button", { name: "Beitrag schreiben" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Gib den Namen deines Betriebs an.");
    expect(screen.getByLabelText("Firma")).toHaveFocus();
    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await u.click(screen.getByLabelText("Deine Idee in ein bis drei Sätzen"));
    await u.paste("zu kurz");
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    expect(screen.getByRole("alert")).toHaveTextContent("mindestens 20 Zeichen");
    expect(screen.getByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveFocus();
    expect(m.count("/api/generate")).toBe(0);
  });

  it("schreibt den Beitrag, zeigt Hook-Wahl, Vorschau und Hinweis und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", branche: "Malerei", ort: "Gossau", marke: { woerter: { vermeiden: ["günstig"] } } }));
    const m = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Format"), "fachtipp");
    await schreibe(u);

    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(karte).getByRole("heading", { name: "Dein Beitrag" })).toHaveFocus();
    expect(within(karte).getByTestId("ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");
    const hooks = within(karte).getByRole("radiogroup", { name: "Hook" });
    const radios = within(hooks).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    expect(within(hooks).getByRole("radio", { name: output.hooks[1] })).toBeInTheDocument();
    expect(within(karte).getByTestId("hinweis")).toHaveTextContent("Hinweis der KI: Ein Foto der Fassade");
    expect(within(karte).queryByTestId("platzhalter")).not.toBeInTheDocument();

    const text = compose(output, 0, "", "instagram");
    expect(within(karte).getByTestId("pg-text")).toHaveTextContent(text.replace(/\s+/g, " "));
    expect(within(karte).getByTestId("pg-counter")).toHaveTextContent(/^\d+ Zeichen, davon 125 vor der Faltkante$/);
    expect(within(karte).getByTestId("pg-over")).toBeInTheDocument();
    expect(karte).toHaveTextContent("Richtwert von Alperna, keine Statistik; die Plattformen ändern das.");
    expect(within(karte).getByRole("button", { name: "Beitrag kopieren" })).toBeInTheDocument();
    expect(within(karte).getByRole("button", { name: "Text kopieren" })).toBeInTheDocument();
    expect(within(karte).queryByRole("button", { name: /PDF|Word/ })).not.toBeInTheDocument();
    for (const name of ["Als Entwurf merken", "Neu formulieren", "Angaben ändern", "Neu beginnen"]) expect(within(karte).getByRole("button", { name })).toBeInTheDocument();
    expect(within(karte).getByRole("link", { name: "Im Textcheck prüfen" })).toHaveAttribute("href", "/tools/textcheck");

    // Anfrage an /api/generate: genau die Felder des Generators, nichts über die Person
    expect(m.count("/api/generate")).toBe(1);
    const body = m.last("/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(body.tool).toBe("post-generator");
    expect(body.input).toMatchObject({ betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", idee: IDEE, plattform: "instagram", format: "fachtipp", ziel: "kommentar", anrede: "du", emojis: false, vermeiden: ["günstig"] });
    expect(JSON.stringify(body)).not.toContain("anna@keller.ch");

    // CRM: lesbare Eingabe und Ausgabe, einmal
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    const crm = m.last("/api/result")!.body as { tool: string; eingabe: string; ausgabe: string; firma?: string };
    expect(crm.tool).toBe("post-generator");
    expect(crm.firma).toBe("Malerei Keller");
    expect(crm.eingabe.split("\n").slice(0, 3)).toEqual(["Betrieb: Malerei Keller", "Ort: Gossau", "Branche: Malerei"]);
    expect(crm.eingabe).toContain(`Idee: ${IDEE}`);
    expect(crm.ausgabe).toContain("# Beitrag: Instagram");
    expect(crm.ausgabe).toContain(output.hooks[0]);
    expect(crm.ausgabe).toContain(output.hooks[1]);
    expect(crm.ausgabe).not.toMatch(/^\{|\[object/);

    // Stand: Objekt unter «output», damit der Pfad-Fortschritt das Werkzeug als erledigt erkennt
    const s = stored();
    expect(s.output).toEqual(output);
    expect(s.input?.idee).toBe(IDEE);
    expect(s.hook).toBe(0);
    expectCalmText("Ergebnis");
  });

  it("wechselt den Hook in der Vorschau, merkt sich die Wahl und trägt Hashtags nur bei Instagram unter den Beitrag", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" }));
    render(<Tool />);
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });

    await u.click(within(karte).getByRole("radio", { name: output.hooks[1] }));
    expect(within(karte).getByTestId("pg-text").textContent).toMatch(/^Ein Anstrich hält nur so gut wie der Untergrund darunter\./);
    expect(stored().hook).toBe(1);

    const tags = within(karte).getByLabelText("Hashtags (freiwillig)");
    await u.click(tags);
    await u.paste("malerei, #Gossau");
    expect(within(karte).getByTestId("pg-text").textContent).toMatch(/#malerei #Gossau$/);
    expect(stored().hashtags).toBe("malerei, #Gossau");
    expect(within(karte).getByTestId("pg-counter").textContent).toMatch(/Zeichen, davon 125 vor der Faltkante/);
  });

  it("zeigt bei LinkedIn kein Hashtag-Feld, rechnet die Faltkante nach drei Zeilen und fragt den Server mit der Plattform", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Plattform"), "linkedin");
    await u.selectOptions(screen.getByLabelText("Anrede"), "sie");
    await u.click(screen.getByLabelText("Emojis erlauben"));
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(karte).queryByLabelText("Hashtags (freiwillig)")).not.toBeInTheDocument();
    expect(within(karte).getByRole("region", { name: "Vorschau LinkedIn" })).toBeInTheDocument();
    expect(within(karte).getByTestId("pg-counter")).toHaveTextContent("Zeichen, davon 173 vor der Faltkante");
    expect(m.last("/api/generate")!.body).toMatchObject({ input: { plattform: "linkedin", anrede: "sie", emojis: true } });
  });

  it("zeigt bei Google die Grenze statt der Faltkante und keine Leerzeilen", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Plattform"), "google");
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(karte).getByTestId("pg-counter")).toHaveTextContent(/innerhalb der Grenze von 1'500$/);
    expect(within(karte).getByTestId("pg-text").textContent).toBe(compose(output, 0, "", "google"));
    expect(within(karte).queryByTestId("pg-over")).not.toBeInTheDocument();
  });

  it("nennt Platzhalter in eckigen Klammern über dem Beitrag", async () => {
    mockApi(() => ({ status: 200, body: { ok: true, output: { ...output, cta: "Mehr dazu auf [Link].", hinweis: "" } } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Ziel der Aufforderung"), "link");
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(karte).getByTestId("platzhalter")).toHaveTextContent("Platzhalter ausfüllen: [Link]");
    expect(within(karte).queryByTestId("hinweis")).not.toBeInTheDocument();
  });

  it("zeigt nach dem Neuladen das Ergebnis ohne neue Anfrage und ohne zweiten CRM-Eintrag", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const first = render(<Tool />);
    await schreibe(u);
    await screen.findByRole("region", { name: "Dein Beitrag" });
    await waitFor(() => expect(m.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Dein Beitrag" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Deine Idee in ein bis drei Sätzen")).not.toBeInTheDocument();
    expect(m.count("/api/generate")).toBe(1);
    expect(m.count("/api/result")).toBe(1);
  });

  it("formuliert neu mit denselben Angaben, schickt das zweite Ergebnis ins CRM und setzt die Hook-Wahl zurück", async () => {
    const zweiter: PostOutput = { ...output, hooks: ["Wie lange hält ein Fassadenanstrich wirklich?", "Ein Fassadenanstrich hält, wenn die Wand trocken ist."] };
    let n = 0;
    const m = mockApi(() => ({ status: 200, body: { ok: true, output: n++ === 0 ? output : zweiter } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await schreibe(u);
    let karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(karte).getByRole("radio", { name: output.hooks[1] }));
    await u.click(within(karte).getByRole("button", { name: "Neu formulieren" }));
    await waitFor(() => expect(m.count("/api/generate")).toBe(2));
    karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    await within(karte).findByRole("radio", { name: zweiter.hooks[0] });
    expect(within(karte).getAllByRole("radio")[0]).toBeChecked();
    expect(stored().output?.hooks[0]).toBe(zweiter.hooks[0]);
    expect(stored().hook).toBe(0);
    expect(m.calls.filter((c) => c.path === "/api/generate")[1].body).toEqual(m.calls.filter((c) => c.path === "/api/generate")[0].body);
    await waitFor(() => expect(m.count("/api/result")).toBe(2));
  });

  it("meldet einen Fehler beim Neuformulieren im Ergebnis und behält den bisherigen Beitrag", async () => {
    let n = 0;
    const m = mockApi(() => (n++ === 0 ? { status: 200, body: { ok: true, output } } : { status: 429, body: { error: "rate_limited" } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(karte).getByRole("button", { name: "Neu formulieren" }));
    expect(await within(karte).findByRole("alert")).toHaveTextContent("Das waren viele Anfragen in kurzer Zeit.");
    expect(within(karte).getAllByRole("radio")).toHaveLength(2);
    expect(stored().output).toEqual(output);
    expect(m.count("/api/result")).toBe(1);
  });

  it("öffnet mit «Angaben ändern» das Formular mit den Angaben, und «Neu beginnen» löscht Ergebnis, aber nicht die Entwürfe", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await u.selectOptions(await screen.findByLabelText("Format"), "liste");
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(karte).getByRole("button", { name: "Als Entwurf merken" }));

    await u.click(within(karte).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveValue(IDEE);
    expect(screen.getByLabelText("Format")).toHaveValue("liste");
    await u.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Deine Idee in ein bis drei Sätzen")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
    expect(stored().output).toBeNull();
    expect(stored().entwuerfe).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Deine Entwürfe" })).toBeInTheDocument();
  });

  it("merkt Entwürfe, lädt sie ohne CRM-Eintrag und löscht sie", async () => {
    const m = mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    const entwuerfe = screen.getByRole("region", { name: "Deine Entwürfe" });
    expect(entwuerfe).toHaveTextContent("Noch kein Entwurf gemerkt");

    await u.click(within(karte).getByRole("radio", { name: output.hooks[1] }));
    await u.click(within(karte).getByRole("button", { name: "Als Entwurf merken" }));
    expect(within(karte).getByText("Entwurf gemerkt.")).toBeInTheDocument();
    const liste = within(screen.getByRole("region", { name: "Deine Entwürfe" })).getByRole("list", { name: "Gemerkte Entwürfe" });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    expect(liste).toHaveTextContent(output.hooks[1]);
    expect(liste).toHaveTextContent("Instagram");
    expect(stored().entwuerfe[0].hook).toBe(1);

    await u.click(within(karte).getByRole("radio", { name: output.hooks[0] }));
    await u.click(within(liste).getByRole("button", { name: "Laden" }));
    expect(within(screen.getByRole("region", { name: "Dein Beitrag" })).getAllByRole("radio")[1]).toBeChecked();
    expect(m.count("/api/result")).toBe(1);

    await u.click(within(liste).getByRole("button", { name: "Löschen" }));
    expect(stored().entwuerfe).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Deine Entwürfe" })).toHaveTextContent("Noch kein Entwurf gemerkt");
  });

  it("übergibt den Beitrag an den Textcheck", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await schreibe(u);
    const karte = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(karte).getByRole("radio", { name: output.hooks[1] }));
    const link = within(karte).getByRole("link", { name: "Im Textcheck prüfen" });
    link.addEventListener("click", (e) => e.preventDefault());
    await u.click(link);
    const state = parseTextcheckState(JSON.parse(readLocal("mt:textcheck") ?? "null"));
    expect(state.phase).toBe("edit");
    expect(state.text).toBe(compose(output, 1, "", "instagram"));
  });

  it("meldet einen Fehler der KI ruhig, behält das Formular und schickt nichts ins CRM", async () => {
    const m = mockApi(() => ({ status: 502, body: { error: "ai_rejected" } }));
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    render(<Tool />);
    await schreibe(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.");
    expect(screen.getByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveValue(IDEE);
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
    expect(m.count("/api/result")).toBe(0);
    expect(stored().output).toBeNull();
  });

  it("bietet gemerkte Ideen aus «Beitragsideen» an und füllt damit das Feld", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    writeLocal(MERKLISTE_KEY, JSON.stringify({ v: 1, ideen: [{ id: "alle-01", gemerktAm: "2026-10-05T08:00:00.000Z" }, { id: "gibt-es-nicht", gemerktAm: "" }] }));
    render(<Tool />);
    const auswahl = await screen.findByLabelText("Gemerkte Idee übernehmen");
    expect(within(auswahl).getAllByRole("option").map((o) => o.textContent)).toEqual(["Bitte wählen", "Das Team stellt sich vor"]);
    await u.selectOptions(auswahl, "alle-01");
    expect((screen.getByLabelText("Deine Idee in ein bis drei Sätzen") as HTMLTextAreaElement).value).toMatch(/^Das Team stellt sich vor\. Zeig pro Beitrag ein Gesicht/);
    expect(auswahl).toHaveValue("");
  });

  it("füllt das Formular aus der gespeicherten Eingabe, wenn nur das Ergebnis kaputt ist", async () => {
    const input = toInput({ firma: "Malerei Keller" }, { ...EMPTY_FORM, idee: IDEE, plattform: "facebook", ziel: "nachricht", emojis: true });
    writeLocal(STORAGE_KEY, JSON.stringify({ v: 1, input, output: { hooks: ["nur einer"] }, hook: 1, hashtags: "" }));
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    mockApi();
    render(<Tool />);
    expect(await screen.findByLabelText("Deine Idee in ein bis drei Sätzen")).toHaveValue(IDEE);
    expect(screen.getByLabelText("Plattform")).toHaveValue("facebook");
    expect(screen.getByLabelText("Ziel der Aufforderung")).toHaveValue("nachricht");
    expect(screen.getByLabelText("Emojis erlauben")).toBeChecked();
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
  });

  it("ignoriert eine kaputte Merkliste", async () => {
    mockApi();
    writeLocal(MERKLISTE_KEY, "{kaputt");
    render(<Tool />);
    await screen.findByLabelText("Deine Idee in ein bis drei Sätzen");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText("Gemerkte Idee übernehmen")).not.toBeInTheDocument();
  });
});
