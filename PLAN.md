# PLAN.md

Stand: 03.10.2026.

## Etappe 1a: Infrastruktur (erledigt)

Scaffold, Zugang und Leads, Design System, Registry und Seiten-Gerüst, gemeinsame Bausteine, Abschluss. Details und Entscheide: STATUS.md.

## Etappe 1b: Startseite, Kategorien, Referenz-Tool (erledigt)

1. **Seitentexte und Prüfregeln** – `content/site/*.md`, `lib/site-content.ts`, `lib/site-rules.ts`, `scripts/content-check.ts`.
   Commit: `feat(site): seitentexte und pruefregeln`
2. **Startseite** – Hero, PathCards mit Fortschritt, Meistgenutzt, Warum kostenlos, SEO-Abschnitt, Pitch, FAQ, JSON-LD.
   Commit: `feat(site): home`
3. **Kategorieseiten** – `/[kategorie]`, Pfad-Grafik, Open-Graph-Bild je Seite, Sitemap.
   Commit: `feat(site): category pages`
4. **Referenz-Tool** – Digitaler-Auftritt-Check, `_smoke` entfernt, Smoke gegen das echte Tool.
   Commit: `feat(tool): digitaler-auftritt-check`

## Danach (nach Bauplan)

Etappe 2 bis 8 wie im Bauplan. Jede Etappe: Tools bauen, `npm run check` grün, Lighthouse mobil ≥ 95, Push auf `main`, STATUS.md fortschreiben.
