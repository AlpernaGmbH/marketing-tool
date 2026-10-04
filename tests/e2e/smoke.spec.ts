import { expect, test } from "@playwright/test";

const TOOL = "digitaler-auftritt-check";
/** Abschnitt (section) nach der id seiner Überschrift. */
const sec = (page: import("@playwright/test").Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
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
    for (const path of ["/", "/strategie", "/vereine", "/tools/digitaler-auftritt-check"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), path).toBe(false);
    }
    await page.goto("/");
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

test.describe("Startseite", () => {
  test("zeigt Hero, vier Pfade plus Vereine, Meistgenutzt, Warum kostenlos, Pitch und sieben Fragen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Menü/ })).toBeHidden();
    // Auf der Startseite gibt es nur das grosse Suchfeld, nicht zusätzlich das aus der Kopfzeile.
    await expect(page.getByRole("search")).toHaveCount(1);
    await expect(page.getByRole("search", { name: "Welches Werkzeug suchst du?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tool finden" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Strategie-Pfad starten" })).toHaveAttribute("href", "/tools/digitaler-auftritt-check");

    const pfade = sec(page, "pfade");
    for (const [name, href] of [["Strategie", "/strategie"], ["Content", "/content"], ["Analyse", "/analyse"], ["Schweiz", "/schweiz"], ["Für Vereine", "/vereine"]]) {
      await expect(pfade.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute("href", href);
    }

    await expect(sec(page, "meistgenutzt").getByRole("link", { name: /Digitaler-Auftritt-Check/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Warum kostenlos?" })).toBeVisible();
    await expect(sec(page, "warum-kostenlos").locator(".content p")).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 2, name: "Marketing in der Schweiz – was anders ist" })).toBeVisible();
    await expect(sec(page, "faq").locator("h3")).toHaveCount(7);
  });

  test("Suche findet das Werkzeug und öffnet es", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Welches Werkzeug suchst du?" }).fill("Auftritt");
    await page.getByRole("link", { name: /Digitaler-Auftritt-Check/ }).first().click();
    await expect(page).toHaveURL(/\/tools\/digitaler-auftritt-check$/);
  });

  test("enthält Organisation, Website und FAQPage als JSON-LD", async ({ page }) => {
    await page.goto("/");
    const types = await page.$$eval('script[type="application/ld+json"]', (nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]));
    expect(types).toEqual(["Organization", "WebSite", "FAQPage"]);
  });
});

test.describe("Kategorieseiten", () => {
  for (const page of ["strategie", "content", "analyse", "schweiz", "ki", "vereine"]) {
    test(`/${page}: eine H1, Einleitung, Hintergrund, fünf Fragen, Canonical, JSON-LD`, async ({ page: p }) => {
      const res = await p.goto(`/${page}`);
      expect(res?.status()).toBe(200);
      await expect(p.locator("h1")).toHaveCount(1);
      await expect(sec(p, "hintergrund")).toBeVisible();
      await expect(sec(p, "fragen").locator("h3")).toHaveCount(5);
      await expect(p.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${page}$`));
      const types = await p.$$eval('script[type="application/ld+json"]', (nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]));
      expect(types).toEqual(["CollectionPage", "FAQPage", "BreadcrumbList"]);
    });
  }

  test("/strategie zeigt den Pfad mit dem Referenz-Werkzeug und Fortschritt 0", async ({ page }) => {
    await page.goto("/strategie");
    // Mit einem einzigen Schritt gibt es keine Pfad-Grafik, nur die Liste.
    await expect(page.getByTestId("path-graphic")).toHaveCount(0);
    await expect(sec(page, "pfad").getByRole("link", { name: /Digitaler-Auftritt-Check/ })).toBeVisible();
    await expect(page.getByRole("search", { name: "Werkzeug suchen" })).toBeVisible(); // Kopfzeile
    await expect(page.getByText("0 von 1 erledigt")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Dieser Bereich ist im Aufbau");
  });

  test("/vereine ist ehrlich leer, solange kein Vereins-Werkzeug existiert", async ({ page }) => {
    await page.goto("/vereine");
    await expect(page.getByRole("note")).toContainText("noch kein Werkzeug");
    await expect(sec(page, "pfad")).toHaveCount(0);
    await expect(sec(page, "werkzeuge")).toHaveCount(0);
  });

  test("unbekannte Seiten sind 404", async ({ page }) => {
    expect((await page.goto("/gibt-es-nicht"))?.status()).toBe(404);
    expect((await page.goto("/strategie/gibt-es-nicht"))?.status()).toBe(404);
  });

  test("Open-Graph-Bild pro Kategorie ist ein PNG", async ({ request, page }) => {
    await page.goto("/content");
    const href = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!).pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("der Fortschritt kommt aus dem Browser und wirkt auf Pfad und Startseite", async ({ page }) => {
    await page.goto("/strategie");
    await page.evaluate((slug) => localStorage.setItem(`mt:${slug}`, JSON.stringify({ v: 1, phase: "result", step: 0, answers: {}, counted: true })), TOOL);
    await page.reload();
    await expect(page.getByText("1 von 1 erledigt")).toBeVisible();
    await expect(sec(page, "pfad").getByText("Erledigt", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(sec(page, "pfade").getByText("Pfad abgeschlossen")).toBeVisible();
  });
});

test.describe("Referenz-Werkzeug im Browser", () => {
  async function runToResult(page: import("@playwright/test").Page) {
    await page.goto(`/tools/${TOOL}`);
    await page.getByRole("button", { name: "Check starten" }).click();
    await page.getByLabel("Website", { exact: true }).check();
    await page.getByRole("button", { name: "Weiter" }).click();
    const rows = page.locator("form fieldset");
    const n = await rows.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) await rows.nth(i).getByLabel("Nein").check();
    await page.getByRole("button", { name: "Zur Zusammenfassung" }).click();
    await page.getByRole("button", { name: "Ergebnis anzeigen" }).click();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
  }

  test("freier Durchlauf bis zum Ergebnis, Download erst nach dem Formular, Lead kommt bei n8n an", async ({ page }) => {
    await runToResult(page);
    await expect(page.getByText("Das würde ich zuerst tun")).toBeVisible();

    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Dein erstes Ergebnis war gratis.")).toBeVisible();

    const email = `browser-${Date.now()}@example.ch`;
    await dialog.getByLabel("Name").fill("Anna Keller");
    await dialog.getByLabel("Firma").fill("Malerei Keller");
    await dialog.getByLabel("E-Mail").fill(email);
    await dialog.getByRole("checkbox").check();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Freischalten" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    await expect.poll(async () => {
      const received = (await (await page.request.get("http://127.0.0.1:3998/received")).json()) as Record<string, string>[];
      return received.find((l) => l.email === email)?.tool;
    }).toBe(TOOL);
  });

  test("nach dem freien Durchlauf verlangt ein neuer Start das Formular", async ({ page }) => {
    await runToResult(page);
    await page.getByRole("button", { name: "Neu starten" }).click();
    await page.getByRole("button", { name: "Check starten" }).click();
    await expect(page.getByRole("dialog").getByText("Dein erstes Ergebnis war gratis.")).toBeVisible();
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
