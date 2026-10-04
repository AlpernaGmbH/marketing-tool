# Umzug auf einen anderen Vercel-Account

Stand 04.10.2026. Der Code liegt vollständig in GitHub (`AlpernaGmbH/marketing-tool`, Branch `main`). In Vercel steckt nur die Projektkonfiguration. Es gibt keine Projekt-IDs im Code (`vercel.json` setzt nur die Region `fra1`, kein `.vercel`-Ordner im Repo). Der Umzug ist also: neues Projekt aus demselben Repo, Variablen setzen, prüfen, altes Projekt abschalten.

## Alter Stand (Team `alpernatoolv1`, Projekt `marketing-tool`, Hobby)

| Einstellung | Wert |
|---|---|
| Framework | Next.js |
| Node-Version | 24.x |
| Region | `fra1` (aus `vercel.json`) |
| Deployment-Schutz | Vercel Authentication, «alle ausser eigene Domains» |
| Domains | nur `*.vercel.app`; `tools.alperna.ch` ist noch nicht eingetragen |
| Branch | Auto-Deploy aus `main` |

## Variablen

| Name | Umgebungen | Wert / Herkunft |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | alle | `https://tools.alperna.ch` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | alle | `41798513631` |
| `NEXT_PUBLIC_ERSTGESPRAECH_URL` | alle | `https://calendly.com/alperna/erstkontakt` |
| `GATE_SECRET` | Production, Preview, Development | **neu erzeugen** (mindestens 16 Zeichen, zufällig). Der alte Wert ist nicht lesbar. Folge: bestehende `mt_gate`-Cookies werden ungültig, Besucher haben dann wieder einen freien Durchlauf. Vor dem Start ohne Folgen. |
| `N8N_WEBHOOK_URL` | Production, Preview, Development | aus dem n8n-Workflow «Tools-Lead» (`BC48H0mAidcbY4zH`): Basis-URL plus Produktionspfad des Webhook-Knotens. Als «Sensitive» setzen, nicht in Chats zeigen. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | alle | entstehen, wenn **im neuen Account** Upstash (Produkt Redis) mit dem Projekt verbunden wird |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Production, Preview | Etappe 2, nach dem Umzug (Redirect-URIs hängen von der neuen `*.vercel.app`-Adresse ab) |
| `GOOGLE_PLACES_API_KEY` | optional | später, braucht Zahlungsmittel bei Google |

Nicht mitnehmen: `REDIS_URL` (Redis Inc., vom Code nicht genutzt).

## Reihenfolge

1. Neuer Account: Plan prüfen. Hobby ist laut Vercel für private, nicht gewerbliche Nutzung gedacht; für ein Werkzeug, das Leads für Alperna bringt, ist Pro die sichere Wahl [Wahrscheinlich].
2. Claude-Verbindung zu Vercel auf den neuen Account umstellen (claude.ai, Einstellungen, Connectors, Vercel).
3. Projekt `marketing-tool` im neuen Account aus dem GitHub-Repo anlegen (`create_git_project`), Node 24.x, Variablen setzen.
4. Ersten Build abwarten, Seite und `/api/check` prüfen.
5. **Upstash im neuen Account** anlegen (Free, Frankfurt) und mit dem neuen Projekt verbinden. Nicht im alten.
6. Neue `*.vercel.app`-Adresse in STATUS.md und in die Google-Anleitung eintragen (JavaScript-Quellen und Weiterleitungs-URIs).
7. Altes Projekt abschalten (von Hand, der alte Zugang ist dann weg): Git-Verbindung trennen oder Projekt löschen, Redis-Inc.-Speicher `store_mxUCweiXeQEeo2b3` löschen.
8. STATUS.md anpassen (Team, Projekt, Link).

## Stolpersteine

- **GitHub-Verbindung:** Vercel kann das Konto `AlpernaGmbH` nur mit bestimmten Vercel-Accounts verbinden. Meldet Vercel beim Anlegen, das GitHub-Konto sei bereits verbunden oder die App fehle, im neuen Account unter «Add New, Project» das Repo einmal von Hand importieren und die Vercel-GitHub-App für `marketing-tool` freigeben.
- **Commit-Autor:** Alle Commits stammen von «Claude <noreply@…>». Im alten Account hat das funktioniert. Blockiert das neue Team ein Deployment wegen des Autors, in den Team-Einstellungen die Git-Berechtigung prüfen.
- **Zwei Projekte am selben Repo** bauen beide bei jedem Push, bis das alte getrennt ist. Harmlos, aber doppelt.
- **Deployment-Schutz** bleibt an, bis die Domain steht. Google-Login funktioniert auf geschützten Adressen nur für Team-Mitglieder.
- **Ob die laufende Claude-Sitzung den neuen Zugang übernimmt, ist offen** [Vermutung]. Zeigt `list_teams` noch das alte Team, eine neue Sitzung starten. Alles Nötige steht in dieser Datei und in STATUS.md.
