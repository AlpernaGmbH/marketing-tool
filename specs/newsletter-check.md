# Newsletter-Check (newsletter-check)

Klasse A (Analyse, regelbasiert), Stand 04.10.2026. Läuft vollständig im Browser; `logic.ts` ist rein und getestet. Kein Server, keine KI (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM.

## Nutzen in einem Satz
Für KMU und Vereine, die einen Newsletter verschicken: Betreff, Absender und Text einfügen und in unter einer Minute sehen, was vor dem Versand fehlt oder stört, mit Punktzahl von 0 bis 100 und je Fund einem Hinweis.

## Kategorie und Verknüpfung
Kategorie: analyse (dritter Schritt im Pfad «Analyse»), Zielgruppe: beide
Liest aus Profil: nichts
Schreibt ins Profil: nichts
Verwandte Tools: textcheck, text-umschreiber, digitaler-auftritt-check

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Betreff | text (einzeilig) | nein | gespeicherter Stand `mt:newsletter-check` | höchstens 300 Zeichen | Zähler «n Zeichen, Richtwert 30 bis 60» |
| Absendername | text (einzeilig) | nein | gespeicherter Stand | höchstens 120 Zeichen | «So, wie er im Postfach steht. Leer lassen, wenn er im Text steht.» |
| Dein Newsletter | text (mehrzeilig) | ja | gespeicherter Stand | mindestens ein Wort im sichtbaren Text; höchstens 20'000 Zeichen (`maxLength` und `inputProblem`); HTML ohne lesbaren Text wird mit eigener Meldung abgelehnt | Zähler «n von 20'000 Zeichen. Reiner Text oder HTML-Quelltext.»; Knopf «Beispiel einfügen» (Malerei Keller, Gossau) |

## Logik
Alle Regeln in `tools/newsletter-check/logic.ts`. Jeder Prüfpunkt hat ein Gewicht `w` und einen Anteil `pass` zwischen 0 und 1; erfüllt heisst `pass = 1`. Punktzahl = runden(100 × Σ(w × pass) / Σ w). Prüfpunkte, die nicht anwendbar sind (Bilder ohne HTML), fehlen in Zähler und Nenner. Dadurch ist die Punktzahl monoton: ein zusätzlicher Fund senkt sie oder hält sie (Test).

0. **Text gewinnen.** `isHtml` erkennt HTML an typischen Tags (`<p`, `<table`, `<a`, `</td>` …; «Preis < 100» ist kein HTML). Bei HTML: erster `head`-Block weg (Titel, Stile), Blockgrenzen (`br`, `p`, `td`, `li`, `h1`–`h6` …) werden markiert, dann `textOf` aus `lib/check/html.ts` (entfernt Skripte, Stile, Tags, Entitäten), die Marken werden zu Zeilenumbrüchen. Bei reinem Text: nur Zeilenenden vereinheitlicht. Auf dem sichtbaren Text läuft `analyzeText` aus `tools/textcheck/logic.ts` (Wörter, Sätze, Lesbarkeit nach Amstad, Fehler, Schreibweise, Floskeln, lange Sätze), nichts davon ist neu gebaut.
1. **Betreff** (`betreff`, w 14): leer → 0; Länge unter 30 oder über 60 Zeichen → 0,5; sonst 1. **Annahme:** 30 bis 60 Zeichen ist ein Richtwert von Alperna, keine Statistik; so im UI, im Bericht und im Seitentext gekennzeichnet.
2. **Absender** (`absender`, w 8): Feld ausgefüllt → 1. Sonst Signatur in den letzten 600 Zeichen: Grussformel («Freundliche Grüsse», «Liebe Grüsse», «Bis bald und liebe Grüsse» …) mit Name auf derselben oder der nächsten Zeile, oder Rechtsform (GmbH, AG, Sàrl, SA, Genossenschaft, Stiftung, Verein, KlG, KmG) mit vorangehendem Namen, oder «Dein Team …» / «Team …» → 1 mit Angabe, was erkannt wurde. Sonst 0.
3. **Anrede** (`anrede`, w 8): in den ersten 800 Zeichen das erste Grusswort («Hallo», «Hoi», «Grüezi», «Guten Tag», «Liebe/r», «Sehr geehrte/r», «Werte/r», «Geschätzte/r» …), das nicht Teil einer Grussformel am Schluss ist. Danach: Platzhalter (`{{…}}`, `[…]`, `*|…|*`, `%…%`) oder grossgeschriebener Name (auch «Herr/Frau Name») → persönlich (1); allgemeine Wörter (zusammen, alle, Kundinnen, Mitglieder, Damen und Herren, Leserinnen …) oder nichts → allgemein (0,75); kein Grusswort → keine (0).
4. **Ziel** (drei Prüfpunkte): Linkziele (`ziel-links`, w 10): bei HTML alle `href` der `a`-Tags, bei reinem Text alle Adressen mit `https://`, `http://` oder `www.`; Ziel = Adresse ohne Abfrage (`?utm…`), ohne Anker, ohne Schrägstrich am Ende, kleingeschrieben; `mailto:`, `tel:` und `#` zählen nicht; Links der Fusszeile (Abmelden, Impressum, Datenschutz, Browseransicht) zählen nicht. 0 Ziele → 0,5 (Hinweis: HTML einfügen, falls der Text ohne Links kopiert wurde); 1 bis 5 → 1; 6 bis 10 → 0,5; mehr → 0. **Annahme:** höchstens 5 verschiedene Ziele, Richtwert von Alperna. Handlungsaufforderungen (`ziel-cta`, w 8): Liste typischer Wendungen (anmelden, buchen, bestellen, Termin buchen, Offerte anfordern, mehr erfahren, melde dich, ruf an, antworte auf diese Mail, folgen Sie uns, bewerten Sie uns, hier klicken …), ohne Vorsatz («jetzt anmelden» = «anmelden»), verschieden gezählt. 0 → 0,5; 1 bis 3 → 1; mehr → 0,5. **Annahme:** höchstens 3, Richtwert von Alperna. Linktexte (`ziel-linktext`, w 6): bei HTML Ankertexte wie «hier», «hier klicken», «mehr», «Link», «weiter», «click here»; im Text die Wendungen «hier klicken», «klick hier», «klicken Sie hier» → 0, sonst 1.
5. **Abmeldung** (`abmeldung`, w 12): im Text «abmelden», «abbestellen», «unsubscribe», «Abmeldung», «Newsletter beenden/kündigen», «keine weiteren E-Mails», «austragen», «Opt-out», «désinscri…», «disiscri…» oder ein `href` mit unsubscribe/abmeld/abbestell/opt-out/austragen → 1, sonst 0. Hinweis als Praxis formuliert («gehört in jeden Newsletter»), keine Rechtsaussage (Harte Regel 8). Nennt, dass Versandprogramme den Link oft erst beim Versand einfügen.
6. **Postadresse** (`adresse`, w 10): Strasse = Wort mit Endung strasse/str./gasse/weg/platz/allee/ring/quai/rain/halde/matte/steig/bühl/hof/promenade oder «Postfach», gefolgt von Hausnummer; PLZ = vier Ziffern (erste 1 bis 9, auch mit «CH-»), Leerzeichen, grossgeschriebener Ort; Jahreszahlen vor Monatsnamen, «Uhr», «Franken», «CHF» usw. zählen nicht. Beides → 1; eines → 0,5; nichts → 0.
7. **Bilder** (nur HTML, zwei Prüfpunkte): `img`-Tags ohne Zählpixel (width oder height = 1). Verhältnis (`bilder-verhaeltnis`, w 6): keine Bilder → 1; Bilder ohne Text → 0; mehr als ein Bild je 40 Wörter → 0,5; sonst 1. **Annahme:** ein Bild je 40 Wörter, Richtwert von Alperna. Alt-Texte (`bilder-alt`, w 4): Anteil der Bilder mit nicht leerem `alt` (0 bis 1).
8. **Spam-Signale** (`spam`, w 12): `data/spamwoerter.json`, 45 Einträge (Gruppen Dringlichkeit, Versprechen, Preis, Form) mit Muster, Anzeigetext und Hinweis; Quelle in `meta.source`: «Redaktionelle Liste von Alperna, Stand 2026-10-04, keine Häufigkeitsangaben». Felder je Eintrag: `caseSensitive` (Grossbuchstaben), `minCount` (Ausrufezeichen erst ab 4 Stellen, Grossbuchstaben erst ab 2 Wörtern mit 5 oder mehr Buchstaben). Geprüft werden Betreff und Text zusammen. `pass = max(0, 1 − 0,25 × Anzahl verschiedener Muster)`. Kaputte Muster in der Datei fallen einzeln weg (Test).
9. **Sprache** (aus dem Textcheck, zwei Prüfpunkte): Form und Schweizer Schreibweise (`sprache-form`, w 6): Funde der Arten `fehler` und `schreibweise`; Floskeln (`sprache-floskeln`, w 6): Funde der Art `floskel` (`data/floskeln.json`). Je `pass = max(0, 1 − 0,25 × Anzahl verschiedener Funde)`. Beispiele und Hinweise kommen aus dem Textcheck.
10. **Länge** (zwei Prüfpunkte): Umfang (`laenge-woerter`, w 6): unter 50 oder über 400 Wörter → 0,5, sonst 1. **Annahme:** 50 bis 400 Wörter, Richtwert von Alperna. Satzlänge (`laenge-saetze`, w 4): Sätze mit mehr als 25 Wörtern (`LONG_SENTENCE_WORDS` des Textchecks, Richtwert): 0 → 1; 1 bis 2 → 0,5; mehr → 0. Lesbarkeit nach Amstad wird als Kennzahl gezeigt (Quelle: Universität Zürich 1978, siehe `specs/textcheck.md`), zählt aber nicht zur Punktzahl.

Gewichte gesamt: 110 bei reinem Text, 120 bei HTML. Je Gruppe wird dieselbe Rechnung als Teilpunktzahl gezeigt (Tabelle im Bericht).

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster): `ScoreBadge` mit Punktzahl und Betreff, «n von m Prüfpunkten erfüllt», Kennzahlen (Wörter und Sätze, Linkziele und Aufforderungen, Bilder oder «nur bei HTML», Lesbarkeit), «Das fällt auf» nach Gruppen mit Fund, Hinweis und Beispielen, «Erfüllt» aufklappbar, Kasten «Was geprüft ist und was nicht» (Richtwerte, Testmail, Verweis auf den Textcheck, keine Rechtsprüfung).
- Kopieren und Dateien: `DocumentExport` aus `toDocument(report)` (Text kopieren, PDF, Word; Dateien über `guardDownload`). Dokument: Steckbrief, Ergebnis mit Tabelle je Bereich, Funde je Gruppe, Erfülltes, Hinweise zur Prüfung.
- CRM (Zugang v3): vor dem Ergebnis `ctx.ensureEmail()`; danach `ctx.sendResult({ eingabe: "Betreff: …\nAbsender: …\n\n" + text, ausgabe: reportMarkdown(report) })`. `reportMarkdown` = `toMarkdown(toDocument(report))`; das Wichtigste (Punktzahl, Funde) steht oben, weil der Server auf 1'900 Zeichen kürzt.
- Stand: `mt:newsletter-check` `{v, phase, betreff, absender, text}`; Felder werden 500 ms nach der letzten Eingabe gespeichert. Nach dem Neuladen wird das Ergebnis aus dem gespeicherten Text neu berechnet; `sendResult` läuft nur beim Klick, also kein zweiter CRM-Eintrag.
- Knöpfe im Ergebnis: Text kopieren, PDF, Word, «Text ändern» (zurück ins Formular mit allen Feldern), «Neuen Newsletter prüfen» (leert alles).

## Edge Cases (getestet)
- Leerer Text, nur Leerraum, nur Zahlen, nur Satzzeichen, Emojis, Steuerzeichen, HTML ohne Text: Meldung oder Ergebnis zwischen 0 und 100, nie ein Fehler.
- HTML: Titel und Stile zählen nicht als Text; Zählpixel zählen nicht als Bild; derselbe Link mit Tracking-Parametern oder Anker zählt einmal; Abmeldelink zählt als Fusszeile, nicht als Ziel.
- Reiner Text mit «<» oder «>» (Preis < 100) ist kein HTML.
- Jahreszahl vor Monatsnamen ist keine Postleitzahl; «Postfach 5, CH-9200 Gossau» ist eine Adresse.
- «Liebe Grüsse» am Schluss ist keine Anrede.
- Bösartige Eingaben mit 20'000 Zeichen (nur Buchstaben, nur Grossbuchstaben, nur `!`, nur Zeilenumbrüche, `www.`, `<a href=`, `<img `, `<p>`, «Bahnhofstrasse 1», «9200 A», «Hallo», «Liebe Grüsse», «GmbH» wiederholt): je unter 1,5 s (Test), gemessen deutlich darunter.
- Gespeicherter Stand kaputt, falsche Typen oder zu lang: leerer Stand bzw. gekürzt; Phase «result» nur, wenn der Text prüfbar ist.
- Kaputte Muster in `spamwoerter.json`: der Eintrag fällt weg, der Rest läuft.
- Profil leer: ohne Belang, das Werkzeug liest kein Profil.

## Texte
- Tagline: «Betreff, Ziel, Abmeldung, Adresse und Spam-Signale in Sekunden geprüft, mit Punktzahl und Hinweisen.» (101 Zeichen)
- SEO-Title: «Newsletter-Check Schweiz: Betreff, Links, Abmeldung prüfen»; Meta-Description in `content/tools/newsletter-check.md`
- Erklärtext, FAQ (7) und Alperna-Satz: `content/tools/newsletter-check.md`. Der Seitentext nennt Spam-Wörter nur, soweit die Stilregeln der Seitentexte es erlauben (keine Ausrufezeichen, kein «jetzt», keine falsche Dringlichkeit); die übrigen Funde beschreibt er.

## Tests
`tools/newsletter-check/logic.test.ts` (25 Fälle): HTML erkennen und wandeln, Bilder und Linktexte bei HTML, keine Bilder bei Text, sauberer Newsletter mit 100 Punkten, jeder Prüfpunkt positiv und negativ (Betreff, Absender, Signatur, Anrede, Ziel, Abmeldung, Adresse, Spam, Sprache, Länge), Datei gültig, kaputte Muster, Punktzahl 0 bis 100 und monoton, Gruppen und Gewichte, Eingabeprüfung, sinnlose Eingaben, 20'000 Zeichen unter 1,5 s, gespeicherter Stand, Bericht und Dokument, Beispiel der Malerei Keller mit den Zahlen des Seitentexts.

## Nicht Teil dieses Tools
- Rechtsaussagen (Harte Regel 8): keine. Ob Abmeldemöglichkeit und Adresse genügen und was das UWG für Werbe-E-Mails verlangt, prüft ein eigenes Werkzeug (uwg-mailcheck, geplant), das seine Formulierungen aus `content/legal/` nimmt.
- Zustellbarkeit (SPF, DKIM, DMARC, Absenderdomain, Spam-Score eines Filters): bräuchte den Server und DNS-Abfragen.
- Versand von Testmails, Vorschau im Postfach, Darstellung in Mailprogrammen.
- Bilder laden oder messen (Dateigrösse, Abmessungen): nur Zahl und Alt-Text aus dem Quelltext.
- Links aufrufen (tot oder lebendig): kein Netz, kein Server.
- KI-Vorschläge für Betreff oder Text: dafür gibt es den Text-Umschreiber (Stil «Newsletter»).
- Markieren der Stellen im Originaltext: die Liste zeigt Stellen mit Umgebung.
