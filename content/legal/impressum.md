---
titel: "Impressum: Bausteine für den Impressum-Generator"
stand: 2026-10-05
quelle: "UWG (SR 241) Art. 3 Abs. 1 lit. s und Abs. 2, Art. 23; OR (SR 220) Art. 954a; Impressum der Alperna GmbH, alperna.ch/impressum, Stand 11.08.2026 (Haftungs- und Urheberbausteine, von Alperna verfasst). Gesetzestexte abgerufen auf fedlex.admin.ch am 05.10.2026."
status: entwurf
geprueft: nein
geprueft_von: ""
geprueft_am: ""
---

# Impressum: Bausteine

**ENTWURF, NICHT GEPRÜFT.** Diese Datei ist ein Vorschlag von Claude Code für die Prüfung durch eine Fachperson. Sie darf in keinem Werkzeug und auf keiner Seite erscheinen, bevor `geprueft: ja` im Kopf steht (CLAUDE.md, Harte Regel 8). Zeilen mit `PRÜFEN:` sind Fragen an die prüfende Person; sie müssen vor der Freigabe beantwortet und gelöscht werden.

Aufbau der Datei: siehe `content/legal/README.md` (Abschnitt «Format»).

## Was das Gesetz verlangt (Grundlage für den Hinweis im Werkzeug)

- Wer Waren, Werke oder Leistungen im elektronischen Geschäftsverkehr anbietet, muss «klare und vollständige Angaben über seine Identität und seine Kontaktadresse einschliesslich derjenigen der elektronischen Post» machen (UWG Art. 3 Abs. 1 lit. s Ziff. 1). Unterlässt er das, handelt er unlauter. Die Bestimmung gilt nicht für Sprachtelefonie und nicht für Verträge, die ausschliesslich durch den Austausch von elektronischer Post oder durch vergleichbare individuelle Kommunikation geschlossen werden (UWG Art. 3 Abs. 2).
- In der Korrespondenz, auf Bestellscheinen und Rechnungen sowie in Bekanntmachungen muss die im Handelsregister eingetragene Firma oder der eingetragene Name «vollständig und unverändert» angegeben werden; Kurzbezeichnungen und Logos sind zusätzlich erlaubt (OR Art. 954a).
- Vorsätzlicher unlauterer Wettbewerb nach Art. 3 UWG wird auf Antrag mit Freiheitsstrafe bis zu drei Jahren oder Geldstrafe bestraft (UWG Art. 23 Abs. 1).

PRÜFEN: Eine allgemeine Impressumspflicht für jede Website kennt das Schweizer Recht nach meinem Stand nicht [Wahrscheinlich]; sie folgt aus lit. s nur für Angebote im elektronischen Geschäftsverkehr (Online-Shop, Buchung, Bestellung). Soll der Hinweis im Werkzeug das so sagen, oder genügt «Angaben zur Anbieterin sind üblich und bei Online-Angeboten Pflicht»?

PRÜFEN: Ist eine Website eine «Bekanntmachung» im Sinn von OR Art. 954a? Davon hängt ab, ob die Firma auf der Website «vollständig und unverändert» stehen muss.

## Felder

Die Spalte «Pflicht» bedeutet: das Werkzeug verlangt das Feld und sagt, woraus es folgt. «kann» heisst: Eingabe möglich, nicht verlangt.

| id | Bezeichnung | Pflicht | Hinweis |
|---|---|---|---|
| firma | Firma oder Name, wie im Handelsregister eingetragen | ja | OR Art. 954a; UWG Art. 3 Abs. 1 lit. s Ziff. 1 (Identität) |
| rechtsform | Rechtsform | ja | bestimmt den Baustein `kopf-…` |
| strasse | Strasse und Nummer | ja | Kontaktadresse, UWG Art. 3 Abs. 1 lit. s Ziff. 1 |
| plz | Postleitzahl | ja | wie oben |
| ort | Ort | ja | wie oben (Sitz) |
| email | E-Mail-Adresse | ja | UWG Art. 3 Abs. 1 lit. s Ziff. 1 («einschliesslich derjenigen der elektronischen Post») |
| vertretung | Vertretungsberechtigte Person(en), mit Funktion | kann | Funktion je Rechtsform, siehe Bausteine |
| telefon | Telefon | kann | nicht vorgeschrieben |
| uid | UID (CHE-123.456.789) | kann | Format prüft `uidValid()`; gesetzlich für das Impressum nicht verlangt [Wahrscheinlich] |
| mwst | MWST-Nummer | kann | PRÜFEN: nur nennen, wenn die Person mehrwertsteuerpflichtig ist |
| hr | Handelsregisteramt oder Kanton | kann | nur, wenn eingetragen |
| aufsicht | Aufsichtsbehörde | kann | nur bei beaufsichtigten Berufen oder Stiftungen |
| berufsrecht | Berufsbezeichnung, Verleihungsstaat und Berufsregeln (Freitext) | bedingt | nur, wenn für den Beruf Angaben vorgeschrieben sind; der Text kommt von der Person, das Werkzeug formuliert nichts |

PRÜFEN: Gibt es Berufe, bei denen die Pflichtangaben ausdrücklich geregelt sind (zum Beispiel Anwaltschaft, Medizinalberufe, Treuhand)? Dann gehört ein Hinweis «Prüfe die Berufsregeln deines Berufsverbands» ins Werkzeug. Ich nenne hier bewusst keine Artikel, weil ich sie nicht geprüft habe.

## Bausteine: Kopf nach Rechtsform

Platzhalter in `{{doppelten Klammern}}`. Zeilen mit `?feld ` am Anfang erscheinen nur, wenn das Feld ausgefüllt ist. Die Bezeichnungen der Funktionen sind die üblichen im Schweizer Recht [Wahrscheinlich].

PRÜFEN: Stimmen die Funktionsbezeichnungen je Rechtsform (Einzelunternehmen: Inhaberin oder Inhaber; GmbH: Geschäftsführung; AG: Verwaltungsrat; Verein: Vorstand; Genossenschaft: Verwaltung; Stiftung: Stiftungsrat)?

### Baustein kopf-einzelunternehmen

Gilt für: Einzelunternehmen (eingetragen oder nicht eingetragen)

```text
{{firma}}
Inhaberin oder Inhaber: {{vertretung}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?mwst MWST-Nr.: {{mwst}}
?hr Handelsregister: {{hr}}
```

PRÜFEN: Bei einem nicht eingetragenen Einzelunternehmen ist «Firma» der Name der Person (mit Zusatz). Genügt das Feld so, oder braucht es zwei Felder?

### Baustein kopf-gmbh

Gilt für: Gesellschaft mit beschränkter Haftung

```text
{{firma}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?mwst MWST-Nr.: {{mwst}}
?hr Handelsregister: {{hr}}
?vertretung Geschäftsführung: {{vertretung}}
```

### Baustein kopf-ag

Gilt für: Aktiengesellschaft

```text
{{firma}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?mwst MWST-Nr.: {{mwst}}
?hr Handelsregister: {{hr}}
?vertretung Verwaltungsrat: {{vertretung}}
```

### Baustein kopf-verein

Gilt für: Verein (eingetragen oder nicht eingetragen)

```text
{{firma}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?hr Handelsregister: {{hr}}
?vertretung Vorstand: {{vertretung}}
```

### Baustein kopf-genossenschaft

Gilt für: Genossenschaft

```text
{{firma}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?mwst MWST-Nr.: {{mwst}}
?hr Handelsregister: {{hr}}
?vertretung Verwaltung: {{vertretung}}
```

### Baustein kopf-stiftung

Gilt für: Stiftung

```text
{{firma}}
{{strasse}}, {{plz}} {{ort}}, Schweiz
E-Mail: {{email}}
?telefon Telefon: {{telefon}}
?uid UID: {{uid}}
?hr Handelsregister: {{hr}}
?vertretung Stiftungsrat: {{vertretung}}
?aufsicht Aufsichtsbehörde: {{aufsicht}}
```

### Baustein berufsrecht

Gilt für: alle Rechtsformen, wenn das Feld `berufsrecht` ausgefüllt ist

```text
Berufsrechtliche Angaben: {{berufsrecht}}
```

## Bausteine: Hinweise am Ende des Impressums (optional, von der Person wählbar)

Die drei Bausteine stammen aus dem Impressum der Alperna GmbH (alperna.ch/impressum, Stand 11.08.2026), von Alperna verfasst, hier mit `{{firma}}` statt «Alperna GmbH». Inhaltlich unverändert.

PRÜFEN: Wie weit tragen solche Haftungsausschlüsse nach Schweizer Recht? Sollte der Hinweis im Werkzeug sagen, dass sie keine Haftung ausschliessen, die das Gesetz nicht ausschliessen lässt? Ich habe das nicht geprüft und formuliere dazu nichts.

### Baustein haftung-inhalte

Gilt für: alle, wenn gewählt

```text
Haftungsausschluss (Disclaimer)

{{firma}} übernimmt keinerlei Gewähr hinsichtlich der inhaltlichen Richtigkeit, Genauigkeit, Aktualität, Zuverlässigkeit und Vollständigkeit der Informationen. Haftungsansprüche gegen {{firma}} wegen Schäden materieller oder immaterieller Art, welche aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veröffentlichten Informationen, durch Missbrauch der Verbindung oder durch technische Störungen entstanden sind, werden ausgeschlossen.

Alle Angebote sind unverbindlich. {{firma}} behält es sich ausdrücklich vor, Teile der Seiten oder das gesamte Angebot ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder endgültig einzustellen.
```

### Baustein haftung-links

Gilt für: alle, wenn gewählt

```text
Haftung für Links

Verweise und Links auf Webseiten Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche Verantwortung für solche Webseiten abgelehnt. Der Zugriff und die Nutzung solcher Webseiten erfolgen auf eigene Gefahr des Nutzers oder der Nutzerin.
```

### Baustein urheberrechte

Gilt für: alle, wenn gewählt

```text
Urheberrechte

Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf der Website gehören ausschliesslich {{firma}} oder den speziell genannten Rechtsinhabern. Für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung der Urheberrechtsträger im Voraus einzuholen.
```

## Baustein hinweis (Text für die Hinweisbox des Werkzeugs, `LegalDisclaimer`)

```text
Dieses Werkzeug setzt dein Impressum aus Bausteinen zusammen. Es ist keine Rechtsberatung. Prüfe den Text vor der Veröffentlichung auf deine Rechtsform und dein Angebot. Wer im Internet Waren oder Leistungen anbietet, muss seine Identität und eine Kontaktadresse mit E-Mail klar und vollständig angeben (UWG Art. 3 Abs. 1 lit. s).
```

PRÜFEN: Ist der letzte Satz richtig und vollständig formuliert, oder soll er entfallen?
