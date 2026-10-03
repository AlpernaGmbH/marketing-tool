# <Tool-Name> (<slug>)

## Nutzen in einem Satz
Für wen, welches Ergebnis, in wie vielen Minuten.

## Kategorie und Verknüpfung
Kategorie: strategie | content | analyse | schweiz | ki
Liest aus Profil: …
Schreibt ins Profil: …
Verwandte Tools: …

## Eingaben
Tabelle: Feld | Typ (single/multi/text/number/scale/ranking/matrix/file) | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext

## Logik
Schritt für Schritt, was aus den Eingaben wird. Formeln ausgeschrieben. Jede Annahme als «Annahme:» markiert, mit Quelle oder «ohne Quelle, im UI als Schätzung kennzeichnen».

## Ausgaben
Was der Nutzer sieht (Ergebnisbereich), was er kopieren kann, was er exportiert (PDF/DOCX/CSV/ICS/PNG), was hinter dem LeadGate liegt.

## Edge Cases
- Leere oder widersprüchliche Eingaben
- Extremwerte (0, sehr gross)
- Profil leer
- Daten-Datei fehlt oder ohne Quelle

## Texte
- Tagline (≤ 110 Zeichen)
- SEO-Title (≤ 60, mit «Schweiz»), Meta-Description (≤ 155)
- Erklärtext-Gliederung für content/tools/<slug>.md (300–500 Wörter)
- FAQ: 4–6 Fragen mit Antworten
- Alperna-CTA-Satz («Was Alperna daraus macht»)

## Tests
Mindestens fünf Fälle für logic.ts, davon zwei Edge Cases.

## Nicht Teil dieses Tools
Was bewusst weggelassen wird, damit es klein bleibt.
