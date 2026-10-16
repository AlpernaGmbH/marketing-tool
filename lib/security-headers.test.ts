import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { SECURITY_HEADERS } from "./security-headers";

describe("Sicherheits-Kopfzeilen", () => {
  it("gelten für jede Adresse und sind in next.config.ts eingetragen", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers).toEqual(SECURITY_HEADERS);
  });
  it("verbieten Einbetten, Raten des Inhaltstyps und Gerätezugriffe", () => {
    const get = (k: string) => SECURITY_HEADERS.find((h) => h.key === k)?.value;
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("Permissions-Policy")).toContain("camera=()");
    expect(get("Permissions-Policy")).toContain("microphone=()");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
