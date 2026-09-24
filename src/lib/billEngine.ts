// Literal TypeScript port of billerpe-local-exe/helpers/billEngine.js - the
// ONE bill rule set for the whole product. The exe is the authority and
// persists these figures on every order mutation; this copy exists only so
// the client can preview a not-yet-fired draft round (and re-render totals
// without a round trip) with exactly the same arithmetic. Keep the three
// copies (exe, Web POS, Captain App) identical - change them together.
//
//   line     = price * qty + sum(addon.price * addon.qty)   (addons priced once
//              per line by their own qty - what the printed bill does)
//   subtotal = sum(line)
//   discount = pr: subtotal * value / 100 | fix: value      (clamped 0..subtotal)
//   charge   = service / packaging: active, order-type filter (empty = all),
//              base = core (subtotal) or total (subtotal - discount),
//              greater/less/always threshold, percentage or fixed
//   delivery = 0 (switched off product-wide)
//   taxBase  = max(0, subtotal - discount) + service/packaging when their
//              "calculate tax on charge" flag is set
//   tax_i    = active tax rows filtered by order type / table category /
//              menu ids (non-empty menu ids scale the base by those lines'
//              share of the subtotal)
//   grand    = round(net + service + packaging + tax); roundOff = grand - raw

export type EngineAddon = { price: number; qty?: number | undefined };
export type EngineLine = {
  qty: number;
  price: number;
  addons?: EngineAddon[] | undefined;
  menuId?: string | number | undefined;
};
export type EngineDiscount = { type: "fix" | "pr"; value: number } | null | undefined;
export type EngineChargeRule = {
  active: boolean;
  type: "percentage" | "fixed";
  value: number;
  calculationOn: "core" | "total";
  /** order types this rule auto-applies to; empty/absent = all. Accepts an
   * array, a JSON string, or a double-encoded JSON string - see asArray. */
  orderTypes: unknown;
  taxOnCharge: boolean;
  /** "1" greater than threshold, "2" less than, "3" always */
  condition: "1" | "2" | "3";
  threshold: number;
};
export type EngineTax = {
  id: string | number;
  name: string;
  type: "pr" | "fix";
  rate: number;
  active: boolean;
  orderTypes: unknown;
  tableCategIds: string[];
  menuIds: string[];
};
export type EngineConfig = {
  gstOn: boolean;
  taxTypes: EngineTax[];
  serviceCharge: EngineChargeRule | null | undefined;
  packagingRule: EngineChargeRule | null | undefined;
};
export type EngineInput = {
  lines: EngineLine[];
  orderType: string;
  tableCategId?: string | number | null | undefined;
  discount: EngineDiscount;
  packagingOverride?: number | null | undefined;
  /** The cashier's manual service charge - used when the service charge is
   * not automatic for this order type (see serviceIsAutomatic). */
  serviceOverride?: number | null | undefined;
  config: EngineConfig;
};
export type EngineTaxLine = {
  id: string | number;
  name: string;
  tax_type: "pr" | "fix";
  tax_value: number;
  amount: number;
};
export type EngineTotals = {
  subtotal: number;
  discount: number;
  service: number;
  packaging: number;
  delivery: number;
  taxLines: EngineTaxLine[];
  tax: number;
  rawGrand: number;
  grandAmount: number;
  roundOff: number;
  items: number;
};

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export function normaliseOrderType(v: unknown): string {
  const s = String(v ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (s === "dinin" || s === "dinein") return "dinin";
  if (s === "pickup" || s === "takeaway") return "pickup";
  if (s === "delivery") return "delivery";
  return s;
}

// Values reaching these lists are not consistently shaped - a real array, a
// JSON string, or a DOUBLE-encoded JSON string (which is what the live
// outlet's charge rules actually contain). Parsing only once left a string
// where an array belonged, which read as "no order-type filter" and applied
// a pickup-only packaging charge to dine-in bills. Kept identical to the
// exe's helpers/billEngine.js#asArray.
export function asArray(v: unknown): string[] {
  let value: unknown = v;
  for (let i = 0; i < 3; i++) {
    if (Array.isArray(value)) return value.map((x) => String(x));
    if (typeof value !== "string") return [];
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as unknown[]).map((x) => String(x)) : [];
}

// The service charge is AUTOMATIC only for the order types ticked in its
// setting - an EMPTY list means "none: the cashier adds it by hand", as the
// Settings screen says and the old BillerPe did. It used orderTypeAllowed's
// "empty = all", so switching automatic off changed nothing (owner report,
// 2026-09-22). Same rule as billerpe-local-exe/helpers/billEngine.js.
export function serviceIsAutomatic(rule: EngineChargeRule | null | undefined, orderType: string): boolean {
  if (!rule || !rule.active) return false;
  return asArray(rule.orderTypes).map(normaliseOrderType).filter(Boolean).includes(normaliseOrderType(orderType));
}

function orderTypeAllowed(list: unknown, orderType: string): boolean {
  const clean = asArray(list).map(normaliseOrderType).filter(Boolean);
  if (!clean.length) return true;
  return clean.includes(normaliseOrderType(orderType));
}

export function addonsTotal(addons: EngineAddon[] | undefined): number {
  let total = 0;
  for (const a of addons ?? []) {
    total += (Number(a?.price) || 0) * (Number(a?.qty) || 1);
  }
  return total;
}

export function engineLineTotal(line: EngineLine): number {
  return r2((Number(line.price) || 0) * (Number(line.qty) || 0) + addonsTotal(line.addons));
}

function evaluateChargeRule(
  rule: EngineChargeRule | null | undefined,
  ctx: { subtotal: number; discount: number; orderType: string },
): number {
  if (!rule || !rule.active || ctx.subtotal <= 0) return 0;
  if (!orderTypeAllowed(rule.orderTypes, ctx.orderType)) return 0;
  const base = rule.calculationOn === "total" ? ctx.subtotal - ctx.discount : ctx.subtotal;
  const threshold = Number(rule.threshold) || 0;
  const qualifies =
    rule.condition === "1" ? base > threshold : rule.condition === "2" ? base < threshold : true;
  if (!qualifies) return 0;
  const value = Number(rule.value) || 0;
  return rule.type === "percentage" ? r2((base * value) / 100) : r2(value);
}

export function computeBill(input: EngineInput): EngineTotals {
  const lines = input.lines ?? [];
  const orderType = normaliseOrderType(input.orderType || "dinin");
  const config = input.config;

  const lineTotals = lines.map(engineLineTotal);
  const subtotal = r2(lineTotals.reduce((s, v) => s + v, 0));

  let discount = 0;
  const d = input.discount;
  if (d && Number(d.value) > 0) {
    discount = d.type === "pr" ? r2((subtotal * Number(d.value)) / 100) : r2(Number(d.value));
  }
  discount = Math.min(subtotal, Math.max(0, discount));

  // Automatic for this order type -> the rule; otherwise what the cashier
  // entered on the order (nothing entered = no service charge).
  const manualService = Number(input.serviceOverride);
  const service = serviceIsAutomatic(config.serviceCharge, orderType)
    ? evaluateChargeRule(config.serviceCharge, { subtotal, discount, orderType })
    : config.serviceCharge?.active &&
        input.serviceOverride != null &&
        Number.isFinite(manualService) &&
        subtotal > 0
      ? r2(Math.max(0, manualService))
      : 0;

  let packaging: number;
  if (
    input.packagingOverride !== null &&
    input.packagingOverride !== undefined &&
    Number.isFinite(Number(input.packagingOverride))
  ) {
    packaging = r2(Math.max(0, Number(input.packagingOverride)));
  } else {
    packaging = evaluateChargeRule(config.packagingRule, { subtotal, discount, orderType });
  }
  const delivery = 0;

  const net = Math.max(0, subtotal - discount);
  const taxBase =
    net +
    (config.serviceCharge?.taxOnCharge ? service : 0) +
    (config.packagingRule?.taxOnCharge ? packaging : 0);

  const taxLines: EngineTaxLine[] = [];
  if (config.gstOn !== false) {
    for (const t of config.taxTypes ?? []) {
      if (!t || t.active === false) continue;
      if (!orderTypeAllowed(t.orderTypes, orderType)) continue;
      const categIds = (t.tableCategIds ?? []).map(String);
      if (
        categIds.length &&
        (input.tableCategId == null || !categIds.includes(String(input.tableCategId)))
      )
        continue;
      const menuIds = (t.menuIds ?? []).map(String);
      let base = taxBase;
      if (menuIds.length) {
        if (subtotal <= 0) continue;
        const matching = lines.reduce(
          (s, l, i) => s + (menuIds.includes(String(l.menuId)) ? (lineTotals[i] ?? 0) : 0),
          0,
        );
        if (matching <= 0) continue;
        base = r2(taxBase * (matching / subtotal));
      }
      const isPercent = t.type !== "fix";
      const rate = Number(t.rate) || 0;
      const amount = subtotal <= 0 ? 0 : isPercent ? r2((base * rate) / 100) : r2(rate);
      taxLines.push({
        id: t.id,
        name: t.name,
        tax_type: isPercent ? "pr" : "fix",
        tax_value: rate,
        amount,
      });
    }
  }
  const tax = r2(taxLines.reduce((s, t) => s + t.amount, 0));

  const rawGrand = r2(net + service + packaging + delivery + tax);
  const grandAmount = Math.round(rawGrand);
  const roundOff = r2(grandAmount - rawGrand);

  return {
    subtotal,
    discount,
    service,
    packaging,
    delivery,
    taxLines,
    tax,
    rawGrand,
    grandAmount,
    roundOff,
    // Fractional quantities: 0.1 + 0.2 must count as 0.3 (kept inline - this
    // engine stays self-contained).
    items: Math.round(lines.reduce((s, l) => s + (Number(l.qty) || 0), 0) * 100) / 100,
  };
}
