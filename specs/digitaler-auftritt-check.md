# Digitaler-Auftritt-Check (digitaler-auftritt-check)

Klasse A (Analyse), Etappe 1c, Stand 04.10.2026. Ersetzt den Fragebogen der Etappe 1b. Die Prüf-Engine stammt aus dem Agentur-Tool von Alperna (`lib/marketing-check/analyzer.mjs`, Stand 02.10.2026) und liegt hier als TypeScript in `lib/check/`. Gewichte und Punktzahlen sind gleich geblieben: alperna.ch ergibt in beiden Systemen 53 Punkte (geprüft am 04.10.2026 mit `industry: b2b`).

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von Schweizer KMU: die Adresse der Website eingeben und in rund zehn Sekunden sehen, wie vollständig der Auftritt im Netz ist, mit einer nach Wirkung geordneten Liste der nächsten Schritte.

## Kategorie und Verknüpfung
Kategorie: strategie (erster Schritt im Pfad «Strategie»)
Liest aus Profil: firma, website, ort, branche, kanaele
Schreibt ins Profil: firma, website, ort (live über das Formular), branche und kanaele (nur wenn leer, nach dem Ergebnis)
Verwandte Tools: gbp-check, bewertungs-kit, positionierung (entstehen später; die Seite verlinkt nur, was es gibt)
`needsServer: true`: die Adresse geht an `/api/check`.

## Eingaben
Alle Felder ausser Branche und Social Media kommen aus dem Firmenprofil und werden vorbefüllt (Harte Regel 10).

| Feld | Quelle | Pflicht | Hinweis |
|---|---|---|---|
| firma | Profil | ja | Name im Export |
| website | Profil (neu) | ja | `normalizeUrl`: ergänzt https, lehnt IP-Adressen, Zugangsdaten und fremde Protokolle ab |
| ort | Profil | nein | verbessert die Suche nach dem Google-Profil |
| industry | Auswahl, Vorschlag aus `profil.branche` (`guessIndustry`) | ja | 12 Branchen; bestimmt, ob Shop und Buchung zählen |
| Social-Media-Kanäle | nur dieses Werkzeug | nein | pro Kanal Adresse und Häufigkeit; ohne Häufigkeit gilt «etwa monatlich» als Annahme |

## Ablauf
1. `ToolShell.requestStart()` prüft den freien Durchlauf (`/api/access`).
2. `POST /api/check` streamt NDJSON: `step` (start/done) für `fetch`, `seo`, `gbp`, `social`, `detect`, `score`, dann `result` oder `error`. Der Fortschritt im Browser folgt diesen Ereignissen und ist nicht erfunden.
3. Der Server prüft vor dem Abruf Eingabe, Limit (8 pro Stunde und IP-Hash) und `canStart`. Ohne `GATE_SECRET` oder bei Redis-Ausfall wird niemand gesperrt.
4. Ergebnis wird in `mt:digitaler-auftritt-check` gespeichert (`phase: "result"`, damit der Pfad-Fortschritt weiter funktioniert) und über `/api/access/complete` gezählt.
5. «Erneut prüfen» setzt auf den Start zurück, `counted` wird false: der nächste Start zeigt das LeadGate.

## Logik (lib/check)
- Abruf nur über `safeFetch`: Host auflösen, jede Adresse prüfen, Verbindung an die geprüfte Adresse binden, jede Weiterleitung neu prüfen, höchstens 2,5 MB, 12 s, fünf Weiterleitungen. Ports nur 80 und 443. Gesperrt: private, Loopback-, Link-Local-, Carrier-NAT-, Dokumentations- und Multicast-Adressen, auch als IPv4-in-IPv6.
- Abgerufen werden Startseite, `/robots.txt`, `/sitemap.xml`. Nichts sonst.
- Kategorien und Gewichte: Website und SEO 25 · Google-Business-Profil 20 · Social Media 20 · Online-Werbung und Tracking 12 · Newsletter 9 · Online-Shop 7 × Relevanz · Online-Buchung 7 × Relevanz (hoch 1, mittel 0,5, gering 0).
- Gesamtpunktzahl = Σ(Gewicht × Punkte) ÷ Σ Gewichte × 100, gerundet.
- SEO: 16 Prüfpunkte mit Gewichten 0,5 bis 3 (`lib/check/seo.ts`).
- Google-Profil: mit `GOOGLE_PLACES_API_KEY` Suche über Places API (New), sonst nur Hinweis aus einem Maps-Link auf der Website (Punkte 0,5, sonst 0,25). Ohne Schlüssel gilt der Bereich als **nicht bestätigt**, und das Ergebnis sagt es.
- Social: Kanäle aus Eingabe und Links auf der Website; Formel `min(1, 0,55·best + 0,25·Ø + 0,1·min(1, n/3) + 0,1·verlinkt/n)`. Die Häufigkeit ist eine Selbstangabe.
- Prüfpunkte, die nur eine Annahme sind (Häufigkeit nicht angegeben) oder ein fehlendes Werbe-Tracking, tragen `info: true`: sie zählen in der Punktzahl wie im Agentur-Tool, erzeugen aber keine Massnahme.
- Massnahmen: höchstens eine pro offenem Prüfpunkt, fester Text, Wirkung und Aufwand als Einschätzung von Alperna. Sortierung: Wirkung, dann Aufwand, dann Reihenfolge der Prüfung. Jede Massnahme trägt die Kennung ihres Prüfpunkts (`itemId`); die KI-Schicht (Etappe 2) darf nur auf diese Kennungen verweisen.

## Ausgaben
- Ergebnis: Punktzahl mit Stufe (`ScoreBadge`), erfüllte Prüfpunkte, die ersten acht Schritte, alle Bereiche mit Prüfpunkten (aufklappbar), Kasten «Was gemessen ist und was nicht».
- Kopieren (frei): Markdown aus dem DocumentModel.
- Export (hinter dem LeadGate): PDF und DOCX mit Kopf, Punktzahl, Bereichstabelle, allen Schritten, allen Prüfpunkten und den Messhinweisen.

## Edge Cases (getestet)
- Website nicht erreichbar, Fehlerseite, HTTP 403/429 (Bot-Sperre): verständliche Meldung, freier Durchlauf bleibt unverbraucht.
- https scheitert: einmal http versuchen.
- Adresse zeigt auf eine interne IP: `blocked`, ohne Hinweis auf die Adresse.
- Zu viele Weiterleitungen, zu grosse oder zu langsame Antwort: abgebrochen beziehungsweise gekappt.
- `noindex` im Meta-Tag oder im Header; mehrere H1; Latin-1-Seiten; gzip und Brotli.
- Branche mit Relevanz «gering»: Bereich zählt nicht und steht als Hinweis, nicht als Mangel.
- Stream bricht ab oder liefert Müll: Meldung, kein Absturz.
- Zwischenstand der Fragebogen-Version oder beschädigte Daten: Start, nichts geht verloren.

## Nicht Teil dieses Werkzeugs
- Die Punktzahl, die Bereiche und die Schritte sind regelbasiert und entstehen ohne KI. Nur die Einordnung (siehe unten) schreibt eine KI, und nur für angemeldete, freigeschaltete Personen.
- Kein Zwischenspeicher je Domain (braucht Redis, die Integration ist noch nicht verbunden).
- Keine Unterseiten, kein Rendern von JavaScript, keine PageSpeed-Messung. Eine Website, die Inhalte erst im Browser lädt, erscheint leerer, als sie ist.
- Kein Auslesen von Instagram, LinkedIn, TikTok oder Google ohne Schnittstelle.

## KI-Einordnung (Etappe 2)
- Voraussetzung: Konto (Google) und Freischaltung; das Ergebnis trägt die Signatur des Servers (`sig`). Ohne eines davon erscheint der Block nicht und der Browser ruft `/api/ai` gar nicht erst auf.
- Inhalt: zwei bis drei Sätze Zusammenfassung und bis zu drei Prioritäten, je mit Verweis auf einen Schritt aus der Liste und ein bis zwei Sätzen Begründung. Das Modell sieht nur das Fakten-JSON (`buildFakten`), keine Seite und keine Eingaben ausser Betrieb, Ort, Branche und Host.
- Prüfung vor der Anzeige: Schema, Länge, nur Zahlen aus den Fakten, nur bekannte Schrittkennungen, Alperna-Sperrliste, keine Ausrufezeichen, Emojis, Links. Sonst verworfen.
- Grenzen: 5 pro Konto und Tag, 200 pro Tag insgesamt, 20 pro Stunde und IP-Hash. Fertige Einordnungen liegen 24 Stunden im Zwischenspeicher.
- Fehlerbild: Der Check bleibt vollständig. Der Block sagt ruhig, dass die Einordnung gerade nicht verfügbar ist, und bietet einen neuen Versuch (nicht bei verbrauchtem Tageslimit).
- Export: Die Einordnung steht im Dokument unter «Einordnung (von einer KI formuliert)», wenn sie vorhanden ist.
- Tests: `lib/check/{ai,ai-client,sign}.test.ts`, `lib/ai-quota` über `app/api/ai/route.test.ts`, `Result.test.tsx`, Smoke-Tests «KI-Einordnung im Browser».

## Texte
- Seitentext: `content/tools/digitaler-auftritt-check.md` (Beispiel Malerei Keller, Gossau mit dem echten Ergebnis der Engine auf einer Beispielseite).
- Alperna-Pitch: Baustein «Website», Beweis aus `content/pitch/bausteine.md`.

## Tests
`lib/check/*.test.ts` (Netz-Schutz, Engine, Massnahmen, Browser-Client), `app/api/check/route.test.ts`, `tools/digitaler-auftritt-check/{logic.test.ts,Result.test.tsx}`, Smoke-Tests in `tests/e2e/smoke.spec.ts`.
