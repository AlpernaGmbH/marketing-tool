# Datenschutz: Faktenblatt für die Rechtsprüfung

Stand 04.10.2026. Das ist **kein Rechtstext** (Harte Regel 8: Rechtstexte schreibt und prüft ein Mensch, `content/legal/`). Das Blatt listet nur, was die Anwendung technisch tut, damit die Datenschutzerklärung (nDSG) vollständig und wahr wird. Jede Zeile nennt die Stelle im Code. Was sich ändert, wird hier nachgeführt.

## 1. Was verlässt den Browser

| Vorgang | Welche Daten | Wohin | Wann | Code |
|---|---|---|---|---|
| Marketing-Check | Adresse der Website, Firmenname, Ort, Branche, Social-Links und Häufigkeit (freiwillig) | Eigener Server (Vercel, Region `fra1`), ruft die öffentliche Startseite, `robots.txt`, `sitemap.xml` ab | Beim Klick auf «Website prüfen» | `app/api/check/route.ts`, `lib/check/net.ts` |
| Lead-Formular | Name, Firma, E-Mail, Telefon (freiwillig), Tool-Name, Kategorie, Zeitpunkt, Quelle | Eigener Server, dann n8n (Alperna, CRM) | Beim Absenden des Formulars oder nach der Anmeldung mit Einwilligung | `lib/lead.ts`, `app/api/lead*/route.ts` |
| Anmeldung über Clerk (ab Einrichtung) | **Beim Klick auf «Anmelden»** lädt der Browser das Skript von Clerk (clerk-js) von der Clerk-Domain unserer Anwendung (Entwicklung: `<name>.clerk.accounts.dev`, später eine Adresse unter `tools.alperna.ch`), dabei sieht Clerk die IP-Adresse des Besuchers. Bei der Anmeldung erfasst Clerk E-Mail-Adresse, Name und, je nach gewähltem Weg, die Angaben von Google, Microsoft oder Apple. **Besucher ohne Konto laden das Skript nie** (durch Test belegt). Wer ein Sitzungs-Zeichen trägt, lädt es bei jedem Besuch, damit die Sitzung frisch bleibt | Clerk, Inc. (USA), danach zurück zu uns | Beim Klick auf «Anmelden» oder «Registrieren», bei jedem Besuch angemeldeter Personen | `lib/clerk-bridge.ts`, `components/site/ClerkRoot.tsx`, `middleware.ts`, `lib/auth.ts` |
| KI-Einordnung (ab Einrichtung, nur angemeldet und freigeschaltet) | Betrieb, Ort, Branche, Host der Website, Punktzahlen, offene Prüfpunkte mit Befund, die ersten acht Schritte. Kein Seiteninhalt, keine E-Mail, kein Name der Person | Eigener Server, dann Vercel AI Gateway (USA), dann Modellanbieter (Standard: Mistral; Liste in `AI_MODELS`) | Automatisch nach dem Ergebnis | `lib/check/ai.ts` (`buildFakten`), `lib/ai.ts` |
| Daten beim Konto (nur angemeldet, nur wenn Redis bereitsteht) | Firmenprofil (Betrieb, Branche, Ort, Website, Zielgruppen, Marke und weitere Felder), Merkliste, Zwischenstände der Werkzeuge (Antworten, Ergebnisse) | Eigener Server, dann Redis (Upstash) | Beim Laden der Seite, 2 Sekunden nach einer Änderung, beim Zurückkehren in den Tab und beim Abmelden | `app/api/account/data/route.ts`, `lib/sync.ts`, `components/site/AccountSync.tsx` |

Ohne Anmeldung bleiben alle Eingaben in Werkzeugen im Browser (localStorage: Firmenprofil `mt:profile`, Zwischenstände `mt:<slug>`, Merkliste `mt:merkliste`, Abgleich-Buchhaltung `mt:_sync`, `mt:_konto`). Mit Anmeldung liegt eine Kopie im Konto (siehe Zeile oben).

## 2. Was auf dem Server gespeichert wird (Redis, Upstash; Region noch offen)

| Schlüssel | Inhalt | Dauer |
|---|---|---|
| `run:<iphash>` | Zähler des freien Durchlaufs | 30 Tage |
| `unlocked:<iphash>` | Freischaltung eines Geräts | 365 Tage |
| `acct:<acchash>` | Freischaltung eines Kontos | 365 Tage |
| `popular:<slug>` | Aufrufzähler pro Werkzeug, ohne Personenbezug | unbegrenzt |
| `ai:<acchash>:<Tag>`, `ai:global:<Tag>` | Zähler der Einordnungen | 2 Tage |
| `data:<acchash>` | **Daten des Kontos**: Firmenprofil, Merkliste und Zwischenstände der Werkzeuge als JSON, je Schlüssel mit Zeitpunkt der letzten Änderung. Der Server liest die Werte nicht und loggt sie nicht. Löschungen bleiben als leerer Eintrag 60 Tage stehen. Höchstens 60 Schlüssel, 600'000 Zeichen. **Nicht verschlüsselt auf Anwendungsebene** (Upstash verschlüsselt im Ruhezustand [Vermutung, bei Upstash zu prüfen]) | **Kein Ablauf**: bis die Person sie unter «Meine Daten im Konto löschen» (oder «Alles löschen») entfernt |
| `aicache:<hash>` | Fertige Einordnung (Text kann den Betriebsnamen enthalten) | 24 Stunden |
| `rl:<name>` | Zähler der Ratenbegrenzung pro `iphash` | wenige Minuten bis Stunden |
| `lead_queue` | **Leads im Klartext** (Name, E-Mail, Telefon), wenn n8n nicht erreichbar ist | Liste verfällt 30 Tage nach dem letzten Eintrag, höchstens 1000 Einträge; sonst bis n8n sie leert |

`<iphash>` ist ein HMAC-SHA256 der IP mit einem geheimen Schlüssel, auf 16 Byte gekürzt. `<acchash>` ist ein HMAC der bei Clerk bestätigten E-Mail-Adresse (unabhängig vom Anbieter, über den die Person sich anmeldet). Klartext-IP und Klartext-E-Mail stehen nirgends in Redis ausser im Lead in `lead_queue`. Die Daten des Kontos können Namen und Angaben des Betriebs im Klartext enthalten (sie gehören der Person, die sie eingibt).

**Offen für die Rechtsprüfung (Daten beim Konto):** Aufbewahrung ohne Ablauf; Löschung nur durch die Person selbst (es gibt keinen automatischen Ablauf bei Inaktivität); Auskunft und Export (Profil lässt sich auf `/profil` exportieren, die übrigen Schlüssel nicht); Region von Upstash; ob das Speichern von Eingaben zusätzlich in der Erklärung zum Konto genannt werden muss.

## 3. Cookies und Speicher im Browser

| Name | Zweck | Dauer | Inhalt |
|---|---|---|---|
| `mt_gate` | Zählt den freien Durchlauf und die Freischaltung | 365 Tage, HttpOnly, SameSite=Lax | `{runs, unlocked, iat}`, signiert |
| Sitzung von Clerk: `__session` (Sitzungs-Token, gilt eine Minute und wird vom Browser erneuert), `__client_uat` (Zeitpunkt der letzten Anmeldung, 0 ohne Anmeldung), in der Entwicklung zusätzlich `__clerk_db_jwt`; auf der Domain von Clerk weitere (`__client`) | Angemeldet bleiben | Sitzung nach den Einstellungen im Clerk-Dashboard (**Dauer dort zu prüfen und festzulegen**, nicht von uns gesetzt); `__client_uat` bleibt bis zum Abmelden | Sitzungskennung und Zeitstempel, bei Clerk dazu Konto und Gerät. Name und E-Mail liest unser Server bei Bedarf von Clerk (nicht im Cookie) |
| localStorage | Firmenprofil, Zwischenstände, Merkliste, Abgleich-Buchhaltung `mt:_sync` | bis der Besucher löscht; bei angemeldeten Personen löscht das Abmelden die Kopie auf dem Gerät, sobald sie im Konto liegt | siehe oben |

Kein Banner, weil die Cookies für den Dienst nötig sind (Entscheid in CLAUDE.md Regel 4; rechtlich zu bestätigen).

## 4. Protokolle

Server-Routen loggen Route, Statuscode und ein Stichwort (`lib/log.ts`). Nie Inhalte, nie Adressen, nie IP, nie E-Mail (durch Tests belegt). Vercel selbst führt eigene Zugriffsprotokolle (Hosting-Anbieter, bei der Prüfung zu nennen).

## 5. Beteiligte Dritte

| Stelle | Rolle | Standort | Quelle der Angabe |
|---|---|---|---|
| Vercel | Hosting, Funktionen `fra1`, AI Gateway | Funktionen Frankfurt; Gateway und Firma USA | `vercel.json`, Plan |
| Upstash | Redis | Region noch festzulegen (Frankfurt vorgesehen) | STATUS.md |
| n8n | CRM-Weiterleitung der Leads (Notion, Mail) | Adresse `n8n-ufvf.srv1747595.hstgr.cloud`, also bei Hostinger; Standort des Servers **offen** | Workflow «Tools-Lead» |
| Notion | CRM: jeder Lead (Name, Firma, E-Mail, Telefon, Werkzeug) wird dort als Eintrag angelegt | USA, Standort laut Vertrag zu prüfen | Workflow «Tools-Lead» |
| Google (Gmail) | Benachrichtigungsmail an kontakt@alperna.ch mit den Angaben des Leads | USA | Workflow «Tools-Lead» |
| Clerk, Inc. | Anmeldung und Benutzerverwaltung (Konten, Sitzungen), Skript im Browser, Rückfragen unseres Servers zu E-Mail und Name | USA; Standort der Daten laut Vertrag zu prüfen | `lib/auth.ts`, `lib/clerk-bridge.ts` |
| Google, Microsoft, Apple | Nur wenn die Person den jeweiligen Weg im Fenster von Clerk wählt (Anmeldung über deren Konto) | USA | Einstellung im Clerk-Dashboard |
| Mistral AI | Modellanbieter der KI (Standard) | EU | `lib/ai.ts` |
| Umami | Statistik: im Code nur als Ereignis-Markierungen, **kein Skript geladen** | offen | `components/tool/DocumentExport.tsx` |
| Fremde Websites | Der Check ruft die vom Besucher genannte Adresse ab (User-Agent `AlpernaCheck/1.0`) | beliebig | `lib/check/net.ts` |

## 6. Zwecke, wie die Anwendung sie nutzt (zur Abstimmung, nicht als Formulierung)

- Check und Ergebnis: Dienst erbringen.
- Zähler und Freischaltung: den freien Durchlauf begrenzen und Missbrauch verhindern.
- Lead: Alperna meldet sich persönlich zum Ergebnis, wenn die Person eingewilligt hat. Die Einwilligung ist im Formular ein Häkchen, bei der Anmeldung ein Häkchen vor dem Öffnen des Fensters.
- KI: nur für angemeldete, freigeschaltete Personen, mit Hinweis im Formular vor dem Start.

## 7. Offen für die Prüfung

1. **`lead_queue`:** Ablauf (30 Tage ab dem letzten Eintrag, gilt für die ganze Liste, nicht je Eintrag) und Obergrenze von 1000 sind umgesetzt (04.10.2026). Ein einzelner Eintrag kann bei laufendem Zustrom länger als 30 Tage liegen. Ob 30 Tage die richtige Frist sind, entscheidet die Rechtsprüfung.
2. **Speicherdauer von Leads im CRM** und Löschweg auf Anfrage: Sache von Alperna.
3. **Auftragsbearbeitung:** Verträge mit Vercel, Upstash, Mistral (über das Gateway) und gegebenenfalls n8n.
4. **Auslandübermittlung (USA):** Clerk, Vercel, AI Gateway; Google, Microsoft und Apple nur auf Wunsch der Person.
5. **Welche Modelle:** Wird `AI_MODELS` geändert (zum Beispiel Alibaba), ändert sich Abschnitt 5.
6. **Verlinkung:** Die Datenschutzerklärung muss von der Startseite und vom Anmeldefenster verlinkt sein (beim Fenster vor der Anmeldung und im Fenster beim Werkzeug umgesetzt). Eigene Google-App (OAuth-Zustimmung) entfällt, solange Clerk die Anmeldung macht; im Produktivbetrieb braucht Clerk für Google, Microsoft und Apple eigene Zugangsdaten.
7. **Clerk:** Auftragsbearbeitungsvertrag mit Clerk, Speicherdauer der Sitzung und der Benutzer im Dashboard, Löschweg für Konten (im Clerk-Dashboard möglich; Daten beim Konto in Redis `data:<acchash>` löscht die Person selbst), Hinweis in der Datenschutzerklärung auf das Laden des Skripts beim Anmelden.
