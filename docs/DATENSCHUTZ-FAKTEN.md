# Datenschutz: Faktenblatt für die Rechtsprüfung

Stand 04.10.2026 (Zugang v3: kein Konto, E-Mail-Adresse vor dem Ergebnis). Das ist **kein Rechtstext** (Harte Regel 8: Rechtstexte schreibt und prüft ein Mensch, `content/legal/`). Das Blatt listet nur, was die Anwendung technisch tut, damit die Datenschutzerklärung (nDSG) vollständig und wahr wird. Jede Zeile nennt die Stelle im Code. Was sich ändert, wird hier nachgeführt.

## 1. Was verlässt den Browser

| Vorgang | Welche Daten | Wohin | Wann | Code |
|---|---|---|---|---|
| E-Mail-Adresse angeben (Fenster vor dem Ergebnis) | E-Mail-Adresse, Einwilligung («Alperna darf mich zu meinem Ergebnis kontaktieren»), Name des Werkzeugs. Kein Name, keine Firma, kein Telefon | Eigener Server (Vercel, Region `fra1`). Die Adresse wird **nur** signiert ins Cookie `mt_gate` geschrieben, nicht gespeichert und noch nicht weitergegeben | Beim Klick auf «Ergebnis anzeigen» im Fenster | `app/api/lead/route.ts`, `lib/lead-schema.ts`, `components/tool/LeadGate.tsx` |
| **Ergebnis ins CRM** (jedes Ergebnis jedes Werkzeugs) | E-Mail-Adresse (aus dem Cookie), Werkzeug, Kategorie, Zeitpunkt, Quelle, Firma aus dem Firmenprofil (falls vorhanden), **die Eingaben der Person** (zum Beispiel Website-Adresse, Betrieb, Ort, Branche, Social-Links; beim Textcheck und Text-Umschreiber der ganze Text; bei Fragebogen die Antworten) und **das Ergebnis** (als Text, zum Beispiel Punktzahl und Schritte, der Bericht, die KI-Fassung). Eingabe und Ausgabe werden auf je 1'900 Zeichen gekürzt. Name und Telefon sind leere Felder | Eigener Server, dann n8n (Alperna, CRM), dort Notion und eine Mail an kontakt@alperna.ch | Sobald ein Werkzeug sein Ergebnis zeigt (bei jedem Ergebnis, auch bei einem zweiten Durchlauf) | `app/api/result/route.ts`, `lib/lead.ts` (`buildPayload`, `clipText`), `components/tool/ToolShell.tsx` (`sendResult`) |
| Marketing-Check | Adresse der Website, Firmenname, Ort, Branche, Social-Links und Häufigkeit (freiwillig) | Eigener Server, ruft die öffentliche Startseite, `robots.txt`, `sitemap.xml` ab. Der Server speichert und loggt nichts davon | Beim Klick auf «Website prüfen», nach dem Fenster | `app/api/check/route.ts`, `lib/check/net.ts` |
| KI-Einordnung im Marketing-Check | Betrieb, Ort, Branche, Host der Website, Punktzahlen, offene Prüfpunkte mit Befund, die ersten acht Schritte. Kein Seiteninhalt, keine E-Mail, kein Name der Person | Eigener Server, dann der KI-Anbieter (siehe Abschnitt 5) | Automatisch nach dem Ergebnis, sobald eine Adresse bekannt ist | `lib/check/ai.ts` (`buildFakten`), `lib/ai.ts`, `app/api/ai/route.ts` |
| Generatoren (Werkzeuge der Klasse B, Route `/api/generate`) | Die Angaben, die das Werkzeug nennt: Betrieb, Branche, Ort, die Eingaben der Person (zum Beispiel Angebot, Zielgruppe) und, wo das Werkzeug die Website liest, Titel, Überschriften und bis 8'000 Zeichen Text der Startseite. Nie die E-Mail-Adresse, nie das ganze Profil | Eigener Server, dann der KI-Anbieter (wie unten) | Beim Klick auf den Knopf des Werkzeugs («Entwurf erstellen», «Ideen finden») | `app/api/generate/route.ts`, `lib/generator.ts`, `tools/<slug>/generator.ts` |
| Website lesen (Route `/api/read`) | Adresse der Website | Eigener Server ruft die Startseite ab (wie der Marketing-Check); gespeichert und geloggt wird nichts | Beim Klick im Werkzeug | `app/api/read/route.ts`, `lib/read.ts` |
| Text-Umschreiber und KI-Prüfung im Textcheck | **Der Text, den die Person einfügt** (bis 3'000 Zeichen), gewählter Stil und gewählte Anrede. Kein Name, keine Profildaten. Der Textcheck sendet an die KI nur auf Klick auf «Mit KI prüfen» | Eigener Server, dann der KI-Anbieter. **Standard: Mistral AI (Frankreich), direkt, kostenloser Plan «Experiment»** (`MISTRAL_API_KEY`); ohne Schlüssel das Vercel AI Gateway (USA) und von dort das Modell aus `AI_MODELS`. **Im Plan «Experiment» dürfen Eingaben und Ausgaben für das Training der Modelle genutzt werden** (Quelle: help.mistral.ai, Stand 04.10.2026, vor der Veröffentlichung der Datenschutzerklärung erneut prüfen). Der Server speichert und loggt den Text nicht (nur Statuscode und Fehlerklasse) | Beim Klick auf «Umschreiben» bzw. «Mit KI prüfen» | `app/api/text/route.ts`, `lib/ai.ts` (`mistralChat`, `generateFreeText`), `tools/text-umschreiber/logic.ts` |

Alle übrigen Eingaben bleiben im Browser (localStorage: Firmenprofil `mt:profile`, Zwischenstände `mt:<slug>`, Merkliste `mt:merkliste`, Merker der angegebenen Adresse `mt:_lead`). Es gibt kein Konto, kein Passwort und keine Speicherung von Profildaten auf dem Server.

**Wichtig für die Erklärung:** Mit Zugang v3 gehen **Eingaben und Ergebnisse** der Werkzeuge an Alperna, nicht mehr nur Kontaktdaten. Das muss die Datenschutzerklärung und das Fenster klar sagen (im Fenster steht es: «Dein Ergebnis und deine Eingaben gehen mit der Adresse an Alperna»). Beim Textcheck und Text-Umschreiber ist das der ganze Text der Person.

## 2. Was auf dem Server gespeichert wird (Redis, Upstash; Region noch offen)

| Schlüssel | Inhalt | Dauer |
|---|---|---|
| `popular:<slug>` | Aufrufzähler pro Werkzeug, ohne Personenbezug (ein Zähler je gesendetem Ergebnis) | unbegrenzt |
| `ai:<acchash>:<Tag>`, `ai:global:<Tag>` | Zähler der Einordnungen je E-Mail-Adresse (als HMAC) und aller KI-Anfragen insgesamt (nur Zahlen, kein Text) | 2 Tage |
| `aicache:<hash>` | Fertige Einordnung (Text kann den Betriebsnamen enthalten) | 24 Stunden |
| `rl:<name>` | Zähler der Ratenbegrenzung pro `iphash` | wenige Minuten bis Stunden |
| `lead_queue` | **Ergebnisse im Klartext** (E-Mail, Firma, Eingabe, Ausgabe), wenn n8n nicht erreichbar ist | Liste verfällt 30 Tage nach dem letzten Eintrag, höchstens 1000 Einträge; sonst bis der tägliche Cron sie leert |

Entfallen seit Zugang v3: `run:`, `unlocked:`, `acct:`, `data:` (kein freier Durchlauf mehr zu zählen, keine Freischaltung, kein Konto, keine Daten beim Konto).

`<iphash>` ist ein HMAC-SHA256 der IP mit einem geheimen Schlüssel, auf 16 Byte gekürzt. `<acchash>` ist ein HMAC der E-Mail-Adresse aus dem Cookie. Klartext-IP steht nirgends in Redis; Klartext-E-Mail nur im Ergebnis in `lead_queue`.

## 3. Cookies und Speicher im Browser

| Name | Zweck | Dauer | Inhalt |
|---|---|---|---|
| `mt_gate` | Merkt die angegebene E-Mail-Adresse, damit die Person sie nicht bei jedem Ergebnis neu eingibt und der Server weiss, an welche Adresse ein Ergebnis gehört | 365 Tage, HttpOnly, SameSite=Lax | `{email, iat}`, signiert (HMAC-SHA256 mit `GATE_SECRET`); ohne gültige Signatur ungültig |
| localStorage | Firmenprofil, Zwischenstände, Merkliste, Merker der Adresse (`mt:_lead`, nur zur Anzeige «Ergebnisse gehen an …») | bis der Besucher löscht («Alles löschen» auf `/profil`) | siehe oben |

Kein Banner, weil das Cookie für den Dienst nötig ist (Entscheid in CLAUDE.md Regel 4; rechtlich zu bestätigen). Es gibt keine weiteren Cookies und kein Skript eines Dritten (Umami ist vorgesehen, aber nicht geladen).

## 4. Protokolle

Server-Routen loggen Route, Statuscode und ein Stichwort (`lib/log.ts`). Nie Inhalte, nie Adressen, nie IP, nie E-Mail (durch Tests belegt: `app/api/routes.test.ts`, `app/api/check/route.test.ts`, `app/api/text/route.test.ts`, `app/api/cron/leads/route.test.ts`). Vercel selbst führt eigene Zugriffsprotokolle (Hosting-Anbieter, bei der Prüfung zu nennen).

## 5. Beteiligte Dritte

| Stelle | Rolle | Standort | Quelle der Angabe |
|---|---|---|---|
| Vercel | Hosting, Funktionen `fra1`, Cron, AI Gateway (nur ohne `MISTRAL_API_KEY`) | Funktionen Frankfurt; Gateway und Firma USA | `vercel.json`, Plan |
| Upstash | Redis | Region noch festzulegen (Frankfurt vorgesehen) | STATUS.md |
| n8n | CRM-Weiterleitung der Ergebnisse (Notion, Mail) | Adresse `n8n-ufvf.srv1747595.hstgr.cloud`, also bei Hostinger; Standort des Servers **offen** | Workflow «Tools-Lead» |
| Notion | CRM: jedes Ergebnis (E-Mail, Firma, Werkzeug, Eingabe, Ausgabe) wird dort als Eintrag angelegt | USA, Standort laut Vertrag zu prüfen | Workflow «Tools-Lead», Datenbank «Tools-Leads» |
| Google (Gmail) | Benachrichtigungsmail an kontakt@alperna.ch mit den Angaben des Ergebnisses | USA | Workflow «Tools-Lead» |
| Mistral AI | Modellanbieter der KI. Mit `MISTRAL_API_KEY` direkt (Plan «Experiment»: Eingaben dürfen zum Training genutzt werden), sonst über das Vercel AI Gateway | Frankreich (EU); Standort der Verarbeitung laut Vertrag zu prüfen | `lib/ai.ts` |
| Umami | Statistik: im Code nur als Ereignis-Markierungen, **kein Skript geladen** | offen | `components/tool/DocumentExport.tsx` |
| Fremde Websites | Der Check ruft die vom Besucher genannte Adresse ab (User-Agent `AlpernaCheck/1.0`) | beliebig | `lib/check/net.ts` |

Entfallen seit Zugang v3: Clerk, Google/Microsoft/Apple als Anmeldewege.

## 6. Zwecke, wie die Anwendung sie nutzt (zur Abstimmung, nicht als Formulierung)

- Check und Ergebnis: Dienst erbringen.
- E-Mail-Adresse und Ergebnis ins CRM: Alperna meldet sich persönlich zum Ergebnis, wenn die Person eingewilligt hat (Häkchen im Fenster, Pflicht). Die Eingaben und das Ergebnis gehen mit, damit Alperna beim Gespräch weiss, worum es geht.
- Zähler und Ratenbegrenzung: Missbrauch verhindern, Beliebtheit der Werkzeuge messen (ohne Personenbezug).
- KI: Einordnung, Umschreiben und Prüfen von Texten, mit Hinweis im Werkzeug («Gib nichts Vertrauliches ein»).

## 7. Offen für die Prüfung

1. **Eingaben und Ergebnisse im CRM:** Speicherdauer bei Alperna (Notion), Löschweg auf Anfrage, ob der Zweck «persönliche Rückmeldung» die Weitergabe des ganzen Textes (Textcheck, Umschreiber) deckt oder ob dort nur ein Auszug gehen soll. Technisch leicht änderbar (`CLIP_CHARS` in `lib/lead.ts`, oder die Felder je Werkzeug).
2. **`lead_queue`:** Ablauf (30 Tage ab dem letzten Eintrag, gilt für die ganze Liste, nicht je Eintrag) und Obergrenze von 1000 sind umgesetzt. Ein einzelner Eintrag kann bei laufendem Zustrom länger als 30 Tage liegen.
3. **Auftragsbearbeitung:** Verträge mit Vercel, Upstash, Mistral (direkt oder über das Gateway) und gegebenenfalls n8n/Hostinger. Im kostenlosen Mistral-Plan gibt es keinen Vertrag zur Auftragsbearbeitung nach nDSG [Vermutung, bei Mistral zu klären]; der bezahlte Plan «Scale» schliesst das Training aus.
4. **Auslandübermittlung (USA):** Vercel, Notion, Gmail, AI Gateway (nur ohne Mistral-Schlüssel).
5. **Welche Modelle:** Wird `MISTRAL_MODELS` oder `AI_MODELS` geändert, ändert sich Abschnitt 5.
6. **Verlinkung:** Die Datenschutzerklärung ist von der Startseite und vom Fenster beim Werkzeug verlinkt (umgesetzt).
7. **Cookie-Inhalt:** Das Cookie enthält die E-Mail-Adresse im Klartext (Base64, signiert, HttpOnly). Ob das in der Erklärung besonders zu nennen ist, entscheidet die Prüfung; technisch liesse sich stattdessen nur ein HMAC speichern, dann müsste die Adresse aber bei jedem Ergebnis aus dem Browser mitkommen (weniger verlässlich).
