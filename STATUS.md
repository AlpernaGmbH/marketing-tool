# STATUS.md

Stand: 04.10.2026. **Etappe 1c ist gebaut** (Marketing-Check mit Crawler ersetzt den Fragebogen; Push und Deploy siehe unten). Etappe 1b ist deployt (hinter Vercel-Login, noch nicht öffentlich). Seit dem 04.10.2026 gilt **Plan v2** (PLAN.md): Analyse-Werkzeuge entstehen durch Crawling und KI statt durch Fragen. Das Branding ist auf Design v3 umgestellt (Geist, Papier, Navy und Gold von alperna.ch).

## Fertig

**Etappe 1c (04.10.2026): Marketing-Check mit Crawler, ohne KI und ohne Konto**

- **Engine** `lib/check/` (Port von `analyzer.mjs` aus dem Agentur-Tool, TypeScript): `net.ts` (SSRF-Schutz: Host auflösen, jede Adresse prüfen, Verbindung an die geprüfte Adresse binden, Weiterleitungen neu prüfen, 2,5 MB, 12 s, nur Port 80/443, gzip/deflate/Brotli), `seo.ts` (16 Prüfpunkte), `social.ts`, `gbp.ts` (Places API optional), `detect.ts` (Shop, Buchung, Newsletter, Tracking, Social-Links), `analyze.ts`, `massnahmen.ts` (feste Texte, Wirkung und Aufwand), `client.ts` (NDJSON-Leser im Browser). Jeder Prüfpunkt trägt eine Kennung (`seo.title`, `gbp.reviews` …) als Anker für die spätere KI-Schicht.
- **Gleiche Bewertung wie das Agentur-Tool:** `alperna.ch` ergibt mit Branche «Beratung» und ohne Social-Angaben in beiden Systemen **53 Punkte** (live geprüft am 04.10.2026). Mit Instagram wöchentlich: 60.
- **Route** `POST /api/check` (Node, bis 60 s): streamt `step`-, `result`- und `error`-Ereignisse (NDJSON), prüft Eingabe, Limit (8 pro Stunde und IP-Hash) und freien Durchlauf (`canStart`, 403 `gate`). Loggt nur Route, Statuscode und Stichwort, nie Adresse, Firma oder IP (getestet).
- **Werkzeug** `tools/digitaler-auftritt-check/`: Formular mit Profil-Vorbefüllung (Firma, Website, Ort; neues Profilfeld `website`), Branche, Social-Kanäle (freiwillig); Fortschritt aus den echten Server-Schritten; Ergebnis mit Punktzahl, bis zu acht Schritten, allen Bereichen und Prüfpunkten (aufklappbar) und dem Kasten «Was gemessen ist und was nicht»; Export PDF, Word, Text. Schreibt Branche und Kanäle ins Profil, nur wenn dort leer.
- **Seitentext** neu (`content/tools/digitaler-auftritt-check.md`, Beispiel mit dem echten Ergebnis der Engine auf einer Beispielseite), **Spec** neu (`specs/digitaler-auftritt-check.md`).
- **Qualität:** 480 Unit- und Komponententests (neu: Netz-Schutz, Engine, Route, Client, Logik, Ergebnis-Ansicht), 31 Playwright-Tests (Check im Browser mit gemockter Route, 400 und 403 der echten Route), `npm run check` grün. Lighthouse mobil, Tool-Seite: 97/100/100.

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
| Vercel | **Umgezogen am 04.10.2026** in den Account `alpernagmbh` (persönlicher Scope `website-dbed`, Plan Hobby, Projekt `marketing-tool`, ID `prj_BcSr7GQ57uQIpQ9bbuSNJr4dXeFI`). Mit dem Repo verknüpft, Auto-Deploy aus `main`, Region `fra1`, Node 24.x, Vercel Authentication an (alle ausser eigene Domains), also nicht öffentlich und nicht indexierbar. Adresse: `https://marketing-tool-gold.vercel.app`. Geprüft am 04.10.2026 auf dem neuen Deployment: Tool-Seite, `/api/access` (`free_run`, also ist `GATE_SECRET` wirksam), `/api/check` gegen `alperna.ch` (53 Punkte, 0,8 s), Sperre interner Adressen (DNS auf 127.0.0.1 und IP-Adresse direkt). Das alte Projekt im Team `alpernatoolv1` ist nicht mehr erreichbar und muss von Hand abgeschaltet werden (siehe docs/VERCEL-UMZUG.md). Hobby ist laut Vercel nicht für gewerbliche Nutzung gedacht [Wahrscheinlich]: vor dem Start Plan prüfen. |
| Vercel-Variablen | Gesetzt im neuen Projekt: `GATE_SECRET` (neu erzeugt, sensitiv, Production und Preview), `N8N_WEBHOOK_URL` (sensitiv), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_ERSTGESPRAECH_URL` (Calendly «Kennenlern-Gespräch»). Der Wert von `GATE_SECRET` und der Webhook-Pfad standen beim Umzug in einem Chat-Verlauf; den Webhook-Pfad im n8n-Workflow ändern, falls dieser Verlauf geteilt wird. |
| n8n | Workflow **«Tools-Lead»** (`BC48H0mAidcbY4zH`) ist aktiv: Webhook → Notion-Eintrag → Mail an `kontakt@alperna.ch` → Antwort 200. Echter Testlauf bestanden (Eintrag mit allen Feldern, Mail). Der Testeintrag steht in Notion mit Status «Verloren» und kann gelöscht werden. Der Webhook-Pfad ist ein langer Zufallspfad (Secret). |
| CRM | Neue Notion-Datenbank **«Tools-Leads (tools.alperna.ch)»** unter «CRM’s», bewusst getrennt von den Outreach-Datenbanken (deren Workflows lesen «Neu»-Leads und sollen Inbound-Leads nicht mitverarbeiten). |

## Offen

| Was | Stand |
|---|---|
| **Upstash Redis** | Im neuen Account gibt es noch keine Datenbank. (Der Redis-Inc.-Speicher `REDIS_URL` gehört zum alten Account und wird dort gelöscht.) Zu tun im Account `alpernagmbh`: Projekt `marketing-tool` → Storage → Create Database → **Upstash** → Redis, Free, Frankfurt, mit dem Projekt verbinden. Der Code erwartet `KV_REST_API_URL` und `KV_REST_API_TOKEN` (oder `UPSTASH_REDIS_REST_*`). Ohne Redis greifen weder das Limit von `/api/check` noch der Zähler über mehrere Geräte. |
| Zugang v2, Etappe 2 | Entschieden (PLAN.md). Offen sind die Zugangsdaten: Google OAuth (Login) und E-Mail-Versand über n8n. |
| KI-Anbieter (gratis) | Entschieden am 04.10.2026: Vercel AI Gateway (5 Dollar Gratisguthaben pro Monat, harte Obergrenze, kein neues Konto, kein Schlüssel). Cloudflare und Groq entfallen. Gemini Gratis ist für Besucher in der Schweiz ausgeschlossen. Einzelheiten und Rechnung in PLAN.md. Offen: welche Modelle im Gratis-Kontingent liegen (Test in Etappe 2). |
| Google Cloud | Nur für «Mit Google anmelden» (OAuth, kostenlos) in Etappe 2. Der Places-Schlüssel für das Google-Profil ist optional (Etappe 3, braucht Zahlungsmittel). |
| `content/pitch/bausteine.md` | Gefüllt aus COMPANY-MASTER und alperna.ch: Website (mit Einstiegsangebot), Google-Profil (Text), Social Media, Online-Shop und Buchungstool (Text). Offen: Beweise für Google-Profil, Online-Shop, Buchungstool; Google Ads bleibt ohne Text (COMPANY-MASTER 3.9). |
| Zwischenspeicher je Domain | Fehlt. Plan v2 sieht 24 Stunden in Redis vor; geht erst, wenn Upstash verbunden ist. Bis dahin ruft jeder Check die Website neu ab. |
| Google-Profil im Check | Ohne `GOOGLE_PLACES_API_KEY` bleibt der Bereich «nicht bestätigt» (Annahme 0,25 oder 0,5). Der Schlüssel braucht ein Zahlungsmittel in der Google Cloud (PLAN.md). |
| Rechtsabsatz in den Seitentexten | `content/site/marketing-schweiz.md` (UWG, revDSG, PBV) und `content/site/schweiz.md` stammen von mir. Nach Regel 8 muss ein Mensch gegenlesen, bevor die Seite öffentlich wird. |
| Texte mit «ohne Konto» | `content/site/*.md`, TrustLine und CLAUDE.md sagen «kein Konto». Ändern, falls Zugang v2 kommt. |
| Logo | Nachzeichnung der Original-PNG (liegt in `assets/brand/`). Ein Vektor-Original ersetzt sie. |
| n8n-Workflow «Tools-Lead-Queue» | Fehlt noch (stündlich `lead_queue` aus Redis leeren). Braucht Upstash. |
| Altes Repo | `AlpernaGmbH/alperna-website-v2` enthält den alten Stand. Kann archiviert werden. |
| DNS `tools.alperna.ch` | Ganz am Schluss (Entscheid vom 04.10.2026): CNAME `tools` → `cname.vercel-dns.com`, Domain im Vercel-Projekt eintragen. |
| Umami | Etappe 7. |

Erledigt am 04.10.2026: `NEXT_PUBLIC_WHATSAPP_NUMBER` in Vercel gesetzt (Production, Preview, Development); der Knopf «Kurz schreiben» erscheint mit dem nächsten Build. Branding v3.

### Einrichtung Google-Login (macht Alperna, rund 10 Minuten, Stand 04.10.2026)

Google bietet keinen Weg, einen OAuth-Client per Skript anzulegen; er entsteht nur in der Konsole (Quelle: support.google.com/cloud/answer/15549257). Darum von Hand:

1. console.cloud.google.com, neues Projekt «alperna-tools». Kein Zahlungsmittel nötig.
2. Menü «Google Auth Platform», «Get started»: App-Name «Alperna Tools», Support-E-Mail `kontakt@alperna.ch`, Zielgruppe «Extern», Kontakt-E-Mail `kontakt@alperna.ch`.
3. Branding: Startseite `https://tools.alperna.ch`, Datenschutz `https://tools.alperna.ch/datenschutz`, autorisierte Domain `alperna.ch`. Kein Logo (ein Logo löst eine Prüfung durch Google aus).
4. Datenzugriff: nur `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`.
5. Zielgruppe: «App veröffentlichen» (Status «In Produktion»). Im Teststatus melden sich nur eingetragene Testnutzer an.
6. Clients, «Create client», Typ «Web application», Name «Alperna Tools Web».
   - Autorisierte JavaScript-Quellen: `https://tools.alperna.ch`, `https://marketing-tool-gold.vercel.app`, `http://localhost:3000`
   - Autorisierte Weiterleitungs-URIs: `https://tools.alperna.ch/api/auth/callback/google`, `https://marketing-tool-gold.vercel.app/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
7. Client-ID und Client-Secret kopieren. Das Secret zeigt Google nur einmal. Beides direkt in Vercel eintragen (Projekt `marketing-tool`, Settings, Environment Variables): `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` (Secret als «Sensitive»), für Production und Preview. Das Secret nicht in Chats oder Mails weitergeben.

Hinweise: Änderungen an den URIs brauchen fünf Minuten bis einige Stunden. Clients, die sechs Monate unbenutzt bleiben, löscht Google selbst. Der Pfad `/api/auth/callback/google` ist bei Better Auth und Auth.js gleich [Wahrscheinlich]; wählt Etappe 2 etwas anderes, ändert sich nur die URI.

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
32. **KI nur gratis (04.10.2026):** Fakten und Massnahmen ohne KI, KI nur für Angemeldete, Zwischenspeicher, Tageslimit. Anbieter: Vercel AI Gateway statt Cloudflare und Groq (Entscheid Alperna, 04.10.2026). Rechnung und Quellen in PLAN.md. Gemini ist kein Fundament mehr.
33. **Alperna-Dokumente als Wahrheitsquelle (04.10.2026):** COMPANY-MASTER, BRAND-VOICE-CORE und ANTI-PATTERNS liegen nur bei Alperna (sie enthalten interne Finanzzahlen). Im Repo steht der Auszug `docs/MARKE.md`; die Sperrliste läuft als Code in `lib/brand-rules.ts` (41 Tests) und prüft Seitentexte und Pitch-Bausteine bei jedem `content-check`. Folgen: Die Texte «Warum kostenlos» und die Antwort «Wer steckt dahinter» sind neu geschrieben («Agentur» fällt weg). **Mein Entwurf von gestern liess Google Ads aktiv anbieten; das widersprach COMPANY-MASTER 3.9** und ist entfernt. Das geplante Werkzeug «customer-journey» heisst «kundenweg», weil «Customer Journey» auf der Sperrliste steht.
34. **Logo (04.10.2026):** neu nachgezeichnet aus der Original-PNG von Alperna statt aus der Framer-Version (sauberere Kanten, Gold exakt `#FFD700`).
35. **Marketing-Check, Auslegungen (04.10.2026):** (a) Gewichte und Punkte sind unverändert aus dem Agentur-Tool, damit beide Systeme dieselbe Seite gleich bewerten. (b) Was nur eine Annahme ist (Häufigkeit auf Social Media nicht angegeben) oder kein Mangel (keine Google-Ads- und Meta-Pixel-Spur), trägt `info: true`: es zählt in der Punktzahl, erzeugt aber keine Massnahme. (c) Ein nicht bestätigtes Google-Profil heisst «Prüfauftrag» («Prüfen, ob dein Betrieb bei Google Maps eingetragen ist»), nicht «Eintrag fehlt».
36. **Offene Frage zur Gerechtigkeit der Punktzahl:** Das Agentur-Tool zieht Betrieben ohne Werbung rund 8 von 100 Punkten ab (Werbung und Tracking haben Gewicht 12 von 89,5, davon entfallen 0,6 auf Ads und Meta) und rechnet das Google-Profil ohne Schlüssel mit 20 von 89,5 Gewicht als Annahme. Beides ist im Ergebnis gekennzeichnet, verzerrt aber die Zahl. Entscheid bei Alperna: gleich lassen (Vergleichbarkeit mit dem Agentur-Tool) oder im Marketing-Check getrennt gewichten.
37. **Der Check zählt den freien Durchlauf erst am Ende** (`/api/access/complete`), wie bei allen Tools. Wer `/api/check` direkt aufruft und `complete` nie meldet, kann bis zum Limit (8 pro Stunde je IP-Hash) mehrfach prüfen. Das ist für ein Gratis-Werkzeug vertretbar, aber kein hartes Gate. Mit Upstash lässt sich ein eigener Zähler setzen.
38. **Neues Profilfeld `website`** (in `profileFields`, `PROFILE_FIELDS`, `/profil`). `kanaele` bekommt aus dem Check die Form `{ name, url }`; ein späteres Kanalstrategie-Werkzeug muss damit umgehen oder die Form erweitern.
39. **Kennung des Abrufs:** User-Agent `AlpernaCheck/1.0 (+https://tools.alperna.ch)`. Die Adresse antwortet erst nach dem DNS-Wechsel. Wer in Logs fremder Server nachschaut, findet bis dahin einen toten Link.

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
