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

## Zugang v2 (entschieden am 04.10.2026)

**Entscheid von Alperna:** Ein Durchlauf pro Werkzeug ist frei. Danach erscheint ein Fenster, in dem man kurz ein Konto erstellt, mit Google, Apple und weiteren Anbietern.

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
2. KI nur für angemeldete Personen, nie für den freien ersten Durchlauf.
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

## Wofür die Google Cloud gebraucht wird

Du brauchst sie **nicht für die KI**. Es sind zwei andere Dinge:

1. **«Mit Google anmelden»** (Etappe 2): ein OAuth-Zugang. Kostenlos, kein Zahlungsmittel nötig. Das ist der Grund, warum jetzt eines gebraucht wird.
2. **Google-Profil prüfen** im Marketing-Check (Etappe 3, optional): Places API. Dafür braucht es ein Zahlungsmittel im Konto; pro Monat gibt es Gratis-Kontingente (zum Beispiel 5'000 Textsuchen und 10'000 Detailabfragen, darüber USD 17 bis 32 je 1'000 Aufrufe; Quelle: developers.google.com/maps/billing-and-pricing/pricing). Ohne diesen Schlüssel meldet der Check beim Google-Profil «nicht prüfbar».

## Nächster Schritt

Etappe 1c ist gebaut (04.10.2026): Marketing-Check mit Crawler, ohne KI und ohne Konto, gleiche Bewertung wie das Agentur-Tool. Als Nächstes Etappe 2: Zugang v2 und KI. Voraussetzungen von Alperna: Upstash mit dem Projekt verbunden, Google-OAuth-Zugang (Schritte in STATUS.md). Für die KI braucht es nichts: Vercel AI Gateway läuft im vorhandenen Team.
