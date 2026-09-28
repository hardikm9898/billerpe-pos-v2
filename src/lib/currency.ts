import { useSyncExternalStore } from "react";

// The outlet's currency (owner decision, 2026-09-28): Indian Rupee by
// default, or another from the list, or a symbol of the owner's own. Set
// once the outlet settings load (Operations > Invoice format saves it on
// the exe, which forwards it to the cloud for the e-bill and QR menu).
// Plain functions, not React state, because amounts are formatted
// everywhere - toasts, CSV, audit log - not only inside components;
// useCurrency() re-renders a component when the setting changes.

export type CurrencyCode = "INR" | "USD" | "AED" | "EUR" | "GBP" | "SAR" | "QAR" | "OMR" | "KWD" | "BHD" | "SGD" | "MYR" | "AUD" | "CAD" | "NPR" | "LKR" | "BDT" | "OTHER";

export const CURRENCIES: { code: CurrencyCode; name: string; symbol: string }[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QAR" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BHD" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "OTHER", name: "Other (type your own symbol)", symbol: "" },
];

type Currency = { code: CurrencyCode; symbol: string };
let current: Currency = { code: "INR", symbol: "₹" };
const listeners = new Set<() => void>();

export function setCurrency(code: string | null | undefined, symbol: string | null | undefined) {
  const known = CURRENCIES.find((c) => c.code === code);
  const next: Currency = {
    code: known ? known.code : "INR",
    symbol: (symbol ?? "").trim() || known?.symbol || "₹",
  };
  if (next.code === current.code && next.symbol === current.symbol) return;
  current = next;
  listeners.forEach((l) => l());
}

/** The symbol printed before every amount ("₹", "$", "AED"...). */
export const cs = () => current.symbol;
export const currencyCode = () => current.code;
/** Number grouping: Indian (1,00,000) only for the Indian Rupee, international (100,000) otherwise. */
export const numLocale = () => (current.code === "INR" ? "en-IN" : "en-US");

/** "₹1,250" / "$1,250.50" - up to 2 decimals unless told otherwise. */
export function money(value: number, opts: { decimals?: boolean } = {}) {
  const n = Number(value) || 0;
  const text = Math.abs(n).toLocaleString(numLocale(), {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  // A letter code (AED) reads better with a space: "AED 1,250".
  const sym = cs();
  return `${n < 0 ? "−" : ""}${sym}${/[A-Za-z]$/.test(sym) ? " " : ""}${text}`;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** Re-renders the calling component when the outlet's currency changes. */
export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
