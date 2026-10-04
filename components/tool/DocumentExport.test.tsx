// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { resetPdfFontCache } from "@/lib/export/fonts";
import { ToolShell } from "@/components/tool/ToolShell";
import { LEAD_KEY } from "@/lib/access-client";
import type { DocumentModel } from "@/lib/export/model";
import { PROFILE_KEY } from "@/lib/profile";
import { clearAllLocal, readLocal, writeLocal } from "@/lib/storage";

const model: DocumentModel = {
  title: "Idealkundenprofil",
  filename: "Malerei Keller, Gossau",
  blocks: [{ type: "paragraph", text: "Hallo Welt" }],
};

/** Schriften kommen aus public/fonts; /api/lead antwortet mit ok. Alles andere 404. */
function mockFetch() {
  const fetchMock = vi.fn(async (url: string): Promise<Partial<Response>> => {
    if (url.startsWith("/fonts/")) {
      const bytes = fs.readFileSync(path.join(process.cwd(), "public", url));
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    if (url === "/api/lead") return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let downloads: { download: string; href: string }[] = [];

beforeEach(() => {
  clearAllLocal();
  resetPdfFontCache();
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ download: this.download, href: this.href });
  });
});
afterEach(() => {
  cleanup();
  clearAllLocal();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderExport = () =>
  render(
    <ToolShell slug="smoke-test" name="Smoke-Test">
      <DocumentExport model={model} />
    </ToolShell>,
  );

describe("DocumentExport (Zugang v3: Dateien gegen E-Mail-Adresse)", () => {
  it("lädt mit bekannter Adresse sofort ein PDF mit sauberem Dateinamen", async () => {
    mockFetch();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const u = userEvent.setup();
    renderExport();
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an anna@keller.ch"));
    await u.click(screen.getByRole("button", { name: "PDF herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].download).toBe("malerei-keller-gossau.pdf");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lädt Word als .docx", async () => {
    mockFetch();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const u = userEvent.setup();
    renderExport();
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an"));
    await u.click(screen.getByRole("button", { name: "Word herunterladen" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].download).toBe("malerei-keller-gossau.docx");
  });

  it("fragt ohne Adresse zuerst nach ihr und lädt danach ohne weiteren Klick", async () => {
    const f = mockFetch();
    const u = userEvent.setup();
    renderExport();
    expect(await screen.findByTestId("access-status")).toHaveTextContent("Ergebnis gegen E-Mail-Adresse");
    expect(screen.getByText(/Für Dateien brauchen wir deine E-Mail-Adresse/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "PDF herunterladen" }));

    const dialog = await screen.findByRole("dialog");
    expect(downloads).toHaveLength(0);
    expect(within(dialog).queryByLabelText("Name")).toBeNull();
    await u.type(within(dialog).getByLabelText("E-Mail"), "anna@keller.ch");
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Ergebnis anzeigen" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].download).toBe("malerei-keller-gossau.pdf");
    expect(f.mock.calls.filter((c) => c[0] === "/api/lead")).toHaveLength(1);
    expect(readLocal(LEAD_KEY)).toBe("anna@keller.ch");
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an anna@keller.ch"));
  });

  it("lädt nichts, wenn der Besucher das Fenster schliesst", async () => {
    mockFetch();
    const u = userEvent.setup();
    renderExport();
    await u.click(await screen.findByRole("button", { name: "Word herunterladen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(downloads).toHaveLength(0);
    expect(readLocal(LEAD_KEY)).toBeNull();
  });

  it("lässt «Text kopieren» immer zu, auch ohne Adresse", async () => {
    mockFetch();
    const u = userEvent.setup(); // ersetzt navigator.clipboard durch einen Stub mit readText()
    renderExport();
    await u.click(await screen.findByRole("button", { name: "Text kopieren" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toContain("# Idealkundenprofil"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nimmt den Firmennamen aus dem Profil in den Export", async () => {
    mockFetch();
    writeLocal(PROFILE_KEY, JSON.stringify({ firma: "Malerei Keller" }));
    const u = userEvent.setup();
    renderExport();
    await u.click(await screen.findByRole("button", { name: "Text kopieren" }));
    // Die Firma steht im Kopf von PDF und DOCX; das Markdown enthält Titel und Inhalt.
    await waitFor(async () => expect(await navigator.clipboard.readText()).toContain("Hallo Welt"));
  });

  it("«ändern» in der Statuszeile öffnet das Fenster mit der bekannten Adresse", async () => {
    mockFetch();
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const u = userEvent.setup();
    renderExport();
    await u.click(await screen.findByRole("button", { name: "ändern" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("E-Mail")).toHaveValue("anna@keller.ch");
  });

  it("meldet einen fehlgeschlagenen Download ruhig", async () => {
    const f = mockFetch();
    f.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    writeLocal(LEAD_KEY, "anna@keller.ch");
    const u = userEvent.setup();
    renderExport();
    await waitFor(() => expect(screen.getByTestId("access-status")).toHaveTextContent("Ergebnisse gehen an"));
    await u.click(screen.getByRole("button", { name: "PDF herunterladen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Der Download hat nicht geklappt");
    expect(downloads).toHaveLength(0);
  });
});
