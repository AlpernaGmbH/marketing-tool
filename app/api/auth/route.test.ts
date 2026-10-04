import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuth } from "@/lib/auth";
import { GET } from "@/app/api/auth/[...all]/route";

let logs: string[];
beforeEach(() => {
  vi.unstubAllEnvs();
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BETTER_AUTH_SECRET"]) vi.stubEnv(k, "");
  resetAuth();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetAuth();
});

describe("/api/auth", () => {
  it("antwortet ohne Einrichtung mit 404 und loggt nur den Statuscode", async () => {
    const res = await GET(new Request("http://localhost/api/auth/get-session"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "auth_disabled" });
    expect(logs.join("\n")).toContain('"route":"/api/auth"');
    expect(logs.join("\n")).not.toContain("get-session");
  });

  it("gibt mit Einrichtung an Better Auth weiter", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-random-secret-with-at-least-32-characters-0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost");
    const res = await GET(new Request("http://localhost/api/auth/get-session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
