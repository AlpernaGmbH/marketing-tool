import { expect, test, type APIRequestContext, type Locator, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { sampleResult } from "../../lib/check/fixtures";
import { tools } from "../../tools/index";

const TOOL = "digitaler-auftritt-check";
const BASE = "http://127.0.0.1:3100";
/** Abschnitt (section) nach der id seiner Überschrift. */
const sec = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const lead = (over: Record<string, unknown> = {}) => ({ email: "anna@keller.ch", consent: true, tool: TOOL, ...over });
const fresh = () => `browser-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.ch`;

/** Wartet, bis React ein Element übernommen hat. Das Server-HTML ist schon sichtbar; Eingaben davor gehen bei der Hydrierung verloren (unter Last). */
async function hydrated(el: Locator) {
  await expect.poll(() => el.evaluate((node) => Object.keys(node).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber")))).toBe(true);
}

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
    await hydrated(page.getByRole("button", { name: "Menü" }));
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

  const strategiePfad = tools
    .filter((t) => t.pathStep?.path === "strategie")
    .sort((a, b) => a.pathStep!.order - b.pathStep!.order)
    .map((t) => t.slug);

  test("/strategie zeigt den Pfad aus der Registry mit dem Referenz-Werkzeug und Fortschritt 0", async ({ page }) => {
    await page.goto("/strategie");
    // Ab zwei Schritten gibt es die Pfad-Grafik, mit einem einzigen nur die Liste.
    await expect(page.getByTestId("path-graphic")).toHaveCount(strategiePfad.length > 1 ? 1 : 0);
    await expect(sec(page, "pfad").getByRole("link", { name: /Digitaler-Auftritt-Check/ })).toBeVisible();
    await expect(page.getByRole("search", { name: "Werkzeug suchen" })).toBeVisible(); // Kopfzeile
    await expect(page.getByText(`0 von ${strategiePfad.length} erledigt`)).toBeVisible();
    const inKategorie = tools.filter((t) => t.category === "strategie").length;
    if (inKategorie < 3) await expect(page.getByRole("note")).toContainText("Dieser Bereich ist im Aufbau");
    else await expect(page.getByRole("note")).toHaveCount(0);
  });

  test("/vereine zeigt die Werkzeuge mit audience verein oder beide, sonst ist die Seite ehrlich leer", async ({ page }) => {
    const vereinsTools = tools.filter((t) => t.audience !== "kmu");
    await page.goto("/vereine");
    if (vereinsTools.length === 0) {
      await expect(page.getByRole("note")).toContainText("noch kein Werkzeug");
      await expect(sec(page, "werkzeuge")).toHaveCount(0);
      return;
    }
    await expect(sec(page, "werkzeuge").locator(":scope > ul > li")).toHaveCount(vereinsTools.length);
    for (const t of vereinsTools) await expect(sec(page, "werkzeuge").getByRole("link", { name: new RegExp(t.name) })).toBeVisible();
    if (vereinsTools.length < 3) await expect(page.getByRole("note")).toContainText("im Aufbau");
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
    // Fragebogen-Form für das Referenz-Werkzeug, Generator-Form ({input, output}) für die übrigen Schritte.
    await page.evaluate(
      ({ slugs, first }) => {
        for (const s of slugs) {
          const state = s === first ? { v: 1, phase: "result", step: 0, answers: {} } : { v: 1, input: { betrieb: "Malerei Keller" }, output: { titel: "Entwurf" } };
          localStorage.setItem(`mt:${s}`, JSON.stringify(state));
        }
      },
      { slugs: strategiePfad, first: TOOL },
    );
    await page.reload();
    await expect(page.getByText(`${strategiePfad.length} von ${strategiePfad.length} erledigt`)).toBeVisible();
    await expect(sec(page, "pfad").getByText("Erledigt", { exact: true }).first()).toBeVisible();
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

test.describe("Welle 1 im Browser", () => {
  test("Newsletter-Check: Beispiel prüfen, Fenster vor dem Ergebnis, Punktzahl und Funde, Lead mit Text und Bericht", async ({ page, request }) => {
    await page.goto("/tools/newsletter-check");
    await expect(page.getByRole("button", { name: "Newsletter prüfen" })).toBeEnabled();
    await page.getByRole("button", { name: "Beispiel einfügen" }).click();
    await expect(page.getByLabel("Dein Newsletter")).toHaveValue(/Malerei Keller/);
    await page.getByRole("button", { name: "Newsletter prüfen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Newsletter-Check" })).toBeVisible();
    await expect(page.getByRole("meter").first()).toBeVisible();
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("newsletter-check");
    const got = (await received(request)).find((l) => l.email === email)!;
    expect(got.eingabe).toContain("Betreff:");
    expect(got.ausgabe).toContain("von 100");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Newsletter-Check" })).toBeVisible();
  });

  test("Reifegrad-Check: zehn Fragen, Fenster vor dem Ergebnis, Reifegrad mit Dimensionen, Lead mit Fragen und Antworten", async ({ page, request }) => {
    await page.goto("/tools/reifegrad-check");
    await page.getByRole("button", { name: "Starten" }).click();
    for (let i = 0; i < 10; i++) {
      await expect(page.getByText(`Frage ${i + 1} von 10`)).toBeVisible();
      const radios = page.getByRole("radio");
      if ((await radios.count()) > 0) await radios.last().check();
      else await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: /^(Weiter|Zur Zusammenfassung)$/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Zusammenfassung" })).toBeVisible();
    await page.getByRole("button", { name: "Ergebnis anzeigen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Marketing-Reifegrad" })).toBeVisible();
    await expect(page.getByRole("meter").first()).toBeVisible();
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("reifegrad-check");
    const got = (await received(request)).find((l) => l.email === email)!;
    expect(got.eingabe).toContain("Sind deine Marketingziele schriftlich festgehalten?");
    expect(got.ausgabe).toContain("von 100");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Marketing-Reifegrad" })).toBeVisible();
  });

  test("Wettbewerbsvergleich: eigene Website und Mitbewerber laufen durch den Check, Tabelle, Lead mit Mitbewerber", async ({ page, request }) => {
    const checked: string[] = [];
    const sample = await sampleResult();
    await page.route("**/api/check", (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as { website: string };
      checked.push(body.website);
      const events = [
        { type: "step", id: "fetch", state: "start" },
        { type: "step", id: "fetch", state: "done" },
        { type: "result", result: { ...sample, url: body.website, company: body.website } },
      ];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
    });
    await page.goto("/tools/wettbewerbsvergleich");
    await expect(page.getByRole("button", { name: "Vergleichen" })).toBeEnabled();
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Website", { exact: true }).fill("malerei-keller.ch");
    await page.getByLabel("Branche", { exact: true }).selectOption("craft");
    await page.getByLabel("Mitbewerber 1").fill("malerei-brunner.ch");
    await page.getByRole("button", { name: "Vergleichen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Vergleich" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Gesamt" })).toBeVisible();
    expect(checked.map((u) => new URL(u).hostname)).toEqual(["malerei-keller.ch", "malerei-brunner.ch"]);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("wettbewerbsvergleich");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("malerei-brunner.ch");
  });

  test("Ideen aus deiner Website: Website lesen, Entwurf, acht Ideen, Lead, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = { read: 0, generate: 0 };
    await page.route("**/api/read", (route) => {
      calls.read++;
      return route.fulfill(
        json({ ok: true, page: { url: "https://malerei-keller.ch/", host: "malerei-keller.ch", title: "Malerei Keller Gossau", description: "Maler in Gossau", headings: ["Fassaden", "Innenräume"], text: "Wir streichen Fassaden und Innenräume in Gossau und Umgebung. Seit 1998.", truncated: false } }),
      );
    });
    const idee = (n: number, kanal: string) => ({
      titel: `Fassade Nummer ${n}`.replace(/\d/g, "") + " in Gossau",
      kanal,
      format: kanal === "instagram" ? "foto" : "text",
      worum: "Eine fertige Fassade in Gossau, vorher und nachher, mit dem Team der Malerei Keller davor und einem Satz zur Dauer.",
      hook: "So sah die Fassade vorher aus.",
    });
    const kanaele = ["instagram", "linkedin", "google", "newsletter", "website"];
    await page.route("**/api/generate", (route) => {
      calls.generate++;
      return route.fulfill(json({ ok: true, output: { themen: ["Fassaden", "Innenräume", "Beratung vor Ort"], ideen: Array.from({ length: 8 }, (_, i) => idee(i, kanaele[i % 5])) } }));
    });
    await page.goto("/tools/ideen-aus-website");
    await expect(page.getByRole("button", { name: "Ideen finden" })).toBeEnabled();
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Website", { exact: true }).fill("malerei-keller.ch");
    await page.getByRole("button", { name: "Ideen finden" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Ideen" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Ideen für Beiträge" }).getByRole("listitem")).toHaveCount(8);
    await expect(page.getByTestId("ki-hinweis")).toContainText("Von einer KI formuliert");
    expect(calls).toEqual({ read: 1, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("ideen-aus-website");
    expect((await received(request)).find((l) => l.email === email)!.ausgabe).toContain("Gossau");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Ideen" })).toBeVisible();
    expect(calls).toEqual({ read: 1, generate: 1 });
  });
});

test.describe("Welle 2a im Browser (Strategie-Generatoren)", () => {
  /** Entwürfe, die die Ausgabe-Schemas der Generatoren erfüllen (der Browser prüft die Antwort gegen das Schema). */
  const ICP = {
    segmentName: "Eigentümer älterer Einfamilienhäuser in der Region",
    beschreibung:
      "Menschen, die ihr Haus seit vielen Jahren besitzen, die Fassade pflegen wollen und einen Betrieb aus der Nähe suchen, der Termine einhält und die Farbwahl erklärt. Sie fragen meist nach einer Empfehlung aus der Nachbarschaft an.",
    merkmale: ["Einfamilienhaus im Besitz der Familie", "Wohnen in Gossau und den Nachbargemeinden", "Fassade oder Innenräume seit Jahren nicht erneuert", "Entscheiden gemeinsam im Haushalt"],
    ausloeser: ["Die Fassade blättert sichtbar ab", "Ein Verkauf oder eine Übergabe steht an", "Nachbarn haben frisch streichen lassen"],
    einwaende: ["Kostet das mehr als bei einem grossen Anbieter?", "Hält der Termin im Frühling?"],
    signale: ["Fragen nach der Dauer der Arbeiten", "Bitte um eine Besichtigung vor Ort", "Hinweis auf eine Empfehlung aus der Nachbarschaft"],
    nichtIdeal: ["Reine Preisanfragen ohne Besichtigung", "Grossprojekte mit Generalunternehmer"],
    punktekarte: [
      { kriterium: "Haus in der Region", punkte: 3, warum: "Kurze Wege halten den Preis und die Termine." },
      { kriterium: "Besichtigung vor Ort gewünscht", punkte: 3, warum: "Wer sich Zeit nimmt, entscheidet nach Qualität." },
      { kriterium: "Empfehlung aus der Nachbarschaft", punkte: 2, warum: "Empfohlene Kundschaft kommt mit Vertrauen." },
      { kriterium: "Fassade und Innenräume zusammen", punkte: 2, warum: "Grössere Aufträge füllen die Saison." },
      { kriterium: "Zeitfenster im Frühling oder Herbst", punkte: 2, warum: "Passt zur Auslastung des Betriebs." },
      { kriterium: "Fragen zur Farbwahl", punkte: 2, warum: "Beratung ist die Stärke des Betriebs." },
    ],
  };
  const NUTZEN = {
    kurz: "Fassaden in Gossau, die lange halten.",
    mittel: "Wir streichen Fassaden und Innenräume in Gossau und Umgebung. Du bekommst eine Offerte, die hält, und einen Termin, der steht.",
    lang: "Die Malerei Keller streicht Fassaden und Innenräume für Eigentümer in Gossau und Umgebung. Du bekommst eine Beratung vor Ort, eine Offerte ohne Überraschungen und eine Fassade, die viele Jahre hält. Die Arbeiten laufen zum vereinbarten Termin, und am Ende bleibt die Baustelle sauber zurück.",
    nutzen: ["Du bekommst eine Offerte, die am Ende auch die Rechnung ist.", "Du hast einen Termin, der eingehalten wird.", "Du bekommst eine Farbwahl, die zum Haus passt."],
    beweise: ["[Zahl der Projekte seit der Gründung]"],
    bausteine: {
      websiteTitel: "Malerei Keller: Fassaden und Innenräume in Gossau",
      websiteUntertitel: "Beratung vor Ort, Offerte ohne Überraschung, Termin, der steht.",
      googleBeschreibung:
        "Die Malerei Keller streicht Fassaden und Innenräume in Gossau und Umgebung. Wir beraten vor Ort, erklären die Farbwahl und halten Termine ein. Eigentümer von Einfamilienhäusern und Verwaltungen arbeiten seit Jahren mit uns.",
      instagramBio: "Malerei in Gossau. Fassaden, Innenräume, Farbberatung vor Ort.",
      einSatzAmTelefon: "Wir streichen Fassaden und Innenräume in Gossau, mit Beratung vor Ort und einer Offerte, die hält.",
    },
  };
  const PERSONA = {
    name: "Regula Brunner",
    kurz: "Regula Brunner ist zwischen 30 und 45, Privatperson und besitzt mit ihrem Partner ein Einfamilienhaus in Gossau.",
    alltag:
      "Unter der Woche pendelt sie nach St. Gallen, am Samstag erledigt sie den Einkauf im Dorf und schaut dabei auf die Fassaden der Nachbarn. Das Haus hat sie von den Eltern übernommen, und die Fassade blättert an der Wetterseite. Am Sonntag sucht sie auf dem Handy nach einem Maler in der Nähe.",
    ziele: ["Eine Fassade, die wieder gepflegt aussieht", "Eine Offerte, die sie versteht", "Einen Termin vor dem Winter"],
    sorgen: ["Dass die Arbeiten länger dauern als gesagt", "Dass am Ende mehr auf der Rechnung steht", "Dass die Farbe nicht zum Haus passt"],
    informationswege: ["Google auf dem Handy", "Empfehlung von Nachbarn", "Gemeindeblatt"],
    einwaende: ["Ich hole noch eine zweite Offerte ein.", "Könnt ihr das vor dem Herbst machen?"],
    soSprichstDuSieAn: { ton: "Du, in kurzen Sätzen, ohne Fachwörter, mit klaren Angaben zu Dauer und Preis.", woerter: ["vor Ort", "Termin", "hält lange", "verständlich"], vermeiden: ["Fassadensanierung", "Premium", "Lösung"] },
    zitat: "Ich will einfach wissen, wann ihr kommt und was es kostet.",
  };

  /** /api/generate antwortet mit `output`; zählt die Aufrufe. */
  async function stubGenerate(page: Page, output: unknown) {
    const calls = { generate: 0 };
    await page.route("**/api/generate", (route) => {
      calls.generate++;
      return route.fulfill(json({ ok: true, output }));
    });
    return calls;
  }

  async function grunddaten(page: Page) {
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
  }

  test("ICP-Builder: Angaben, Entwurf, Punktekarte zum Bewerten, Lead mit Eingabe und Ausgabe, Profil, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, ICP);
    await page.goto("/tools/icp-builder");
    await grunddaten(page);
    await page.getByLabel("Was bietest du an?").fill("Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.");
    await page.getByLabel("Wer sind heute deine besten Kunden, und warum?").fill("Eigentümer älterer Einfamilienhäuser in Gossau, die Wert auf Beratung legen.");
    const start = page.getByRole("button", { name: "Profil erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Idealkundenprofil" })).toBeVisible();
    const kriterien = page.getByRole("list", { name: "Kriterien der Punktekarte" });
    await expect(kriterien.getByRole("listitem")).toHaveCount(6);
    await kriterien.getByRole("checkbox").first().check();
    await expect(page.getByTestId("bewertung")).toContainText("von");
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("icp-builder");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.firma).toBe("Malerei Keller");
    expect(lead.eingabe).toContain("Fassaden streichen");
    expect(lead.ausgabe).toContain(ICP.segmentName);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain(ICP.segmentName);
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Idealkundenprofil" })).toBeVisible();
    expect(calls).toEqual({ generate: 1 });
  });

  test("Nutzenversprechen: Angaben, Entwurf in drei Längen mit fünf Textbausteinen, Lead, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, NUTZEN);
    await page.goto("/tools/nutzenversprechen");
    await grunddaten(page);
    await page.getByLabel("Für wen?", { exact: true }).fill("Eigentümer von Einfamilienhäusern in Gossau");
    await page.getByLabel("Was bietest du an?").fill("Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.");
    await page.getByLabel("Welches Problem löst du für diese Kundschaft?").fill("Die Fassade blättert, Offerten kommen spät, niemand erklärt die Farbwahl.");
    await page.getByLabel("Was hat die Kundschaft danach?").fill("Eine Fassade, die zwanzig Jahre hält, und eine Rechnung ohne Überraschung.");
    const start = page.getByRole("button", { name: "Nutzenversprechen erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Nutzenversprechen" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Textbausteine je Kanal" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("nutzenversprechen");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Fassaden streichen");
    expect(lead.ausgabe).toContain(NUTZEN.kurz);
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Nutzenversprechen" })).toBeVisible();
    expect(calls).toEqual({ generate: 1 });
  });

  test("Persona-Generator: Angaben, Entwurf, Lead, Persona im Profil, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, PERSONA);
    await page.goto("/tools/persona");
    await grunddaten(page);
    await page.getByLabel("Für wen ist das Angebot?").fill("Eigentümer von Einfamilienhäusern in Gossau");
    await page.getByLabel("Was bietest du dieser Gruppe an?").fill("Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.");
    await page.getByLabel("Altersgruppe").selectOption({ label: "30 bis 45" });
    await page.getByLabel("Rolle").selectOption({ label: "Privatperson" });
    const start = page.getByRole("button", { name: "Persona erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Persona" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Deine Persona" })).toContainText("Regula Brunner");
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("persona");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Fassaden streichen");
    expect(lead.ausgabe).toContain("Regula Brunner");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain("Regula Brunner");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Persona" })).toContainText("Regula Brunner");
    expect(calls).toEqual({ generate: 1 });
  });
});

test.describe("Welle 2b im Browser (Strategie-Generatoren II)", () => {
  const SEITE = {
    url: "https://malerei-keller.ch/",
    host: "malerei-keller.ch",
    title: "Malerei Keller Gossau",
    description: "Maler in Gossau",
    headings: ["Fassaden", "Innenräume"],
    text: "Wir streichen Fassaden und Innenräume in Gossau und Umgebung. Für Hausbesitzer in der Region. Referenzen auf Anfrage. Wir sind Ihr Partner für alles rund ums Haus.",
    truncated: false,
  };
  const POSITIONIERUNG = {
    kernsatz: "Malerei Keller streicht Fassaden für Hausbesitzer in Gossau und erklärt die Farbwahl vor Ort.",
    fuerWen: "Eigentümer älterer Einfamilienhäuser in Gossau und den Nachbargemeinden.",
    wasAnders: "Beratung vor Ort mit Farbmustern am Haus, eine Offerte ohne Nachträge und ein Termin, der eingehalten wird.",
    beweise: ["[Zahl der Fassaden seit der Gründung]", "Referenzen auf Anfrage, wie die Website sagt."],
    varianten: [
      { stil: "kurz", satz: "Fassaden in Gossau, beraten am Haus, gestrichen zum Termin." },
      { stil: "konkret", satz: "Wir streichen Fassaden von Einfamilienhäusern in Gossau und zeigen die Farbe vorher am Haus." },
      { stil: "persoenlich", satz: "Du bekommst eine Fassade, die hält, und eine Beratung, die du verstehst." },
    ],
    streichen: ["Ihr Partner für alles rund ums Haus", "Umgebung"],
    naechsterSchritt: "Setz den Kernsatz als erste Zeile auf die Startseite und nenne Gossau im Titel.",
  };
  const BOTSCHAFTEN = {
    hauptbotschaft: "Malerei Keller hält, was die Offerte verspricht: Termin, Preis und eine Fassade, die lange hält.",
    botschaften: [
      { fuer: "Hausbesitzer in Gossau", satz: "Du bekommst eine Offerte ohne Nachträge und einen Termin, der steht.", beleg: "Offerte und Rechnung stimmen überein." },
      { fuer: "Verwaltungen", satz: "Wir koordinieren die Arbeiten mit den Mietenden und räumen jeden Abend auf.", beleg: "Referenzen von Liegenschaftsverwaltungen auf Anfrage." },
      { fuer: "Nach dem Auftrag", satz: "Wir kommen nach zwei Jahren vorbei und schauen die Fassade an.", beleg: "Kontrollbesuch als Teil des Angebots." },
    ],
    kanaele: {
      website: "Malerei Keller in Gossau: Fassaden und Innenräume, beraten am Haus, gestrichen zum Termin.",
      googleProfil: "Malerei Keller streicht Fassaden und Innenräume in Gossau und Umgebung. Beratung vor Ort, Offerte ohne Nachträge, Termin, der steht.",
      instagram: "Malerei in Gossau. Fassaden, Innenräume, Farbberatung am Haus.",
      offerteOderMail: "Vielen Dank für dein Interesse. In der Offerte steht alles, was wir machen, mit Termin und Preis. Nachträge gibt es bei uns nicht, und wir räumen jeden Abend auf.",
    },
    telefonsatz: "Wir streichen Fassaden und Innenräume in Gossau, mit Beratung am Haus und einer Offerte, die hält.",
    nichtSagen: ["Alles aus einer Hand", "Günstigster Anbieter", "Rund um die Uhr erreichbar"],
  };
  const MARKE = {
    versprechen: "Malerei Keller hält Termine, erklärt die Farbwahl am Haus und hinterlässt die Baustelle sauber.",
    werte: [
      { name: "Verlässlichkeit", satz: "Was in der Offerte steht, gilt: Termin, Preis und Umfang." },
      { name: "Nähe", satz: "Wir beraten am Haus in Gossau, nicht am Telefon." },
      { name: "Sorgfalt", satz: "Jeder Abend endet mit einer aufgeräumten Baustelle." },
    ],
    persoenlichkeit: ["ruhig", "handfest", "verbindlich"],
    tonalitaet: {
      so: "Kurze Sätze, konkrete Angaben zu Dauer und Preis, Du-Form, Beispiele vom Haus statt Fachwörter.",
      nichtSo: "Keine Superlative, keine Werbesprache, keine Fachbegriffe aus der Farbtechnik ohne Erklärung.",
      beispielSatz: "Du bekommst die Farbmuster am Haus zu sehen, bevor wir anfangen.",
    },
    woerter: { verwenden: ["am Haus", "Termin", "hält", "verständlich", "sauber"], vermeiden: ["Fassadensanierung", "Premium", "Lösung", "ganzheitlich", "Rundum-sorglos"] },
    geschichte: "Die Malerei Keller begann als Einmannbetrieb in Gossau. Weil die Kundschaft die ehrliche Beratung weiterempfahl, wuchs der Betrieb langsam, ohne Werbung. Bis heute gilt: Wir sagen, was wir machen, und machen, was wir sagen.",
    bewertungsregeln: ["Bedank dich für die konkrete Beobachtung in der Bewertung.", "Bei Kritik: Bedauern, Gesprächsangebot, kein Rechtfertigen.", "Keine Rabatte oder Versprechen in der Antwort."],
    heutigerTon: "Die Startseite spricht von Partnern und Rundum-Angeboten; sie sagt nicht, für wen der Betrieb da ist.",
  };

  async function stubs(page: Page, output: unknown) {
    const calls = { read: 0, generate: 0 };
    await page.route("**/api/read", (route) => {
      calls.read++;
      return route.fulfill(json({ ok: true, page: SEITE }));
    });
    await page.route("**/api/generate", (route) => {
      calls.generate++;
      return route.fulfill(json({ ok: true, output }));
    });
    return calls;
  }

  test("Positionierungs-Check: Website lesen, Check im Browser, Entwurf, Lead, Profil, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubs(page, POSITIONIERUNG);
    await page.goto("/tools/positionierung");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Website", { exact: true }).fill("malerei-keller.ch");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByRole("button", { name: "Positionierung prüfen" }).click();
    const email = await giveEmail(page);
    const region = page.getByRole("region", { name: "Deine Positionierung" });
    await expect(region).toBeVisible();
    await expect(region.getByRole("meter", { name: "Positionierung auf der Startseite" })).toBeVisible();
    await expect(region.getByRole("list", { name: "Funde nach Gruppen" }).locator(":scope > li")).toHaveCount(6);
    await expect(region.getByRole("heading", { name: "Kernsatz" })).toBeVisible();
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ read: 1, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("positionierung");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Website: malerei-keller.ch");
    expect(lead.ausgabe).toContain("# Positionierungs-Check");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain(POSITIONIERUNG.kernsatz);
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Positionierung" })).toBeVisible();
    expect(calls).toEqual({ read: 1, generate: 1 });
  });

  test("Kernbotschaften: Angaben mit Anrede, Entwurf mit Texten je Kanal, Lead, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubs(page, BOTSCHAFTEN);
    await page.goto("/tools/botschaften");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
    await page.getByLabel("Für wen?", { exact: true }).fill("Hausbesitzer in der Region Gossau");
    await page.getByLabel("Was bietest du an?").fill("Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.");
    await page.getByLabel("Was soll die Kundschaft nach dem Kontakt mit dir denken?").fill("Die halten, was sie versprechen.");
    await page.getByLabel("Anrede", { exact: true }).selectOption("du");
    const start = page.getByRole("button", { name: "Botschaften erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Botschaften" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Texte je Kanal" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ read: 0, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("botschaften");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Fassaden streichen");
    expect(lead.ausgabe).toContain(BOTSCHAFTEN.hauptbotschaft);
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Botschaften" })).toBeVisible();
    expect(calls).toEqual({ read: 0, generate: 1 });
  });

  test("Markenplattform: Angaben, Website lesen, Entwurf, Lead, Marke im Profil, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubs(page, MARKE);
    await page.goto("/tools/markenplattform");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
    await page.getByLabel("Website", { exact: true }).fill("malerei-keller.ch");
    await page.getByLabel("Wofür steht dein Betrieb?").fill("Für Fassaden, die halten, und eine Beratung am Haus, die man versteht.");
    await page.getByLabel("Drei Wörter, mit denen Kundschaft dich beschreiben soll").fill("verlässlich, nah, sorgfältig");
    await page.getByLabel("Anrede deiner Kundschaft").selectOption("du");
    await page.getByRole("checkbox", { name: "Website für den heutigen Ton lesen" }).check();
    const start = page.getByRole("button", { name: "Markenplattform erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    const region = page.getByRole("region", { name: "Deine Markenplattform" });
    await expect(region).toBeVisible();
    await expect(page.getByTestId("website-gelesen")).toContainText("malerei-keller.ch");
    await expect(region.getByRole("heading", { name: "Versprechen" })).toBeVisible();
    await expect(region.getByRole("heading", { name: "Werte" })).toBeVisible();
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ read: 1, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("markenplattform");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Malerei Keller");
    expect(lead.ausgabe).toContain(MARKE.versprechen);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain("Verlässlichkeit");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Markenplattform" })).toBeVisible();
    expect(calls).toEqual({ read: 1, generate: 1 });
  });

  const SWOT = {
    einSatz: "Die Malerei Keller hat eine starke Website und eine treue Kundschaft, aber zu wenig Sichtbarkeit bei Google.",
    staerken: [
      { punkt: "Beratung am Haus mit Farbmustern", warum: "Kundschaft entscheidet schneller und zufriedener." },
      { punkt: "Offerte ohne Nachträge", warum: "Vertrauen, das weiterempfohlen wird." },
      { punkt: "Website ist aktuell und schnell", warum: "Laut Marketing-Check ein starker Bereich." },
    ],
    schwaechen: [
      { punkt: "Google-Unternehmensprofil fast leer", warum: "Wer in Gossau nach Maler sucht, sieht den Betrieb kaum." },
      { punkt: "Keine Bewertungen gesammelt", warum: "Neue Kundschaft hat keinen Beleg für die Qualität." },
      { punkt: "Niemand ist für Beiträge zuständig", warum: "Der Auftritt bleibt stehen, sobald die Saison beginnt." },
    ],
    chancen: [
      { punkt: "Viele ältere Einfamilienhäuser in der Region", warum: "Fassaden werden fällig, Beratung ist gefragt." },
      { punkt: "Empfehlungen aus der Nachbarschaft", warum: "Ein sichtbares Projekt bringt die nächsten." },
      { punkt: "Verwaltungen suchen verlässliche Betriebe", warum: "Planbare Aufträge über das Jahr." },
    ],
    risiken: [
      { punkt: "Grosse Anbieter mit Online-Werbung", warum: "Sie belegen die Suche nach Maler in der Region." },
      { punkt: "Fachkräfte sind schwer zu finden", warum: "Wachstum hängt an wenigen Leuten." },
    ],
    folgerungen: [
      { massnahme: "Google-Unternehmensprofil mit Fotos und Leistungen füllen", nutzt: "Beratung am Haus", behebt: "Google-Profil fast leer", aufwand: "klein" },
      { massnahme: "Nach jedem Auftrag um eine Bewertung bitten", nutzt: "Treue Kundschaft", behebt: "Keine Bewertungen", aufwand: "klein" },
      { massnahme: "Eine Person im Team für Beiträge pro Woche einteilen", nutzt: "Website ist aktuell", behebt: "Niemand zuständig", aufwand: "mittel" },
    ],
  };
  const SAEULEN = {
    saeulen: [
      { name: "Fassaden vorher und nachher", beschreibung: "Fertige Fassaden aus Gossau und Umgebung, mit einem Satz zu Dauer und Material.", ziel: "sichtbarkeit", beispiele: ["Fassade in Gossau, vorher und nachher", "Das Team vor dem fertigen Haus", "Farbmuster am Haus"], anteil: 30 },
      { name: "Fragen der Kundschaft", beschreibung: "Die häufigsten Fragen aus Beratungen, je in drei Sätzen beantwortet.", ziel: "vertrauen", beispiele: ["Wie lange hält eine Fassade?", "Was kostet ein Anstrich?", "Welche Farbe passt zum Dach?"], anteil: 25 },
      { name: "Aus dem Alltag", beschreibung: "Werkstatt, Werkzeug, Wege und Leute, ohne Inszenierung.", ziel: "bindung", beispiele: ["Morgen in der Werkstatt", "Die Leiter am Hang", "Znüni auf der Baustelle"], anteil: 25 },
      { name: "Angebot und Termine", beschreibung: "Freie Termine, saisonale Angebote und der Weg zur Offerte.", ziel: "anfragen", beispiele: ["Freie Termine im Herbst", "So läuft die Offerte", "Beratung am Haus buchen"], anteil: 20 },
    ],
    rhythmus: {
      satz: "Zwei Beiträge pro Woche: einer zeigt Arbeit, einer beantwortet eine Frage; die anderen Säulen wechseln sich ab.",
      wochenplan: [
        { tag: "Dienstag", saeule: "Fassaden vorher und nachher", kanal: "Instagram" },
        { tag: "Freitag", saeule: "Fragen der Kundschaft", kanal: "Google-Beitrag" },
      ],
    },
    niemals: ["Fotos von Kundschaft ohne Einverständnis", "Preise ohne Besichtigung versprechen"],
  };

  test("SWOT-Analyse: Angaben, Entwurf mit Vier-Felder-Raster und Folgerungen, Lead, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubs(page, SWOT);
    await page.goto("/tools/swot");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
    await page.getByLabel("Stärken: Was läuft gut?").fill("Beratung am Haus mit Farbmustern, Offerte ohne Nachträge.");
    const start = page.getByRole("button", { name: "SWOT erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine SWOT-Analyse" })).toBeVisible();
    await expect(page.getByTestId("swot-raster").locator("section")).toHaveCount(4);
    await expect(page.getByTestId("folgerungen").locator("tbody tr")).toHaveCount(3);
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ read: 0, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("swot");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Beratung am Haus");
    expect(lead.ausgabe).toContain(SWOT.einSatz);
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine SWOT-Analyse" })).toBeVisible();
    expect(calls).toEqual({ read: 0, generate: 1 });
  });

  test("Content-Säulen: Angaben, Kanäle, Entwurf mit Wochenplan, Lead, Säulen im Profil, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubs(page, SAEULEN);
    await page.goto("/tools/content-saeulen");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Branche", { exact: true }).fill("Malerei");
    await page.getByLabel("Ort", { exact: true }).fill("Gossau");
    await page.getByLabel("Was bietest du an, und was fragt dich die Kundschaft am häufigsten?").fill("Fassaden und Innenräume; die Kundschaft fragt nach Dauer, Preis und Farbe.");
    await expect(page.getByRole("checkbox", { name: "Instagram", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Google-Beitrag", exact: true })).toBeChecked();
    await page.getByLabel("Wie viele Beiträge pro Woche sind realistisch?").selectOption("2");
    const start = page.getByRole("button", { name: "Säulen erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Content-Säulen" })).toBeVisible();
    await expect(page.getByTestId("saeulen").getByRole("heading", { name: "1. Fassaden vorher und nachher" })).toBeVisible();
    await expect(page.getByTestId("saeulen").locator("tbody tr")).toHaveCount(2);
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls).toEqual({ read: 0, generate: 1 });
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("content-saeulen");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Fassaden und Innenräume");
    expect(lead.ausgabe).toContain("Fassaden vorher und nachher");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain("Fassaden vorher und nachher");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Content-Säulen" })).toBeVisible();
    expect(calls).toEqual({ read: 0, generate: 1 });
  });
});

test.describe("Welle 3 im Browser (Schweizer Praxis-Werkzeuge)", () => {
  test("WhatsApp-Link: falsche Nummer zeigt eine Meldung ohne Fenster", async ({ page }) => {
    await page.goto("/tools/whatsapp-link");
    await page.getByLabel("WhatsApp-Nummer").fill("+49 151 1234567");
    await page.getByRole("button", { name: "Link erstellen" }).click();
    await expect(page.locator("#wa-error")).toContainText("Schweizer Nummer");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("WhatsApp-Link: Nummer und Vorlage, Fenster, Link, QR, Download, Lead, nach dem Neuladen steht das Ergebnis", async ({ page, request }) => {
    await page.goto("/tools/whatsapp-link");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("WhatsApp-Nummer").fill("079 123 45 67");
    await page.getByLabel("Nachricht", { exact: true }).selectOption("offerte");
    await expect(page.getByLabel("Vorausgefüllter Text")).toHaveValue(/Malerei Keller/);
    await page.getByRole("button", { name: "Link erstellen" }).click();
    const email = await giveEmail(page);
    const region = page.getByRole("region", { name: "Dein WhatsApp-Link" });
    await expect(region).toBeVisible();
    await expect(page.getByTestId("wa-link")).toContainText("https://wa.me/41791234567?text=");
    await expect(page.getByRole("img", { name: "QR-Code zu deinem WhatsApp-Link" })).toBeVisible();
    await expect(page.getByTestId("wa-snippet")).toContainText("wa.me/41791234567");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG herunterladen" }).click();
    expect((await download).suggestedFilename()).toBe("whatsapp-qr-malerei-keller.png");
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("whatsapp-link");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("WhatsApp-Nummer: 079 123 45 67");
    expect(lead.ausgabe).toContain("https://wa.me/41791234567");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein WhatsApp-Link" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("QR-Set: Ziel mit Adresse und Beschriftung, Fenster, QR-Code, PDF-Download, Lead", async ({ page, request }) => {
    await page.goto("/tools/qr-set");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    const ziel = page.getByTestId("ziel-1");
    await ziel.getByLabel("Adresse").fill("https://malerei-keller.ch");
    await ziel.getByLabel("Beschriftung").fill("Unsere Website");
    await page.getByRole("button", { name: "QR-Set erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein QR-Set" })).toBeVisible();
    await expect(page.getByRole("list", { name: "QR-Codes" }).getByRole("listitem")).toHaveCount(1);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Druckbogen \(PDF\)/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("qr-set");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("malerei-keller.ch");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein QR-Set" })).toBeVisible();
  });

  test("Bewertungs-Kit: fremder Link wird abgelehnt, Google-Link ergibt QR, Vorlagen und Download", async ({ page, request }) => {
    await page.goto("/tools/bewertungs-kit");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Dein Google-Bewertungslink").fill("https://example.com/bewerten");
    await page.getByLabel("Du", { exact: true }).check();
    await page.getByRole("button", { name: "Kit erstellen" }).click();
    await expect(page.locator("#bk-error")).toContainText("Google");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Dein Google-Bewertungslink").fill("https://g.page/r/CabcDEFghi/review");
    await page.getByRole("button", { name: "Kit erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Bewertungs-Kit" })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR-Code zu deiner Google-Bewertung" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Vorlagen" }).getByRole("listitem")).toHaveCount(3);
    const download = page.waitForEvent("download");
    await page.getByTestId("download-png").click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("bewertungs-kit");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("g.page/r/CabcDEFghi");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Bewertungs-Kit" })).toBeVisible();
  });

  test("Marketing-Budget-Planer: Umsatz und Kanäle, Tabelle mit Summe, CSV-Download, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/budget-planer");
    await page.getByLabel("Firma", { exact: true }).fill("Malerei Keller");
    await page.getByLabel("Jahresumsatz in CHF (ungefähr)").fill("900000");
    await page.getByLabel("Phase", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel("Ziel für dieses Jahr").selectOption({ index: 2 });
    await expect(page.getByTestId("bp-betrag")).toContainText("CHF");
    await page.getByRole("button", { name: "Budget berechnen" }).click();
    const email = await giveEmail(page);
    const region = page.getByRole("region", { name: "Dein Marketing-Budget" });
    await expect(region).toBeVisible();
    await expect(page.getByTestId("bp-dokument")).toContainText("Summe");
    await expect(page.getByTestId("bp-richtwert")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /CSV/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("budget-planer");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("900");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("mt:profile") ?? "")).toContain("budgetJahr");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Marketing-Budget" })).toBeVisible();
  });

  test("Content-Kalender: ohne Kanton eine Meldung, mit Kanton und eigenem Termin Jahreskalender, .ics hinter dem Fenster, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/content-kalender");
    await page.getByRole("button", { name: "Kalender erstellen" }).click();
    await expect(page.locator("#ck-error")).toContainText("Kanton");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#ck-kanton").selectOption("SG");
    await page.getByTestId("ck-jahr").selectOption("2027");
    await page.locator("#ck-termin-datum").fill("2027-03-12");
    await page.locator("#ck-termin-titel").fill("Tag der offenen Tür");
    await page.getByRole("button", { name: "Termin hinzufügen" }).click();
    await expect(page.getByRole("list", { name: "Eigene Termine" })).toContainText("Tag der offenen Tür");
    await page.getByRole("button", { name: "Kalender erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Content-Kalender" })).toBeVisible();
    await expect(page.getByTestId("ck-months")).toContainText("Muttertag");
    await expect(page.getByTestId("ck-months")).toContainText("Tag der offenen Tür");
    const ics = page.waitForEvent("download");
    await page.getByTestId("ck-ics").click();
    expect((await ics).suggestedFilename()).toMatch(/^content-kalender-2027.*\.ics$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("content-kalender");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Kanton: St. Gallen (SG)");
    expect(lead.eingabe).toContain("Tag der offenen Tür");
    expect(lead.ausgabe).toContain("# Content-Kalender 2027");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Content-Kalender" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Content-Ideen: Filter, Idee merken, CSV hinter dem Fenster, Lead mit Branche und Titeln, Merkliste nach dem Neuladen", async ({ page, request }) => {
    await page.goto("/tools/content-ideen");
    await expect(page.getByTestId("ci-count")).toContainText("Ideen");
    await hydrated(page.locator("#ci-branche"));
    await page.locator("#ci-branche").selectOption("handwerk");
    await page.locator("#ci-monat").selectOption("10");
    await expect(page.getByTestId("ci-card").first()).toBeVisible();
    await page.getByTestId("ci-card").first().getByRole("button", { name: "Merken" }).click();
    await expect(page.getByTestId("ci-merk-count")).toContainText("gemerkt");
    await expect(page.getByTestId("ci-merk-count")).not.toContainText("Noch nichts");
    const csv = page.waitForEvent("download");
    await page.getByTestId("ci-csv").click();
    const email = await giveEmail(page);
    expect((await csv).suggestedFilename()).toMatch(/^content-ideen.*\.csv$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("content-ideen");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Branche: Handwerk");
    expect(lead.eingabe).toContain("Export: CSV");
    expect(lead.ausgabe).toContain("# Content-Ideen: Merkliste");
    await page.reload();
    await expect(page.getByTestId("ci-merk-count")).toContainText("gemerkt");
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Feiertagsplaner: ohne Kanton eine Meldung, mit Kanton Liste, Kalender-Download, Lead mit Kanton und Tagen, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/gbp-feiertage");
    await page.getByRole("button", { name: "Liste erstellen" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Kanton" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#gf-kanton").selectOption("SG");
    await page.locator("#gf-jahr").selectOption("2027");
    await page.getByRole("button", { name: "Liste erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Sonderöffnungszeiten" })).toBeVisible();
    await expect(page.getByTestId("sonderzeiten")).toContainText("Karfreitag");
    const ics = page.waitForEvent("download");
    await page.getByRole("button", { name: "Kalender (.ics) herunterladen" }).click();
    expect((await ics).suggestedFilename()).toBe("sonderoeffnungszeiten-sg-2027.ics");
    const csv = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV herunterladen" }).click();
    expect((await csv).suggestedFilename()).toBe("sonderoeffnungszeiten-sg-2027.csv");
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("gbp-feiertage");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Kanton: St. Gallen (SG)");
    expect(lead.ausgabe).toContain("Karfreitag");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Sonderöffnungszeiten" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Caption-Baukasten: drei Schritte, Fenster vor dem Ergebnis, Vorschau je Plattform, Lead mit Hook und Texten, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/caption-baukasten");
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.locator("#cb-error")).toContainText("Situation");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Situation").fill("der Anstrich schon nach wenigen Wintern abblättert");
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.getByLabel("Problem", { exact: true }).fill("Billige Farbe hält an der Wetterseite selten länger als fünf Jahre.");
    await page.getByLabel("Lösung", { exact: true }).fill("Wir schleifen, grundieren und streichen mit Silikatfarbe, die Feuchte abgibt.");
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.locator("#cb-cta")).not.toHaveValue("");
    await page.getByRole("button", { name: "Caption erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Caption" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Instagram", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cb-counter")).toContainText("vor der Faltkante");
    await page.getByRole("button", { name: "LinkedIn", exact: true }).click();
    await expect(page.getByRole("region", { name: "Vorschau LinkedIn" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Im Textcheck prüfen" })).toHaveAttribute("href", "/tools/textcheck");
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("caption-baukasten");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Hook-Formel: Frage");
    expect(lead.ausgabe).toContain("Instagram (");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Caption" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Strategie-Einseiter: liest die Stände aus dem Browser, fehlende Bausteine bleiben Platzhalter, Lead mit Bausteinen", async ({ page, request }) => {
    await page.goto("/tools/strategie-einseiter");
    await page.evaluate(() =>
      localStorage.setItem("mt:icp-builder", JSON.stringify({ v: 1, input: null, output: null })),
    );
    await expect(page.getByTestId("vollstaendigkeit")).toContainText("von 8");
    await page.getByTestId("erstellen").click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Marketingstrategie auf einer Seite" })).toBeVisible();
    await expect(page.getByTestId("hinweis-offen")).toBeVisible();
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("strategie-einseiter");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Marketingstrategie auf einer Seite" })).toBeVisible();
  });
});

test.describe("Welle 4 im Browser (Content, KI und Vereine)", () => {
  async function stubGenerate(page: Page, output: unknown) {
    const calls = { generate: 0 };
    await page.route("**/api/generate", (route) => {
      calls.generate++;
      return route.fulfill(json({ ok: true, output }));
    });
    return calls;
  }

  const BEITRAG = {
    hooks: ["Was machst du, wenn der Anstrich nach wenigen Wintern abblättert?", "Ein Anstrich hält nur so gut wie der Untergrund darunter."],
    hauptteil:
      "An der Wetterseite zeigt sich schnell, ob der Untergrund stimmt.\n\nWir schleifen, grundieren und streichen mit Silikatfarbe, die Feuchte abgibt. So bleibt die Fassade in Gossau länger schön.",
    cta: "Wie ist das bei deiner Fassade? Schreib es uns in die Kommentare.",
    hinweis: "Ein Foto der fertigen Fassade würde den Beitrag stärken.",
  };

  test("Post-Generator: Idee, Fenster, Beitrag mit zwei Hooks und Vorschau, Lead, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, BEITRAG);
    await page.goto("/tools/post-generator");
    await page.locator("#pg-firma").fill("Malerei Keller");
    await page.locator("#pg-branche").fill("Malerei");
    await page.locator("#pg-ort").fill("Gossau");
    await page.getByRole("button", { name: "Beitrag schreiben" }).click();
    await expect(page.locator("#pg-error")).toContainText("Idee");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#pg-idee").fill("Wir zeigen, warum ein Anstrich an der Wetterseite oft schon nach wenigen Wintern abblättert und was man dagegen tut.");
    await page.getByRole("button", { name: "Beitrag schreiben" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Beitrag" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Hook" }).getByRole("radio")).toHaveCount(2);
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    await expect(page.getByTestId("pg-counter")).toContainText("Zeichen");
    expect(calls.generate).toBe(1);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("post-generator");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Plattform: Instagram");
    expect(lead.ausgabe).toContain("# Beitrag: Instagram");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Beitrag" })).toBeVisible();
    expect(calls.generate).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  const MITTEILUNG = {
    titel: "Malerei Keller in Gossau feiert 40 Jahre mit einem Tag der offenen Tür",
    lead: "Die Malerei Keller lädt am 14. November 2026 in Gossau zu einem Tag der offenen Tür ein und feiert damit ihr 40-jähriges Bestehen.",
    text: [
      "Die Malerei Keller besteht seit 40 Jahren und beschäftigt in Gossau mehrere Malerinnen und Maler. Zum Jubiläum öffnet der Betrieb am 14. November 2026 die Werkstatt für alle Interessierten.",
      "Besucherinnen und Besucher sehen, wie Fassaden vorbereitet werden, und können Farbmuster direkt vergleichen. Der Betrieb zeigt auch, wie er ältere Anstriche prüft, bevor er neu streicht.",
    ],
    zitat: "",
    boilerplate: "Die Malerei Keller ist ein Handwerksbetrieb in Gossau und streicht Fassaden und Innenräume für Privatkundschaft und Gewerbe in der Region St. Gallen.",
    bildzeile: "",
  };

  test("Medienmitteilung: Angaben, Fenster, Mitteilung mit Prüfung und Checkliste, Lead ohne Kontaktdaten, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, MITTEILUNG);
    await page.goto("/tools/medienmitteilung");
    await page.locator("#mm-firma").fill("Malerei Keller");
    await page.locator("#mm-ort").fill("Gossau");
    await page.locator("#mm-kanton").selectOption("SG");
    const start = page.getByRole("button", { name: "Medienmitteilung erstellen" });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.locator("#mm-error")).toContainText("Anlass");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#mm-anlass").selectOption("jubilaeum");
    await page.locator("#mm-was").fill("Die Malerei Keller feiert 40 Jahre und lädt zu einem Tag der offenen Tür ein.");
    await page.locator("#mm-wann").fill("14. November 2026");
    await page.locator("#mm-warum").fill("Der Betrieb gehört seit vier Jahrzehnten zum Ortsbild von Gossau.");
    await page.locator("#mm-kontakt-name").fill("Beat Keller");
    await start.click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Medienmitteilung" })).toBeVisible();
    await expect(page.getByTestId("mitteilung")).toContainText("Malerei Keller");
    await expect(page.getByRole("list", { name: "Prüfung" }).getByRole("listitem")).toHaveCount(7);
    await expect(page.getByRole("list", { name: "Versand-Checkliste" })).toBeVisible();
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls.generate).toBe(1);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("medienmitteilung");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Betrieb: Malerei Keller");
    expect(lead.eingabe).toContain("Anlass: Jubiläum");
    expect(lead.ausgabe).toContain("# Medienmitteilung");
    expect(lead.eingabe + lead.ausgabe).not.toContain("Beat Keller");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Medienmitteilung" })).toBeVisible();
    expect(calls.generate).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Bewertungsantwort: Bewertung und Sterne, Fenster, zwei Varianten, Lead mit Sternen, bei Ausfall der KI eine feste Vorlage", async ({ page, request }) => {
    const calls = await stubGenerate(page, {
      varianten: [
        { text: "Danke für deine ehrliche Rückmeldung. Dass sich der Termin zweimal verschoben hat, tut uns leid. Wir melden uns persönlich bei dir.\n\nBeat Keller, Malerei Keller", ton: "ruhig und persönlich" },
        { text: "Vielen Dank für die Bewertung. Die Verschiebung des Termins ärgert uns selbst, wir planen künftig mit mehr Reserve.\n\nBeat Keller, Malerei Keller", ton: "sachlich und kurz" },
      ],
    });
    await page.goto("/tools/bewertungsantwort");
    await page.locator("#bw-firma").fill("Malerei Keller");
    await page.getByRole("button", { name: "Antwort schreiben" }).click();
    await expect(page.locator("#bw-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#bw-anrede").selectOption("du");
    await page.locator("#bw-unterschrift").fill("Beat Keller, Malerei Keller");
    await page.locator("#bw-bewertung").fill("Die Fassade ist schön geworden, aber der Termin hat sich zweimal verschoben.");
    await page.getByRole("radio", { name: "3 Sterne" }).click();
    await page.getByRole("button", { name: "Antwort schreiben" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Antwort" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Varianten" }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("variante-1-text")).toContainText("Beat Keller");
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls.generate).toBe(1);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("bewertungsantwort");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Sterne: 3");
    expect(lead.ausgabe).toContain("# Antwort auf eine Bewertung");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Antwort" })).toBeVisible();
    expect(calls.generate).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Bewertungsantwort: antwortet die KI nicht, erscheint eine feste Vorlage mit Hinweis", async ({ page, request }) => {
    await page.route("**/api/generate", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "ai_failed" }) }));
    await page.goto("/tools/bewertungsantwort");
    await page.locator("#bw-firma").fill("Malerei Keller");
    await page.locator("#bw-anrede").selectOption("sie");
    await page.locator("#bw-unterschrift").fill("Beat Keller, Malerei Keller");
    await page.locator("#bw-bewertung").fill("Sehr freundliche Mitarbeitende und saubere Arbeit, danke.");
    await page.getByRole("radio", { name: "5 Sterne" }).click();
    await page.getByRole("button", { name: "Antwort schreiben" }).click();
    const email = await giveEmail(page);
    await expect(page.getByTestId("vorlage-hinweis")).toBeVisible();
    await expect(page.getByRole("list", { name: "Varianten" }).getByRole("listitem")).not.toHaveCount(0);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.ausgabe).toContain("Vorlage (ohne KI)");
  });

  test("Anspruchsgruppen: Verein wählen, zwei Gruppen bewerten, Fenster, Matrix und Plan, PDF, Lead mit Bewertung, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/anspruchsgruppen");
    await page.getByRole("radio", { name: "Verein" }).check();
    await page.locator("#ag-firma").fill("FC Trogen");
    await expect(page.locator("#ag-g1-name")).toHaveValue("Mitglieder");
    await page.getByRole("button", { name: "Analyse erstellen" }).click();
    await expect(page.locator("#ag-error")).toContainText("mindestens zwei");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#ag-g1-interesse").selectOption("5");
    await page.locator("#ag-g1-einfluss").selectOption("4");
    await page.locator("#ag-g1-beziehung").selectOption("eng");
    await page.locator("#ag-g3-interesse").selectOption("5");
    await page.locator("#ag-g3-einfluss").selectOption("5");
    await page.getByRole("button", { name: "Analyse erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Anspruchsgruppen" })).toBeVisible();
    await expect(page.getByTestId("ag-matrix")).toBeVisible();
    await expect(page.getByTestId("ag-plan")).toBeVisible();
    await expect(page.getByTestId("ag-zusammenfassung")).toContainText("2 Gruppen bewertet");
    const pdf = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("anspruchsgruppen");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Verein: FC Trogen");
    expect(lead.eingabe).toContain("Mitglieder: Interesse 5, Einfluss 4");
    expect(lead.ausgabe).toContain("# Anspruchsgruppen-Analyse: FC Trogen");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Anspruchsgruppen" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  const KONZEPT = {
      "ausgangslage": "Der FC Trogen hat 180 Mitglieder, und die Zahl wächst. Heute laufen die Website und WhatsApp-Gruppen. Für die Kommunikation stehen 6 Stunden pro Monat zur Verfügung. Ein Budget ist nicht angegeben.",
      "ziele": [
          {
              "ziel": "Mehr Kinder und Jugendliche für den Nachwuchs gewinnen",
              "messgroesse": "Anmeldungen im Nachwuchs"
          },
          {
              "ziel": "Neue Mitglieder aus Trogen und Umgebung gewinnen",
              "messgroesse": "Neue Mitglieder im Vereinsjahr"
          }
      ],
      "zielgruppen": [
          {
              "name": "Mitglieder",
              "erwartung": "Wissen, wann Training, Spiele und Anlässe stattfinden."
          },
          {
              "name": "Eltern",
              "erwartung": "Erfahren, wie ihre Kinder im Nachwuchs mitmachen können."
          }
      ],
      "kernbotschaft": "Der FC Trogen bringt Kinder, Familien und Dorf auf dem Sportplatz zusammen.",
      "kanalplan": [
          {
              "kanal": "Website",
              "zweck": "Termine, Kontakt und Anmeldung für den Nachwuchs.",
              "rhythmus": "bei jeder Änderung",
              "verantwortlich": "Betreuung Website"
          },
          {
              "kanal": "WhatsApp-Gruppen",
              "zweck": "Kurze Hinweise an Aktive und Eltern.",
              "rhythmus": "vor jedem Spiel",
              "verantwortlich": ""
          },
          {
              "kanal": "Aushang (neu)",
              "zweck": "Einladung zum Dorffest im Dorf sichtbar machen.",
              "rhythmus": "vor dem Dorffest",
              "verantwortlich": "Vorstand"
          }
      ],
      "jahreskalender": [
          {
              "monat": 6,
              "anlass": "Dorffest",
              "kommunikation": "Einladung per Aushang und WhatsApp-Gruppen, danach Bilder auf der Website."
          }
      ],
      "rollen": [
          {
              "rolle": "Betreuung Website",
              "aufgaben": "Hält Termine und Hinweise aktuell.",
              "stundenProMonat": 3
          },
          {
              "rolle": "Betreuung WhatsApp-Gruppen",
              "aufgaben": "Schickt die Hinweise vor den Spielen.",
              "stundenProMonat": 3
          }
      ],
      "erfolgsmessung": [
          "Zahl der Mitglieder am Ende des Vereinsjahrs",
          "Anmeldungen im Nachwuchs und Besucher am Dorffest"
      ]
  };

  test("Vereins-Kommunikationskonzept: Angaben, Fenster, Konzept mit acht Kapiteln, PDF, Lead mit Verein und Zahlen, nach dem Neuladen keine neue Anfrage", async ({ page, request }) => {
    const calls = await stubGenerate(page, KONZEPT);
    await page.goto("/tools/vereins-kommunikation");
    await page.getByRole("button", { name: "Konzept erstellen" }).click();
    await expect(page.locator("#vk-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#vk-firma").fill("FC Trogen");
    await page.locator("#vk-ort").fill("Trogen");
    await page.locator("#vk-kanton").selectOption("AR");
    await page.locator("#vk-zweck").fill("Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.");
    await page.locator("#vk-mitglieder").fill("180");
    await page.locator("#vk-entwicklung").selectOption("waechst");
    await page.getByRole("checkbox", { name: "Mitglieder gewinnen" }).check();
    await page.getByRole("checkbox", { name: "Nachwuchs", exact: true }).check();
    await page.locator("#vk-anlass-a1-name").fill("Dorffest");
    await page.locator("#vk-anlass-a1-monat").selectOption("6");
    await page.getByRole("checkbox", { name: "Website", exact: true }).check();
    await page.getByRole("checkbox", { name: "WhatsApp-Gruppen" }).check();
    await page.locator("#vk-stunden").fill("6");
    await page.getByRole("button", { name: "Konzept erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Kommunikationskonzept" })).toBeVisible();
    await expect(page.getByTestId("konzept")).toContainText("1. Ausgangslage");
    await expect(page.getByTestId("konzept")).toContainText("8. Erfolgsmessung");
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    expect(calls.generate).toBe(1);
    const pdf = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("vereins-kommunikation");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Verein: FC Trogen, Trogen");
    expect(lead.eingabe).toContain("Mitglieder: 180");
    expect(lead.ausgabe).toContain("# Kommunikationskonzept");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Kommunikationskonzept" })).toBeVisible();
    expect(calls.generate).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  const SPONSORING_TEXTE = {
    portraet:
      "Der FC Trogen spielt auf der Sportanlage Landhaus in Trogen. Der Verein hat 280 Mitglieder und führt eine Juniorenabteilung. Er fördert Jugend und Dorfleben und lädt Betriebe aus der Region zum Mitmachen ein, damit der Sport im Dorf bezahlbar bleibt.",
    warum:
      "Bei den Heimspielen sehen im Schnitt viele Familien und junge Erwachsene aus Trogen und Umgebung zu. Das Logo eines Betriebs steht dort, wo die Leute ohnehin zusammenkommen, und bleibt über die ganze Saison sichtbar.",
    dank: "Wir danken allen Betrieben, die den Verein unterstützen oder dies erwägen. Im nächsten Schritt besprechen wir gerne in einem Gespräch, welches Paket zu Ihrem Betrieb passt.",
  };

  test("Sponsoring-Dossier: Zahlen und Paket, Fenster, Dossier mit Ampel, PDF, KI-Texte auf Wunsch, Lead ohne Kontaktdaten", async ({ page, request }) => {
    const calls = await stubGenerate(page, SPONSORING_TEXTE);
    await page.goto("/tools/sponsoring-dossier");
    await expect(page.locator("label[for=sd-firma]")).toContainText("Name des Vereins");
    await page.getByRole("button", { name: "Dossier erstellen" }).click();
    await expect(page.locator("#sd-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#sd-firma").fill("FC Trogen");
    await page.locator("#sd-ort").fill("Trogen");
    await page.locator("#sd-kanton").selectOption("AR");
    await page.locator("#sd-z-mitglieder").fill("280");
    await page.locator("#sd-zielgruppe").fill("Betriebe aus Trogen, Speicher und Teufen, die bei Familien sichtbar sein wollen.");
    await page.locator("#sd-p1-preis").fill("500");
    await page.getByRole("checkbox", { name: "Paket 1: Logo auf Website" }).check();
    await page.locator("#sd-k-name").fill("Beat Keller");
    await page.locator("#sd-stichworte").fill("Gegründet 1948, Heimspiele auf dem Landhaus, grosse Juniorenabteilung");
    await page.getByRole("button", { name: "Dossier erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Sponsoring-Dossier" })).toBeVisible();
    await expect(page.getByTestId("ampel-1")).toBeVisible();
    await expect(page.getByTestId("ampel-hinweis")).toContainText("keine Marktdaten");
    await expect(page.getByTestId("dossier")).toContainText("Pakete im Vergleich");
    expect(calls.generate).toBe(0);
    const pdf = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    expect((await pdf).suggestedFilename()).toBe("sponsoring-dossier-fc-trogen.pdf");
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("sponsoring-dossier");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Verein: FC Trogen");
    expect(lead.eingabe).toContain("Mitglieder: 280");
    expect(lead.ausgabe).toContain("# Sponsoring FC Trogen");
    expect(lead.eingabe + lead.ausgabe).not.toContain("Beat Keller");
    await page.getByRole("button", { name: "Texte von der KI schreiben lassen" }).click();
    await expect(page.getByTestId("ki-hinweis")).toContainText("KI");
    await expect(page.getByTestId("dossier")).toContainText("Porträt des Vereins");
    expect(calls.generate).toBe(1);
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Sponsoring-Dossier" })).toBeVisible();
    await expect(page.getByTestId("dossier")).toContainText("Porträt des Vereins");
    expect(calls.generate).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("Empfehlungsprogramm: Rechnung, Fenster, Anreiz-Spanne, Ablauf, Vorlagen, Karte mit QR, PDF, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/empfehlungsprogramm");
    await page.getByRole("button", { name: "Programm entwerfen" }).click();
    await expect(page.locator("#ep-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#ep-firma").fill("Malerei Keller");
    await page.locator("#ep-kundenwert").fill("3000");
    await page.locator("#ep-marge").fill("25");
    await expect(page.getByTestId("ep-db")).toContainText("750");
    await page.locator("#ep-anreiz").selectOption("gutschein");
    await page.getByRole("checkbox", { name: "Beide Seiten belohnen" }).check();
    await page.locator("#ep-kanal").selectOption("karte");
    await page.locator("#ep-nummer").fill("079 123 45 67");
    await page.getByRole("radio", { name: "Du", exact: true }).check();
    await page.getByRole("button", { name: "Programm entwerfen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Empfehlungsprogramm" })).toBeVisible();
    await expect(page.getByTestId("anreiz-spanne")).toContainText("CHF");
    await expect(page.getByTestId("anreiz-richtwert")).toContainText("keine Statistik");
    await expect(page.getByTestId("mechanik").getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("list", { name: "Vorlagen" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByTestId("qr-image")).toBeVisible();
    const karte = page.waitForEvent("download");
    await page.getByTestId("download-karte").click();
    expect((await karte).suggestedFilename()).toMatch(/^empfehlungskarte-a6-malerei-keller.*\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("empfehlungsprogramm");
    const lead = (await received(request)).find((l) => l.email === email)!;
    expect(lead.eingabe).toContain("Betrieb: Malerei Keller");
    expect(lead.eingabe).toContain("Kundenwert pro Jahr: CHF 3'000.-");
    expect(lead.ausgabe).toContain("# Empfehlungsprogramm Malerei Keller");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Empfehlungsprogramm" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("Welle 8 im Browser (Rechner und Planer)", () => {
  test("Engagement-Rate-Rechner: Beispiel einfügen, Fehler ohne Follower, Ergebnis mit Diagramm und Tabelle, CSV, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/engagement-rate");
    await hydrated(page.getByRole("button", { name: "Rate berechnen" }));
    await page.getByRole("button", { name: "Beispiel einfügen" }).click();
    await expect(page.getByTestId("er-beitrag")).toHaveCount(5);
    await page.locator("#er-follower").fill("");
    await page.getByRole("button", { name: "Rate berechnen" }).click();
    await expect(page.locator("#er-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#er-follower").fill("1240");
    await page.getByRole("button", { name: "Rate berechnen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Deine Engagement-Rate" })).toBeVisible();
    await expect(page.getByTestId("er-diagramm").getByRole("img")).toBeVisible();
    await expect(page.getByTestId("er-tabelle")).toContainText("Schnitt");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /CSV/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("engagement-rate");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Plattform: Instagram");
    await page.reload();
    await expect(page.getByRole("region", { name: "Deine Engagement-Rate" })).toBeVisible();
  });

  test("Anlass-Rückwärtsplaner: Datum in der Vergangenheit wird abgelehnt, Zeitplan mit Abhaken, .ics, Lead, Neuladen mit Haken", async ({ page, request }) => {
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await page.goto("/tools/anlass-planer");
    await hydrated(page.getByRole("button", { name: "Zeitplan erstellen" }));
    await page.locator("#ap-firma").fill("Malerei Keller");
    await page.locator("#ap-name").fill("Tag der offenen Tür Malerei Keller");
    await page.locator("#ap-datum").fill("2020-01-01");
    await page.getByRole("button", { name: "Zeitplan erstellen" }).click();
    await expect(page.locator("#ap-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#ap-datum").fill(inDays(120));
    await page.getByRole("button", { name: "Zeitplan erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Zeitplan" })).toBeVisible();
    expect(await page.getByTestId("ap-aufgabe").count()).toBeGreaterThan(10);
    await expect(page.getByTestId("ap-fortschritt")).toContainText("0 von");
    await page.getByRole("checkbox", { name: "Ziel und Budget klären" }).check();
    await expect(page.getByTestId("ap-fortschritt")).toContainText("1 von");
    const download = page.waitForEvent("download");
    await page.getByTestId("ap-ics").click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("anlass-planer");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Art: Tag der offenen Tür");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Zeitplan" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Ziel und Budget klären" })).toBeChecked();
  });

  test("Angebotsarchitektur: ohne Firma eine Meldung, drei Leistungen ergeben drei Stufen mit Warnung, PDF-Download, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/angebotsarchitektur");
    await hydrated(page.getByRole("button", { name: "Angebot aufbauen" }));
    await page.getByRole("button", { name: "Angebot aufbauen" }).click();
    await expect(page.locator("#aa-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#aa-firma").fill("Malerei Keller");
    const zeilen: [string, string, string, string][] = [
      ["Zimmer auffrischen", "1500", "9", "150"],
      ["Wohnung streichen (3 Zimmer)", "3000", "22", "500"],
      ["Fassade Einfamilienhaus", "6400", "36", "1000"],
    ];
    for (const [i, [name, preis, aufwand, kosten]] of zeilen.entries()) {
      await page.locator(`#aa-name-${i + 1}`).fill(name);
      await page.locator(`#aa-preis-${i + 1}`).fill(preis);
      await page.locator(`#aa-aufwand-${i + 1}`).fill(aufwand);
      await page.locator(`#aa-kosten-${i + 1}`).fill(kosten);
    }
    await page.locator("#aa-satz").fill("85");
    await page.getByRole("button", { name: "Angebot aufbauen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Angebot in drei Stufen" })).toBeVisible();
    await expect(page.getByTestId("aa-richtwert")).toContainText("Faustregel");
    await expect(page.getByTestId("aa-vergleich").getByRole("listitem")).toHaveCount(3);
    await expect(page.getByTestId("aa-stufe-kern")).toContainText("CHF 3'390.-");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("angebotsarchitektur");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Leistung 1: Zimmer auffrischen");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Angebot in drei Stufen" })).toBeVisible();
  });

  test("Ziel- und KPI-Baum: ohne Angaben eine Meldung, Baum mit Marketingziel und Kennzahl, Rückwärtsrechnung, CSV-Vorlage, Lead, Neuladen", async ({ page, request }) => {
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await page.goto("/tools/kpi-baum");
    await hydrated(page.getByRole("button", { name: "Baum erstellen" }));
    await page.getByRole("button", { name: "Baum erstellen" }).click();
    await expect(page.locator("#kb-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#kb-firma").fill("Malerei Keller");
    await page.locator("#kb-branche").fill("Malerei");
    await page.locator("#kb-art").selectOption("auftraege");
    await page.locator("#kb-zielwert").fill("30");
    await page.locator("#kb-ausgang").fill("18");
    await page.locator("#kb-ende").fill(inDays(250));
    await page.locator("#kb-z1-text").fill("Mehr Anfragen über Google");
    await page.locator("#kb-z1-kanal").selectOption("gbp");
    await page.locator("#kb-z1-k1-kpi").selectOption("anfragen");
    await page.locator("#kb-z1-k1-zielwert").fill("17");
    await page.locator("#kb-z1-k1-zeitraum").selectOption("monat");
    await page.locator("#kb-z1-k1-quelle").selectOption({ index: 1 });
    await page.locator("#kb-q-offerten").selectOption("5");
    await page.locator("#kb-q-auftraege").selectOption("4");
    await page.getByRole("button", { name: "Baum erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Ziel- und KPI-Baum" })).toBeVisible();
    await expect(page.getByTestId("kb-baum-liste")).toContainText("Mehr Anfragen über Google");
    await expect(page.getByTestId("kb-dokument")).toContainText("Rückwärtsrechnung");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV-Vorlage herunterladen" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("kpi-baum");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Unternehmensziel: 30 Aufträge bis");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Ziel- und KPI-Baum" })).toBeVisible();
  });

});

test.describe("Welle 9 im Browser (Planer und Bausteine)", () => {
  test("Story-Post-Builder: leere Felder werden gemeldet, sechs Antworten ergeben LinkedIn- und Instagram-Fassung, Word-Download, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/story-post");
    await hydrated(page.getByRole("button", { name: "Beitrag zusammenstellen" }));
    await page.getByRole("button", { name: "Beitrag zusammenstellen" }).click();
    await expect(page.locator("#sp-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#sp-firma").fill("Malerei Keller");
    await page.locator("#sp-ausgangslage").fill("Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.");
    await page.locator("#sp-problem").fill("Zwei andere Maler hatten nur übergestrichen und die Feuchte nicht beachtet.");
    await page.locator("#sp-wendepunkt").fill("Wir haben erst die Feuchte im Putz gemessen und dann die Farbe gewählt.");
    await page.locator("#sp-ergebnis").fill("Die Fassade hält seit zwei Jahren.");
    await page.locator("#sp-lehre").fill("Erst messen, dann streichen, so hält der Anstrich länger.");
    await page.locator("#sp-bezug").fill("Wie ist das bei deinem Haus?");
    await page.getByRole("button", { name: "Beitrag zusammenstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Beitrag" })).toBeVisible();
    await expect(page.getByTestId("sp-linkedin-text")).toContainText("Die Fassade hält seit zwei Jahren.");
    await expect(page.getByTestId("sp-instagram-counter")).toContainText("Zeichen");
    await expect(page.getByTestId("sp-lesezeit")).toContainText("Lesezeit");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Word herunterladen" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.docx$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("story-post");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Ausgangslage: Frau Z.");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Beitrag" })).toBeVisible();
  });

  test("Posting-Plan: ohne Säule eine Meldung, vier Wochen mit Produktionsblock, CSV-Download, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/posting-plan");
    await hydrated(page.getByRole("button", { name: "Plan erstellen" }));
    await page.getByRole("button", { name: "Plan erstellen" }).click();
    await expect(page.locator("#pp-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#pp-firma").fill("Malerei Keller");
    await page.locator("#pp-stunden").fill("4");
    await page.getByRole("checkbox", { name: "Foto", exact: true }).check();
    await page.locator("#pp-saeule-0").fill("Vorher und nachher");
    await page.locator("#pp-saeule-1").fill("Einblick in den Alltag");
    await page.getByRole("button", { name: "Plan erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Posting-Plan" })).toBeVisible();
    await expect(page.getByTestId("pp-plan")).toContainText("Produktionsblock");
    await expect(page.getByTestId("pp-plan")).toContainText("Woche 4");
    const download = page.waitForEvent("download");
    await page.getByTestId("pp-csv").click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("posting-plan");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("Stunden pro Woche: 4");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Posting-Plan" })).toBeVisible();
  });

  test("Kundenweg-Mapper: leeres Formular wird gemeldet, vier beschriebene Phasen ergeben Gesamtaussage und Lückenliste, PDF quer, Lead, Neuladen", async ({ page, request }) => {
    await page.goto("/tools/kundenweg");
    await hydrated(page.getByRole("button", { name: "Kundenweg erstellen" }));
    await page.getByRole("button", { name: "Kundenweg erstellen" }).click();
    await expect(page.locator("#kw-error")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#kw-firma").fill("Malerei Keller");
    const phase = (n: number) => page.getByTestId(`phase-${n}`);
    await page.locator("#kw-p1-frage").fill("Wer streicht Fassaden in Gossau?");
    await phase(1).getByRole("checkbox", { name: "Website", exact: true }).check();
    await phase(1).getByRole("radio", { name: "Ja", exact: true }).check();
    await page.locator("#kw-p3-frage").fill("Warum Keller und nicht der andere Maler?");
    await phase(3).getByRole("checkbox", { name: "Empfehlungen", exact: true }).check();
    await phase(3).getByRole("radio", { name: "Teilweise", exact: true }).check();
    await page.locator("#kw-p4-frage").fill("Kann ich dem vertrauen, und wie melde ich mich?");
    await phase(4).getByRole("radio", { name: "Nein", exact: true }).check();
    await page.getByRole("button", { name: "Kundenweg erstellen" }).click();
    const email = await giveEmail(page);
    await expect(page.getByRole("region", { name: "Dein Kundenweg" })).toBeVisible();
    await expect(page.getByTestId("gesamtaussage")).toContainText("von 6 Phasen");
    expect(await page.getByTestId("phase-karte").count()).toBe(6);
    expect(await page.getByTestId("luecke").count()).toBeGreaterThan(0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF herunterladen" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect.poll(async () => (await received(request)).find((l) => l.email === email)?.tool).toBe("kundenweg");
    expect((await received(request)).find((l) => l.email === email)!.eingabe).toContain("1. Aufmerksam werden");
    await page.reload();
    await expect(page.getByRole("region", { name: "Dein Kundenweg" })).toBeVisible();
  });

  // new-wave-9:tests
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
