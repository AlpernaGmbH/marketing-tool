// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { isPng } from "@/lib/export/png";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";

const downloads: { name: string; mime: string; bytes: Uint8Array }[] = [];
vi.mock("@/lib/download", () => ({
  downloadBytes: (bytes: Uint8Array, name: string, mime: string) => downloads.push({ name, mime, bytes }),
}));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// Fake-Kontext für das Canvas (jsdom zeichnet nichts). Merkt sich Texte und Bildgrössen.
let texts: string[] = [];
let sizes: { w: number; h: number }[] = [];
function fakeContext(canvas: HTMLCanvasElement) {
  return {
    font: "10px sans-serif",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fillRect() {
      sizes.push({ w: canvas.width, h: canvas.height });
    },
    measureText(s: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: s.length * size * 0.5 };
    },
    fillText(text: string) {
      texts.push(text);
    },
    drawImage() {},
  };
}

let posts: { url: string; body: Record<string, string> }[] = [];

beforeEach(() => {
  clearAllLocal();
  posts = [];
  texts = [];
  sizes = [];
  downloads.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return fakeContext(this) as unknown as CanvasRenderingContext2D;
  });
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback({ arrayBuffer: async () => PNG_BYTES.buffer.slice(0) } as unknown as Blob);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/gate") return new Response(JSON.stringify({ email: null }), { status: 200 }); // Frage der ToolShell nach der gemerkten Adresse, kein CRM-Aufruf
      posts.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const profile = { organisationstyp: "kmu", firma: "Malerei Keller", website: "malerei-keller.ch", ort: "Gossau" };
const ready = () => waitFor(() => expect(screen.getByRole("button", { name: "Grafiken erstellen" })).toBeEnabled());

async function fill(user: ReturnType<typeof userEvent.setup>, extra: { preis?: string; frueher?: string } = {}) {
  await user.type(screen.getByLabelText("Titel"), "Herbstaktion");
  await user.type(screen.getByLabelText("Angebot"), "Fassadenanstrich inklusive Gerüst");
  if (extra.preis) await user.type(screen.getByLabelText("Preis in CHF (freiwillig)"), extra.preis);
  if (extra.frueher) await user.type(screen.getByLabelText("Früherer Preis in CHF (freiwillig)"), extra.frueher);
  await user.type(screen.getByLabelText("Aufforderung"), "Termin vereinbaren");
}

async function giveEmail(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));
}

describe("angebotsgrafik: Werkzeug im Browser", () => {
  it("meldet einen fehlenden Titel, ohne das Fenster zu öffnen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    expect(await screen.findByText("Gib einen Titel an, mindestens 3 Zeichen.")).toBeInTheDocument();
    expect(screen.getByText("Gib eine Aufforderung an, zum Beispiel «Termin vereinbaren».")).toBeInTheDocument();
    expect(screen.getByText(/Bitte prüfe 3 Angaben/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Angebotsgrafik" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Titel"));
  });

  it("zeigt die Vorschau beim Tippen, beschreibt sie als Text und wechselt das Format", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    // vorbelegt aus dem Profil: Firma, Kontaktzeile aus der Website; Formate Feed und Story
    expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller");
    expect(screen.getByLabelText("Telefon, Website oder Ort (freiwillig)")).toHaveValue("malerei-keller.ch");
    expect(screen.getByRole("checkbox", { name: "Feed 1:1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Story 9:16" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Feed 4:5" })).not.toBeChecked();

    const canvas = screen.getByTestId("ag-vorschau-canvas");
    expect(canvas).toHaveAttribute("role", "img");
    expect(canvas.getAttribute("aria-label")).toContain("Vorschau Feed 1:1");
    expect(canvas.getAttribute("aria-label")).toContain("Herbstaktion"); // Beispieltext, solange das Feld leer ist
    expect(screen.getByText(/Leere Felder zeigt die Vorschau mit Beispieltexten/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Titel"), "Wintertarif");
    await waitFor(() => expect(canvas.getAttribute("aria-label")).toContain("Wintertarif"));
    expect(texts).toContain("Wintertarif");
    expect(canvas).toHaveAttribute("width", "1080");
    expect(canvas).toHaveAttribute("height", "1080");

    await user.selectOptions(screen.getByLabelText("Vorschau-Format"), "Story 9:16");
    await waitFor(() => expect(screen.getByTestId("ag-vorschau-canvas")).toHaveAttribute("height", "1920"));
    expect(screen.getByTestId("ag-vorschau-canvas").getAttribute("aria-label")).toContain("Vorschau Story 9:16");
    // Nichts davon ist ein Ergebnis: kein Fenster, kein CRM
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("fragt zuerst die Adresse, zeigt dann die Grafiken und schickt Eingabe und Ausgabe ans CRM", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { preis: "4900", frueher: "5600" });
    await user.type(screen.getByLabelText("Gültig bis (freiwillig)"), "2099-11-30");
    await user.click(screen.getByRole("radio", { name: "Handwerk" }));
    await user.click(screen.getByRole("checkbox", { name: "Story 9:16" })); // Story ab, Feed bleibt
    await user.click(screen.getByRole("checkbox", { name: "Google-Beitrag 4:3" }));
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    expect(screen.queryByRole("region", { name: "Deine Angebotsgrafik" })).not.toBeInTheDocument();
    await giveEmail(user);

    const card = await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    const list = within(card).getByRole("list", { name: "Grafiken" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByRole("img", { name: "Grafik Feed 1:1" })).toHaveAttribute("width", "1080");
    expect(within(list).getByRole("img", { name: "Grafik Google-Beitrag 4:3" })).toHaveAttribute("width", "1200");
    expect(within(card).getByRole("button", { name: "PNG herunterladen: Feed 1:1" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PNG herunterladen: Google-Beitrag 4:3" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Story/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Alternativtext kopieren" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Neu beginnen" })).toBeInTheDocument();
    const hinweise = within(card).getByRole("list", { name: "Hinweise zum Veröffentlichen" });
    expect(hinweise).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    expect(hinweise).not.toHaveTextContent("250 Pixel"); // keine Story gewählt
    expect(texts).toContain("CHF 4'900.-");
    expect(texts).toContain("CHF 5'600.-");
    expect(texts).toContain("Gültig bis 30.11.2099");

    // CRM: lesbare Eingabe und Ausgabe, genau ein Ergebnis, kein Bild
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.tool).toBe("angebotsgrafik");
    expect(result.firma).toBe("Malerei Keller");
    expect(result.eingabe.split("\n")[0]).toBe("Titel: Herbstaktion");
    expect(result.eingabe).toContain("Preis: CHF 4'900.-");
    expect(result.eingabe).toContain("Früherer Preis: CHF 5'600.-");
    expect(result.eingabe).toContain("Vorlage: Handwerk");
    expect(result.eingabe).toContain("Formate: Feed 1:1, Google-Beitrag 4:3");
    expect(result.eingabe).toContain("Logo: nein");
    expect(result.ausgabe.split("\n")[0]).toBe("Angebotsgrafik «Herbstaktion»: 2 Formate");
    expect(result.ausgabe).toContain("Feed 1:1: 1080 × 1080 Pixel");
    expect(result.ausgabe).toContain("PNG im Browser erzeugt, nichts hochgeladen.");
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(1);

    // Stand: phase «result» mit Ergebnis (Pfad-Fortschritt); nach dem Neuladen steht das Ergebnis ohne neue Anfrage
    const saved = JSON.parse(readLocal("mt:angebotsgrafik")!);
    expect(saved).toMatchObject({ v: 1, phase: "result", vorlage: "handwerk", farbe: "tinte", formate: ["feed", "gbp"], logo: false });
    expect(saved.felder).toMatchObject({ titel: "Herbstaktion", preis: "4900", frueher: "5600", gueltigBis: "2099-11-30", kontakt: "malerei-keller.ch" });
    expect(saved.output.dateien.map((d: { key: string }) => d.key)).toEqual(["feed", "gbp"]);
    cleanup();
    posts = [];
    render(<Tool />);
    expect(await screen.findByRole("region", { name: "Deine Angebotsgrafik" })).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("lädt PNG je Format und ein ZIP mit allen Formaten herunter", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { preis: "1200" });
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    const card = await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // Adresse bekannt: kein zweites Fenster

    await user.click(within(card).getByRole("button", { name: "PNG herunterladen: Story 9:16" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("herbstaktion-story.png");
    expect(downloads[0].mime).toBe("image/png");
    expect(isPng(downloads[0].bytes)).toBe(true);
    expect(sizes.some((s) => s.w === 1080 && s.h === 1920)).toBe(true);

    await user.click(within(card).getByRole("button", { name: "Alle als ZIP herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[1].name).toBe("angebotsgrafik-herbstaktion.zip");
    expect(downloads[1].mime).toBe("application/zip");
    const zip = await JSZip.loadAsync(downloads[1].bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["herbstaktion-feed.png", "herbstaktion-story.png"]);
    expect(isPng(await zip.file("herbstaktion-feed.png")!.async("uint8array"))).toBe(true);
  });

  it("öffnet vor dem Download das Fenster, wenn keine Adresse bekannt ist", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(
      "mt:angebotsgrafik",
      JSON.stringify({
        v: 1,
        phase: "result",
        felder: { titel: "Herbstaktion", angebot: "Fassadenanstrich inklusive Gerüst", preis: "", frueher: "", gueltigBis: "", aufforderung: "Termin vereinbaren", kontakt: "" },
        vorlage: "ruhig",
        farbe: "gold",
        hex: "",
        formate: ["feed"],
        logo: false,
        output: { titel: "Herbstaktion", firma: "Malerei Keller", logo: false, dateien: [{ key: "feed" }] },
      }),
    );
    render(<Tool />);
    const user = userEvent.setup();
    const card = await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    await user.click(within(card).getByRole("button", { name: "PNG herunterladen: Feed 1:1" }));
    expect(downloads).toHaveLength(0);
    await giveEmail(user);
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("herbstaktion-feed.png");
    expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(0); // der Download schickt kein neues Ergebnis
  });

  it("prüft Preis und früheren Preis schon beim Tippen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.getByText("Der frühere Preis muss stimmen. Bei Zweifeln frag eine Fachperson.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Früherer Preis in CHF (freiwillig)"), "5600");
    expect(await screen.findByText("Ein früherer Preis braucht einen Preis.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Preis in CHF (freiwillig)"), "6000");
    expect(await screen.findByText("Der frühere Preis muss grösser sein als der Preis.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Preis in CHF (freiwillig)"));
    await user.type(screen.getByLabelText("Preis in CHF (freiwillig)"), "4900");
    await waitFor(() => expect(screen.queryByText("Der frühere Preis muss grösser sein als der Preis.")).not.toBeInTheDocument());
    // Datum in der Vergangenheit
    fireEvent.change(screen.getByLabelText("Gültig bis (freiwillig)"), { target: { value: "2020-01-01" } });
    expect(await screen.findByText("Das Datum liegt in der Vergangenheit.")).toBeInTheDocument();
  });

  it("weist auf Druckwörter hin, ohne die Eingabe zu sperren", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.getByRole("list", { name: "Vorschläge für die Aufforderung" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Titel"), "Herbstaktion");
    await user.type(screen.getByLabelText("Angebot"), "Fassadenanstrich inklusive Gerüst");
    await user.type(screen.getByLabelText("Aufforderung"), "Jetzt anrufen!");
    expect(screen.getByTestId("ag-hinweis-aufforderung")).toHaveTextContent("Aufforderung: «jetzt» wirkt wie Druck.");
    expect(screen.getByTestId("ag-hinweis-aufforderung")).toHaveTextContent("Ausrufezeichen wirken laut.");
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Jetzt anrufen!");
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    expect(texts).toContain("Jetzt anrufen!");
    // Ein Vorschlag ersetzt den Text und der Hinweis verschwindet
    await user.click(screen.getByRole("button", { name: "Angaben ändern" }));
    await user.click(await screen.findByRole("button", { name: "Termin vereinbaren" }));
    expect(screen.getByLabelText("Aufforderung")).toHaveValue("Termin vereinbaren");
    expect(screen.getByTestId("ag-hinweis-aufforderung")).toHaveTextContent("");
  });

  it("verlangt mindestens ein Format", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user);
    await user.click(screen.getByRole("checkbox", { name: "Feed 1:1" }));
    await user.click(screen.getByRole("checkbox", { name: "Story 9:16" }));
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    expect(await screen.findByText("Wähle mindestens ein Format.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zeigt bei «Eigene Farbe» das Hex-Feld, prüft es und warnt vor schwachem Kontrast", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    expect(screen.queryByLabelText("Farbe als Hex-Wert")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Farbe"), "Eigene Farbe");
    const hex = screen.getByLabelText("Farbe als Hex-Wert");
    await user.type(hex, "grün");
    expect(await screen.findByText("Gib die Farbe als Hex-Wert an, zum Beispiel #1B5E20.")).toBeInTheDocument();
    await user.clear(hex);
    await user.type(hex, "#FFFF99");
    await waitFor(() => expect(screen.getByTestId("ag-farbhinweis")).toHaveTextContent("schwach lesbar"));
    await user.clear(hex);
    await user.type(hex, "#1B5E20");
    await waitFor(() => expect(screen.getByTestId("ag-farbhinweis")).toHaveTextContent(""));
    expect(screen.queryByText("Gib die Farbe als Hex-Wert an, zum Beispiel #1B5E20.")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Farbe"), "Gold");
    await waitFor(() => expect(screen.getByTestId("ag-farbhinweis")).toHaveTextContent("schwach lesbar"));
  });

  it("liest das Logo lokal, nennt es nur als «Logo: ja» und lässt es entfernen", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 400, height: 160, close })));
    render(<Tool />);
    const user = userEvent.setup({ applyAccept: false });
    await ready();
    expect(screen.getByText(/Dein Logo verlässt den Browser nicht/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logo entfernen" })).not.toBeInTheDocument();

    // ein falsches Format wird abgewiesen
    await user.upload(screen.getByLabelText("Logo (freiwillig)"), new File(["x"], "logo.gif", { type: "image/gif" }));
    expect(await screen.findByText("Das ist kein Bild im Format PNG, JPG oder WebP.")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Logo (freiwillig)"), new File([new Uint8Array(10)], "logo.png", { type: "image/png" }));
    expect(await screen.findByRole("button", { name: "Logo entfernen" })).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    await waitFor(() => expect(posts.some((p) => p.url === "/api/result")).toBe(true));
    const result = posts.find((p) => p.url === "/api/result")!.body;
    expect(result.eingabe).toContain("Logo: ja");
    expect(result.eingabe).not.toMatch(/logo\.png|data:|blob:/);
    expect(JSON.parse(readLocal("mt:angebotsgrafik")!).logo).toBe(true);
    expect(readLocal("mt:angebotsgrafik")).not.toMatch(/data:|blob:|logo\.png/);

    await user.click(screen.getByRole("button", { name: "Angaben ändern" }));
    await user.click(await screen.findByRole("button", { name: "Logo entfernen" }));
    expect(close).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Logo entfernen" })).not.toBeInTheDocument();
  });

  it("verlangt Firma oder Logo", async () => {
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    expect(await screen.findByText("Gib den Namen deiner Firma oder deines Vereins an oder wähle ein Logo.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Firma"));
  });

  it("zeigt nach dem Neuladen den Hinweis «Logo neu wählen», wenn das Ergebnis ein Logo hatte", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(
      "mt:angebotsgrafik",
      JSON.stringify({
        v: 1,
        phase: "result",
        felder: { titel: "Herbstaktion", angebot: "Fassadenanstrich inklusive Gerüst", preis: "", frueher: "", gueltigBis: "", aufforderung: "Termin vereinbaren", kontakt: "" },
        vorlage: "ruhig",
        farbe: "tinte",
        hex: "",
        formate: ["feed"],
        logo: true,
        output: { titel: "Herbstaktion", firma: "Malerei Keller", logo: true, dateien: [{ key: "feed" }] },
      }),
    );
    render(<Tool />);
    expect(await screen.findByTestId("ag-logo-neu")).toHaveTextContent("Logo neu wählen");
    expect(screen.getByRole("img", { name: "Grafik Feed 1:1" })).toBeInTheDocument();
  });

  it("macht aus «Angaben ändern» das Formular mit den Werten und aus «Neu beginnen» ein leeres", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    render(<Tool />);
    const user = userEvent.setup();
    await ready();
    await fill(user, { preis: "4900" });
    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    await screen.findByRole("region", { name: "Deine Angebotsgrafik" });

    await user.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByLabelText("Titel")).toHaveValue("Herbstaktion");
    expect(screen.getByLabelText("Preis in CHF (freiwillig)")).toHaveValue(4900);
    expect(JSON.parse(readLocal("mt:angebotsgrafik")!).phase).toBe("edit");

    await user.click(screen.getByRole("button", { name: "Grafiken erstellen" }));
    await screen.findByRole("region", { name: "Deine Angebotsgrafik" });
    await waitFor(() => expect(posts.filter((p) => p.url === "/api/result")).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByLabelText("Titel")).toHaveValue("");
    expect(JSON.parse(readLocal("mt:angebotsgrafik")!)).toMatchObject({ phase: "edit", felder: { titel: "" } });
  });

  it("übersteht kaputte Daten im Speicher", async () => {
    writeLocal(PROFILE_KEY, JSON.stringify(profile));
    writeLocal("mt:angebotsgrafik", "{kaputt");
    render(<Tool />);
    await ready();
    expect(screen.getByLabelText("Titel")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Feed 1:1" })).toBeChecked();
  });
});
