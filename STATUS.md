# STATUS.md

Stand: 04.10.2026. **Etappe 1b ist fertig und deployt** (hinter Vercel-Login, noch nicht öffentlich). Seit dem 04.10.2026 gilt **Plan v2** (PLAN.md): Analyse-Werkzeuge entstehen durch Crawling und KI statt durch Fragen; der Fragebogen-Check aus 1b wird in Etappe 1c durch den Marketing-Check mit Crawler ersetzt. Das Branding ist auf Design v3 umgestellt (Geist, Papier, Navy und Gold von alperna.ch).

## Fertig

**Etappe 1b**

- **Startseite** (`app/(site)/page.tsx`): Hero mit Suchfeld und zwei Knöpfen, TrustLine, vier PathCards plus Karte «Für Vereine» (Fortschritt aus dem Browser), «Meistgenutzt» (Redis `popular:<slug>`, `revalidate` 1 h, Rückfall `featured`), «Warum kostenlos», SEO-Abschnitt «Marketing in der Schweiz», Pitch, sieben Fragen; JSON-LD Organization, WebSite, FAQPage.
- **Kategorieseiten** `/strategie`, `/content`, `/analyse`, `/schweiz`, `/ki`, `/vereine`: H1, Einleitung, Pfad als SVG mit Fortschritt, Werkzeugkarten, Hintergrundtext, fünf Fragen, Pitch; JSON-LD CollectionPage, FAQPage, BreadcrumbList; eigenes Open-Graph-Bild je Seite; alle sechs in der Sitemap. Mit weniger als drei Werkzeugen steht ein Hinweis «im Aufbau» darüber.
- **Seitentexte** `content/site/*.md` (sechs Kategorien, Warum kostenlos, Marketing in der Schweiz, Fragen der Startseite) mit Prüfregeln in `lib/site-rules.ts` (Wortzahlen, Fragenzahl, Pflichtthemen, Stilregeln, TODO). `npm run content-check` prüft sie mit.
- **Referenz-Tool «Digitaler-Auftritt-Check»** (`tools/digitaler-auftritt-check/`, Text `content/tools/…`, Spec `specs/…`): sieben Fragen (Bausteinwahl plus sechs Matrizen), Punktzahl je Baustein und gesamt, bis zu acht priorisierte Massnahmen mit Link auf passende Werkzeuge, Export als PDF, Word und Text. `tools/_smoke` ist entfernt; Smoke und Routentests laufen gegen dieses Tool.
- **Qualität:** 327 Unit- und Komponententests, 27 Playwright-Tests (inkl. kompletter Durchlauf im Browser: Ergebnis, Formular vor dem PDF, Download, Lead im n8n-Stub; Pfade mit Fortschritt; 404; Open-Graph-Bild; 375 px). Lighthouse mobil, Production-Build: Startseite 98/100/100, `/strategie` 98/100/100, Tool-Seite 99/100/100 (Performance/SEO/Accessibility).

**Etappe 1a**

- Next.js 15 (App Router, TypeScript strict), Tailwind 4, shadcn/ui, `vercel.json` mit Region `fra1`.
- **Zugang und Leads:** `lib/access.ts`, `lib/redis.ts`, `lib/lead.ts`, `lib/ratelimit.ts`; Routen `/api/access`, `/api/access/complete`, `/api/lead`; `LeadGate`. Redis-Ausfall, fehlendes Redis, ausgefallenes n8n und ein gefälschtes Cookie sind getestet.
- **Design System (v3, 04.10.2026):** Geist, Geist Mono und Instrument Serif selbst gehostet, Papier-Hintergrund, Pillen-Knöpfe, Navy und Gold von alperna.ch als Akzente, Logo nachgezeichnet; Header, Footer, Suche, mobiles Menü, Höhenlinien, Skip-Link, 44-px-Touch-Ziele.
- **Registry und Seiten-Gerüst:** `lib/define-tool.ts`, `lib/registry.ts`, `ToolPageLayout` (neun Abschnitte), Tool-Route mit JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList), `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `scripts/content-check.ts`, `scripts/seo-check.ts`.
- **Gemeinsame Bausteine:** `QuestionnaireEngine`, `DocumentExport` (PDF mit eingebetteten Schriften, DOCX, Markdown-Copy), `ProfileBanner`, `ResultCard`, `ScoreBadge`, `CopyButton`, `LegalDisclaimer`, `RelatedTools`, `AlpernaPitch`, `ToolShell`, `lib/ch.ts`, Firmenprofil mit Seite `/profil` (Export, Import, alles löschen), `npm run new-tool`.
- **Qualität (Stand 1a):** 240 Unit- und Komponententests, 11 Playwright-Smoke-Tests, `npm run check` grün.
- Verifiziert im echten Browser (Chromium): freier Durchlauf bis zum Ergebnis ohne Formular, Formular beim ersten Download und beim zweiten Start, Download startet nach dem Absenden ohne Reload, danach alles offen, Lead kommt mit genau den erlaubten Feldern bei einem n8n-Stub an, 375 px ohne Überlauf, Skip-Link als erster Tab-Stopp.

## Eingerichtet (Etappe 0, am 03.10.2026)

| Was | Stand |
|---|---|
| Repo | `AlpernaGmbH/marketing-tool`, **öffentlich** (am 04.10.2026 geprüft; geplant war privat), Branch `main`. `AlpernaGmbH` ist ein **persönlicher GitHub-Account**, keine Organisation. Der Name weicht vom Plan ab (`marketing-tools` mit s). |
| Vercel | Projekt `marketing-tool` (Team `alpernatoolv1`, Hobby), mit dem Repo verknüpft, Auto-Deploy aus `main`, Region `fra1`. `*.vercel.app` ist durch Vercel-Login geschützt (nicht öffentlich, nicht indexierbar). |
| Vercel-Variablen | Gesetzt: `GATE_SECRET` (neu erzeugt, sensitiv), `N8N_WEBHOOK_URL` (sensitiv), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ERSTGESPRAECH_URL` (Calendly «Kennenlern-Gespräch»). |
| n8n | Workflow **«Tools-Lead»** (`BC48H0mAidcbY4zH`) ist aktiv: Webhook → Notion-Eintrag → Mail an `kontakt@alperna.ch` → Antwort 200. Echter Testlauf bestanden (Eintrag mit allen Feldern, Mail). Der Testeintrag steht in Notion mit Status «Verloren» und kann gelöscht werden. Der Webhook-Pfad ist ein langer Zufallspfad (Secret). |
| CRM | Neue Notion-Datenbank **«Tools-Leads (tools.alperna.ch)»** unter «CRM’s», bewusst getrennt von den Outreach-Datenbanken (deren Workflows lesen «Neu»-Leads und sollen Inbound-Leads nicht mitverarbeiten). |

## Offen

| Was | Stand |
|---|---|
| **Upstash Redis** | Die Integration `redis` ist im Vercel-Team installiert (04.10.2026, 06:47 UTC), aber **keinem Projekt zugewiesen**. Im Projekt `marketing-tool` gibt es keine Variablen `UPSTASH_REDIS_REST_URL`/`_TOKEN` (oder `KV_REST_API_*`). Zu tun: Vercel → Projekt → Storage → die Datenbank öffnen → «Connect Project» → `marketing-tool`, alle Umgebungen. Danach neu deployen (läuft mit jedem Push). Zu prüfen: Es muss «Upstash for Redis» sein (REST-Schnittstelle), nicht «Redis» von Redis Inc. (das liefert `REDIS_URL` über TCP; der Integrations-Name heisst auffällig `redis`). |
| Zugang v2, Etappe 2 | Entschieden (PLAN.md). Offen sind die Zugangsdaten: Google OAuth (Login) und E-Mail-Versand über n8n. |
| KI-Anbieter (gratis) | Entschieden: nur Gratis-Anbieter (PLAN.md, «KI ohne Kosten»). Für Etappe 2 nötig: Cloudflare-Konto mit API-Token für Workers AI, Groq-Konto mit API-Key; optional OpenRouter und Gemini. |
| Google Cloud | Nur für «Mit Google anmelden» (OAuth, kostenlos) in Etappe 2. Der Places-Schlüssel für das Google-Profil ist optional (Etappe 3, braucht Zahlungsmittel). |
| `content/pitch/bausteine.md` | Gefüllt aus COMPANY-MASTER und alperna.ch: Website (mit Einstiegsangebot), Google-Profil (Text), Social Media, Online-Shop und Buchungstool (Text). Offen: Beweise für Google-Profil, Online-Shop, Buchungstool; Google Ads bleibt ohne Text (COMPANY-MASTER 3.9). |
| `specs/digitaler-auftritt-check.md` | Gilt nur noch für den Fragebogen-Check und wird mit Etappe 1c ersetzt. |
| Rechtsabsatz in den Seitentexten | `content/site/marketing-schweiz.md` (UWG, revDSG, PBV) und `content/site/schweiz.md` stammen von mir. Nach Regel 8 muss ein Mensch gegenlesen, bevor die Seite öffentlich wird. |
| Texte mit «ohne Konto» | `content/site/*.md`, TrustLine und CLAUDE.md sagen «kein Konto». Ändern, falls Zugang v2 kommt. |
| Logo | Nachzeichnung der Original-PNG (liegt in `assets/brand/`). Ein Vektor-Original ersetzt sie. |
| n8n-Workflow «Tools-Lead-Queue» | Fehlt noch (stündlich `lead_queue` aus Redis leeren). Braucht Upstash. |
| Altes Repo | `AlpernaGmbH/alperna-website-v2` enthält den alten Stand. Kann archiviert werden. |
| DNS `tools.alperna.ch` | Ganz am Schluss (Entscheid vom 04.10.2026): CNAME `tools` → `cname.vercel-dns.com`, Domain im Vercel-Projekt eintragen. |
| Umami | Etappe 7. |

Erledigt am 04.10.2026: `NEXT_PUBLIC_WHATSAPP_NUMBER` in Vercel gesetzt (Production, Preview, Development); der Knopf «Kurz schreiben» erscheint mit dem nächsten Build. Branding v3.

### Offene Fragen an Alperna

1. **Repo öffentlich:** `marketing-tool` ist auf GitHub öffentlich. Es liegen keine Geheimnisse darin (geprüft: kein `GATE_SECRET`, kein Webhook-Pfad im Verlauf). Trotzdem Empfehlung: privat stellen (GitHub → Settings → Danger Zone → Change visibility), weil STATUS.md und die Pitch-Texte Interna enthalten. Vercel deployt auch aus privaten Repos.
2. **Partnerzahl:** COMPANY-MASTER nennt 17 (2.2) und 21 (8.2), alperna.ch nennt 28. Welche gilt? Bis dahin steht keine Partnerzahl auf den Seiten.
3. **«Einstieg ab CHF 180» auf alperna.ch:** Laut COMPANY-MASTER ist das der Einzelbeitrag, der Einstieg ist die Website (rund CHF 1'000.-). Gewollt so, oder soll die Website-Seite angepasst werden?
4. **Beweise** für Google-Profil, Online-Shop und Buchungstool: gibt es belegbare Fälle? Sonst bleiben die Felder leer.
5. **Agentur-Tool:** Der Lead «Alperna GmbH» aus meiner Probe (siehe Entscheid 28) ist noch zu löschen.
6. **Gedankenstrich:** ANTI-PATTERNS verbietet «—». Den Halbgeviertstrich « – » (in Titeln wie «Marketing in der Schweiz – was anders ist») habe ich stehen lassen. Soll er auch weg?

## Entscheide (Abweichungen vom Plan und Auslegungen)

1. **Repo:** `marketing-tool` (ohne s) auf dem persönlichen Account `AlpernaGmbH`. Die Session darf keine Repos anlegen (GitHub-Integration ohne Recht dafür); das Repo hat Alperna selbst angelegt.
2. **`defineTool` liegt in `lib/define-tool.ts`, nicht in `lib/registry.ts`.** Der Plan hätte einen Zirkelimport erzeugt (`tool.config.ts` → Registry → `tools/index.ts` → `tool.config.ts`). `lib/registry.ts` exportiert `defineTool` weiter. CLAUDE.md ist angepasst.
3. **`lib/profile.ts` (rein) und `lib/use-profile.ts` (Hook) getrennt**, damit `logic.ts` und Tests das Profil ohne React nutzen können. CLAUDE.md ist angepasst.
4. **PDF-Schriften als `.woff`, nicht `.woff2`.** `@pdf-lib/fontkit` liest woff2, scheitert beim Subsetting aber mit `RangeError`; das PDF käme nie zustande. Die Webseite nutzt woff2. Beide Formate liegen in `public/fonts/` (OFL, Lizenztexte dabei).
5. **`@types/node` 22 statt 20** (Vitest 5 verlangt es).
6. **`data/` statt `src/data/`.** Der Plan nennt beides; CLAUDE.md (Ordnerstruktur) gilt.
7. **Smoke-Hilfstool `tools/_smoke`:** in 1a nötig, weil die Zugangs-Routen den Slug gegen die Registry prüfen. In 1b entfernt; Smoke- und Routentests laufen gegen `digitaler-auftritt-check`.
8. **Vorbefüllung aus dem Profil gewinnt gegen alte Antworten.** Eine Frage, deren Wert im Profil steht, wird nicht gestellt (Regel 10); also gilt der aktuelle Profilwert. `prefillFromProfile()` setzt das für jedes Tool gleich um.
9. **Ohne `GATE_SECRET` ist das Gate aus** (`reason: gate_disabled`, alles offen, Log-Stichwort `gate_unconfigured`). Das folgt «ein Besucher wird nie wegen unserer Technik blockiert», heisst aber: Wer die Variable in Vercel vergisst, bekommt keine Leads. Gehört in die Launch-Checkliste.
10. **Ein bereits gezählter Durchlauf zeigt das Formular nicht erneut** (Antworten ändern, zurückgehen, fortsetzen). Das Gate steht nur am Anfang eines neuen Durchlaufs. Dasselbe gilt für zwei parallel begonnene Tools: Beide dürfen bis zum Ergebnis, wie in CLAUDE.md verlangt («nie vor dem Ergebnis eines begonnenen Durchlaufs»).
11. **`/api/access` läuft bei jedem Aufruf einer Tool-Seite** (für die Statuszeile). Das sind rund 2 Redis-Befehle pro Seitenaufruf (Schätzung, nicht gemessen), also grob 250'000 Seitenaufrufe pro Monat im Free Tier mit 500'000 Befehlen (Schätzung). Messen in Etappe 7.
12. **`mt_gate` ist `Secure` in Production.** Lokal über `next start` auf `localhost` funktioniert das; HTTP auf anderen Hosts nicht.
13. **`noindex` für alle Nicht-Production-Deployments** (`middleware.ts`) schon jetzt, nicht erst in Etappe 7.
14. **`LegalDisclaimer` enthält keinen eigenen Text.** Hinweistext und Stand kommen aus `content/legal/`. **Offen für 4b:** Wie gelangen die Rechtstexte in die Client-Komponenten der Rechts-Tools (Props aus einer Server-Komponente oder ein Build-Schritt)?
15. **DOCX nutzt den Schriftnamen Geist ohne Einbettung.** Wer sie nicht installiert hat, sieht in Word eine Ersatzschrift.
16. **Branding (04.10.2026):** Schrift, Hintergrund und Formen von der neuen Alperna-Website (Geist, Papier `#F3F1EC`), Farben von alperna.ch (Navy `#111A28`, Gold `#FFD700`, als Akzent). Das Logo ist die Bildmarke von alperna.ch, mit Potrace nachgezeichnet (nicht das Original-SVG; bei Gelegenheit durch die Originaldatei ersetzen). Auslegung von «weisser Hintergrund»: Seite in Papier `#F3F1EC`, Karten in `#FFFDF8`.
17. **Footer- und Platzhalterseiten** (`/impressum`, `/datenschutz`, `/ueber`) sind leer und `noindex`. Der Link im LeadGate geht auf `/datenschutz`. **Das Formular darf nicht live gehen, bevor diese Seite echten Inhalt hat.**

26. **Plan v2 (04.10.2026):** drei Werkzeug-Klassen (Analyse mit Crawler und KI, Generator, Rechner), neue Reihenfolge «Analyse zuerst», Zugang v2 als Entwurf. Einzelheiten in PLAN.md.
27. **Agentur-Tool lesend eingebunden:** `AlpernaGmbH/tool` (privat) ist in dieser Sitzung als Quelle der Analyse-Engine angebunden. Gelesen wurden `CLAUDE.md`, `lib/marketing-check/analyzer.mjs` und `app/api/website/analyze/route.ts`. Geschrieben wurde nichts.
28. **Nebenwirkung meiner Probe im Agentur-Tool:** Ich habe die öffentliche Analyse-Schnittstelle (`alperna-tool.vercel.app/api/website/analyze`) einmal mit `alperna.ch` aufgerufen, um das Ergebnisformat zu sehen. Laut Code (`lib/marketing-check/leads.ts`) legt jeder erfolgreiche Check dort eine Firma mit Status «Lead» an (oder ergänzt eine passende Firma mit gleicher Domain oder gleichem Namen) und speichert Ergebnis und Timeline-Notiz. Mein Aufruf hat also vermutlich eine Firma «Alperna GmbH» (Quelle Website-Check, Zeit 04.10.2026, 05:47 UTC) erzeugt oder ergänzt. **Bitte im Agentur-Tool prüfen und löschen.** Ich hätte vorher fragen sollen. Für den Marketing-Check hier gilt: Ein Check speichert keine Firma und keinen Lead, solange niemand eingewilligt hat.
29. **Branding:** «weisser Hintergrund» ausgelegt als Papier `#F3F1EC` für die Seite und `#FFFDF8` für Karten (die neue Website nutzt Papier). Wenn reines Weiss gemeint war, ist es eine Zeile in `app/globals.css` (`--page`).
30. **Performance nach dem Redesign:** Der Startbildschirm der Tools baut die Einleitung beim Hydrieren nicht mehr neu auf (sonst verschiebt sich der LCP), Mono- und Serif-Schrift werden nicht vorgeladen, Geist 600 entfällt (Titel sind 500).

31. **Zugang v2 entschieden (04.10.2026):** ein freier Durchlauf, danach Konto-Fenster mit Google u. a. Das Lead-Formular entfällt in Etappe 2; die Einwilligung bleibt als Häkchen. Apple nur, wenn Alperna das Entwicklerkonto zahlt. Einzelheiten in PLAN.md.
32. **KI nur gratis (04.10.2026):** Fakten und Massnahmen ohne KI, KI nur für Angemeldete, Zwischenspeicher, mehrere Gratis-Anbieter, Tageslimit. Rechnung und Quellen in PLAN.md. Gemini ist kein Fundament mehr.
33. **Alperna-Dokumente als Wahrheitsquelle (04.10.2026):** COMPANY-MASTER, BRAND-VOICE-CORE und ANTI-PATTERNS liegen nur bei Alperna (sie enthalten interne Finanzzahlen). Im Repo steht der Auszug `docs/MARKE.md`; die Sperrliste läuft als Code in `lib/brand-rules.ts` (41 Tests) und prüft Seitentexte und Pitch-Bausteine bei jedem `content-check`. Folgen: Die Texte «Warum kostenlos» und die Antwort «Wer steckt dahinter» sind neu geschrieben («Agentur» fällt weg). **Mein Entwurf von gestern liess Google Ads aktiv anbieten; das widersprach COMPANY-MASTER 3.9** und ist entfernt. Das geplante Werkzeug «customer-journey» heisst «kundenweg», weil «Customer Journey» auf der Sperrliste steht.
34. **Logo (04.10.2026):** neu nachgezeichnet aus der Original-PNG von Alperna statt aus der Framer-Version (sauberere Kanten, Gold exakt `#FFD700`).

## Neue Abhängigkeiten (Begründung)

Laufzeit: `@upstash/redis`, `@upstash/ratelimit` (Zähler, Limits); `react-hook-form`, `@hookform/resolvers`, `zod` (Formular, Validierung); `pdf-lib`, `@pdf-lib/fontkit` (PDF mit eigenen Schriften), `docx` (Word), `qrcode`, `jszip` (ab 4a), `fuse.js` (Suche), `gray-matter`, `remark`, `remark-html` (Seitentexte); `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`, `shadcn` (kommen mit shadcn/ui).
Entwicklung: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/*` (Tests); `@playwright/test` (Smoke); `tsx` (Skripte); `lighthouse`, `chrome-launcher` (`npm run lh`); `@types/qrcode`.

## Bekannte Punkte

- `npm audit` meldet 7 Funde (1 moderat, 6 hoch): PostCSS (läuft nur beim Build über unser eigenes CSS), `braces`/`micromatch`/`fast-glob` (nur im ESLint-Plugin). Kein Laufzeit-Risiko; der Fix wäre Next 16 und damit gegen den Plan. Neu bewerten, wenn Next 15 ein Patch-Release bekommt.
- **Vercel Hobby ist laut Plan nur für nicht-kommerzielle Nutzung.** Eine Lead-Seite einer GmbH ist wahrscheinlich kommerziell. Das Risiko steht im Plan (Pro rund USD 20 pro Sitz); die Entscheidung liegt bei euch.
- Mit «Alles löschen» soll der Besucher in Etappe 7 auch seinen Zähler zurücksetzen können (`/api/access/reset`, Plan: «bewusst»). Wer das nutzt, erhält jedes Mal einen neuen freien Durchlauf.
- `dynamicParams = false` auf `/[kategorie]` und `/tools/[slug]`: Lokal mit `next start` schreibt jede unbekannte Adresse (z. B. `/gibt-es-nicht`) «NoFallbackError» ins Log, die Antwort ist trotzdem 404. Auf Vercel prüfen, ob das Log dort ebenfalls Lärm macht.
- Lighthouse `/profil`: SEO 66, weil die Seite absichtlich `noindex` ist.

18. **Matrixfragen zählen als eine Frage (Regel 9, höchstens zehn Fragen).** Der Digitaler-Auftritt-Check hat sieben Bildschirme, darin je drei bis vier Ja/Teilweise/Nein-Aussagen, also bis zu 21 Aussagen. Das ist eine Auslegung von «Frage = Bildschirm». Wer streng zählt, muss den Check kürzen.
19. **Block «Dein Betrieb» im Intro des Referenz-Tools** (Firma, Organisationstyp, Branche, Ort, Kanton, Grösse; freiwillig). Er schreibt ins Firmenprofil und wird im Export als Kopf verwendet. Gemeinsamer Baustein: `components/tool/ProfileFieldsForm.tsx` (auch vom `/profil`-Editor genutzt).
20. **`beweis: @baustein`** in `content/tools/<slug>.md` nimmt den Beweis aus `content/pitch/bausteine.md`, statt ihn je Tool zu wiederholen.
21. **«Meistgenutzt»:** erst Werkzeuge mit Durchläufen (absteigend), dann `featured`, dann der Rest, höchstens sechs. Ohne Redis zeigt die Seite `featured`.
22. **Der Pitch-Abschnitt entfällt ganz**, wenn weder Text noch Knopf vorhanden ist (siehe «Offen»).
23. **Die Kopfzeilen-Suche entfällt auf der Startseite**, weil dort das grosse Suchfeld steht (sonst zwei Suchfelder untereinander).
24. **Kategorieseiten sind schon mit einem Werkzeug indexierbar** und in der Sitemap, weil sie je rund 750 Wörter eigenen Text haben. Bei weniger als drei Werkzeugen steht «Dieser Bereich ist im Aufbau» darüber.
25. **Zwei Texte weichen von der Vorlage ab:** Die Startseite verspricht nicht mehr «nach Schweizer Recht» (wäre eine Rechtsaussage, Regel 8); die Schweiz-Seite heisst «Recht und Praxis für Schweizer KMU».

## Offene Quellen für Zahlen

Keine. Bisher enthält kein Seitentext Zahlen.

## Für Etappe 2

- Neue Tools mit `npm run new-tool <slug>`; Vorlage ist `tools/digitaler-auftritt-check/`.
- Die Pfade (`pathStep`) füllen sich von selbst: PathCard, Pfad-Grafik, Sitemap und JSON-LD lesen aus der Registry.
- `npm run seo-check` meldet für das Referenz-Tool noch «nur 1 interne Links», weil die drei verwandten Werkzeuge noch nicht existieren. Das ist erwartet und Teil des Launch-Checks.
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
