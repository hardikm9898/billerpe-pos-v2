export type OpsGroupKey = "billing" | "hardware" | "experience" | "ledger";

export interface OpsSection {
  slug: string;
  name: string;
  short: string;
  desc: string;
  /** the surface this setting actually changes */
  affects: string;
  group: OpsGroupKey;
}

export const OPS_GROUPS: {
  key: OpsGroupKey;
  label: string;
  hint: string;
  blurb: string;
  accent: string;
  /** The permission that opens (view) and changes (edit) this group. */
  module: PermissionModule;
}[] = [
  {
    key: "billing",
    module: "ops-billing",
    label: "Billing Engine",
    hint: "Computes the numbers on the bill",
    blurb: "Control charges, taxes, invoice behaviour and promotions.",
    accent: "primary",
  },
  {
    key: "hardware",
    module: "ops-hardware",
    label: "Hardware Routing",
    hint: "Where a ticket physically lands",
    blurb: "Define kitchens and printers; matching is resolved by the server.",
    accent: "warning",
  },
  {
    key: "experience",
    module: "ops-experience",
    label: "POS & Customer Experience",
    hint: "What staff and guests see",
    blurb: "Cashier layout, menu presentation, digital menu and customer recognition.",
    accent: "info",
  },
  {
    key: "ledger",
    module: "ops-ledger",
    label: "Operational Ledger",
    hint: "Live money, not configuration",
    blurb: "Settle unpaid bills against cash, card or UPI.",
    accent: "success",
  },
];

export const OPS_SECTIONS: OpsSection[] = [
  {
    slug: "calculation",
    name: "Calculation",
    short: "Calculation",
    group: "billing",
    desc: "Service charge rule — type, base, auto-apply and threshold",
    affects: "Added to the bill before tax",
  },
  {
    slug: "tax",
    name: "Tax Configuration",
    short: "Tax",
    group: "billing",
    desc: "Named tax lines with order type, table and menu applicability",
    affects: "Only calculates while GST is enabled in Invoice Format",
  },
  {
    slug: "invoice-format",
    name: "Invoice Format",
    short: "Invoice",
    group: "billing",
    desc: "GST master switch, business identifiers, header and footer lines",
    affects: "Every printed bill and PDF, and GST across the POS",
  },
  {
    slug: "promo-codes",
    name: "Discount / Promo Code",
    short: "Promos",
    group: "billing",
    desc: "Curated coupon cards the cashier picks at bill time",
    affects: "Discount popup on the billing screen",
  },
  {
    slug: "delivery-charge",
    name: "Packaging Charge",
    short: "Packaging",
    group: "billing",
    desc: "Same rule engine as Service Charge — type, auto-apply and tax treatment",
    affects: "Added to the bill on Pickup orders (or manually, per order)",
  },
  {
    slug: "payment-modes",
    name: "Payment Modes",
    short: "Payments",
    group: "billing",
    desc: "Which payment modes billers can select when settling a bill",
    affects: "The Settle dialog and Due Payment ledger",
  },

  {
    slug: "kitchens",
    name: "Kitchen Settings",
    short: "Kitchens",
    group: "hardware",
    desc: "Named kitchens with category, table and order-type assignment",
    affects: "Which KDS screen a KOT appears on",
  },
  {
    slug: "printers",
    name: "Printer",
    short: "Printers",
    group: "hardware",
    desc: "Physical printers, size, copies and KOT / invoice routing",
    affects: "Which device the print job is sent to",
  },
  {
    slug: "kot-format",
    name: "KOT Format",
    short: "KOT Format",
    group: "hardware",
    desc: "Customer details, order type, restaurant identity, token/KOT number and custom text",
    affects: "Every printed and reprinted kitchen ticket",
  },

  {
    slug: "display",
    name: "Display",
    short: "Display",
    group: "experience",
    desc: "Keyboard or Touch billing layout for this terminal",
    affects: "The cashier's billing screen structure",
  },
  {
    slug: "menu-setting",
    name: "Menu Setting",
    short: "Menu",
    group: "experience",
    desc: "Item grid with images or a compact text list",
    affects: "Touch mode item grid only",
  },
  {
    slug: "qr-code",
    name: "QR Code",
    short: "QR",
    group: "experience",
    desc: "Downloadable QR that opens the customer-facing digital menu",
    affects: "Guest self-service menu — not payments",
  },
  {
    slug: "customer-data",
    name: "Customer Data",
    short: "Customers",
    group: "experience",
    desc: "Customer master with GSTIN and address",
    affects: "Mobile-number autofill at the billing counter",
  },

  {
    slug: "due-payment",
    name: "Due Payment",
    short: "Due",
    group: "ledger",
    desc: "Unsettled bills with search, date filters and bulk settlement",
    affects: "Live order state — settles money, saves no configuration",
  },
];

/** Legacy links kept alive. */
export const OPS_ALIASES: Record<string, string> = {
  printer: "printers",
  taxes: "tax",
  invoice: "invoice-format",
  kot: "kot-format",
  promos: "promo-codes",
  kitchen: "kitchens",
  customers: "customer-data",
};

export const OPS_UNCONFIRMED = [
  {
    title: "Four Invoice Format fields have no confirmed consumer",
    note: "Token display, bill-with-KOT, bill-with-token and save behaviour exist in the source form but no frontend usage was found. They are shown grouped and marked for confirmation rather than given invented behaviour.",
  },
  {
    title: "Tax delete calls the wrong endpoint",
    note: "In the source, deleting a tax rule hits the printer delete endpoint. The prototype removes the rule locally and flags that backend work is required before this ships.",
  },
  {
    title: "Bill rounding is hardcoded",
    note: "Every bill is rounded to the nearest rupee outside this module. It is surfaced here as read-only information, not as an editable rule.",
  },
];import type { PermissionModule } from "@/mock/types";

