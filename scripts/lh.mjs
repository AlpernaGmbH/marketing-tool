/* Lighthouse gegen den lokalen Production-Build (CLAUDE.md, Harte Regel 5: mobil je ≥ 95).
 *   npm run build && npm run lh -- <slug>          Tool-Seite /tools/<slug>
 *   npm run lh -- home | /strategie | /profil       Startseite oder beliebiger Pfad
 * Chrome: CHROME_PATH oder PLAYWRIGHT_BROWSERS_PATH/chromium, sonst das System-Chrome.
 * Bewusst reines .mjs: tsx fügt `__name`-Helfer ein, die in Lighthouses Seitenskripten fehlen.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const THRESHOLD = 95;
const PORT = Number(process.env.LH_PORT ?? 3199);

function targetPath(arg) {
  if (arg === "home") return "/";
  if (arg.startsWith("/")) return arg;
  return `/tools/${arg}`;
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw && fs.existsSync(path.join(pw, "chromium"))) return path.join(pw, "chromium");
  return undefined;
}

async function waitFor(url, ms = 30_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* Server startet noch */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server unter ${url} nicht erreichbar`);
}

// Die Launch-Sperre (lib/launch.ts) setzt noindex, solange NEXT_PUBLIC_INDEXABLE nicht «true» ist.
// Dann würde «is-crawlable» jede Seite auf SEO 69 drücken; der Wert sagt über die Seite nichts aus.
// Mit NEXT_PUBLIC_INDEXABLE=true (Build und Lauf) bleibt die Prüfung aktiv.
const SKIP_AUDITS = process.env.NEXT_PUBLIC_INDEXABLE === "true" ? [] : ["is-crawlable"];

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Aufruf: npm run lh -- <slug|home|/pfad>");
    process.exit(1);
  }
  if (!fs.existsSync(".next/BUILD_ID")) {
    console.error("Kein Production-Build gefunden. Zuerst: npm run build");
    process.exit(1);
  }

  let server;
  const base = `http://127.0.0.1:${PORT}`;
  try {
    // Läuft schon etwas auf dem Port (z. B. ein eigener `next start`), wird das verwendet.
    const running = await fetch(base).then((r) => r.status < 500).catch(() => false);
    if (!running) {
      server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { stdio: "ignore" });
      await waitFor(base);
    }
    const url = `${base}${targetPath(arg)}`;
    const chrome = await chromeLauncher.launch({
      chromePath: chromePath(),
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });
    try {
      // Standard von Lighthouse: Mobile-Emulation mit gedrosselter Verbindung.
      const result = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "seo", "accessibility"], skipAudits: SKIP_AUDITS });
      const cats = result?.lhr.categories;
      if (!cats) throw new Error("Lighthouse lieferte kein Ergebnis");
      let failed = false;
      console.log(`Lighthouse mobil: ${url}`);
      for (const key of ["performance", "seo", "accessibility"]) {
        const score = Math.round((cats[key].score ?? 0) * 100);
        const ok = score >= THRESHOLD;
        if (!ok) failed = true;
        console.log(`  ${ok ? "OK    " : "ZU TIEF"} ${cats[key].title}: ${score}`);
      }
      if (failed) {
        const audits = Object.values(result.lhr.audits).filter(
          (a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "notApplicable",
        );
        for (const a of audits.slice(0, 12)) console.log(`    - ${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`);
        process.exitCode = 1;
      }
    } finally {
      await chrome.kill();
    }
  } finally {
    server?.kill();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
