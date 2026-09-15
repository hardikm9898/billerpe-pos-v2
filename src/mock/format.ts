export const inr = (value: number, opts: { decimals?: boolean } = {}) =>
  `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  })}`;

export const compactInr = (value: number) =>
  value >= 100000
    ? `₹${(value / 100000).toFixed(2)}L`
    : value >= 1000
      ? `₹${(value / 1000).toFixed(1)}K`
      : `₹${value}`;

export const todayLabel = "18/08/2026";

export function nowStamp() {
  const d = new Date();
  const hh = d.getHours() % 12 || 12;
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ap = d.getHours() >= 12 ? "pm" : "am";
  return `${todayLabel} ${`${hh}`.padStart(2, "0")}:${mm} ${ap}`;
}

// Real current time-of-day, in minutes since midnight - was hardcoded to
// 20*60+15 ("demo now = 08:15 pm") in both functions below, so every
// elapsed-duration display (running table occupied-since, KDS ticket age)
// was only ever correct around 8:15pm and nonsense the rest of the day.
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function elapsedFrom(stamp: string) {
  const m = stamp.match(/(\d{2}):(\d{2})\s?(am|pm)/i);
  if (!m) return "—";
  let h = Number(m[1] ?? 0) % 12;
  if ((m[3] ?? "").toLowerCase() === "pm") h += 12;
  const then = h * 60 + Number(m[2] ?? 0);
  const diff = Math.max(0, nowMinutes() - then);
  return diff >= 60 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : `${diff}m`;
}

export function elapsedMinutes(stamp: string) {
  const m = stamp.match(/(\d{2}):(\d{2})\s?(am|pm)/i);
  if (!m) return 0;
  let h = Number(m[1] ?? 0) % 12;
  if ((m[3] ?? "").toLowerCase() === "pm") h += 12;
  return Math.max(0, nowMinutes() - (h * 60 + Number(m[2] ?? 0)));
}

export function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/** Parses the app's "DD/MM/YYYY" date labels into a comparable Date. */
export function parseDMY(s: string): Date {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Returns `dateLabel` shifted by `n` days (negative moves backward), as "DD/MM/YYYY". */
export function addDays(dateLabel: string, n: number): string {
  const d = parseDMY(dateLabel);
  d.setDate(d.getDate() + n);
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Returns a "DD/MM/YYYY" label `n` days before the frozen `todayLabel`. */
export function daysAgo(n: number): string {
  return addDays(todayLabel, -n);
}

/** Inclusive check for whether a "DD/MM/YYYY" label falls within [from, to]. */
export function inRange(dateLabel: string, from: string, to: string): boolean {
  const t = parseDMY(dateLabel).getTime();
  return t >= parseDMY(from).getTime() && t <= parseDMY(to).getTime();
}

// Shared Today/Yesterday/7d/30d/Custom range picker - originally built for
// Dashboard, now also used by the Reports hub's detail page. Synced data
// (order history, etc.) carries real business dates, not this app's frozen
// mock `todayLabel` (pinned to 18/08/2026 for local-only seed/demo data),
// so both need a range anchored to the real current date or synced rows
// would never fall inside "Today"/"Yesterday"/etc.
export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

export function isoToDMY(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

export function dmyToIso(dmy: string) {
  const [d, m, y] = dmy.split("/");
  return `${y}-${m}-${d}`;
}

export function realToday(): string {
  const d = new Date();
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Resolves a RangeKey (+ custom bounds) to concrete from/to "DD/MM/YYYY" labels. */
export function resolveRange(
  rangeKey: RangeKey,
  customFrom: string,
  customTo: string,
): { from: string; to: string; rangeLabel: string } {
  const today = realToday();
  switch (rangeKey) {
    case "today":
      return { from: today, to: today, rangeLabel: "today" };
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d, rangeLabel: "yesterday" };
    }
    case "30d":
      return { from: addDays(today, -29), to: today, rangeLabel: "the last 30 days" };
    case "custom":
      return {
        from: isoToDMY(customFrom) || today,
        to: isoToDMY(customTo) || today,
        rangeLabel: "the selected range",
      };
    case "7d":
    default:
      return { from: addDays(today, -6), to: today, rangeLabel: "the last 7 days" };
  }
}
