export type StockGroupKey = "masters" | "transactions" | "recipes" | "reports";

export interface StockSection {
  slug: string;
  name: string;
  short: string;
  desc: string;
  group: StockGroupKey;
  pending?: boolean;
}

export const STOCK_GROUPS: { key: StockGroupKey; label: string; hint: string }[] = [
  { key: "masters", label: "Masters", hint: "Define the vocabulary" },
  { key: "transactions", label: "Transactions", hint: "The only things that move stock" },
  { key: "recipes", label: "Recipes & Production", hint: "Two-level bill of materials" },
  { key: "reports", label: "Reports", hint: "Read-only, never write stock" },
];

export const STOCK_SECTIONS: StockSection[] = [
  { slug: "raw-materials", name: "Raw Materials", short: "Materials", group: "masters", desc: "Dual-unit item master with conversion, average cost and minimum level" },
  { slug: "units", name: "Units", short: "Units", group: "masters", desc: "Unit of measure master used across purchase, recipe and wastage" },
  { slug: "suppliers", name: "Suppliers", short: "Suppliers", group: "masters", desc: "Vendors with GSTIN, contact and outstanding balance" },
  { slug: "semi-finished", name: "Semi-Finished Items", short: "Semi-Finished", group: "masters", desc: "Prep items with their own BOM and their own stock" },

  { slug: "purchase-orders", name: "Purchase Orders", short: "Purchases", group: "transactions", desc: "Primary stock-in: invoice, tax, payment and receipt" },
  { slug: "stock-in-hand", name: "Stock In-Hand", short: "In-Hand", group: "transactions", desc: "Physical count reconciliation and manual adjustment history" },
  { slug: "wastage", name: "Wastage", short: "Wastage", group: "transactions", desc: "Batch stock-out for spoilage and preparation loss" },
  { slug: "franchise-requisitions", name: "Franchise Requisitions", short: "Requisitions", group: "transactions", desc: "Procurement requests raised to the parent merchant" },

  { slug: "recipes", name: "Recipes / Menu BOM", short: "Recipes", group: "recipes", desc: "Base, variant and addon ingredients that deduct on sale" },
  { slug: "production", name: "Semi-Finished Production", short: "Production", group: "recipes", desc: "Production runs that consume raw materials and create prep stock" },

  { slug: "report-current-stock", name: "Current Stock", short: "Current Stock", group: "reports", desc: "Point-in-time valuation with editable average cost" },
  { slug: "report-consumption", name: "Consumption", short: "Consumption", group: "reports", desc: "Quantity and cost consumed per raw material" },
  { slug: "report-purchase", name: "Purchase", short: "Purchase", group: "reports", desc: "Material-wise purchase summary expanding to invoice lines" },
  { slug: "report-supplier", name: "Supplier-wise", short: "Supplier-wise", group: "reports", desc: "Purchased, paid and outstanding per supplier" },
  { slug: "report-order-consumption", name: "Order-wise Consumption", short: "Order-wise", group: "reports", desc: "Per-bill ingredient cost and margin" },
];

/** Legacy slugs kept alive so existing links keep working. */
export const STOCK_ALIASES: Record<string, string> = {
  purchases: "purchase-orders",
  "closing-stock": "report-current-stock",
  "low-stock": "report-current-stock",
  "stock-adjustment": "stock-in-hand",
  "stock-transfer": "franchise-requisitions",
  "negative-stock-policy": "stock-in-hand",
};

export const PENDING_DECISIONS = [
  {
    title: "Negative stock policy",
    note: "Behaviour when a sale or production consumes more than the tracked stock is not confirmed. The prototype clamps at zero and flags the row rather than inventing a rule.",
  },
  {
    title: "Warehouse / outlet stock transfer",
    note: "No transfer workflow exists in the source module. Franchise Requisition is a procurement request to the parent merchant, not a transfer, and is not being repurposed as one.",
  },
];

export function resolveSection(slug: string) {
  const target = STOCK_ALIASES[slug] ?? slug;
  return STOCK_SECTIONS.find((s) => s.slug === target);
}
