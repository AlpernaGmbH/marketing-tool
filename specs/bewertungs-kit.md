# Bewertungs-Kit für Google (bewertungs-kit)

Klasse C (alles im Browser, kein Server, keine KI), Stand 05.10.2026. Ein Formular, ein Ergebnis mit QR-Code, Druckdateien und Vorlagen. `logic.ts` (Prüfung, Vorlagen, Masse, Stand) und `export.ts` (QR, PDFs) sind getestet.

## Nutzen in einem Satz
Für Betriebe, die mehr Google-Bewertungen wollen: in rund drei Minuten aus dem Bewertungslink des Unternehmensprofils ein QR-Code, Tischaufsteller in A6 und A5 (je zwei Layouts), ein Aufkleber-Bogen und drei Anfrage-Texte (SMS, WhatsApp, E-Mail) in Du- und Sie-Fassung, fertig zum Drucken und Verschicken.

## Kategorie und Verknüpfung
Kategorie: schweiz (dritter Schritt im Pfad «Schweiz»), Zielgruppe: kmu
Liest aus Profil: firma (über `ProfileFieldsForm`), marke.tonalitaet (Vorbelegung der Anrede, `anredeFromProfile`)
Schreibt ins Profil: nichts
Verwandte Tools: whatsapp-link, qr-set, digitaler-auftritt-check
`needsServer: false`: Link, Anrede und Farbe verlassen den Browser nur mit dem Ergebnis ins CRM.

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** «Kit erstellen» prüft die Eingaben (`formProblem`), dann `ctx.ensureEmail()`; false lässt das Formular stehen. Danach Stand `phase: "result"`, Ergebnis sichtbar, einmal `ctx.sendResult`.
- **CRM:** Eingabe = `eingabeText` (Firma, Bewertungslink oder Place-ID, Anrede, Akzentfarbe, je eine Zeile). Ausgabe = `ausgabeText` (Bewertungslink, «Erzeugt: Aufsteller A6 …», die drei Vorlagen der gewählten Anrede als Abschnitte).
- **Downloads:** jeder Knopf über `ctx.guardDownload(() => run(kind))` und `downloadBytes`. «Link kopieren» und die Vorlagen sind frei (`CopyButton`).
- **Stand** unter `mt:bewertungs-kit`: `{ v: 1, phase: "edit" | "result", link, placeId, anrede, farbe }`. Nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten den leeren Stand; ein Ergebnis ohne gültigen Link, ohne Anrede oder mit zu heller Farbe fällt auf «edit».

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`, id `bk-firma`) | ja | Profil `firma` | nicht leer | «Die Firma steht auf den Aufstellern und in den Vorlagen.» |
| Dein Google-Bewertungslink | text, `inputMode="url"` (id `bk-link`) | ja, wenn keine Place-ID | – | https, Host g.page, search.google.com, maps.google.com, maps.app.goo.gl, google.com/maps (auch www), goo.gl/maps; keine Leerzeichen, höchstens 2'000 Zeichen | details «So findest du den Link» mit drei Schritten nach der Hilfeseite von Google (HELP.linkHilfe) und Link darauf |
| Oder die Place-ID | text (id `bk-placeid`) | ja, wenn kein Link | – | nicht leer, keine Leerzeichen, 10 bis 300 Zeichen → `https://search.google.com/local/writereview?placeid=<id>` (URL-kodiert) | «Ein eingetragener Link hat Vorrang.» |
| Anrede deiner Kundschaft | radio Du / Sie (ids `bk-anrede-du`, `bk-anrede-sie`) | ja | `anredeFromProfile(profile)`: `marke.tonalitaet.anrede`, sonst «per Sie/Du», «Sie-/Du-Form», «Sie» mitten im Satz, «Ihnen/Ihre», «du/dein/dich/dir» im Text der Tonalität | eine der beiden | «Umschalten kannst du im Ergebnis.» |
| Akzentfarbe | color (id `bk-farbe`), Standard #0F0F0E | ja | – | gültiger Hex; Kontrast zu Papier #FFFDF8 mindestens 3:1, sonst «Diese Farbe ist auf Papier zu hell.» | «Der QR-Code bleibt schwarz.» Knopf «Zurücksetzen» |

Fehlermeldungen in `role="alert"` (id `bk-error`), Reihenfolge: Firma, Link oder Place-ID, Anrede, Farbe.

## Logik
1. **Link** (`isGoogleReviewLink`, `linkProblem`): URL-Parsing, nur `https:`; Host exakt einer der vier Hosts, oder google.com / www.google.com mit Pfad `/maps…`, oder goo.gl mit Pfad `/maps…`. Alles andere: «Das sieht nicht wie ein Google-Link aus. Kopiere den Link aus deinem Unternehmensprofil oder gib die Place-ID an.» Leer: «Gib deinen Google-Bewertungslink an oder die Place-ID.»
2. **Place-ID** (`placeIdProblem`, `placeIdUrl`, `reviewUrl`): `reviewUrl(x)` nimmt einen Google-Link oder, wenn `x` nicht wie eine URL aussieht (kein Schema, kein «/», kein «.»), eine Place-ID. `resolveUrl(form)`: Link hat Vorrang; ein ungültiger Link blockiert, auch wenn eine Place-ID da ist.
3. **Farbe** (`parseHex`, `luminance`, `contrast`, `isTooLight`, `farbProblem`): relative Helligkeit nach WCAG 2.x, Kontrast (L1 + 0,05) / (L2 + 0,05) gegen Papier #FFFDF8. Unter 3:1 zu hell (WCAG-Schwelle für Grafik und grosse Schrift). Ungültige Werte sind ein eigener Fehler, nicht «zu hell». Im PDF färbt die Farbe nur Rahmen, Titel (Layout 1), Firma (Layout 2) und Aufkleber-Rahmen; der QR-Code ist immer Tinte auf Weiss.
4. **Vorlagen** (`TEMPLATES[anrede][kanal]`, `SMS_KURZ`, `fillTemplate`, `buildTexts`): Platzhalter `{firma}` und `{link}` werden ersetzt, `[Name]` und `[Auftrag]` bleiben für die Person. `typoCH` läuft über den Text vor dem Einsetzen des Links (Prozentzeichen in URLs bleiben unberührt). Inhalt: Dank für den Auftrag, Bitte um eine Bewertung mit Link, «Eine ehrliche Bewertung reicht». Keine Gegenleistung, kein Rabatt, keine Bitte um fünf Sterne. SMS: Richtwert 160 Zeichen; ist die volle SMS länger (langer Place-ID-Link, langer Firmenname), nimmt `buildTexts` die kurze Form ohne Name und Firma. Die SMS-Vorlagen enthalten keine «», weil Guillemets eine SMS auf 70 Zeichen je Teil schrumpfen (UCS-2).
   Annahme: 160 Zeichen gelten als Grenze einer SMS (Richtwert, im UI «Richtwert 160»); Sonderzeichen in der GSM-Tabelle werden nicht einzeln gezählt.
5. **Druckmasse** (`mm`, `PAGES`, `standLayout`, `stickerLayout`), alles in Punkt (1 mm = 72 / 25,4 pt): A6 105 × 148 mm, A5 148 × 210 mm, A4 210 × 297 mm. Aufsteller: Rand 7 mm, Rahmen in Akzentfarbe, QR 56 mm (A6), alles für A5 mit dem Faktor 148 / 105 skaliert. Aufkleber: 8 Zellen 50 × 50 mm in 2 Spalten und 4 Reihen, Abstand 10 mm, auf der Seite zentriert; QR 34 mm, Satz «Bewerte uns auf Google» / «Bewerten Sie uns auf Google», Haarlinie als Schneidekante plus Schnittmarken 3 mm an den Ecken.
6. **Zeichnen** (`export.ts`): `qrDataUrl` (Bild am Bildschirm, 480 px), `qrPng` (1'024 px PNG aus der Daten-URL), `drawQr` zeichnet die Module aus `QRCode.create(link).modules` als Rechtecke mit zwei Modulen Ruhezone (Fehlerkorrektur M), `buildStandPdf(size, input, fonts)` mit zwei Seiten (Layout 1: «Wie war es bei uns?», «Bewerte <Firma> auf Google» bzw. «Bewerten Sie <Firma> auf Google», QR, «Kamera auf den Code richten», Firma im Fuss; Layout 2: Firma oben in Akzentfarbe, «Google-Bewertung», QR, «Danke für deine Bewertung» bzw. «Danke für Ihre Bewertung»), `buildStickerSheetPdf(input, fonts)`. Schrift Geist über `loadPdfFonts`, Fusszeile «Erstellt mit tools.alperna.ch». Lange Firmennamen schrumpfen in der Schrift bis zu einer Mindestgrösse, Zeichen ausserhalb der Schrift werden zu «?».
7. **Stand und CRM** (`parseState`, `eingabeText`, `ausgabeText`): siehe Zugang.

## Ausgaben
- `ResultCard` «Dein Bewertungs-Kit»: QR-Code (`next/image` mit Daten-URL, alt «QR-Code zu deiner Google-Bewertung», 240 px, `data-testid="qr-image"`), Bewertungslink als Text (`data-testid="review-link"`) mit «Link kopieren», Zeile mit Firma, Anrede und Farbe.
- Abschnitt «Downloads» (section aria-label «Downloads»): «Aufsteller A6 (PDF)», «Aufsteller A5 (PDF)», «Aufkleber-Bogen (PDF)», «QR als PNG» (`data-testid="download-a6|a5|aufkleber|png"`); Dateinamen `aufsteller-a6-google-bewertung-<firma>.pdf`, `aufkleber-google-bewertung-<firma>.pdf`, `qr-google-bewertung-<firma>.png`.
- Abschnitt «Anfrage-Vorlagen» (section aria-label): Umschalter Du / Sie als zwei Knöpfe mit `aria-pressed` (`data-testid="anrede-du|sie"`), Liste `aria-label="Vorlagen"` mit SMS (Zeichenzahl und Richtwert 160), WhatsApp, E-Mail (`data-testid="vorlage-sms|whatsapp|email"`), je «SMS kopieren», «WhatsApp-Text kopieren», «E-Mail kopieren».
- Hinweis-Kasten (`data-testid="hinweis-gegenleistung"`): «Frag ohne Gegenleistung. Google lässt keine Anreize für Rezensionen zu …» mit Links auf die Richtlinie und die Tipps-Seite von Google.
- Knöpfe «Angaben ändern» (Formular mit den Werten, neues Ergebnis geht erneut ins CRM) und «Neu beginnen» (leerer Stand).

## Quellen (mit WebFetch geöffnet, 05.10.2026)
- Link zum Anfordern von Rezensionen: https://support.google.com/business/answer/16816815 («Link oder QR-Code zum Anfordern von Rezensionen erstellen»: business.google.com → «Rezensionen lesen» → «Mehr Rezensionen erhalten» → Kopiersymbol). Der Auftrag nannte «Bewertungen erhalten»; die Hilfeseite schreibt «Mehr Rezensionen erhalten», das Werkzeug übernimmt die Seite.
- Tipps für mehr Rezensionen: https://support.google.com/business/answer/3474122 (Anreize wie kostenlose oder vergünstigte Produkte gelten als gefälschte Interaktionen).
- Richtlinien für von Maps-Nutzern veröffentlichte Inhalte: https://support.google.com/contributionpolicy/answer/7400114 (Abschnitt «Manipulation von Bewertungen»: keine Zahlungen, Rabatte, kostenlosen Produkte oder Dienstleistungen für Rezensionen).
- Place-ID: https://developers.google.com/maps/documentation/places/web-service/place-id («Orts-IDs»: Kennung in Textform, Länge ohne feste Grenze; 10 bis 300 Zeichen sind die Grenzen dieses Werkzeugs).
- Keine Statistik im Werkzeug. «Nach dem erledigten Auftrag fragen» ist ein Richtwert von Alperna, keine Statistik.

## Edge Cases
- Firma leer (Profil leer): Meldung, kein Ergebnis. Im Ergebnis ohne Firma steht «Dein Betrieb» (nur theoretisch, weil das Formular die Firma verlangt).
- Link mit http, mit Leerzeichen, fremder Host, google.com ohne /maps, goo.gl ohne /maps: Meldung. Link und Place-ID zugleich: Link gilt.
- Place-ID mit 9 oder 301 Zeichen, mit Leerzeichen: Meldung. Place-ID mit Sonderzeichen: wird URL-kodiert.
- Farbe #FFD700 (Gold), #999999: zu hell. #808080: durch. «rot» oder #12345: Formfehler. Der Browser liefert aus `type="color"` immer #rrggbb klein; der Stand speichert normalisiert in Grossbuchstaben.
- Sehr langer Firmenname (über 60 Zeichen) oder langer Place-ID-Link: SMS fällt auf die kurze Form; im PDF schrumpft die Schrift.
- Tonalität im Profil ohne Hinweis auf die Anrede: Feld bleibt leer und ist Pflicht. «Sie» am Satzanfang zählt nicht (mehrdeutig).
- QR-Erzeugung scheitert (Link zu lang für QR-Version 40): Meldung im Ergebnis, Downloads melden den Fehler ebenfalls.
- Gespeicherter Stand kaputt, falsche Version, Ergebnis ohne Link: leerer Stand oder «edit».
- Fenster geschlossen («Später»): Formular bleibt mit allen Werten stehen.

## Texte
- Tagline: «QR-Code, Tischaufsteller und drei Anfrage-Texte für mehr Google-Bewertungen, fertig zum Drucken.»
- SEO-Title: «Bewertungs-Kit Schweiz: QR-Code und Aufsteller für Google»; Meta-Description in `content/tools/bewertungs-kit.md`.
- Keyword «Google-Bewertungen»: im Title, in der Tagline, im ersten Absatz, in den Fragen. Die H1 «Bewertungs-Kit für Schweizer KMU» ist vorgegeben und enthält das Keyword nicht wörtlich (wie beim ICP-Builder).
- Beispiel: Malerei Keller, Gossau, WhatsApp-Vorlage in der Du-Fassung, als Kasten; der Text ist `fillTemplate(TEMPLATES.du.whatsapp, …)` und in `logic.test.ts` festgehalten.
- FAQ (6) und Alperna-Block (Baustein Google Business Profil, `beweis: @baustein`): `content/tools/bewertungs-kit.md`.

## Tests
`tools/bewertungs-kit/logic.test.ts`: Links je Host, http statt https, fremde Hosts, Place-ID gültig und ungültig, `reviewUrl`, `resolveUrl`, Helligkeit und Kontrast, zu hell / ok / ungültiger Hex, Vorlagen je Anrede mit Firma, Link, Platzhaltern und ohne Gegenleistung, SMS unter 160 Zeichen mit langem Link, `fillTemplate` lässt den Link in Ruhe, Anrede aus dem Profil, `formProblem` in Reihenfolge, Masse der Aufsteller und Aufkleber innerhalb der Seite und ohne Überlappung, `parseState` bei kaputten und unvollständigen Daten, `eingabeText`, `ausgabeText`, das Beispiel aus dem Seitentext. `export.test.ts`: A6 mit zwei Seiten in A6, A5 mit Sie-Anrede und langem Namen, Aufkleber-Bogen als eine A4-Seite, PNG-Signatur des QR-Codes.

## Nicht Teil dieses Tools
- Keine Abfrage bei Google (Place-ID suchen, Profil prüfen, Bewertungen lesen): alles bleibt im Browser.
- Keine Antworten auf Bewertungen: dafür folgt das Werkzeug «bewertungsantwort».
- Kein Logo, keine Fotos auf den Aufstellern: nur Firma, Farbe und QR-Code.
- Keine weiteren Formate (Flyer, Visitenkarte, Rechnungsfuss): der QR als PNG lässt sich überall einsetzen.
- Keine Aussagen zum Recht (Harte Regel 8): der Hinweis nennt nur die Richtlinie von Google.
- Keine Statistik zu Bewertungen oder Umsatz (keine Quelle, Harte Regel 7).
