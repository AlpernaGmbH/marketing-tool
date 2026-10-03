# STATUS.md

Stand: 03.10.2026. **Etappe 1a (Infrastruktur) ist im Code fertig und getestet. Es läuft noch nichts online**, weil Voraussetzungen aus Etappe 0 fehlen (siehe «Offen»).

## Fertig

- Next.js 15 (App Router, TypeScript strict), Tailwind 4, shadcn/ui, `vercel.json` mit Region `fra1`.
- **Zugang und Leads:** `lib/access.ts`, `lib/redis.ts`, `lib/lead.ts`, `lib/ratelimit.ts`; Routen `/api/access`, `/api/access/complete`, `/api/lead`; `LeadGate`. Redis-Ausfall, fehlendes Redis, ausgefallenes n8n und ein gefälschtes Cookie sind getestet.
- **Design System:** Tokens, Poppins und Montserrat selbst gehostet, Header, Footer, Suche, mobiles Menü, Höhenlinien, Skip-Link, 44-px-Touch-Ziele.
- **Registry und Seiten-Gerüst:** `lib/define-tool.ts`, `lib/registry.ts`, `ToolPageLayout` (neun Abschnitte), Tool-Route mit JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList), `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `scripts/content-check.ts`, `scripts/seo-check.ts`.
- **Gemeinsame Bausteine:** `QuestionnaireEngine`, `DocumentExport` (PDF mit eingebetteten Schriften, DOCX, Markdown-Copy), `ProfileBanner`, `ResultCard`, `ScoreBadge`, `CopyButton`, `LegalDisclaimer`, `RelatedTools`, `AlpernaPitch`, `ToolShell`, `lib/ch.ts`, Firmenprofil mit Seite `/profil` (Export, Import, alles löschen), `npm run new-tool`.
- **Qualität:** 240 Unit- und Komponententests, 11 Playwright-Smoke-Tests, `npm run check` grün. Lighthouse mobil gegen den Production-Build: Startseite und eine Tool-Seite je Performance 98, SEO 100, Accessibility 100 (gemessen mit einem Test-Tool, das danach wieder entfernt wurde).
- Verifiziert im echten Browser (Chromium): freier Durchlauf bis zum Ergebnis ohne Formular, Formular beim ersten Download und beim zweiten Start, Download startet nach dem Absenden ohne Reload, danach alles offen, Lead kommt mit genau den erlaubten Feldern bei einem n8n-Stub an, 375 px ohne Überlauf, Skip-Link als erster Tab-Stopp.

## Offen (Voraussetzungen, die nur ihr erledigen könnt)

| Was | Stand bei der Prüfung am 03.10.2026 |
|---|---|
| Vercel-Projekt | Team `alpernatoolv1` ist verbunden, **enthält aber kein Projekt**. Damit gibt es auch kein `vercel link`, keine Preview-URL und keine Env-Variablen. |
| Upstash Redis | Nicht angelegt (hängt am Vercel-Projekt). Bis dahin zählt nur das Cookie. |
| n8n-Workflow «Tools-Lead» | **Existiert nicht.** n8n ist verbunden (11 andere Workflows), Credentials für Gmail, Notion und Anthropic sind da. `N8N_WEBHOOK_URL` fehlt. |
| Repo | Der Plan nennt `alpernagmbh/marketing-tools`. Gebaut wurde in `AlpernaGmbH/alperna-website-v2` (leer, einziges Repo dieser Session). Name und Vercel-Verknüpfung sind eure Entscheidung. |
| `assets/brand/` | Leer. Farben `--ink` und `--accent` sowie das Wortlogo sind **Platzhalter** (siehe `assets/brand/README.md`). |
| `content/pitch/bausteine.md` | Vorlage mit TODO-Feldern liegt da, **Inhalt fehlt** (sechs Bausteine, Einstiegsangebot). Offene Felder erscheinen nicht auf der Seite. |
| `specs/digitaler-auftritt-check.md` | Fehlt; Voraussetzung für Etappe 1b. |
| Env-Variablen | `GATE_SECRET`, `N8N_WEBHOOK_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_ERSTGESPRAECH_URL`, Upstash-Paar. Vorlage: `.env.example`. **Ohne `GATE_SECRET` ist das Gate aus** (siehe Entscheide 9). |
| DNS `tools.alperna.ch` | CNAME auf Vercel, erst nach dem Projekt. |
| Umami, Gemini-Key | Umami erst Etappe 7, Gemini erst Etappe 8. Beides blockiert Etappe 1 nicht. |

## Entscheide (Abweichungen vom Plan und Auslegungen)

1. **Repo:** Siehe oben. Der Code ist unabhängig vom Repo-Namen und lässt sich verschieben.
2. **`defineTool` liegt in `lib/define-tool.ts`, nicht in `lib/registry.ts`.** Der Plan hätte einen Zirkelimport erzeugt (`tool.config.ts` → Registry → `tools/index.ts` → `tool.config.ts`). `lib/registry.ts` exportiert `defineTool` weiter. CLAUDE.md ist angepasst.
3. **`lib/profile.ts` (rein) und `lib/use-profile.ts` (Hook) getrennt**, damit `logic.ts` und Tests das Profil ohne React nutzen können. CLAUDE.md ist angepasst.
4. **PDF-Schriften als `.woff`, nicht `.woff2`.** `@pdf-lib/fontkit` liest woff2, scheitert beim Subsetting aber mit `RangeError`; das PDF käme nie zustande. Die Webseite nutzt woff2. Beide Formate liegen in `public/fonts/` (OFL, Lizenztexte dabei).
5. **`@types/node` 22 statt 20** (Vitest 5 verlangt es).
6. **`data/` statt `src/data/`.** Der Plan nennt beides; CLAUDE.md (Ordnerstruktur) gilt.
7. **Smoke-Hilfstool `tools/_smoke`:** Die Zugangs-Routen validieren den Slug gegen die Registry, ein echtes Tool gibt es erst in 1b. Das Hilfstool ist nur mit `MT_SMOKE=1` aktiv. Mit 1b entfernen und Smoke gegen `digitaler-auftritt-check` laufen lassen.
8. **Vorbefüllung aus dem Profil gewinnt gegen alte Antworten.** Eine Frage, deren Wert im Profil steht, wird nicht gestellt (Regel 10); also gilt der aktuelle Profilwert. `prefillFromProfile()` setzt das für jedes Tool gleich um.
9. **Ohne `GATE_SECRET` ist das Gate aus** (`reason: gate_disabled`, alles offen, Log-Stichwort `gate_unconfigured`). Das folgt «ein Besucher wird nie wegen unserer Technik blockiert», heisst aber: Wer die Variable in Vercel vergisst, bekommt keine Leads. Gehört in die Launch-Checkliste.
10. **Ein bereits gezählter Durchlauf zeigt das Formular nicht erneut** (Antworten ändern, zurückgehen, fortsetzen). Das Gate steht nur am Anfang eines neuen Durchlaufs. Dasselbe gilt für zwei parallel begonnene Tools: Beide dürfen bis zum Ergebnis, wie in CLAUDE.md verlangt («nie vor dem Ergebnis eines begonnenen Durchlaufs»).
11. **`/api/access` läuft bei jedem Aufruf einer Tool-Seite** (für die Statuszeile). Das sind rund 2 Redis-Befehle pro Seitenaufruf (Schätzung, nicht gemessen), also grob 250'000 Seitenaufrufe pro Monat im Free Tier mit 500'000 Befehlen (Schätzung). Messen in Etappe 7.
12. **`mt_gate` ist `Secure` in Production.** Lokal über `next start` auf `localhost` funktioniert das; HTTP auf anderen Hosts nicht.
13. **`noindex` für alle Nicht-Production-Deployments** (`middleware.ts`) schon jetzt, nicht erst in Etappe 7.
14. **`LegalDisclaimer` enthält keinen eigenen Text.** Hinweistext und Stand kommen aus `content/legal/`. **Offen für 4b:** Wie gelangen die Rechtstexte in die Client-Komponenten der Rechts-Tools (Props aus einer Server-Komponente oder ein Build-Schritt)?
15. **DOCX nutzt die Schriftnamen Poppins und Montserrat ohne Einbettung.** Wer sie nicht installiert hat, sieht in Word eine Ersatzschrift.
16. **Platzhalter bis zur Lieferung:** Wortlogo «Alperna», `app/icon.svg`, `--ink #0a0a0a`, `--accent #4b3fd6`.
17. **Footer- und Platzhalterseiten** (`/impressum`, `/datenschutz`, `/ueber`) sind leer und `noindex`. Der Link im LeadGate geht auf `/datenschutz`. **Das Formular darf nicht live gehen, bevor diese Seite echten Inhalt hat.**

## Neue Abhängigkeiten (Begründung)

Laufzeit: `@upstash/redis`, `@upstash/ratelimit` (Zähler, Limits); `react-hook-form`, `@hookform/resolvers`, `zod` (Formular, Validierung); `pdf-lib`, `@pdf-lib/fontkit` (PDF mit eigenen Schriften), `docx` (Word), `qrcode`, `jszip` (ab 4a), `fuse.js` (Suche), `gray-matter`, `remark`, `remark-html` (Seitentexte); `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`, `shadcn` (kommen mit shadcn/ui).
Entwicklung: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/*` (Tests); `@playwright/test` (Smoke); `tsx` (Skripte); `lighthouse`, `chrome-launcher` (`npm run lh`); `@types/qrcode`.

## Bekannte Punkte

- `npm audit` meldet 7 Funde (1 moderat, 6 hoch): PostCSS (läuft nur beim Build über unser eigenes CSS), `braces`/`micromatch`/`fast-glob` (nur im ESLint-Plugin). Kein Laufzeit-Risiko; der Fix wäre Next 16 und damit gegen den Plan. Neu bewerten, wenn Next 15 ein Patch-Release bekommt.
- **Vercel Hobby ist laut Plan nur für nicht-kommerzielle Nutzung.** Eine Lead-Seite einer GmbH ist wahrscheinlich kommerziell. Das Risiko steht im Plan (Pro rund USD 20 pro Sitz); die Entscheidung liegt bei euch.
- Mit «Alles löschen» soll der Besucher in Etappe 7 auch seinen Zähler zurücksetzen können (`/api/access/reset`, Plan: «bewusst»). Wer das nutzt, erhält jedes Mal einen neuen freien Durchlauf.
- Console-404 auf der Tool-Seite: Header verlinkt die sechs Kategorieseiten, die es erst in 1b gibt.
- Lighthouse `/profil`: SEO 66, weil die Seite absichtlich `noindex` ist.

## Offene Quellen für Zahlen

Keine. Bisher enthält kein Seitentext Zahlen.

## Für Etappe 1b

- `specs/digitaler-auftritt-check.md` und `content/pitch/bausteine.md` müssen vorliegen.
- Kategorieseiten, Startseite, `content/site/*.md`, `PathCard`; `opengraph-image.tsx` je Kategorie; Kategorien in `sitemap.ts` aufnehmen.
- `tools/_smoke` entfernen, Smoke-Test auf das Referenz-Tool umstellen.
- `lh` ist reines `.mjs` (tsx würde `__name`-Helfer einfügen, die in Lighthouses Seitenskripten fehlen). `NEXT_PUBLIC_*` wirken erst nach einem neuen Build.

## Launch-Checkliste (Etappe 7, bisher erfüllt: nichts)

- [ ] Alle Tool-Seiten mobil unter 2 s
- [ ] Lighthouse ≥ 95 je Tool (Tabelle)
- [ ] Formular → CRM → Benachrichtigung funktioniert
- [ ] Erster Durchlauf frei, Formular beim zweiten Start und beim Download, danach alles offen
- [ ] `/profil` Export und «Alles löschen» funktionieren
- [ ] Impressum, Datenschutz, Über live
- [ ] `GATE_SECRET` in Production gesetzt
- [ ] Search Console verifiziert, Sitemap eingereicht
- [ ] Druck-PDFs auf Papier geprüft
- [ ] Eine echte Person ohne Anleitung durch drei Tools geschickt
