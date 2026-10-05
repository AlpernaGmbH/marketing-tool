# WhatsApp-Link mit QR (whatsapp-link)

Klasse C (Rechner und Formular, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Dateien über `guardDownload`. `logic.ts` ist rein und getestet; Browser-Dinge (QR-Bild, PDF) stehen in `export.ts`.

## Nutzen in einem Satz
Für KMU und Vereine, die per WhatsApp erreichbar sein wollen: aus der Nummer und einem vorausgefüllten Satz in rund zwei Minuten ein wa.me-Link, ein QR-Code (PNG, SVG), ein Knopf für die Website und ein Aufkleber-Bogen als PDF.

## Kategorie und Verknüpfung
Kategorie: schweiz (erster Schritt im Pfad «Schweiz»), Zielgruppe: beide
Liest aus Profil: firma (über `ProfileFieldsForm`; steht auf dem Aufkleber und in den Vorlagen)
Schreibt ins Profil: nichts (die Firma schreibt `ProfileFieldsForm` selbst)
Verwandte Tools: qr-set, bewertungs-kit, digitaler-auftritt-check

## Zugang (Zugang v3)
- Beim Klick auf «Link erstellen» prüft das Werkzeug die Nummer (`phoneProblem`), dann `ctx.ensureEmail()`; schliesst die Person das Fenster, bleibt das Formular stehen.
- Danach `ctx.sendResult({ eingabe: eingabeText(state), ausgabe: ausgabeText({ phone, text, firma }) })`: Eingabe = Nummer so wie eingegeben, Vorlage, Nachricht (je eine Zeile); Ausgabe = Link, Nummer international, Firma, Nachricht, «QR und Aufkleber erzeugt».
- Downloads (PNG, SVG, PDF) laufen über `ctx.guardDownload(...)` und `downloadBytes`. Link und HTML sind immer kopierbar.
- Nach dem Neuladen steht das Ergebnis wieder da (Stand `mt:whatsapp-link`), ohne zweiten CRM-Eintrag.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`, id `wa-firma`) | nein | Profil `firma` | wie das Profil (max. 200) | «Die Firma steht auf dem Aufkleber und in den Vorlagen. Wir speichern sie in deinem Firmenprofil, in deinem Browser.» |
| WhatsApp-Nummer | text, `type="tel"` (id `wa-nummer`) | ja | gespeicherter Stand | Schweizer Nummer: Vorwahl 41, danach neun Ziffern, erste nicht 0; Leerzeichen, Punkte, Schrägstriche, Bindestriche, Klammern und «(0)» erlaubt; max. 40 Zeichen | «Die Nummer, auf der WhatsApp läuft. Schweizer Nummern, mit oder ohne +41.» |
| Nachricht | select (id `wa-vorlage`) | ja | «Anfrage» | einer von Anfrage, Terminwunsch, Offerte, Rückruf, Eigener Text | Wahl füllt die Textarea; «Eigener Text» leert sie |
| Vorausgefüllter Text | textarea (id `wa-text`) | nein | Text der Vorlage mit der Firma | max. 500 Zeichen (Zähler) | «Das steht im Chat der Kundschaft, bevor sie auf Senden tippt. Leer lassen geht auch.» |

## Logik
1. **Nummer zerlegen** (`parseDigits`): «(0)» fällt weg; Buchstaben → ungültig; «+» oder «00» am Anfang → international, sonst national mit 0 am Anfang; «41» plus neun Ziffern ohne Plus gilt als international.
2. **Normalisieren** (`normalizePhone`): international muss mit 41 beginnen; der Rest muss `[1-9]\d{8}` sein. Ergebnis `{ e164: "41" + Rest, display: "0XX XXX XX XX", displayInternational: "+41 XX XXX XX XX" }`, sonst null.
3. **Fehlertext** (`phoneProblem`): leer, Buchstaben, fremde Vorwahl oder Null nach der Vorwahl → «Gib eine Schweizer Nummer an, zum Beispiel 079 123 45 67.»; neun Ziffern verfehlt → «Diese Nummer hat zu viele oder zu wenige Stellen.»; sonst null.
4. **Vorlagen** (`TEMPLATES`, `messageFor(key, firma)`): fünf Konstanten aus Sicht der Kundschaft («Guten Tag Malerei Keller, ich habe eine Frage zu …»); ohne Firma «Guten Tag, …»; «Eigener Text» leer. Solange noch nichts eingegeben ist (`isUntouched`), folgt die Textarea der Vorlage mit der Firma aus dem Profil; sobald die Person tippt, bleibt ihr Text.
5. **Link** (`buildWaLink(e164, text)`): `https://wa.me/<e164>`; mit Text `?text=` + `encodeURIComponent(cleanText(text))`. `cleanText` vereinheitlicht Zeilenenden auf `\n` (bleibt als `%0A`), schneidet Leerraum ab und kürzt auf 500 Zeichen. Leerer Text → Link ohne Parameter.
6. **Knopf** (`buttonSnippet(link, label)`): ein `<a>` mit `target="_blank" rel="noopener"` und Inline-Stil (Pille, dunkler Grund #0F0F0E, heller Text #FFFDF8), kein Skript, keine Datei; `&`, `"`, `<`, `>` in href und Beschriftung über `escapeHtml`.
7. **Aufkleber-Bogen** (`stickerLayout`, `cellContent`): A4 hoch (595.28 × 841.89 pt), vier A7-Felder (74 × 105 mm, je 209.76 × 297.64 pt) in zwei Spalten und zwei Reihen, mittig; 12 Schnittmarken ausserhalb des Rasters. Je Feld: Firma (Geist 500, 10.5 pt), «Schreib uns auf WhatsApp» (Geist 600, 15 pt, bis zwei Zeilen), QR-Code 42 × 42 mm, Nummer national (13 pt), international (9 pt), Fusszeile «Erstellt mit tools.alperna.ch» (7 pt). Masse rein in `logic.ts`, Zeichnen in `export.ts` mit pdf-lib (`embedPng`, Schriften aus `loadPdfFonts`).
8. **QR-Code** (`export.ts`, Bibliothek `qrcode`): Anzeige 240 px als Data-URL; PNG 512 px, Rand 2 Module, Fehlerkorrektur M, dunkel #0F0F0E auf weiss; SVG über `QRCode.toString({ type: "svg" })`.
   Annahme: Der Hinweis «mindestens 2 cm Kantenlänge, dunkel auf hell, heller Rand» ist ein Richtwert von Alperna, keine Statistik; im UI und im Seitentext so gekennzeichnet.
9. **Dateinamen**: `whatsapp-qr-<firma>.png`, `whatsapp-qr-<firma>.svg`, `whatsapp-aufkleber-<firma>.pdf` (`safeFilename`; ohne Firma ohne Zusatz).
10. **Stand** (`mt:whatsapp-link`): `{ v: 1, phase: "edit" | "result", nummer, vorlage, text }`. `parseState` liefert bei kaputten Daten den leeren Stand, kürzt Texte und setzt «result» nur mit gültiger Nummer. `lib/progress.ts` erkennt `phase: "result"` als erledigt.

## Ausgaben
- `ResultCard` «Dein WhatsApp-Link»: Link als Text (`data-testid="wa-link"`) mit «Link kopieren» und «Link im neuen Fenster öffnen»; QR-Code (`img`, alt «QR-Code zu deinem WhatsApp-Link», 240 px) mit Hinweis (Richtwert) und «PNG herunterladen», «SVG herunterladen»; Knopf-Schnipsel in `pre/code` (`data-testid="wa-snippet"`) mit «HTML kopieren»; «Aufkleber-PDF herunterladen»; Knöpfe «Angaben ändern» und «Neu beginnen».
- Kopierbar ohne Adresse: Link und HTML. Dateien (PNG, SVG, PDF) erst mit Adresse (`guardDownload`).
- CRM: siehe Zugang.

## Edge Cases (getestet)
- Sechs Schreibweisen derselben Nummer ergeben dieselbe E.164; «(0)» nach +41 fällt weg.
- Zu kurz, zu lang, +49, 0049, Buchstaben, leer, Null nach der Vorwahl: null und passende Meldung.
- Text leer oder nur Leerraum: Link ohne `?text=`.
- Umlaute, Anführungszeichen, `&`, `?` und Zeilenumbrüche im Text: korrekt codiert, `%0A` bleibt.
- Text über 500 Zeichen (etwa aus dem Speicher): gekürzt.
- Schnipsel mit `&` und `"`: escapt.
- Vier Felder innerhalb A4, keine Überlappung; QR und Zeilen innerhalb des Feldes; QR über 2 cm.
- Profil ohne Firma: Vorlage «Guten Tag, …», Aufkleber ohne Firmenzeile, Dateinamen ohne Zusatz.
- Gespeicherter Stand kaputt, falsche Version, falsche Typen, «result» mit ungültiger Nummer: leerer Stand bzw. «edit».
- QR-Bild kann nicht erzeugt werden: Hinweis, der Link funktioniert trotzdem. Download scheitert: Meldung in `role="alert"`.

## Texte
- Tagline: «Aus deiner Nummer wird ein Link, ein QR-Code und ein Knopf für die Website, in einer Minute.» (93 Zeichen)
- SEO-Title: «WhatsApp-Link Schweiz: wa.me-Link, QR-Code und Knopf»; Meta-Description in `content/tools/whatsapp-link.md`.
- Keyword «WhatsApp-Link»: in H1, erstem Absatz und Fragen.
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit Link und Vorlage aus `buildWaLink` und `messageFor`, in `logic.test.ts` festgehalten), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/whatsapp-link.md`.

## Tests
`tools/whatsapp-link/logic.test.ts` (25 Fälle): Nummernformate, Anzeigeformate, ungültige Nummern, Fehlertexte, Vorlagen mit und ohne Firma, Link mit und ohne Text, Umlaute und Zeilenumbrüche, Kürzung, Schnipsel und Escaping, Raster und Schnittmarken, Inhalt je Feld, Überlappung, Dateinamen, Eingabe und Ausgabe fürs CRM, `parseState` bei kaputten Daten. `tools/whatsapp-link/export.test.ts` (2 Fälle): PNG und SVG aus `qrcode`, Aufkleber-PDF mit einer A4-Seite und eingebettetem Bild.

## Nicht Teil dieses Tools
- Prüfen, ob die Nummer wirklich bei WhatsApp registriert ist: dafür bräuchte es WhatsApp selbst; das Werkzeug prüft nur die Form.
- Andere Länder: nur Schweizer Nummern (+41). Wer eine Nummer aus Liechtenstein oder Deutschland nutzt, baut den Link von Hand nach demselben Muster.
- Logo im QR-Code, Farben, runde Module: ein schlichter Code scannt am besten; Gestaltung übernimmt das QR-Set.
- WhatsApp-Business-Funktionen (Katalog, Begrüssung, Abwesenheit): nicht Teil des Links.
- Kurzlinks oder Zählung der Klicks: kein Server, kein Netz.
