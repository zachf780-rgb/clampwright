function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Nearest 1/32 inch, as a shop fraction. 44.25 → 44 1/4" */
export function formatInches(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const negative = value < 0;
  const thirty2 = Math.round(Math.abs(value) * 32);
  const whole = Math.floor(thirty2 / 32);
  let num = thirty2 % 32;
  const sign = negative ? "-" : "";
  if (num === 0) return `${sign}${whole}"`;
  const g = gcd(num, 32);
  num /= g;
  const den = 32 / g;
  const frac = `${num}/${den}`;
  return whole === 0 ? `${sign}${frac}"` : `${sign}${whole} ${frac}"`;
}

export function formatFeet(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const negative = value < 0;
  const abs = Math.abs(value);
  const ft = Math.floor(abs / 12);
  const inch = abs - ft * 12;
  const sign = negative ? "-" : "";
  if (ft === 0) return formatInches(value);
  return `${sign}${ft}' ${formatInches(inch)}`;
}

export function formatLen(value: number, unit: "in" | "ft"): string {
  return unit === "ft" ? formatFeet(value) : formatInches(value);
}

export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}"`;
}

export function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Shop entry: `48`, `48.5`, `6 1/2`, `4'`, `4' 6"`, `4 ft 6 1/2`. Inches. */
export function parseLength(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[″”"]/g, '"')
    .replace(/[′’]/g, "'");
  if (!s) return null;
  const feet = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(.*)$/);
  if (feet) {
    const ft = Number(feet[1]);
    const inches = parseInchesToken(stripInchWords(feet[2]));
    if (!Number.isFinite(ft) || inches == null) return null;
    return ft * 12 + inches;
  }
  return parseInchesToken(stripInchWords(s));
}

function stripInchWords(value: string): string {
  return value.replace(/"/g, "").replace(/\b(?:inches|inch|in)\b/g, "").trim();
}

function parseInchesToken(value: string): number | null {
  if (!value) return 0;
  const frac = value.match(/^(\d+)?(?:\s*[-\s]\s*|\s+)(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const whole = frac[1] ? Number(frac[1]) : 0;
    const num = Number(frac[2]);
    const den = Number(frac[3]);
    if (!den || !Number.isFinite(whole + num / den)) return null;
    return whole + num / den;
  }
  const bare = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (bare) {
    const den = Number(bare[2]);
    if (!den) return null;
    return Number(bare[1]) / den;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
