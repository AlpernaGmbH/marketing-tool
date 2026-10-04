# Persona-Generator (persona)

Klasse B (Generator mit KI, braucht den Server), Stand 04.10.2026. Baut auf dem Generator-Baustein auf (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`), Vorbild `tools/ideen-aus-website`. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die «für alle» schreiben und darum niemanden erreichen: in rund vier Minuten eine Persona, also eine erfundene, konkrete Person aus der Zielgruppe mit Name, Alltag, Zielen, Sorgen, Informationswegen, Einwänden, Tonfall und Wörtern, an die sie jeden Text richten.

## Kategorie und Verknüpfung
Kategorie: strategie (dritter Schritt im Pfad «Strategie», nach Digitaler-Auftritt-Check und ICP-Builder), Zielgruppe: kmu
Liest aus Profil: firma, branche, ort (Grunddaten über `ProfileFieldsForm`), primaersegment und zielgruppen (Vorschlag für «Für wen ist das Angebot?»)
Schreibt ins Profil: personas (anhängen, höchstens 10, gleicher Name ersetzt den Eintrag). Die Grunddaten-Felder schreiben beim Tippen ins Profil, wie beim Check.
Verwandte Tools: icp-builder (Gruppe und Kriterien), positionierung, text-umschreiber (Texte in den Ton der Persona bringen)
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Persona erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate()` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und CRM (`sendResult`).
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Zielgruppe, Betrieb, Branche, Ort, Altersgruppe, Rolle, Angebot, Situation, Fragen; eine Angabe je Zeile, Freitexte auf eine Zeile geglättet). Ausgabe = `reportMarkdown` (das Dokument als Markdown).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`).
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen | «Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 | – |
| Für wen ist das Angebot? | text | ja | Profil `primaersegment`, sonst `zielgruppen[0].name` (nur solange das Feld leer ist) | 1 bis 200 Zeichen | «Zum Beispiel «Hausbesitzer in Gossau und Umgebung». Steht in deinem Profil ein Primärsegment, steht es hier schon.» |
| Was bietest du dieser Gruppe an? | textarea | ja | – | 20 bis 600 Zeichen | «Zwei bis vier Sätze: Leistung, Besonderheit, Ablauf.» |
| Altersgruppe | single (select) | ja | gespeicherter Stand | `unter-30`, `30-45`, `45-60`, `ueber-60`, `gemischt` (Labels «unter 30», «30 bis 45», «45 bis 60», «über 60», «gemischt») | – |
| Rolle | single (select) | ja | gespeicherter Stand | `privatperson`, `kmu-inhaber`, `fachperson`, `verwaltung`, `vereinsvorstand` (Labels «Privatperson», «Inhaberin oder Inhaber eines KMU», «Angestellte Fachperson», «Verwaltung oder Gemeinde», «Vereinsvorstand») | – |
| Typische Situation, in der sie dich braucht | textarea | nein | – | max. 600 | Beispiel Fassade |
| Fragen, die sie dir stellt | textarea | nein | – | max. 600 | «Was du am Telefon oder vor Ort immer wieder hörst, eine Frage je Zeile.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort und die Angaben zur Zielgruppe, nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein, zum Beispiel keine Namen echter Kundinnen und Kunden.»

## Logik
1. **Vorschlag** (`withVorschlag`): Ist die Zielgruppe im gespeicherten Formular leer, steht `zielgruppeVorschlag(profile)` im Feld (Primärsegment, sonst erste Zielgruppe). Sobald die Person tippt, gilt ihr Text; ein geleertes Feld wird nicht erneut vorbefüllt, bis die Seite neu lädt.
2. **Eingabe prüfen** (`inputProblem`): Betrieb leer → Meldung; Zielgruppe leer oder länger als 200 → Meldung; Angebot kürzer als 20 oder länger als 600 → Meldung; Altersgruppe oder Rolle nicht gewählt → Meldung; Situation oder Fragen länger als 600 → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers.
3. **Eingabe für die KI** (`toInput`): betrieb, branche, ort (eine Zeile, gekürzt), zielgruppe (eine Zeile, ≤ 200), angebot, situation, fragen (Absätze bleiben, ≤ 600), altersgruppe und rolle als Schlüssel. Schema `personaInput` (zod) im Browser und in der Route. `promptData` ersetzt die Schlüssel durch die Labels, bevor sie an die KI gehen («45 bis 60», «Privatperson»).
4. **Entwurf** (`useGenerator(personaGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus die Aufgabe (eine Persona für ein Schweizer KMU, fiktiver Vor- und Nachname, Altersgruppe wörtlich, kein Alter in Ziffern, Ziffern nur aus den Angaben, Schweizer Alltag und Orte, keine Klischees, Bedeutung jedes Felds, dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zur Zielgruppe", promptData(input))`. `maxTokens` 1'200, `temperature` 0.6.
5. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): JSON, Schema `personaOutput` (name 3..40, kurz 40..240, alltag 80..500, ziele/sorgen/informationswege je 3 bis 5 Punkte à 10..160, einwaende 2 bis 4, soSprichstDuSieAn {ton 20..240, woerter 4 bis 8 à 2..40, vermeiden 3 bis 6 à 2..40}, zitat 20..200), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkPersona`: «name» ist nicht der Betrieb (ohne Gross/Klein) → sonst «name»; jede Ziffernfolge in allen Texten der Persona muss in den Angaben stehen (Betrieb, Branche, Ort, Zielgruppe, Angebot, Situation, Fragen und das Label der Altersgruppe; `numbersIn` wie beim Text-Umschreiber) → sonst «zahl». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («Mitte vierzig», «drei Tage») sind erlaubt, nur Ziffern werden geprüft. Bei Altersgruppe «gemischt» steht keine Zahl im Label; eine Altersangabe in Ziffern wird dann verworfen.
6. **Stand speichern** (`mt:persona`): `{ v: 1, form, input, output }`. `form` ist das Formular (bleibt nach dem Neuladen und nach «Neue Persona» gefüllt), `input` die Eingabe, die den Entwurf erzeugt hat (für die Facts im Dokument), `output` der Entwurf. Das Formular wird vor der Anfrage gespeichert, der Entwurf danach. `parseState` liefert bei kaputten Daten den leeren Stand; kaputtes `input` oder `output` fällt allein weg, das Formular bleibt (unbekannte Altersgruppe oder Rolle wird leer).
7. **Profil** (`profilePatch`): nur nach einem frisch erzeugten Entwurf. Hängt `{ name, zielgruppe, kurz }` an `personas` an; ein Eintrag mit gleichem Name (ohne Gross/Klein) wird ersetzt, andere Felder des Eintrags bleiben; mehr als 10 Einträge verdrängen den ältesten (das Profil-Schema lässt höchstens 10 zu, sonst fiele das ganze Feld weg).
8. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown`).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Persona» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», dem Namen, der Liste der Platzhalter (`placeholdersIn`) und `DocView` mit den Blöcken des Dokuments (ohne den KI-Hinweis, den die Karte selbst zeigt: `screenBlocks`). Darunter der Hinweis, dass die Persona im Firmenprofil unter «Personas» steht.
- Dokument (`toDocument`): Titel «Persona: <Name>», Untertitel «Eine erfundene Person aus der Zielgruppe «…» von <Betrieb>», Facts Zielgruppe, Altersgruppe, Rolle; KI-Hinweis; der Satz «kurz»; Abschnitte «Alltag» (Absatz), «Ziele», «Sorgen», «Wo sie sucht und liest», «Einwände» (je Liste), «So sprichst du sie an» (Facts Ton, Wörter, die ankommen, Wörter, die abschrecken), «Fiktives Zitat» (Absatz in «»). Dateiname `persona-<name>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (setzt den Fokus auf das Feld «Für wen ist das Angebot?», die Persona bleibt stehen), «Neue Persona» (löscht Entwurf und Eingabe, das Formular bleibt gefüllt, Fokus auf das erste Feld).
- Fortschritt mit `role="status"`: «Die KI schreibt deine Persona.»
- Zählung: `popular:persona` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Firma muss getippt werden (Meldung «Gib den Namen deines Betriebs an.»); Branche und Ort gehen leer an die KI; die Zielgruppe hat keinen Vorschlag.
- Zielgruppe leer, Angebot zu kurz oder zu lang, Altersgruppe oder Rolle nicht gewählt: Meldung im Werkzeug, kein Aufruf.
- Freitexte über der Grenze: Meldung; der gespeicherte Stand behält bis 2'000 Zeichen je Feld, damit die Meldung nach dem Neuladen wieder kommt.
- Antwort mit genauem Alter in Ziffern («52») oder anderer fremder Zahl: verworfen, Meldung, kein CRM-Eintrag. Zahlen aus dem Angebot («innert 3 Arbeitstagen») und aus der Altersgruppe («zwischen 45 und 60») sind erlaubt.
- Antwort, deren Name der Betrieb ist: verworfen.
- Antwort mit Wörtern aus der Sperrliste in «vermeiden» (zum Beispiel «innovativ»): verworfen durch `textIssue`; die Anweisung bittet die KI darum, dort keine Wörter aus den Regeln zu nennen.
- Platzhalter «[Name des Dorfladens]»: erlaubt, Liste über dem Entwurf.
- Zweite Persona mit demselben Namen wie eine frühere: ersetzt den Eintrag im Profil. Elfte Persona: die älteste fällt aus dem Profil.
- Cookie fehlt (403 bei /api/generate): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz, Stand bleibt.
- Gespeicherter Stand kaputt, falsche Version: leerer Stand; nur kaputter Entwurf: Formular bleibt.
- Nach dem Neuladen steht die Persona wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag.

## Texte
- Tagline: «Aus deiner Zielgruppe wird eine konkrete Person, an die du jeden Text richtest.»
- SEO-Title: «Persona-Generator Schweiz: deine Zielgruppe als Person»; Meta-Description in `content/tools/persona.md`.
- Keyword «Persona»: in H1 und Text. Das Wort ist zugleich der Gegenstand der Seite und steht darum öfter als fünf Mal; der Text weicht wo möglich auf «die Person» und «sie» aus.
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit einer von Hand geschriebenen, erkennbar erfundenen Persona), FAQ (6) und Alperna-Satz (Baustein Social Media): `content/tools/persona.md`.

## Tests
`tools/persona/generator.test.ts` (Listen und Labels, Eingabeschema mit Grenzen, Ausgabeschema mit Mengen, `numbersIn`, `checkPersona` lässt Zahlen aus Altersgruppe und Angebot durch und verwirft fremde Ziffern und den Betriebsnamen, `checkGenerated` mit gültiger Antwort im Codeblock, mit Platzhalter, mit fremder Zahl, mit Betriebsname, mit kaputtem Schema, mit verbotenem Wort; Prompt ohne Eingaben in der Anweisung, Labels in der Nutzernachricht) und `logic.test.ts` (Labels und Schlüssel, Vorschlag aus dem Profil, `withVorschlag`, `inputProblem` je Feld, `toInput` kürzt und gibt null ohne Altersgruppe, `formFromInput`, `eingabeText`, `toDocument` mit allen Abschnitten und ohne Eingabe, `screenBlocks`, `reportMarkdown`, `profilePatch` hängt an, ersetzt und begrenzt auf 10, `parseState` bei kaputten Daten). Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Mehrere Personas in einem Durchlauf: eine je Anfrage; für die zweite ändert die Person die Angaben.
- Bild oder Porträt der Persona: keine Bilder (keine Stockfotos, Designsystem).
- Statistik zu Altersgruppen oder Kaufverhalten: keine Zahlen ohne Quelle; die KI darf nur Ziffern aus den Angaben verwenden.
- Bewertung von Anfragen anhand der Persona: macht der ICP-Builder.
- Fertige Texte für die Persona: macht der Text-Umschreiber.
- Vereins-Variante («für Schweizer Vereine»): audience kmu; Vereinsvorstand ist als Rolle der Zielgruppe wählbar.
- Rechtsaussagen (Regel 8): keine.
