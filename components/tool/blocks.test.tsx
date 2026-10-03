// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureTool } from "@/tests/fixtures";

const list = vi.hoisted(() => ({ tools: [] as unknown[] }));
vi.mock("@/tools", () => ({
  get tools() {
    return list.tools;
  },
}));
const bausteine = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/pitch", async (orig) => ({
  ...(await orig<typeof import("@/lib/pitch")>()),
  loadBausteine: () => bausteine.value,
}));

import { AlpernaPitch } from "@/components/tool/AlpernaPitch";
import { CopyButton } from "@/components/tool/CopyButton";
import { LegalDisclaimer } from "@/components/tool/LegalDisclaimer";
import { RelatedTools } from "@/components/tool/RelatedTools";
import { ResultCard } from "@/components/tool/ResultCard";
import { ScoreBadge, scoreBand } from "@/components/tool/ScoreBadge";
import { BAUSTEIN_NAMES } from "@/lib/pitch";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("ScoreBadge", () => {
  it("ordnet Stufen in Worten zu (nie nur Farbe)", () => {
    expect(scoreBand(0.8).text).toBe("stark");
    expect(scoreBand(0.75).text).toBe("stark");
    expect(scoreBand(0.5).text).toBe("ausbaufähig");
    expect(scoreBand(0.4).text).toBe("ausbaufähig");
    expect(scoreBand(0.39).text).toBe("Handlungsbedarf");
  });
  it("zeigt Punktzahl, Stufe und ein zugängliches Meter", () => {
    render(<ScoreBadge score={72.4} label="Digitaler Auftritt" />);
    const meter = screen.getByRole("meter", { name: "Digitaler Auftritt" });
    expect(meter).toHaveAttribute("aria-valuenow", "72");
    expect(meter).toHaveAttribute("aria-valuetext", "72 von 100, ausbaufähig");
    expect(screen.getByText("ausbaufähig")).toBeInTheDocument();
  });
  it("begrenzt Werte ausserhalb der Skala und übersteht NaN und max 0", () => {
    const { rerender } = render(<ScoreBadge score={250} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ScoreBadge score={-10} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ScoreBadge score={NaN} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ScoreBadge score={5} max={0} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "100");
  });
});

describe("ResultCard", () => {
  it("zeigt Titel, Inhalt und Aktionen", () => {
    render(
      <ResultCard title="Dein Ergebnis" actions={<button>Kopieren</button>}>
        <p>Inhalt</p>
      </ResultCard>,
    );
    expect(screen.getByRole("region", { name: "Dein Ergebnis" })).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopieren" })).toBeInTheDocument();
  });
});

describe("LegalDisclaimer", () => {
  it("zeigt den Hinweistext und den Stand als TT.MM.JJJJ", () => {
    render(<LegalDisclaimer stand="2026-10-03">Text aus content/legal.</LegalDisclaimer>);
    expect(screen.getByRole("complementary", { name: "Rechtlicher Hinweis" })).toBeInTheDocument();
    expect(screen.getByText("Text aus content/legal.")).toBeInTheDocument();
    expect(screen.getByText("Stand der Rechtstexte: 03.10.2026")).toBeInTheDocument();
  });
});

describe("CopyButton", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("kopiert und meldet es zugänglich", async () => {
    const u = userEvent.setup();
    render(<CopyButton text="Hallo" />);
    await u.click(screen.getByRole("button", { name: "Text kopieren" }));
    expect(await navigator.clipboard.readText()).toBe("Hallo");
    expect(screen.getByRole("button", { name: "Kopiert" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("In die Zwischenablage kopiert.");
  });
  it("erzeugt den Text erst beim Klick, wenn eine Funktion übergeben wird", async () => {
    const u = userEvent.setup();
    const make = vi.fn(() => "Frisch");
    render(<CopyButton text={make} label="Kopieren" />);
    expect(make).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Kopieren" }));
    expect(make).toHaveBeenCalledTimes(1);
    expect(await navigator.clipboard.readText()).toBe("Frisch");
  });
  it("fällt auf execCommand zurück und meldet einen Fehlschlag ruhig", async () => {
    const u = userEvent.setup();
    render(<CopyButton text="Hallo" />);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("nein")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    await u.click(screen.getByRole("button", { name: "Text kopieren" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Kopiert" })).toBeInTheDocument());
    expect(document.execCommand).toHaveBeenCalledWith("copy");

    document.execCommand = vi.fn().mockReturnValue(false);
    await u.click(screen.getByRole("button", { name: /Kopiert|Text kopieren/ }));
    expect(await screen.findByText(/Kopieren hat nicht geklappt/, { selector: "span.text-destructive" })).toBeInTheDocument();
  });
});

describe("RelatedTools", () => {
  const a = fixtureTool();
  const b = fixtureTool({ slug: "positionierung", name: "Positionierung", keyword: "Positionierung", related: [], pathStep: { path: "strategie", order: 4 } });
  const c = fixtureTool({ slug: "persona", name: "Persona", keyword: "Persona", related: [], pathStep: { path: "strategie", order: 3 } });

  it("zeigt verwandte Werkzeuge als Links und den nächsten Schritt im Pfad", () => {
    list.tools = [a, b, c];
    render(<RelatedTools slug="icp-builder" />);
    expect(screen.getByRole("heading", { name: "Verwandte Werkzeuge" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Positionierung/ })).toHaveAttribute("href", "/tools/positionierung");
    // Persona steht in der Verwandten-Liste und ist zugleich der nächste Schritt im Pfad
    const personaLinks = screen.getAllByRole("link", { name: /Persona/ });
    expect(personaLinks).toHaveLength(2);
    personaLinks.forEach((l) => expect(l).toHaveAttribute("href", "/tools/persona"));
    expect(screen.getByText(/Nächster Schritt im Pfad «Strategie»/)).toBeInTheDocument();
  });
  it("zeigt nichts, wenn es weder Verwandte noch einen nächsten Schritt gibt", () => {
    list.tools = [fixtureTool({ related: [], pathStep: { path: "strategie", order: 1 } })];
    const { container } = render(<RelatedTools slug="icp-builder" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AlpernaPitch", () => {
  const items = BAUSTEIN_NAMES.map((name) => ({ name, text: `${name}: Wir kümmern uns. Du hast Ruhe.`, beweis: `Beweis ${name}` }));
  const data = (over: Record<string, unknown> = {}) => ({ einstiegsangebot: "Onepage zum Fixpreis", items, issues: [], open: [], ...over });

  it("trägt die feste Überschrift und drei Sätze aus dem Tool plus Bausteintext", () => {
    bausteine.value = data();
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    render(<AlpernaPitch toolName="ICP-Builder" toolSlug="icp-builder" fields={{ problem: "Dein Profil ist ungepflegt.", baustein: "Google Business Profil", beweis: "Live in zwei Wochen." }} />);
    expect(screen.getByRole("heading", { name: "Wenn du das lieber abgibst" })).toBeInTheDocument();
    expect(screen.getByText("Dein Profil ist ungepflegt.")).toBeInTheDocument();
    expect(screen.getByText(/Google Business Profil: Wir kümmern uns/)).toBeInTheDocument();
    expect(screen.getByText("Live in zwei Wochen.")).toBeInTheDocument();
    expect(screen.queryByText("Onepage zum Fixpreis")).not.toBeInTheDocument(); // Preis nur beim Baustein «Website»
  });
  it("nennt das Einstiegsangebot nur beim Baustein «Website»", () => {
    bausteine.value = data();
    render(<AlpernaPitch fields={{ problem: "p", baustein: "Website", beweis: "b" }} />);
    expect(screen.getByText("Onepage zum Fixpreis")).toBeInTheDocument();
  });
  it("zeigt beide Knöpfe mit WhatsApp-Text, der das Tool nennt, und Umami-Ereignissen", () => {
    bausteine.value = data();
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "+41 79 123 45 67");
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "https://example.com/erstgespraech");
    render(<AlpernaPitch toolName="ICP-Builder" toolSlug="icp-builder" fields={{ baustein: "Website" }} />);
    const wa = screen.getByRole("link", { name: "Kurz schreiben" });
    expect(wa).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/41791234567\?text=/));
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("«ICP-Builder»");
    expect(wa).toHaveAttribute("data-umami-event", "pitch_whatsapp");
    expect(wa).toHaveAttribute("data-umami-event-tool", "icp-builder");
    const first = screen.getByRole("link", { name: "Kostenloses Erstgespräch" });
    expect(first).toHaveAttribute("href", "https://example.com/erstgespraech");
    expect(first).toHaveAttribute("data-umami-event", "pitch_erstgespraech");
  });
  it("lässt Knöpfe weg, deren Ziel fehlt", () => {
    bausteine.value = data();
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "");
    render(<AlpernaPitch fields={{ baustein: "Website" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("zeigt nie TODO-Platzhalter und überlebt eine fehlende Bausteine-Datei", () => {
    bausteine.value = data({ einstiegsangebot: "TODO", items: items.map((i) => ({ ...i, text: "TODO zwei Sätze", beweis: "TODO" })) });
    const { container } = render(<AlpernaPitch fields={{ problem: "Echtes Problem.", baustein: "Website", beweis: "Echter Beweis." }} />);
    expect(container.textContent).not.toMatch(/TODO/);
    expect(screen.getByText("Echtes Problem.")).toBeInTheDocument();
    cleanup();
    bausteine.value = null;
    render(<AlpernaPitch fields={{ problem: "Nur das Problem.", baustein: "Website" }} />);
    expect(screen.getByText("Nur das Problem.")).toBeInTheDocument();
  });
  it("nimmt bei «beweis: @baustein» den Beweis aus den Bausteinen, auch wenn dessen Text noch offen ist", () => {
    bausteine.value = data();
    render(<AlpernaPitch fields={{ problem: "Problem.", baustein: "Website", beweis: "@baustein" }} />);
    expect(screen.getByText("Beweis Website")).toBeInTheDocument();
    expect(screen.queryByText("@baustein")).not.toBeInTheDocument();
    cleanup();
    bausteine.value = data({ items: items.map((i) => ({ ...i, beweis: "TODO Beweis" })) });
    const { container } = render(<AlpernaPitch fields={{ problem: "Problem.", baustein: "Website", beweis: "@baustein" }} />);
    expect(container.textContent).not.toMatch(/TODO|@baustein/);
    cleanup();
    bausteine.value = null;
    const { container: c2 } = render(<AlpernaPitch fields={{ problem: "Problem.", baustein: "Website", beweis: "@baustein" }} />);
    expect(c2.textContent).not.toContain("@baustein");
  });
  it("zeigt nichts, solange weder Text noch Knöpfe vorhanden sind", () => {
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "");
    bausteine.value = data({ einstiegsangebot: "TODO", items: items.map((i) => ({ ...i, text: "TODO", beweis: "TODO" })) });
    const long = render(<AlpernaPitch variant="long" />);
    expect(long.container).toBeEmptyDOMElement();
    cleanup();
    bausteine.value = null;
    const short = render(<AlpernaPitch />);
    expect(short.container).toBeEmptyDOMElement();
    cleanup();
    // Ein einziger Knopf genügt, damit der Abschnitt erscheint.
    vi.stubEnv("NEXT_PUBLIC_ERSTGESPRAECH_URL", "https://example.com/erstgespraech");
    render(<AlpernaPitch variant="long" />);
    expect(screen.getByRole("heading", { name: "Wenn du das lieber abgibst" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kostenloses Erstgespräch" })).toBeInTheDocument();
  });
  it("zeigt in der langen Fassung alle sechs Bausteine", () => {
    bausteine.value = data();
    render(<AlpernaPitch variant="long" />);
    for (const name of BAUSTEIN_NAMES) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByText("Onepage zum Fixpreis")).toBeInTheDocument();
  });
});
