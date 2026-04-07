/** Comparable slice across vendors: geo × device × vertical (not per-campaign id). */
export function buildStratumKey(parts: {
  geoCountry: string | null;
  deviceClass: string | null;
  vertical: string;
}): string {
  const g = parts.geoCountry || "XX";
  const d = parts.deviceClass || "unknown";
  const v = parts.vertical || "unknown";
  return `${g}|${d}|${v}`;
}
