// Item quantities may be typed and may be fractional - 1.5 plates, 0.25 kg -
// with at most 2 digits after the point, everywhere (Web POS and Captain App
// alike; owner rule, 2026-09-24). Same rules as the Captain App
// (Captain Application/Captain App/src/lib/captain/qty.ts).

/** What a quantity box keeps of what was typed: digits, one point, 2 decimals. */
export function sanitizeQtyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole || "0"}.${frac}`;
}

/** Rounded to 2 decimals (1.1 + 1 must be 2.1, not 2.1000000000000001). */
export function roundQty(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A typed quantity as a number, or null when nothing usable was typed. */
export function parseQty(raw: string): number | null {
  const s = sanitizeQtyInput(raw);
  if (!s || s === "." || s === "0.") return s === "0." ? 0 : null;
  const n = Number(s);
  return Number.isFinite(n) ? roundQty(n) : null;
}
