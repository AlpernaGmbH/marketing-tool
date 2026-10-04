# Ideen aus deiner Website (ideen-aus-website)

Klasse A/B (liest die Website, dann KI; braucht den Server), Stand 04.10.2026. Erstes Werkzeug mit dem Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`). Die Website liest `/api/read` (`lib/read.ts`). `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die nicht wissen, worüber sie posten sollen: in rund drei Minuten acht bis zwölf Ideen für Beiträge aus dem Text der eigenen Startseite, je mit Kanal, Format, Inhalt und erstem Satz, dazu drei Themen, die die Website hergibt.

## Kategorie und Verknüpfung
Kategorie: content (dritter Schritt im Pfad «Content», nach Textcheck und Text-Umschreiber), Zielgruppe: kmu
Liest aus Profil: firma, website, ort, branche (Grunddaten über `ProfileFieldsForm`; Branche als Textfeld auf `profile.branche`)
Schreibt ins Profil: nichts über `writesProfile`. Die Grunddaten-Felder (Firma, Website, Ort, Branche) schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: text-umschreiber (erster Satz in einen Stil bringen), textcheck, digitaler-auftritt-check
`needsServer: true`: die Website geht an `/api/read`, die Angaben und der Text an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Ideen finden» prüft das Werkzeug die Eingaben, dann `ctx.ensureEmail()`. Erst danach läuft Schritt 1 (`readWebsite`) und Schritt 2 (`useGenerator.generate`).
- **403 «gate»:** Bei `/api/read` ruft das Werkzeug `ctx.renewEmail()` und wiederholt einmal; bei `/api/generate` macht das `useGenerator` selbst.
- **Jedes Ergebnis geht ins CRM:** `useGenerator` ruft `ctx.sendResult({ eingabe, ausgabe })`. Eingabe = Website, Betrieb, Branche, Ort, Kanäle, Titel und Überschriften der Startseite (`eingabeText`, nicht der ganze Text). Ausgabe = das Dokument als Markdown (`reportMarkdown`).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`).
- Kein Limit pro Person; Schutz sind 10 Abrufe pro Stunde und IP-Hash (`/api/read`), 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | nein | Profil `firma` | max. 120 Zeichen an die KI; leer: der Host der Website gilt als Betrieb | – |
| Website | text (`ProfileFieldsForm`) | ja | Profil `website` | `looksLikeWebsite`: Host mit Punkt, ohne Leerzeichen, nur http/https; der Server prüft mit `normalizeUrl` noch einmal (keine IP, keine Zugangsdaten, kein internes Netz) | «Firma, Website, Ort und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 Zeichen | – |
| Branche | text | nein | Profil `branche` | max. 120 Zeichen | «Zum Beispiel Malerei, Treuhand oder Physiotherapie.» |
| Kanäle | multi (Checkboxen Instagram, LinkedIn, Google-Beitrag, Newsletter, Website-Beitrag) | mindestens einer | gespeicherter Stand, sonst alle fünf | `KANAL_KEYS` | «Die Ideen verteilen sich auf die gewählten Kanäle.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort und der Text der Startseite (bis 8'000 Zeichen), nicht die E-Mail-Adresse; «Gib keine Website mit vertraulichen Inhalten an.»

## Logik
1. **Eingabe prüfen** (`inputProblem`): Website leer → Meldung; Website sieht nicht nach einer Adresse aus → Meldung; kein Kanal → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers.
2. **Adresse sicherstellen:** `ctx.ensureEmail()`; bei «Später» passiert nichts weiter.
3. **Schritt 1 «Website lesen»** (`readWebsite(website)` aus `lib/read-client.ts`): `/api/read` liefert `PageRead` (url, host, title, description, headings bis 20, text bis 8'000 Zeichen, truncated). Bei `reason === "gate"`: `renewEmail()` und einmal wiederholen. Jeder andere Fehler zeigt die Meldung aus dem Ergebnis (`message`), zum Beispiel «Die Website konnte nicht geladen werden. Stimmt die Adresse?».
4. **Eingabe für die KI** (`toInput`): betrieb = Firma aus dem Profil, sonst der Host; branche, ort; kanaele in fester Reihenfolge ohne Doppel; host, title (≤ 200), description (≤ 400), headings (≤ 20 à 200), text (≤ 8'000). Whitespace bereinigt. Schema `ideenInput` (zod) im Browser und in der Route.
5. **Schritt 2 «Ideen schreiben»** (`useGenerator(ideenGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` (Alperna-Stimme, nichts erfinden, Platzhalter, nur JSON) plus die `instruction` des Generators (Aufgabe: Ideen für Beiträge eines Schweizer KMU aus dem Text seiner Website, nur die gewählten Kanäle, jede Idee aus einem konkreten Inhalt der Website, kein Fachchinesisch, Schweizer Bezug, lokale Anlässe als Platzhalter; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben und Text der Website", input)`. `maxTokens` 1'600, `temperature` 0.5.
6. **Prüfung der Antwort** (`checkGenerated` in der Route und Schema im Browser): JSON, Schema `ideenOutput` (themen: genau 3 Strings 5 bis 80 Zeichen; ideen: 8 bis 12 mit titel 5..80, kanal aus den fünf Schlüsseln, format aus foto, reel, text, story, karussell, kurzvideo, worum 40..300, hook 10..160), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkIdeen`: jede Zahl in titel, worum, hook und themen muss in den Angaben stehen (Betrieb, Branche, Ort, Host, Titel, Beschreibung, Überschriften, Text; `numbersIn` wie beim Text-Umschreiber: Listenmarken fallen weg, Trennzeichen in Zahlen auch) → sonst «zahl»; jede Idee nur für gewählte Kanäle → sonst «kanal». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («drei Tipps») sind erlaubt, nur Ziffern werden geprüft (wie beim Text-Umschreiber).
7. **Stand speichern** (`mt:ideen-aus-website`): `{ v: 1, website, kanaele, page: { host, title, headings }, output }`. Nicht der Text der Seite. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten den leeren Stand (alle Kanäle gewählt, kein Ergebnis); ein kaputtes `output` fällt weg, der Rest bleibt.
8. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown`).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Ideen» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Quelle («Aus der Startseite von malerei-keller.ch»), der Liste der Platzhalter (`placeholdersIn`), den Ideen als Karten (Nummer, Titel, Kanal und Format, worum es geht, erster Satz) und dem Block «Themen auf deiner Website».
- Dokument (`toDocument`): Titel «Ideen aus deiner Website», Untertitel mit Host, Facts Website und Kanäle, KI-Hinweis, «Themen auf deiner Website» als Liste, «n Ideen für Beiträge» mit je einer Überschrift «n. Titel (Kanal, Format)», einem Absatz «worum» und einem Absatz «Erster Satz: «hook»». Dateiname `ideen-<host>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown aus `toDocument`, PDF, Word) und «Neu beginnen» (löscht Ergebnis und Seitenauszug, behält Website und Kanäle).
- Fortschritt mit `role="status"`: zwei Schritte «Website lesen», «Ideen schreiben» mit Zustand.
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Website leer, ohne Punkt, mit Leerzeichen, mit anderem Schema (ftp): Meldung im Werkzeug, kein Aufruf. Der Server lehnt IP-Adressen, interne Netze und Zugangsdaten ab (400, Meldung aus der Antwort).
- Kein Kanal gewählt: Meldung. Alle fünf gewählt: erlaubt, die KI verteilt.
- Firma leer: der Host gilt als Betrieb. Profil ganz leer: Website muss getippt werden; Branche und Ort bleiben leer und gehen leer an die KI.
- Startseite ohne Text (nur Bilder): die KI bekommt Titel und Host; das Ergebnis ist dünn oder wird verworfen (zu wenig Inhalt für zwölf Ideen). Die Seite empfiehlt Text auf der Startseite.
- Text länger als 8'000 Zeichen: der Server kürzt, `toInput` kürzt noch einmal (Schema).
- Antwort mit Zahl, die nicht auf der Website steht, oder mit nicht gewähltem Kanal: verworfen, Meldung, kein CRM-Eintrag.
- Platzhalter «[Anlass in deiner Gemeinde]»: erlaubt, Liste über den Karten.
- Cookie fehlt (403 bei /api/read oder /api/generate): Fenster, einmal wiederholen.
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz, Stand bleibt.
- Gespeicherter Stand kaputt, falsche Version, unbekannte Kanäle: leerer Stand bzw. nur bekannte Kanäle; leere Kanalliste bleibt leer (die Meldung führt zur Auswahl).
- Websites mit Umlaut-Domain: `looksLikeWebsite` erlaubt Umlaute, die URL-Klasse im Server wandelt sie um.

## Texte
- Tagline: «Aus dem Text deiner Startseite werden 8 bis 12 Ideen für Beiträge, mit Kanal, Format und erstem Satz.»
- SEO-Title: «Content-Ideen aus deiner Website für Schweizer KMU»; Meta-Description in `content/tools/ideen-aus-website.md`.
- Keyword «Content-Ideen»: im Title und drei Mal im Text. Die H1 ist mit «Ideen aus deiner Website für Schweizer KMU» vorgegeben und enthält das Keyword nicht wörtlich (Entscheid des Hauptagenten).
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit fünf von Hand geschriebenen Beispiel-Ideen, als Beispiel gekennzeichnet), FAQ (7) und Alperna-Satz (Baustein Social Media): `content/tools/ideen-aus-website.md`.

## Tests
`tools/ideen-aus-website/generator.test.ts` (Schemas mit Grenzen, `numbersIn`, `checkIdeen` verwirft fremde Zahlen und falsche Kanäle und lässt Platzhalter durch, `checkGenerated` mit gültiger und ungültiger Antwort, Prompt ohne Eingaben in der Anweisung) und `logic.test.ts` (`toInput` kürzt und ergänzt, `inputProblem`, `looksLikeWebsite`, `toDocument` enthält jede Idee, `reportMarkdown`, `eingabeText`, `parseState` bei kaputten Daten, Kanal-Liste). Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Mehrere Seiten lesen (Unterseiten, Blog): nur die eine Adresse, die die Person angibt.
- Fertige Beiträge: nur Idee, Format und erster Satz; den Text macht der Text-Umschreiber.
- Redaktionsplan mit Daten, Feiertagen oder Schulferien: später ein eigenes Werkzeug (IDEAS.md).
- Facebook und TikTok als Kanäle: bewusst weggelassen, die Instagram-Ideen passen dort meist.
- Bilder oder Videos erzeugen.
- Rechtsaussagen (Regel 8): keine.
