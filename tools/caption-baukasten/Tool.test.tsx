// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import { parseTextcheckState } from "@/tools/textcheck/logic";
import type { PostOutput } from "@/tools/post-generator/generator";
import Tool from "./Tool";
import { captionTexts, beispielFelder, parseState } from "./logic";

// Durchlauf im Browser (jsdom): drei Schritte, E-Mail-Fenster, Ergebnis je Plattform, CRM, Entwürfe, Übergabe an den Textcheck.

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

const KELLER = beispielFelder("frage", "problem-loesung", "kommentar", "du");

/** Wechselt auf den Weg von Hand (der Standard ist der Weg mit KI). */
async function selbst(u: User) {
  await u.click(await screen.findByRole("radio", { name: "Selbst, in drei Schritten" }));
}

/** Schritt 1 und 2 mit den Beispielwerten der Malerei Keller, bis Schritt 3 offen ist. */
async function fillUntilStep3(u: User) {
  await selbst(u);
  expect(await screen.findByText("Schritt 1 von 3")).toBeInTheDocument();
  await u.type(screen.getByLabelText("Situation"), KELLER.hook.Situation);
  await u.click(screen.getByRole("button", { name: "Weiter" }));
  expect(await screen.findByText("Schritt 2 von 3")).toBeInTheDocument();
  await u.type(screen.getByLabelText("Problem"), KELLER.teile.problem);
  await u.type(screen.getByLabelText("Lösung"), KELLER.teile.loesung);
  await u.click(screen.getByRole("button", { name: "Weiter" }));
  expect(await screen.findByText("Schritt 3 von 3")).toBeInTheDocument();
}

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

const KI_OUTPUT: PostOutput = {
  hooks: ["Warum blättert der Anstrich schon nach wenigen Wintern ab?", "Ein Anstrich hält nur so gut wie der Untergrund darunter."],
  hauptteil:
    "Diese Woche haben wir in Gossau eine Fassade neu gestrichen. Der alte Anstrich blätterte nach wenigen Wintern ab.\n\nDer Grund war einfach: Der Untergrund war noch feucht. Dann haftet die Farbe schlecht.\n\nDarum messen wir die Feuchtigkeit, bevor wir den ersten Strich setzen.",
  cta: "Schreib uns eine Nachricht, wenn deine Fassade ähnlich aussieht.",
  hinweis: "",
};
const IDEE = "Diese Woche haben wir in Gossau eine Fassade gestrichen, deren alter Anstrich nach wenigen Wintern abblätterte.";

/** /api/generate antwortet mit `reply`; /api/result und /api/lead sind in Ordnung. */
function mockKiApi(reply: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, output: KI_OUTPUT } })) {
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
  return { calls, count: (p: string) => calls.filter((c) => c.path === p).length };
}

describe("Caption-Baukasten im Browser: Weg mit KI", () => {
  it("beginnt mit den drei Fragen, schreibt die Caption mit der KI und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei" }));
    const api = mockKiApi();
    const u = userEvent.setup();
    render(<Tool />);

    expect(await screen.findByLabelText("1. Was möchtest du mitteilen?")).toHaveValue("");
    expect(screen.getByLabelText("2. Worum geht es? (freiwillig)")).toHaveValue("");
    expect(screen.getByLabelText("3. Was sollen die Leute danach tun?")).toHaveValue("kommentar");
    expect(within(screen.getByLabelText("3. Was sollen die Leute danach tun?")).getAllByRole("option")).toHaveLength(10);
    expect(screen.queryByText("Schritt 1 von 3")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mit KI, in drei Fragen" })).toBeChecked();
    expect(screen.getByText(/an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expectCalmText("Drei Fragen");

    await u.click(screen.getByLabelText("1. Was möchtest du mitteilen?"));
    await u.paste(IDEE);
    await u.selectOptions(screen.getByLabelText("2. Worum geht es? (freiwillig)"), "kundenprojekt");
    await u.selectOptions(screen.getByLabelText("3. Was sollen die Leute danach tun?"), "nachricht");
    expect(api.count("/api/generate")).toBe(0); // vor dem Knopf geht nichts raus
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));

    const card = await screen.findByRole("region", { name: "Deine Caption" });
    expect(api.count("/api/generate")).toBe(1);
    const gen = api.calls.find((c) => c.path === "/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(gen.tool).toBe("post-generator");
    expect(gen.input).toMatchObject({ betrieb: "Malerei Keller", ort: "Gossau", plattform: "instagram", ziel: "nachricht", kategorie: "kundenprojekt", idee: IDEE });
    expect(JSON.stringify(gen)).not.toContain("anna@keller.ch");

    // Ergebnis: Hinweis der KI, beide Hooks, Instagram zuerst mit dem ersten Hook
    expect(within(card).getByTestId("cb-ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");
    const hooks = within(card).getByRole("group", { name: "Hook wählen" });
    expect(within(hooks).getByRole("button", { name: /Hook A/, pressed: true })).toBeInTheDocument();
    expect(within(card).getByTestId("cb-text").textContent).toContain(KI_OUTPUT.hooks[0]);
    expect(within(card).getByTestId("cb-text").textContent).toContain(KI_OUTPUT.cta);

    // Hook B wählen ändert den Text und bleibt gespeichert
    await u.click(within(hooks).getByRole("button", { name: /Hook B/ }));
    expect(within(card).getByTestId("cb-text").textContent).toContain(KI_OUTPUT.hooks[1]);
    expect(within(card).getByTestId("cb-text").textContent).not.toContain(KI_OUTPUT.hooks[0]);
    expect(JSON.parse(readLocal("mt:caption-baukasten")!).felder.ki.hook).toBe(1);
    expectCalmText("Ergebnis mit KI");

    // Das Ergebnis geht einmal ins CRM, mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(api.count("/api/result")).toBe(1));
    const body = api.calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("caption-baukasten");
    expect(String(body.eingabe)).toContain("Weg: KI in drei Fragen");
    expect(String(body.eingabe)).toContain("Worum geht es: Kundenprojekt");
    expect(String(body.eingabe)).toContain("Ziel: Direktnachricht");
    expect(String(body.ausgabe)).toContain("Instagram (");
    expect(String(body.ausgabe)).toContain(KI_OUTPUT.hooks[0]);
  });

  it("meldet einen fehlenden Betrieb und eine zu kurze Idee, ohne die KI zu fragen", async () => {
    const api = mockKiApi();
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByLabelText("1. Was möchtest du mitteilen?"));
    await u.paste(IDEE);
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));
    expect(await screen.findByText("Gib den Namen deines Betriebs an.")).toBeInTheDocument();
    expect(screen.getByLabelText("Firma")).toHaveFocus();

    await u.type(screen.getByLabelText("Firma"), "Malerei Keller");
    await u.clear(screen.getByLabelText("1. Was möchtest du mitteilen?"));
    await u.type(screen.getByLabelText("1. Was möchtest du mitteilen?"), "kurz");
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));
    expect(await screen.findByText(/Beschreib deine Idee in mindestens 20 Zeichen/)).toBeInTheDocument();
    expect(screen.getByLabelText("1. Was möchtest du mitteilen?")).toHaveFocus();
    expect(api.count("/api/generate")).toBe(0);
    expect(api.count("/api/result")).toBe(0);
  });

  it("zeigt einen ruhigen Satz, wenn die KI keinen brauchbaren Entwurf liefert, und lässt das Formular stehen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const api = mockKiApi(() => ({ status: 502, body: { ok: false, error: "failed" } }));
    const u = userEvent.setup();
    render(<Tool />);
    await u.click(await screen.findByLabelText("1. Was möchtest du mitteilen?"));
    await u.paste(IDEE);
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));
    expect(await screen.findByText(/keinen brauchbaren Entwurf/)).toBeInTheDocument();
    expect(screen.getByLabelText("1. Was möchtest du mitteilen?")).toHaveValue(IDEE);
    expect(screen.queryByRole("region", { name: "Deine Caption" })).not.toBeInTheDocument();
    expect(api.count("/api/result")).toBe(0);
  });

  it("behält den Weg bei «Neu beginnen» und stellt das Ergebnis nach dem Neuladen wieder her, ohne es erneut zu senden", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const api = mockKiApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await u.click(await screen.findByLabelText("1. Was möchtest du mitteilen?"));
    await u.paste(IDEE);
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));
    const card = await screen.findByRole("region", { name: "Deine Caption" });
    await waitFor(() => expect(api.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    const again = await screen.findByRole("region", { name: "Deine Caption" });
    expect(within(again).getByTestId("cb-text").textContent).toContain(KI_OUTPUT.hooks[0]);
    expect(api.count("/api/generate")).toBe(1);
    expect(api.count("/api/result")).toBe(1);
    expect(card).toBeDefined();

    await u.click(within(again).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("1. Was möchtest du mitteilen?")).toHaveValue(IDEE);
    await u.click(screen.getByRole("button", { name: "Caption schreiben" }));
    await screen.findByRole("region", { name: "Deine Caption" });
    expect(api.count("/api/generate")).toBe(2);
    await u.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("1. Was möchtest du mitteilen?")).toHaveValue("");
  });
});

describe("Caption-Baukasten im Browser", () => {
  it("hält auf allen Schritten und im Ergebnis die Sperrliste und die Schreibregeln ein", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("1. Was möchtest du mitteilen?");
    expectCalmText("Drei Fragen");
    await selbst(u);
    expect(await screen.findByText("Schritt 1 von 3")).toBeInTheDocument();
    expectCalmText("Schritt 1");
    await u.type(screen.getByLabelText("Situation"), KELLER.hook.Situation);
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByText("Schritt 2 von 3");
    expectCalmText("Schritt 2");
    await u.type(screen.getByLabelText("Problem"), KELLER.teile.problem);
    await u.type(screen.getByLabelText("Lösung"), KELLER.teile.loesung);
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByText("Schritt 3 von 3");
    expectCalmText("Schritt 3");
    await u.click(screen.getByRole("button", { name: "Caption erstellen" }));
    await screen.findByRole("region", { name: "Deine Caption" });
    expectCalmText("Ergebnis");
  });

  it("führt in drei Schritten zur Caption, zeigt sie je Plattform und schickt Eingabe und Ausgabe ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await selbst(u);

    // Schritt 1: acht Formeln, Frage ist gewählt, der Hook entsteht beim Tippen
    const formeln = screen.getByRole("radiogroup", { name: "Hook-Formel" });
    expect(within(formeln).getAllByRole("radio")).toHaveLength(8);
    expect(within(formeln).getByRole("radio", { name: "Frage" })).toBeChecked();
    expect(screen.getByTestId("cb-hook-preview")).toHaveTextContent("Was machst du, wenn [Situation]?");

    // Weiter mit leerem Feld: Meldung, Fokus im Feld, kein Schrittwechsel
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Im Hook fehlt noch: Situation.");
    expect(screen.getByLabelText("Situation")).toHaveFocus();
    expect(screen.getByText("Schritt 1 von 3")).toBeInTheDocument();

    await u.type(screen.getByLabelText("Situation"), KELLER.hook.Situation);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByTestId("cb-hook-preview")).toHaveTextContent("Was machst du, wenn der Anstrich schon nach wenigen Wintern abblättert?");
    await u.click(screen.getByRole("button", { name: "Weiter" }));

    // Schritt 2: Aufbau mit Feldern je Rolle; ohne Angaben kein Weiter
    expect(await screen.findByText("Schritt 2 von 3")).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Aufbau" })).getAllByRole("radio")).toHaveLength(4);
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Im Hauptteil fehlt noch: Problem, Lösung.");
    await u.type(screen.getByLabelText("Problem"), KELLER.teile.problem);
    await u.type(screen.getByLabelText("Lösung"), KELLER.teile.loesung);
    await u.click(screen.getByRole("button", { name: "Weiter" }));

    // Schritt 3: Ziel mit Vorschlag, die Aufforderung ist vorbelegt
    expect(await screen.findByText("Schritt 3 von 3")).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Ziel" })).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Schreib uns in die Kommentare, was du dazu denkst.");
    await u.type(screen.getByLabelText("Hashtags (freiwillig)"), "#MalereiKeller #Gossau #Fassadenanstrich");
    expect(calls).toHaveLength(0); // vor dem Ergebnis geht nichts raus
    await u.click(screen.getByRole("button", { name: "Caption erstellen" }));

    // Ergebnis: Instagram zuerst, Faltkante nach 125 Zeichen
    const card = await screen.findByRole("region", { name: "Deine Caption" });
    const texte = captionTexts(KELLER);
    expect(within(card).getByRole("button", { name: "Instagram", pressed: true })).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["LinkedIn", "Facebook", "Google-Beitrag"]),
    );
    expect(within(card).getByTestId("cb-text").textContent).toBe(texte.instagram);
    expect(within(card).getByTestId("cb-counter")).toHaveTextContent(`${texte.instagram.length} Zeichen, davon 125 vor der Faltkante`);
    expect(within(card).getByTestId("cb-over")).toHaveTextContent("Dann haftet die Farbe schlecht.");
    expect(within(card).getByText(/Richtwert von Alperna, keine Statistik; die Plattformen ändern das\./)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Instagram-Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("region", { name: "Vorschau Instagram" })).toBeInTheDocument();

    // Plattform wechseln: eigener Text, eigener Zähler, eigener Kopierknopf, keine Hashtags
    await u.click(within(card).getByRole("button", { name: "LinkedIn" }));
    expect(within(card).getByRole("button", { name: "LinkedIn", pressed: true })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Instagram", pressed: false })).toBeInTheDocument();
    expect(within(card).getByTestId("cb-text").textContent).toBe(texte.linkedin);
    expect(within(card).getByTestId("cb-text").textContent).not.toContain("#");
    expect(within(card).getByRole("button", { name: "LinkedIn-Text kopieren" })).toBeInTheDocument();
    await u.click(within(card).getByRole("button", { name: "Google-Beitrag" }));
    expect(within(card).getByTestId("cb-text").textContent).not.toContain("\n\n");
    expect(within(card).getByTestId("cb-counter")).toHaveTextContent("innerhalb der Grenze von 1'500");
    expect(within(card).getByRole("button", { name: "Google-Text kopieren" })).toBeInTheDocument();

    // Das Ergebnis geht einmal ins CRM, mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("caption-baukasten");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe)).toContain("Hook-Formel: Frage");
    expect(String(body.eingabe)).toContain("Situation: der Anstrich schon nach wenigen Wintern abblättert");
    expect(String(body.eingabe)).toContain("Aufbau: Problem und Lösung");
    expect(String(body.eingabe)).toContain("Ziel: Kommentar");
    expect(String(body.ausgabe)).toContain("Instagram (");
    expect(String(body.ausgabe)).toContain("Google-Beitrag (");
    expect(String(body.ausgabe)).toContain(texte.instagram);

    // Der Stand zählt für den Pfad als erledigt
    expect(JSON.parse(readLocal("mt:caption-baukasten")!)).toMatchObject({ v: 1, phase: "result" });
  });

  it("zeigt das E-Mail-Fenster erst beim Erstellen; «Später» lässt das Formular stehen und schickt nichts", async () => {
    clearAllLocal(); // keine Adresse bekannt
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fillUntilStep3(u);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Caption erstellen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Aufforderung")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Caption" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("belegt die Anrede aus dem Profil vor, stellt die Vorschläge um und lässt eigenen Text stehen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", marke: { tonalitaet: { anrede: "sie" } } }));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await selbst(u);

    const anrede = await screen.findByRole("radiogroup", { name: "Anrede" });
    await waitFor(() => expect(within(anrede).getByRole("radio", { name: "Sie" })).toBeChecked());
    expect(screen.getByTestId("cb-hook-preview")).toHaveTextContent("Was machen Sie, wenn [Situation]?");

    await u.type(screen.getByLabelText("Situation"), "es regnet");
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    await u.type(await screen.findByLabelText("Problem"), "Regen.");
    await u.type(screen.getByLabelText("Lösung"), "Wir warten.");
    await u.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByLabelText("Aufforderung")).toHaveValue("Schreiben Sie uns in die Kommentare, was Sie dazu denken.");

    // Umschalten auf Du stellt den unveränderten Vorschlag um
    await u.click(within(screen.getByRole("radiogroup", { name: "Anrede" })).getByRole("radio", { name: "Du" }));
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Schreib uns in die Kommentare, was du dazu denkst.");

    // Eigener Text bleibt beim Umschalten
    await u.clear(screen.getByLabelText("Aufforderung"));
    await u.type(screen.getByLabelText("Aufforderung"), "Ruf einfach an.");
    await u.click(within(screen.getByRole("radiogroup", { name: "Anrede" })).getByRole("radio", { name: "Sie" }));
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Ruf einfach an.");

    // Ein Vorschlag des Ziels lässt sich wählen; «Link» ohne Klammer geht durch, eine offene Klammer nicht
    await u.click(within(screen.getByRole("radiogroup", { name: "Ziel" })).getByRole("radio", { name: "Link" }));
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Mehr dazu finden Sie auf unserer Website. Den Link sehen Sie in unserem Profil.");
    await u.clear(screen.getByLabelText("Aufforderung"));
    await u.type(screen.getByLabelText("Aufforderung"), "Alle Angaben hier: [[Link]"); // [[ ist die Schreibweise für eine einzelne [ in user-event
    await u.click(screen.getByRole("button", { name: "Caption erstellen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("[Link]");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("speichert Entwürfe, lädt und löscht sie, hält sie bei «Neu beginnen» und übergibt den Instagram-Text an den Textcheck", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await fillUntilStep3(u);
    await u.click(screen.getByRole("button", { name: "Caption erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Caption" });
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));

    const drafts = within(card).getByRole("region", { name: "Deine Entwürfe" });
    expect(within(drafts).queryByRole("list")).not.toBeInTheDocument();
    await u.click(within(card).getByRole("button", { name: "Als Entwurf speichern" }));
    await u.click(within(card).getByRole("button", { name: "Als Entwurf speichern" }));
    expect(within(card).getByText("Entwurf gespeichert.")).toBeInTheDocument();
    const list = within(drafts).getByRole("list", { name: "Gespeicherte Entwürfe" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Was machst du, wenn der Anstrich schon nach wenigen Wintern…");
    expect(parseState(JSON.parse(readLocal("mt:caption-baukasten")!)).entwuerfe).toHaveLength(2);

    // Löschen
    await u.click(within(within(list).getAllByRole("listitem")[1]).getByRole("button", { name: "Löschen" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    // Übergabe: Der Link führt zum Textcheck und schreibt den Instagram-Text in dessen Stand
    const link = within(card).getByRole("link", { name: "Im Textcheck prüfen" });
    expect(link).toHaveAttribute("href", "/tools/textcheck");
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom kann nicht navigieren
    await u.click(link);
    const handover = parseTextcheckState(JSON.parse(readLocal("mt:textcheck")!));
    expect(handover.phase).toBe("edit");
    expect(handover.text).toBe(captionTexts({ ...KELLER, hashtags: "" }).instagram);

    // Neu beginnen behält den Entwurf; ein Entwurf lässt sich laden, ohne das CRM ein zweites Mal zu fragen
    await u.click(within(card).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByText("Schritt 1 von 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Situation")).toHaveValue("");
    const kept = screen.getByRole("region", { name: "Deine Entwürfe" });
    await u.click(within(kept).getByRole("button", { name: "Laden" }));
    const again = await screen.findByRole("region", { name: "Deine Caption" });
    expect(within(again).getByTestId("cb-text").textContent).toContain("Dann haftet die Farbe schlecht.");
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1);

    // Angaben ändern: Das Formular steht mit den Angaben wieder da
    await u.click(within(again).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Situation")).toHaveValue(KELLER.hook.Situation);
  });

  it("stellt das Ergebnis nach dem Neuladen wieder her, ohne es ein zweites Mal zu senden", async () => {
    const calls = mockApi();
    writeLocal("mt:caption-baukasten", JSON.stringify({ v: 1, phase: "result", felder: KELLER, entwuerfe: [] }));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Deine Caption" });
    expect(within(card).getByTestId("cb-text").textContent).toBe(captionTexts(KELLER).instagram);
    expect(calls).toHaveLength(0);
  });

  it("übersteht kaputte Daten im Speicher", async () => {
    mockApi();
    writeLocal("mt:caption-baukasten", "{kaputt");
    const u = userEvent.setup();
    render(<Tool />);
    expect(await screen.findByLabelText("1. Was möchtest du mitteilen?")).toHaveValue("");
    await selbst(u);
    expect(await screen.findByText("Schritt 1 von 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Situation")).toHaveValue("");
  });
});
