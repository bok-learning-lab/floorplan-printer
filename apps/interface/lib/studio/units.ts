// Imperial feet/inches parsing + formatting.
// Accepts "6'", "6' 3\"", `6ft 3in`, `192"`, and bare numbers (treated as feet).

export function parseFeetInches(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).trim().toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!s) return null;

  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 12;

  const m1 = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|f|')?\s*(?:(-?\d+(?:\.\d+)?)\s*(?:in|i|")?)?$/);
  if (m1) {
    const ft = parseFloat(m1[1]) || 0;
    const inch = m1[2] ? parseFloat(m1[2]) : 0;
    return ft * 12 + inch;
  }
  const m2 = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*"?$/);
  if (m2) return parseFloat(m2[1]) * 12 + (m2[2] ? parseFloat(m2[2]) : 0);

  const m3 = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:in|")$/);
  if (m3) return parseFloat(m3[1]);

  const f = parseFloat(s);
  return Number.isNaN(f) ? null : f * 12;
}

export function formatFeetInches(
  inches: number | null | undefined,
  { precision = 0, compact = false }: { precision?: number; compact?: boolean } = {}
): string {
  if (inches == null || Number.isNaN(inches)) return "—";
  const sign = inches < 0 ? "-" : "";
  const v = Math.abs(inches);
  const ft = Math.floor(v / 12);
  let inRem = v - ft * 12;
  if (precision === 0) inRem = Math.round(inRem);
  else inRem = parseFloat(inRem.toFixed(precision));
  if (inRem === 12) return `${sign}${ft + 1}'`;
  if (compact && inRem === 0) return `${sign}${ft}'`;
  if (inRem === 0) return `${sign}${ft}' 0"`;
  return `${sign}${ft}' ${inRem}"`;
}
