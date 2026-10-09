// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { FELDER, beispielFelder, compose, fieldLabel, parseState, type Felder } from "./logic";

// Durchlauf im Browser (jsdom): Formular, Prüfung, E-Mail-Fenster, Ergebnis mit Hook-Wahl, Zähler, CRM, Stand.

type Call = { path: string; body: Record<string, unknown> };

function mockApi(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/gate") return { ok: true, status: 200, text: async () => "", json: async () => ({ email: null }) }; // Frage der ToolShell nach der gemerkten Adresse, kein CRM-Aufruf
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

const KELLER = beispielFelder("du");

/** Schreibt die Angaben per Einfügen in die Felder (wörtlich, auch eckige Klammern). Leere Werte bleiben leer. */
async function fill(u: User, felder: Felder) {
  for (const f of FELDER) {
    const value = felder[f.key];
    if (!value) continue;
    await u.click(screen.getByLabelText(fieldLabel(f)));
    await u.paste(value);
  }
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

/** Wechselt auf den Weg «Meine Sätze ordnen» (der Standard ist der Weg mit der KI). */
async function ordnen(u: User) {
  await u.click(await screen.findByRole("radio", { name: "Meine Sätze ordnen" }));
}

const resultState = (felder: Felder, extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, phase: "result", anrede: "du", felder, hook: 1, ...extra });

const KI_FELDER: Felder = {
  ausgangslage: "Frau Z. aus Gossau, Fassade blätterte nach drei Wintern ab",
  problem: "zwei andere Maler hatten nur übergestrichen",
  wendepunkt: "erst Feuchte im Putz gemessen",
  ergebnis: "Fassade hält seit zwei Jahren",
  lehre: "erst messen, dann streichen",
  bezug: "",
};

const KI_OUTPUT: Felder = {
  ausgangslage: "Frau Z. aus Gossau rief uns an. Ihre Fassade blätterte nach drei Wintern ab.",
  problem: "Zwei andere Maler hatten die Wand nur übergestrichen.",
  wendepunkt: "Wir haben zuerst die Feuchte im Putz gemessen.",
  ergebnis: "Die Fassade hält seit zwei Jahren. Frau Z. meldet sich bis heute nicht mehr.",
  lehre: "Erst messen, dann streichen.",
  bezug: "",
};

/** /api/generate antwortet mit `reply`; /api/result und /api/lead sind in Ordnung. */
function mockKiApi(reply: () => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true, output: KI_OUTPUT } })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/gate") return new Response(JSON.stringify({ email: null }), { status: 200 });
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

describe("Story-Post-Builder im Browser: Weg mit KI", () => {
  it("formuliert aus Stichworten, zeigt den Beitrag ohne doppelten Hook-Satz und schickt Stichworte und Beitrag ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei", marke: { tonalitaet: { so: "ruhig und konkret" }, woerter: { vermeiden: ["günstig"] } } }));
    const api = mockKiApi();
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Ausgangslage");
    await fill(u, KI_FELDER);
    expect(screen.getByTestId("sp-fortschritt")).toHaveTextContent("5 von 5 Pflichtfeldern bereit");
    expect(api.count("/api/generate")).toBe(0);
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));

    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(api.count("/api/generate")).toBe(1);
    const gen = api.calls.find((c) => c.path === "/api/generate")!.body as { tool: string; input: Record<string, unknown> };
    expect(gen.tool).toBe("story-post");
    expect(gen.input).toMatchObject({ betrieb: "Malerei Keller", ort: "Gossau", branche: "Malerei", anrede: "du", tonalitaet: "So schreiben wir: ruhig und konkret.", vermeiden: ["günstig"], felder: KI_FELDER });
    expect(JSON.stringify(gen)).not.toContain("anna@keller.ch");

    expect(within(card).getByTestId("sp-ki-hinweis")).toHaveTextContent("Von einer KI formuliert.");
    expect(within(card).queryByTestId("sp-saetze")).not.toBeInTheDocument();
    const text = within(card).getByTestId("sp-linkedin-text").textContent ?? "";
    expect(text.startsWith("Die Fassade hält seit zwei Jahren.\n\nFrau Z. aus Gossau rief uns an.")).toBe(true);
    // Der Satz des Hooks steht nicht noch einmal im Ergebnis-Absatz, der Rest des Ergebnisses bleibt
    expect(text.split("Die Fassade hält seit zwei Jahren.").length - 1).toBe(1);
    expect(text).toContain("Frau Z. meldet sich bis heute nicht mehr.");
    expect(within(card).getByRole("button", { name: "Neu formulieren" })).toBeEnabled();

    await waitFor(() => expect(api.count("/api/result")).toBe(1));
    const body = api.calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("story-post");
    expect(String(body.eingabe).startsWith("Weg: KI formuliert aus Stichworten\nAusgangslage: Frau Z. aus Gossau, Fassade blätterte")).toBe(true);
    expect(String(body.ausgabe).startsWith("Die Fassade hält seit zwei Jahren.\n\nFrau Z. aus Gossau rief uns an.")).toBe(true);

    const saved = JSON.parse(readLocal("mt:story-post")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", modus: "ki", felder: KI_FELDER, ki: KI_OUTPUT });
  });

  it("meldet fehlenden Betrieb und zu kurze Stichworte, ohne die KI zu fragen", async () => {
    const api = mockKiApi();
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Ausgangslage");
    await fill(u, { ...KI_FELDER, lehre: "kurz" });
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["«Lehre» ist zu kurz: mindestens 8 Zeichen, du hast 4."]);
    await u.type(screen.getByLabelText("Lehre"), "es genügt");
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    expect(await screen.findByText("Gib den Namen deines Betriebs an.")).toBeInTheDocument();
    expect(screen.getByLabelText("Firma")).toHaveFocus();
    expect(api.count("/api/generate")).toBe(0);
    expect(api.count("/api/result")).toBe(0);
  });

  it("zeigt einen ruhigen Satz, wenn die KI nichts Brauchbares liefert, und lässt das Formular stehen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const api = mockKiApi(() => ({ status: 502, body: { ok: false, error: "failed" } }));
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Ausgangslage");
    await fill(u, KI_FELDER);
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    expect(await screen.findByText(/keinen brauchbaren Entwurf/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ausgangslage")).toHaveValue(KI_FELDER.ausgangslage);
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
    expect(api.count("/api/result")).toBe(0);
  });

  it("formuliert über «Neu formulieren» erneut, stellt das Ergebnis nach dem Neuladen her und behält den Weg bei «Neu beginnen»", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const api = mockKiApi();
    const u = userEvent.setup();
    const first = render(<Tool />);
    await screen.findByLabelText("Ausgangslage");
    await fill(u, KI_FELDER);
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    await screen.findByRole("region", { name: "Dein Beitrag" });
    await waitFor(() => expect(api.count("/api/result")).toBe(1));
    first.unmount();

    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(card).getByTestId("sp-linkedin-text").textContent).toContain("Frau Z. aus Gossau rief uns an.");
    expect(api.count("/api/generate")).toBe(1);
    expect(api.count("/api/result")).toBe(1);

    await u.click(within(card).getByRole("button", { name: "Neu formulieren" }));
    await waitFor(() => expect(api.count("/api/generate")).toBe(2));
    await waitFor(() => expect(api.count("/api/result")).toBe(2));

    await u.click(within(await screen.findByRole("region", { name: "Dein Beitrag" })).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue(KI_FELDER.ausgangslage);
    expect(screen.getByRole("radio", { name: "Von der KI formulieren lassen" })).toBeChecked();
    await u.click(screen.getByRole("button", { name: "Beitrag schreiben" }));
    await u.click(within(await screen.findByRole("region", { name: "Dein Beitrag" })).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Von der KI formulieren lassen" })).toBeChecked();
  });
});

describe("Story-Post-Builder im Browser", () => {
  it("hält im Formular und im Ergebnis die Sperrliste und die Schreibregeln ein", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    expect(await screen.findByLabelText("Ausgangslage")).toBeInTheDocument();
    expectCalmText("Formular mit KI");
    await ordnen(u);
    expectCalmText("Formular");
    await fill(u, KELLER);
    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));
    await screen.findByRole("region", { name: "Dein Beitrag" });
    expectCalmText("Ergebnis");
  });

  it("beginnt mit dem Weg über die KI: Stichworte genügen, die Auswahl steht oben und sagt, was an den Server geht", async () => {
    render(<Tool />);
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Von der KI formulieren lassen" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Meine Sätze ordnen" })).not.toBeChecked();
    expect(screen.getByLabelText("Ausgangslage")).toHaveAccessibleDescription(/0 Zeichen \(8 bis 400\)/);
    expect(screen.getByLabelText("Branche")).toBeInTheDocument();
    expect(screen.getByLabelText("Ort")).toBeInTheDocument();
    expect(screen.getByText(/an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beitrag schreiben" })).toBeEnabled();
  });

  it("zeigt sechs Felder mit Hinweis, Beispiel und Zähler und sagt offen, dass die Sätze die der Person sind", async () => {
    const u = userEvent.setup();
    render(<Tool />);
    await ordnen(u);
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue("");
    expect(screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA")).toHaveLength(6);
    const label = (f: (typeof FELDER)[number]) => screen.getByLabelText(fieldLabel(f));
    expect(label(FELDER[0])).toHaveAttribute("placeholder", "Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.");
    expect(label(FELDER[0])).toHaveAccessibleDescription(/Wo standest du, wer war beteiligt\?.*Beispiel, Malerei Keller: «Frau Z\. aus Gossau.*0 Zeichen \(20 bis 400\)/);
    expect(screen.getByLabelText("Bezug zur Leserin (freiwillig)")).toHaveAccessibleDescription(/leer oder 10 bis 400/);
    expect(screen.getByText(/Die Sätze sind deine; das Werkzeug ordnet sie\./)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Anrede der Leserinnen und Leser" })).toBeInTheDocument();
    expect(screen.getByLabelText("Firma")).toBeInTheDocument();
    expect(screen.getByTestId("sp-fortschritt")).toHaveTextContent("0 von 5 Pflichtfeldern bereit");
  });

  it("meldet fehlende Angaben in einer Liste, setzt den Fokus ins erste Feld und fragt noch nicht nach der Adresse", async () => {
    clearAllLocal();
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await ordnen(u);
    await fill(u, { ...KELLER, problem: "kurz", ergebnis: "" });
    expect(screen.getByTestId("sp-fortschritt")).toHaveTextContent("3 von 5 Pflichtfeldern bereit");
    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));
    const alert = screen.getByRole("alert");
    const items = within(alert).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["«Problem oder Spannung» ist zu kurz: mindestens 20 Zeichen, du hast 4.", "«Ergebnis» fehlt noch."]);
    expect(screen.getByLabelText("Problem oder Spannung")).toHaveFocus();
    expect(screen.getByLabelText("Problem oder Spannung")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Wendepunkt")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    // Sobald die Person tippt, verschwindet die Meldung
    await u.type(screen.getByLabelText("Problem oder Spannung"), "x");
    expect(within(screen.getByRole("alert")).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("stellt den Beitrag zusammen, zeigt Hook, Zähler und Lesezeit und schickt Eingabe und Ausgabe einmal ins CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" }));
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await ordnen(u);
    await fill(u, KELLER);
    expect(screen.getByTestId("sp-fortschritt")).toHaveTextContent("5 von 5 Pflichtfeldern bereit");
    expect(calls).toHaveLength(0); // vor dem Ergebnis geht nichts raus
    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));

    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    const erwartet = compose({ anrede: "du", felder: KELLER, hook: 1, modus: "ordnen" });
    expect(within(card).getByTestId("sp-saetze")).toHaveTextContent("Die Sätze sind deine; das Werkzeug ordnet sie.");
    expect(within(card).getByTestId("sp-linkedin-text").textContent).toBe(erwartet.linkedin);
    expect(within(card).getByTestId("sp-instagram-text").textContent).toBe(erwartet.instagram.text);
    expect(within(card).getByTestId("sp-linkedin-counter")).toHaveTextContent("260 Zeichen, davon 108 vor der Faltkante");
    expect(within(card).getByTestId("sp-instagram-counter")).toHaveTextContent("260 Zeichen, davon 125 vor der Faltkante");
    expect(within(card).getByTestId("sp-linkedin-over")).toHaveTextContent("Zwei andere Maler hatten nur übergestrichen.");
    expect(within(card).getByTestId("sp-lesezeit")).toHaveTextContent("Lesezeit: unter 1 Minute (43 Wörter; Annahme von Alperna: 200 Wörter pro Minute, keine Statistik).");
    expect(within(card).getByText(/Höchstens 2'200 Zeichen \(Richtwert von Alperna; die Plattform ändert die Grenze\)/)).toBeInTheDocument();
    expect(within(card).queryByTestId("sp-instagram-hinweis")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("sp-platzhalter")).not.toBeInTheDocument();
    expect(within(card).getByRole("region", { name: "Vorschau LinkedIn" })).toBeInTheDocument();
    expect(within(card).getByRole("region", { name: "Vorschau Instagram" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "LinkedIn-Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Instagram-Text kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PDF herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Word herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Dein Beitrag" })).toHaveFocus();

    // Das Ergebnis geht einmal ins CRM, mit lesbarer Eingabe und Ausgabe
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("story-post");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).startsWith("Weg: Sätze der Person geordnet\nAusgangslage: Frau Z. aus Gossau rief an")).toBe(true);
    expect(String(body.eingabe)).toContain("Lehre: Erst messen, dann streichen.");
    expect(String(body.eingabe)).toContain("Hook: Hook 1");
    expect(String(body.ausgabe).startsWith("Die Fassade hält seit zwei Jahren.\n\nFrau Z. aus Gossau")).toBe(true);
    expect(String(body.ausgabe).endsWith("Instagram: 260 Zeichen, nichts gekürzt.")).toBe(true);

    // Der Stand zählt für den Pfad als erledigt
    const saved = JSON.parse(readLocal("mt:story-post")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", modus: "ordnen", anrede: "du", hook: 1, felder: KELLER });
    expect(saved.output.linkedin).toBe(erwartet.linkedin);
  });

  it("wechselt den Hook: Hook 2 hängt den Grund an, «Ohne Hook» lässt die erste Zeile weg", async () => {
    const calls = mockApi();
    const u = userEvent.setup();
    writeLocal("mt:story-post", resultState(KELLER));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    const group = within(card).getByRole("radiogroup", { name: "Hook für die erste Zeile" });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Hook 1", "Hook 2", "Ohne Hook"]);
    expect(within(group).getByRole("radio", { name: "Hook 1" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Hook 2" })).toHaveAccessibleDescription(
      "Die Fassade hält seit zwei Jahren. Der Grund: Wir haben erst die Feuchte im Putz gemessen.",
    );

    await u.click(within(group).getByRole("radio", { name: "Hook 2" }));
    expect(within(card).getByTestId("sp-linkedin-text").textContent?.split("\n\n")[0]).toBe(
      "Die Fassade hält seit zwei Jahren. Der Grund: Wir haben erst die Feuchte im Putz gemessen.",
    );
    expect(within(card).getByTestId("sp-lesezeit")).toHaveTextContent("45 Wörter");
    expect(JSON.parse(readLocal("mt:story-post")!).hook).toBe(2);

    await u.click(within(group).getByRole("radio", { name: "Ohne Hook" }));
    expect(within(card).getByTestId("sp-linkedin-text").textContent?.startsWith("Frau Z. aus Gossau")).toBe(true);
    expect(within(card).getByTestId("sp-linkedin-counter")).toHaveTextContent("260 Zeichen");
    expect(calls).toHaveLength(0); // ein Wechsel ist kein neues Ergebnis
  });

  it("sagt, wenn es keinen zweiten Hook gibt", async () => {
    mockApi();
    writeLocal("mt:story-post", resultState({ ...KELLER, ergebnis: "Es hält. Das merkt man jeden Tag.", wendepunkt: "Gemessen. Dann gestrichen worden." }));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    const group = within(card).getByRole("radiogroup", { name: "Hook für die erste Zeile" });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Hook 1", "Ohne Hook"]);
    expect(within(card).getByTestId("sp-hook2-fehlt")).toBeInTheDocument();
  });

  it("zeigt offene Platzhalter, Hinweise und den Instagram-Hinweis, wenn der Bezug entfällt", async () => {
    mockApi();
    const lang: Felder = {
      ausgangslage: "[Name] aus [Ort] rief an. " + "a".repeat(370),
      problem: "b".repeat(400),
      wendepunkt: "c".repeat(400),
      ergebnis: "d".repeat(400),
      lehre: "Das bringt Mehrwert. " + "e".repeat(370),
      bezug: "f".repeat(400),
    };
    writeLocal("mt:story-post", resultState(lang, { hook: 0 }));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(card).getByTestId("sp-platzhalter")).toHaveTextContent("Noch ausfüllen: [Name], [Ort]");
    expect(within(card).getByTestId("sp-instagram-hinweis")).toHaveTextContent("Gekürzt: Bezug zur Leserin fehlt");
    const hinweise = within(card).getByRole("list", { name: "Hinweise zu deinem Text" });
    expect(within(hinweise).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["In deinem Text steht ‹Mehrwert›, das wir nicht empfehlen."]);
    // LinkedIn behält den vollen Text, Instagram lässt den Bezug weg
    expect(within(card).getByTestId("sp-linkedin-text").textContent).toContain("f".repeat(400));
    expect(within(card).getByTestId("sp-instagram-text").textContent).not.toContain("f".repeat(400));
  });

  it("zeigt das E-Mail-Fenster erst beim Zusammenstellen; «Später» lässt das Formular stehen und schickt nichts", async () => {
    clearAllLocal(); // keine Adresse bekannt
    const calls = mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await ordnen(u);
    await fill(u, KELLER);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Ausgangslage")).toHaveValue(KELLER.ausgangslage);
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
  });

  it("fragt vor einem Download nach der Adresse, wenn keine bekannt ist", async () => {
    clearAllLocal();
    mockApi();
    const u = userEvent.setup();
    writeLocal("mt:story-post", resultState(KELLER));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(card).getByRole("button", { name: "PDF herunterladen" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("belegt die Anrede aus dem Profil vor und stellt das Beispiel beim Bezug um", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller", marke: { tonalitaet: { anrede: "sie" } } }));
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await ordnen(u);
    const anrede = await screen.findByRole("radiogroup", { name: "Anrede der Leserinnen und Leser" });
    await waitFor(() => expect(within(anrede).getByRole("radio", { name: "Sie" })).toBeChecked());
    expect(screen.getByLabelText("Bezug zur Leserin (freiwillig)")).toHaveAttribute("placeholder", "Wie ist das bei Ihrem Haus?");
    expect(screen.getByTestId("sp-bezug-beispiel")).toHaveTextContent("«Wie ist das bei Ihrem Haus?»");

    await u.click(within(anrede).getByRole("radio", { name: "Du" }));
    expect(screen.getByLabelText("Bezug zur Leserin (freiwillig)")).toHaveAttribute("placeholder", "Wie ist das bei deinem Haus?");

    // Du gewählt, aber «Ihrem» im Text: ein Hinweis, nichts wird geändert
    await fill(u, { ...KELLER, bezug: "Wie ist das bei Ihrem Haus?" });
    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(card).getByTestId("sp-linkedin-text").textContent).toContain("Wie ist das bei Ihrem Haus?");
    expect(within(card).getByRole("list", { name: "Hinweise zu deinem Text" })).toHaveTextContent("steht ‹Ihrem›, gewählt ist aber Du");
    expect(JSON.parse(readLocal("mt:story-post")!).anrede).toBe("du");
  });

  it("stellt das Ergebnis nach dem Neuladen wieder her, ohne es ein zweites Mal zu senden", async () => {
    const calls = mockApi();
    writeLocal("mt:story-post", resultState(KELLER, { hook: 2 }));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });
    expect(within(card).getByTestId("sp-linkedin-text").textContent).toBe(compose({ anrede: "du", felder: KELLER, hook: 2, modus: "ordnen" }).linkedin);
    expect(within(card).getByRole("radio", { name: "Hook 2" })).toBeChecked();
    expect(calls).toHaveLength(0);
  });

  it("führt über «Angaben ändern» zurück ins Formular und über «Neu beginnen» zu einem leeren", async () => {
    mockApi();
    const u = userEvent.setup();
    writeLocal("mt:story-post", resultState(KELLER));
    render(<Tool />);
    const card = await screen.findByRole("region", { name: "Dein Beitrag" });

    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Ergebnis")).toHaveValue(KELLER.ergebnis);
    expect(screen.getByLabelText("Ausgangslage")).toHaveFocus();
    expect(parseState(JSON.parse(readLocal("mt:story-post")!)).phase).toBe("edit");

    await u.click(screen.getByRole("button", { name: "Beitrag zusammenstellen" }));
    const again = await screen.findByRole("region", { name: "Dein Beitrag" });
    await u.click(within(again).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Ergebnis")).toHaveValue("");
    expect(parseState(JSON.parse(readLocal("mt:story-post")!))).toMatchObject({ phase: "edit", hook: 1 });
  });

  it("speichert die Angaben beim Tippen als Zwischenstand", async () => {
    mockApi();
    const u = userEvent.setup();
    render(<Tool />);
    await screen.findByLabelText("Ausgangslage");
    await u.click(screen.getByLabelText("Lehre"));
    await u.paste("Erst messen, dann streichen.");
    await waitFor(() => expect(parseState(JSON.parse(readLocal("mt:story-post") ?? "null")).felder.lehre).toBe("Erst messen, dann streichen."), { timeout: 3000 });
    expect(JSON.parse(readLocal("mt:story-post")!).phase).toBe("edit");
  });

  it("übersteht kaputte Daten im Speicher", async () => {
    mockApi();
    writeLocal("mt:story-post", "{kaputt");
    render(<Tool />);
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue("");
    writeLocal("mt:story-post", JSON.stringify({ v: 1, phase: "result", felder: { ausgangslage: 5 } }));
    cleanup();
    render(<Tool />);
    expect(await screen.findByLabelText("Ausgangslage")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Dein Beitrag" })).not.toBeInTheDocument();
  });
});
