// @vitest-environment jsdom
import JSZip from "jszip";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_KEY } from "@/lib/access-client";
import { brandHits } from "@/lib/brand-rules";
import { downloadBytes } from "@/lib/download";
import { coverCrop, isPng } from "@/lib/export/png";
import { isToolDone } from "@/lib/progress";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import Tool from "./Tool";
import { callsOf, createFakeContext } from "./fake-canvas";
import { DEFAULT_SETTINGS, parseState } from "./logic";

vi.mock("@/lib/download", () => ({ downloadBytes: vi.fn() }));

// Durchlauf im Browser (jsdom): createImageBitmap und Canvas sind gemockt. Geprüft wird die Oberfläche: Dateien lesen und prüfen,
// Einstellungen, Vorschau, E-Mail-Fenster, Ergebnis, Downloads, CRM, Stand und das Freigeben der Bilder.

type Call = { path: string; body: Record<string, unknown> };
type Bitmap = { width: number; height: number; close: ReturnType<typeof vi.fn>; file: string };
type Drawn = ReturnType<typeof createFakeContext> & { canvas: HTMLCanvasElement };

let calls: Call[];
let bitmaps: Bitmap[];
let dims: Record<string, [number, number]>;
let contexts: Drawn[];

const downloads = () => vi.mocked(downloadBytes).mock.calls;

beforeEach(() => {
  clearAllLocal();
  writeLocal(LEAD_KEY, "anna@keller.ch");
  calls = [];
  bitmaps = [];
  dims = {};
  contexts = [];
  vi.mocked(downloadBytes).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/gate") return { ok: true, status: 200, text: async () => "", json: async () => ({ email: null }) }; // Frage der ToolShell nach der gemerkten Adresse, kein CRM-Aufruf
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return { ok: true, status: 200, text: async () => "", json: async () => ({ ok: true }) };
    }),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (file: File) => {
      const [width, height] = dims[file.name] ?? [4000, 3000];
      const bmp: Bitmap = { width, height, close: vi.fn(), file: file.name };
      bitmaps.push(bmp);
      return bmp;
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const fake = createFakeContext();
    contexts.push({ ...fake, canvas: this });
    return fake.ctx as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    const w = this.width;
    const h = this.height;
    cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, w >> 8, w & 255, h >> 8, h & 255])], { type: "image/png" }));
  });
  if (!Blob.prototype.arrayBuffer) {
    Object.defineProperty(Blob.prototype, "arrayBuffer", {
      value: function (this: Blob) {
        return new Response(this).arrayBuffer();
      },
      configurable: true,
    });
  }
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const image = (name: string, type = "image/jpeg") => new File(["bild"], name, { type });
const KELLER_PROFIL = JSON.stringify({ firma: "Malerei Keller", ort: "Gossau" });

async function openForm() {
  const u = userEvent.setup();
  render(<Tool />);
  await screen.findByLabelText("Vorher-Bild");
  await waitFor(() => expect(screen.getByRole("button", { name: "Collage erstellen" })).toBeEnabled());
  return u;
}

async function addImages(u: ReturnType<typeof userEvent.setup>) {
  await u.upload(screen.getByLabelText("Vorher-Bild"), image("fassade-alt.jpg"));
  await u.upload(screen.getByLabelText("Nachher-Bild"), image("fassade-neu.jpg"));
  await waitFor(() => expect(screen.getByTestId("vn-nachher-datei")).toHaveTextContent("fassade-neu.jpg"));
}

const preview = () => screen.getByTestId("vn-vorschau-canvas") as HTMLCanvasElement;
const lastContext = (canvas: HTMLCanvasElement) => [...contexts].reverse().find((c) => c.canvas === canvas)!;
const drawn = (canvas: HTMLCanvasElement) => callsOf(lastContext(canvas).calls, "drawImage").map((c) => c.args as unknown[]);

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

async function create(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
  return screen.findByRole("region", { name: "Deine Collage" });
}

describe("Vorher-Nachher-Collage im Browser: Formular", () => {
  it("zeigt Bilder, Layout, Beschriftung, Logo, Formate und Vorschau mit den Voreinstellungen", async () => {
    await openForm();
    expect(screen.getByLabelText("Vorher-Bild")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("Nachher-Bild")).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(screen.getAllByText(/PNG, JPG oder WebP bis 15 MB und 8'000 Pixel an einer Seite/)).toHaveLength(2);
    const layout = screen.getByRole("radiogroup", { name: "Layout" });
    expect(within(layout).getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Nebeneinander", "Untereinander", "Schieber"]);
    expect(within(layout).getByRole("radio", { name: "Nebeneinander" })).toBeChecked();
    expect(screen.queryByLabelText("Trennlinie")).not.toBeInTheDocument();
    const beschriftung = screen.getByRole("radiogroup", { name: "Beschriftung" });
    expect(within(beschriftung).getByRole("radio", { name: "Vorher und Nachher" })).toBeChecked();
    expect(screen.getByLabelText("Logo (freiwillig)")).toHaveAttribute("type", "file");
    expect(screen.getByText("Dein Logo verlässt den Browser nicht.", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Ecke des Logos")).toHaveValue("ur");
    expect(screen.getByLabelText("Grösse des Logos")).toHaveValue("14");
    const formate = screen.getByRole("group", { name: "Formate" });
    expect(within(formate).getByLabelText("Feed 1:1")).toBeChecked();
    expect(within(formate).getByLabelText("Feed 4:5")).not.toBeChecked();
    expect(within(formate).getByLabelText("Story 9:16")).not.toBeChecked();
    expect(within(formate).queryByLabelText(/Google/)).not.toBeInTheDocument();
    // Die Vorschau-Knöpfe erscheinen erst, wenn mindestens zwei Formate gewählt sind.
    expect(screen.queryByRole("group", { name: "Vorschau" })).not.toBeInTheDocument();
    expect(preview()).toHaveAccessibleName(/^Vorschau Feed 1:1: zwei Bilder nebeneinander.*Es fehlt noch: Vorher-Bild und Nachher-Bild\.$/);
    expect(screen.getByText(/verlassen ihn nie/)).toBeInTheDocument();
    expectCalmText("Formular");
  });

  it("hat zu jedem Zuschnitt-Regler ein Label mit Wertanzeige und sperrt sie ohne Bild", async () => {
    await openForm();
    for (const [label, value] of [
      ["Zoom Vorher", "1"],
      ["Zoom Nachher", "1"],
      ["Ausschnitt waagrecht Vorher", "0"],
      ["Ausschnitt senkrecht Vorher", "0"],
      ["Ausschnitt waagrecht Nachher", "0"],
      ["Ausschnitt senkrecht Nachher", "0"],
    ] as const) {
      const range = screen.getByLabelText(label);
      expect(range).toHaveAttribute("type", "range");
      expect(range).toHaveValue(value);
      expect(range).toBeDisabled();
    }
    expect(screen.getByLabelText("Zoom Vorher")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Zoom Vorher")).toHaveAttribute("max", "4");
    expect(screen.getByLabelText("Zoom Vorher")).toHaveAttribute("step", "0.1");
    expect(screen.getByLabelText("Ausschnitt waagrecht Vorher")).toHaveAttribute("min", "-100");
    expect(screen.getByLabelText("Grösse des Logos")).toHaveAttribute("min", "8");
    expect(screen.getByLabelText("Grösse des Logos")).toHaveAttribute("max", "24");
  });

  it("belegt die Firma aus dem Profil vor und fragt sie nicht erneut", async () => {
    writeLocal(PROFILE_KEY, KELLER_PROFIL);
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller"));
  });

  it("meldet fehlende Bilder in #vn-error, setzt den Fokus auf das erste und fragt noch nicht nach der Adresse", async () => {
    clearAllLocal();
    const u = await openForm();
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    const alert = document.getElementById("vn-error")!;
    expect(alert).toHaveAttribute("role", "alert");
    expect(within(alert).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Wähle das Vorher-Bild.", "Wähle das Nachher-Bild."]);
    expect(screen.getByLabelText("Vorher-Bild")).toHaveFocus();
    expect(screen.getByLabelText("Vorher-Bild")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    // Mit einem Bild bleibt nur das andere
    await u.upload(screen.getByLabelText("Vorher-Bild"), image("fassade-alt.jpg"));
    await waitFor(() => expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("fassade-alt.jpg"));
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    expect(alert).toHaveTextContent("Wähle das Nachher-Bild.");
    expect(within(alert).queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nachher-Bild")).toHaveFocus();
  });

  it("weist eine Datei ab, die kein Bild ist, sofort und ohne sie zu lesen", async () => {
    render(<Tool />);
    const u = userEvent.setup({ applyAccept: false });
    await u.upload(await screen.findByLabelText("Vorher-Bild"), new File(["%PDF"], "angebot.pdf", { type: "application/pdf" }));
    const alert = document.getElementById("vn-error")!;
    await waitFor(() => expect(alert).toHaveTextContent("Vorher-Bild: Das ist kein Bild im Format PNG, JPG oder WebP."));
    expect(screen.getByLabelText("Vorher-Bild")).toHaveAttribute("aria-invalid", "true");
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(screen.getByTestId("vn-vorher-datei")).toBeEmptyDOMElement();
  });

  it("weist eine Datei über 15 MB ab, bevor sie gelesen wird", async () => {
    render(<Tool />);
    const u = userEvent.setup();
    const gross = image("riesig.jpg");
    Object.defineProperty(gross, "size", { value: 15 * 1024 * 1024 + 1 });
    await u.upload(await screen.findByLabelText("Nachher-Bild"), gross);
    await waitFor(() => expect(document.getElementById("vn-error")).toHaveTextContent("Nachher-Bild: Das Bild ist grösser als 15 MB."));
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("weist ein Bild über 8'000 Pixel ab und gibt es frei", async () => {
    dims["panorama.jpg"] = [9000, 2000];
    render(<Tool />);
    const u = userEvent.setup();
    await u.upload(await screen.findByLabelText("Vorher-Bild"), image("panorama.jpg"));
    await waitFor(() => expect(document.getElementById("vn-error")).toHaveTextContent("Vorher-Bild: Das Bild ist grösser als 8'000 Pixel an einer Seite."));
    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);
  });

  it("meldet eine Datei, die sich nicht lesen lässt, in einem Satz", async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new DOMException("The source image could not be decoded.", "InvalidStateError"));
    render(<Tool />);
    const u = userEvent.setup();
    await u.upload(await screen.findByLabelText("Vorher-Bild"), image("kaputt.jpg"));
    await waitFor(() => expect(document.getElementById("vn-error")).toHaveTextContent("Vorher-Bild: Das Bild konnte nicht gelesen werden."));
    // Ein gutes Bild räumt die Meldung auf
    await u.upload(screen.getByLabelText("Vorher-Bild"), image("gut.jpg"));
    await waitFor(() => expect(document.getElementById("vn-error")).toBeEmptyDOMElement());
  });

  it("liest zwei Bilder, zeigt Name und Mass und zeichnet sie in die Vorschau", async () => {
    dims["fassade-neu.jpg"] = [3000, 4000];
    const u = await openForm();
    await addImages(u);
    expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("Gelesen: fassade-alt.jpg (4'000 × 3'000 Pixel)");
    expect(screen.getByTestId("vn-nachher-datei")).toHaveTextContent("Gelesen: fassade-neu.jpg (3'000 × 4'000 Pixel)");
    expect(screen.getAllByRole("button", { name: /^Bild entfernen/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Bild entfernen: Vorher-Bild",
      "Bild entfernen: Nachher-Bild",
    ]);
    expect(preview()).not.toHaveAccessibleName(/Es fehlt noch/);
    await waitFor(() => expect(drawn(preview())).toHaveLength(2));
    const [a, b] = drawn(preview());
    expect(a[0]).toBe(bitmaps[0]);
    expect(b[0]).toBe(bitmaps[1]);
    // Die Vorschau ist kleiner als das Format, die Zeichnung rechnet in Format-Pixeln: 537 breit je Hälfte
    expect(a.slice(5)).toEqual([0, 0, 537, 1080]);
    const sb = coverCrop(3000, 4000, 537, 1080);
    expect(b.slice(1, 5)).toEqual([sb.x, sb.y, sb.w, sb.h]);
    expect(callsOf(lastContext(preview()).calls, "scale")[0].args[0]).toBeCloseTo(720 / 1080);
    // Zuschnitt-Regler gehen jetzt
    expect(screen.getByLabelText("Zoom Vorher")).toBeEnabled();
  });

  it("nimmt ein Bild per Ziehen auf die Fläche an", async () => {
    await openForm();
    fireEvent.drop(screen.getByTestId("vn-vorher-feld"), { dataTransfer: { files: [image("gezogen.jpg")] } });
    await waitFor(() => expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("Gelesen: gezogen.jpg"));
  });

  it("wechselt das Layout: Schieber zeigt die Trennlinie, die Vorschau beschreibt sie, Untereinander blendet sie aus", async () => {
    const u = await openForm();
    await u.click(screen.getByRole("radio", { name: "Schieber" }));
    const linie = screen.getByLabelText("Trennlinie");
    expect(linie).toHaveValue("50");
    expect(linie).toHaveAttribute("min", "20");
    expect(linie).toHaveAttribute("max", "80");
    expect(screen.getByLabelText("Trennlinie").closest("div")).toHaveTextContent("50 %");
    expect(preview()).toHaveAccessibleName(/Schieber mit senkrechter Trennlinie bei 50 %/);
    fireEvent.change(linie, { target: { value: "30" } });
    expect(preview()).toHaveAccessibleName(/Trennlinie bei 30 %/);
    await u.click(screen.getByRole("radio", { name: "Untereinander" }));
    expect(screen.queryByLabelText("Trennlinie")).not.toBeInTheDocument();
    expect(preview()).toHaveAccessibleName(/zwei Bilder untereinander, oben das Vorher-Bild/);
    expect(screen.getByText(/Richtwert von Alperna, keine Statistik\./)).toBeInTheDocument();
  });

  it("legt Zoom und Ausschnitt in die Zeichnung und zeigt den Wert", async () => {
    const u = await openForm();
    await addImages(u);
    fireEvent.change(screen.getByLabelText("Zoom Vorher"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Ausschnitt waagrecht Vorher"), { target: { value: "50" } });
    expect(screen.getByLabelText("Zoom Vorher").closest("div")).toHaveTextContent("2 ×");
    expect(screen.getByLabelText("Ausschnitt waagrecht Vorher").closest("div")).toHaveTextContent("50");
    await waitFor(() => {
      const s = coverCrop(4000, 3000, 537, 1080, 2, 0.5, 0);
      expect(drawn(preview())[0].slice(1, 5)).toEqual([s.x, s.y, s.w, s.h]);
    });
    // Das andere Bild bleibt unberührt
    const n = coverCrop(4000, 3000, 537, 1080);
    expect(drawn(preview())[1].slice(1, 5)).toEqual([n.x, n.y, n.w, n.h]);
  });

  it("ändert den Ausschnitt auch durch Ziehen in der Vorschau (Zeiger)", async () => {
    const u = await openForm();
    await addImages(u);
    const canvas = preview();
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 540, bottom: 540, width: 540, height: 540, x: 0, y: 0, toJSON: () => ({}) });
    const event = (type: string, x: number, y: number) =>
      fireEvent(canvas, Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), { pointerId: 1 }));
    event("pointerdown", 100, 200); // linke Hälfte: das Vorher-Bild
    event("pointermove", 150, 200);
    const nach = Number((screen.getByLabelText("Ausschnitt waagrecht Vorher") as HTMLInputElement).value);
    expect(nach).toBeLessThan(0); // das Bild folgt der Hand nach rechts, der Ausschnitt rückt nach links
    event("pointerup", 150, 200);
    event("pointermove", 300, 200); // nach dem Loslassen passiert nichts mehr
    expect(Number((screen.getByLabelText("Ausschnitt waagrecht Vorher") as HTMLInputElement).value)).toBe(nach);
    expect(screen.getByLabelText("Ausschnitt waagrecht Nachher")).toHaveValue("0");
    // Ziehen auf die rechte Hälfte ändert das Nachher-Bild
    event("pointerdown", 400, 200);
    event("pointermove", 380, 200);
    expect(Number((screen.getByLabelText("Ausschnitt waagrecht Nachher") as HTMLInputElement).value)).toBeGreaterThan(0);
    event("pointerup", 380, 200);
  });

  it("verlangt bei «Eigene Wörter» beide Wörter und setzt den Fokus ins erste leere Feld", async () => {
    const u = await openForm();
    await addImages(u);
    await u.click(screen.getByRole("radio", { name: "Eigene Wörter" }));
    const w1 = screen.getByLabelText("Wort für das erste Bild");
    const w2 = screen.getByLabelText("Wort für das zweite Bild");
    expect(w1).toHaveAttribute("maxlength", "20");
    expect(w1).toHaveAccessibleDescription("0 von 20 Zeichen");
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    const alert = document.getElementById("vn-error")!;
    expect(within(alert).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Gib das Wort für das erste Bild an.", "Gib das Wort für das zweite Bild an."]);
    expect(w1).toHaveFocus();
    expect(w1).toHaveAttribute("aria-invalid", "true");
    await u.type(w1, "Alt");
    await u.type(w2, "x".repeat(25));
    expect(w2).toHaveValue("x".repeat(20));
    expect(w2).toHaveAccessibleDescription("20 von 20 Zeichen");
    expect(preview()).toHaveAccessibleName(/Beschriftung «Alt» und «x{20}»/);
    expect(await create(u)).toBeInTheDocument();
  });

  it("verlangt mindestens ein Format", async () => {
    const u = await openForm();
    await addImages(u);
    const feed = screen.getByLabelText("Feed 1:1");
    await u.click(feed);
    expect(screen.queryByRole("group", { name: "Vorschau" })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    expect(document.getElementById("vn-error")).toHaveTextContent("Wähle mindestens ein Format.");
    expect(feed).toHaveFocus();
    await u.click(feed);
    expect(feed).toBeChecked();
  });

  it("wählt die Vorschau unter den gewählten Formaten", async () => {
    const u = await openForm();
    await u.click(screen.getByLabelText("Story 9:16"));
    const tabs = screen.getByRole("group", { name: "Vorschau" });
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(["Feed 1:1", "Story 9:16"]);
    expect(within(tabs).getByRole("button", { name: "Feed 1:1" })).toHaveAttribute("aria-pressed", "true");
    await u.click(within(tabs).getByRole("button", { name: "Story 9:16" }));
    expect(within(tabs).getByRole("button", { name: "Story 9:16" })).toHaveAttribute("aria-pressed", "true");
    expect(preview()).toHaveAccessibleName(/^Vorschau Story 9:16/);
    expect([preview().width, preview().height]).toEqual([720, 1280]); // höchstens 720 Pixel breit, Seitenverhältnis 9:16
  });

  it("liest ein Logo, zeichnet es in die Vorschau und gibt es beim Entfernen frei", async () => {
    dims["logo.png"] = [600, 200];
    const u = await openForm();
    await addImages(u);
    await u.upload(screen.getByLabelText("Logo (freiwillig)"), image("logo.png", "image/png"));
    await waitFor(() => expect(screen.getByTestId("vn-logo-datei")).toHaveTextContent("Gelesen: logo.png (600 × 200 Pixel)"));
    await waitFor(() => expect(drawn(preview())).toHaveLength(3));
    const logo = bitmaps.find((b) => b.file === "logo.png")!;
    expect(drawn(preview())[2][0]).toBe(logo);
    expect(preview()).toHaveAccessibleName(/Logo unten rechts\./);
    await u.selectOptions(screen.getByLabelText("Ecke des Logos"), "ol");
    expect(preview()).toHaveAccessibleName(/Logo oben links\./);
    await u.click(screen.getByRole("button", { name: "Logo entfernen" }));
    expect(logo.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vn-logo-datei")).toBeEmptyDOMElement();
    await waitFor(() => expect(drawn(preview())).toHaveLength(2));
  });

  it("meldet ein Logo, das sich nicht lesen lässt, und blockiert das Ergebnis", async () => {
    const u = await openForm();
    await addImages(u);
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("x"));
    await u.upload(screen.getByLabelText("Logo (freiwillig)"), image("logo.png", "image/png"));
    await waitFor(() => expect(document.getElementById("vn-error")).toHaveTextContent("Logo: Das Bild konnte nicht gelesen werden."));
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    expect(screen.getByLabelText("Logo (freiwillig)")).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Deine Collage" })).not.toBeInTheDocument();
  });
});

describe("Vorher-Nachher-Collage im Browser: Freigeben der Bilder", () => {
  it("gibt ein Bild frei, wenn es ersetzt oder entfernt wird", async () => {
    const u = await openForm();
    await u.upload(screen.getByLabelText("Vorher-Bild"), image("eins.jpg"));
    await waitFor(() => expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("eins.jpg"));
    await u.upload(screen.getByLabelText("Vorher-Bild"), image("zwei.jpg"));
    await waitFor(() => expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("zwei.jpg"));
    const [eins, zwei] = bitmaps;
    await waitFor(() => expect(eins.close).toHaveBeenCalledTimes(1));
    expect(zwei.close).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Bild entfernen: Vorher-Bild" }));
    expect(zwei.close).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Vorher-Bild")).toHaveValue("");
  });

  it("gibt alle Bilder frei, wenn die Seite verlassen wird", async () => {
    dims["logo.png"] = [100, 100];
    const u = await openForm();
    await addImages(u);
    await u.upload(screen.getByLabelText("Logo (freiwillig)"), image("logo.png", "image/png"));
    await waitFor(() => expect(screen.getByTestId("vn-logo-datei")).toHaveTextContent("logo.png"));
    expect(bitmaps).toHaveLength(3);
    cleanup();
    for (const b of bitmaps) expect(b.close).toHaveBeenCalledTimes(1);
  });

  it("behält bei zwei schnell gewählten Dateien die zuletzt gewählte und gibt die andere frei", async () => {
    const resolvers: ((b: Bitmap) => void)[] = [];
    vi.mocked(createImageBitmap).mockImplementation(((file: File) => new Promise<Bitmap>((resolve) => resolvers.push((b) => resolve({ ...b, file: file.name })))) as never);
    render(<Tool />);
    const u = userEvent.setup();
    const input = await screen.findByLabelText("Vorher-Bild");
    await u.upload(input, image("langsam.jpg"));
    await u.upload(input, image("schnell.jpg"));
    const spare = (name: string): Bitmap => ({ width: 100, height: 100, close: vi.fn(), file: name });
    const late = spare("langsam.jpg");
    const fast = spare("schnell.jpg");
    await act(async () => resolvers[1](fast));
    await act(async () => resolvers[0](late));
    await waitFor(() => expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("schnell.jpg"));
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(fast.close).not.toHaveBeenCalled();
  });
});

describe("Vorher-Nachher-Collage im Browser: Ergebnis", () => {
  it("fragt erst beim Erstellen nach der Adresse; «Später» lässt das Formular mit den Bildern stehen und schickt nichts", async () => {
    clearAllLocal();
    const u = await openForm();
    await addImages(u);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Collage erstellen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dein Ergebnis ist bereit.")).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Deine Collage" })).not.toBeInTheDocument();
    expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("fassade-alt.jpg");
    expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(0);
    expect(readLocal("mt:vorher-nachher")).toBeNull();
  });

  it("zeigt je Format eine Collage mit Download, schickt Eingabe und Ausgabe einmal ins CRM und speichert nur Einstellungen", async () => {
    writeLocal(PROFILE_KEY, KELLER_PROFIL);
    dims["fassade-neu.jpg"] = [3000, 4000];
    const u = await openForm();
    await waitFor(() => expect(screen.getByLabelText("Firma")).toHaveValue("Malerei Keller"));
    await addImages(u);
    await u.click(screen.getByRole("radio", { name: "Schieber" }));
    fireEvent.change(screen.getByLabelText("Trennlinie"), { target: { value: "60" } });
    await u.click(screen.getByLabelText("Story 9:16"));
    expect(calls).toHaveLength(0); // vor dem Ergebnis geht nichts raus

    const card = await create(u);
    expect(within(card).getByRole("heading", { name: "Deine Collage" })).toHaveFocus();
    expect(within(card).getByText(/2 Formate, Layout Schieber, Beschriftung «Vorher» und «Nachher»\./)).toBeInTheDocument();
    const list = within(card).getByRole("list", { name: "Collagen" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByRole("img", { name: "Collage Feed 1:1" })).toBeInTheDocument();
    expect(within(list).getByRole("img", { name: "Collage Story 9:16" })).toBeInTheDocument();
    expect(within(list).getByText("1'080 × 1'920 Pixel")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PNG herunterladen: Feed 1:1" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PNG herunterladen: Story 9:16" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "PNG herunterladen: Feed 4:5" })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Neu beginnen" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Caption schreiben" })).toHaveAttribute("href", "/tools/caption-baukasten");
    const hinweise = within(card).getByRole("list", { name: "Hinweise zur Veröffentlichung" });
    expect(hinweise).toHaveTextContent("Richtwert von Alperna, keine Statistik");
    expect(hinweise).toHaveTextContent("Gesichter und Kennzeichen nur, wenn die Personen einverstanden sind");
    expect(hinweise).toHaveTextContent("Alternativtext");
    expect(card).toHaveTextContent("Deine Bilder werden nirgends hochgeladen.");
    expectCalmText("Ergebnis");

    // Die Miniaturen zeigen die Collage mit den gelesenen Bildern (Schieber: Nachher-Bild, dann Vorher-Bild)
    const thumb = within(list).getByRole("img", { name: "Collage Feed 1:1" }) as HTMLCanvasElement;
    expect(drawn(thumb).map((a) => a[0])).toEqual([bitmaps[1], bitmaps[0]]);

    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
    const body = calls.find((c) => c.path === "/api/result")!.body;
    expect(body.tool).toBe("vorher-nachher");
    expect(body.firma).toBe("Malerei Keller");
    expect(String(body.eingabe).split("\n").slice(0, 6)).toEqual([
      "Firma: Malerei Keller",
      "Layout: Schieber, Trennlinie bei 60 %",
      "Beschriftung: Vorher und Nachher",
      "Formate: Feed 1:1, Story 9:16",
      "Logo: nein",
      "Vorher-Bild: fassade-alt.jpg, 4'000 × 3'000 Pixel",
    ]);
    expect(String(body.eingabe)).toContain("Nachher-Bild: fassade-neu.jpg, 3'000 × 4'000 Pixel");
    expect(String(body.ausgabe)).toBe(
      "Vorher-Nachher-Collage: 2 Formate\nFeed 1:1: 1'080 × 1'080 Pixel\nStory 9:16: 1'080 × 1'920 Pixel\nPNG im Browser erzeugt, nichts hochgeladen",
    );

    // Der Stand hat nur Einstellungen, keine Bilder und keine Namen, und zählt für den Pfad als erledigt
    const raw = readLocal("mt:vorher-nachher")!;
    expect(raw).not.toMatch(/fassade|data:|blob:/);
    expect(JSON.parse(raw)).toMatchObject({ v: 1, phase: "result", layout: "schieber", position: 60, formate: ["feed", "story"], output: { formate: ["feed", "story"], logo: false } });
    expect(isToolDone(raw)).toBe(true);
  });

  it("lädt eine PNG-Datei im Format, mit dem Namen der Firma, nach dem Klick", async () => {
    writeLocal(PROFILE_KEY, KELLER_PROFIL);
    const u = await openForm();
    await addImages(u);
    const card = await create(u);
    await u.click(within(card).getByRole("button", { name: "PNG herunterladen: Feed 1:1" }));
    await waitFor(() => expect(downloads()).toHaveLength(1));
    const [bytes, name, mime] = downloads()[0];
    expect(name).toBe("malerei-keller-feed.png");
    expect(mime).toBe("image/png");
    expect(isPng(bytes)).toBe(true);
    expect(Array.from(bytes.slice(8))).toEqual([1080 >> 8, 1080 & 255, 1080 >> 8, 1080 & 255]); // das Canvas hatte die Grösse des Formats
    // Ohne Firma heisst die Datei nach dem Werkzeug
    cleanup();
    clearAllLocal();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const u2 = await openForm();
    await addImages(u2);
    const card2 = await create(u2);
    await u2.click(within(card2).getByRole("button", { name: "PNG herunterladen: Feed 1:1" }));
    await waitFor(() => expect(downloads()).toHaveLength(2));
    expect(downloads()[1][1]).toBe("vorher-nachher-feed.png");
  });

  it("packt alle gewählten Formate in ein ZIP", async () => {
    writeLocal(PROFILE_KEY, KELLER_PROFIL);
    const u = await openForm();
    await addImages(u);
    await u.click(screen.getByLabelText("Feed 4:5"));
    await u.click(screen.getByLabelText("Story 9:16"));
    const card = await create(u);
    await u.click(within(card).getByRole("button", { name: "Alle als ZIP herunterladen" }));
    await waitFor(() => expect(downloads()).toHaveLength(1));
    const [bytes, name, mime] = downloads()[0];
    expect(name).toBe("vorher-nachher-malerei-keller.zip");
    expect(mime).toBe("application/zip");
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(["malerei-keller-feed.png", "malerei-keller-portrait.png", "malerei-keller-story.png"]);
    const story = await zip.file("malerei-keller-story.png")!.async("uint8array");
    expect(isPng(story)).toBe(true);
    expect(Array.from(story.slice(8))).toEqual([1080 >> 8, 1080 & 255, 1920 >> 8, 1920 & 255]);
    await waitFor(() => expect(within(card).getByRole("button", { name: "Alle als ZIP herunterladen" })).toBeEnabled());
  });

  it("fragt vor einem Download nach der Adresse, wenn keine bekannt ist, und lädt nichts", async () => {
    const u = await openForm();
    await addImages(u);
    const card = await create(u);
    act(() => removeLocal(LEAD_KEY));
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnis gegen E-Mail-Adresse"));
    await u.click(within(card).getByRole("button", { name: "PNG herunterladen: Feed 1:1" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(downloads()).toHaveLength(0);
  });

  it("führt über «Angaben ändern» zurück ins Formular mit Bildern und Werten und zählt ein neues Ergebnis erneut", async () => {
    const u = await openForm();
    await addImages(u);
    await u.click(screen.getByRole("radio", { name: "Untereinander" }));
    const card = await create(u);
    await u.click(within(card).getByRole("button", { name: "Angaben ändern" }));
    expect(await screen.findByRole("radio", { name: "Untereinander" })).toBeChecked();
    expect(screen.getByTestId("vn-vorher-datei")).toHaveTextContent("fassade-alt.jpg");
    expect(bitmaps.every((b) => b.close.mock.calls.length === 0)).toBe(true);
    expect(screen.getByRole("radio", { name: "KMU oder Selbständige" })).toHaveFocus(); // erstes Feld des Formulars
    expect(isToolDone(readLocal("mt:vorher-nachher"))).toBe(true); // das frühere Ergebnis bleibt erledigt
    await u.click(screen.getByRole("radio", { name: "Nebeneinander" }));
    await create(u);
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(2));
    expect(String(calls.filter((c) => c.path === "/api/result")[1].body.eingabe)).toContain("Layout: Nebeneinander");
  });

  it("leert mit «Neu beginnen» Formular, Stand und Bilder", async () => {
    const u = await openForm();
    await addImages(u);
    await u.click(screen.getByRole("radio", { name: "Schieber" }));
    const card = await create(u);
    await u.click(within(card).getByRole("button", { name: "Neu beginnen" }));
    expect(await screen.findByRole("radio", { name: "Nebeneinander" })).toBeChecked();
    expect(screen.getByTestId("vn-vorher-datei")).toBeEmptyDOMElement();
    for (const b of bitmaps) expect(b.close).toHaveBeenCalledTimes(1);
    expect(parseState(JSON.parse(readLocal("mt:vorher-nachher")!))).toMatchObject({ phase: "edit", layout: DEFAULT_SETTINGS.layout });
    expect(isToolDone(readLocal("mt:vorher-nachher"))).toBe(false);
  });
});

describe("Vorher-Nachher-Collage im Browser: Stand", () => {
  const gespeichert = JSON.stringify({
    v: 1,
    phase: "result",
    layout: "schieber",
    position: 60,
    beschriftung: "eigene",
    worte: { erstes: "Früher", zweites: "Heute" },
    ecke: "or",
    logoGroesse: 18,
    formate: ["feed", "story"],
    zuschnitt: { vorher: { zoom: 1.5, x: 20, y: 0 }, nachher: { zoom: 1, x: 0, y: 0 } },
    output: { formate: ["feed", "story"], logo: true },
  });

  it("zeigt nach dem Neuladen die Einstellungen und «Bilder neu wählen», ohne das Ergebnis oder das CRM", async () => {
    writeLocal("mt:vorher-nachher", gespeichert);
    await openForm();
    expect(screen.getByTestId("vn-bilder-neu")).toHaveTextContent("Bilder neu wählen");
    expect(screen.getByRole("radio", { name: "Schieber" })).toBeChecked();
    expect(screen.getByLabelText("Trennlinie")).toHaveValue("60");
    expect(screen.getByRole("radio", { name: "Eigene Wörter" })).toBeChecked();
    expect(screen.getByLabelText("Wort für das erste Bild")).toHaveValue("Früher");
    expect(screen.getByLabelText("Wort für das zweite Bild")).toHaveValue("Heute");
    expect(screen.getByLabelText("Ecke des Logos")).toHaveValue("or");
    expect(screen.getByLabelText("Grösse des Logos")).toHaveValue("18");
    expect(screen.getByLabelText("Story 9:16")).toBeChecked();
    expect(screen.getByLabelText("Zoom Vorher")).toHaveValue("1.5");
    expect(screen.queryByRole("region", { name: "Deine Collage" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(isToolDone(readLocal("mt:vorher-nachher"))).toBe(true);
  });

  it("macht aus den gespeicherten Einstellungen mit zwei neuen Bildern ein neues Ergebnis", async () => {
    writeLocal("mt:vorher-nachher", gespeichert);
    const u = await openForm();
    await addImages(u);
    expect(screen.queryByTestId("vn-bilder-neu")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Deine Collage" })).not.toBeInTheDocument(); // erst nach dem Klick
    const card = await create(u);
    expect(within(card).getByText(/Beschriftung «Früher» und «Heute»/)).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/result")).toHaveLength(1));
  });

  it("übersteht kaputte Daten im Speicher", async () => {
    writeLocal("mt:vorher-nachher", "{kaputt");
    await openForm();
    expect(screen.getByRole("radio", { name: "Nebeneinander" })).toBeChecked();
    expect(screen.queryByTestId("vn-bilder-neu")).not.toBeInTheDocument();
    cleanup();
    writeLocal("mt:vorher-nachher", JSON.stringify({ v: 1, phase: "result", layout: 5, formate: "x", output: 3 }));
    await openForm();
    expect(screen.getByRole("radio", { name: "Nebeneinander" })).toBeChecked();
    expect(screen.getByLabelText("Feed 1:1")).toBeChecked();
  });
});
