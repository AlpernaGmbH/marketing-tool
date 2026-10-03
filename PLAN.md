# PLAN.md – Etappe 1a: Infrastruktur

Stand: 03.10.2026. Ziel: Fundament von tools.alperna.ch. Kein Tool, keine fertige Seite.

## Reihenfolge

1. **Scaffold** – Next.js 15, TypeScript strict, Tailwind 4, shadcn/ui (button, input, dialog, card, tabs, progress, select, textarea, badge, checkbox), Abhängigkeiten, npm-Scripts, `.gitignore`, `vercel.json` (fra1), Vitest- und Playwright-Konfiguration.
   Commit: `feat(core): scaffold`
2. **Zugang und Leads** – `lib/redis.ts`, `lib/access.ts`, `/api/access`, `/api/access/complete`, `/api/lead`, `LeadGate`. Tests für ipHash, Cookie-Signatur, canStart, Rate-Limits, Redis-Ausfall.
   Commit: `feat(core): access and lead gate`
3. **Design System** – `app/globals.css` (Tokens), `next/font/local` Poppins und Montserrat, Header, Footer, Breadcrumbs, TrustLine, Höhenlinien-SVG, Skip-Link, Fokus-Stile.
   Commit: `feat(core): design system`
4. **Registry und Seiten-Gerüst** – `lib/registry.ts`, `tools/index.ts`, `ToolPageLayout`, `tools/[slug]/page.tsx`, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `scripts/content-check.ts`.
   Commit: `feat(core): registry and tool page layout`
5. **Gemeinsame Bausteine** – `lib/profile.ts` und `/profil`, `QuestionnaireEngine`, `DocumentExport`, `ProfileBanner`, `ResultCard`, `ScoreBadge`, `CopyButton`, `LegalDisclaimer`, `RelatedTools`, `AlpernaPitch`, `lib/ch.ts`, `scripts/new-tool.ts`.
   Commit: `feat(core): shared components`
6. **Abschluss** – `npm run check` grün, Playwright-Smoke (Zugangsfolge), STATUS.md, Push.

## Entscheide vorab

Siehe STATUS.md, Abschnitt «Entscheide».
