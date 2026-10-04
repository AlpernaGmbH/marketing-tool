# CLAUDE.md – marketing-tools (tools.alperna.ch)

## Projekt
Öffentliche Web-App mit Marketing-Werkzeugen für Schweizer KMU und Vereine,
betrieben von der Alperna GmbH (Speicher AR).
Zweck: echten Nutzen stiften, Besucher über Suchmaschinen gewinnen und daraus
Gespräche für Alperna machen.
Jede Tool-Seite ist zugleich eine SEO-Landingpage mit kurzem, gegliedertem Text (350-700 Wörter, siehe «Lese-Vorlage»).
Sprache: Deutsch (Schweiz). Zielgruppe: KMU-Entscheider 30–60,
Vereinsvorstände, Selbständige.

## Zugangsmodell (ein freier Durchlauf, danach Konto über Clerk; Zugang v2, Stand 04.10.2026)
- Alle Texte, Beispiele, FAQ: öffentlich, immer indexierbar.
- Freier Durchlauf: Jeder Besucher darf ein Tool einmal vollständig
durchlaufen. Ergebnis am Bildschirm und Text-Copy sind frei. Dateien (PDF,
DOCX, PNG, CSV, ICS, ZIP) gibt es im freien Durchlauf nicht.
- Lead-Formular (components/tool/LeadGate; in älteren Etappen-Texten
EmailGate genannt): erscheint beim zweiten Tool-Start oder beim ersten
Download. Felder: Name, Firma, E-Mail, Telefon (optional), Einwilligung
(«Alperna darf mich zu meinem Ergebnis kontaktieren»). Honeypot-Feld. Text:
«Dein erstes Ergebnis war gratis. Hinterlass uns Name, Firma und E-Mail –
dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich,
falls du Fragen hast.»
- Nach dem Absenden: Besucher ist freigeschaltet (alle Tools, alle
Downloads), Lead geht über /api/lead an n8n ins CRM.
- Konto (Zugang v2): Ist die Anmeldung eingerichtet (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
CLERK_SECRET_KEY), zeigt das LeadGate zuerst «Anmelden und freischalten» (mit dem
Häkchen «Alperna darf mich zu meinem Ergebnis kontaktieren») und das Formular als
Ausweg («Lieber ohne Konto?»). Die Anmeldung macht Clerk (Fenster mit Google,
Microsoft, Apple oder E-Mail-Code, je nach Einstellung im Clerk-Dashboard). Ohne
Einrichtung gilt nur das Formular. Nach der Rückkehr (?konto=ok)
schaltet POST /api/lead/account frei: Name und E-Mail kommen aus dem Konto bei Clerk
(nur bestätigte Adressen), nicht aus dem Browser. Die Freischaltung des Kontos liegt in Redis unter
acct:<HMAC der E-Mail> (TTL 365 Tage) und gilt auf allen Geräten. Ein Konto,
das schon freigeschaltet ist, erzeugt keinen zweiten Lead. Eine Anmeldung allein
schaltet nicht frei: ohne die Einwilligung im Fenster gibt es keine
Freischaltung. Sitzung: Clerk (Cookies __session und __client_uat auf unserer Domain,
dazu Cookies von Clerk selbst; alle notwendig, kein Banner). Clerk lädt im Browser nur,
wenn jemand «Anmelden» anklickt oder schon ein Sitzungs-Zeichen (__client_uat) trägt
(lib/clerk-bridge.ts). Besucher ohne Konto nehmen nie Kontakt zu Clerk auf. Der Server
prüft die Sitzung in middleware.ts (clerkMiddleware, nur für /api/...) und liest über
lib/auth.ts die bestätigte E-Mail-Adresse; die Kennung des Kontos bleibt der HMAC dieser
Adresse, egal über welchen Anbieter die Person sich anmeldet.
- Zählung: lib/access.ts bildet einen HMAC-SHA256 der Client-IP (x-forwarded-
for erstes Element) mit GATE_SECRET, gekürzt auf 16 Byte. Redis-Keys: run:
<iphash> (Zähler, TTL 30 Tage), unlocked:<iphash> (TTL 365 Tage), acct:<acchash>
(Konto freigeschaltet, TTL 365 Tage), popular:
<slug> (Zähler), ai:<acchash>:<YYYY-MM-DD> (Einordnungen pro Konto), ai:global:
<YYYY-MM-DD> und lookup:<iphash>:<YYYY-MM-DD> (TTL 2 Tage), aicache:<hash der
Signatur> (fertige Einordnung, TTL 24 Stunden), data:<acchash> (Daten des Kontos, siehe
«Firmenprofil», ohne Ablauf). Dazu ein signiertes Cookie mt_gate {runs, unlocked, iat}
(HttpOnly, SameSite=Lax, 365 Tage). Gesperrt ist, wer in Redis ODER Cookie
als gebraucht steht; freigeschaltet, wer in Redis ODER Cookie als
freigeschaltet steht.
- Routen: POST /api/access {tool} → {allowed, unlocked, reason}; POST
/api/access/complete {tool} → zählt den Durchlauf und popular:<slug>; POST
/api/lead → validiert, leitet an n8n weiter, setzt unlocked in Redis und
Cookie.
- Das Formular steht vor dem Start oder vor dem Download, nie vor dem
Ergebnis eines begonnenen Durchlaufs. Ist Redis nicht erreichbar, gilt nur
das Cookie; ist /api/lead nicht erreichbar, wird trotzdem freigeschaltet und
der Lead in Redis-Liste lead_queue abgelegt (Vercel Cron ruft täglich
GET /api/cron/leads auf, geschützt mit CRON_SECRET; die Route schickt wartende
Leads an n8n und entfernt sie danach). Ein Besucher wird nie wegen unserer
Technik blockiert.

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind 4, shadcn/ui (nur
benötigte Komponenten), React Hook Form + zod,
@upstash/redis, @upstash/ratelimit, Vitest + Testing Library, Playwright für
Smoke-Tests, pdf-lib, docx, qrcode, jszip, fuse.js, gray-matter, remark.
Hosting Vercel (Functions-Region fra1). Zähler Upstash Redis. Leads n8n.
Analytics Umami. Paketmanager npm. Node 20+.

## Ordnerstruktur
- app/(site)/page.tsx – Startseite
- app/(site)/[kategorie]/page.tsx – Kategorieseiten strategie, content,
analyse, schweiz, ki, vereine
- app/(site)/tools/[slug]/page.tsx – Tool-Seite, statisch über
generateStaticParams, Tool als Client-Komponente
- app/(site)/profil/page.tsx – Firmenprofil ansehen, bearbeiten, als JSON
exportieren/importieren, alles löschen
- app/api/access/route.ts, app/api/access/complete/route.ts,
app/api/lead/route.ts – Zugang und Leads
- app/api/lead/account/route.ts – Freischalten mit Konto; app/api/account/route.ts – wer ist angemeldet (Name, E-Mail) für
Kopfzeile und Profilseite; app/api/account/data/route.ts – Daten des Kontos (GET, PUT, DELETE)
- app/api/check/route.ts – Marketing-Check: ruft die Website des Besuchers ab
(SSRF-Schutz in lib/check/net.ts), streamt Schritte und Ergebnis als NDJSON
- app/api/ai/route.ts – KI-Einordnung zu einem Check-Ergebnis: nur mit Konto und
Freischaltung, nur für von /api/check signierte Ergebnisse (lib/check/sign.ts),
Tageslimits (lib/ai-quota.ts), 24 Stunden Zwischenspeicher, Antwort der KI wird
geprüft (lib/check/ai.ts) und sonst verworfen
- app/api/text/route.ts – Text-Umschreiber und Textcheck mit KI: schreibt den Text des Besuchers
im gewählten Stil neu oder prüft ihn (Stil «pruefen»); ohne Konto, es gilt der freie Durchlauf
und danach das Formular; Schutz: 30 Anfragen pro Stunde und IP-Hash, globale Tagesgrenze
(AI_DAILY_CAP); Antwort wird geprüft (tools/text-umschreiber/logic.ts), nichts wird
gespeichert oder mit Inhalt geloggt
- app/api/cron/leads/route.ts – täglicher Cron: schickt Leads aus lead_queue nach
- app/api/lookup/route.ts – Etappe 3
- app/sitemap.ts, app/robots.ts, app/opengraph-image.tsx
- tools/<slug>/tool.config.ts – Metadaten (Schema unten)
- tools/<slug>/Tool.tsx – Client-Komponente, nutzt ToolShell
- tools/<slug>/logic.ts – reine Funktionen, kein React, kein DOM
- tools/<slug>/logic.test.ts – Vitest
- tools/index.ts – explizite Liste aller Tools (kein Glob)
- components/tool/ – ToolShell, ToolPageLayout, QuestionnaireEngine,
DocumentExport, ProfileBanner, LeadGate, ScoreBadge, ResultCard, CopyButton,
LegalDisclaimer, AlpernaPitch, RelatedTools
- components/site/ – Header, Footer, Search, PathCard, ToolCard, TrustLine,
Breadcrumbs, AccountMenu (Konto in der Kopfzeile), SignInDialog
- lib/define-tool.ts – defineTool(), zod-Schema, Typen (getrennt von der Registry, sonst Zirkelimport)
- lib/registry.ts – getTools(), getToolsByCategory(), getTool(), getRelated(), getPath()
- lib/access.ts – ipHash(), readGateCookie(), writeGateCookie(), canStart(),
markComplete(), unlock()
- lib/redis.ts – Upstash-Client, Key-Helfer, TTLs
- lib/auth.ts, lib/account.ts – Konto (Server): Person aus der Sitzung von Clerk, Kennung
aus der bestätigten E-Mail-Adresse
- lib/clerk-bridge.ts, lib/clerk-localization.ts, lib/konto-client.ts,
components/site/ClerkLoader.tsx, ClerkRoot.tsx – Konto (Browser): Clerk lädt erst bei
Bedarf; Texte der Fenster auf Deutsch in Du-Form; Merker der begonnenen Anmeldung
- lib/profile.ts – Profil-Typen, Validierung, Export/Import JSON (rein, ohne React)
- lib/use-profile.ts – useProfile(): localStorage-Key mt:profile
- lib/check/ – Engine des Marketing-Checks (Port aus dem Agentur-Tool): net.ts,
analyze.ts, seo.ts, social.ts, gbp.ts, detect.ts, massnahmen.ts, client.ts,
sign.ts (Signatur des Ergebnisses), ai.ts (Fakten, Prompt, Prüfung der KI-Antwort),
ai-client.ts (Browser)
- lib/ai.ts, lib/ai-quota.ts – KI: direkt bei Mistral (MISTRAL_API_KEY, kostenloser Plan) oder über
das Vercel AI Gateway (Modelle aus AI_MODELS), Tageslimits und Zwischenspeicher
- lib/storage.ts, lib/use-local.ts – localStorage mit Rückfall auf Arbeitsspeicher; führt
für Schlüssel des Kontos Buch (Zeitpunkt der letzten Änderung)
- lib/sync-keys.ts, lib/sync.ts, lib/account-data.ts, lib/account-actions.ts,
components/site/AccountSync.tsx – Abgleich der lokalen Daten mit dem Konto
- lib/ch.ts – chf(), dateCH(), typoCH(), uidValid()
- data/*.json – Schweizer Datensätze, jede Datei mit meta {source, url, asOf}
- content/tools/<slug>.md – Seitentext mit festen Abschnitten (Vorlage unten)
- content/site/*.md – Startseite, Kategorien, FAQ
- content/pitch/bausteine.md – Alperna-Bausteine und Einstiegsangebot (von
Alperna geliefert)
- content/legal/*.md – Rechtstexte, von Menschen geprüft, nie selbst
formulieren
- specs/<slug>.md – Spec pro Tool, vor dem Bauen lesen
- scripts/new-tool.ts, scripts/content-check.ts, scripts/seo-check.ts
- PLAN.md, STATUS.md, IDEAS.md – Arbeitsdateien

## Firmenprofil (lib/profile.ts; im Browser, bei Angemeldeten zusätzlich im Konto)
Felder: organisationstyp kmu|verein, firma, branche, rechtsform, ort, website, kanton,
groesse, zielgruppen[], primaersegment, personas[], positionierung, marke
{werte, persoenlichkeit, tonalitaet, woerter, bewertungsregeln}, kanaele[],
budgetJahr, contentSaeulen[]. Tool-Zwischenstände unter mt:<slug>. Merkliste
unter mt:merkliste.
Daten beim Konto: Wer angemeldet ist und dessen Speicher (Redis) bereitsteht, dessen
Firmenprofil, Merkliste und Zwischenstände (Schlüssel mt:profile, mt:merkliste, mt:<slug>)
liegen im Konto (Redis data:<acchash>, kein Ablauf, bis die Person sie löscht) und folgen
ihr auf jedes Gerät. Der Browser bleibt die Arbeitskopie; AccountSync gleicht ab (Start,
2 Sekunden nach einer Änderung, Rückkehr in den Tab). Je Schlüssel gewinnt die jüngere
Änderung; Löschungen werden als Grabstein 60 Tage mitgeführt. Grenzen: 60 Schlüssel, 150'000
Zeichen je Wert, 600'000 insgesamt. Abmelden schickt alles hinauf und löscht danach die lokale
Kopie (schlägt das fehl, bleibt sie). «Alles löschen» und «Meine Daten im Konto löschen» auf
/profil löschen zuerst die Daten im Konto. Der Server liest die Werte nicht und loggt sie nicht.
Ohne Anmeldung bleibt alles im Browser.
Kopfzeile: Ist die Anmeldung eingerichtet, sehen Besucher «Anmelden» und
«Registrieren» (bei Clerk ein Fenster für beides, die Anmeldung allein schaltet nichts
frei und schickt nichts an Alperna). «Mein Profil» steht nur im Menü der angemeldeten
Person, zusammen mit «Abmelden». Ohne eingerichtete Anmeldung bleibt der Link
«Mein Profil» wie bisher. Die Seite /profil ist per Adresse erreichbar und zeigt
oben die Konto-Karte.
Jedes Tool mit usesProfile zeigt ProfileBanner («Dein Firmenprofil: Malerei
Keller, Gossau – bearbeiten»). Hinweis auf /profil: «Wird nur in deinem
Browser gespeichert. Exportiere es, wenn du es behalten willst.» Bei Angemeldeten
mit bereitstehendem Speicher sagt die Seite stattdessen, dass das Profil in ihrem Konto liegt
(ProfilHinweis).

## Harte Regeln
1. Eingaben in Tools verlassen den Browser nicht. Ausnahmen: das Lead-
Formular (Name, Firma, E-Mail, Telefon, Tool-Name, Kategorie – sonst nichts),
Tools mit needsServer: true über /api/check, /api/ai, /api/text und /api/lookup und die Daten
einer angemeldeten Person über /api/account/data (Profil, Merkliste, Zwischenstände,
nur in ihrem Konto, bis sie sie löscht). Server-Routen
loggen Statuscodes, nie Inhalte, nie Klartext-IPs.
2. Du-Form im UI. Schweizer Rechtschreibung: ss statt ß, «» als
Anführungszeichen, CHF 1'000.-, Datum 03.10.2026, Prozent mit Leerzeichen
(8,1 %).
3. Jede logic.ts hat Tests. `npm run check` (typecheck, test, content-check,
build) ist vor jedem Commit grün.
4. Keine externen Skripte ausser Umami und Clerk. Clerk (clerk-js, von der Clerk-Domain
der Anwendung) lädt nur, wenn jemand sich anmeldet oder angemeldet ist, nie für Besucher
ohne Konto. Cookies: mt_gate und, nach der Anmeldung, die Sitzung von Clerk (beide
notwendig, in der Datenschutzerklärung erklärt, kein Banner). Fonts über next/font/local
(Geist, Geist Mono, Instrument Serif).
5. Lighthouse mobil: Performance, SEO, Accessibility je ≥ 95 pro Tool-Seite.
6. Ein Tool = ein Ordner. Neue Tools nur über `npm run new-tool <slug>`.
7. Keine Zahl ohne Quelle. Benchmarks und Statistiken nur aus data/*.json mit
meta.source; fehlt die Quelle, fällt die Zahl weg. Gilt auch für Seitentexte.
8. Rechts-Tools nehmen Formulierungen nur aus content/legal/ und zeigen
LegalDisclaimer. Keine eigenen Rechtsaussagen, auch nicht im Seitentext.
9. Fragebogen-Tools: höchstens 10 Fragen, Zwischenstand lokal gespeichert,
Ergebnis sofort sichtbar. LeadGate nur vor dem zweiten Tool-Start und vor
Downloads.
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
Gold nur für den Kreis im primären Knopf, die eine Markierung pro Seite
(`mark-yellow`: Serif kursiv mit goldenem Balken), Punkte vor Beschriftungen
und Fokus auf Dunkel. Navy nur für den Footer, die Logo-Kachel und Zustände.
Nie Gold als Textfarbe auf hellem Grund (Kontrast).
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
Bildsprache: keine Stockfotos. Nur Fotos aus assets/photos; gibt es keine,
keine Bilder. Höhenlinien (SVG, 4 % Deckkraft) als Hintergrundmotiv auf
Startseite und Kategorieseiten.
Ton: ruhig, konkret, belegbar. Keine Ausrufezeichen, keine Emojis, keine
Superlative, kein «jetzt», «nur noch», «garantiert», «Nr. 1». Kurze Sätze.
Alperna-Stimme und Sperrliste: docs/MARKE.md und lib/brand-rules.ts (aus den
Alperna-Dokumenten BRAND-VOICE-CORE und ANTI-PATTERNS). Alperna ist «Partner für
den digitalen Auftritt», nie «Agentur»; kein Gedankenstrich «—»; Google Ads wird
nicht aktiv angeboten. Fakten über Alperna nur aus docs/MARKE.md.
Dark Mode: nein.

## Seitenaufbau Tool-Seite (Komponente ToolPageLayout, in dieser Reihenfolge)
1. Breadcrumbs · H1 «<Tool> für Schweizer KMU» (Vereins-Tools: «… für
Schweizer Vereine») · Tagline · MetaLine: Dauer, Kategorie, «Ergebnis sofort,
Dateien nach kurzem Formular»
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
mit Fortschritt aus dem lokalen Profil + Karte «Für Vereine» → sechs
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
      category: 'strategie',          // strategie | content | analyse | schweiz | ki
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
- ToolShell: Kopf, Inhalt, Ergebnis, Status-Zeile («Freier Durchlauf» /
«Freigeschaltet»).
- LeadGate: Dialog vor Tool-Start (wenn /api/access allowed false) und vor
jedem Download (wenn unlocked false). Felder und Text siehe Zugangsmodell.
Nach Erfolg startet das Tool oder der Download sofort, ohne Reload.
- QuestionnaireEngine: Fragetypen single, multi, text, number, scale,
ranking, matrix; showIf; scoreFn; Zwischenstand unter mt:<slug>;
Zurück/Weiter, Fortschritt, Zusammenfassung.
- DocumentExport: DocumentModel → PDF (A4, Geist eingebettet,
Kopf mit Firmenname, Fuss «Erstellt mit tools.alperna.ch»), DOCX, Markdown-
Copy. Download-Knöpfe prüfen unlocked, sonst LeadGate.
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
- Ergebnis sichtbar und kopierbar, Downloads nur freigeschaltet, Profil wird
gelesen und (wo vorgesehen) geschrieben, Durchlauf wird über
/api/access/complete gezählt
- Seitentext vollständig nach Vorlage, Beispiel mit Beispielfirma, FAQ 5-7,
AlpernaPitch befüllt, JSON-LD vollständig
- Erster Durchlauf frei, zweiter Start und erster Download zeigen das
LeadGate
- Eintrag in STATUS.md
