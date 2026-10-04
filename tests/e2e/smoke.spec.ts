import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { sampleResult } from "../../lib/check/fixtures";
import { tools } from "../../tools/index";

const TOOL = "digitaler-auftritt-check";
const BASE = "http://127.0.0.1:3100";
/** Abschnitt (section) nach der id seiner Überschrift. */
const sec = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const lead = (over: Record<string, unknown> = {}) => ({ email: "anna@keller.ch", consent: true, tool: TOOL, ...over });
const fresh = () => `browser-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.ch`;

/** Alles, was der n8n-Stub bisher erhalten hat. */
async function received(request: APIRequestContext): Promise<Record<string, string>[]> {
  return (await (await request.get("http://127.0.0.1:3998/received")).json()) as Record<string, string>[];
}

/** Das E-Mail-Fenster (Zugang v3) ausfüllen: Adresse, Häkchen, «Ergebnis anzeigen». */
async function giveEmail(page: Page, email = fresh()) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Dein Ergebnis ist bereit.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveCount(0);
  await dialog.getByLabel("E-Mail").fill(email);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Ergebnis anzeigen" }).click();
  await expect(dialog).toHaveCount(0);
  return email;
}

/** Adresse schon bekannt: Cookie vom Server holen und den lokalen Merker setzen, damit kein Fenster kommt. */
async function knownEmail(page: Page, email = fresh()) {
  await page.goto("/");
  const res = await page.request.post("/api/lead", { data: lead({ email }) });
  expect(res.status()).toBe(200);
  await page.evaluate((e) => localStorage.setItem("mt:_lead", e), email);
  return email;
}

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

  test("Kopfzeile: «Mein Profil» als Link, kein Anmelden, keine Anfrage an fremde Adressen", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).host;
      if (host !== "127.0.0.1:3100") foreign.push(r.url());
    });
    for (const path of ["/", `/tools/${TOOL}`, "/profil"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await expect(page.getByRole("banner").getByRole("link", { name: "Mein Profil" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: /Anmelden|Registrieren/ })).toHaveCount(0);
    expect(foreign).toEqual([]);
  });
});

test.describe("Jede Werkzeug-Seite", () => {
  for (const tool of tools) {
    test(`/tools/${tool.slug}: lädt, eine H1, Werkzeug sichtbar, Fragen, JSON-LD, 375 px`, async ({ page }) => {
      const res = await page.goto(`/tools/${tool.slug}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("region", { name: tool.name })).toBeVisible();
      await expect(page.getByTestId("access-status")).toHaveText("Ergebnis gegen E-Mail-Adresse");
      const faq = await sec(page, "fragen").locator("h3").count();
      expect(faq).toBeGreaterThanOrEqual(5);
      expect(faq).toBeLessThanOrEqual(7);
      const types = await page.$$eval('script[type="application/ld+json"]', (nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "{}")["@type"]));
      expect(types).toEqual(["SoftwareApplication", "FAQPage", "BreadcrumbList"]);
      expect(await page.evaluate(() => document.body.textContent?.includes("TODO"))).toBe(false);
      await page.setViewportSize({ width: 375, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
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
    await page.evaluate((slug) => localStorage.setItem(`mt:${slug}`, JSON.stringify({ v: 1, phase: "result", step: 0, answers: {} })), TOOL);
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
  /** Formular ausfüllen, Fenster beantworten, Ergebnis abwarten. Gibt die verwendete Adresse zurück. */
  async function runToResult(page: Page) {
    await mockCheck(page);
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    return email;
  }

  test("leere Angaben zeigen eine Meldung, ohne Fenster und ohne Abruf", async ({ page }) => {
    await page.goto(`/tools/${TOOL}`);
    const start = page.getByRole("button", { name: "Website prüfen" });
    await expect(start).toBeEnabled();
    await expect(page.getByTestId("access-status")).toHaveText("Ergebnis gegen E-Mail-Adresse");
    await start.click();
    await expect(page.getByRole("alert").filter({ hasText: "Bitte gib den Firmennamen an." })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("das Fenster kommt vor dem Abruf; «Später» lässt das Formular stehen und ruft nichts ab", async ({ page }) => {
    let checks = 0;
    await page.route("**/api/check", (r) => {
      checks++;
      return r.fulfill(json({ error: "x" }, 500));
    });
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Dein Ergebnis ist bereit.")).toBeVisible();
    await dialog.getByRole("button", { name: "Später" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Website prüfen" })).toBeEnabled();
    await expect(page.getByLabel("Website", { exact: true })).toHaveValue("malerei-keller.ch");
    expect(checks).toBe(0);
  });

  test("ein Fehler des Servers bleibt am Formular, nichts geht ins CRM, der zweite Versuch fragt nicht erneut", async ({ page, request }) => {
    await mockCheck(page, "error");
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("alert").filter({ hasText: "Stimmt die Adresse?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Website prüfen" })).toBeVisible();
    await expect(page.getByTestId("access-status")).toContainText(`Ergebnisse gehen an ${email}`);
    expect((await received(request)).find((l) => l.email === email)).toBeUndefined();

    await page.unroute("**/api/check");
    await mockCheck(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
  });

  test("das Ergebnis bleibt nach dem Neuladen stehen und schreibt Branche und Kanal ins Profil", async ({ page }) => {
    await runToResult(page);
    await page.reload();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect(page.getByTestId("einordnung")).toHaveCount(0); // ohne Signatur im Ergebnis keine KI-Einordnung
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("mt:profile") ?? "{}"));
    expect(profile).toMatchObject({ firma: "Malerei Keller", website: "malerei-keller.ch", branche: "Handwerk / Bau / Garten" });
    expect(profile.kanaele).toEqual([{ name: "Instagram", url: "instagram.com/malereikeller" }]);
  });

  test("E-Mail vor dem Ergebnis: Werkzeug, Eingabe und Ausgabe kommen bei n8n an, der Download kommt danach ohne Fenster", async ({ page, request }) => {
    const email = await runToResult(page);
    await expect(page.getByText("Das würde ich zuerst tun")).toBeVisible();

    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe(TOOL);
    const got = (await received(request)).find((l) => l.email === email)!;
    expect(Object.keys(got).sort()).toEqual(["ausgabe", "eingabe", "email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"]);
    expect(got).toMatchObject({ kategorie: "strategie", quelle: "tools.alperna.ch", firma: "Malerei Keller", name: "", telefon: "" });
    expect(got.eingabe).toContain("Website: malerei-keller.ch");
    expect(got.eingabe).toContain("Branche: Handwerk");
    expect(got.ausgabe).toContain("von 100");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("ein zweiter Durchlauf fragt nicht erneut nach der Adresse und geht wieder ins CRM", async ({ page, request }) => {
    const email = await runToResult(page);
    await expect.poll(async () => (await received(request)).filter((l) => l.email === email).length).toBe(1);
    await page.getByRole("button", { name: "Erneut prüfen" }).click();
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect.poll(async () => (await received(request)).filter((l) => l.email === email).length).toBe(2);
  });

  test("«ändern» in der Statuszeile: neue Adresse, das nächste Ergebnis geht an sie", async ({ page, request }) => {
    const first = await runToResult(page);
    await page.getByRole("button", { name: "ändern" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("E-Mail")).toHaveValue(first);
    const second = fresh();
    await dialog.getByLabel("E-Mail").fill(second);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Ergebnis anzeigen" }).click();
    await expect(page.getByTestId("access-status")).toContainText(`Ergebnisse gehen an ${second}`);
    await page.getByRole("button", { name: "Erneut prüfen" }).click();
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect.poll(async () => (await received(request)).find((l) => l.email === second)?.tool).toBe(TOOL);
  });

  test("kennt der Server die Adresse nicht mehr (403), kommt das Fenster, danach läuft der Check von selbst", async ({ page }) => {
    // Lokaler Merker ohne Cookie: so sieht ein Browser aus, dessen Cookie abgelaufen oder gelöscht ist.
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mt:_lead", "alt@keller.ch"));
    await mockCheck(page);
    await fillForm(page);
    await expect(page.getByTestId("access-status")).toContainText("alt@keller.ch");
    await page.getByRole("button", { name: "Website prüfen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Dein Ergebnis ist bereit.")).toBeVisible();
    await expect(dialog.getByLabel("E-Mail")).toHaveValue(""); // der alte Merker gilt nicht mehr
    const email = await giveEmail(page);
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect(page.getByTestId("access-status")).toContainText(`Ergebnisse gehen an ${email}`);
  });
});

test.describe("Textcheck im Browser", () => {
  async function open(page: Page) {
    await page.goto("/tools/textcheck");
    await expect(page.getByRole("button", { name: "Text prüfen" })).toBeEnabled();
  }
  async function runSample(page: Page) {
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Text prüfen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("heading", { name: "Dein Textcheck" })).toBeVisible();
    return email;
  }

  test("leerer Text zeigt eine Meldung, ohne Fenster", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Text prüfen" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Füge zuerst einen Text ein." })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Beispieltext: Ergebnis mit Funden, bereinigter Text ohne Eszett, bleibt nach dem Neuladen", async ({ page }) => {
    await runSample(page);
    await expect(page.getByText("Das fällt auf")).toBeVisible();
    await expect(page.getByText("Eszett (ß)")).toBeVisible();
    await expect(page.getByText("qualitativ hochwertig / höchste Qualität")).toBeVisible();
    const cleaned = page.getByLabel("Bereinigter Text");
    await expect(cleaned).toHaveValue(/«Sauber gestrichen, sauber gerechnet»/);
    expect(await cleaned.inputValue()).not.toContain("ß");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dein Textcheck" })).toBeVisible();
  });

  test("Text ändern führt zurück zum Feld mit dem Text, ohne neues Fenster", async ({ page }) => {
    await runSample(page);
    await page.getByRole("button", { name: "Text ändern" }).click();
    await expect(page.getByLabel("Dein Text")).toHaveValue(/Malerei Keller/);
    await page.getByRole("button", { name: "Text prüfen" }).click();
    await expect(page.getByRole("heading", { name: "Dein Textcheck" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Text und Bericht kommen mit der Adresse bei n8n an, und an keine andere Adresse geht der Text", async ({ page, request }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /Malerei Keller|Sauber gestrichen/.test(r.postData() ?? "")) posts.push(new URL(r.url()).pathname);
    });
    const email = await runSample(page);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("textcheck");
    const got = (await received(request)).find((l) => l.email === email)!;
    expect(got.kategorie).toBe("content");
    expect(got.eingabe).toContain("Malerei Keller");
    expect(got.ausgabe).toContain("Textcheck");
    await page.waitForLoadState("networkidle");
    expect([...new Set(posts)]).toEqual(["/api/result"]);
  });

  test("bei 375 px ragt nichts über den Rand", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await runSample(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test.describe("Textcheck mit KI im Browser", () => {
  const REPLY = [
    "Gesamteindruck: Verständlich, mit zwei Fehlern.",
    "Fehler:",
    "- Mallerei → Malerei (Tippfehler)",
    "- Gosau → Gossau (Ortsname)",
    "Verbesserungen:",
    "- Wir freuen uns → Melde dich",
    "Korrigierter Text:",
    "Die Malerei Keller in Gossau streicht Fassaden.",
  ].join("\n");

  async function runSample(page: Page) {
    await knownEmail(page);
    await page.goto("/tools/textcheck");
    await expect(page.getByRole("button", { name: "Text prüfen" })).toBeEnabled();
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Text prüfen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dein Textcheck" })).toBeVisible();
  }

  test("ohne Klick geht nichts an die Route; mit Klick kommen Fehler, Verbesserungen und der korrigierte Text", async ({ page }) => {
    const calls: Array<{ style: string; text: string }> = [];
    await page.route("**/api/text", (r) => {
      calls.push(JSON.parse(r.request().postData() ?? "{}"));
      return r.fulfill(json({ ok: true, text: REPLY, warnings: [] }));
    });
    await runSample(page);
    await page.waitForLoadState("networkidle");
    expect(calls).toHaveLength(0);

    await page.getByRole("button", { name: /^Mit KI prüfen/ }).click();
    const box = page.getByTestId("ki-ergebnis");
    await expect(box).toContainText("Mallerei → Malerei");
    await expect(box.getByRole("heading", { name: "Fehler" })).toBeVisible();
    await expect(box.getByRole("heading", { name: "Verbesserungen" })).toBeVisible();
    await expect(box.getByRole("heading", { name: "Korrigierter Text" })).toBeVisible();
    await expect(box).toContainText("Von einer KI formuliert");
    expect(calls).toHaveLength(1);
    expect(calls[0].style).toBe("pruefen");
    expect(calls[0].text).toContain("Malerei Keller");
  });

  test("kennt der Server die Adresse nicht mehr (403), kommt das Fenster, danach die Prüfung von selbst", async ({ page }) => {
    let n = 0;
    await page.route("**/api/text", (r) => (++n === 1 ? r.fulfill(json({ error: "gate" }, 403)) : r.fulfill(json({ ok: true, text: REPLY, warnings: [] }))));
    await runSample(page);
    await page.getByRole("button", { name: /^Mit KI prüfen/ }).click();
    await giveEmail(page);
    await expect(page.getByTestId("ki-ergebnis")).toContainText("Mallerei → Malerei");
    expect(n).toBe(2);
  });

  test("ein Ausfall der KI zeigt einen ruhigen Satz und lässt die festen Ergebnisse stehen", async ({ page }) => {
    await page.route("**/api/text", (r) => r.fulfill(json({ error: "ai_failed" }, 502)));
    await runSample(page);
    await page.getByRole("button", { name: /^Mit KI prüfen/ }).click();
    await expect(page.getByTestId("ki-pruefung").getByRole("alert")).toContainText("keine brauchbare Fassung");
    await expect(page.getByRole("heading", { name: "Das fällt auf" })).toBeVisible();
  });
});

test.describe("KI-Einordnung im Browser (mit Adresse)", () => {
  /** Ersetzt /api/ai. Gibt die Zahl der Aufrufe zurück. */
  async function aiApi(page: Page, replies: { status: number; body: unknown }[]) {
    const calls = { n: 0 };
    await page.route("**/api/ai", (route) => {
      const reply = replies[Math.min(calls.n++, replies.length - 1)];
      return route.fulfill(json(reply.body, reply.status));
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
    const calls = await aiApi(page, [{ status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } }]);
    await mockCheck(page, "result", "e2e-sig");
    await fillForm(page);
    await expect(page.getByText("Eine KI schreibt zusätzlich eine kurze Einordnung")).toBeVisible(); // Hinweis, welche Daten an die KI gehen
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await giveEmail(page);

    const box = page.getByTestId("einordnung");
    await expect(box).toContainText("Die Grundlagen stehen");
    await expect(box).toContainText("Schritt 1:");
    await expect(box).toContainText("Von einer KI formuliert");

    await page.reload();
    await expect(page.getByTestId("einordnung")).toContainText("Die Grundlagen stehen");
    expect(calls.n).toBe(1);
  });

  test("ein Ausfall der KI lässt den Check stehen und erlaubt einen neuen Versuch", async ({ page }) => {
    const calls = await aiApi(page, [
      { status: 502, body: { error: "ai_rejected" } },
      { status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } },
    ]);
    await mockCheck(page, "result", "e2e-sig");
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await giveEmail(page);

    const box = page.getByTestId("einordnung");
    await expect(box).toContainText("Das Ergebnis unten ist vollständig");
    await expect(page.getByText("Das würde ich zuerst tun")).toBeVisible();
    await box.getByRole("button", { name: "Noch einmal versuchen" }).click();
    await expect(box).toContainText("Die Grundlagen stehen");
    expect(calls.n).toBe(2);
  });

  test("ohne Signatur im Ergebnis (älterer Stand) fragt der Browser die KI gar nicht erst", async ({ page }) => {
    const calls = await aiApi(page, [{ status: 200, body: { ok: true, einordnung: await einordnung(), cached: false } }]);
    await mockCheck(page);
    await fillForm(page);
    await page.getByRole("button", { name: "Website prüfen" }).click();
    await giveEmail(page);
    await expect(page.getByText("Dein Ergebnis")).toBeVisible();
    await expect(page.getByTestId("einordnung")).toHaveCount(0);
    expect(calls.n).toBe(0);
  });
});

test.describe("Text-Umschreiber im Browser", () => {
  const SLUG = "text-umschreiber";

  /** Ersetzt /api/text durch die angegebenen Antworten (die letzte gilt für alle weiteren). /api/lead und /api/result sind echt. */
  async function textApi(page: Page, replies: { status: number; body: unknown }[]) {
    const calls: Array<{ text: string; style: string; anrede: string }> = [];
    await page.route("**/api/text", (r) => {
      calls.push(JSON.parse(r.request().postData() ?? "{}"));
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      return r.fulfill(json(reply.body, reply.status));
    });
    return calls;
  }

  async function open(page: Page) {
    await page.goto(`/tools/${SLUG}`);
    await expect(page.getByRole("button", { name: "Umschreiben" })).toBeEnabled();
  }

  const GOOD = { status: 200, body: { ok: true, text: "Ab Anfang November sind wir auch samstags für dich da.\n\nWas würdest du gern besprechen?", warnings: ["Platzhalter ausfüllen: [Datum]."] } };
  const GATE = { status: 403, body: { error: "gate" } };

  test("E-Mail vor der Fassung: Stil und Anrede gehen an die Route, Text und Fassung kommen bei n8n an", async ({ page, request }) => {
    const calls = await textApi(page, [GOOD]);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.locator("label").filter({ hasText: /^Instagram-Caption$/ }).click();
    await page.getByLabel("Anrede").selectOption("sie");
    await page.getByRole("button", { name: "Umschreiben" }).click();
    const email = await giveEmail(page);

    await expect(page.getByRole("heading", { name: "Deine Fassung: Instagram-Caption" })).toBeVisible();
    await expect(page.getByTestId("ki-hinweis")).toContainText("Von einer KI formuliert");
    await expect(page.getByTestId("warnungen")).toContainText("Platzhalter ausfüllen");
    await expect(page.getByLabel("Fassung", { exact: true })).toHaveValue(/Ab Anfang November/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ style: "instagram", anrede: "sie" });
    expect(calls[0].text).toContain("Malerei Keller");

    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe(SLUG);
    const got = (await received(request)).find((l) => l.email === email)!;
    expect(got.eingabe).toContain("Stil: Instagram-Caption");
    expect(got.eingabe).toContain("Malerei Keller");
    expect(got.ausgabe).toContain("Ab Anfang November");
  });

  test("die Fassung und der Stil bleiben nach dem Neuladen stehen, ohne neue Anfrage", async ({ page }) => {
    const calls = await textApi(page, [GOOD]);
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.locator("label").filter({ hasText: /^Newsletter$/ }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Deine Fassung: Newsletter" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Deine Fassung: Newsletter" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Newsletter" })).toBeChecked();
    expect(calls).toHaveLength(1);
  });

  test("«Neuer Text» leert Feld und Fassung", async ({ page }) => {
    await textApi(page, [GOOD]);
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByLabel("Fassung", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Neuer Text" }).click();
    await expect(page.getByLabel("Dein Text")).toHaveValue("");
    await expect(page.getByLabel("Fassung", { exact: true })).toHaveCount(0);
  });

  test("zu kurzer oder leerer Text zeigt eine Meldung und ruft weder Fenster noch Route auf", async ({ page }) => {
    const calls = await textApi(page, [GOOD]);
    await open(page);
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Füge zuerst einen Text ein." })).toBeVisible();
    await page.getByLabel("Dein Text").fill("Zu kurz.");
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "zu kurz" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });

  test("ein Fehler der KI lässt den Text stehen und erlaubt einen neuen Versuch", async ({ page }) => {
    const calls = await textApi(page, [{ status: 502, body: { error: "ai_failed" } }, GOOD]);
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "keine brauchbare Fassung" })).toBeVisible();
    await expect(page.getByLabel("Dein Text")).toHaveValue(/Malerei Keller/);
    await expect(page.getByLabel("Fassung", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByLabel("Fassung", { exact: true })).toBeVisible();
    expect(calls).toHaveLength(2);
  });

  test("zu viele Anfragen in kurzer Zeit: ruhiger Satz, keine Fassung", async ({ page }) => {
    await textApi(page, [{ status: 429, body: { error: "rate_limited" } }]);
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "viele Anfragen in kurzer Zeit" })).toBeVisible();
  });

  test("kennt der Server die Adresse nicht mehr (403), kommt das Fenster und danach von selbst die Fassung", async ({ page }) => {
    const calls = await textApi(page, [GATE, GOOD]);
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mt:_lead", "alt@keller.ch")); // Merker ohne Cookie
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await giveEmail(page);
    await expect(page.getByLabel("Fassung", { exact: true })).toHaveValue(/Ab Anfang November/);
    expect(calls).toHaveLength(2); // erst abgelehnt, nach dem Fenster einmal wiederholt
  });

  test("der Text geht nur an /api/text und /api/result, an keine andere Adresse", async ({ page }) => {
    await textApi(page, [GOOD]);
    const others: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /Malerei Keller/.test(r.postData() ?? "")) others.push(new URL(r.url()).pathname);
    });
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByLabel("Fassung", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect([...new Set(others)].sort()).toEqual(["/api/result", "/api/text"]);
  });

  test("bei 375 px ragt nichts über den Rand, auch mit Fassung", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await textApi(page, [GOOD]);
    await knownEmail(page);
    await open(page);
    await page.getByRole("button", { name: "Beispieltext einfügen" }).click();
    await page.getByRole("button", { name: "Umschreiben" }).click();
    await expect(page.getByLabel("Fassung", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test.describe("Zugang v3 über die Routen", () => {
  /** Eigener Kontext ohne Cookies; mt_gate wird wie in einem Browser von Hand mitgeführt (der Cookie-Jar der Fixture schickt «Secure»-Cookies nicht über http). */
  async function client(playwright: PlaywrightWorkerArgs["playwright"]) {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const ip = { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` };
    let cookie = "";
    const post = async (path: string, data: unknown) => {
      const res = await ctx.post(path, { data, headers: { ...ip, ...(cookie ? { cookie } : {}) } });
      const set = res.headers()["set-cookie"];
      if (set) cookie = set.split(";")[0];
      return res;
    };
    return { post, get: (path: string) => ctx.get(path, { headers: ip }), dispose: () => ctx.dispose() };
  }

  const ergebnis = (over: Record<string, unknown> = {}) => ({ tool: TOOL, eingabe: "Website: keller.ch", ausgabe: "# Ergebnis\n\n38 von 100", firma: "Malerei Keller", ...over });

  test("ohne Adresse: /api/result, /api/check, /api/text und /api/ai antworten 403 «gate» und tun nichts", async ({ playwright, request }) => {
    const c = await client(playwright);
    const before = (await received(request)).length;
    for (const [path, body] of [
      ["/api/result", ergebnis()],
      ["/api/check", { company: "A", website: "keller.ch" }],
      ["/api/text", { text: "Wir streichen Wände und Fassaden in Gossau, Termine ab Montag.", style: "linkedin", anrede: "du" }],
      ["/api/ai", { result: { ...(await sampleResult()), sig: "x" } }],
    ] as const) {
      const res = await c.post(path, body);
      expect(res.status(), path).toBe(403);
      expect((await res.json()).error, path).toBe("gate");
    }
    expect((await received(request)).length).toBe(before);
    await c.dispose();
  });

  test("Adresse angeben → Cookie → Ergebnis geht mit genau den erlaubten Feldern an n8n", async ({ playwright, request }) => {
    const c = await client(playwright);
    const email = fresh();
    const gate = await c.post("/api/lead", lead({ email }));
    expect(gate.status()).toBe(200);
    expect(gate.headers()["set-cookie"]).toMatch(/mt_gate=.*HttpOnly/i);
    expect((await received(request)).find((l) => l.email === email)).toBeUndefined(); // die Adresse allein ist noch kein Lead

    const res = await c.post("/api/result", ergebnis({ email: "fremd@example.ch" })); // E-Mail im Body wird ignoriert
    expect(res.status()).toBe(200);
    const got = (await received(request)).find((l) => l.email === email);
    expect(got).toBeTruthy();
    expect(Object.keys(got!).sort()).toEqual(["ausgabe", "eingabe", "email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"]);
    expect(got).toMatchObject({ tool: TOOL, kategorie: "strategie", quelle: "tools.alperna.ch", firma: "Malerei Keller", eingabe: "Website: keller.ch", ausgabe: "# Ergebnis\n\n38 von 100", name: "", telefon: "" });
    await c.dispose();
  });

  test("/api/check prüft mit Cookie die Eingabe (400), /api/ai verlangt ein signiertes Ergebnis (400)", async ({ playwright }) => {
    const c = await client(playwright);
    await c.post("/api/lead", lead({ email: fresh() }));
    expect((await c.post("/api/check", {})).status()).toBe(400);
    expect((await c.post("/api/check", { company: "A", website: "http://127.0.0.1" })).status()).toBe(400);
    expect((await c.post("/api/check", { company: "A", website: "ftp://keller.ch" })).status()).toBe(400);
    expect((await c.post("/api/ai", { result: { v: 1, sig: "gefaelscht" } })).status()).toBe(400);
    expect((await c.post("/api/ai", "kein json")).status()).toBe(400);
    await c.dispose();
  });

  test("ein gefälschtes Cookie gilt nicht", async ({ playwright }) => {
    const forged = Buffer.from(JSON.stringify({ email: "chef@konkurrenz.ch", iat: Math.floor(Date.now() / 1000) })).toString("base64url");
    const ctx = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `mt_gate=${forged}.AAAAAAAA` } });
    const res = await ctx.post("/api/result", { data: ergebnis() });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("ungültige Angaben liefern 400 und setzen kein Cookie", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    for (const bad of [lead({ consent: false }), lead({ email: "keller" }), lead({ honeypot: "https://spam.example" }), lead({ tool: "gibt-es-nicht" }), {}]) {
      const res = await ctx.post("/api/lead", { data: bad });
      expect(res.status(), JSON.stringify(bad)).toBe(400);
      expect(res.headers()["set-cookie"]).toBeUndefined();
    }
    expect((await ctx.post("/api/result", { data: ergebnis() })).status()).toBe(403);
    await ctx.dispose();
  });

  test("/api/result: kaputter Body und unbekanntes Werkzeug liefern 400", async ({ playwright }) => {
    const c = await client(playwright);
    await c.post("/api/lead", lead({ email: fresh() }));
    expect((await c.post("/api/result", { tool: TOOL })).status()).toBe(400);
    expect((await c.post("/api/result", ergebnis({ tool: "gibt-es-nicht" }))).status()).toBe(400);
    expect((await c.post("/api/result", "kein json")).status()).toBe(400);
    await c.dispose();
  });

  test("die Routen des Kontos gibt es nicht mehr", async ({ request }) => {
    expect((await request.post("/api/access", { data: { tool: TOOL } })).status()).toBe(404);
    expect((await request.post("/api/access/complete", { data: { tool: TOOL } })).status()).toBe(404);
    expect((await request.get("/api/account")).status()).toBe(404);
    expect((await request.get("/api/account/data")).status()).toBe(404);
    expect((await request.post("/api/lead/account", { data: { tool: TOOL, consent: true } })).status()).toBe(404);
  });

  test("/api/cron/leads: ohne Secret von Vercel antwortet die Route 401 und fasst nichts an", async ({ request }) => {
    expect((await request.get("/api/cron/leads")).status()).toBe(401);
    expect((await request.get("/api/cron/leads", { headers: { authorization: "Bearer erraten" } })).status()).toBe(401);
  });
});
