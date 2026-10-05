# QR-Set für Flyer und Aufkleber (qr-set)

Klasse C (Rechner und Formular, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Bibliotheken: `qrcode` (Codes), `pdf-lib` (Druckbogen), `jszip` (ZIP), alle schon im Repo. Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Downloads über `guardDownload`.

## Nutzen in einem Satz
Für KMU und Vereine, die Flyer, Aufkleber, Plakate oder Tischaufsteller drucken: in rund vier Minuten bis zu sechs QR-Codes mit Beschriftung, als Druckbogen A4 (PDF) und als ZIP mit SVG und PNG je Code, ohne Konto und ohne Werbung im Code.

## Kategorie und Verknüpfung
Kategorie: schweiz (zweiter Schritt im Pfad «Schweiz», nach dem WhatsApp-Link), Zielgruppe: beide
Liest aus Profil: firma (Kopf des Druckbogens, Dateiname), website (Vorschlag für das erste Ziel); beides über `ProfileFieldsForm`, nichts davon wird erneut gefragt (Harte Regel 10)
Liest zusätzlich: `mt:whatsapp-link` (Stand des WhatsApp-Werkzeugs, Form `{ v, phase, nummer, text }`): steht dort eine gültige Nummer, wird WhatsApp als Ziel vorgeschlagen
Schreibt ins Profil: nichts
Verwandte Tools: whatsapp-link, bewertungs-kit, digitaler-auftritt-check

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | nein | Profil `firma` | max. 200 (Profil) | «Firma und Website speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Website | text (`ProfileFieldsForm`) | nein | Profil `website` | wie Ziel «Website» | – |
| Ziele (Liste `ul`, aria-label «Ziele», 1 bis 6 Zeilen) | – | ja (mindestens eines) | erste Zeile: Website aus dem Profil; dazu WhatsApp aus `mt:whatsapp-link`; sonst eine leere Zeile «Website» | `formProblem` | Knopf «Ziel hinzufügen» (bis 6, dann gesperrt), «n von 6 Zielen» |
| Art (je Zeile, `select`) | single | ja | – | eine von Website, Instagram, LinkedIn, WhatsApp, Google-Bewertung, Speisekarte oder PDF, Anderer Link | – |
| Adresse (je Zeile) | text | ja | – | je Art, siehe Logik; max. 500 Zeichen | je Art: «Die Adresse deiner Website, mit oder ohne https://.», «Dein Instagram-Handle oder die Adresse deines Profils.», «Die Adresse deiner LinkedIn-Seite oder deines Profils.», «Deine Schweizer WhatsApp-Nummer oder ein wa.me-Link.», «Der Link «Bewertung schreiben» aus deinem Google-Unternehmensprofil.», «Die Adresse der Datei auf deiner Website.», «Jede Adresse, die mit http:// oder https:// beginnt.» |
| Beschriftung (je Zeile) | text | ja | Vorschlag je Art: «Unsere Website», «Instagram», «LinkedIn», «Schreib uns auf WhatsApp», «Bewerte uns auf Google», «Speisekarte»; «Anderer Link» ohne Vorschlag | 1 bis 40 Zeichen | Zähler «n von 40 Zeichen» |
| Entfernen (je Zeile) | Knopf, aria-label «Ziel n entfernen» | – | – | gesperrt, solange nur eine Zeile da ist | – |

Beim Wechsel der Art folgt die Beschriftung dem Vorschlag, solange sie leer ist oder noch dem Vorschlag der alten Art entspricht (`labelAfterKindChange`); eine eigene Beschriftung bleibt.

## Logik
Alle Regeln in `tools/qr-set/logic.ts` (rein, ohne Bibliothek). Was `qrcode`, `pdf-lib` und `jszip` braucht, steht in `qr.ts` (Codes, mit der Oberfläche geladen) und `export.ts` (Druckbogen und ZIP, erst beim Download geladen).

1. **Adresse normalisieren** (`normalizeTarget(kind, input)` → `{ url, display } | null`):
   - Website, Speisekarte oder PDF, Anderer Link: `parseHttpUrl`: ohne Schema wird `https://` ergänzt; nur `http:` und `https:`; der Host braucht mindestens einen Punkt (`malerei-keller.ch`), keine Leerzeichen, keine Zugangsdaten in der Adresse. `url` ist die normalisierte Adresse (`URL.href`), `display` die Adresse ohne Schema, ohne `www.` und ohne Schrägstrich am Ende («malerei-keller.ch/kontakt»).
   - Instagram: Handle aus 1 bis 30 Zeichen (Buchstaben, Ziffern, Punkt, Unterstrich), ein `@` am Anfang ist erlaubt; eine Profiladresse auf `instagram.com` liefert das Handle aus dem ersten Pfadteil. `url` = `https://www.instagram.com/<handle>/`, `display` = `instagram.com/<handle>`.
   - LinkedIn: http(s)-Adresse, deren Host `linkedin.com` ist oder darauf endet; sonst null.
   - WhatsApp: Schweizer Nummer (`normalizePhone`: 079 123 45 67, 0791234567, +41 79 123 45 67, 0041791234567, mit Leerzeichen, Punkten, Schrägstrichen, Bindestrichen oder Klammern; E.164 ohne Plus `41791234567`; nur Landesvorwahl 41 und neun Ziffern, die erste nicht 0) oder ein wa.me- bzw. whatsapp.com-Link, aus dem die Nummer gelesen wird (ein `text`-Parameter bleibt erhalten). `url` = `https://wa.me/<E.164>`, `display` = «+41 79 123 45 67». Die Normalisierung ist eine eigene minimale Fassung; sobald `tools/whatsapp-link/logic.ts` dieselben Funktionen exportiert, kann sie importiert werden.
   - Google-Bewertung: http(s)-Adresse, deren Host auf `google.<tld>`, `g.page` oder `goo.gl` endet (auch `search.google.com`, `maps.app.goo.gl`); sonst null.
2. **Prüfen** (`targetProblem(target)` je Zeile, `rowProblems(ziele)` mit Duplikaten, `formProblem(ziele)` für den Knopf): Adresse leer → «Gib eine Adresse an.»; nicht normalisierbar → Meldung je Art («Das ist keine LinkedIn-Adresse. Sie beginnt mit linkedin.com.», «Gib eine Schweizer Nummer an, zum Beispiel 079 123 45 67, oder einen wa.me-Link.» …); Beschriftung leer → «Gib eine Beschriftung an.»; über 40 Zeichen → Meldung; gleiche `url` wie eine frühere Zeile (Gross- und Kleinschreibung egal) → «Dieselbe Adresse wie Ziel n.»; keine Zeile → «Füge mindestens ein Ziel hinzu.»; mehr als sechs → «Höchstens 6 Ziele sind möglich.». Die Meldung je Zeile steht in `role="alert"` unter der Zeile (erst nach dem ersten Klick auf den Knopf), die erste Meldung zusätzlich über dem Knopf mit «Ziel n: …».
3. **Codes** (`buildCodes(ziele)` → `QrCode[]` mit nr, kind, kindLabel, label, url, display): nur gültige, nicht doppelte Zeilen, neu nummeriert 1 bis 6. Codes mit Fehlerkorrektur M (`qr.ts`, Standardstufe der Bibliothek). **Annahme:** M genügt für Links auf Flyern und Aufklebern; ohne Quelle, nur als Voreinstellung der Bibliothek benannt, keine Zahl im UI.
4. **Druckbogen** (`layoutA4(n)` → Felder in Punkt, `buildSheetPdf` in `export.ts`): A4 hoch (595.28 × 841.89 pt), 2 Spalten × 3 Reihen, Feld 90 × 80 mm, Raster auf der Seite zentriert (Kopf 70 pt, Fuss 50 pt frei). Je Feld: Code 50 mm breit, 8 mm unter dem Feldrand, mittig; Beschriftung (Geist 500, 11 pt) 11 mm unter dem Code, Adresse (Geist 400, 8 pt, grau) 5 mm darunter; beides auf 82 mm Breite gekürzt («...»). Die Module werden als Rechtecke gezeichnet (Vektor). Die Ruhezone liegt ausserhalb der 50 mm (4 Module nach ISO/IEC 18004, Quelle: DENSO WAVE, https://www.qrcode.com/en/howto/code.html, abgerufen 05.10.2026); der Abstand zur Beschriftung ist dafür bemessen. Schnittmarken an den vier Ecken jedes Felds (3 mm, 1 mm Abstand). Kopf: Firma links (gekürzt, sonst «Alperna»), Datum rechts, Linie. Fuss: «Erstellt mit tools.alperna.ch». Zeichen, die in der Schrift fehlen, werden durch «?» ersetzt. Dateiname `qr-set-<firma>.pdf`, ohne Firma `qr-set.pdf`.
5. **ZIP** (`buildZip`): je Code `<nr>-<beschriftung>.svg` (Ruhezone 4 Module, 50 mm, schwarz auf weiss, Pfad aus zusammenhängenden Modulen) und `<nr>-<beschriftung>.png` (1'024 px, Ruhezone 4 Module, Canvas der Bibliothek), Dateinamen über `safeFilename` (`zipFilename`), dazu `ziele.txt` mit der Liste. Dateiname `qr-set-<firma>.zip`.
6. **Vorschau** (`qr.ts`, `qrSvgDataUrl`): dasselbe SVG als data-URL in einem `img` (160 px), alt «QR-Code: <Beschriftung>».
7. **CRM** (Zugang v3): `eingabeText(ziele, firma)` = «Firma: …» und je Zeile «Ziel n: <Art>, <Adresse wie eingegeben>, Beschriftung «…»»; `ausgabeText(codes)` = «n QR-Codes», je Zeile «n. <Beschriftung>: <url>», dann «Druckbogen und ZIP erzeugt». `sendResult` läuft einmal beim Klick auf «QR-Set erstellen», nicht beim Wiederherstellen.
8. **Stand** (`mt:qr-set`, `parseState`): `{ v: 1, phase: "edit" | "result", ziele: [{ kind, input, label }] }`. Kaputte Daten → leerer Stand; kaputte Zeilen fallen weg, Texte werden gekürzt (500 bzw. 40 Zeichen), höchstens sechs Zeilen; «result» nur, wenn `formProblem(ziele) === null`. `lib/progress.ts` erkennt `phase: "result"` als erledigt. Der Entwurf lebt in den Feldern, bis «QR-Set erstellen» ihn speichert.
9. **Vorschläge beim ersten Öffnen** (`initialTargets(website, waNummer)`): Website aus dem Profil als erstes Ziel («Unsere Website»), WhatsApp aus `mt:whatsapp-link` (`readWhatsappNumber`, nur mit gültiger Nummer) als zweites; ohne beides eine leere Zeile «Website». Gilt nur, solange kein Stand und kein Entwurf da ist.

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster): `ResultCard` «Dein QR-Set» mit Satz «n QR-Codes für <Firma>. Der Druckbogen zeigt jeden Code 50 mm breit mit Beschriftung und Adresse; im ZIP liegt jeder Code als SVG und als PNG mit 1'024 Pixeln.», Raster (`ul`, aria-label «QR-Codes»): je Bild (alt «QR-Code: <Beschriftung>»), Beschriftung, Adresse als Text, Art. Kasten «Vor dem Druck» mit den vier Hinweisen (`HINWEISE`): mindestens 2 cm (Richtwert von Alperna, keine Statistik), Ruhezone 4 Module (ISO/IEC 18004), dunkel auf hell, mit zwei Handys testen.
- Knöpfe: «Druckbogen (PDF) herunterladen» (primär), «ZIP mit SVG und PNG herunterladen», «Liste kopieren» (`ausgabeText`), «Angaben ändern» (Formular mit den Werten, Stand bleibt als «edit»), «Neu beginnen» (leert alles auf eine Zeile «Website»). Beide Downloads über `ctx.guardDownload` und `downloadBytes`; die Bibliotheken laden erst beim Klick; Fortschritt in `role="status"`, Fehler in `role="alert"`.
- Nichts davon liegt hinter einem zweiten Fenster: Wer die Adresse einmal angegeben hat, lädt sofort.

## Edge Cases (getestet)
- Adresse ohne Schema, mit `http://`, mit Pfad und Abfrage; `https://` allein, `localhost`, `ftp:`, `mailto:`, `javascript:`, Leerzeichen, nur Text → null.
- Instagram: Handle mit `@`, mit Punkt und Unterstrich, aus Profiladresse mit `?hl=de`; Leerzeichen, Schrägstrich, 31 Zeichen, nur `@`, fremde Domain `instagram.com.example.org` → null.
- LinkedIn: `linkedin.com/company/…`, `www.linkedin.com/in/…`; xing.com, `linkedin.com.evil.org`, nackter Name → null.
- WhatsApp: sechs Schreibweisen → dieselbe E.164; zu kurz, zu lang, +49, Buchstaben, leer, `+41 0 79 …` → null; wa.me mit `text`, `api.whatsapp.com/send?phone=`, deutsche Nummer im wa.me-Link → null.
- Google: `g.page/r/…/review`, `search.google.com/local/writereview`, `maps.app.goo.gl`, `google.ch/maps`; eigene Website, `notgoogle.com` → null.
- Duplikate in anderer Schreibweise (Grossbuchstaben, Schrägstrich am Ende, andere Art) → «Dieselbe Adresse wie Ziel 1.».
- 0 Ziele, 7 Ziele, Beschriftung leer, nur Leerzeichen, 41 Zeichen, genau 40 Zeichen, unbekannte Art.
- Layout 1 bis 6: alle Felder und Codes innerhalb A4, Code im Feld, keine Überlappung (mit Toleranz für Gleitkommarechnung an gemeinsamen Kanten), Raster zentriert, Kopf und Fuss frei; 0, negativ, 99, NaN.
- Dateinamen mit Umlauten, `&`, nur Sonderzeichen («4-qr-code.png»), Firma leer.
- SVG: Pfad, Ruhezone, Grösse in mm, leere Matrix.
- Gespeicherter Stand: null, Text, Zahl, Array, falsche Version, `ziele` kein Array, kaputte Zeilen, zu lange Texte, neun Zeilen, «result» mit ungültigem Ziel oder ohne Ziel → «edit».
- Druckbogen mit 0, 4 und 6 Codes, sehr langer Firma, sehr langer Adresse, Pfeilen und Häkchen in der Beschriftung: eine Seite, kein Fehler (beim Bau geprüft, nicht Teil der dauerhaften Tests, weil `export.ts` Browser-Bibliotheken lädt).
- Profil leer: Firma fehlt im Kopf («Alperna»), erste Zeile leer. Speicher gesperrt: `useLocalJson` fällt auf den Arbeitsspeicher zurück.

## Texte
- Tagline: «Bis zu sechs QR-Codes mit Beschriftung: Druckbogen als PDF, Dateien als ZIP, fertig für Flyer und Aufkleber.» (110 Zeichen)
- SEO-Title: «QR-Code-Set Schweiz: Codes für Flyer und Aufkleber»; Meta-Description in `content/tools/qr-set.md`.
- Keyword «QR-Code»: in H1 («QR-Code-Set für Schweizer KMU»), im ersten Absatz und im Text.
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit vier Zielen; Adressen mit `buildCodes` gerechnet und in `logic.test.ts` festgehalten), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/qr-set.md`.

## Tests
`tools/qr-set/logic.test.ts` (28 Fälle): Arten und Vorschläge, Beschriftung beim Artwechsel, Normalisierung je Art (gültig, ungültig, ohne Schema, Handle mit `@`, falsche Domain bei LinkedIn), Nummern in sechs Schreibweisen und sechs ungültige, wa.me-Links, Google-Links, Prüfung je Zeile, Duplikate, Grenzen 1 und 6, Codes aus dem Beispiel, ungültige Zeilen, Layout 1 bis 6 ohne Überlappung, Zentrierung und Kappung, Dateinamen, SVG, Eingabe und Ausgabe fürs CRM, Hinweise, `parseState` bei kaputten Daten, WhatsApp-Nummer und Vorschläge.

## Nicht Teil dieses Tools
- Dynamische Codes mit Statistik oder änderbarem Ziel: Jeder Code ist statisch; eine neue Adresse braucht einen neuen Code. Das sagt die FAQ.
- Logo oder Farbe im Code, runde Module, Rahmen mit Text im Bild: dunkel auf hell ohne Spielerei liest jedes Handy.
- vCard, WLAN-Zugang, Kalender, Telefonnummer ohne WhatsApp, E-Mail-Adresse als Ziel: andere Datentypen, eigenes Werkzeug, falls gewünscht (IDEAS.md).
- Mehr als sechs Codes oder andere Bogenformate (A3, Etikettenbögen mit Herstellermassen).
- Prüfung, ob eine Adresse erreichbar ist: kein Netz (Harte Regel 1).
- Rechtsaussagen (Harte Regel 8): keine.
