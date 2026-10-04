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
| icp-builder, persona, nutzenversprechen, markenplattform, botschaften, swot, kampagnen-planer, kpi-baum, customer-journey, strategie-einseiter | B | Entwurf aus Profil und Check-Ergebnis; Besucher bestätigt oder korrigiert statt bei null zu beginnen |
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
5. **KI-Schicht** (`/api/ai`, Gemini): bekommt nur das Fakten-JSON. Ausgabe: Zusammenfassung und Massnahmen, jede mit Verweis auf mindestens eine Fakt-ID. Eine Prüfung verwirft Massnahmen ohne Verweis und Texte mit Zahlen, die nicht in den Fakten stehen. Danach `typoCH`. Fällt die KI aus, bleibt das Fakten-Ergebnis stehen.
6. **Profil-Autofill:** Ein Check schreibt Branche, Ort, Kanäle und Tonalitäts-Hinweise ins Firmenprofil. Alle weiteren Tools starten vorbefüllt (Regel 10).
7. **Schutz:** Zugriffe auf private Adressen blocken (in der Engine vorhanden), Grösse und Zeit begrenzen, Rate-Limit über Upstash statt im Arbeitsspeicher (Serverless teilt keinen Speicher), robots.txt bei Fremdseiten (Wettbewerb) beachten, Kennung im User-Agent.

## Etappen v2

| Etappe | Inhalt | Voraussetzung |
|---|---|---|
| **1c** | Marketing-Check mit Crawler (Engine-Port, Schritte, Zwischenspeicher, Ergebnisansicht im neuen Design, Export PDF/Word). Ersetzt den Fragebogen. Profil-Autofill. Ohne KI. | Zugriff auf `AlpernaGmbH/tool` (ist da); optional Places-Schlüssel |
| **2** | Zugang v2 (siehe unten), `/api/ai` mit Gemini, KI-Auswertung im Marketing-Check, Tageskontingente | Entscheid Konto, Gemini-Schlüssel, Upstash |
| **3** | Klasse A: gbp-check, wettbewerbsvergleich, newsletter-check, textcheck, reifegrad-check, ideen-aus-website | Places-Schlüssel |
| **4** | Klasse B Strategie und Marke: icp-builder, persona, positionierung, markenplattform, botschaften, nutzenversprechen, swot, strategie-einseiter | Etappe 2 |
| **5** | Klasse C und Rechts-Tools: whatsapp-link, qr-set, bewertungs-kit, Feiertage, Budget, Kalender, Impressum, Datenschutz, Gewinnspiel, UWG-Mailcheck | `content/legal/` von Menschen |
| **6** | Klasse B Content und Vereine | Etappe 2 |
| **7** | Launch: DNS, Rechtsseiten, Umami, Search Console, Lighthouse-Tabelle | alles Obige |

Reihenfolge neu: **Analyse zuerst.** Sie zeigt, was Alperna kann, liefert das Profil für alle Generatoren und ist der stärkste Einstieg für Leads. Die Strategie-Werkstatt (alt Etappe 2 und 3) folgt danach und baut auf dem Profil auf.

## Zugang v2: Entwurf, wartet auf Entscheid

**Befund.** IP-Hash plus Cookie ist als Schranke schwach und zugleich ungerecht. Der Bauplan nennt die Grenzen selbst: Büro- und Mobilfunk-IPs teilen sich den freien Durchlauf, und wer Browser oder Netz wechselt, bekommt einen neuen. Für Werkzeuge ohne Kosten ist das tragbar. Bei Crawling und KI kostet jeder Aufruf Geld und Rechenzeit, und die Sperre lässt sich mit einem Browserwechsel umgehen.

**Vorschlag: Hybrid mit E-Mail-Bestätigung, ohne Passwort.**

- Der erste Durchlauf bleibt frei und ohne Konto (Einstieg über Suchmaschinen).
- Wer weitermacht, bestätigt seine E-Mail mit einem Link oder Code. Das ersetzt das heutige Formular und macht den Lead echt (heute genügt «a@b.ch»).
- Mit bestätigter E-Mail: alle Werkzeuge, Downloads, Tageskontingente pro Person, Freischaltung auf allen Geräten.
- KI- und Crawl-Werkzeuge nur mit bestätigter E-Mail, Kontingent pro Person und global.
- Die IP bleibt als Rate-Limit gegen Missbrauch, nicht als Tür.
- Das Firmenprofil bleibt im Browser (Regel 1). «Im Konto speichern» wäre eine spätere, freiwillige Funktion.

**Technik.** Magic-Link als signiertes Token (HMAC, 15 Minuten), Sitzung als signiertes Cookie, Konten und Kontingente in Upstash Redis, Versand der Mail über n8n und Gmail (vorhanden, kein neuer Anbieter). Supabase wäre die Alternative, wenn gespeicherte Ergebnisse und Verlauf wichtig werden; es kostet einen weiteren Dienst, eine Datenbank und eigenen SMTP.

**Folgen.** CLAUDE.md (Zugangsmodell, «kein Login»), Datenschutzerklärung (E-Mail wird serverseitig gespeichert, Löschfunktion nötig), Texte mit «ohne Konto» und «kein Konto nötig», TrustLine.

**Risiko.** Jede Hürde vor dem zweiten Werkzeug senkt die Zahl der Leads. Wie stark, ist eine Vermutung; messbar erst nach dem Start (Umami: Anteil, der das Formular schliesst).

## Kosten pro Aufruf (Stand 04.10.2026, mit Quelle)

- Gemini 2.5 Flash, bezahlt: USD 0.30 je Million Eingabe-Tokens und USD 2.50 je Million Ausgabe-Tokens (Quelle: ai.google.dev/gemini-api/docs/pricing). Ein Check mit 8'000 Tokens Eingabe und 2'000 Tokens Ausgabe kostet nach dieser Rechnung rund USD 0.007.
- Gemini Free Tier: kein Fundament. Ein Forum-Beitrag meldet eine Kürzung auf 20 Anfragen pro Tag; offiziell bestätigt habe ich das nicht. Die offizielle Seite nennt keine Zahl im Auszug.
- Places API (New): Gratisgrenze pro Monat je Abfrageart, zum Beispiel 5'000 für Text Search Pro und 10'000 für Place Details Essentials; darüber USD 17 bis 32 je 1'000 Aufrufe (Quelle: developers.google.com/maps/billing-and-pricing/pricing). Ein Google-Cloud-Konto mit Zahlungsmittel ist nötig.

## Nächster Schritt

Etappe 1c, sobald der Zugriff auf die Engine bestätigt ist (er ist es) und du die offenen Fragen in STATUS.md beantwortet hast. Der Zugang v2 wird erst gebaut, wenn du den Entwurf bestätigst.
