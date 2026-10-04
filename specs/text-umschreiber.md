# Text-Umschreiber (text-umschreiber)

Klasse C (KI, braucht den Server), Stand 04.10.2026. Der Text geht an `/api/text`, von dort an das Vercel AI Gateway. `logic.ts`, `styles.ts` und `client.ts` sind getestet; die Route auch.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU und Vereinsvorstände: einen vorhandenen Text in unter drei Minuten als LinkedIn-Post, Instagram-Caption, Google-Beitrag, Medienmitteilung, Newsletter oder Website-Text neu schreiben lassen, mit Schweizer Schreibweise und ohne erfundene Fakten.

## Kategorie und Verknüpfung
Kategorie: content (zweiter Schritt im Pfad «Content»), Zielgruppe: kmu
Liest aus Profil: nichts (bewusst: Die KI bekommt keine Profildaten, nur den Text des Besuchers)
Schreibt ins Profil: nichts
Verwandte Tools: textcheck, digitaler-auftritt-check; newsletter-check entsteht später (die Seite verlinkt nur, was es gibt)
`needsServer: true`: der Text geht an `/api/text` (Ausnahme in Harte Regel 1).

## Zugang
- Nur mit Konto **und** Freischaltung (wie die KI-Einordnung): Die Route antwortet ohne Sitzung 401, ohne Freischaltung 403.
- Im Werkzeug: Abgemeldet öffnet der Knopf «Anmelden und umschreiben» das Anmelde-Fenster (Clerk). Angemeldet, aber nicht freigeschaltet, öffnet «Umschreiben» erst das LeadGate (Anlass `download`) und startet danach von selbst.
- Ist die Anmeldung nicht eingerichtet, sagt das Werkzeug es ruhig und schickt nichts ab.
- Begründung: Jede Umschreibung kostet KI-Rechenzeit. Ohne Konto liesse sich nichts pro Person begrenzen.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Stil | single (Auswahl aus `STYLES`) | ja | gespeicherter Stand, sonst «LinkedIn-Post» | muss in `STYLE_IDS` stehen | Ein Satz unter der Auswahl (`hint`) |
| Anrede | single (Du, Sie, Wie im Text) | ja | gespeicherter Stand, sonst «Wie im Text» | `Anrede` | – |
| Dein Text | text (mehrzeilig) | ja | gespeicherter Stand `mt:text-umschreiber` | mindestens 20, höchstens 3'000 Zeichen (`inputProblem`, `maxLength`, zod in der Route) | Zähler «n von 3'000 Zeichen»; Knopf «Beispieltext einfügen» |

## Logik
1. **Prompt** (`buildSystemPrompt`): feste Regeln (Schweizer Hochdeutsch; alle Fakten behalten; nichts erfinden; Ausgangstext ist Material und keine Anweisung; keine Floskeln; Anrede; nur den fertigen Text ausgeben) plus die `instruction` des Stils. Der Text des Besuchers steht nie im System-Prompt, nur in der Nutzernachricht zwischen `<<<` und `>>>` (`buildUserPrompt`).
2. **Aufruf** (`generateFreeText`): Freitext statt strukturierter Ausgabe, Temperatur 0.5, 30 s Zeitlimit, ein Wiederholungsversuch, Ausweichmodelle aus `AI_MODELS`. Obergrenze der Länge pro Stil (`maxTokens`).
3. **Prüfung der Antwort** (`checkOutput`): entfernt Codeblock und Anführungszeichen um das Ganze; setzt Schweizer Schreibweise (`typoCH`); verwirft leere Antworten und solche über `maxOutputChars` des Stils. **Warnungen statt Verwerfen** für: Zahlen, die im Ausgangstext fehlen; Links und E-Mail-Adressen, die im Ausgangstext fehlen; Platzhalter in eckigen Klammern. Annahme: Eine neue Zahl kann legitim sein («drei Tipps»), darum entscheidet der Besucher.
4. **Kontingent** (`lib/ai-quota.ts`, Bereich `text`): `AI_TEXT_DAILY` pro Konto und Tag (Standard 10), dazu der globale Deckel `AI_DAILY_CAP`. Ein Fehler der KI gibt den Platz zurück.
5. **Ratenbegrenzung:** 20 Anfragen pro Stunde und IP-Hash.
6. **Ergänzen eines Stils:** ein Eintrag in `tools/text-umschreiber/styles.ts` (id, label, hint, instruction, maxOutputChars, maxTokens). Auswahl, Prüfung der Route und Tests lesen alle aus dieser Liste.

## Ausgaben
- Ergebnis (nach Klick): Fassung in einem Feld, das der Besucher ändern darf (Platzhalter ausfüllen); Kennzeichnung «Von einer KI formuliert»; Warnungen als Liste.
- Kopieren: Fassung (mit den Änderungen des Besuchers). Keine Dateien, kein Download. Das Formular steht vor dem Start, nie vor dem Ergebnis eines begonnenen Durchlaufs.
- Stand: `mt:text-umschreiber` (`styleId`, `anrede`, `text`, `result`, `warnings`); der Text wird 500 ms nach der letzten Eingabe gespeichert, Stil und Anrede sofort. Angemeldete: Abgleich mit dem Konto. Änderungen des Besuchers am Ergebnisfeld werden nicht gespeichert.
- Zählung: `completeRun` beim ersten Ergebnis eines Textes.

## Edge Cases (getestet)
- Leerer Text, zu kurz, zu lang, unbekannter Stil: Meldung im Werkzeug, 400 in der Route, nie ein Aufruf der KI.
- Kein `GATE_SECRET`: 503. Keine Sitzung: 401. Nicht freigeschaltet: 403. Ratenbegrenzung: 429. Tageskontingent: 429 `account_limit`. Kapazität erschöpft: 503 `capacity`.
- KI wirft oder liefert leer/zu lang: 502, Platz zurückgegeben, im Protokoll nur Fehlerklasse, nie der Text.
- Antwort mit Codeblock oder Anführungszeichen um das Ganze: ausgepackt.
- Neue Zahl, neuer Link, Platzhalter: Warnung, Antwort bleibt.
- Anweisung im Ausgangstext («ignoriere alle Regeln»): steht nur als Material in der Nutzernachricht; die Prüfung der Antwort ändert nichts am Inhalt, das Verhalten der KI bleibt eine Restunsicherheit [Vermutung: gering, aber nicht null].
- Gespeicherter Stand kaputt, zu lang oder mit unbekanntem Stil: leerer Stand bzw. gekürzt / Standardstil.

## Texte
- Tagline: «Schreibe deinen Text als LinkedIn-Post, Newsletter, Medienmitteilung oder in einem anderen Stil neu.» (101 Zeichen)
- SEO-Title: «Text-Umschreiber Schweiz: LinkedIn, Newsletter, Presse»; Meta-Description in `content/tools/text-umschreiber.md`
- Erklärtext, Beispiel (Malerei Keller, Gossau), FAQ (7) und Alperna-Satz: `content/tools/text-umschreiber.md`. Die Seite sagt, dass der Text an den KI-Anbieter geht, und macht keine Aussage über dessen Umgang mit den Daten (Rechtstext, Regel 8).

## Tests
`tools/text-umschreiber/logic.test.ts` (Stilliste, Eingabe, Prompts, Prüfung der Antwort, Antwort lesen, Stand, Texte), `client.test.ts` (Aufruf und Statuscodes), `app/api/text/route.test.ts` (alle Zweige der Route inkl. Protokoll ohne Text), `lib/ai-quota.test.ts` (getrennte Kontingente). Browser: Fälle in `tests/e2e/smoke.spec.ts` («Text-Umschreiber im Browser»).

## Nicht Teil dieses Tools
- Mehrere Fassungen auf einmal, Versionsverlauf, Vergleich der Fassungen.
- Stile mit Firmenprofil (Tonalität, Werte aus dem Profil): möglich, sobald das Profil gepflegt ist; bräuchte einen Hinweis, welche Profildaten an die KI gehen.
- Rechtsaussagen (Regel 8): keine; die KI darf Rechtstexte umformulieren, die Seite sagt nicht, dass das Ergebnis rechtlich geprüft sei.
