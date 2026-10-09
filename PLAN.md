# PLAN.md – Plan v2

Stand: 04.10.2026. Ersetzt den Bauplan-Ablauf ab Etappe 2. Etappe 0 bis 1b sind gebaut (siehe STATUS.md).

## Anlass

Rückmeldung vom 04.10.2026: Die meisten Werkzeuge im Bauplan sind zu einfach, weil sie nur Fragen stellen und daraus ein Dokument bauen. Die Analyse soll aus **Crawling und KI** entstehen, nicht aus Antworten des Besuchers. Referenz: der Marketing-Check auf alperna-tool.vercel.app/website/check.html. Seine Engine (`lib/marketing-check/analyzer.mjs`, 981 Zeilen, Repo `AlpernaGmbH/tool`) prüft Website, SEO, Tracking, Newsletter, Shop, Buchung, Social-Verknüpfung und (mit Schlüssel) das Google-Profil. Sie hat bereits einen Schutz gegen Zugriffe auf interne Adressen.

Folge: Der «Digitaler-Auftritt-Check» aus Etappe 1b (sieben Fragen) ist die falsche Fassung. Er wird durch den Marketing-Check mit Crawler ersetzt. Die Fragebogen-Logik bleibt nur dort, wo es nichts zu crawlen gibt (Selbstangaben wie Budget oder Prozesse).

## Drei Werkzeug-Klassen

| Klasse | Was sie tut | Wo die Fakten herkommen | Beispiele |
|---|---|---|---|
| **A Analyse** | Besucher gibt URL(s) und wenige Angaben. Server prüft, die KI ordnet ein. | Crawler und Schnittstellen. Die KI erfindet keine Zahlen. | Marketing-Check, GBP-Check, Wettbewerbsvergleich, Textcheck, Newsletter-Check |
| **B Generator** | KI schreibt einen Entwurf aus Firmenprofil, optional aus der Website des Besuchers. | Profil und Website-Text. | Persona, Markenplattform, Botschaften, Captions, Medienmitteilung |
| **C Rechner/Planer** | Deterministisch, mit Daten aus `data/*.json`. | Quelle in `meta`. | Budget, QR, WhatsApp-Link, Feiertage, Kalender, Marktpotenzial |

Klasse C bleibt bewusst einfach: Diese Seiten bringen Suchverkehr (WhatsApp-Link, QR-Code), und sie brauchen weder Server noch KI.

## Einstufung des Katalogs

«alt» = Beschreibung im Bauplan, «neu» = Plan v2. Nur Tools, die sich ändern, sind mit Begründung aufgeführt.

| Tool | Klasse | Änderung |
|---|---|---|
| digitaler-auftritt-check (Marketing-Check) | A | Crawler statt Fragen, Engine aus dem Agentur-Tool, danach KI-Auswertung |
| reifegrad-check | A | Website, Social, Tracking werden gemessen; 24 Fragen schrumpfen auf die Selbstangaben (Prozesse, Budget, Ziele) |
| gbp-check | A | Places-Abfrage statt Fragen: Vollständigkeit, Kategorien, Fotos, Bewertungen, Antworten; Vergleich mit Betrieben im Umkreis |
| wettbewerbsvergleich | A | 2 bis 5 URLs durch dieselbe Engine; Tabelle und KI-Einordnung |
| wettbewerbskarte | A | Konkurrenz-URLs lesen, KI schlägt Positionen auf den Achsen vor, Besucher korrigiert |
| newsletter-check | A | Anmeldung und System erkennen; eingefügter Newsletter-Text wird geprüft |
| textcheck | A | Text oder URL: Floskeln, Lesbarkeit, Schweizer Schreibweise (regelbasiert), KI-Vorschläge |
| keywords-lokal | A | Suchvorschläge und Seitentitel statt Eingabeliste; Quelle der Vorschläge vor dem Bau klären |
| positionierung | A/B | «Positionierungs-Check»: Website-Text auf Floskeln und Beweise prüfen, dann Entwurf |
| gbp-kategorien, verzeichnisse | A | Nur öffentliche, erlaubte Quellen (Places, eigene Listen). Kein Scraping von Seiten, die es verbieten |
| linkedin-profil | B | LinkedIn lässt sich nicht crawlen. Besucher fügt Profiltext ein, KI bewertet nach Raster |
| engagement-rate | C | Instagram und TikTok lassen sich nicht auslesen: Besucher tippt Zahlen ein |
| ideen-aus-website | A | war schon Etappe 8; wird früh gebaut, weil es die Website-Import-Funktion testet |
| icp-builder, persona, nutzenversprechen, markenplattform, botschaften, swot, kampagnen-planer, kpi-baum, kundenweg (heisst im Bauplan «customer-journey»; der Begriff steht auf der Sperrliste), strategie-einseiter | B | Entwurf aus Profil und Check-Ergebnis; Besucher bestätigt oder korrigiert statt bei null zu beginnen |
| content-saeulen, content-ideen, caption-baukasten, story-post, medienmitteilung, content-strategie | B | KI-Entwurf in der Tonalität der Website des Besuchers |
| bewertungsantwort, post-generator | B | wie im Bauplan (Etappe 8) |
| zielgruppen-segmente, kanalstrategie, budget-planer, angebotsarchitektur, marktpotenzial | C | wie im Bauplan; Daten nur mit Quelle |
| whatsapp-link, qr-set, bewertungs-kit, gbp-feiertage, hashtags, posting-plan, content-kalender, anlass-planer, vorher-nachher, angebotsgrafik | C | wie im Bauplan |
| impressum, datenschutz, gewinnspiel-check, uwg-mailcheck | C | wie im Bauplan; Formulierungen nur aus `content/legal/` (Regel 8), KI darf Rechtstext nicht formulieren |
| anspruchsgruppen, vereins-kommunikation, sponsoring-dossier, empfehlungsprogramm | B | Vereine; Entwurf statt Formular |

## Bausteine für Klasse A und B

1. **Check-Engine** (`lib/check/`): Port von `analyzer.mjs` aus dem Agentur-Tool, mit Typen und Tests. Die Engine liefert `CheckResult` mit `categories`, `items` und `facts`. Jede Aussage trägt eine Fakt-ID. Der Port ist eine Kopie; Änderungen müssen in beiden Repos nachgezogen werden (das steht schon im Kopf der Datei). Wer das vermeiden will, macht daraus ein gemeinsames Paket.
2. **Ablauf in Schritten statt einem langen Aufruf:** Website laden, SEO und Technik, Google-Profil, Social-Verknüpfung, Tracking/Newsletter/Shop/Buchung, Bewertung. Jeder Schritt ist ein eigener Request, der Fortschritt im Browser ist echt (die Vorlage zeigt eine erfundene Prozentkurve). Vercel Hobby erlaubt bis 300 s je Aufruf (Quelle: vercel.com/docs/functions/limitations); die Schritte bleiben trotzdem kurz.
3. **Zwischenspeicher:** Ergebnis je Domain 24 Stunden in Redis. Mehrfach geprüfte Adressen kosten nichts.
4. **Quellen:** eigener Abruf der Seite; PageSpeed-Schnittstelle (optional); Google Places API (New) für das Profil; Social-Kanäle nur über Links auf der Website und öffentliche Meta-Daten, kein Scraping von Instagram, LinkedIn oder TikTok.
5. **KI-Schicht** (`/api/ai`, nur Gratis-Anbieter, siehe «KI ohne Kosten»): bekommt nur das Fakten-JSON. Ausgabe: Zusammenfassung und Massnahmen, jede mit Verweis auf mindestens eine Fakt-ID. Eine Prüfung verwirft Massnahmen ohne Verweis und Texte mit Zahlen, die nicht in den Fakten stehen. Danach `typoCH`. Fällt die KI aus, bleibt das Fakten-Ergebnis stehen.
6. **Profil-Autofill:** Ein Check schreibt Branche, Ort, Kanäle und Tonalitäts-Hinweise ins Firmenprofil. Alle weiteren Tools starten vorbefüllt (Regel 10).
7. **Schutz:** Zugriffe auf private Adressen blocken (in der Engine vorhanden), Grösse und Zeit begrenzen, Rate-Limit über Upstash statt im Arbeitsspeicher (Serverless teilt keinen Speicher), robots.txt bei Fremdseiten (Wettbewerb) beachten, Kennung im User-Agent.

## Etappen v2

| Etappe | Inhalt | Voraussetzung |
|---|---|---|
| **1c** | Marketing-Check mit Crawler (Engine-Port, Schritte, Zwischenspeicher, Ergebnisansicht im neuen Design, Export PDF/Word). Ersetzt den Fragebogen. Profil-Autofill. Ohne KI. | Zugriff auf `AlpernaGmbH/tool` (ist da); optional Places-Schlüssel |
| **2** | Zugang v2 (Konto per Google u. a., siehe unten), `/api/ai` mit Gratis-Anbietern, KI-Auswertung im Marketing-Check, Tageskontingente | Upstash verbunden, Google-Login-Daten (Client-ID und Secret) |
| **3** | Klasse A: gbp-check, wettbewerbsvergleich, newsletter-check, textcheck, reifegrad-check, ideen-aus-website | Places-Schlüssel |
| **4** | Klasse B Strategie und Marke: icp-builder, persona, positionierung, markenplattform, botschaften, nutzenversprechen, swot, strategie-einseiter | Etappe 2 |
| **5** | Klasse C und Rechts-Tools: whatsapp-link, qr-set, bewertungs-kit, Feiertage, Budget, Kalender, Impressum, Datenschutz, Gewinnspiel, UWG-Mailcheck | `content/legal/` von Menschen |
| **6** | Klasse B Content und Vereine | Etappe 2 |
| **7** | Launch: DNS, Rechtsseiten, Umami, Search Console, Lighthouse-Tabelle | alles Obige |

Reihenfolge neu: **Analyse zuerst.** Sie zeigt, was Alperna kann, liefert das Profil für alle Generatoren und ist der stärkste Einstieg für Leads. Die Strategie-Werkstatt (alt Etappe 2 und 3) folgt danach und baut auf dem Profil auf.

## Zugang v3 (entschieden und gebaut am 04.10.2026, spät; ersetzt Zugang v2)

**Entscheid von Alperna:** Kein Konto, keine Anmeldung. Wer ein Ergebnis will, gibt eine E-Mail-Adresse an. Eingabe, Ergebnis und Adresse werden zusammengeführt und gehen ins CRM, bei jedem Werkzeug, immer.

- Werkzeug läuft ohne Hürde bis zum Ergebnis; vor dem ersten Ergebnis und vor Downloads das Fenster (E-Mail, Häkchen). Danach ein Jahr lang kein Fenster mehr (Cookie `mt_gate` mit der Adresse, signiert).
- `POST /api/result`: Werkzeug, Eingabe, Ausgabe, Firma aus dem Profil, Adresse aus dem Cookie → n8n → Notion (Spalten Eingabe, Ausgabe) und Mail.
- Gilt für alle kommenden Werkzeuge: `ToolShell.ensureEmail()` vor dem Ergebnis, `ToolShell.sendResult({eingabe, ausgabe})` danach; `QuestionnaireEngine` macht beides von selbst (`resultText` liefert die Ausgabe als Text).
- Risiken und Einwände: STATUS.md, Entscheid 54 (weniger Ergebnisse, keine Adressbestätigung, Texte Dritter im CRM, Datenschutzerklärung).
- Die KI-Werkzeuge brauchen dasselbe Cookie; es gibt keine Grenze pro Person, nur Ratenbegrenzung und die globale Tagesgrenze. Die Einordnung im Check hat 5 pro Adresse und Tag.

## Zugang v2 (entschieden am 04.10.2026, **überholt durch v3**, nur noch als Verlauf)

**Entscheid von Alperna (v2):** Ein Durchlauf pro Werkzeug ist frei. Danach erscheint ein Fenster, in dem man kurz ein Konto erstellt, mit Google, Apple und weiteren Anbietern.

- Erster Durchlauf: frei, ohne Konto. IP-Hash und Cookie bleiben als Komfort-Schranke, nicht als Sicherheit (bekannte Lücken: gemeinsame Büro- und Mobilfunk-IPs, Browserwechsel).
- Danach das Konto-Fenster statt des heutigen Formulars. Mit Konto: alle Werkzeuge und Downloads, Kontingente pro Person, Freischaltung auf allen Geräten.
- Lead: Name und E-Mail kommen vom Anbieter. Das Häkchen «Alperna darf mich zu meinem Ergebnis kontaktieren» bleibt im Fenster, weil eine Anmeldung keine Einwilligung zur Kontaktaufnahme ist (revDSG). Firma und Telefon sind freiwillig. Der Lead geht wie bisher über n8n ins CRM.
- Das Firmenprofil bleibt im Browser (Regel 1). Serverseitig liegen nur Konto-Kennung, Freischaltung und Kontingente in Redis.
- **Anbieter, in dieser Reihenfolge:** Google (kostenlos, braucht einen OAuth-Zugang in der Google Cloud, kein Zahlungsmittel), E-Mail-Link für alle ohne Google (Versand über n8n und Gmail), danach Microsoft und LinkedIn (kostenlos). **Apple** ist möglich, kostet aber ein Entwicklerkonto (Apple Developer Program, nach meinem Wissen USD 99 pro Jahr; vor dem Kauf prüfen). Vorschlag: zuerst ohne Apple starten.
- **Bibliothek:** Wahl am Anfang von Etappe 2 nach kurzer Prüfung (Kandidaten Better Auth, Auth.js, Supabase Auth, Clerk). Kriterien: kostenlos, Social-Login, Sitzung ohne eigene Datenbank oder mit Upstash.
- **Texte:** «kein Konto nötig» in TrustLine, Seitentexten und CLAUDE.md wird mit Etappe 2 angepasst, ebenso die Datenschutzerklärung (E-Mail wird gespeichert, Löschfunktion nötig).
- **Risiko:** Jede Hürde nach dem ersten Durchlauf senkt die Zahl der Leads. Wie stark, ist eine Vermutung; messbar erst nach dem Start.

## KI ohne Kosten (entschieden am 04.10.2026)

**Entscheid von Alperna:** Bezahlte KI kommt nicht in Frage, es braucht Gratis-Lösungen.

**Ehrliche Grenze [Sicher]:** Gratis-Kontingente sind klein und können sich ändern. Wird die Seite erfolgreich, kippt die KI zuerst. Darum gelten fünf Regeln:

1. Die Fakten und die Massnahmen-Liste des Checks entstehen **ohne KI** (Crawler plus Regeln). Die KI formuliert nur Zusammenfassung und Einordnung. Fällt sie aus, bleibt alles Wesentliche stehen.
2. KI erst, wenn eine E-Mail-Adresse bekannt ist (Zugang v3; vorher: nur für angemeldete Personen).
3. Ergebnisse je Domain 24 Stunden zwischenspeichern (Redis).
4. Mehrere Anbieter hintereinander (siehe Tabelle) und ein globales Tageslimit. Ist es erreicht, steht dort «Heute ist das Kontingent aufgebraucht» mit WhatsApp-Knopf.
5. Kurze Eingaben: nur das Fakten-JSON, ungefähr 3'000 Tokens statt 8'000.

**Entscheid vom 04.10.2026: Cloudflare und Groq entfallen** (Alperna will dort kein Konto). Gewählt ist das **Vercel AI Gateway**, weil es im vorhandenen Vercel-Team läuft, kein neues Konto und keinen Schlüssel braucht (auf Vercel meldet sich die Funktion per OIDC-Token an; Quelle: vercel.com/docs/ai-gateway/authentication-and-byok/oidc) und weil das Gratis-Kontingent eine harte Obergrenze ist.

**Vercel AI Gateway, Stand 04.10.2026** (Quelle: vercel.com/docs/ai-gateway/pricing, Seite vom 08.09.2026): jedes Team hat 5 Dollar Guthaben pro Monat gratis, ohne Aufschlag auf die Preise der Anbieter, nur für einen Teil der Modelle (Liste «Free Tier» im Dashboard) und mit niedrigeren Limits pro Modell. Ohne gekauftes Guthaben bleibt es bei diesem Betrag: Ist er aufgebraucht, antwortet das Gateway mit einem Fehler (429), es wird nichts abgebucht. Automatisches Aufladen ist standardmässig aus. Wer Guthaben kauft, verliert das monatliche Gratisguthaben.

Rechnung mit 8'000 Tokens Eingabe und 2'000 Tokens Ausgabe je Auswertung und den Listenpreisen vom 04.10.2026 (Quelle: vercel.com/ai-gateway/models):

| Modell | Preis je Million Tokens (Eingabe / Ausgabe) | Auswertungen pro Monat mit 5 Dollar | pro Tag |
|---|---|---|---|
| mistral/mistral-nemo | 0,02 / 0,03 Dollar | rund 22'700 | rund 750 |
| alibaba/qwen3.5-flash | 0,10 / 0,40 Dollar | rund 3'100 | rund 100 |
| mistral/mistral-small | 0,15 / 0,60 Dollar | rund 2'100 | rund 70 |
| meta/llama-3.3-70b | 0,72 / 0,72 Dollar | rund 690 | rund 23 |

**Offen [Vermutung]:** Welche Modelle zum Gratis-Kontingent gehören, steht nur im Dashboard. Das Modell für das Deutsch der Texte entscheidet ein Test mit echten Checks in Etappe 2. Reihenfolge der Prüfung: mistral-small, qwen3.5-flash, mistral-nemo.

**Nicht verwendet:**
- **Gemini (Google AI Studio):** Die Gratis-Stufe ist für Angebote an Nutzer im EWR, in der Schweiz und im Vereinigten Königreich ausgeschlossen (Quelle: ai.google.dev/gemini-api/terms, «Use Restrictions»). [Sicher]
- **Cloudflare Workers AI, Groq:** abgelehnt.
- **Mistral Studio (Plan «Experiment»):** gratis und in der EU, aber Eingaben und Ausgaben dürfen für das Training genutzt werden (Quelle: help.mistral.ai, «Do you use my user data to train your Artificial Intelligence models?»). Als zweiter Anbieter möglich, falls das Kontingent nicht reicht. Braucht ein eigenes Konto.

**Datenschutz:** Die Fakten (öffentliche Seiteninhalte, keine Angaben zur Person) gehen über das Vercel AI Gateway an einen Modellanbieter, je nach Modell auch ausserhalb der Schweiz. Zero Data Retention gibt es nur auf Pro und Enterprise (Quelle: vercel.com/docs/ai-gateway/pricing). Das gehört in die Datenschutzerklärung, geschrieben von einem Menschen (Regel 8).

**Korrektur vom 04.10.2026 (abends) [Sicher, aus vercel.com/docs/ai-gateway/pricing und der Liste «Free Tier» vom selben Tag]:** Die Annahme oben, `mistral/mistral-small` und `mistral/mistral-nemo` liefen mit dem Gratis-Guthaben, war falsch. Die Liste der Gratis-Modelle enthält zurzeit nur `inclusionai/ling-3.0-flash-sante`, `inclusionai/ling-3.1-flash` und `poolside/laguna-s-2.1-free` (dazu ein Embedding-Modell). Alle Mistral-Modelle sind bezahlt; ohne gekauftes Guthaben scheitern die Anfragen. **Das ist die wahrscheinliche Ursache der hohen Fehlerquote im AI-Gateway-Dashboard** [Wahrscheinlich: nicht an einer roten Anfrage bestätigt]. Die drei Gratis-Modelle sind auf Code und Agenten ausgelegt, über ihr Deutsch und den Umgang mit Eingaben steht in der Modellbeschreibung nichts; zwei stammen von einem chinesischen Anbieter. Sie sind darum nicht der Standard.

**Entscheid vom 04.10.2026 (abends): Mistral direkt, kostenloser Plan «Experiment».** Eine API-Schlüssel-Variable `MISTRAL_API_KEY` genügt; ohne sie läuft der alte Weg über das Gateway weiter (für bezahltes Guthaben). Mistral ist ein Anbieter in Frankreich, schreibt gutes Deutsch und der Plan kostet nichts (rund eine Anfrage pro Sekunde, Obergrenze rund eine Milliarde Tokens im Monat; die genauen Zahlen stehen nur im Mistral-Konto). **Preis dafür:** Im Plan «Experiment» dürfen Eingaben und Ausgaben für das Training verwendet werden (Quelle: help.mistral.ai, bereits oben genannt). Darum sagen die KI-Werkzeuge «Gib nichts Vertrauliches ein», und die Datenschutzerklärung muss es nennen. Eine Erklärung dafür, was das für Kundentexte heisst, schreibt ein Mensch (Regel 8). Wer das nicht will, kauft bei Mistral den bezahlten Plan «Scale» (Training aus) oder Guthaben beim Gateway.

**Limits:** Die KI-Werkzeuge (Text-Umschreiber, Textcheck mit KI) haben kein Limit pro Person, nur 30 Anfragen pro Stunde und IP-Hash und eine globale Tagesgrenze (`AI_DAILY_CAP`, Standard 2'000). Grund: Die Grenze schützt den kostenlosen Plan vor einem Skript, das ihn für alle aufbraucht. Bei normaler Nutzung wird sie nie erreicht.

## Wofür die Google Cloud gebraucht wird

Seit Zugang v3 **nur noch** für eines, und das ist optional: **Google-Profil prüfen** im Marketing-Check (Etappe 3): Places API. Dafür braucht es ein Zahlungsmittel im Konto; pro Monat gibt es Gratis-Kontingente (zum Beispiel 5'000 Textsuchen und 10'000 Detailabfragen, darüber USD 17 bis 32 je 1'000 Aufrufe; Quelle: developers.google.com/maps/billing-and-pricing/pricing). Ohne diesen Schlüssel meldet der Check beim Google-Profil «nicht prüfbar». Der OAuth-Client für «Mit Google anmelden» wird nicht mehr gebraucht.

## Etappe 2: Bauplan (Stand 04.10.2026; Punkte 1, 2 und 7 sind durch Zugang v3 überholt)

**Voraussetzungen von Alperna:** (1) Upstash-Redis (Produkt «Upstash», nicht «Redis») mit `KV_REST_API_URL` und `KV_REST_API_TOKEN` im Projekt; (2) Google-OAuth-Client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), Anleitung in STATUS.md. Beides ist Voraussetzung für jeden Schritt unten, der Konten oder Kontingente betrifft.

**Bibliothek: Better Auth im Stateless-Modus** [Wahrscheinlich]. Ohne Datenbank, die Sitzung steckt in einem verschlüsselten Cookie (JWE); Google-Anmeldung eingebaut (Quelle: better-auth.com/docs/concepts/session-management). Auth.js wird nicht verwendet, weil Better Auth das Projekt Auth.js übernommen hat und für neue Projekte empfiehlt [Vermutung, vor dem Bau prüfen]. Serverseitig liegen nur Kennung, Freischaltung und Kontingente in Redis.

Reihenfolge, jeder Schritt mit Tests und `npm run check`:

1. **Konto:** `lib/auth.ts`, Route `/api/auth/[...all]`, Variablen `BETTER_AUTH_SECRET` (erzeuge ich) und `BETTER_AUTH_URL`. Neue Abhängigkeit `better-auth` (Eintrag in STATUS.md). CLAUDE.md, Regel 4 («einziges Cookie mt_gate») wird angepasst: die Sitzung ist ein zweites, notwendiges Cookie.
2. **Zugang v2:** Das LeadGate-Formular wird durch ein Konto-Fenster ersetzt (Google-Knopf, Häkchen «Alperna darf mich zu meinem Ergebnis kontaktieren», Firma und Telefon freiwillig). Nach der Anmeldung: `unlocked:<kontohash>` in Redis, Lead über `/api/lead` an n8n (Name und E-Mail vom Konto). Der freie erste Durchlauf bleibt. Fällt Redis oder n8n aus, wird trotzdem freigeschaltet (Regel «nie wegen unserer Technik blockiert»); der Lead landet in `lead_queue`.
3. **Warteschlange der Leads (geändert am 04.10.2026):** Statt eines n8n-Workflows leert die Seite `lead_queue` selbst: Vercel Cron ruft täglich `/api/cron/leads` auf, die Route schickt jeden Eintrag an den Workflow «Tools-Lead» und entfernt ihn erst nach dem Versand. Grund: kein Token in n8n, nichts zum Anlegen für Alperna, eine Stelle weniger, die ausfallen kann. Auf Hobby ist nur ein Lauf pro Tag möglich; mit Pro lässt sich `schedule` in `vercel.json` auf stündlich stellen.
4. **`/api/ai`:** Vercel AI Gateway (siehe «KI ohne Kosten»), nur für angemeldete Personen, Tageslimit pro Konto und global, Zwischenspeicher je Domain 24 Stunden, Eingabe nur das Fakten-JSON des Checks. Neue Abhängigkeit `ai` (AI SDK). Jede Aussage der KI verweist auf eine Fakt-Kennung; Texte mit Zahlen, die nicht in den Fakten stehen, werden verworfen.
5. **Marketing-Check:** Abschnitt «Einordnung» im Ergebnis, bei Ausfall der KI unsichtbar.
6. **Texte:** «kein Konto nötig» in TrustLine, Seitentexten und CLAUDE.md; Antworten im FAQ; Datenschutzerklärung als Entwurf für den Menschen, der sie schreibt (Regel 8).
7. **E-Mail-Link als zweiter Weg** für alle ohne Google (Versand über n8n und Gmail): erst danach, als Etappe 2b.

## Später (aufgenommen am 04.10.2026, noch nicht gebaut)

Diese Punkte hat Alperna genannt. Sie gehören nicht zur laufenden Etappe.

### Blog von alperna.ch hierher holen

**Ziel:** Der Blog soll auf tools.alperna.ch laufen, damit Suchverkehr und Werkzeuge zusammenkommen.

- **Warum hier:** Jeder Artikel kann auf ein passendes Werkzeug verweisen, jedes Werkzeug auf passende Artikel. Das ist die stärkste Verlinkung, die die Seite hat.
- **Aufbau** [Vorschlag]: `content/blog/<slug>.md` (gleiche Technik wie die Seitentexte: Frontmatter, Markdown), Route `app/(site)/blog/[slug]/page.tsx` und Übersicht `/blog`, Eintrag in Sitemap und `robots`, JSON-LD `Article` und `BreadcrumbList`.
- **Verlinkung als Regel, vom Build geprüft** (`scripts/seo-check.ts`): mindestens drei interne Links je Artikel (davon mindestens ein Werkzeug), mindestens ein Link zur Hauptseite alperna.ch (zum passenden Baustein), und unter jedem Artikel «Dazu passt» mit zwei bis drei Werkzeugen. Umgekehrt zeigt jede Werkzeug-Seite zwei passende Artikel.
- **Umzug:** Die bestehenden Artikel von alperna.ch als Markdown übernehmen. Offen: Bleiben sie auf alperna.ch erreichbar (dann `rel=canonical` auf eine der beiden Adressen, sonst doppelter Inhalt), oder leitet alperna.ch auf tools.alperna.ch um (301)? Das entscheidet Alperna; es betrifft die Suchmaschinen-Sichtbarkeit der Hauptseite [Wahrscheinlich: ein Umzug mit 301 ist richtig, wenn der Blog dort nur Traffic bringt und keine eigene Rolle spielt].
- **Voraussetzung:** Lesbare Seitentexte (siehe STATUS.md, Entscheid 51), weil Artikel dieselbe Struktur nutzen: Hook, Versprechen, Inhalt, offene Schleife.

### Bessere Analyse und ein kostenloser Crawler

**Anlass:** Der Marketing-Check sieht nur die Startseite der Website. Instagram, LinkedIn und TikTok lassen sich nicht auslesen; Firecrawl hat nur ein kleines Kontingent und lief bei Alperna nicht zuverlässig.

- **Zuerst klären:** Was soll der Check über Social Media wissen? Zum Beispiel: gibt es ein Profil, wie viele Beiträge, wann der letzte war. Je kleiner die Frage, desto eher gibt es einen Weg ohne Kosten.
- **Wege, die keinen Schlüssel brauchen** [Vermutung, jeweils vor dem Bau zu prüfen]: (1) mehr Seiten der Website selbst lesen (Impressum, Kontakt, Leistungen, Blog), mit demselben eigenen Abruf, den der Check schon hat; (2) Verlinkungen auf der Website auswerten (Social-Profile werden dort meist verlinkt) und nur die Profil-Adresse prüfen, nicht den Inhalt; (3) öffentliche Metadaten von Profilseiten (Titel, Beschreibung, Open-Graph) lesen, soweit die Plattform sie ohne Anmeldung ausliefert.
- **Wege mit Konto:** offizielle Schnittstellen (Instagram Graph API braucht ein Geschäftskonto und die App-Prüfung von Meta), ein Kontingent bei einem Crawler-Dienst. Beides ist nicht kostenlos im Sinne von «ohne Konto».
- **Nicht tun:** Plattformen gegen ihre Nutzungsbedingungen auslesen (Anmeldung simulieren, Sperren umgehen). Das ist ein rechtliches Risiko und fällt bei der ersten Änderung der Plattform aus.
- **Ergebnis soll ehrlich bleiben:** Was nicht prüfbar ist, steht als «nicht prüfbar» im Ergebnis (wie heute das Google-Profil ohne Schlüssel).

### Scraping-Plan (Plan von Alperna, 05.10.2026; nicht jetzt bauen)

Entscheid von Alperna: Das Scraping kommt später, andere Werkzeuge werden zuerst gebaut. Dieser Abschnitt hält den Plan fest und ergänzt «Bessere Analyse und ein kostenloser Crawler» oben. Die Aussagen und ihre Kennzeichnung stammen von Alperna; was ich geprüft oder ergänzt habe, steht unter «Anmerkungen».

**1. Offene Daten (stabil, gratis)**

- [Wahrscheinlich] **Zefix:** REST-API, Zugang per Registrierung. Liefert Name, UID, Sitz, Rechtsform, Zweck und Status.
- [Wahrscheinlich] **UID-Register des BFS:** eigene kostenlose Schnittstelle. Ergänzt Zefix um Adresse und NOGA-Branchencode und enthält auch Firmen, die nicht im Handelsregister stehen.
- [Wahrscheinlich] **BFS über STAT-TAB und opendata.swiss:** Branchenstruktur, Internetnutzung, Konsum.
- [Wahrscheinlich] **Eurostat-API** für EU-Vergleiche und **OpenAlex** für Studien.
- [Wahrscheinlich] **PageSpeed Insights und Chrome UX Report** für die Website-Qualität.
- [Wahrscheinlich] **swisstopo (geo.admin.ch)** für Adressen zu Koordinaten, **OpenStreetMap/Overpass** für Betriebe.

**2. Websites ohne Firecrawl**

- [Wahrscheinlich] **Crawl4AI** (Open Source) oder **n8n** mit HTTP-Request plus Parser auf einem eigenen Server, sequenziell, höchstens 1 bis 2 Browser gleichzeitig.
- [Wahrscheinlich] Erst `sitemap.xml`, Impressum und JSON-LD per einfachem Abruf holen, den Browser nur bei JavaScript-Seiten starten.
- [Wahrscheinlich] Firecrawl-Credits nur noch für Seiten, die der eigene Crawler nicht schafft.

**3. Socials über Apify**

- [Sicher] Das Guthaben im Free-Plan liegt bei 5 Dollar pro Monat (Quelle laut Alperna: use-apify.com/blog/best-free-web-scraping-tools-2026).
- [Wahrscheinlich] So reicht es länger: Ergebnisse je Profil 30 Tage zwischenspeichern, Actors mit Pay-per-Result wählen, vor jedem Lauf ein Kostenlimit setzen, erst mit 5 Profilen testen.
- [Wahrscheinlich] Zusätzlich Instagram Business Discovery für Business-Konten (App-Prüfung nötig) und TikTok oEmbed für Video-Links.

**4. Notfallreserve**

- [Wahrscheinlich] Tavily und Exa (Suche), Diffbot und ScraperAPI haben kleine Gratis-Kontingente. Nur für Einzelfälle.

**Lücken, die bleiben**

- [Wahrscheinlich] Fremde LinkedIn-Profile in Masse gibt es gratis nicht.
- [Wahrscheinlich] Google-Maps-Daten in Masse gehen nur mit der Places API und selbst gesetzten Quotas, sonst droht eine Rechnung.
- [Sicher] Kommerzielle Marktstudien haben keine freie API.

**Reihenfolge**

1. Zefix-Zugang beantragen (dauert am längsten).
2. UID- und BFS-Endpunkte in n8n testen.
3. Crawler mit 20 Seiten auf dem Server testen und den Speicherverbrauch messen.
4. Apify mit 5 Profilen testen und die Kosten je Profil ausrechnen.

**Risiko laut Alperna:** Ohne Schritt 4 ist unbekannt, ob 5 Dollar für 50 oder für 500 Profile reichen. Erst diese Zahl zeigt, ob Socials in der Menge gratis gehen.

**Anmerkungen (Claude, 05.10.2026, nichts davon ist gebaut):**

1. **Widerspruch zu Plan v2 und zur Zeile oben «Nicht tun»:** Plan v2 (Baustein 4) schliesst Scraping von Instagram, LinkedIn und TikTok aus, und die Tabelle führt `engagement-rate` wegen «lässt sich nicht auslesen» als Klasse C. Abschnitt 3 (Apify) macht das Gegenteil. Der Grund für das Verbot gilt weiter: Die Nutzungsbedingungen der Meta-Seiten verbieten das automatisierte Sammeln von Inhalten ohne Erlaubnis (Facebook Pages Terms, Abschnitt «Collection of Data», abgerufen am 05.10.2026; die abgerufene Fassung trägt das Datum 08.03.2018, die aktuelle Fassung ist vor dem Bau zu prüfen). Ein Dienst wie Apify ändert daran nichts, er verlagert nur den Abruf. **Vorschlag:** Abschnitt 3 auf die offiziellen Wege beschränken (Business Discovery mit App-Prüfung, oEmbed) und den Rest erst nach einer Entscheidung von Alperna bauen, ob das Risiko tragbar ist.
2. **Ein «eigener Server» ist nicht Vercel.** Crawl4AI und ein Browser laufen nicht in den Funktionen von Vercel (kein dauerhafter Prozess, Speicher- und Zeitgrenzen). Es braucht einen Rechner mit Docker; der n8n-Server (Adresse `hstgr.cloud`, vermutlich ein Hostinger-VPS [Vermutung]) wäre ein Kandidat. Ob dort Platz ist, zeigt Schritt 3 der Reihenfolge.
3. **Zweck bestimmt die Rechtslage.** Daten von Unternehmen aus offenen Quellen für Auswertungen im Werkzeug (Branchenzahlen, Wettbewerber des Besuchers) sind etwas anderes als Adresslisten für die Akquise durch Alperna. Bei Namen und Kontaktangaben natürlicher Personen gilt das Datenschutzgesetz (Informationspflicht Art. 19 nDSG), bei Werbeanrufen und Werbemails das UWG Art. 3 Abs. 1 lit. o, u und v (siehe `content/legal/uwg-mailwerbung.md`, Entwurf). Vor Schritt 2 festlegen, wofür die Daten dienen.
4. **Keine Zahl ohne Quelle (Regel 7):** Zahlen aus BFS, Zefix und Eurostat gehören mit `meta {source, url, asOf}` in `data/*.json`; die Werkzeuge lesen nur diese Dateien. So bleibt der Build prüfbar, und ein Ausfall der Schnittstelle zeigt sich nicht beim Besucher.
5. **Welche Werkzeuge davon profitieren** [Vorschlag]: `marktpotenzial` (BFS STATENT/STATPOP, UID-Register), `wettbewerbskarte` und `wettbewerbsvergleich` (Crawler), `gbp-check` (Places), `verzeichnisse` und `keywords-lokal` (Quelle der Vorschläge offen), `ideen-aus-website` (Crawler statt Einzelabruf).
6. **Zugang zu Zefix:** Registrierung und Nutzungsbedingungen der Schnittstelle vor dem Bau prüfen (Weitergabe, Zwischenspeicherung, Nennung der Quelle). Das habe ich nicht geprüft [Vermutung].

## Feedback-Runde 2: Umbauplan (09.10.2026, von Alperna freigegeben)

Anlass: Rückmeldung nach dem Test aller Werkzeuge. Ausgenommen sind die Strategie-Tools des Hauptpfads (digitaler-auftritt-check, zielgruppen-segmente, icp-builder, persona, positionierung, nutzenversprechen, markenplattform, botschaften, swot, angebotsarchitektur, kundenweg, kanalstrategie, kpi-baum, budget-planer, kampagnen-planer, strategie-einseiter); sie folgen später und profitieren vorab von Modellwechsel und Visual-Kit. Zielgruppe ist KMU. Aufwand: S bis 2 Std., M etwa ½ Tag, L 1 bis 2 Tage.

**Entscheide (09.10.2026)**

1. Kein Login und kein Konto. Eine Wiederherstellung des Profils per Link an die E-Mail-Adresse steht unter «Geplant».
2. Pro Adresse genau eine Mail «neuer Lead». Weitere Ergebnisse derselben Adresse gehen nur nach Notion (P1b). Jedes Ergebnis bleibt im CRM (Zugang v3).
3. Kategorien: **Strategie, Analyse, Inhalte, Praktisches**. «KI», «Schweiz», «Content» und «Vereine» entfallen als Kategorie und als Wort. Die Slugs `content-*` werden umbenannt (301), solange noindex gilt. Zuordnung: text-umschreiber, bewertungsantwort, sponsoring-dossier zu Inhalte; textcheck und anspruchsgruppen zu Analyse; Kommunikationskonzept (bisher vereins-kommunikation) und empfehlungsprogramm zu Strategie; QR, WhatsApp, Google-Bewertung, Öffnungszeiten und Anlass zu Praktisches.
4. Rechtsformen stehen einzeln (Verein und Stiftung nicht zusammen). Ohne Auswahl gilt der neutrale KMU-Wortlaut. «Verein» bleibt als Rechtsform, nicht als Zielgruppe.
5. Design: sehr visuell, Grafiken und Bilder statt Fliesstext. Die Designregeln in CLAUDE.md dürfen dafür gelockert werden; Claude passt sie in P1c an.
6. Footer: die grosse Wortmarke «alperna» wird scharf (heute Text mit 7 % Deckkraft), der Footer wechselt von Navy zu Ink.
7. Kostendeckel: 30 Rp pro Adresse und Tag, danach das Gratismodell. Global CHF 5 pro Tag [Annahme].
8. Die Prüfung der Datenschutzerklärung ist der letzte Schritt (P4). In dieser Runde kommen keine neuen Dienstleister dazu.
9. Bildmaterial von Alperna: gezielt für Startseite, Kategorie-Köpfe und Pitch (Vertrauen), nicht als Füllbild in Ergebnissen. Ablage in `assets/photos`; Rechte und Personenbilder vorher klären.

**Kostenbasis (OpenRouter, Woche bis 09.10.2026):** 152 Anfragen, USD 0.48. Haiku 4.5: 70 Anfragen, USD 0.44, das sind 0.50 Rp je Anfrage und deckt sich mit dem Modell (0.51 Rp). GPT-4.1 mini (19) und Nemotron (38) stammen aus Messläufen. Ziel ist Haiku 5.5 (USD 0.10 und 0.50 je Million Token, ein Zehntel von Haiku 4.5). Plan-Obergrenze 0.3 Rp im Schnitt je Durchlauf und 1 Rp je Werkzeug.

**Phasen und Reihenfolge:** P0 → P1a → P1b → P1c → P2 → P3 (A, dann C, dann B) → P4.

| Phase | Inhalt | Aufwand | Prüfbar, wenn |
|---|---|---|---|
| P0 | Messlauf Haiku 5.5 gegen Haiku 4.5 und Mistral Small 4 (15 Generatoren, je 4 Läufe, `usage.cost` mitloggen); Website-Scan an 20 Schweizer KMU-Seiten; Benchmark-Quellen; Apple-Erinnerungen-Test (Alperna) | M | Tabelle Modell, Quote gültig, Rp je Aufruf; Scan-Trefferquote |
| P1a | Modellliste und `models?` je Generator; Kostenzähler (`ai:cost:<tag>`) und Tageslimit je Adresse; nie leeres oder halbes KI-Ergebnis (`finish_reason`, Mindestlänge, Fehlerkarte, kein `sendResult` bei Fehler); Regeln gegen Metasätze und erfundene Fakten; `ToolLoading` (Eingabe ausgeblendet, Balken) | L | 40 Fehlerfälle ohne leeres Ergebnis; Ø höchstens 0.3 Rp; Formular beim Laden ausgeblendet |
| P1b | Profil-Hülle mit Ablauf nach 12 Monaten und Migration; Profil-Seite entschlackt (Import unter «Sicherung»); zentrale Branchenliste `data/branchen.json`; Rechtsform-Baustein; Website-Scan mit Vorschau (`/api/profile-scan`); Gate-Wiederholung beheben; Mail nur bei neuer Adresse (`markKnown`, n8n verzweigt) | L | Profil nach 11 Monaten da, nach 13 weg; zweites Ergebnis: Notion ja, Mail nein |
| P1c | DocumentModel mit visuellen Blöcken (Kennzahl, Balken, Schritte, Karten, Raster), Export bleibt gültig; Slides, Donut, Balken, Wochenraster, ToolIcon; `ResultPitch` (Pitch aus dem Ergebnis); Pilot an posting-plan und reifegrad-check | L | Pilot von Alperna abgenommen; PDF und DOCX der DocView-Tools gültig |
| P2 | Neue Kategorien (Codemod der 47 `tool.config.ts`, Seitentexte, 301, Sitemap, Tests); Header-Mega-Menü mit Icons (Hover, Fokus, Klick; mobil Akkordeon); globaler CTA «Wir machen Marketing für dich.»; Footer; `scripts/wording-check.ts` | L | Menü per E2E; alte URLs 301; Wording-Check grün |
| P3 | Werkzeuge in drei Chargen (unten) | XL | je Werkzeug siehe Tabelle |
| P4 | Lighthouse je Seite (Performance auf Vercel), 375 px, Texte nach Lese-Vorlage, Datenschutzerklärung zur Prüfung, Live-Kostenmessung mit 50 Durchläufen, CLAUDE.md, STATUS.md | M | Ø höchstens 0.3 Rp; kein offener Punkt unten |

**P3, Charge A (Praktisches, ohne Scraping):** A1 newsletter-check: zusätzlich Modus «Nur Text» (S). A2 content-kalender («Feiertagskalender»): Vorschläge neu mit je 3 Varianten (Hook, Bildidee, Format) für 12 Branchen, Halloween, Räbeliechtli und Sechseläuten, Kantone FR, GE, JU, NE, SO, TI, VD, VS mit Quelle je Kanton, Monatsraster; kein Vorschlag mehr «Foto mit kurzem Text» (L). A3 gbp-feiertage («Öffnungszeiten»): Wochenraster und Feiertage je Kanton, ICS bleibt (M). A4 anlass-planer («Rückwärtsplaner»): neuer Name, ICS mit Erinnerung (VALARM) und «Als Liste kopieren»; VTODO nur, wenn der Apple-Test positiv ist (M). A5 whatsapp-link, qr-set, bewertungs-kit: Wortlaut KMU; beim Google-QR nur das Wort «Google», kein Logo, Hinweis auf die Google-Richtlinie (S). A6 empfehlungsprogramm: Rechenmodell mit Kundenwert über 3 Jahre, erwarteten Empfehlungen, Break-even und 3 Szenarien (M). A7 sponsoring-dossier: Felder 55 auf etwa 25, Zeitangabe 8 auf 20 Minuten, Wortlaut KMU (M).

**Stand 09.10.2026: Charge A umgesetzt (A1 bis A7), Einzelheiten in STATUS.md.** Abweichungen vom Plan: Der Feiertagskalender hat Vorschläge für sechs Branchengruppen statt zwölf; «Öffnungszeiten an Feiertagen» (`gbp-feiertage`) und «Anlass-Zeitplan» (`anlass-planer`) sind umbenannt, die Slugs bleiben; VTODO im Anlass-Zeitplan entfällt, bis der Apple-Test vorliegt; Feiertage nun für alle 26 Kantone belegt (statt der acht fehlenden), Schulferien weiter ohne FR, GE, JU, SO, VS.

**P3, Charge C (Inhalte):** C1 post-generator: «Ziel» auf etwa 10 (Follower, Verkauf, Website-Besuche, Direktnachricht, Termin, Bewerbung, Anmeldung, Teilen, Speichern, Kommentieren), neues Feld «Kategorie» (Angebot, Team, Kundenprojekt, Hinter den Kulissen, Frage, Tipp, Saison), Ausgabequalität unverändert, Regressionstest (S bis M). C2 caption-baukasten: 3 Fragen, KI macht den Rest (M). C3 medienmitteilung: Sperre für Metasätze und Füllsätze, nur Fakten aus den Angaben (M). C4 story-post: KI formuliert, doppelter Hook-Satz behoben (M). C5 posting-plan: Wochenraster und Kalenderansicht (M). C6 content-strategie, content-saeulen, testimonial: Karten, Donut, Slides (M je Werkzeug). C7 content-ideen: Gruppierung, Filter, Kartenraster; Redaktion mit Audit (Klone, Wortüberlappung, Schweiz-Bezug, heute 12 %), Ziel mindestens 50 % mit Schweiz-Bezug (L). C8 ideen-aus-website: Karten, Hinweis bei leerer Seite (S bis M). C9 bewertungsantwort: Kategorie Inhalte, Ladeansicht (S). C10 vorher-nachher und angebotsgrafik: (a) Format-Auswahl sofort sichtbar und mit einem Klick (S); (b) Zusammenführen zu einem Bild-Ersteller mit Vorlagen: Empfehlung ja, Entscheid von Alperna steht aus (L).

**P3, Charge B (KI und Auslesen, ohne neue Dienstleister):** B1 engagement-rate: Eingabe bleibt manuell, aber kürzer; Fazit «Du hast X, üblich ist Y» nur mit Quelle (siehe unten), sonst entfällt der Satz (M). B2 linkedin-profil: Headline und Info per Einfügen statt 8 Fragen und 5 Texten, Bewertung nach Regeln plus ein KI-Aufruf (M). B3 textcheck: ein KI-Aufruf, Ausgabe als Liste der Änderungen (Original, Vorschlag, Grund), jedes Original muss im Text stehen; text-umschreiber: Ladeansicht (M). B4 verzeichnisse: Angaben aus der eigenen Website plus Eingabe der Einträge, Normalisierung (079 gleich +41 79, Str. gleich Strasse, PLZ und Ort, Rechtsform), Abweichungsliste und Score; Abfrage fremder Verzeichnisse nur, wo P0 zeigt, dass es ohne Dienstleister und erlaubt geht (L). B5 reifegrad-check: Titel «Wie gut ist dein Marketing aufgestellt?», höchstens 6 Fragen, Rest aus dem Website-Scan (M). B7 anspruchsgruppen: 6 bis 8 Fragen, KI schlägt Gruppen mit Einfluss und Interesse vor, Matrix-SVG bleibt, Rechtsform-Auswahl (L). B8 vereins-kommunikation, neu «Kommunikationskonzept»: Wortlaut KMU, Website-Scan, Pitch nach Ergebnis (Budget und Kanäle zu Social-Media-Betreuung) (M).

**Benchmarks für B1 (P0, 09.10.2026):** Die veröffentlichten Quellen widersprechen sich, weil die Formel verschieden ist: Instagram 0.48 % (Socialinsider, 2025), 1.81 % (SociaVault, Median 2026), 3.5 % (Hootsuite, 2026). Das Werkzeug rechnet nach zwei Formeln (auf Follower und auf Reichweite). «Üblich ist Y» erscheint nur mit einer Quelle, deren Formel zur gewählten Formel passt, mit dem Hinweis «international, nicht Schweiz» und der Quelle in `data/engagement-benchmarks.json` (`meta {source, url, asOf}`). Formel der Quelle vor dem Bau prüfen.

**Geplant, nicht in dieser Runde (geht heute nicht oder braucht einen Entscheid):**

- Mitbewerber-Suche (B6): braucht eine Such-API (etwa 0.5 bis 1.3 Rp je Durchlauf) und eine Auswahl nur aus echten Treffern. Die KI darf keine Mitbewerber erfinden.
- Instagram automatisch auslesen (Handle zu Follower und letzten 5 Beiträgen): nur über einen Dienst wie Apify, im Graubereich der Meta-Bedingungen; Insights (Reichweite, Saves) sind ohne Login des Kontoinhabers nicht zu bekommen.
- LinkedIn-Profil per Handle auslesen: Authwall (HTTP 999) und Nutzungsbedingungen. Ersatz: Einfügen von Headline und Info (B2).
- Abfrage fremder Verzeichnisse über Drittanbieter, Google Places API (Kosten).
- Wiederherstellung des Profils per Link an die E-Mail-Adresse (braucht Speicher beim Server, also eine Änderung von Regel 1 und der Datenschutzerklärung).
- Gewerbeverein-Report als Vertriebskanal (kein Teil dieses Umbaus).

**Offen bei Alperna:** Ordner mit dem Bildmaterial und die Rechte daran; Entscheid zu C10b (Bild-Ersteller); Freigabe der Pitch-Varianten je Bedingung (Claude entwirft); Original-Vektordatei der Wortmarke, falls vorhanden; einmal `OPENROUTER_MODELS` auf Haiku 5.5 an erster Stelle setzen (für den Messlauf in P0).

**Feedback-Punkt zu Phase** (nichts darf verloren gehen): Visuell P1c, P2, P3 · Profil einmal fragen, Scan, 1 Jahr, Import, Profil-Seite P1b · Branchenliste P1b · Rechtsform P1b, B7 · E-Mail einmal, Mail nur bei neuer Adresse P1b · Ladezustand P1a, P3 · nie leeres KI-Ergebnis P1a · Pitch nach Ergebnis P1c, B8 · Eingaben minimieren P1b, P3 · Kostenkontrolle P0, P1a, P4 · KI nur aus Angaben P1a, C3 · Hover-Menü, KI-Kategorie, Schweiz, Content, Verein, CTA, Footer, Navy P2 · Mein-Profil P1b, P2 · Tools wie in den Chargen A, B, C; Mitbewerber-Check (B6) steht unter «Geplant».

## Nächster Schritt

Stand 09.10.2026: Umbauplan oben freigegeben, P0 läuft. Stand der Etappen davor, 04.10.2026 (spät): Etappe 1c, Etappe 2 (KI über Mistral direkt) und Zugang v3 sind gebaut; Textcheck und Text-Umschreiber aus Etappe 3 beziehungsweise 6 ebenfalls. Dazu der **Generator-Baustein** (`/api/generate`, `lib/generator.ts`, `useGenerator`, `DocView`) und **Website lesen** (`/api/read`), damit Werkzeuge der Klasse B aus Angaben und Website-Text einen geprüften Entwurf machen. Die Bauanleitung je Werkzeug steht in `docs/TOOL-BAUEN.md`.

Die Etappen 3 bis 6 werden in **Wellen** gebaut (je Welle vier Werkzeuge parallel durch Helfer-Agenten nach `docs/TOOL-BAUEN.md`, danach Registrierung, `npm run check`, Browser-Test, Lighthouse, Commit `feat(tool): …` je Werkzeug):

| Welle | Werkzeuge | Klasse |
|---|---|---|
| 1 (Etappe 3) | reifegrad-check, wettbewerbsvergleich, newsletter-check, ideen-aus-website | A (Fragebogen, Check-Engine, Regeln im Browser, Website + Generator) |
| 2 (Etappe 4) | icp-builder, persona, positionierung, nutzenversprechen | B (Generator aus Profil und Angaben; positionierung liest die Website) |
| 3 (Etappe 4) | markenplattform, botschaften, swot, strategie-einseiter | B (strategie-einseiter fasst die Ergebnisse der anderen aus dem Browser zusammen) |
| 4 (Etappe 5) | whatsapp-link, qr-set, bewertungs-kit, budget-planer | C (Rechner, QR, ZIP; Budget nur mit Richtwerten, die eine Quelle haben, sonst Verteilung der eigenen Zahl) |
| 5 (Etappe 5/6) | gbp-feiertage, content-kalender, content-saeulen, content-ideen | C/B (Feiertage und Schulferien brauchen `data/*.json` mit Quelle je Kanton; ohne Quelle entfällt der Kanton) |
| 6 (Etappe 6) | caption-baukasten, medienmitteilung, bewertungsantwort, post-generator | B |
| 7 (Etappe 6, Vereine) | anspruchsgruppen, vereins-kommunikation, sponsoring-dossier, empfehlungsprogramm | B/C mit Vereins-Begriffen (`audience: verein`), Beispiel «FC Trogen» |
| 8 (Etappe 5/6, 05.10.2026) | engagement-rate, kpi-baum, angebotsarchitektur, anlass-planer | C (Rechner und Planer ohne Server und KI; Quoten, Faustregeln und Vorlagen gekennzeichnet) |
| 9 (Etappe 5/6, 05.10.2026) | story-post, posting-plan, kundenweg, kampagnen-planer | C (Planer ohne Server und KI; Annahmen gekennzeichnet; PDF quer und Tabellenkopf im gemeinsamen Export) |
| 10 (Etappe 5/6, 05.10.2026) | angebotsgrafik, vorher-nachher, zielgruppen-segmente, linkedin-profil | C (Canvas-Grafiken im Browser mit PNG-Baustein; Matrix als SVG; Selbsteinschätzung mit Richtwerten von Alperna; Strategie-Pfad neu nummeriert) |
| 11 (Etappe 5/6, 05.10.2026) | kanalstrategie, content-strategie, testimonial, verzeichnisse | C ohne Prozentzahlen (kanalstrategie), B Generator (content-strategie), C mit Datensatz und Quelle je Eintrag (verzeichnisse), C mit wörtlichem Zitat (testimonial) |

Verschoben, weil eine Voraussetzung fehlt: gbp-check (Places-Schlüssel mit Zahlungsmittel), impressum, datenschutz, gewinnspiel-check, uwg-mailcheck (`content/legal/`: Entwürfe liegen seit dem 05.10.2026 vor, die Freigabe durch einen Menschen fehlt, Regel 8), keywords-lokal (Quelle der Suchvorschläge offen), marktpotenzial und bevoelkerung-nahe Werkzeuge (BFS-Daten noch nicht im Repo), angebotsgrafik und vorher-nachher (PNG-Erzeugung, eigener Baustein).

Voraussetzungen von Alperna: keine für den Bau. Für die Produktion: `MISTRAL_API_KEY` (gesetzt), Upstash verbunden (gesetzt), Datenschutzerklärung mit dem Stand aus `docs/DATENSCHUTZ-FAKTEN.md`.
