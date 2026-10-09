# Reifegrad-Check (reifegrad-check)

Klasse A/C (Fragebogen mit Selbstangaben), Stand 04.10.2026. Läuft vollständig im Browser (`needsServer: false`); `logic.ts` ist rein und getestet. Alle Punktzahlen, Stufen und Schritte sind Richtwerte dieses Werkzeugs, keine Statistik und kein Vergleich mit anderen Betrieben.

## Änderung vom 09.10.2026 (Feedback-Runde 2, Charge B5): sechs Fragen und Website-Scan
Diese Fassung ersetzt die Abschnitte «Eingaben», «Logik», «Rechenbeispiel» und «Ausgaben» weiter unten, soweit sie zehn Fragen und die Hälfte-Regel für den Marketing-Check nennen. Titel der Seite: «Wie gut ist dein Marketing aufgestellt?»; `needsServer: true` (der Scan ruft `/api/check`).

- **Sechs Fragen** (alle Pflicht, single, 0 bis 3 Punkte): ziele, zielgruppe, verantwortung, bewertungen, kontakt, budget. Entfallen sind website, google, social und messung: Was die Startseite verrät, fragt das Werkzeug nicht.
- **Website-Scan** (`WebsiteScan.tsx` im Start): Der Knopf «Website prüfen» führt den Marketing-Check (`runCheck`, `/api/check`) mit Firma, Website, Ort und der Branche aus dem Firmenprofil aus (Branche unbekannt: «Andere»). Das Ergebnis liegt unter dem Schlüssel des Marketing-Checks (`mt:digitaler-auftritt-check`) und wird von beiden Werkzeugen genutzt; läuft er auf der Seite des Marketing-Checks, zählt er auch hier. Der Scan ist kein Ergebnis: nichts geht ins CRM; das Ergebnis des Reifegrads nennt ihn im Dokument. 403 → `renewEmail()` und einmal wiederholen.
- **Dimensionen:** Strategie (ziele, zielgruppe, Selbstangabe), Auftritt (nur Scan), Inhalte (nur Scan), Kundenkontakt (bewertungen, kontakt, Selbstangabe), Steuerung (verantwortung, budget und, wenn der Scan sie kennt, eine dritte Frage «Web-Analyse eingebunden» mit 0 oder 3 Punkten).
- **Auftritt** = round((Website × 25 + Google-Profil × 20) ÷ 45), mit den Teilwerten 0 bis 100 der Kategorien `seo` und `gbp` des Checks (Gewichte wie im Check selbst, lib/check/analyze.ts); fehlt einer, zählt der andere allein. **Inhalte** = Teilwert der Kategorie `social`. Ist der Google-Wert nicht über Google bestätigt (`verified: false`), nennt das Ergebnis ihn eine Annahme aus dem Link auf der Website.
- **Ohne Scan** sind Auftritt und Inhalte «nicht bewertet»: keine Zahl, keine Stufe, keine Schritte, und sie zählen nicht ins Gesamt. **Gesamt** = Mittel der bewerteten Dimensionen (mindestens drei), gerundet. Das Netzdiagramm zeigt nur die bewerteten Dimensionen, ein Satz nennt die übrigen. Der Hinweis auf Alperna überspringt nicht bewertete Dimensionen.
- **Rechenbeispiel (Malerei Keller):** Antworten ziele kopf (1), zielgruppe grob (1), verantwortung unter2 (1), bewertungen manchmal (1), kontakt gelegentlich (1), budget keins (0). Scan: Marketing-Check 38, Website 60, Google-Profil 50, Social Media 40, keine Web-Analyse. Strategie (1 + 1) ÷ 6 = 33; Auftritt (60 × 25 + 50 × 20) ÷ 45 = 55,6 → 56; Inhalte 40; Kundenkontakt 33; Steuerung (1 + 0 + 0) ÷ 9 = 11; Gesamt (33 + 56 + 40 + 33 + 11) ÷ 5 = 34,6 → 35, Stufe «Aufbau». Ohne Scan: Strategie 33, Kundenkontakt 33, Steuerung (1 + 0) ÷ 6 = 17, Gesamt (33 + 33 + 17) ÷ 3 = 27,7 → 28.
- **Alte Stände:** Antworten auf die entfallenen Fragen werden ignoriert; ein gespeichertes Ergebnis wird mit den sechs Fragen neu gerechnet.
- **Folgen für andere Werkzeuge:** SWOT und Strategie-Einseiter lesen den Reifegrad (`evaluate`) und nehmen nur bewertete Dimensionen.
- **Tests:** `logic.test.ts` (29: Fragen, ohne und mit Scan, Teilwerte, Dokument, Bildschirm, Hinweis), `Tool.test.tsx` (5: mit gespeichertem Scan, ohne Scan, Scan starten, fehlende Website, Fehler), SWOT und Strategie-Einseiter angepasst, Browser-Test mit gestubbtem `/api/check`.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von Schweizer KMU und für Vereinsvorstände: zehn Fragen beantworten und in etwa fünf Minuten sehen, wie weit das eigene Marketing ist, mit einem Reifegrad von 0 bis 100, fünf Dimensionen mit Stufe und je zwei nächsten Schritten, bei der schwächsten Dimension beginnend.

## Kategorie und Verknüpfung
Kategorie: analyse (erster Schritt im Pfad «Analyse»), Zielgruppe: beide
Liest aus Profil: branche, groesse (nur für den Kopf des Ergebnisses und den Export; keine Frage hängt davon ab, beide Felder dürfen leer sein)
Schreibt ins Profil: nichts
Verwandte Tools: digitaler-auftritt-check, wettbewerbsvergleich, newsletter-check
Liest zusätzlich den Zwischenstand des Marketing-Checks unter `mt:digitaler-auftritt-check` (`parseCheckState`): Liegt dort ein Ergebnis (`phase: "result"`, `result.score`), zählt es zur Hälfte in die Dimension «Auftritt».

## Eingaben
Alle zehn Fragen sind Pflicht; jede hat eine Antwort für «gibt es nicht» oder «weiss nicht» in der tiefsten Stufe. Keine Frage wird aus dem Profil beantwortet (Harte Regel 10 ist erfüllt, weil das Profil keine dieser Angaben kennt). `branche` und `groesse` kommen über `prefill` als Kontext in die Antworten, ohne eine Frage zu ersetzen.

| Nr. | ID | Frage | Typ | Antworten (Punkte) |
|---|---|---|---|---|
| 1 | ziele | Sind deine Marketingziele schriftlich festgehalten? | single | keine (0) · kopf (1) · schriftlich (2) · messbar, mit Zahl und Termin (3) |
| 2 | zielgruppe | Ist deine wichtigste Kundengruppe benannt? | single | nein (0) · grob (1) · beschrieben (2) · profil, schriftlich und allen bekannt (3) |
| 3 | verantwortung | Wer kümmert sich ums Marketing, und wie viel Zeit pro Woche? | single | niemand (0) · unter2 (1) · 2bis5 (2) · ueber5 (3) |
| 4 | website | Wann wurde deine Website zuletzt geändert? | single | keine (0) · aelter als ein Jahr (1) · jahr (2) · quartal (3) |
| 5 | google | Wie gepflegt ist dein Google-Unternehmensprofil? | single | keins (0) · unbestaetigt (1) · bestaetigt (2) · aktiv, mit Fotos oder Beiträgen (3) |
| 6 | social | Wie oft erscheint ein Beitrag auf Social Media? | single | nie (0) · selten (1) · monatlich (2) · woechentlich (3) |
| 7 | bewertungen | Beantwortest du Bewertungen auf Google und anderen Plattformen? | single | nie (0) · manchmal (1) · alle (2) · aktiv, alle und wir bitten um Bewertungen (3) |
| 8 | kontakt | Wie hältst du Kontakt zu bestehender Kundschaft? | single | keiner (0) · gelegentlich (1) · unregelmaessig (2) · regelmaessig (3) |
| 9 | messung | Welche Kennzahlen schaust du regelmässig an? | multi | anfragen · website · google · social · kosten · keine; Punkte = min(3, Anzahl gewählter Kennzahlen ohne «keine») |
| 10 | budget | Ist ein Marketingbudget für das Jahr geplant? | single | keins (0) · grob (1) · fest (2) · verteilt auf Massnahmen (3) |

Validierung macht die `QuestionnaireEngine` (`validateAnswer`). Unbekannte, leere oder falsch typisierte Antworten geben in der Logik 0 Punkte, nie NaN.

## Logik
Alle Formeln in `tools/reifegrad-check/logic.ts`. Punkte je Frage: 0 bis 3 (`POINTS`).

1. **Dimensionen** (fünf, feste Reihenfolge): Strategie = Fragen 1, 2 · Auftritt = Fragen 4, 5 · Inhalte = Frage 6 · Kundenkontakt = Fragen 7, 8 · Steuerung = Fragen 3, 9, 10.
2. **Selbstangabe je Dimension** = Summe der Punkte ÷ (3 × Anzahl Fragen) × 100, auf ganze Zahlen gerundet. Beispiel Strategie: (1 + 1) ÷ 6 × 100 = 33.
3. **Marketing-Check in «Auftritt»**: Liegt ein Check-Ergebnis vor (0 bis 100, endlich, sonst ignoriert), gilt Auftritt = round((Selbstangabe + Check) ÷ 2), beide Werte vorher gerundet. Beispiel: Selbst 67, Check 38 → (67 + 38) ÷ 2 = 52,5 → 53. Ohne Check zählt nur die Selbstangabe; das Ergebnis sagt es und verlinkt den Check.
   Annahme: Gewicht 50 % für den Check. Richtwert dieses Werkzeugs: Die Messung von aussen und die Selbstangabe sind gleich viel wert, keine davon ist vollständig (der Check liest nur die Startseite, die Selbstangabe nur zwei Fragen).
4. **Gesamt** = round(Mittel der fünf gerundeten Dimensionswerte). Alle Dimensionen zählen gleich.
   Annahme: Gleiche Gewichte, weil das Werkzeug keine Quelle für andere Gewichte hat und ein gleiches Gewicht am leichtesten nachzurechnen ist. Folge: Die Dimension «Inhalte» hängt an einer Frage und zählt trotzdem 20 %; das steht so im Seitentext.
5. **Stufen** (Richtwert dieses Werkzeugs, für Gesamt und je Dimension, «von … bis …»): 0 bis 24 Anfang · 25 bis 49 Aufbau · 50 bis 74 Routine · 75 bis 100 Fortgeschritten.
6. **Nächste Schritte**: je Dimension zwei feste Texte aus `STEPS`, abhängig von der Stufe: unter 50 (Anfang, Aufbau) die Schritte zum Aufbauen, ab 50 (Routine, Fortgeschritten) die Schritte zum Festigen. Reihenfolge: Dimensionen aufsteigend nach Punkten, bei Gleichstand die feste Reihenfolge Strategie, Auftritt, Inhalte, Kundenkontakt, Steuerung. Die Liste zählt alle zehn Schritte durch.
7. **Kontext**: `branche` und `groesse` aus den Antworten (vorbefüllt aus dem Profil) stehen im Kopf des Ergebnisses; `groesse` wird über `GROESSEN` aus `lib/profile.ts` in Worte übersetzt («10 bis 49 Mitarbeitende»). Fehlen sie, fehlt die Zeile.

### Rechenbeispiel (Seitentext, Malerei Keller, Gossau)
Antworten: ziele kopf (1), zielgruppe grob (1), verantwortung unter2 (1), website jahr (2), google bestaetigt (2), social monatlich (2), bewertungen manchmal (1), kontakt gelegentlich (1), messung [anfragen] (1), budget keins (0). Marketing-Check vom Vortag: 38 von 100 (Beispiel aus `content/tools/digitaler-auftritt-check.md`).

- Strategie: (1 + 1) ÷ 6 × 100 = 33, Aufbau
- Auftritt: Selbst (2 + 2) ÷ 6 × 100 = 67; mit Check (67 + 38) ÷ 2 = 52,5 → 53, Routine
- Inhalte: 2 ÷ 3 × 100 = 67, Routine
- Kundenkontakt: (1 + 1) ÷ 6 × 100 = 33, Aufbau
- Steuerung: (1 + 1 + 0) ÷ 9 × 100 = 22, Anfang
- Gesamt: (33 + 53 + 67 + 33 + 22) ÷ 5 = 41,6 → 42, Aufbau
- Reihenfolge der Schritte: Steuerung (22), Strategie (33), Kundenkontakt (33), Auftritt (53), Inhalte (67)

Ohne Check: Auftritt 67, Gesamt (33 + 67 + 67 + 33 + 22) ÷ 5 = 44,4 → 44. Beide Rechnungen sind als Test hinterlegt.

## Ausgaben
- Ergebnis (sofort nach dem E-Mail-Fenster): `ScoreBadge` mit Gesamt und Stufe; fünf Dimensionen als Liste mit Balken (`role="meter"`), Punkten und Stufe, bei «Auftritt» mit Selbstangabe und Check-Wert; zehn Schritte als nummerierte Liste mit Dimension; Hinweis «Richtwerte dieses Werkzeugs»; Hinweis zum Check (zählt mit oder Link zum Werkzeug).
- Kopieren (frei): Markdown aus dem DocumentModel (`toDocument`).
- Export (PDF, Word, über `DocumentExport`, erst nach der Adresse): Kopf mit Firma und Datum, Steckbrief (Gesamt, Stufe, Branche, Grösse, Check), Tabelle der Dimensionen, Schritte, Rechenweg, Antworten.
- CRM (Zugang v3, macht die Engine): Eingabe = «Frage: Antwort» je gestellte Frage, Ausgabe = `resultText` = Markdown des Dokuments (Gesamt und Tabelle stehen oben, weil der Server auf 1'900 Zeichen kürzt).
- Stand: `mt:reifegrad-check` (Engine-Format `phase`, `step`, `answers`).

## Edge Cases
- Leere, unbekannte oder falsch typisierte Antworten: 0 Punkte, keine Ausnahme, kein NaN.
- `messung` mit «keine» und anderen Kennzahlen: «keine» wird ignoriert, die anderen zählen; doppelte Werte zählen einmal.
- Check-Ergebnis fehlt, Phase ist nicht «result», `score` fehlt, ist NaN oder liegt ausserhalb 0 bis 100: wird ignoriert beziehungsweise auf 0 bis 100 begrenzt.
- Profil leer: kein Kontext im Kopf, sonst alles gleich.
- Unbekannter Wert in `groesse`: wird unverändert angezeigt.
- Antworten mit zusätzlichen Schlüsseln (alte Fragen): werden ignoriert.

## Texte
- Tagline: «Zehn Fragen, ein Reifegrad von 0 bis 100 und je Dimension zwei nächste Schritte.»
- SEO-Title: «Reifegrad-Check Schweiz: Marketing in 10 Fragen prüfen»; Meta-Description in `content/tools/reifegrad-check.md`
- Seitentext, FAQ (6) und Alperna-Satz: `content/tools/reifegrad-check.md`; Baustein «Website».

## Tests
`tools/reifegrad-check/logic.test.ts` (19 Fälle): Fragenkatalog (gültig, genau 10, alle Pflicht, jede Frage in genau einer Dimension), alles tiefste Stufe, alles beste, Rechenbeispiel ohne und mit Check, Check fehlt oder ist unbrauchbar, leere und unbekannte Antworten, `messung` mit «keine», Reihenfolge der Schritte mit Gleichstand, Schritte je Stufe (Grenze 50), Stufengrenzen, `toDocument` und `resultText` mit Gesamt und allen Dimensionen, Kontext aus dem Profil, `checkInfo`, Schrittexte ohne Ausrufezeichen und Gedankenstrich.
`tools/reifegrad-check/Tool.test.tsx` (2 Fälle, jsdom): Durchlauf mit Profil und gespeichertem Check (Intro nennt das Datum, zehn Fragen, Ergebnis 42 und Auftritt 53, Schritte beginnen bei Steuerung, Knöpfe für Kopieren und PDF, CRM-Eintrag mit Eingabe und Ausgabe) und Durchlauf ohne Check (Ergebnis 44, Hinweis und Link zum Marketing-Check).

## Nicht Teil dieses Tools
- Keine Benchmarks oder Vergleiche mit anderen Betrieben: Es gibt keine Quelle dafür, also keine Zahl.
- Keine Bewertung der Qualität von Website, Beiträgen oder Texten; dafür gibt es den Marketing-Check, den Textcheck und den Newsletter-Check.
- Keine KI, kein Server, nichts wird nachgeschlagen.
- Kein Schreiben ins Profil: Die Antworten sind Momentaufnahmen, kein Stammdatum.
- Keine Gewichtung nach Branche oder Grösse: Dafür fehlt eine Quelle; der Seitentext sagt, dass die Dimensionen gleich zählen.
