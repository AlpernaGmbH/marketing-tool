# content/legal

Rechtstexte, die ein Mensch prüft und freigibt (CLAUDE.md, Harte Regel 8). Seit dem 05.10.2026 liegen **Entwürfe von Claude Code** vor, auf ausdrücklichen Wunsch von Alperna. Ein Entwurf ist kein Rechtstext: Er darf in keinem Werkzeug und auf keiner Seite erscheinen, bevor eine Fachperson ihn geprüft und `geprueft: ja` gesetzt hat. `npm run content-check` meldet jeden Entwurf als Hinweis und macht eine «geprüfte» Datei mit offenen Fragen rot (`lib/legal-rules.ts`).

## Dateien

| Datei | Wofür | Stand |
|---|---|---|
| `impressum.md` | Bausteine des Impressum-Generators (Felder, Kopf nach Rechtsform, Hinweise) | Entwurf |
| `uwg-mailwerbung.md` | Entscheidungsbaum, Checkliste und Abmeldehinweis für den E-Mail-Werbung-Check | Entwurf |
| `gewinnspiel.md` | Entscheidungsbaum und Teilnahmebedingungen für den Gewinnspiel-Check | Entwurf |
| `datenschutz-revdsg.md` | Module des Generators für die Datenschutzerklärung nach revDSG | Entwurf |
| `eigene-impressum.md` | Impressum von tools.alperna.ch (Seite `/impressum`) | Entwurf |
| `eigene-datenschutz.md` | Datenschutzerklärung von tools.alperna.ch (Seite `/datenschutz`) | Entwurf |

Nicht entworfen (optional, sonst entfallen die Werkzeuge, siehe IDEAS.md): `preisangabe.md`, `telefonwerbung.md`.

## Kopf jeder Datei

```yaml
---
titel: "…"
stand: 2026-10-05        # Datum der letzten inhaltlichen Änderung, zeigt LegalDisclaimer
quelle: "…"              # Gesetze mit SR-Nummer und Abrufdatum, Dokumente von Alperna
status: entwurf          # entwurf | geprueft
geprueft: nein           # ja | nein
geprueft_von: ""         # Name und Funktion der prüfenden Person
geprueft_am: ""          # JJJJ-MM-TT
---
```

Bei `geprueft: ja` müssen `geprueft_von` und `geprueft_am` stehen, und im Text darf weder `PRÜFEN:` noch `[OFFEN` noch der Vermerk «ENTWURF, NICHT GEPRÜFT» vorkommen.

## Format im Text

- `PRÜFEN: …` ist eine Frage an die prüfende Person. `[OFFEN: …]` ist eine fehlende Tatsache, die nur Alperna kennt. Beides verschwindet bei der Freigabe.
- Behauptungen über Gesetze nennen die Fundstelle (zum Beispiel «UWG Art. 3 Abs. 1 lit. o»). Wo ich einen Artikel nicht abgerufen habe, steht das dabei.
- Bausteine für Werkzeuge: Überschrift `### Baustein <id>`, darunter eine Zeile `Gilt für:` oder `Gilt wenn:` und der Text in einem Block ```` ```text ````. Platzhalter stehen in `{{doppelten Klammern}}`. Eine Zeile, die mit `?feld ` beginnt, erscheint nur, wenn das Feld ausgefüllt ist.
- Entscheidungsbäume (`uwg-mailwerbung.md`, `gewinnspiel.md`): eine Tabelle `id | Frage | ja | nein`; die Ziele sind weitere Fragen oder Ergebnisse (`ende-…`, `rot-…`, `gelb-…`). Jedes Ergebnis hat `Ampel:`, `Begründung:` und `Was du tun kannst:`.
- Der Text für `LegalDisclaimer` steht in `## Baustein hinweis`.

## Wer gibt frei

Eine Fachperson, die Alperna bestimmt (Anwältin oder Anwalt mit Datenschutz- und Lauterkeitsrecht). Bis dahin bleiben `/impressum` und `/datenschutz` Platzhalter, und die vier Rechts-Werkzeuge werden nicht gebaut.
