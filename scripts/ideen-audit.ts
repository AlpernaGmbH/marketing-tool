/* Redaktions-Audit der Beitragsideen (Charge C7). Kein Teil von `npm run check`; die Grenzen prüfen die Tests.
 *   npx tsx scripts/ideen-audit.ts            Zusammenfassung
 *   npx tsx scripts/ideen-audit.ts --ids      zusätzlich die IDs ohne Schweiz-Bezug
 *   npx tsx scripts/ideen-audit.ts --text     zusätzlich Titel, Beschrieb und Hook der Ideen ohne Schweiz-Bezug
 */
import { SCHWEIZ_ZIEL, audit } from "@/tools/inhalte-ideen/audit";
import { IDEEN } from "@/tools/inhalte-ideen/logic";

const bericht = audit(IDEEN);
const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
console.log(`Ideen: ${bericht.anzahl}, mit Schweiz-Bezug: ${bericht.schweiz} (${pct(bericht.anteil)}), Ziel ${pct(SCHWEIZ_ZIEL)}`);
for (const [b, v] of Object.entries(bericht.jeBranche)) console.log(`  ${b.padEnd(20)} ${String(v.schweiz).padStart(3)} von ${String(v.anzahl).padStart(3)}`);
console.log(`Klone: ${bericht.klone.length}`);
for (const k of bericht.klone) console.log(`  ${k.a} / ${k.b} (${k.art} ${k.wert})`);
console.log(`Hook-Anfänge, die zu oft vorkommen: ${bericht.hookAnfaenge.length}`);
for (const h of bericht.hookAnfaenge) console.log(`  «${h.anfang}» ${h.anzahl}x: ${h.ids.join(", ")}`);
if (process.argv.includes("--ids")) console.log(`Ohne Schweiz-Bezug:\n${bericht.ohneBezug.join("\n")}`);
if (process.argv.includes("--text")) {
  const ohne = new Set(bericht.ohneBezug);
  for (const i of IDEEN.filter((x) => ohne.has(x.id))) console.log(`${i.id} | ${i.titel} | ${i.beschrieb} | ${i.hook}`);
}
