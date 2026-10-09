# CLAUDE.md – marketing-tools (tools.alperna.ch)

## Projekt
Öffentliche Web-App mit Marketing-Werkzeugen für Schweizer KMU (Zielgruppe seit 09.10.2026; «Verein» ist eine Rechtsform, keine Zielgruppe),
betrieben von der Alperna GmbH (Speicher AR).
Zweck: echten Nutzen stiften, Besucher über Suchmaschinen gewinnen und daraus
Gespräche für Alperna machen.
Jede Tool-Seite ist zugleich eine SEO-Landingpage mit kurzem, gegliedertem Text (350-700 Wörter, siehe «Lese-Vorlage»).
Sprache: Deutsch (Schweiz). Zielgruppe: KMU-Entscheider 30–60,
Vereinsvorstände, Selbständige.

## Zugangsmodell (Zugang v3, Stand 04.10.2026: kein Konto, E-Mail-Adresse vor dem Ergebnis)
- Alle Texte, Beispiele, FAQ: öffentlich, immer indexierbar.
- Kein Konto, keine Anmeldung, kein freier Durchlauf mehr. Jedes Werkzeug
läuft ohne Hürde bis zum Punkt, an dem das Ergebnis erscheinen würde. Dort
(und vor jedem Download) fragt das E-Mail-Fenster (components/tool/LeadGate)
nach der Adresse. Felder: E-Mail (Pflicht), Einwilligung («Alperna darf mich zu meinem
Ergebnis kontaktieren», freiwillig; ohne Häkchen gibt es das Ergebnis trotzdem), Honeypot. Kein Name, keine Firma, kein Telefon.
Titel «Dein Ergebnis ist bereit.», Text «Gib deine E-Mail-Adresse an, dann
zeigen wir es dir. Dein Ergebnis und deine Eingaben gehen mit der Adresse an
Alperna, damit wir dir bei Fragen weiterhelfen können.» Knöpfe «Später» und
«Ergebnis anzeigen». «Später» lässt Formular oder Zusammenfassung stehen.
- Nach dem Absenden: POST /api/lead {email, consent, tool} setzt das
signierte Cookie mt_gate {email, iat, consent} (HMAC-SHA256 mit GATE_SECRET, HttpOnly,
SameSite=Lax, 365 Tage). Der Browser merkt die Adresse zusätzlich unter
mt:_lead (nur für die Anzeige «Ergebnisse gehen an … · ändern»). Danach gibt
es ein Jahr lang kein Fenster mehr, auf keinem Werkzeug.
- Jedes Ergebnis geht ins CRM, immer: ToolShell.sendResult({eingabe,
ausgabe}) → POST /api/result {tool, eingabe, ausgabe, firma?}. Die Adresse
nimmt der Server aus dem Cookie, nie aus dem Body. Der Lead an n8n hat genau
die Felder name (leer), firma (aus dem Firmenprofil), email, telefon (leer),
tool, kategorie, quelle, zeit, eingabe, ausgabe, einwilligung («ja» oder «nein», aus dem
Cookie; Alperna meldet sich nur bei «ja» von sich aus); Eingabe und Ausgabe auf
1'900 Zeichen gekürzt (lib/lead.ts, clipText), dazu bekannt («ja» oder «nein»).
Ein zweites Ergebnis derselben Person geht erneut ins CRM (Notion), löst aber
keine zweite Mail «neuer Lead» aus: Die Route markiert die Adresse atomar in
Redis (known:<acchash>, SET NX, 365 Tage; AccessStore.markKnown); n8n schickt
die Mail nur bei bekannt = «nein». Fällt Redis aus, gilt die Adresse als neu
(lieber eine Mail zu viel).
- GET /api/gate nennt dem Browser die Adresse, die der Server aus dem Cookie
kennt (der lokale Merker mt:_lead kann fehlen, das Cookie nicht); die ToolShell
stellt den Merker damit wieder her, statt das Fenster erneut zu zeigen. DELETE
/api/gate entfernt das Cookie («Alles löschen» im Profil).
- Ohne Cookie antworten /api/result, /api/check, /api/text und /api/ai mit
403 {error: "gate"}. Der Browser ruft dann ToolShell.renewEmail() (vergisst
mt:_lead, zeigt das Fenster) und wiederholt die Anfrage einmal.
- ToolShell-Vertrag für jedes Werkzeug: ensureEmail() vor dem ersten
Ergebnis und vor jeder Server-Anfrage; sendResult() nach dem sichtbaren
Ergebnis; guardDownload(action) für Download-Knöpfe; renewEmail() bei 403.
QuestionnaireEngine macht alles davon selbst (Prop resultText liefert die
Ausgabe als Text, sonst JSON).
- Schutz: lib/access.ts bildet einen HMAC-SHA256 der Client-IP
(x-forwarded-for erstes Element) mit GATE_SECRET, gekürzt auf 16 Byte, nur
für die Ratenbegrenzung (/api/lead 10 pro Stunde, /api/result 30 pro
Stunde, /api/text 30 pro Stunde, /api/check 8 pro Stunde). accountHash(email)
ist der HMAC der Adresse für das Tageslimit der KI-Einordnung. Redis-Keys:
popular:<slug> (Zähler je gesendetem Ergebnis), ai:<acchash>:<YYYY-MM-DD>
(Einordnungen pro Adresse) und ai:global:<YYYY-MM-DD> (TTL 2 Tage),
aicost:<acchash>:<YYYY-MM-DD> und aicost:global:<YYYY-MM-DD> (KI-Ausgaben in
Millionstel Dollar aus usage.cost, TTL 2 Tage; ab 30 Rappen je Adresse und
Tag oder CHF 5.- global antworten nur noch kostenlose Modelle, lib/ai-quota.ts),
known:<acchash> (Mail «neuer Lead» schon ausgelöst, TTL 365 Tage),
aicache:<hash der Signatur> (fertige Einordnung, TTL 24 Stunden), rl:<name>
(Ratenbegrenzung), lead_queue (Liste). Keine Zähler pro Besucher, keine
Freischaltung, keine Daten beim Server.
- Ausfälle: Ist n8n nicht erreichbar, legt /api/result den Lead in
lead_queue ab (Vercel Cron ruft täglich GET /api/cron/leads auf, geschützt
mit CRON_SECRET; die Route schickt wartende Leads an n8n und entfernt sie
danach). Ist Redis nicht erreichbar, antwortet /api/result trotzdem 200.
Fehlt GATE_SECRET, antworten die Routen 503. Ein Besucher sieht sein
Ergebnis in jedem Fall, sobald er die Adresse angegeben hat; der Versand ins
CRM blockiert nie die Anzeige.

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind 4, shadcn/ui (nur
benötigte Komponenten), React Hook Form + zod,
@upstash/redis, @upstash/ratelimit, Vitest + Testing Library, Playwright für
Smoke-Tests, pdf-lib, docx, qrcode, jszip, fuse.js, gray-matter, remark.
Hosting Vercel (Functions-Region fra1). Zähler Upstash Redis. Leads n8n.
Analytics Umami. Paketmanager npm. Node 20+.

## Ordnerstruktur
- app/(site)/page.tsx – Startseite
- app/(site)/[kategorie]/page.tsx – Kategorieseiten strategie, analyse,
inhalte, praktisches (alte Adressen /content, /ki, /schweiz, /vereine und die
alten Slugs content-* leitet lib/redirects.ts über next.config.ts mit 301 um)
- app/(site)/tools/[slug]/page.tsx – Tool-Seite, statisch über
generateStaticParams, Tool als Client-Komponente
- app/(site)/profil/page.tsx – Firmenprofil ansehen, bearbeiten, aus der Website
ausfüllen, als JSON sichern (Laden eingeklappt), alles löschen
- app/api/lead/route.ts – E-Mail-Adresse entgegennehmen, Cookie mt_gate setzen
(schickt noch nichts ins CRM); app/api/gate/route.ts – Adresse aus dem Cookie
nennen (GET), Cookie entfernen (DELETE); app/api/result/route.ts – Ergebnis mit Eingabe und
Ausgabe an n8n (Adresse aus dem Cookie), zählt popular:<slug>
- app/api/check/route.ts – Marketing-Check: ruft die Website des Besuchers ab
(SSRF-Schutz in lib/check/net.ts), streamt Schritte und Ergebnis als NDJSON;
verlangt das Cookie (403 gate)
- app/api/ai/route.ts – KI-Einordnung zu einem Check-Ergebnis: verlangt das Cookie,
nur für von /api/check signierte Ergebnisse (lib/check/sign.ts),
Tageslimit pro Adresse und global (lib/ai-quota.ts), 24 Stunden Zwischenspeicher,
Antwort der KI wird geprüft (lib/check/ai.ts) und sonst verworfen
- app/api/text/route.ts – Text-Umschreiber und Textcheck mit KI: schreibt den Text des Besuchers
im gewählten Stil neu oder prüft ihn (Stil «pruefen»); verlangt das Cookie (403 gate);
Schutz: 30 Anfragen pro Stunde und IP-Hash, globale Tagesgrenze
(AI_DAILY_CAP); Antwort wird geprüft (tools/text-umschreiber/logic.ts), nichts wird
gespeichert oder mit Inhalt geloggt
- app/api/generate/route.ts – eine Route für alle Generatoren (Klasse B): {tool, input} →
Entwurf als JSON nach tools/<slug>/generator.ts (Registry tools/generators.ts); verlangt das
Cookie, 20 pro Stunde und IP-Hash, globale Tagesgrenze; jede Antwort der KI wird geprüft
(lib/generator.ts: Schema, Sperrliste, Links nur aus den Angaben) und sonst verworfen
- app/api/read/route.ts – liest die Startseite des Besuchers (lib/read.ts: Titel,
Beschreibung, Überschriften, bis 8'000 Zeichen Text) über den geschützten Abruf des
Checks; verlangt das Cookie, 10 pro Stunde und IP-Hash
- app/api/cron/leads/route.ts – täglicher Cron: schickt Leads aus lead_queue nach
- app/api/lookup/route.ts – Etappe 3
- app/sitemap.ts, app/robots.ts, app/opengraph-image.tsx
- tools/<slug>/tool.config.ts – Metadaten (Schema unten)
- tools/<slug>/Tool.tsx – Client-Komponente, nutzt ToolShell
- tools/<slug>/logic.ts – reine Funktionen, kein React, kein DOM
- tools/<slug>/logic.test.ts – Vitest
- tools/<slug>/generator.ts – nur Klasse B: defineGenerator() (Schemas, Aufgabe, Prompt)
- tools/index.ts – explizite Liste aller Tools (kein Glob); tools/generators.ts – explizite
Liste aller Generatoren; tools/components.tsx – Slug → Client-Komponente
- components/tool/ – ToolShell, ToolPageLayout, QuestionnaireEngine,
DocumentExport, DocView (DocumentModel am Bildschirm), useGenerator (Ablauf eines
Generator-Werkzeugs), ProfileBanner, LeadGate, ScoreBadge, ResultCard, CopyButton,
LegalDisclaimer, AlpernaPitch, RelatedTools
- components/site/ – Header, Footer, Search, PathCard, ToolCard, TrustLine,
Breadcrumbs
- lib/define-tool.ts – defineTool(), zod-Schema, Typen (getrennt von der Registry, sonst Zirkelimport)
- lib/registry.ts – getTools(), getToolsByCategory(), getTool(), getRelated(), getPath()
- lib/access.ts – ipHash(), accountHash(), signGate(), verifyGate(),
readGateCookie(), writeGateCookie(), AccessStore (recordResult, Lead-Warteschlange)
- lib/access-client.ts – submitEmail(), sendResult(), LEAD_KEY (Browser)
- lib/lead-schema.ts – leadSchema (E-Mail, Einwilligung, Tool), resultSchema
- lib/lead.ts – LeadPayload, buildPayload(), clipText(), forwardToN8n(), deliverLead(), drainLeads()
- lib/redis.ts – Upstash-Client, Key-Helfer, TTLs
- lib/profile.ts – Profil-Typen, Validierung, Export/Import JSON (rein, ohne React)
- lib/use-profile.ts – useProfile(): localStorage-Key mt:profile
- lib/check/ – Engine des Marketing-Checks (Port aus dem Agentur-Tool): net.ts,
analyze.ts, seo.ts, social.ts, gbp.ts, detect.ts, massnahmen.ts, client.ts,
sign.ts (Signatur des Ergebnisses), ai.ts (Fakten, Prompt, Prüfung der KI-Antwort),
ai-client.ts (Browser)
- lib/ai.ts, lib/ai-quota.ts – KI: über OpenRouter (kostenlose Modelle, mit OPENROUTER_API_KEY), das Vercel AI
Gateway (gekauftes Guthaben, AI_MODELS) oder mit AI_PROVIDER=mistral direkt bei Mistral (bezahlter Plan); Tageslimits,
Zwischenspeicher und die Tagesmeldung per n8n (ALERT_WEBHOOK_URL)
- lib/generator.ts, lib/generate-client.ts – Generatoren: Regeln der Alperna-Stimme, Prüfung
jeder KI-Antwort, Browser-Aufruf; lib/read.ts, lib/read-client.ts – Website lesen
- docs/TOOL-BAUEN.md – Bauanleitung je Werkzeug (Dateien, Zugang v3, Generator, Daten,
Seitentext, Prüfung); vor jedem neuen Werkzeug lesen
- lib/storage.ts, lib/use-local.ts – localStorage mit Rückfall auf Arbeitsspeicher
- lib/ch.ts – chf(), dateCH(), typoCH(), uidValid()
- data/*.json – Schweizer Datensätze, jede Datei mit meta {source, url, asOf}
- content/tools/<slug>.md – Seitentext mit festen Abschnitten (Vorlage unten)
- content/site/*.md – Startseite, Kategorien, FAQ
- content/pitch/bausteine.md – Alperna-Bausteine und Einstiegsangebot (von
Alperna geliefert)
- content/legal/*.md – Rechtstexte, von Menschen geprüft. Entwürfe von Claude
Code tragen `status: entwurf` und dürfen nirgends erscheinen, bevor ein Mensch
sie freigibt (`lib/legal-rules.ts`, `content/legal/README.md`)
- specs/<slug>.md – Spec pro Tool, vor dem Bauen lesen
- scripts/new-tool.ts, scripts/content-check.ts, scripts/seo-check.ts
- PLAN.md, STATUS.md, IDEAS.md – Arbeitsdateien

## Firmenprofil (lib/profile.ts, nur im Browser)
Felder: organisationstyp kmu|verein (folgt der Rechtsform: Verein und Stiftung
= verein, sonst kmu), firma, branche (Freitext; eine gemeinsame Branchenliste in
data/branchen.json und lib/branchen.ts ordnet jede Bezeichnung dem Check, den
Ideen und dem Kalender zu), rechtsform (Auswahl in einer Reihe, Standard «KMU
oder Selbständige»), ort, website, beschreibung, kanton, groesse, zielgruppen[], primaersegment, personas[], positionierung, marke
{werte, persoenlichkeit, tonalitaet, woerter, bewertungsregeln}, kanaele[],
budgetJahr, contentSaeulen[]. Tool-Zwischenstände unter mt:<slug>. Merkliste
unter mt:merkliste. Merker der angegebenen E-Mail-Adresse unter mt:_lead.
Das Profil lebt zwölf Monate ab der letzten Nutzung (mt:_profile-at, höchstens
einmal am Tag erneuert); ein älteres Profil wird gelöscht und einmal gemeldet
(lib/use-profile.ts). «Aus Website ausfüllen» (app/(site)/profil/ProfilScan.tsx):
/api/read plus der Generator profil-scan (lib/profile-scan.ts) schlagen Firma,
Branche, Ort, Kanton und Kurzbeschreibung vor; der Besucher bestätigt in einer
Vorschau, vorhandene Einträge werden nie still überschrieben.
Der Server speichert davon nichts; nur die Firma geht mit jedem Ergebnis ins CRM
(Feld firma in /api/result).
Kopfzeile: Link «Mein Profil». Kein Anmelden, kein Konto.
Jedes Tool mit usesProfile zeigt ProfileBanner («Dein Firmenprofil: Malerei
Keller, Gossau – bearbeiten»). Hinweis auf /profil: «Wird nur in deinem
Browser gespeichert. Exportiere es, wenn du es behalten willst.»

## Harte Regeln
1. Eingaben in Tools verlassen den Browser nur auf zwei Wegen: (a) mit dem
Ergebnis ins CRM über /api/result (E-Mail-Adresse, Werkzeug, Kategorie,
Firma aus dem Profil, Eingabe, Ausgabe – sonst nichts; Zugang v3), (b) bei
Tools mit needsServer: true über /api/check, /api/ai, /api/text,
/api/generate, /api/read und /api/lookup (an die KI gehen nur die Angaben,
die das Werkzeug nennt: Betrieb, Branche, Ort, Eingaben, Website-Text; nie
die E-Mail-Adresse, nie das ganze Profil). Das übrige Firmenprofil, Merkliste
und Zwischenstände bleiben im Browser. Server-Routen loggen Statuscodes, nie
Inhalte, nie Klartext-IPs, nie E-Mail-Adressen.
2. Du-Form im UI. Schweizer Rechtschreibung: ss statt ß, «» als
Anführungszeichen, CHF 1'000.-, Datum 03.10.2026, Prozent mit Leerzeichen
(8,1 %).
3. Jede logic.ts hat Tests. `npm run check` (typecheck, test, content-check,
build) ist vor jedem Commit grün.
4. Keine externen Skripte ausser Umami. Einziges Cookie: mt_gate (trägt die
E-Mail-Adresse signiert; notwendig, in der Datenschutzerklärung erklärt, kein
Banner). Fonts über next/font/local (Geist, Geist Mono, Instrument Serif).
5. Lighthouse mobil: Performance, SEO, Accessibility je ≥ 95 pro Tool-Seite.
6. Ein Tool = ein Ordner. Neue Tools nur über `npm run new-tool <slug>`.
7. Keine Zahl ohne Quelle. Benchmarks und Statistiken nur aus data/*.json mit
meta.source; fehlt die Quelle, fällt die Zahl weg. Gilt auch für Seitentexte.
8. Rechts-Tools nehmen Formulierungen nur aus content/legal/ und zeigen
LegalDisclaimer. Keine eigenen Rechtsaussagen, auch nicht im Seitentext.
9. Fragebogen-Tools: höchstens 10 Fragen, Zwischenstand lokal gespeichert,
Ergebnis sofort nach dem E-Mail-Fenster sichtbar. Das Fenster steht nur vor
dem ersten Ergebnis und vor Downloads, nie mitten in den Fragen.
10. Felder, die im Profil existieren, werden vorbefüllt und nie erneut
abgefragt.
11. Jede Seite endet mit AlpernaPitch (Vorlage unten), tool-spezifisch
befüllt. Ruhig, ohne Druck.
12. Jede Tool-Seite hat alle Abschnitte der Seitentext-Vorlage; fehlende
Abschnitte machen den Build rot (scripts/content-check.ts).

## Design System (Alperna v3) und Branding (Stand 04.10.2026)
Schrift, Hintergrund und Formensprache folgen der neuen Alperna-Website
(alperna-tool.vercel.app/website, Quelle `styles.css`); die Markenfarben
kommen von alperna.ch und sind nur Akzente.
Tokens in app/globals.css: --page #F3F1EC (Seitenhintergrund, Papier), --paper
#FFFDF8 (Karten, Felder), --surface #EAE7E0, --ink #0F0F0E (Text), --muted
#65645F, --line (Ink mit 14 % Deckkraft), --navy #111A28 und --navy-2 #26324A
(alperna.ch), --yellow #FFD700 (Gold, alperna.ch).
Gold (Lockerung vom 09.10.2026, Entscheid Alperna: «sehr visuell»): der Kreis im
primären Knopf, die eine Markierung pro Seite (`mark-yellow`: Serif kursiv mit
goldenem Balken), Punkte vor Beschriftungen, Fokus auf Dunkel, der Hauptknopf auf
dunklen Flächen (ResultPitch) und die eine Hervorhebung in einem Diagramm (zum
Beispiel die schwächste Dimension, mit dunklem Rand). Der Footer ist Ink
(seit 09.10.2026, vorher Navy) mit der grossen Wortmarke «alperna» in vollem
Papier-Weiss. Navy nur für die Logo-Kachel und Zustände. Nie Gold als Textfarbe auf hellem Grund (Kontrast).
Typografie: Geist für Text und Titel (Titel Gewicht 500, Laufweite -0.035 bis
-0.04em), Instrument Serif kursiv für Betonungen (`em`), Geist Mono für
Zahlen und kleine Beschriftungen (Klasse `eyebrow`: Grossbuchstaben, goldener
Punkt). Zeilenbreite max. 68ch, Zeilenhöhe 1.6, Abschnitte 96 px Desktop, 64 px
Mobile.
Formen: Knöpfe und Suchfeld als Pillen (primär Ink mit Papier-Text, Hover
Gold, Pfeil in Gold-Kreis), Karten mit 20 px Radius und Haarlinie, Felder
mit 14 px Radius. Keine Verläufe, keine Schatten über 4 px.
Logo: Bildmarke von alperna.ch, nachgezeichnet (`public/brand/alperna-mark.svg`:
Gold auf Navy-Kachel; `alperna-mark-gold.svg` für dunkle Flächen), Wortmarke
klein geschrieben «alperna».
Bildsprache (gelockert am 09.10.2026): Ein Ergebnis zeigt zuerst ein Bild, dann
Text: Kennzahl-Kachel, Balken, Ring, Raster, Karten, Folien (`DocBlock`-Bausteine
`stat`, `bars`, `steps`, `cards`, `split`, `grid`, `slides` in lib/export/model.ts,
Darstellung in components/tool/visual.tsx und DocView). Diagramme sind reines SVG und
CSS, keine Diagramm-Bibliothek, mit Textalternative (role, aria-valuetext) und
gleichem Inhalt in PDF, Word und Markdown (`flattenBlocks`). Ein Alperna-Hinweis im
Ergebnis (ResultPitch) ist eine dunkle Karte, aus dem Ergebnis hergeleitet, ohne
Preis. Keine Stockfotos. Fotos nur von Alperna (assets/photos), nur auf Startseite,
Kategorie-Köpfen und im Pitch, nie als Füllbild in einem Ergebnis; Ordner und Rechte
sind noch zu klären, bis dahin keine Fotos. Höhenlinien (SVG) als Hintergrundmotiv
mit 4 % Deckkraft auf Startseite und Kategorieseiten, bis 7 % auf Kennzahl-Kacheln.
Ton: ruhig, konkret, belegbar. Keine Ausrufezeichen, keine Emojis, keine
Superlative, kein «jetzt», «nur noch», «garantiert», «Nr. 1». Kurze Sätze.
Alperna-Stimme und Sperrliste: docs/MARKE.md und lib/brand-rules.ts (aus den
Alperna-Dokumenten BRAND-VOICE-CORE und ANTI-PATTERNS). Alperna ist «Partner für
den digitalen Auftritt», nie «Agentur»; kein Gedankenstrich «—»; Google Ads wird
nicht aktiv angeboten. Fakten über Alperna nur aus docs/MARKE.md.
Dark Mode: nein.

## Kategorien, Menü, Aufruf und Wortwahl (Stand 09.10.2026)
- Vier Kategorien: Strategie, Analyse, Inhalte, Praktisches (lib/define-tool.ts,
CATEGORY_LABELS, CATEGORY_TAGLINES). «KI», «Schweiz», «Content» und «Vereine» sind
weder Kategorie noch Menüpunkt. «Schweiz» bleibt im Seitentitel (SEO-Regel), «KI» dort,
wo ein Werkzeug eine KI einsetzt, «Content» kommt nirgends mehr vor (Inhalte, Beiträge,
Themensäulen, Inhaltsstrategie). Der Pfad eines Werkzeugs (pathStep.path) ist seine
Kategorie. Neue Kategorie oder Umbenennung: lib/redirects.ts ergänzen.
- Header: Mega-Menü (components/site/MegaMenu.tsx, Daten aus menu-data.ts): je Kategorie
eine Fläche mit allen Werkzeugen und ihren Piktogrammen; öffnet per Überfahren, Klick,
Enter oder Leertaste, Escape schliesst und gibt den Fokus zurück; die Flächen stehen
immer im Dokument. Mobil ein Akkordeon (MobileMenu). Rechts Suche und «Mein Profil»
(mobil «Profil»); ein Knopf mit dem Satz im Kopf hat neben der Suche keinen Platz.
- Footer: dunkles Band mit demselben Satz, Knöpfen «Kostenloses Erstgespräch» und
«Kurz schreiben» (GlobalCta; ohne beide Links entfällt das Band), dann Kategorien,
Rechtliches, Mehr und die grosse Wortmarke.
- `npm run wording-check` (lib/wording-rules.ts, scripts/wording-check.ts, Teil von
`npm run check`): Fehler bei den alten Kategoriewörtern in Menü, Kategorienamen und
Kategorieköpfen, bei «Content» in Namen und Texten und bei Slugs, die so beginnen.
«Vereine» im Text ist ein Hinweis mit Zahl, bis das Werkzeug seinen KMU-Wortlaut
bekommt (P3).

## Seitenaufbau Tool-Seite (Komponente ToolPageLayout, in dieser Reihenfolge)
1. Breadcrumbs · H1 «<Tool> für Schweizer KMU» (Vereins-Tools: «… für
Schweizer Vereine») · Tagline · MetaLine: Dauer, Kategorie, «Ergebnis und
Dateien gegen deine E-Mail-Adresse»
2. Tool (Client-Komponente). Desktop: im sichtbaren Bereich. Mobile: nach H1
und Tagline.
3. «In Kürze» (Kasten mit drei Punkten aus `kurz`) und Ablauf (drei Schritte
aus `ablauf`, als Grafik)
4. ## Warum das wichtig ist – 50-140 Wörter, ein Satz mit der Aussage,
3-6 Aufzählungspunkte, Schweizer Bezug, Zahlen mit Quelle, am Ende eine
offene Schleife
5. ## So nutzt du das Ergebnis – 3-5 nummerierte Schritte (als Karten), am
Ende eine offene Schleife
6. ## Häufige Fehler – 3-5 Punkte (als Karten), je ein Satz Problem, ein Satz
Lösung
7. ## Beispiel – ein fertiges Ergebnis einer fiktiven Ostschweizer Firma
(Standard «Malerei Keller, Gossau»; Vereins-Tools: «FC Trogen»), als Kasten
8. ## Häufige Fragen – 5-7 als Akkordeon, Antworten höchstens 80 Wörter,
FAQPage-JSON-LD
9. AlpernaPitch
10. RelatedTools (3 aus tool.config.related) + «Nächster Schritt» im Pfad
JSON-LD pro Seite: SoftwareApplication (offers price 0, CHF), FAQPage,
BreadcrumbList. Metadata: title ≤ 60 Zeichen mit «Schweiz», description ≤
155.

## Seitentext-Vorlage (content/tools/<slug>.md)
    ---
    title: "ICP-Builder Schweiz – Idealkundenprofil in 8 Fragen"
    description: "…"
    h1: "ICP-Builder für Schweizer KMU"
    tagline: "…"
    beispielFirma: "Malerei Keller, Gossau"
    kurz:                 (genau drei Punkte: was du bekommst, was du dafür tust, was danach klar ist)
      - "…"
    ablauf:               (genau drei kurze Schritte)
      - "…"
    ---
    ## Warum das wichtig ist
    ## So nutzt du das Ergebnis
    ## Häufige Fehler
    ## Beispiel
    ## Häufige Fragen
    ### Frage …
    ## Alperna
    problem: …
    baustein: Google Business Profil
    beweis: …            (oder «@baustein»: nimmt den Beweis aus content/pitch/bausteine.md)
Schreibregeln: Nutzen vor Erklärung; der erste Satz jedes Abschnitts trägt
die Aussage; Schweizer Beispiele (Gemeinden, Kantone, Anlässe, Behörden,
Gesetze beim Namen); keine Füllwörter; Du-Form; jede Zahl mit Quelle in
Klammern oder gar nicht; 350-700 Wörter gesamt; Keyword natürlich 3-5 Mal
(H1 und Text zusammen), einmal in H1, einmal im ersten Absatz.

## Lese-Vorlage (Stand 04.10.2026, Entscheid Alperna: lange Texte liest niemand)
Jede Seite folgt derselben Reihenfolge: Hook (H1, Tagline), Versprechen («In
Kürze»), Inhalt 1, offene Schleife, Inhalt 2, offene Schleife, Inhalt 3.
- Ein Abschnitt beginnt mit einem Satz, der die Aussage trägt. Danach
Aufzählung statt Fliesstext. Absätze höchstens drei Sätze.
- Offene Schleife: eine Zeile am Ende eines Abschnitts, die auf den nächsten
neugierig macht. Markdown: eine Zeile, die mit `=> ` beginnt («=> Gleich
unten: der Fehler, den fast alle machen.»). Sie wird mit einem goldenen
Punkt abgesetzt. Mindestens zwei pro Seite. Sie verspricht nur, was folgt.
- Zwischenüberschriften (###) statt langer Absätze; Schritte und Fehler
erscheinen als Karten, Fragen als Akkordeon.
- Kategorieseiten: Einleitung 50-130 Wörter mit 3-5 Punkten; Hintergrund
180-360 Wörter in 3-5 Abschnitten (###), mindestens 5 Punkte, mindestens zwei
offene Schleifen; Fragen höchstens 80 Wörter. Startseite, SEO-Abschnitt
«Marketing in der Schweiz»: 300-480 Wörter, gleiche Regeln.
- Die Grenzen prüft `npm run content-check` (lib/content-rules.ts, `READING`,
und lib/site-rules.ts). Kürzer als früher heisst nicht dünner: Jede Zahl
braucht weiter eine Quelle, jede Aussage einen Schweizer Bezug.

## Alperna-Pitch (components/AlpernaPitch)
Überschrift fest: «Wenn du das lieber abgibst». Drei Sätze aus
content/tools/<slug>.md (problem, baustein, beweis), dazu der Bausteintext
aus content/pitch/bausteine.md. Zwei Knöpfe: WhatsApp («Kurz schreiben»,
wa.me mit vorausgefülltem Text, der das Tool nennt) und «Kostenloses
Erstgespräch» (NEXT_PUBLIC_ERSTGESPRAECH_URL). Kein Formular, keine Preise
ausser dem Einstiegsangebot, wenn der Baustein «Website» ist. Bausteine ohne
Text erscheinen nicht (heute Google Ads). Auf Startseite
und Kategorieseiten die lange Fassung mit allen sechs Bausteinen.

## Startseite (app/(site)/page.tsx)
Hero (ein Satz Nutzen, Suchfeld, zwei Knöpfe) → TrustLine → vier PathCards
mit Fortschritt aus dem lokalen Profil (Strategie, Analyse, Inhalte,
Praktisches) → sechs
ToolCards «Meistgenutzt» (popular:<slug> aus Redis, revalidate 1 h, Fallback:
Feld featured in tools/index.ts) → «Warum kostenlos» (content/site/warum-
kostenlos.md) → SEO-Abschnitt (content/site/marketing-schweiz.md, 300-480
Wörter, gegliedert) → AlpernaPitch lang → FAQ → Footer.

## Kategorieseite
H1, Intro (50-130 Wörter mit Punkten) aus content/site/<kategorie>.md, Pfad als
SVG mit Fortschritt aus dem lokalen Profil, ToolCards, SEO-Abschnitt (180-360
Wörter in Abschnitten mit Zwischenüberschriften), FAQ als Akkordeon,
AlpernaPitch lang.

## Tool-Anatomie: tool.config.ts
    import { defineTool } from '@/lib/define-tool'
    export default defineTool({
      slug: 'icp-builder',
      name: 'ICP-Builder',
      category: 'strategie',          // strategie | analyse | inhalte | praktisches
      audience: 'kmu',                // kmu | verein | beide
      tagline: 'Dein Idealkunde in 8 Fragen – mit Punktekarte zum Bewerten neuer Anfragen.',
      keyword: 'Idealkundenprofil',
      related: ['positionierung', 'zielgruppen-segmente', 'persona'],
      needsServer: false,
      usesProfile: ['branche', 'kanton', 'groesse'],
      writesProfile: ['zielgruppen'],
      outputs: ['pdf', 'docx', 'copy'],
      estimatedMinutes: 8,
      pathStep: { path: 'strategie', order: 2 },
      featured: false,
    })
Die Registry liest tools/index.ts und erzeugt Index, Kategorieseiten, Pfade,
Sitemap, JSON-LD und RelatedTools.

## Gemeinsame Bausteine
- ToolShell: Kopf, Inhalt, Ergebnis, Status-Zeile («Ergebnis gegen
E-Mail-Adresse» / «Ergebnisse gehen an anna@keller.ch · ändern»). Stellt den
Kontext {slug, email, ensureEmail, renewEmail, sendResult, guardDownload,
changeEmail} bereit (siehe Zugangsmodell).
- LeadGate: das E-Mail-Fenster, geöffnet von ensureEmail() vor dem ersten
Ergebnis, vor jedem Download und nach einem 403 des Servers. Felder und Text
siehe Zugangsmodell. Nach Erfolg erscheint das Ergebnis oder der Download
startet sofort, ohne Reload.
- QuestionnaireEngine: Fragetypen single, multi, text, number, scale,
ranking, matrix; showIf; scoreFn; Zwischenstand unter mt:<slug>;
Zurück/Weiter, Fortschritt, Zusammenfassung.
- DocumentExport: DocumentModel → PDF (A4, Geist eingebettet,
Kopf mit Firmenname, Fuss «Erstellt mit tools.alperna.ch»), DOCX, Markdown-
Copy. Download-Knöpfe laufen über guardDownload(): ohne Adresse erst das Fenster.
- lib/ch.ts: chf(1000) → «CHF 1'000.-», dateCH(), typoCH(), uidValid().

## Daten
Jede Datei in data/ trägt meta {source, url, asOf}. Vorgesehen:
gemeinden.json (BFS), feiertage.json, schulferien.json, anlaesse-ch.json,
gbp-kategorien.json, hashtags-regionen.json, branchen-ideen.json,
anzeiger.json, verzeichnisse.json, kanaele-ch.json (digiMONITOR), budget-
richtwerte.json, bevoelkerung-alter.json (BFS STATPOP), unternehmen.json (BFS
STATENT), spamwoerter.json, floskeln.json.

## Arbeitsweise in einer Session
1. CLAUDE.md, STATUS.md und die Specs der Etappe lesen. Unklarheiten in der
Spec zuerst fragen, sonst nicht fragen.
2. Kurzen Plan in PLAN.md (Dateien, Reihenfolge), dann bauen.
3. Pro Tool: Spec → logic.ts mit Tests → Tool.tsx → content/tools/<slug>.md
vollständig (alle Abschnitte, 350-700 Wörter, Lese-Vorlage) → Commit `feat(tool):
<slug>`. Shared Code: `feat(core): …`.
4. Nach jedem Tool `npm run check` und `npm run lh -- <slug>` gegen den
lokalen Production-Build.
5. Am Ende STATUS.md aktualisieren (fertig, offen, Entscheide, offene Quellen
für Zahlen), pushen, Vercel-Preview-Link in STATUS.md.
6. Nur die Tools der laufenden Etappe bauen. Weitere Ideen in IDEAS.md.
7. Keine neuen Abhängigkeiten ohne Eintrag in STATUS.md mit Begründung.

## Definition of Done pro Tool
- Spec erfüllt, Edge Cases aus der Spec getestet
- Mobil bei 375 px geprüft, per Tastatur bedienbar, Kontrast AA
- Ergebnis sichtbar und kopierbar, Downloads über guardDownload(), Profil wird
gelesen und (wo vorgesehen) geschrieben, jedes Ergebnis geht über
sendResult() mit lesbarer Eingabe und Ausgabe ins CRM (im Test gegen den
n8n-Stub belegt)
- Seitentext vollständig nach Vorlage, Beispiel mit Beispielfirma, FAQ 5-7,
AlpernaPitch befüllt, JSON-LD vollständig
- Das E-Mail-Fenster erscheint vor dem ersten Ergebnis und vor dem ersten
Download, danach nicht mehr; «Später» lässt den Stand stehen
- Eintrag in STATUS.md
