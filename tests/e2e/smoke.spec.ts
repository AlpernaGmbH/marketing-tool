import { expect, test } from "@playwright/test";

const TOOL = "smoke-test";
const lead = (over: Record<string, unknown> = {}) => ({
  name: "Anna Keller",
  firma: "Malerei Keller",
  email: "anna@keller.ch",
  telefon: "071 123 45 67",
  consent: true,
  tool: TOOL,
  ...over,
});

test.describe("Seiten", () => {
  test("Startseite lädt mit H1, Skip-Link und Kategorien", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Marketing-Werkzeuge");
    await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Kategorien" }).first()).toBeVisible();
  });

  test("mobil bei 375 px: kein horizontaler Überlauf, Menü öffnet", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Menü" }).click();
    await expect(page.getByRole("link", { name: "Strategie" }).last()).toBeVisible();
    await context.close();
  });

  test("robots.txt sperrt /api und /profil, sitemap.xml ist erreichbar", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /profil");
    expect(robots).toContain("Sitemap:");
    expect((await request.get("/sitemap.xml")).status()).toBe(200);
  });

  test("Rechts-Platzhalter sind noindex", async ({ page }) => {
    for (const path of ["/impressum", "/datenschutz", "/ueber", "/profil"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });

  test("/profil speichert Eingaben im Browser und behält sie nach dem Neuladen", async ({ page }) => {
    await page.goto("/profil");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Ort").fill("Gossau");
    await page.reload();
    await expect(page.getByLabel("Firma", { exact: true })).toHaveValue("Malerei Keller");
    await expect(page.getByLabel("Ort")).toHaveValue("Gossau");
  });
});

test.describe("Zugang: ein freier Durchlauf, dann Formular", () => {
  test("frische IP → gezählt → gesperrt → Formular → freigeschaltet", async ({ request }) => {
    const ip = { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` };
    // mt_gate ist «Secure». Der Cookie-Jar der API-Fixture schickt solche Cookies nicht über http
    // zurück, darum führen wir das Cookie wie ein Browser von Hand mit.
    let cookie = "";
    const post = async (path: string, data: unknown) => {
      const res = await request.post(path, { data, headers: { ...ip, ...(cookie ? { cookie } : {}) } });
      const set = res.headers()["set-cookie"];
      if (set) cookie = set.split(";")[0];
      return res;
    };

    const first = await (await post("/api/access", { tool: TOOL })).json();
    expect(first).toMatchObject({ allowed: true, unlocked: false, reason: "free_run" });

    const done = await post("/api/access/complete", { tool: TOOL });
    expect(done.status()).toBe(200);
    expect(done.headers()["set-cookie"]).toMatch(/mt_gate=.*HttpOnly/i);

    const second = await (await post("/api/access", { tool: TOOL })).json();
    expect(second).toMatchObject({ allowed: false, unlocked: false, reason: "free_run_used" });

    const sent = await post("/api/lead", lead());
    expect(sent.status()).toBe(200);

    const third = await (await post("/api/access", { tool: TOOL })).json();
    expect(third).toMatchObject({ allowed: true, unlocked: true, reason: "unlocked" });
  });

  test("ein Cookie von woanders ändert nichts: ohne Cookie gilt der freie Durchlauf", async ({ playwright }) => {
    const fresh = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3100" });
    const res = await fresh.post("/api/access", { data: { tool: TOOL } });
    expect((await res.json()).allowed).toBe(true);
    await fresh.dispose();
  });

  test("ein gefälschtes Cookie schaltet nicht frei", async ({ playwright }) => {
    const forged = Buffer.from(JSON.stringify({ runs: 0, unlocked: true, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
    const ctx = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
      extraHTTPHeaders: { cookie: `mt_gate=${forged}.AAAAAAAA` },
    });
    const body = await (await ctx.post("/api/access", { data: { tool: TOOL } })).json();
    expect(body.unlocked).toBe(false);
    await ctx.dispose();
  });

  test("unbekannte Tools und kaputte Bodies liefern 400", async ({ request }) => {
    expect((await request.post("/api/access", { data: { tool: "gibt-es-nicht" } })).status()).toBe(400);
    expect((await request.post("/api/access", { data: {} })).status()).toBe(400);
    expect((await request.post("/api/access/complete", { data: { tool: 42 } })).status()).toBe(400);
  });
});

test.describe("Leads", () => {
  test("der Lead kommt bei n8n an, mit genau den erlaubten Feldern", async ({ request }) => {
    const email = `smoke-${Date.now()}@example.ch`;
    const res = await request.post("/api/lead", { data: lead({ email }), headers: { "x-forwarded-for": "203.0.113.77" } });
    expect(res.status()).toBe(200);

    const received = (await (await request.get("http://127.0.0.1:3998/received")).json()) as Record<string, string>[];
    const got = received.find((l) => l.email === email);
    expect(got).toBeTruthy();
    expect(Object.keys(got!).sort()).toEqual(["email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"]);
    expect(got).toMatchObject({ tool: TOOL, kategorie: "strategie", quelle: "tools.alperna.ch" });
  });

  test("ungültige Formulare liefern 400 und schalten nichts frei", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3100" });
    for (const bad of [lead({ consent: false }), lead({ email: "keller" }), lead({ honeypot: "https://spam.example" }), lead({ tool: "x" })]) {
      expect((await ctx.post("/api/lead", { data: bad })).status()).toBe(400);
    }
    expect((await (await ctx.post("/api/access", { data: { tool: TOOL } })).json()).unlocked).toBe(false);
    await ctx.dispose();
  });
});
