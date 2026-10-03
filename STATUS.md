# STATUS.md

Stand: 03.10.2026. **Etappe 1b (Startseite, Kategorieseiten, Referenz-Tool «Digitaler-Auftritt-Check») ist fertig, getestet und auf Vercel deployt** (hinter Vercel-Login, noch nicht öffentlich). Etappe 0 ist bis auf Upstash, WhatsApp-Nummer, Logo/Farben und DNS erledigt (siehe «Offen»).

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
- **Design System:** Tokens, Poppins und Montserrat selbst gehostet, Header, Footer, Suche, mobiles Menü, Höhenlinien, Skip-Link, 44-px-Touch-Ziele.
- **Registry und Seiten-Gerüst:** `lib/define-tool.ts`, `lib/registry.ts`, `ToolPageLayout` (neun Abschnitte), Tool-Route mit JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList), `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `scripts/content-check.ts`, `scripts/seo-check.ts`.
- **Gemeinsame Bausteine:** `QuestionnaireEngine`, `DocumentExport` (PDF mit eingebetteten Schriften, DOCX, Markdown-Copy), `ProfileBanner`, `ResultCard`, `ScoreBadge`, `CopyButton`, `LegalDisclaimer`, `RelatedTools`, `AlpernaPitch`, `ToolShell`, `lib/ch.ts`, Firmenprofil mit Seite `/profil` (Export, Import, alles löschen), `npm run new-tool`.
- **Qualität (Stand 1a):** 240 Unit- und Komponententests, 11 Playwright-Smoke-Tests, `npm run check` grün.
- Verifiziert im echten Browser (Chromium): freier Durchlauf bis zum Ergebnis ohne Formular, Formular beim ersten Download und beim zweiten Start, Download startet nach dem Absenden ohne Reload, danach alles offen, Lead kommt mit genau den erlaubten Feldern bei einem n8n-Stub an, 375 px ohne Überlauf, Skip-Link als erster Tab-Stopp.

## Eingerichtet (Etappe 0, am 03.10.2026)

| Was | Stand |
|---|---|
| Repo | `AlpernaGmbH/marketing-tool`, privat, Branch `main`. `AlpernaGmbH` ist ein **persönlicher GitHub-Account**, keine Organisation. Der Name weicht vom Plan ab (`marketing-tools` mit s). |
| Vercel | Projekt `marketing-tool` (Team `alpernatoolv1`, Hobby), mit dem Repo verknüpft, Auto-Deploy aus `main`, Region `fra1`. `*.vercel.app` ist durch Vercel-Login geschützt (nicht öffentlich, nicht indexierbar). |
| Vercel-Variablen | Gesetzt: `GATE_SECRET` (neu erzeugt, sensitiv), `N8N_WEBHOOK_URL` (sensitiv), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ERSTGESPRAECH_URL` (Calendly «Kennenlern-Gespräch»). |
| n8n | Workflow **«Tools-Lead»** (`BC48H0mAidcbY4zH`) ist aktiv: Webhook → Notion-Eintrag → Mail an `kontakt@alperna.ch` → Antwort 200. Echter Testlauf bestanden (Eintrag mit allen Feldern, Mail). Der Testeintrag steht in Notion mit Status «Verloren» und kann gelöscht werden. Der Webhook-Pfad ist ein langer Zufallspfad (Secret). |
| CRM | Neue Notion-Datenbank **«Tools-Leads (tools.alperna.ch)»** unter «CRM’s», bewusst getrennt von den Outreach-Datenbanken (deren Workflows lesen «Neu»-Leads und sollen Inbound-Leads nicht mitverarbeiten). |

## Offen

| Was | Stand |
|---|---|
| Upstash Redis | Muss im Vercel-Dashboard angeklickt werden (Storage → Upstash Redis, Region EU, Free). Bis dahin zählt nur das Cookie; die Gate-Logik funktioniert so, ist aber pro Gerät statt pro IP. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Fehlt. Ohne sie entfällt der Knopf «Kurz schreiben». |
| n8n-Workflow «Tools-Lead-Queue» | Fehlt noch (stündlich `lead_queue` aus Redis leeren). Braucht Upstash. Ohne ihn gehen Leads verloren, wenn n8n länger ausfällt und Redis gleichzeitig läuft. |
| `assets/brand/` | Leer. Farben `--ink` und `--accent` sowie das Wortlogo sind **Platzhalter** (siehe `assets/brand/README.md`). |
| `content/pitch/bausteine.md` | Vorlage mit TODO-Feldern liegt da, **Inhalt fehlt** (sechs Bausteine, Einstiegsangebot). Offene Felder erscheinen nicht auf der Seite. |
| `specs/digitaler-auftritt-check.md` | **Entwurf von Claude aus dem Plan**, nicht von Alperna. Prüfpunkte, Gewichte und Aufwand sind Einschätzungen (im Ergebnis so benannt). Bitte lesen und korrigieren. |
| Rechtsabsatz in den Seitentexten | `content/site/marketing-schweiz.md` (Abschnitt UWG, revDSG, PBV) und `content/site/schweiz.md` erklären Gesetze allgemein, ohne Zahlen. Nach Regel 8 sollte ein Mensch das gegenlesen, bevor die Seite öffentlich wird. |
| Pitch auf Startseite und Kategorien | Der Abschnitt «Wenn du das lieber abgibst» erscheint erst, wenn `content/pitch/bausteine.md` gefüllt ist oder `NEXT_PUBLIC_ERSTGESPRAECH_URL` / `NEXT_PUBLIC_WHATSAPP_NUMBER` beim Build gesetzt sind. Davor bleibt er weg, statt als leerer Kasten zu stehen. (Auf Vercel ist die Erstgespräch-URL gesetzt; der Pitch zeigt dort also die Knöpfe.) |
| DNS `tools.alperna.ch` | CNAME `tools` → `cname.vercel-dns.com` und Domain im Vercel-Projekt hinzufügen. Erst dann wird die Seite öffentlich. |
| Altes Repo | `AlpernaGmbH/alperna-website-v2` enthält denselben Stand auf dem Branch `claude/pensive-newton-33588d`. Kann archiviert oder gelöscht werden. |
| Umami, Gemini-Key | Umami erst Etappe 7, Gemini erst Etappe 8. Beides blockiert Etappe 1 nicht. |

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
