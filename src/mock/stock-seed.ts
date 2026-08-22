import type {
  FranchiseRequisition,
  ProductionRun,
  PurchaseOrder,
  Recipe,
  StockAdjustment,
  StockMovement,
  StockUnit,
} from "./types";

export const units: StockUnit[] = [
  { id: "u1", unitName: "Kilogram", shortName: "kg" },
  { id: "u2", unitName: "Gram", shortName: "gm" },
  { id: "u3", unitName: "Litre", shortName: "ltr" },
  { id: "u4", unitName: "Millilitre", shortName: "ml" },
  { id: "u5", unitName: "Pieces", shortName: "pcs" },
  { id: "u6", unitName: "Box", shortName: "box" },
  { id: "u7", unitName: "Packet", shortName: "pkt" },
  { id: "u8", unitName: "Plate", shortName: "plate" },
];

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: "po1",
    poNo: "PO-2026-041",
    supplierId: "s1",
    date: "16/08/2026",
    status: "Received",
    invoiceNo: "SPS/26-27/0912",
    gstin: "24AABCS1429B1Z1",
    paymentStatus: "Paid",
    paidAmount: 6083,
    discountType: "flat",
    discountValue: 250,
    lines: [
      { materialId: "rm2", qty: 50, rate: 45, taxPct: 5 },
      { materialId: "rm3", qty: 25, rate: 110, taxPct: 5 },
      { materialId: "rm10", qty: 20, rate: 48, taxPct: 5 },
    ],
  },
  {
    id: "po2",
    poNo: "PO-2026-042",
    supplierId: "s2",
    date: "17/08/2026",
    status: "Ordered",
    invoiceNo: "GDS/1188",
    gstin: "24AACCG9988K1Z9",
    paymentStatus: "Unpaid",
    paidAmount: 0,
    lines: [
      { materialId: "rm1", qty: 10, rate: 380, taxPct: 5 },
      { materialId: "rm6", qty: 40, rate: 58, taxPct: 0 },
    ],
  },
  {
    id: "po3",
    poNo: "PO-2026-043",
    supplierId: "s3",
    date: "18/08/2026",
    status: "Draft",
    paymentStatus: "Unpaid",
    paidAmount: 0,
    lines: [
      { materialId: "rm7", qty: 30, rate: 32, taxPct: 0 },
      { materialId: "rm8", qty: 20, rate: 41, taxPct: 0 },
    ],
  },
  {
    id: "po4",
    poNo: "PO-2026-040",
    supplierId: "s1",
    date: "12/08/2026",
    status: "Received",
    invoiceNo: "SPS/26-27/0884",
    gstin: "24AABCS1429B1Z1",
    paymentStatus: "Partial",
    paidAmount: 4000,
    lines: [
      { materialId: "rm11", qty: 30, rate: 128, taxPct: 5 },
      { materialId: "rm12", qty: 15, rate: 92, taxPct: 5 },
    ],
  },
];

export const recipes: Recipe[] = [
  {
    id: "rc1",
    itemName: "Gujarati Dal",
    menuItemId: "m12",
    yieldQty: 1,
    yieldUnit: "plate",
    components: [
      { materialId: "rm4", qty: 90 },
      { materialId: "rm10", qty: 10 },
      { materialId: "rm5", qty: 8 },
    ],
    groups: [
      {
        key: "base",
        label: "Base recipe",
        kind: "base",
        lines: [
          { type: "semi", refId: "sf2", qty: 0.12 },
          { type: "raw", refId: "rm10", qty: 10 },
          { type: "raw", refId: "rm5", qty: 8 },
        ],
      },
    ],
  },
  {
    id: "rc2",
    itemName: "Khaman",
    menuItemId: "m11",
    yieldQty: 1,
    yieldUnit: "plate",
    components: [
      { materialId: "rm12", qty: 120 },
      { materialId: "rm11", qty: 15 },
    ],
    groups: [
      {
        key: "base",
        label: "Base recipe",
        kind: "base",
        lines: [
          { type: "raw", refId: "rm12", qty: 120 },
          { type: "raw", refId: "rm11", qty: 15 },
        ],
      },
      {
        key: "addon-chutney",
        label: "Addon · Extra Chutney",
        kind: "addon",
        lines: [
          { type: "raw", refId: "rm9", qty: 12 },
          { type: "raw", refId: "rm10", qty: 6 },
        ],
      },
    ],
  },
  {
    id: "rc3",
    itemName: "Dal Baati Churma",
    menuItemId: "m10",
    yieldQty: 1,
    yieldUnit: "plate",
    components: [
      { materialId: "rm2", qty: 180 },
      { materialId: "rm5", qty: 40 },
      { materialId: "rm4", qty: 80 },
    ],
    groups: [
      {
        key: "variant-half",
        label: "Variant · Half",
        kind: "variant",
        lines: [
          { type: "raw", refId: "rm2", qty: 110 },
          { type: "raw", refId: "rm5", qty: 25 },
          { type: "semi", refId: "sf2", qty: 0.05 },
        ],
      },
      {
        key: "variant-full",
        label: "Variant · Full",
        kind: "variant",
        lines: [
          { type: "raw", refId: "rm2", qty: 180 },
          { type: "raw", refId: "rm5", qty: 40 },
          { type: "semi", refId: "sf2", qty: 0.09 },
        ],
      },
    ],
  },
  {
    id: "rc4",
    itemName: "Roti Sadi",
    menuItemId: "m15",
    yieldQty: 1,
    yieldUnit: "pc",
    components: [{ materialId: "rm2", qty: 45 }],
    groups: [
      {
        key: "base",
        label: "Base recipe",
        kind: "base",
        lines: [{ type: "raw", refId: "rm2", qty: 45 }],
      },
      {
        key: "addon-butter",
        label: "Addon · Butter",
        kind: "addon",
        lines: [{ type: "raw", refId: "rm5", qty: 10 }],
      },
    ],
  },
  {
    id: "rc5",
    itemName: "Gatte Ki Sabz",
    menuItemId: "m9",
    yieldQty: 1,
    yieldUnit: "plate",
    components: [
      { materialId: "rm12", qty: 100 },
      { materialId: "rm6", qty: 60 },
      { materialId: "rm7", qty: 40 },
    ],
    groups: [
      {
        key: "base",
        label: "Base recipe",
        kind: "base",
        lines: [
          { type: "raw", refId: "rm12", qty: 100 },
          { type: "raw", refId: "rm6", qty: 60 },
          { type: "semi", refId: "sf1", qty: 0.08 },
        ],
      },
    ],
  },
];

export const productionRuns: ProductionRun[] = [
  { id: "pr1", semiId: "sf1", qty: 5, cost: 1174, notes: "Morning prep", at: "18/08/2026 07:40", by: "Ramesh Kumar" },
  { id: "pr2", semiId: "sf2", qty: 4, cost: 1120, notes: "", at: "18/08/2026 08:10", by: "Ramesh Kumar" },
  { id: "pr3", semiId: "sf3", qty: 3, cost: 216, notes: "Sweets counter", at: "17/08/2026 16:20", by: "Kiran" },
];

export const stockAdjustments: StockAdjustment[] = [
  { id: "sa1", materialId: "rm7", systemQty: 32400, countedQty: 31000, variance: -1400, value: -44.8, date: "17/08/2026", by: "Ramesh Kumar", note: "Physical count — evening" },
  { id: "sa2", materialId: "rm10", systemQty: 14600, countedQty: 15000, variance: 400, value: 19.2, date: "16/08/2026", by: "Kiran", note: "Missed purchase entry" },
];

export const stockMovements: StockMovement[] = [
  { id: "mv1", kind: "Purchase", refType: "raw", refId: "rm2", qty: 50000, value: 2250, reference: "PO-2026-041", at: "16/08/2026 10:20", by: "Ramesh Kumar" },
  { id: "mv2", kind: "Purchase", refType: "raw", refId: "rm3", qty: 25000, value: 2750, reference: "PO-2026-041", at: "16/08/2026 10:20", by: "Ramesh Kumar" },
  { id: "mv3", kind: "Production Out", refType: "raw", refId: "rm7", qty: -2500, value: -80, reference: "Onion-Tomato Masala Base", at: "18/08/2026 07:40", by: "Ramesh Kumar" },
  { id: "mv4", kind: "Production In", refType: "semi", refId: "sf1", qty: 5, value: 1174, reference: "Production run", at: "18/08/2026 07:40", by: "Ramesh Kumar" },
  { id: "mv5", kind: "Wastage", refType: "raw", refId: "rm8", qty: -1200, value: -49.2, reference: "Spoilage — overripe stock", at: "17/08/2026 21:05", by: "Ramesh Kumar" },
  { id: "mv6", kind: "Adjustment", refType: "raw", refId: "rm7", qty: -1400, value: -44.8, reference: "Physical count — evening", at: "17/08/2026 22:10", by: "Ramesh Kumar" },
  { id: "mv7", kind: "Sale", refType: "raw", refId: "rm4", qty: -1800, value: -252, reference: "Recipe consumption · Gujarati Dal", at: "18/08/2026 14:35", by: "System" },
  { id: "mv8", kind: "Sale", refType: "raw", refId: "rm2", qty: -2250, value: -101.25, reference: "Recipe consumption · Roti Sadi", at: "18/08/2026 14:35", by: "System" },
];

export const requisitions: FranchiseRequisition[] = [
  {
    id: "fr1",
    reqNo: "REQ-2026-018",
    date: "18/08/2026",
    status: "Pending",
    raisedBy: "Taj Restaurant — Satellite",
    remarks: "Needed before weekend rush",
    items: [
      { materialId: "rm1", orderedQty: 8, unitPrice: 380 },
      { materialId: "rm5", orderedQty: 5, unitPrice: 620 },
    ],
  },
  {
    id: "fr2",
    reqNo: "REQ-2026-017",
    date: "16/08/2026",
    status: "Accepted",
    raisedBy: "Taj Restaurant — Satellite",
    items: [
      { materialId: "rm3", orderedQty: 20, approvedQty: 15, unitPrice: 110 },
      { materialId: "rm10", orderedQty: 10, approvedQty: 10, unitPrice: 48 },
    ],
  },
  {
    id: "fr3",
    reqNo: "REQ-2026-015",
    date: "12/08/2026",
    status: "Delivered",
    raisedBy: "Taj Restaurant — Satellite",
    purchaseOrderId: "po4",
    items: [
      { materialId: "rm11", orderedQty: 30, approvedQty: 30, unitPrice: 128 },
      { materialId: "rm12", orderedQty: 15, approvedQty: 15, unitPrice: 92 },
    ],
  },
  {
    id: "fr4",
    reqNo: "REQ-2026-014",
    date: "10/08/2026",
    status: "Rejected",
    raisedBy: "Taj Restaurant — Satellite",
    remarks: "Duplicate of REQ-2026-013",
    items: [{ materialId: "rm6", orderedQty: 40, unitPrice: 58 }],
  },
];
