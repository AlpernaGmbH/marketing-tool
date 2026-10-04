import { afterEach, describe, expect, it, vi } from "vitest";
import { logStatus, safeDetail } from "@/lib/log";

afterEach(() => vi.restoreAllMocks());

describe("logStatus", () => {
  it("schreibt Route, Statuscode und Stichwort", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logStatus("/api/x", 200, "ok");
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ route: "/api/x", status: 200, note: "ok" });
  });

  it("nimmt auf Wunsch eine Fehlerart auf, aber nur aus harmlosen Zeichen", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logStatus("/api/ai", 502, "ai_failed", "RetryError>GatewayInternalServerError:500");
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ detail: "RetryError>GatewayInternalServerError:500" });
  });

  it("kürzt und reinigt die Fehlerart: keine Leerzeichen, kein @, keine Anführungszeichen, höchstens 80 Zeichen", () => {
    expect(safeDetail('Fehler "bei" anna@keller')).toBe("Fehlerbeiannakeller");
    expect(safeDetail("a".repeat(200)).length).toBe(80);
    expect(safeDetail("A>B:429")).toBe("A>B:429");
    expect(safeDetail("<script>")).not.toContain("<");
  });
});
