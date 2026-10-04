import { expect, test, type Page } from "@playwright/test";
import { sampleResult } from "../../lib/check/fixtures";

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

/** Ersetzt /api/check im Browser: Der Server dürfte localhost nicht abrufen (SSRF-Schutz), und der Test soll nicht von fremden Seiten abhängen. */
async function mockCheck(page: Page, outcome: "result" | "error" = "result", sig?: string) {
  const events =
    outcome === "result"
      ? [
          { type: "step", id: "fetch", state: "start" },
          { type: "step", id: "fetch", state: "done" },
          { type: "result", result: { ...(await sampleResult()), ...(sig ? { sig } : {}) } },
        ]
      : [{ type: "error", code: "unreachable", message: "Die Website konnte nicht geladen werden. Stimmt die Adresse?" }];
  await page.route("**/api/check", (route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" }),
  );
}

async function fillForm(page: Page) {
  await page.goto(`/tools/${TOOL}`);
  // Der Knopf ist gesperrt, bis die Seite den lokalen Speicher gelesen hat. Erst dann ist Tippen sicher.
  await expect(page.getByRole("button", { name: "Website prüfen" })).toBeEnabled();
  await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
  await page.getByLabel("Website", { exact: true }).fill("malerei-keller.ch");
  await page.getByLabel("Branche", { exact: true }).selectOption("craft");
}

test.describe("Referenz-Werkzeug im Browser", () => {
  async function runToResult(page: Page) {
    await mockCheck(page);
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
  }

  test("leere Angaben zeigen eine Meldung, ohne Gate und ohne Abruf", async ({ page }) => {
    await page.goto(`/tools/${TOOL}`);
    const start = page.getByRole("button", { name: "Website prüfen" });
    await expect(start).toBeEnabled();
    await expect(page.getByText("Eine KI schreibt zusätzlich eine kurze Einordnung")).toHaveCount(0); // ohne Konto kein Hinweis auf die KI
    await start.click();
    await expect(page.getByRole("alert").filter({ hasText: "Bitte gib den Firmennamen an." })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("ein Fehler des Servers bleibt am Formular und verbraucht den freien Durchlauf nicht", async ({ page }) => {
    await mockCheck(page, "error");
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Stimmt die Adresse?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Website prüfen" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.unroute("**/api/check");
    await mockCheck(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
  });

  test("das Ergebnis bleibt nach dem Neuladen stehen und schreibt Branche und Kanal ins Profil", async ({ page }) => {
    await runToResult(page);
    await page.reload();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect(page.getByTestId("einordnung")).toHaveCount(0); // ohne Konto keine KI-Einordnung
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("mt:profile") ?? "{}"));
    expect(profile).toMatchObject({ firma: "Malerei Keller", website: "malerei-keller.ch", branche: "Handwerk / Bau / Garten" });
    expect(profile.kanaele).toEqual([{ name: "Instagram", url: "instagram.com/malereikeller" }]);
  });

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
    await page.getByRole("button", { name: "Erneut prüfen" }).click();
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByRole("dialog").getByText("Dein erstes Ergebnis war gratis.")).toBeVisible();
  });
});

test.describe("Konto in der Kopfzeile", () => {
  const route = (page: Page, body: unknown) =>
    page.route("**/api/account", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));

  test("ohne eingerichtete Anmeldung bleibt «Mein Profil» in der Kopfzeile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Mein Profil" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: "Anmelden" })).toHaveCount(0);
  });

  test("Besucher sehen Anmelden und Registrieren, aber kein «Mein Profil»; das Fenster öffnet sich", async ({ page }) => {
    await route(page, { login: "google", account: null });
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Registrieren" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Mein Profil" })).toHaveCount(0);
    await header.getByRole("button", { name: "Registrieren" }).click();
    const dialog = page.getByTestId("signin-dialog");
    await expect(dialog.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mit Google anmelden" })).toBeVisible();
  });

  test("Angemeldete sehen ein Menü mit Mein Profil und Abmelden; die Profilseite zeigt das Konto", async ({ page }) => {
    await route(page, { login: "google", account: { name: "Anna Keller", email: "anna@keller.ch" } });
    await page.goto("/");
    await page.getByTestId("account-button").click();
    await expect(page.locator("#account-menu")).toContainText("anna@keller.ch");
    await page.locator("#account-menu").getByRole("link", { name: "Mein Profil" }).click();
    await expect(page).toHaveURL(/\/profil$/);
    await expect(page.getByTestId("konto-karte")).toContainText("Angemeldet als Anna Keller");
    await expect(page.getByTestId("konto-karte").getByRole("button", { name: "Abmelden" })).toBeVisible();
  });

  test("bei 375 px ragt die Kopfzeile nicht über den Rand, mit Anmelden-Knopf und mit Konto", async ({ browser }) => {
    for (const body of [{ login: "google", account: null }, { login: "google", account: { name: "Anna", email: "a@k.ch" } }]) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
      const page = await ctx.newPage();
      await route(page, body);
      await page.goto("/");
      await expect(page.getByRole("banner").getByRole("button", { name: /Anmelden|Konto von/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });
});

test.describe("KI-Einordnung im Browser (mit Konto)", () => {
  /** Meldet den Besucher als angemeldet und freigeschaltet und ersetzt /api/ai. Gibt die Zahl der Aufrufe zurück. */
  async function signedIn(page: Page, replies: { status: number; body: unknown }[]) {
    const calls = { n: 0 };
    await page.route("**/api/access", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ allowed: true, unlocked: true, reason: "unlocked", login: "google", signedIn: true }) }),
    );
    await page.route("**/api/ai", (route) => {
      const reply = replies[Math.min(calls.n++, replies.length - 1)];
      return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
    });
    return calls;
  }

  async function einordnung() {
    const first = (await sampleResult()).massnahmen[0];
    return {
      zusammenfassung: "Die Grundlagen stehen, die grösste Lücke liegt bei den Suchmaschinen.",
      prioritaeten: [{ schritt: first.itemId, titel: first.titel, text: "Hier lohnt sich der Anfang, weil der Aufwand klein ist." }],
    };
  }

  test("holt die Einordnung einmal, zeigt sie mit KI-Kennzeichnung und behält sie nach dem Neuladen", async ({ page }) => {
    const calls = await signedIn(page, [{ status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } }]);
    await mockCheck(page, "result", "e2e-sig");
    await fillForm(page);
    await expect(page.getByText("Eine KI schreibt zusätzlich eine kurze Einordnung")).toBeVisible(); // Hinweis, welche Daten an die KI gehen
    await page.getByRole("button", { name: "Website prüfen" }).click();

    const box = page.getByTestId("einordnung");
    await expect(box).toContainText("Die Grundlagen stehen");
    await expect(box).toContainText("Schritt 1:");
    await expect(box).toContainText("Von einer KI formuliert");

    await page.reload();
    await expect(page.getByTestId("einordnung")).toContainText("Die Grundlagen stehen");
    expect(calls.n).toBe(1);
  });

  test("ein Ausfall der KI lässt den Check stehen und erlaubt einen neuen Versuch", async ({ page }) => {
    const calls = await signedIn(page, [
      { status: 502, body: { error: "ai_rejected" } },
      { status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } },
    ]);
    await mockCheck(page, "result", "e2e-sig");
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();

    const box = page.getByTestId("einordnung");
    await expect(box).toContainText("Das Ergebnis unten ist vollständig");
    await expect(page.getByText("Das würde ich zuerst tun")).toBeVisible();
    await box.getByRole("button", { name: "Noch einmal versuchen" }).click();
    await expect(box).toContainText("Die Grundlagen stehen");
    expect(calls.n).toBe(2);
  });

  test("ohne Signatur im Ergebnis (älterer Stand) fragt der Browser die KI gar nicht erst", async ({ page }) => {
    const calls = await signedIn(page, [{ status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } }]);
    await mockCheck(page);
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect(page.getByTestId("einordnung")).toHaveCount(0);
    expect(calls.n).toBe(0);
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

  test("/api/check: kaputte Eingaben liefern 400, nach dem freien Durchlauf 403", async ({ request }) => {
    const ip = { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` };
    let cookie = "";
    const post = async (path: string, data: unknown) => {
      const res = await request.post(path, { data, headers: { ...ip, ...(cookie ? { cookie } : {}) } });
      const set = res.headers()["set-cookie"];
      if (set) cookie = set.split(";")[0];
      return res;
    };

    expect((await post("/api/check", {})).status()).toBe(400);
    expect((await post("/api/check", { company: "A", website: "http://127.0.0.1" })).status()).toBe(400);
    expect((await post("/api/check", { company: "A", website: "ftp://keller.ch" })).status()).toBe(400);

    await post("/api/access", { tool: TOOL });
    await post("/api/access/complete", { tool: TOOL });
    const used = await post("/api/check", { company: "A", website: "keller.ch" });
    expect(used.status()).toBe(403);
    expect((await used.json()).error).toBe("gate");
  });

  test("/api/ai: ohne gültig signiertes Ergebnis 400, nie ohne Konto etwas erzeugen", async ({ request }) => {
    const res = await request.post("/api/ai", { data: { result: { v: 1, sig: "gefaelscht" } } });
    expect(res.status()).toBe(400);
    expect((await request.post("/api/ai", { data: "kein json" })).status()).toBe(400);
  });

  test("/api/account/data: ohne Sitzung 401 bei allen drei Verben, nichts wird gelesen oder gelöscht", async ({ request }) => {
    expect((await request.get("/api/account/data")).status()).toBe(401);
    expect((await request.put("/api/account/data", { data: { entries: {} } })).status()).toBe(401);
    expect((await request.delete("/api/account/data")).status()).toBe(401);
  });

  test("/api/cron/leads: ohne Secret von Vercel antwortet die Route 401 und fasst nichts an", async ({ request }) => {
    expect((await request.get("/api/cron/leads")).status()).toBe(401);
    expect((await request.get("/api/cron/leads", { headers: { authorization: "Bearer erraten" } })).status()).toBe(401);
  });

  test("Konto-Anmeldung ist ohne Einrichtung aus: /api/auth 404, /api/lead/account 401, /api/access bietet nur das Formular", async ({ request }) => {
    expect((await request.get("/api/auth/get-session")).status()).toBe(404);
    const noSession = await request.post("/api/lead/account", { data: { tool: TOOL, consent: true } });
    expect(noSession.status()).toBe(401);
    const access = await (await request.post("/api/access", { data: { tool: TOOL } })).json();
    expect(access).toMatchObject({ login: null, signedIn: false });
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
