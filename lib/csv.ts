/**
 * Eine CSV-Zelle für Excel: Anführungszeichen bei Semikolon, Anführungszeichen oder Zeilenumbruch. Beginnt sie mit «=», «+»,
 * «-», «@» oder einem Tabulator, steht ein Hochkomma davor, damit ein Tabellenprogramm keine Formel ausführt.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
