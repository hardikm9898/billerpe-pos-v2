import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import * as seed from "./data";
import * as stockSeed from "./stock-seed";
import * as opsSeed from "./ops-seed";
import { nowStamp, todayLabel } from "./format";
import {
  ApiError,
  tableApi,
  menuApi,
  userApi,
  orderApi,
  hotelApi,
  dueApi,
  customerApi,
  kitchenApi,
  printerApi,
  type RawDueOrder,
  type RawCustomer,
  type RawKitchen,
  type RawPrinter,
  type RawTable,
  type RawTableCategory,
  type RawMenuCategory,
  type RawMenuItem,
  type RawVariant,
  type RawAddonGroup,
  type RawHotelUser,
} from "@/lib/api";
import type { KdsTicketPayload } from "@/lib/kdsSocket";
import type {
  AddonGroup,
  AppNotification,
  BillChargeRule,
  DueBill,
  InvoiceFormat,
  Kitchen,
  PaymentModeConfig,
  PromoCode,
  ServiceChargeRule,
  TaxRule,
  FranchiseRequisition,
  ProductionRun,
  RecipeGroup,
  RequisitionStatus,
  StockAdjustment,
  StockMovement,
  StockUnit,
  ApprovalRule,
  AuditLog,
  CashSession,
  ConnectionState,
  Customer,
  Device,
  Expense,
  ExpenseHead,
  Kot,
  Menu,
  MenuCategory,
  MenuDietary,
  MenuItem,
  ModuleGrant,
  NotificationSetting,
  OpsOrderType,
  Order,
  OrderLine,
  OrderType,
  PaymentSplit,
  PermissionModule,
  PermissionOverrides,
  Printer,
  PurchaseOrder,
  RawMaterial,
  Recipe,
  Reservation,
  RestaurantTable,
  Role,
  RolePermissions,
  SemiFinished,
  SpecialPermission,
  StandardAction,
  Supplier,
  SyncItem,
  TableCategory,
  TableStatus,
  TableGridView,
  User,
  VariantOption,
  Wastage,
} from "./types";

let seq = 1000;
const uid = (p: string) => `${p}-${++seq}`;

export interface AddLineInput {
  itemId: string;
  qty?: number;
  variant?: string;
  addons?: { name: string; price: number }[];
  note?: string;
}

interface State {
  authed: boolean;
  deviceRegistered: boolean;
  currentUserId: string;
  tables: RestaurantTable[];
  tableCategories: TableCategory[];
  orders: Order[];
  kots: Kot[];
  menuItems: MenuItem[];
  menuCategories: MenuCategory[];
  variantMasters: VariantOption[];
  addonGroups: AddonGroup[];
  users: User[];
  customers: Customer[];
  reservations: Reservation[];
  expenses: Expense[];
  expenseHeads: ExpenseHead[];
  rawMaterials: RawMaterial[];
  recipes: Recipe[];
  semiFinished: SemiFinished[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  wastages: Wastage[];
  units: StockUnit[];
  stockMovements: StockMovement[];
  stockAdjustments: StockAdjustment[];
  productionRuns: ProductionRun[];
  requisitions: FranchiseRequisition[];
  cashSessions: CashSession[];
  devices: Device[];
  printers: Printer[];
  syncItems: SyncItem[];
  notifications: AppNotification[];
  notificationSettings: NotificationSetting[];
  auditLogs: AuditLog[];
  approvalRules: ApprovalRule[];
  connection: ConnectionState;
  maxOfflineDays: number;
  /* operations */
  serviceCharge: ServiceChargeRule;
  deliveryChargeRule: BillChargeRule;
  packagingChargeRule: BillChargeRule;
  taxRules: TaxRule[];
  invoiceFormat: InvoiceFormat;
  promoCodes: PromoCode[];
  paymentModes: PaymentModeConfig[];
  kitchens: Kitchen[];
  menus: Menu[];
  displayMode: "Keyboard" | "Touch";
  menuImages: boolean;
  dueBills: DueBill[];
  eBillCredit: number;
  tableGridView: TableGridView;
  keyboardOnly: boolean;
  defaultOrderType: OrderType;
  rolePermissions: Record<Role, RolePermissions>;
  roleSpecialPermissions: Record<Role, Partial<Record<SpecialPermission, boolean>>>;
}

const initialState: State = {
  authed: false,
  deviceRegistered: false,
  currentUserId: seed.CURRENT_USER_ID,
  tables: seed.tables,
  tableCategories: seed.tableCategories,
  orders: [...seed.liveOrders, ...seed.historyOrders],
  kots: seed.kots,
  menuItems: seed.menuItems,
  menuCategories: seed.menuCategories,
  variantMasters: seed.variantMasters,
  addonGroups: seed.addonGroups,
  users: seed.users,
  customers: seed.customers,
  reservations: seed.reservations,
  expenses: seed.expenses,
  expenseHeads: seed.expenseHeads,
  rawMaterials: seed.rawMaterials,
  recipes: stockSeed.recipes,
  semiFinished: seed.semiFinished,
  suppliers: seed.suppliers,
  purchaseOrders: stockSeed.purchaseOrders,
  wastages: seed.wastages,
  units: stockSeed.units,
  stockMovements: stockSeed.stockMovements,
  stockAdjustments: stockSeed.stockAdjustments,
  productionRuns: stockSeed.productionRuns,
  requisitions: stockSeed.requisitions,
  cashSessions: seed.pastCashSessions,
  devices: seed.devices,
  printers: seed.printers,
  syncItems: seed.syncItems,
  notifications: seed.notifications,
  notificationSettings: seed.notificationSettings,
  auditLogs: seed.auditLogs,
  approvalRules: seed.approvalRules,
  connection: "online",
  maxOfflineDays: seed.OFFLINE_SETTINGS.maxOfflineDays,
  serviceCharge: opsSeed.serviceCharge,
  deliveryChargeRule: opsSeed.deliveryChargeRule,
  packagingChargeRule: opsSeed.packagingChargeRule,
  taxRules: opsSeed.taxRules,
  invoiceFormat: opsSeed.invoiceFormat,
  promoCodes: opsSeed.promoCodes,
  paymentModes: opsSeed.paymentModes,
  kitchens: opsSeed.kitchens,
  menus: opsSeed.menus,
  displayMode: "Touch",
  menuImages: true,
  dueBills: opsSeed.dueBills,
  eBillCredit: seed.EBILL_SETTINGS.startingCredit,
  tableGridView: "Tabs",
  keyboardOnly: false,
  defaultOrderType: "Dine In",
  rolePermissions: seed.ROLE_PERMISSION_DEFAULTS,
  roleSpecialPermissions: seed.ROLE_SPECIAL_DEFAULTS,
};

export function lineTotal(l: OrderLine) {
  const addons = (l.addons ?? []).reduce((s, a) => s + a.price, 0);
  return (l.price + addons) * l.qty;
}

export interface BillTotals {
  subtotal: number;
  discount: number;
  service: number;
  delivery: number;
  packaging: number;
  taxLines: { id: string; name: string; amount: number }[];
  tax: number;
  grand: number;
}

export type BillSettings = Pick<
  State,
  "serviceCharge" | "deliveryChargeRule" | "packagingChargeRule" | "taxRules" | "invoiceFormat"
>;

/** Delivery/packaging: same rule shape as service charge, but gated on auto-apply order type. */
function chargeAmount(
  rule: BillChargeRule,
  subtotal: number,
  discount: number,
  orderType: OrderType,
): number {
  if (!rule.active || subtotal === 0) return 0;
  const opsType: OpsOrderType = orderType === "Dine In" ? "Dine-in" : "Pickup";
  if (rule.autoApply.length && !rule.autoApply.includes(opsType)) return 0;
  const base = rule.calculationOn === "core" ? subtotal : subtotal - discount;
  const qualifies =
    rule.condition === "always"
      ? true
      : rule.condition === "greater"
        ? base > rule.threshold
        : base < rule.threshold;
  if (!qualifies) return 0;
  return rule.type === "percent" ? Math.round(((base * rule.value) / 100) * 100) / 100 : rule.value;
}

/** Single bill-calculation engine — service charge, delivery/packaging rules, and dynamic tax rules. */
export function orderTotals(order: Order | undefined, settings: BillSettings): BillTotals {
  if (!order) {
    return {
      subtotal: 0,
      discount: 0,
      service: 0,
      delivery: 0,
      packaging: 0,
      taxLines: [],
      tax: 0,
      grand: 0,
    };
  }
  const subtotal = order.itemised
    ? order.lines.reduce((s, l) => s + lineTotal(l), 0)
    : (order.fallbackTotal ?? 0);
  const discount = order.discount?.amount ?? 0;

  const rule = settings.serviceCharge;
  const serviceBase = rule.calculationOn === "core" ? subtotal : subtotal - discount;
  const serviceQualifies =
    rule.condition === "always"
      ? true
      : rule.condition === "greater"
        ? serviceBase > rule.threshold
        : serviceBase < rule.threshold;
  const service =
    !rule.active || !serviceQualifies || subtotal === 0
      ? 0
      : rule.type === "percent"
        ? Math.round(((serviceBase * rule.value) / 100) * 100) / 100
        : rule.value;

  // a manual per-order override (set via `setCharges`) always wins over the computed rule
  const delivery =
    order.deliveryCharge ??
    chargeAmount(settings.deliveryChargeRule, subtotal, discount, order.type);
  const packaging =
    order.packagingCharge ??
    chargeAmount(settings.packagingChargeRule, subtotal, discount, order.type);

  const taxBase =
    Math.max(0, subtotal - discount) +
    (rule.taxOnCharge ? service : 0) +
    (settings.deliveryChargeRule.taxOnCharge ? delivery : 0) +
    (settings.packagingChargeRule.taxOnCharge ? packaging : 0);
  const gstOn = settings.invoiceFormat.gstCalculation;
  const taxLines = gstOn
    ? settings.taxRules
        .filter((t) => t.active)
        .map((t) => ({
          id: t.id,
          name: t.name,
          amount:
            Math.round((t.type === "percent" ? (taxBase * t.value) / 100 : t.value) * 100) / 100,
        }))
    : [];
  const tax = taxLines.reduce((s, t) => s + t.amount, 0);
  const grand =
    Math.round((Math.max(0, subtotal - discount) + service + delivery + packaging + tax) * 100) /
    100;
  return { subtotal, discount, service, delivery, packaging, taxLines, tax, grand };
}

/** Category is the single source of truth for kitchen routing — falls back to the default kitchen. */
export function resolveKitchen(kitchens: Kitchen[], categoryId: string): Kitchen | undefined {
  return (
    kitchens.find((k) => k.menuCategoryIds.includes(categoryId)) ??
    kitchens.find((k) => k.isDefault) ??
    kitchens[0]
  );
}

/** Same fallback pattern as `resolveKitchen`, for KOT-role printers (matched by category name). */
export function resolveKotPrinter(
  printers: Printer[],
  categoryName: string | undefined,
): Printer | undefined {
  const kotPrinters = printers.filter((p) => p.role !== "Bill");
  return (
    (categoryName ? kotPrinters.find((p) => p.categories.includes(categoryName)) : undefined) ??
    kotPrinters.find((p) => p.isDefault) ??
    kotPrinters[0]
  );
}

/**
 * A secondary menu matches only when BOTH its table-category and order-type scope match
 * (an empty list on either axis means "unrestricted on this axis"). Falls back to the
 * default menu, same fallback shape as `resolveKitchen`/`resolveKotPrinter`.
 */
export function resolveMenu(
  menus: Menu[],
  table: RestaurantTable | undefined,
  orderType: OrderType,
): Menu | undefined {
  const opsType: OpsOrderType = orderType === "Dine In" ? "Dine-in" : "Pickup";
  const direct = menus.find((m) => {
    if (m.isDefault) return false;
    const tableOk =
      m.tableCategoryIds.length === 0 || (!!table && m.tableCategoryIds.includes(table.categoryId));
    const typeOk = m.orderTypes.length === 0 || m.orderTypes.includes(opsType);
    return tableOk && typeOk;
  });
  return direct ?? menus.find((m) => m.isDefault) ?? menus[0];
}

interface Ctx extends State {
  currentUser: User;
  transactionsBlocked: boolean;
  /* permissions */
  can: (moduleName: PermissionModule, action: StandardAction) => boolean;
  canSpecial: (perm: SpecialPermission) => boolean;
  updateRoleDefaults: (role: Role, permissions: RolePermissions) => void;
  updateRoleSpecialDefaults: (
    role: Role,
    special: Partial<Record<SpecialPermission, boolean>>,
  ) => void;
  updateUserPermissionOverrides: (
    userId: string,
    overrides: PermissionOverrides | undefined,
  ) => void;
  /* auth */
  registerDevice: () => void;
  login: (userId?: string) => void;
  logout: () => void;
  /* helpers */
  tableLabel: (tableId: string) => string;
  tableById: (id: string) => RestaurantTable | undefined;
  orderById: (id: string) => Order | undefined;
  orderForTable: (tableId: string) => Order | undefined;
  /* order lifecycle */
  startOrder: (tableId: string, guests: number) => string;
  startTakeAway: () => string;
  /** Starts a new order using the outlet's configured default order type — auto-picks a free table for Dine In, falling back to Pickup if none are free. */
  startDefaultOrder: () => string;
  setOrderType: (orderId: string, type: OrderType) => void;
  addLine: (orderId: string, input: AddLineInput) => void;
  changeQty: (orderId: string, lineId: string, delta: number) => void;
  setLineQty: (orderId: string, lineId: string, qty: number) => void;
  setLineNote: (orderId: string, lineId: string, note: string) => void;
  removeLine: (orderId: string, lineId: string) => void;

  holdOrder: (orderId: string) => void;
  saveOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  removeOrder: (id: string) => void;
  removeOrders: (ids: string[]) => void;
  remakeOrderSequence: (startFrom: number) => void;
  generateKot: (orderId: string) => void;
  applyDiscount: (orderId: string, label: string, amount: number) => void;
  setCustomer: (orderId: string, name: string, phone: string) => void;
  setCharges: (orderId: string, delivery: number, packaging: number) => void;
  generateBill: (orderId: string) => void;
  settleOrder: (orderId: string, payments: PaymentSplit[]) => void;
  reopenOrder: (orderId: string) => void;
  mergeTables: (sourceTableId: string, destTableId: string) => void;
  transferTable: (orderId: string, destTableId: string) => void;
  /* kds */
  setKotStatus: (kotId: string, status: Kot["status"]) => void;
  receiveKdsTicket: (payload: KdsTicketPayload) => void;
  receiveKdsOrderComplete: (backendOrderId: number) => void;
  /* reservations */
  addReservation: (r: Omit<Reservation, "id">) => void;
  setReservationStatus: (id: string, status: Reservation["status"]) => void;
  setReleaseMode: (id: string, mode: "Manual" | "Auto") => void;
  /* cash */
  openSession: (float: number) => void;
  addCash: (amount: number, reason: string) => void;
  withdrawCash: (amount: number, reason: string) => boolean;
  attachExpense: (headId: string, amount: number, note: string) => void;
  closeSession: (counted: number, reason: string) => void;
  sessionBalance: () => number;
  openSessionRecord: () => CashSession | undefined;
  /* generic crud */
  upsertMenuItem: (item: MenuItem) => void;
  removeMenuItem: (id: string) => void;
  setMenuItemsActive: (ids: string[], active: boolean) => void;
  removeMenuItems: (ids: string[]) => void;
  bulkImportMenuItems: (
    rows: {
      name: string;
      categoryName: string;
      price: number;
      sku?: string;
      veg?: boolean;
      active?: boolean;
    }[],
    menuId: string,
  ) => void;
  upsertMenuCategory: (c: MenuCategory) => void;
  removeMenuCategory: (id: string) => void;
  upsertVariant: (v: VariantOption) => void;
  removeVariant: (id: string) => void;
  upsertAddonGroup: (g: AddonGroup) => void;
  removeAddonGroup: (id: string) => void;
  loadMenuFromServer: () => Promise<void>;
  upsertTable: (t: RestaurantTable) => void;
  removeTable: (id: string) => void;
  removeTables: (ids: string[]) => void;
  addTables: (tables: RestaurantTable[]) => void;
  upsertTableCategory: (c: TableCategory) => void;
  removeTableCategory: (id: string) => void;
  loadTablesFromServer: () => Promise<void>;
  upsertUser: (u: User) => void;
  loadUsersFromServer: () => Promise<void>;
  loadInvoiceFormatFromServer: () => Promise<void>;
  loadDueBillsFromServer: () => Promise<void>;
  loadCustomersFromServer: () => Promise<void>;
  loadKitchensFromServer: () => Promise<void>;
  loadPrintersFromServer: () => Promise<void>;
  upsertExpense: (e: Expense) => void;
  upsertExpenseHead: (h: ExpenseHead) => void;
  upsertRawMaterial: (m: RawMaterial) => void;
  upsertSupplier: (s: Supplier) => void;
  upsertPurchaseOrder: (p: PurchaseOrder) => void;
  receivePurchaseOrder: (id: string) => void;
  addWastage: (w: Omit<Wastage, "id">) => void;
  produceSemiFinished: (id: string, batches: number) => void;
  /* stock module */
  upsertUnit: (u: StockUnit) => void;
  savePurchase: (po: PurchaseOrder, opts?: { receive?: boolean }) => void;
  payPurchaseOrder: (id: string, amount: number) => void;
  cancelPurchaseOrder: (id: string) => void;
  poTotals: (po: PurchaseOrder) => {
    subtotal: number;
    tax: number;
    discount: number;
    grand: number;
  };
  saveStockCount: (rows: { materialId: string; countedQty: number }[], note?: string) => void;
  addWastageBatch: (
    rows: { materialId: string; qty: number; reason: string; notes?: string }[],
  ) => void;
  upsertSemiFinished: (sf: SemiFinished) => void;
  removeSemiFinished: (id: string) => void;
  recordProduction: (semiId: string, qty: number, notes?: string) => void;
  semiUnitCost: (semiId: string) => number;
  upsertRecipe: (r: Recipe) => void;
  removeRecipe: (id: string) => void;
  recipeGroupCost: (g: RecipeGroup) => number;
  createRequisition: (
    items: { materialId: string; orderedQty: number; unitPrice: number }[],
    remarks?: string,
  ) => void;
  setRequisitionStatus: (id: string, status: RequisitionStatus) => void;
  setRequisitionQty: (id: string, materialId: string, qty: number) => void;
  removeRequisition: (id: string) => void;
  fulfilRequisition: (id: string) => void;
  /* system */
  setConnection: (state: ConnectionState) => void;
  syncNow: () => void;
  retrySync: (id?: string) => void;
  resolveConflict: (id: string) => void;
  setDeviceStatus: (id: string, status: Device["status"]) => void;
  renameDevice: (id: string, name: string) => void;
  deregisterDevice: (id: string) => void;
  upsertPrinter: (p: Printer) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleNotificationSetting: (trigger: string, channel: "whatsapp" | "sms" | "inApp") => void;
  toggleApprovalRule: (id: string) => void;
  updateApprovalThreshold: (id: string, threshold: string, approver: Role) => void;
  /* operations */
  setDeliveryChargeRule: (rule: BillChargeRule) => void;
  setPackagingChargeRule: (rule: BillChargeRule) => void;
  setServiceCharge: (rule: ServiceChargeRule) => void;
  upsertTaxRule: (rule: TaxRule) => void;
  removeTaxRule: (id: string) => void;
  toggleTaxRule: (id: string) => void;
  setInvoiceFormat: (fmt: InvoiceFormat) => void;
  setGstCalculation: (on: boolean) => void;
  upsertPromo: (promo: PromoCode) => void;
  togglePromo: (id: string) => void;
  upsertKitchen: (kitchen: Kitchen) => void;
  removeKitchen: (id: string) => void;
  setDefaultKitchen: (id: string) => void;
  resolveKitchenForCategory: (categoryId: string) => Kitchen | undefined;
  removePrinter: (id: string) => void;
  setDefaultKotPrinter: (id: string) => void;
  resolveKotPrinterForCategory: (categoryId: string) => Printer | undefined;
  upsertPaymentMode: (mode: PaymentModeConfig) => void;
  removePaymentMode: (id: string) => void;
  setPaymentModeActive: (id: string, active: boolean) => void;
  upsertMenu: (menu: Menu) => void;
  removeMenu: (id: string) => void;
  setDefaultMenu: (id: string) => void;
  setOrderMenu: (orderId: string, menuId: string) => void;
  setDisplayMode: (mode: "Keyboard" | "Touch") => void;
  setMenuImages: (on: boolean) => void;
  setTableGridView: (view: TableGridView) => void;
  setKeyboardOnly: (on: boolean) => void;
  setDefaultOrderType: (type: OrderType) => void;
  setGuestCount: (orderId: string, guests: number) => void;
  addCustomLine: (orderId: string, name: string, price: number, qty: number) => void;
  upsertCustomer: (customer: Customer) => void;
  toggleCustomer: (id: string) => void;
  settleDueBills: (ids: string[], payments: PaymentSplit[]) => void;
  setMaxOfflineDays: (days: number) => void;
  sendEBill: (orderId: string) => boolean;
}

// uat-backend/model/table.js: table_status is R/F/P/H/B, not the mock's
// label strings - this is the one place that mapping happens.
const TABLE_STATUS_MAP: Record<RawTable["table_status"], TableStatus> = {
  F: "Free",
  R: "Running",
  P: "Bill Generated",
  H: "Held",
  B: "Reserved",
};

function mapRawCategory(c: RawTableCategory): TableCategory {
  return { id: String(c.id), name: c.table_catag_nm, sortOrder: c.id };
}

function mapRawTable(t: RawTable): RestaurantTable {
  return {
    id: String(t.id),
    name: t.table_name,
    categoryId: String(t.table_catag_id),
    seats: t.capacity ?? 0,
    status: TABLE_STATUS_MAP[t.table_status],
  };
}

// Backend has no concept of multiple menu catalogues - every category/item/
// variant/addon it returns belongs to the whole hotel. Server-loaded rows
// get tagged with whichever menu is currently marked default so the
// existing menu-scoped UI keeps working, but switching menus after real
// data has loaded won't filter anything - there's only ever one real
// catalogue behind it.
const DIETARY_VALUES: MenuDietary[] = ["Regular Veg", "Jain", "Non-Veg", "Vegan", "Swaminarayan"];

function mapRawMenuCategory(c: RawMenuCategory, menuId: string): MenuCategory {
  return {
    id: String(c.id),
    name: c.menu_categ_nm,
    active: c.active,
    sortOrder: c.rank ?? c.id,
    menuId,
  };
}

function mapRawMenuItem(m: RawMenuItem, menuId: string): MenuItem {
  const dietary = DIETARY_VALUES.includes(m.sub_categories as MenuDietary)
    ? (m.sub_categories as MenuDietary)
    : undefined;
  return {
    id: String(m.id),
    name: m.item_name,
    categoryId: String(m.menu_categ_id),
    price: Number(m.price),
    favourite: m.favorite,
    active: m.active,
    // No separate veg flag on the backend - inferred from the dietary text.
    veg: dietary ? dietary !== "Non-Veg" : true,
    dietary,
    sku: m.shortCode,
    barcode: m.barcode_value || undefined,
    description: m.description || undefined,
    imageUrl: m.foodImage || undefined,
    menuId,
  } as MenuItem;
}

function mapRawVariant(v: RawVariant, menuId: string): VariantOption {
  // The Variants master (GET /variant) has no price field at all - only
  // `id`/`variants_name`/`active` (confirmed live and in getAllVariant's
  // own `attributes` allowlist). Real pricing only exists per-menu-item,
  // on the MenuVariants join row (variant_price), set when a variant is
  // attached to a specific item - out of scope here, no UI for it yet.
  return { id: String(v.id), name: v.variants_name, price: 0, menuId };
}

function mapRawAddonGroup(g: RawAddonGroup, menuId: string): AddonGroup {
  return {
    id: String(g.id),
    name: g.department_name,
    min: g.minimum_allowed_addon,
    max: g.maximum_allowed_addon,
    selection: g.singleSelection ? "Single" : "Multiple",
    options: (g.hms_addon_msts ?? []).map((a) => ({
      id: String(a.id),
      name: a.addon_name,
      price: a.price,
    })),
    menuId,
  };
}

// Backend requires a non-empty alphanumeric shortCode on every menu item
// (menuSchema: .alphanum().required()) but the current Items form's SKU
// field is optional and free-text. Derives one when missing/invalid rather
// than blocking save on a field the UI doesn't make mandatory.
function toShortCode(sku: string | undefined, name: string, seed: string): string {
  const fromSku = (sku ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (fromSku) return fromSku.slice(0, 20);
  const fromName = name.replace(/[^a-zA-Z0-9]/g, "");
  return (fromName || `ITEM${seed}`).slice(0, 20);
}

function mapRawUser(u: RawHotelUser): User {
  const accessByName = new Map((u.hms_user_accesses ?? []).map((a) => [a.access_name, a]));
  return {
    id: String(u.id),
    name: u.name,
    // role_mst.role_name is only reliably one of the 7 new-design role
    // names after migrations/20260824062338-extend-role-name-enum.js -
    // older rows may still carry a legacy single-letter code (or, for rows
    // created before that migration, an empty string the enum silently
    // coerced invalid values to). Falling back to "Cashier" rather than
    // leaving it blank/invalid in the UI.
    role: (u.role_mst?.role_name && ROLE_VALUES.includes(u.role_mst.role_name as Role)
      ? u.role_mst.role_name
      : "Cashier") as Role,
    mobile: u.number,
    email: u.email,
    status: u.active ? "Active" : "Inactive",
    // The real PIN is never returned (only its bcrypt hash) - there is no
    // way to display or re-derive it. Left blank; only a re-save sets a
    // new one.
    pin: "",
    permissionOverrides: (() => {
      const modules: Partial<Record<PermissionModule, Partial<ModuleGrant>>> = {};
      for (const [permModule, backendArea] of Object.entries(MODULE_TO_ACCESS_AREA) as [
        PermissionModule,
        string,
      ][]) {
        const access = accessByName.get(backendArea);
        if (access) {
          modules[permModule] = {
            view: access.read,
            create: access.create,
            edit: access.edit,
            delete: access.delete,
          };
        }
      }
      return Object.keys(modules).length ? { modules } : undefined;
    })(),
  };
}

function mapRawDueOrder(o: RawDueOrder): DueBill {
  const created = new Date(o.createdAt);
  const daysAgo = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  const dd = `${created.getDate()}`.padStart(2, "0");
  const mm = `${created.getMonth() + 1}`.padStart(2, "0");
  return {
    id: `due-${o.id}`,
    backendOrderId: o.id,
    billNo: `#${o.bill_no}`,
    customerName: o.hms_user_master?.name || "Guest",
    mobile: o.hms_user_master?.number || "",
    date: `${dd}/${mm}/${created.getFullYear()}`,
    daysAgo,
    amount: o.due,
    status: "Due",
  };
}

function mapRawCustomer(c: RawCustomer, previousActive?: boolean): Customer {
  return {
    id: String(c.id),
    name: c.name || "",
    phone: c.number,
    // No order-count or last-visit date in this endpoint's response (see
    // customerApi's own comment) - nothing to load these from.
    orders: 0,
    lastVisit: "—",
    gstin: c.gstin || undefined,
    address: c.address || undefined,
    // "Autofill" has no backend equivalent (no active/enabled column on
    // the customer model) - stays purely local, carried over across
    // reloads by id rather than reset to true every time.
    active: previousActive ?? true,
  };
}

function mapRawKitchen(k: RawKitchen, previousIsDefault?: boolean): Kitchen {
  // model/kitchen.js's columns are JSON-typed but confirmed live to come
  // back as JSON-encoded strings ("[1,2]"), not already-parsed arrays -
  // handling both rather than assuming the string shape is permanent.
  const parseIdArray = (v: unknown): string[] => {
    try {
      const arr = typeof v === "string" ? JSON.parse(v || "[]") : Array.isArray(v) ? v : [];
      return (arr as unknown[]).map((n) => String(n));
    } catch {
      return [];
    }
  };
  const parseOrderTypes = (v: unknown): OpsOrderType[] => {
    try {
      const arr = typeof v === "string" ? JSON.parse(v || "[]") : Array.isArray(v) ? v : [];
      return (arr as string[]).map((t) => (t === "dinin" ? "Dine-in" : "Pickup"));
    } catch {
      return [];
    }
  };
  return {
    id: String(k.id),
    name: k.kitchen_name,
    menuCategoryIds: parseIdArray(k.menu_categ_ids),
    tableIds: parseIdArray(k.table_ids),
    orderTypes: parseOrderTypes(k.order_type),
    // No backend equivalent (see kitchenApi's own comment) - carried over
    // across reloads by id rather than reset every time.
    isDefault: previousIsDefault,
  };
}

// model/printer_setting.js's printer_size ENUM ('2'/'3'/'4') is never
// actually interpreted anywhere server-side (create/edit/list just carry
// the string through) - no source documents what each value means, so
// this ascending-width guess (58mm/80mm/A4, matching the model's own
// default of '3' to this app's own default of 80mm) is an assumption,
// not a confirmed mapping. It has no behavioral consequence server-side
// either way.
const PRINTER_SIZE_TO_BACKEND: Record<NonNullable<Printer["size"]>, "2" | "3" | "4"> = {
  "58mm": "2",
  "80mm": "3",
  A4: "4",
};
const PRINTER_SIZE_FROM_BACKEND: Record<"2" | "3" | "4", NonNullable<Printer["size"]>> = {
  "2": "58mm",
  "3": "80mm",
  "4": "A4",
};

function mapRawPrinter(p: RawPrinter, menuCategories: MenuCategory[]): Printer {
  const parseArray = (v: unknown): unknown[] => {
    try {
      return typeof v === "string" ? JSON.parse(v || "[]") : Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const categoryIds = parseArray(p.menu_categ_ids).map((n) => String(n));
  const categoryNames = categoryIds
    .map((id) => menuCategories.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);
  const tableIds = parseArray(p.table_ids).map((n) => String(n));
  const orderTypes = (parseArray(p.order_type) as string[]).map((t) =>
    t === "dinin" ? "Dine-in" : "Pickup",
  ) as OpsOrderType[];
  const printType: Printer["printType"] = p.print_type === "K" ? "KOT" : "Invoice";
  return {
    id: String(p.id),
    name: p.printer_name,
    size: PRINTER_SIZE_FROM_BACKEND[p.printer_size] ?? "80mm",
    type:
      p.printer_size === "2"
        ? "Thermal 58mm"
        : p.printer_size === "4"
          ? "A4 Laser"
          : "Thermal 80mm",
    // "connection" (LAN/USB/Bluetooth) and "status" (Ready/Offline/Paper
    // Out) are physical-hardware properties this cloud backend has no way
    // to know - not loaded from anywhere, stay at prototype defaults.
    connection: "LAN",
    status: "Ready",
    role: printType === "Invoice" ? "Bill" : "KOT",
    printType,
    copies: p.number_of_copies,
    categories: categoryNames,
    orderTypes,
    tableIds,
  };
}

const ROLE_VALUES: Role[] = [
  "Owner",
  "Manager",
  "Cashier",
  "Captain",
  "Kitchen Staff",
  "Inventory Manager",
  "Accountant",
];

// Backend's UserAccess is a flat 10-area x (read/create/edit/delete) grid
// with no per-user overrides and no concept of the frontend's 23 granular
// modules or its 7 "special permissions" (orders.editAfterKot etc) at all -
// wiring the full rich permission editor to it isn't a data-mapping problem,
// it's a product/schema decision (does the backend even gain per-user
// overrides? which of the 23 modules collapse into which of the 10 areas?)
// that hasn't been made. This is a best-effort default mapping used only to
// give a newly-created user *some* real, sensible starting permissions
// (derived from their role's default grants) - it is not a live sync of the
// permission editor, and per-user overrides in the UI are not persisted to
// the backend at all.
const MODULE_TO_ACCESS_AREA: Partial<Record<PermissionModule, string>> = {
  orders: "Order",
  tables: "Table",
  menu: "Menu",
  dashboard: "DashBoard",
  reports: "Reports",
  biller: "Biller",
  users: "User",
  reservations: "Booking",
  "stock-masters": "Stock",
  expense: "Expense",
};

// Every backend access area gets at least a false-filled row (some areas,
// like "Zomato", have no frontend module equivalent at all and stay
// all-false) - the controllers require the full 10-entry array regardless.
const BACKEND_ACCESS_AREAS = [
  "Order",
  "Table",
  "Menu",
  "DashBoard",
  "Reports",
  "Biller",
  "User",
  "Booking",
  "Stock",
  "Expense",
  "Zomato",
];

function buildAccessNameFromRole(role: Role, rolePermissions: Record<Role, RolePermissions>) {
  const grants = rolePermissions[role];
  const grantFor = (area: string) => {
    const permModule = (Object.entries(MODULE_TO_ACCESS_AREA) as [PermissionModule, string][]).find(
      ([, a]) => a === area,
    )?.[0];
    const g = permModule ? grants[permModule] : undefined;
    return {
      read: g?.view ?? false,
      create: g?.create ?? false,
      edit: g?.edit ?? false,
      delete: g?.delete ?? false,
    };
  };
  return BACKEND_ACCESS_AREAS.map((access) => ({ access, permissions: grantFor(access) }));
}

// The new design's staff accounts authenticate via PIN (login.tsx's PIN
// tab), not a password - there's no password field on the User type at
// all. The backend requires one regardless (userSchema/userSchemaUpdate),
// so this derives a placeholder that satisfies its min-length-6 rule.
// It's never shown or used as a real credential anywhere in the UI.
function placeholderPassword(pin: string) {
  return `Pin${pin || "0000"}`;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(initialState);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("billerpe.session");
    if (saved) {
      const parsed = JSON.parse(saved) as { userId: string; device: boolean };
      set((p) => ({
        ...p,
        authed: true,
        deviceRegistered: parsed.device,
        currentUserId: parsed.userId,
      }));
    }
  }, []);

  const patch = useCallback((fn: (p: State) => State) => set(fn), []);

  const currentUser = useMemo(
    () => s.users.find((u) => u.id === s.currentUserId) ?? s.users[0],
    [s.users, s.currentUserId],
  );

  const tableLabel = useCallback(
    (tableId: string) => {
      const t = s.tables.find((x) => x.id === tableId);
      if (!t) return "Take Away";
      const cat = s.tableCategories.find((c) => c.id === t.categoryId);
      return `${cat?.name ?? ""} · ${t.name}`;
    },
    [s.tables, s.tableCategories],
  );

  const log = useCallback(
    (action: string, entity: string, before: string, after: string, reason?: string) => {
      const entry: AuditLog = {
        id: uid("a"),
        userId: s.currentUserId,
        userName: currentUser?.name ?? "Taj",
        action,
        entity,
        before,
        after,
        device: "Counter POS",
        ip: "192.168.1.14",
        at: nowStamp(),
        ...(reason ? { reason } : {}),
      };
      patch((p) => ({ ...p, auditLogs: [entry, ...p.auditLogs] }));
    },
    [currentUser, patch, s.currentUserId],
  );

  const transactionsBlocked = s.connection === "offline-limit-exceeded";

  const guardBlocked = useCallback(() => {
    if (s.connection === "offline-limit-exceeded") {
      toast.error("New transactions are blocked", {
        description: `This device has been offline longer than the ${s.maxOfflineDays}-day limit. Reconnect and sync to resume billing.`,
      });
      return true;
    }
    return false;
  }, [s.connection, s.maxOfflineDays]);

  /* ---------------- permissions ---------------- */

  const resolvedPermissions = useMemo(() => {
    if (!currentUser || currentUser.role === "Owner") return null;
    const base = s.rolePermissions[currentUser.role];
    const overrides: PermissionOverrides | undefined = currentUser.permissionOverrides;
    const modules = Object.fromEntries(
      (Object.keys(base) as PermissionModule[]).map((m) => [
        m,
        { ...base[m], ...(overrides?.modules?.[m] ?? {}) },
      ]),
    ) as RolePermissions;
    const special = {
      ...s.roleSpecialPermissions[currentUser.role],
      ...(overrides?.special ?? {}),
    };
    return { modules, special };
  }, [currentUser, s.rolePermissions, s.roleSpecialPermissions]);

  const can = useCallback(
    (moduleName: PermissionModule, action: StandardAction) =>
      currentUser?.role === "Owner" ? true : !!resolvedPermissions?.modules[moduleName]?.[action],
    [currentUser, resolvedPermissions],
  );

  const canSpecial = useCallback(
    (perm: SpecialPermission) =>
      currentUser?.role === "Owner" ? true : !!resolvedPermissions?.special[perm],
    [currentUser, resolvedPermissions],
  );

  const guardForbidden = useCallback(
    (moduleName: PermissionModule, action: StandardAction, label?: string) => {
      if (can(moduleName, action)) return false;
      toast.error("Permission denied", {
        description: label ?? `Your role can't ${action} ${moduleName}.`,
      });
      log(
        "Permission Denied",
        label ?? moduleName,
        "",
        "",
        `role ${currentUser?.role} lacks ${moduleName}.${action}`,
      );
      return true;
    },
    [can, currentUser, log],
  );

  const guardForbiddenSpecial = useCallback(
    (perm: SpecialPermission, label?: string) => {
      if (canSpecial(perm)) return false;
      toast.error("Permission denied", { description: label ?? "Your role can't do this." });
      log("Permission Denied", label ?? perm, "", "", `role ${currentUser?.role} lacks ${perm}`);
      return true;
    },
    [canSpecial, currentUser, log],
  );

  const nextOrderNo = useCallback(
    () => Math.max(...s.orders.map((o) => o.orderNo), 100) + 1,
    [s.orders],
  );

  const poTotals = useCallback((po: PurchaseOrder) => {
    const subtotal = po.lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
    const tax = po.lines.reduce((sum, l) => sum + (l.qty * l.rate * (l.taxPct ?? 0)) / 100, 0);
    const discount =
      po.discountType === "percent"
        ? (subtotal * (po.discountValue ?? 0)) / 100
        : (po.discountValue ?? 0);
    const grand = Math.max(0, Math.round((subtotal + tax - discount) * 100) / 100);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      grand,
    };
  }, []);

  const semiUnitCost = useCallback(
    (semiId: string) => {
      const sf = s.semiFinished.find((x) => x.id === semiId);
      if (!sf) return 0;
      return sf.components.reduce((sum, c) => {
        const m = s.rawMaterials.find((x) => x.id === c.materialId);
        return sum + (m ? m.rate * c.qty : 0);
      }, 0);
    },
    [s.semiFinished, s.rawMaterials],
  );

  const movement = (
    kind: StockMovement["kind"],
    refType: StockMovement["refType"],
    refId: string,
    qty: number,
    value: number,
    reference: string,
    by: string,
  ): StockMovement => ({
    id: uid("mv"),
    kind,
    refType,
    refId,
    qty: Math.round(qty * 1000) / 1000,
    value: Math.round(value * 100) / 100,
    reference,
    at: nowStamp(),
    by,
  });

  const value: Ctx = {
    ...s,
    currentUser,
    transactionsBlocked,
    can,
    canSpecial,
    tableLabel,
    tableById: (id) => s.tables.find((t) => t.id === id),
    orderById: (id) => s.orders.find((o) => o.id === id),
    orderForTable: (tableId) =>
      s.orders.find(
        (o) => o.tableId === tableId && ["Held", "Running", "Bill Generated"].includes(o.status),
      ),

    updateRoleDefaults: (role, permissions) => {
      if (guardForbidden("permissions", "edit")) return;
      patch((p) => ({
        ...p,
        rolePermissions: { ...p.rolePermissions, [role]: permissions },
      }));
      log("Role Permissions Updated", role, "", "", `updated module grants for ${role}`);
      toast.success(`${role} permissions updated`);
    },

    updateRoleSpecialDefaults: (role, special) => {
      if (guardForbidden("permissions", "edit")) return;
      patch((p) => ({
        ...p,
        roleSpecialPermissions: {
          ...p.roleSpecialPermissions,
          [role]: { ...p.roleSpecialPermissions[role], ...special },
        },
      }));
      log("Role Permissions Updated", role, "", "", `updated special permissions for ${role}`);
      toast.success(`${role} permissions updated`);
    },

    updateUserPermissionOverrides: (userId, overrides) => {
      if (guardForbidden("permissions", "edit")) return;
      const u = s.users.find((x) => x.id === userId);
      if (!u) return;
      patch((p) => ({
        ...p,
        users: p.users.map((x) => (x.id === userId ? { ...x, permissionOverrides: overrides } : x)),
      }));
      log(
        "User Permission Override",
        u.name,
        "",
        "",
        overrides ? "set custom overrides" : "reset to role default",
      );
      toast.success(`${u.name}'s permissions updated`);
    },

    registerDevice: () => {
      patch((p) => ({ ...p, deviceRegistered: true }));
      toast.success("Device registered", { description: "Counter POS · 192.168.1.14" });
    },
    login: (userId) => {
      const id = userId ?? s.currentUserId;
      patch((p) => ({ ...p, authed: true, currentUserId: id, deviceRegistered: true }));
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "billerpe.session",
          JSON.stringify({ userId: id, device: true }),
        );
      }
    },
    logout: () => {
      patch((p) => ({ ...p, authed: false }));
      if (typeof window !== "undefined") window.localStorage.removeItem("billerpe.session");
    },

    startOrder: (tableId, guests) => {
      const id = uid("o");
      const label = tableLabel(tableId);
      const table = s.tables.find((t) => t.id === tableId);
      const menuId = resolveMenu(s.menus, table, "Dine In")?.id;
      patch((p) => ({
        ...p,
        tables: p.tables.map((t) =>
          t.id === tableId
            ? { ...t, status: "Running", guests, orderId: id, occupiedSince: nowStamp() }
            : t,
        ),
        orders: [
          {
            id,
            orderNo: Math.max(...p.orders.map((o) => o.orderNo), 100) + 1,
            type: "Dine In",
            tableId,
            tableLabel: label,
            guests,
            status: "Running",
            kotRounds: 0,
            lines: [],
            menuId,
            businessDate: todayLabel,
            createdAt: nowStamp(),
            createdBy: currentUser?.name ?? "Taj",
            itemised: true,
          },
          ...p.orders,
        ],
      }));
      return id;
    },

    startTakeAway: () => {
      const id = uid("o");
      const menuId = resolveMenu(s.menus, undefined, "Pickup")?.id;
      patch((p) => ({
        ...p,
        orders: [
          {
            id,
            orderNo: Math.max(...p.orders.map((o) => o.orderNo), 100) + 1,
            type: "Pickup",
            tableLabel: "Take Away",
            guests: 1,
            status: "Running",
            kotRounds: 0,
            lines: [],
            menuId,
            businessDate: todayLabel,
            createdAt: nowStamp(),
            createdBy: currentUser?.name ?? "Taj",
            itemised: true,
          },
          ...p.orders,
        ],
      }));
      return id;
    },

    startDefaultOrder: () => {
      if (s.defaultOrderType === "Dine In") {
        const freeTable = s.tables.find((t) => t.status === "Free");
        if (freeTable) return value.startOrder(freeTable.id, 1);
        toast.error("No free tables", {
          description: "Started a pickup order instead — assign a table from Keyboard Billing.",
        });
      }
      return value.startTakeAway();
    },

    setOrderType: (orderId, type) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || o.type === type) return;
      const sourceTableId = o.tableId;
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId
            ? type === "Pickup"
              ? { ...x, type, tableId: undefined, tableLabel: "Take Away" }
              : { ...x, type }
            : x,
        ),
        tables:
          type === "Pickup"
            ? p.tables.map((t) =>
                t.id === sourceTableId
                  ? {
                      ...t,
                      status: "Free" as const,
                      guests: undefined,
                      orderId: undefined,
                      occupiedSince: undefined,
                    }
                  : t,
              )
            : p.tables,
      }));
      log("Order Type Changed", `Order #${o.orderNo}`, o.type, type);
      toast.success(`Order #${o.orderNo} switched to ${type}`);
    },

    addLine: (orderId, input) => {
      const mi = s.menuItems.find((m) => m.id === input.itemId);
      if (!mi) return;
      const order = s.orders.find((o) => o.id === orderId);
      const price = input.variant
        ? (mi.variants?.find((v) => v.name === input.variant)?.price ?? mi.price)
        : mi.price;
      const recipe = s.recipes.find((r) => r.menuItemId === mi.id);
      const lowMaterial = recipe?.components
        .map((c) => s.rawMaterials.find((m) => m.id === c.materialId))
        .find((m) => m && m.stock <= m.reorderLevel);
      if (lowMaterial) {
        toast.warning(`Low stock: ${lowMaterial.name}`, {
          description: `${mi.name} uses ${lowMaterial.name} — only ${lowMaterial.stock} ${lowMaterial.unit} left.`,
        });
      }
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) => {
          if (o.id !== orderId) return o;
          const round = o.kotRounds + 1;
          const existing = o.lines.find(
            (l) =>
              l.itemId === input.itemId &&
              l.kotRound === round &&
              (l.variant ?? "") === (input.variant ?? "") &&
              JSON.stringify(l.addons ?? []) === JSON.stringify(input.addons ?? []),
          );
          if (existing) {
            return {
              ...o,
              lines: o.lines.map((l) =>
                l.id === existing.id ? { ...l, qty: l.qty + (input.qty ?? 1) } : l,
              ),
            };
          }
          const newLine: OrderLine = {
            id: uid("l"),
            itemId: mi.id,
            name: mi.name,
            qty: input.qty ?? 1,
            price,
            kotRound: round,
            ...(input.variant ? { variant: input.variant } : {}),
            ...(input.addons?.length ? { addons: input.addons } : {}),
            ...(input.note ? { note: input.note } : {}),
          };
          return { ...o, lines: [newLine, ...o.lines] };
        }),
      }));
      if (order) {
        log(
          "Item Added",
          `Order #${order.orderNo}`,
          "—",
          `${input.qty ?? 1}× ${mi.name}${input.variant ? ` (${input.variant})` : ""}`,
        );
      }
    },

    changeQty: (orderId, lineId, delta) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                lines: o.lines
                  .map((l) => (l.id === lineId ? { ...l, qty: l.qty + delta } : l))
                  .filter((l) => l.qty > 0),
              }
            : o,
        ),
      }));
      if (order && line) {
        const newQty = line.qty + delta;
        log(
          "Qty Changed",
          `Order #${order.orderNo}`,
          `${line.name} ×${line.qty}`,
          newQty > 0 ? `×${newQty}` : "Removed",
        );
      }
    },

    setLineQty: (orderId, lineId, qty) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                lines: o.lines
                  .map((l) => (l.id === lineId ? { ...l, qty: Math.max(0, Math.round(qty)) } : l))
                  .filter((l) => l.qty > 0),
              }
            : o,
        ),
      }));
      if (order && line) {
        log(
          "Qty Changed",
          `Order #${order.orderNo}`,
          `${line.name} ×${line.qty}`,
          Math.max(0, Math.round(qty)) > 0 ? `×${Math.max(0, Math.round(qty))}` : "Removed",
        );
      }
    },

    setLineNote: (orderId, lineId, note) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, note } : l)) }
            : o,
        ),
      }));
      if (order && line) {
        log("Note Added", `Order #${order.orderNo}`, line.name, note || "—");
      }
    },

    removeLine: (orderId, lineId) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o,
        ),
      }));
      if (order && line) {
        log("Item Removed", `Order #${order.orderNo}`, `${line.name} ×${line.qty}`, "Removed");
      }
    },

    holdOrder: (orderId) => {
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) => (x.id === orderId ? { ...x, status: "Held" } : x)),
        tables: p.tables.map((t) => (t.id === o?.tableId ? { ...t, status: "Held" } : t)),
      }));
      log("Order Held", `Order #${o?.orderNo}`, o?.status ?? "", "Held");
      toast.success(`Order #${o?.orderNo} held`, { description: o?.tableLabel });
    },

    saveOrder: (orderId) => {
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) => (x.id === orderId ? { ...x, status: "Running" } : x)),
        tables: p.tables.map((t) => (t.id === o?.tableId ? { ...t, status: "Running" } : t)),
      }));
      log("Order Saved", `Order #${o?.orderNo}`, o?.status ?? "", "Running");
      toast.success(`Order #${o?.orderNo} saved`, { description: o?.tableLabel });
    },

    cancelOrder: (orderId) => {
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) => (x.id === orderId ? { ...x, status: "Cancelled" } : x)),
        tables: p.tables.map((t) =>
          t.id === o?.tableId ? { ...t, status: "Free", guests: undefined, orderId: undefined } : t,
        ),
        kots: p.kots.map((k) => (k.orderId === orderId ? { ...k, status: "Cancelled" } : k)),
      }));
      log("Order Cancelled", `Order #${o?.orderNo}`, o?.status ?? "", "Cancelled");
      toast.success(`Order #${o?.orderNo} cancelled`);
    },
    removeOrder: (id) => {
      patch((p) => ({ ...p, orders: p.orders.filter((o) => o.id !== id) }));
      toast.success("Order removed");
    },
    removeOrders: (ids) => {
      patch((p) => ({ ...p, orders: p.orders.filter((o) => !ids.includes(o.id)) }));
      toast.success(`${ids.length} order(s) removed`);
    },

    remakeOrderSequence: (startFrom) => {
      if (guardForbiddenSpecial("system.remakeOrderSequence")) return;
      const ordered = [...s.orders].sort((a, b) => a.orderNo - b.orderNo);
      const renumbered = new Map(ordered.map((o, i) => [o.id, startFrom + i]));
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) => ({ ...o, orderNo: renumbered.get(o.id) ?? o.orderNo })),
      }));
      log(
        "Order Sequence Renumbered",
        "All orders",
        `#${ordered[0]?.orderNo ?? "—"}–#${ordered[ordered.length - 1]?.orderNo ?? "—"}`,
        `#${startFrom}–#${startFrom + ordered.length - 1}`,
      );
      toast.success(`${ordered.length} order(s) renumbered`, {
        description: `Now #${startFrom} through #${startFrom + ordered.length - 1}`,
      });
    },

    generateKot: (orderId) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      const round = o.kotRounds + 1;
      const pending = o.lines.filter((l) => l.kotRound === round);
      if (!pending.length) {
        toast.info("Nothing new to send", { description: "Add items before generating a KOT." });
        return;
      }

      const billSettings: BillSettings = {
        serviceCharge: s.serviceCharge,
        deliveryChargeRule: s.deliveryChargeRule,
        packagingChargeRule: s.packagingChargeRule,
        taxRules: s.taxRules,
        invoiceFormat: s.invoiceFormat,
      };
      const totals = orderTotals(o, billSettings);
      const menuItemsPayload = pending.map((l) => {
        const mi = s.menuItems.find((m) => m.id === l.itemId);
        return {
          id: Number(l.itemId),
          qty: l.qty,
          price: l.price,
          discount: 0,
          addons: l.addons ?? [],
          comment: l.note ?? "",
          menu_categ_id: mi ? Number(mi.categoryId) : 0,
        };
      });
      const table = o.tableId ? s.tables.find((t) => t.id === o.tableId) : undefined;

      const run = async () => {
        try {
          const res = await orderApi.kotOrder({
            order_type: o.type === "Dine In" ? "dinin" : "pickup",
            ...(o.backendId ? { order_id: o.backendId } : {}),
            ...(o.type === "Dine In" && table
              ? { table_id: Number(table.id), tableNumber: table.name }
              : {}),
            cart: {
              gst: totals.tax,
              totalDiscount: totals.discount,
              grandAmount: totals.grand,
              myAmount: totals.subtotal,
              service_charger: totals.service,
              discount_reason: o.discount?.label ?? "",
              discount_type: "fix",
              discount_value: totals.discount,
              taxes: [],
              items: [{ status: "H", menuItems: menuItemsPayload }],
            },
          });
          const backendId = res.kotInfo.order_id;

          const byStation = new Map<string, OrderLine[]>();
          const fallbackKitchenName =
            (s.kitchens.find((k) => k.isDefault) ?? s.kitchens[0])?.name ?? "Kitchen";
          pending.forEach((l) => {
            const mi = s.menuItems.find((m) => m.id === l.itemId);
            const st = mi
              ? (resolveKitchen(s.kitchens, mi.categoryId)?.name ?? fallbackKitchenName)
              : fallbackKitchenName;
            byStation.set(st, [...(byStation.get(st) ?? []), l]);
          });
          const newKots: Kot[] = [...byStation.entries()].map(([station, lines], i) => ({
            id: uid("k"),
            kotNo: Math.max(...s.kots.map((k) => k.kotNo), 300) + 1 + i,
            orderId,
            tableLabel: o.tableLabel,
            round,
            station,
            status: "Pending",
            createdAt: nowStamp(),
            backendOrderId: backendId,
            kotNumber: round,
            items: lines.map((l) => ({
              name: `${l.name}${l.variant ? ` (${l.variant})` : ""}`,
              qty: l.qty,
              ...(l.note ? { note: l.note } : {}),
            })),
          }));
          patch((p) => ({
            ...p,
            kots: [...newKots, ...p.kots],
            orders: p.orders.map((x) =>
              x.id === orderId ? { ...x, kotRounds: round, status: "Running", backendId } : x,
            ),
            tables: p.tables.map((t) => (t.id === o.tableId ? { ...t, status: "Running" } : t)),
            syncItems: [
              {
                id: uid("sy"),
                entity: "KOT",
                reference: `Round ${round} · ${o.tableLabel}`,
                action: "Create",
                status: p.connection === "online" ? "Synced" : "Pending",
                queuedAt: nowStamp(),
                device: "Counter POS",
              },
              ...p.syncItems,
            ],
            notifications: [
              {
                id: uid("n"),
                title: "KOT sent to kitchen",
                body: `Round ${round} · ${o.tableLabel} · ${pending.length} item(s).`,
                at: nowStamp(),
                read: false,
                kind: "order",
              },
              ...p.notifications,
            ],
          }));
          log(
            "KOT Sent",
            `Order #${o.orderNo}`,
            `Round ${round - 1}`,
            `Round ${round} · ${pending.length} item(s)`,
          );
          toast.success(`KOT round ${round} sent`, {
            description: `${newKots.length} station ticket(s) printed.`,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not send KOT");
        }
      };
      void run();
    },

    applyDiscount: (orderId, label, amount) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      const rule = s.approvalRules.find((r) => r.domain === "Discount" && r.enabled);
      const subtotal = orderTotals(o, s).subtotal;
      const overThreshold = !!rule && (amount > 500 || (subtotal > 0 && amount / subtotal > 0.1));
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId
            ? { ...x, discount: { label, amount, approvalFlagged: overThreshold } }
            : x,
        ),
      }));
      log("Discount Applied", `Order #${o.orderNo}`, "₹0", `₹${amount} (${label})`);
      if (overThreshold) {
        toast.warning("Discount flagged for approval", {
          description: `Above the Approval Matrix threshold (${rule?.threshold}). Sent to ${rule?.approver}.`,
        });
      } else {
        toast.success(`Discount applied · ₹${amount}`);
      }
    },

    setCustomer: (orderId, name, phone) => {
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId ? { ...o, customerName: name, customerPhone: phone } : o,
        ),
        customers: p.customers.some((c) => c.phone === phone)
          ? p.customers
          : [{ id: uid("c"), name, phone, orders: 1, lastVisit: todayLabel }, ...p.customers],
      }));
      log("Customer Attached", `Order #${o?.orderNo}`, "—", `${name} · ${phone}`);
      toast.success("Customer details saved");
    },

    setCharges: (orderId, delivery, packaging) => {
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId ? { ...o, deliveryCharge: delivery, packagingCharge: packaging } : o,
        ),
      }));
      log(
        "Charges Updated",
        `Order #${o?.orderNo}`,
        "—",
        `Delivery ₹${delivery} · Packaging ₹${packaging}`,
      );
      toast.success("Charges updated");
    },

    generateBill: (orderId) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;

      if (!o.backendId) {
        toast.error("Generate a KOT before billing", {
          description: "The backend has no order to bill until the first KOT is sent.",
        });
        return;
      }

      if (o.type !== "Dine In") {
        // Pickup has no backend-visible "bill generated" state -
        // AdminOrder's pickup branch requires payment info up front and
        // finalizes + settles in one call (confirmed live, see
        // settleOrder and adminOrder's comment in lib/api.ts), so this
        // step stays purely local until the real settle call.
        patch((p) => ({
          ...p,
          orders: p.orders.map((x) => (x.id === orderId ? { ...x, status: "Bill Generated" } : x)),
        }));
        log("Bill Generated", `Order #${o.orderNo}`, o.status, "Bill Generated");
        toast.success(`Bill generated for #${o.orderNo}`);
        return;
      }

      const table = o.tableId ? s.tables.find((t) => t.id === o.tableId) : undefined;
      if (!table) {
        toast.error("Could not find this order's table");
        return;
      }

      const billSettings: BillSettings = {
        serviceCharge: s.serviceCharge,
        deliveryChargeRule: s.deliveryChargeRule,
        packagingChargeRule: s.packagingChargeRule,
        taxRules: s.taxRules,
        invoiceFormat: s.invoiceFormat,
      };
      const totals = orderTotals(o, billSettings);
      // Unlike generateKot, this must carry EVERY line the order has ever
      // had (all KOT rounds), not just newly-added ones - see adminOrder's
      // own comment in lib/api.ts for why.
      const allMenuItems = o.lines.map((l) => {
        const mi = s.menuItems.find((m) => m.id === l.itemId);
        return {
          id: Number(l.itemId),
          qty: l.qty,
          price: l.price,
          discount: 0,
          addons: l.addons ?? [],
          comment: l.note ?? "",
          menu_categ_id: mi ? Number(mi.categoryId) : 0,
        };
      });

      const run = async () => {
        try {
          await orderApi.adminOrder({
            order_type: "dinin",
            order_id: o.backendId!,
            table_id: Number(table.id),
            cart: {
              items: [{ status: "H", menuItems: allMenuItems }],
              gst: totals.tax,
              totalDiscount: totals.discount,
              grandAmount: totals.grand,
              myAmount: totals.subtotal,
              service_charger: totals.service,
              discount_reason: o.discount?.label ?? "",
              discount_type: "fix",
              discount_value: totals.discount,
              taxes: [],
            },
          });
          patch((p) => ({
            ...p,
            orders: p.orders.map((x) =>
              x.id === orderId ? { ...x, status: "Bill Generated" } : x,
            ),
            tables: p.tables.map((t) =>
              t.id === o.tableId ? { ...t, status: "Bill Generated" } : t,
            ),
          }));
          log("Bill Generated", `Order #${o.orderNo}`, o.status, "Bill Generated");
          toast.success(`Bill generated for #${o.orderNo}`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not generate bill");
        }
      };
      void run();
    },

    settleOrder: (orderId, payments) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      const duePortion = payments
        .filter((p) => p.mode === "Due")
        .reduce((sum, p) => sum + p.amount, 0);
      if (duePortion > 0 && !o.customerPhone) {
        toast.error("Attach a customer before settling part of the bill as Due", {
          description: "A Due bill needs a name and mobile number to track against.",
        });
        return;
      }
      if (!o.backendId) {
        toast.error("This order has no backend record to settle");
        return;
      }
      // Backend only has cash/upi/card/due - any other configured payment
      // mode (custom modes are supported by this app's PaymentModeConfig,
      // the backend has no equivalent) can't be sent and would silently
      // vanish from the real total if allowed through.
      const known = new Set(["Cash", "UPI", "Card", "Due"]);
      const unknownMode = payments.find((p) => !known.has(p.mode));
      if (unknownMode) {
        toast.error(`"${unknownMode.mode}" isn't a payment mode the backend supports yet`, {
          description: "Only Cash, UPI, Card, and Due can be settled against the real order.",
        });
        return;
      }
      const sumFor = (mode: string) =>
        payments.filter((p) => p.mode === mode).reduce((sum, p) => sum + p.amount, 0);
      const cashAmt = sumFor("Cash");
      const upiAmt = sumFor("UPI");
      const cardAmt = sumFor("Card");
      const dueAmt = sumFor("Due");
      const settleTotal = payments.reduce((sum, p) => sum + p.amount, 0);

      const mode = payments.length > 1 ? "Split" : payments[0].mode;
      const cashPortion = payments
        .filter((p) => p.mode === "Cash")
        .reduce((sum, p) => sum + p.amount, 0);
      const total = payments.reduce((sum, p) => sum + p.amount, 0);

      const run = async () => {
        try {
          if (o.type === "Dine In") {
            await orderApi.settleBills({
              id: o.backendId!,
              amount: settleTotal,
              cash: cashAmt,
              upi: upiAmt,
              card: cardAmt,
              due: dueAmt,
              ...(dueAmt > 0 && o.customerPhone ? { mobile: o.customerPhone } : {}),
            });
          } else {
            // Pickup has no settleBills equivalent - AdminOrder's pickup
            // branch both finalizes the bill and records payment in one
            // call, and (like generateBill for dine-in) must carry the
            // FULL accumulated item list since it destroys and rebuilds
            // OrderDetails from scratch every call - see adminOrder's
            // comment in lib/api.ts.
            const billSettings: BillSettings = {
              serviceCharge: s.serviceCharge,
              deliveryChargeRule: s.deliveryChargeRule,
              packagingChargeRule: s.packagingChargeRule,
              taxRules: s.taxRules,
              invoiceFormat: s.invoiceFormat,
            };
            const totals = orderTotals(o, billSettings);
            const allMenuItems = o.lines.map((l) => {
              const mi = s.menuItems.find((m) => m.id === l.itemId);
              return {
                id: Number(l.itemId),
                qty: l.qty,
                price: l.price,
                discount: 0,
                addons: l.addons ?? [],
                comment: l.note ?? "",
                menu_categ_id: mi ? Number(mi.categoryId) : 0,
              };
            });
            await orderApi.adminOrder({
              order_type: "pickup",
              order_id: o.backendId!,
              cash: cashAmt,
              upi: upiAmt,
              card: cardAmt,
              due: dueAmt,
              ...(dueAmt > 0 && o.customerPhone ? { mobile: o.customerPhone } : {}),
              cart: {
                items: [{ status: "H", menuItems: allMenuItems }],
                gst: totals.tax,
                totalDiscount: totals.discount,
                grandAmount: totals.grand,
                myAmount: totals.subtotal,
                service_charger: totals.service,
                discount_reason: o.discount?.label ?? "",
                discount_type: "fix",
                discount_value: totals.discount,
                taxes: [],
              },
            });
          }
          applySettlement();
          log("Bill Settled", `Order #${o.orderNo}`, o.status, `Settled · ${mode} ₹${total}`);
          toast.success(`Order #${o.orderNo} settled`, {
            description: payments.map((p) => `${p.mode} ₹${p.amount}`).join(" + "),
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not settle order");
        }
      };

      const applySettlement = () =>
        patch((p) => ({
          ...p,
          orders: p.orders.map((x) =>
            x.id === orderId
              ? {
                  ...x,
                  status: "Settled",
                  payments: [...(x.payments ?? []), ...payments],
                  paymentMode: mode,
                  settledAt: nowStamp(),
                  fallbackTotal: (x.fallbackTotal ?? 0) + total,
                }
              : x,
          ),
          dueBills:
            duePortion > 0
              ? [
                  {
                    id: uid("due"),
                    billNo: `#${o.orderNo}`,
                    customerName: o.customerName ?? "Guest",
                    mobile: o.customerPhone ?? "",
                    date: todayLabel,
                    daysAgo: 0,
                    amount: duePortion,
                    status: "Due" as const,
                    // Tagged immediately so this bill is settleable from
                    // the Due Bills screen right away, without waiting for
                    // the next loadDueBillsFromServer to pick it up.
                    backendOrderId: o.backendId,
                  },
                  ...p.dueBills,
                ]
              : p.dueBills,
          tables: p.tables.map((t) =>
            t.id === o.tableId
              ? {
                  ...t,
                  status: "Free",
                  guests: undefined,
                  orderId: undefined,
                  occupiedSince: undefined,
                }
              : t,
          ),
          cashSessions: p.cashSessions.map((cs) =>
            cs.status === "Open" && cashPortion !== 0
              ? {
                  ...cs,
                  movements: [
                    ...cs.movements,
                    {
                      id: uid("cm"),
                      type: "Settlement" as const,
                      amount: cashPortion,
                      reason:
                        cashPortion < 0
                          ? `Cash refund · Order #${o.orderNo}`
                          : `Cash settlement · Order #${o.orderNo}`,
                      at: nowStamp(),
                      by: currentUser?.name ?? "Taj",
                    },
                  ],
                }
              : cs,
          ),
          syncItems: [
            {
              id: uid("sy"),
              entity: "Bill",
              reference: `#${o.orderNo}`,
              action: "Settle",
              status: p.connection === "online" ? "Synced" : "Pending",
              queuedAt: nowStamp(),
              device: "Counter POS",
            },
            ...p.syncItems,
          ],
        }));
      void run();
    },

    reopenOrder: (orderId) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || o.status !== "Settled") return;
      if (o.tableId) {
        const table = s.tables.find((t) => t.id === o.tableId);
        if (table && table.status !== "Free") {
          toast.error("Can't reopen — table is now in use", {
            description: `${o.tableLabel} has another active order.`,
          });
          return;
        }
      }
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId ? { ...x, status: "Running", settledAt: undefined } : x,
        ),
        tables: o.tableId
          ? p.tables.map((t) =>
              t.id === o.tableId ? { ...t, status: "Running", guests: o.guests, orderId: o.id } : t,
            )
          : p.tables,
      }));
      log("Bill Reopened", `Order #${o.orderNo}`, "Settled", "Running");
      toast.success(`Order #${o.orderNo} reopened for editing`);
    },

    mergeTables: (sourceTableId, destTableId) => {
      if (guardBlocked()) return;
      const sourceLabel = tableLabel(sourceTableId);
      const destLabel = tableLabel(destTableId);
      const src = s.tables.find((t) => t.id === sourceTableId);
      const dst = s.tables.find((t) => t.id === destTableId);
      const srcOrder = s.orders.find(
        (o) =>
          o.tableId === sourceTableId && ["Held", "Running", "Bill Generated"].includes(o.status),
      );
      const dstOrder = s.orders.find(
        (o) =>
          o.tableId === destTableId && ["Held", "Running", "Bill Generated"].includes(o.status),
      );
      if (!srcOrder) {
        toast.error("Source table has no active order");
        return;
      }
      if (dst?.status === "Reserved") {
        toast.error("Destination table is Reserved", {
          description: "Pick a different destination table.",
        });
        return;
      }
      const guests = (src?.guests ?? srcOrder.guests) + (dst?.guests ?? dstOrder?.guests ?? 0);
      const movedLines = srcOrder.lines.map((l) => ({
        ...l,
        originTable: l.originTable ?? sourceLabel,
        id: uid("l"),
      }));

      patch((p) => {
        let orders = p.orders;
        let targetOrderId = dstOrder?.id;
        if (dstOrder) {
          orders = orders.map((o) =>
            o.id === dstOrder.id
              ? {
                  ...o,
                  guests,
                  lines: [
                    ...o.lines.map((l) => ({ ...l, originTable: l.originTable ?? destLabel })),
                    ...movedLines,
                  ],
                  kotRounds: Math.max(o.kotRounds, srcOrder.kotRounds),
                  mergedFrom: [...(o.mergedFrom ?? []), sourceLabel],
                  status: "Running" as const,
                }
              : o,
          );
        } else {
          targetOrderId = srcOrder.id;
          orders = orders.map((o) =>
            o.id === srcOrder.id
              ? {
                  ...o,
                  tableId: destTableId,
                  tableLabel: destLabel,
                  guests,
                  lines: movedLines,
                  mergedFrom: [...(o.mergedFrom ?? []), sourceLabel],
                  status: "Running" as const,
                }
              : o,
          );
        }
        if (dstOrder) {
          orders = orders.filter((o) => o.id !== srcOrder.id);
        }
        return {
          ...p,
          orders,
          kots: p.kots.map((k) =>
            k.orderId === srcOrder.id && targetOrderId
              ? { ...k, orderId: targetOrderId, tableLabel: `${destLabel} (from ${sourceLabel})` }
              : k,
          ),
          tables: p.tables.map((t) => {
            if (t.id === sourceTableId)
              return {
                ...t,
                status: "Free" as const,
                guests: undefined,
                orderId: undefined,
                occupiedSince: undefined,
              };
            if (t.id === destTableId)
              return {
                ...t,
                status: "Running" as const,
                guests,
                orderId: targetOrderId,
                occupiedSince: t.occupiedSince ?? nowStamp(),
              };
            return t;
          }),
        };
      });
      log("Table Merged", `${sourceLabel} → ${destLabel}`, "2 orders", "1 combined order");
      toast.success(`Merged ${sourceLabel} into ${destLabel}`, {
        description: `Items grouped by origin · ${guests} guests · one combined bill. Merge cannot be undone.`,
      });
    },

    transferTable: (orderId, destTableId) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      const dst = s.tables.find((t) => t.id === destTableId);
      if (!o || !dst) return;
      if (dst.status === "Reserved") {
        toast.error("Transfer blocked", { description: "The destination table is Reserved." });
        return;
      }
      const destOccupied = ["Running", "Bill Generated", "Held"].includes(dst.status);
      if (destOccupied && o.tableId) {
        value.mergeTables(o.tableId, destTableId);
        return;
      }
      const sourceTableId = o.tableId;
      const destLabel = tableLabel(destTableId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId ? { ...x, tableId: destTableId, tableLabel: destLabel } : x,
        ),
        kots: p.kots.map((k) => (k.orderId === orderId ? { ...k, tableLabel: destLabel } : k)),
        tables: p.tables.map((t) => {
          if (t.id === sourceTableId)
            return {
              ...t,
              status: "Free" as const,
              guests: undefined,
              orderId: undefined,
              occupiedSince: undefined,
            };
          if (t.id === destTableId)
            return {
              ...t,
              status:
                o.status === "Bill Generated" ? ("Bill Generated" as const) : ("Running" as const),
              guests: o.guests,
              orderId: o.id,
              occupiedSince: nowStamp(),
            };
          return t;
        }),
      }));
      log("Table Transferred", `${o.tableLabel} → ${destLabel}`, o.tableLabel, destLabel);
      toast.success(`Order moved to ${destLabel}`, {
        description: "Transfers cannot be reversed.",
      });
    },

    setKotStatus: (kotId, status) => {
      patch((p) => ({
        ...p,
        kots: p.kots.map((k) => (k.id === kotId ? { ...k, status } : k)),
      }));
      toast.success(`KOT marked ${status}`);
    },

    // Live push from another device/tab's KDS socket connection (see
    // lib/kdsSocket.ts) - a KOT round this tab didn't create itself, or
    // one it did (in which case it's already present, tagged with the
    // same backendOrderId+kotNumber by generateKot, and this is a no-op).
    receiveKdsTicket: (payload) => {
      patch((p) => {
        const already = p.kots.some(
          (k) => k.backendOrderId === payload.id && k.kotNumber === payload.kotNumber,
        );
        if (already) return p;

        const fallbackKitchenName =
          (p.kitchens.find((k) => k.isDefault) ?? p.kitchens[0])?.name ?? "Kitchen";
        const byStation = new Map<string, KdsTicketPayload["items"]>();
        payload.items.forEach((item) => {
          const station =
            resolveKitchen(p.kitchens, String(item.menu_categ_id))?.name ?? fallbackKitchenName;
          byStation.set(station, [...(byStation.get(station) ?? []), item]);
        });

        const table =
          payload.type === "dinin"
            ? p.tables.find((t) => t.id === String(payload.tableId))
            : undefined;
        const category = table
          ? p.tableCategories.find((c) => c.id === table.categoryId)
          : undefined;
        const tableLabel = table ? `${category?.name ?? ""} · ${table.name}` : "Take Away";
        const order = p.orders.find((o) => o.backendId === payload.id);

        const newKots: Kot[] = [...byStation.entries()].map(([station, items], i) => ({
          id: uid("k"),
          kotNo: Math.max(...p.kots.map((k) => k.kotNo), 300) + 1 + i,
          orderId: order?.id ?? `remote-${payload.id}`,
          tableLabel,
          round: payload.kotNumber,
          station,
          status: "Pending",
          createdAt: nowStamp(),
          backendOrderId: payload.id,
          kotNumber: payload.kotNumber,
          items: items.map((item) => ({
            name: item.name,
            qty: item.qty,
            ...(item.comment ? { note: item.comment } : {}),
          })),
        }));
        return { ...p, kots: [...newKots, ...p.kots] };
      });
    },

    // "orderComplete" fires on settlement (see kds.js's
    // orderCompletedSendtoKdsCLient) - this tab's own settleOrder already
    // handles its own order locally, so this only ever does real work for
    // an order settled from another device.
    receiveKdsOrderComplete: (backendOrderId) => {
      patch((p) => ({
        ...p,
        kots: p.kots.map((k) =>
          k.backendOrderId === backendOrderId && k.status !== "Served" && k.status !== "Cancelled"
            ? { ...k, status: "Served" as const }
            : k,
        ),
      }));
    },

    addReservation: (r) => {
      const id = uid("r");
      patch((p) => ({
        ...p,
        reservations: [{ ...r, id }, ...p.reservations],
        tables: p.tables.map((t) =>
          t.id === r.tableId && t.status === "Free"
            ? { ...t, status: "Reserved", reservationId: id }
            : t,
        ),
        customers: p.customers.some((c) => c.phone === r.mobile)
          ? p.customers
          : [
              { id: uid("c"), name: r.customerName, phone: r.mobile, orders: 0, lastVisit: r.date },
              ...p.customers,
            ],
      }));
      toast.success("Reservation created", {
        description: `${r.customerName} · ${r.party} guests · ${r.tableLabel} · ${r.time}`,
      });
    },

    setReservationStatus: (id, status) => {
      const r = s.reservations.find((x) => x.id === id);
      patch((p) => ({
        ...p,
        reservations: p.reservations.map((x) => (x.id === id ? { ...x, status } : x)),
        tables: p.tables.map((t) => {
          if (t.id !== r?.tableId) return t;
          if (status === "Seated")
            return { ...t, status: "Running", guests: r?.party, reservationId: undefined };
          if (["Cancelled", "No Show", "Completed"].includes(status))
            return { ...t, status: "Free", reservationId: undefined };
          if (status === "Confirmed") return { ...t, status: "Reserved", reservationId: id };
          return t;
        }),
      }));
      toast.success(`Reservation ${status.toLowerCase()}`, { description: r?.customerName });
    },

    setReleaseMode: (id, mode) =>
      patch((p) => ({
        ...p,
        reservations: p.reservations.map((r) =>
          r.id === id ? { ...r, releaseMode: mode, graceSeconds: mode === "Auto" ? 60 : 900 } : r,
        ),
      })),

    openSession: (float) => {
      const session: CashSession = {
        id: uid("cs"),
        openedAt: nowStamp(),
        openedBy: currentUser?.name ?? "Taj",
        openingFloat: float,
        status: "Open",
        movements: [
          {
            id: uid("cm"),
            type: "Opening",
            amount: float,
            reason: "Opening float",
            at: nowStamp(),
            by: currentUser?.name ?? "Taj",
          },
        ],
      };
      patch((p) => ({ ...p, cashSessions: [session, ...p.cashSessions] }));
      toast.success("Cash session opened", { description: `Opening float ₹${float}` });
    },

    addCash: (amount, reason) => {
      patch((p) => ({
        ...p,
        cashSessions: p.cashSessions.map((cs) =>
          cs.status === "Open"
            ? {
                ...cs,
                movements: [
                  ...cs.movements,
                  {
                    id: uid("cm"),
                    type: "Add" as const,
                    amount,
                    reason,
                    at: nowStamp(),
                    by: currentUser?.name ?? "Taj",
                  },
                ],
              }
            : cs,
        ),
      }));
      toast.success(`₹${amount} added to drawer`, { description: reason });
    },

    withdrawCash: (amount, reason) => {
      const open = s.cashSessions.find((c) => c.status === "Open");
      const balance = open ? open.movements.reduce((sum, m) => sum + m.amount, 0) : 0;
      if (amount > balance) {
        toast.error("Withdrawal blocked", {
          description: `Amount exceeds the drawer balance of ₹${balance}. No override is available.`,
        });
        return false;
      }
      patch((p) => ({
        ...p,
        cashSessions: p.cashSessions.map((cs) =>
          cs.status === "Open"
            ? {
                ...cs,
                movements: [
                  ...cs.movements,
                  {
                    id: uid("cm"),
                    type: "Withdraw" as const,
                    amount: -amount,
                    reason,
                    at: nowStamp(),
                    by: currentUser?.name ?? "Taj",
                  },
                ],
              }
            : cs,
        ),
      }));
      log("Cash Withdrawn", "Cash Session", `₹${balance}`, `₹${balance - amount}`, reason);
      toast.success(`₹${amount} withdrawn`, { description: reason });
      return true;
    },

    attachExpense: (headId, amount, note) => {
      const head = s.expenseHeads.find((h) => h.id === headId);
      patch((p) => ({
        ...p,
        expenses: [
          {
            id: uid("e"),
            headId,
            amount,
            date: todayLabel,
            mode: "Cash",
            note,
            createdBy: currentUser?.name ?? "Taj",
          },
          ...p.expenses,
        ],
        cashSessions: p.cashSessions.map((cs) =>
          cs.status === "Open"
            ? {
                ...cs,
                movements: [
                  ...cs.movements,
                  {
                    id: uid("cm"),
                    type: "Expense" as const,
                    amount: -amount,
                    reason: `${head?.name ?? "Expense"} — ${note}`,
                    at: nowStamp(),
                    by: currentUser?.name ?? "Taj",
                  },
                ],
              }
            : cs,
        ),
      }));
      toast.success("Expense attached to session", { description: `${head?.name} · ₹${amount}` });
    },

    closeSession: (counted, reason) => {
      const open = s.cashSessions.find((c) => c.status === "Open");
      if (!open) return;
      const expected = open.movements.reduce((sum, m) => sum + m.amount, 0);
      patch((p) => ({
        ...p,
        cashSessions: p.cashSessions.map((cs) =>
          cs.id === open.id
            ? {
                ...cs,
                status: "Closed",
                closedAt: nowStamp(),
                countedCash: counted,
                variance: counted - expected,
                ...(reason ? { varianceReason: reason } : {}),
              }
            : cs,
        ),
      }));
      log("Cash Session Closed", open.id, `Expected ₹${expected}`, `Counted ₹${counted}`, reason);
      toast.success("Cash session closed", {
        description:
          counted === expected
            ? "No variance recorded."
            : `Variance ₹${counted - expected} recorded with explanation.`,
      });
    },

    sessionBalance: () => {
      const open = s.cashSessions.find((c) => c.status === "Open");
      return open ? open.movements.reduce((sum, m) => sum + m.amount, 0) : 0;
    },
    openSessionRecord: () => s.cashSessions.find((c) => c.status === "Open"),

    loadMenuFromServer: async () => {
      const menuId = s.menus.find((m) => m.isDefault)?.id ?? s.menus[0]?.id ?? "menu-default";
      try {
        const [{ catagories }, { menu }, { variants }, { addons }] = await Promise.all([
          menuApi.getCategories(),
          menuApi.getItems(),
          menuApi.getVariants(),
          menuApi.getAddonGroups(),
        ]);
        patch((p) => ({
          ...p,
          menuCategories: catagories.map((c) => mapRawMenuCategory(c, menuId)),
          menuItems: menu.map((m) => mapRawMenuItem(m, menuId)),
          variantMasters: variants.filter((v) => v.active).map((v) => mapRawVariant(v, menuId)),
          addonGroups: addons.map((g) => mapRawAddonGroup(g, menuId)),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load menu from server");
      }
    },
    upsertMenuItem: (item) => {
      const isNew = !s.menuItems.some((m) => m.id === item.id);
      const seed = String(Date.now()).slice(-6);
      const payload = {
        item_name: item.name,
        menu_categ_id: Number(item.categoryId),
        price: item.price,
        shortCode: toShortCode(item.sku, item.name, seed),
        favorite: item.favourite,
        gst_type: "S" as const, // no UI field yet - defaults to the model's own default
        barcode_value: item.barcode ?? "",
        addons: [] as number[], // per-item addon attachment has no UI yet
        ...(item.dietary ? { sub_categories: item.dietary } : {}),
        ...(item.description ? { description: item.description } : {}),
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      };
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createItem(payload);
          } else {
            await menuApi.editItem({ ...payload, id: Number(item.id) });
          }
          await value.loadMenuFromServer();
          toast.success("Menu item saved", { description: item.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save menu item");
        }
      };
      void run();
    },
    removeMenuItem: (id) => {
      value.removeMenuItems([id]);
    },
    setMenuItemsActive: (ids, active) => {
      if (!active) {
        value.removeMenuItems(ids);
        return;
      }
      // /menuRemove soft-deletes (active:false); no reactivate/un-delete
      // endpoint exists on the backend to undo that.
      toast.error("Reactivating items isn't supported by the backend yet");
    },
    removeMenuItems: (ids) => {
      const run = async () => {
        try {
          await menuApi.removeItems(ids.map(Number));
          await value.loadMenuFromServer();
          toast.success(`${ids.length} item(s) removed`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove item(s)");
        }
      };
      void run();
    },
    // Not yet wired to the real backend - would mean looping create-category
    // and create-item calls per row, a bigger separate piece of work than
    // the rest of this pass. Still mock-only.
    bulkImportMenuItems: (rows, menuId) => {
      patch((p) => {
        let categories = p.menuCategories;
        const newItems: MenuItem[] = rows.map((r) => {
          const name = r.categoryName.trim();
          let cat = categories.find(
            (c) => c.menuId === menuId && c.name.toLowerCase() === name.toLowerCase(),
          );
          if (!cat) {
            cat = {
              id: uid("mc"),
              name,
              active: true,
              sortOrder: categories.filter((c) => c.menuId === menuId).length + 1,
              menuId,
            };
            categories = [...categories, cat];
          }
          return {
            id: uid("m"),
            name: r.name.trim(),
            categoryId: cat.id,
            price: r.price,
            favourite: false,
            active: r.active ?? true,
            veg: r.veg ?? true,
            sku: r.sku,
          };
        });
        return { ...p, menuCategories: categories, menuItems: [...newItems, ...p.menuItems] };
      });
      toast.success(`${rows.length} item(s) imported`);
    },
    upsertMenuCategory: (c) => {
      const isNew = !s.menuCategories.some((x) => x.id === c.id);
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createCategory(c.name);
          } else {
            await menuApi.editCategory(Number(c.id), c.name, c.sortOrder);
          }
          await value.loadMenuFromServer();
          toast.success("Category saved", { description: c.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save category");
        }
      };
      void run();
    },
    removeMenuCategory: (id) => {
      if (s.menuItems.some((i) => i.categoryId === id)) {
        toast.error("Category is in use", {
          description: "Move or delete its items first.",
        });
        return;
      }
      const run = async () => {
        try {
          await menuApi.removeCategories([Number(id)]);
          await value.loadMenuFromServer();
          toast.success("Category removed");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove category");
        }
      };
      void run();
    },
    upsertVariant: (v) => {
      const isNew = !s.variantMasters.some((x) => x.id === v.id);
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createVariant(v.name, true);
          } else {
            await menuApi.editVariant(Number(v.id), v.name, true);
          }
          await value.loadMenuFromServer();
          toast.success("Variant saved", { description: v.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save variant");
        }
      };
      void run();
    },
    removeVariant: (id) => {
      // No delete endpoint exists for variants - soft-delete via the edit
      // endpoint's `active` field instead (it's the same convention used
      // for tables/categories/items everywhere else in this backend).
      // loadMenuFromServer only keeps active:true rows, so this disappears
      // from the list the same way a real delete would.
      const v = s.variantMasters.find((x) => x.id === id);
      if (!v) return;
      const run = async () => {
        try {
          await menuApi.editVariant(Number(id), v.name, false);
          await value.loadMenuFromServer();
          toast.success("Variant removed");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove variant");
        }
      };
      void run();
    },
    upsertAddonGroup: (g) => {
      const isNew = !s.addonGroups.some((x) => x.id === g.id);
      const payload = {
        department_name: g.name,
        maximum_allowed_addon: g.max,
        minimum_allowed_addon: g.min,
        singleSelection: g.selection === "Single",
        // No veg/non-veg/egg field in the UI yet - backend requires one per
        // option, so every option defaults to "veg" until that's added.
        addons: g.options.map((o) => ({ addon_name: o.name, price: o.price, attributes: "veg" })),
      };
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createAddonGroup(payload);
          } else {
            await menuApi.editAddonGroup({ ...payload, id: Number(g.id) });
          }
          await value.loadMenuFromServer();
          toast.success("Addon group saved", { description: g.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save addon group");
        }
      };
      void run();
    },
    removeAddonGroup: () => {
      // No delete or soft-delete path exists: there's no remove endpoint,
      // and updatedAddons doesn't accept `active` even though the model
      // has the column - confirmed by reading the controller, not assumed.
      toast.error("Removing addon groups isn't supported by the backend yet");
    },
    loadTablesFromServer: async () => {
      try {
        const [{ tables }, { tableCatagories }] = await Promise.all([
          tableApi.getTables(),
          tableApi.getCategories(),
        ]);
        patch((p) => ({
          ...p,
          tables: tables.map(mapRawTable),
          tableCategories: tableCatagories.map(mapRawCategory),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load tables from server");
      }
    },
    upsertTable: (t) => {
      const isNew = !s.tables.some((x) => x.id === t.id);
      const parsedName = Number(t.name);
      const nameIsNumeric = t.name.trim() !== "" && Number.isFinite(parsedName);

      if (isNew && !nameIsNumeric) {
        toast.error("Backend only supports numeric table numbers for new tables", {
          description: `"${t.name}" is not a number.`,
        });
        return;
      }

      const run = async () => {
        try {
          if (isNew) {
            await tableApi.createTables({
              startNo: parsedName,
              endNo: parsedName,
              table_catag_id: Number(t.categoryId),
              type: "T",
            });
          } else {
            // editTable accepts a free-text name (unlike bulk create, which
            // only ever generates numeric names), so no numeric check here.
            await tableApi.editTable({
              id: Number(t.id),
              table_name: t.name,
              table_catag_id: Number(t.categoryId),
              type: "T",
            });
          }
          await value.loadTablesFromServer();
          toast.success("Table saved", { description: t.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save table");
        }
      };
      void run();
    },
    removeTable: (id) => {
      value.removeTables([id]);
    },
    removeTables: (ids) => {
      const eligible = s.tables.filter((t) => ids.includes(t.id) && t.status === "Free");
      const skipped = ids.length - eligible.length;
      if (eligible.length === 0) {
        if (skipped > 0) {
          toast.error("Table(s) in use", { description: "Only free tables can be removed." });
        }
        return;
      }
      const run = async () => {
        try {
          await tableApi.removeTables(eligible.map((t) => Number(t.id)));
          await value.loadTablesFromServer();
          toast.success(`${eligible.length} table(s) removed`, {
            description: skipped ? `${skipped} occupied table(s) skipped` : undefined,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove table(s)");
        }
      };
      void run();
    },
    addTables: (tables) => {
      const nums = tables.map((t) => Number(t.name));
      if (nums.some((n) => !Number.isFinite(n))) {
        toast.error("Backend only supports numeric table numbers for bulk creation", {
          description: "A name prefix can't be sent to the server - remove it and try again.",
        });
        return;
      }
      const categoryId = tables[0]?.categoryId;
      const startNo = Math.min(...nums);
      const endNo = Math.max(...nums);
      const run = async () => {
        try {
          await tableApi.createTables({
            startNo,
            endNo,
            table_catag_id: Number(categoryId),
            type: "T",
          });
          await value.loadTablesFromServer();
          toast.success(`${tables.length} table(s) added`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not add tables");
        }
      };
      void run();
    },
    upsertTableCategory: (c) => {
      const isNew = !s.tableCategories.some((x) => x.id === c.id);
      const run = async () => {
        try {
          if (isNew) {
            await tableApi.createCategory({ table_catag_nm: c.name, type: "T" });
          } else {
            await tableApi.editCategory({ id: Number(c.id), table_catag_nm: c.name, type: "T" });
          }
          await value.loadTablesFromServer();
          toast.success("Table category saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save table category");
        }
      };
      void run();
    },
    removeTableCategory: (id) => {
      if (s.tables.some((t) => t.categoryId === id)) {
        toast.error("Section is in use", {
          description: "Move or delete its tables first.",
        });
        return;
      }
      const run = async () => {
        try {
          await tableApi.removeCategories([Number(id)]);
          await value.loadTablesFromServer();
          toast.success("Section removed");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove section");
        }
      };
      void run();
    },
    loadUsersFromServer: async () => {
      try {
        const { hotelUsers } = await userApi.getUsers();
        patch((p) => ({ ...p, users: hotelUsers.map(mapRawUser) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load users from server");
      }
    },

    // Only pulls upiId - see hotelApi's own comment for why the rest of
    // this app's InvoiceFormat stays local-only.
    loadInvoiceFormatFromServer: async () => {
      try {
        const { upiId } = await hotelApi.getSettings();
        patch((p) => ({ ...p, invoiceFormat: { ...p.invoiceFormat, upiId: upiId ?? "" } }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load billing settings from server",
        );
      }
    },

    // getDueOrders only ever returns orders with due > 0 - there is no
    // backend endpoint to list settlement history, so "Settled" bills
    // this session already knows about (from a successful settleDueBills
    // call) are kept rather than wiped out by this replacing the "Due"
    // ones. That history doesn't survive a real reload/reopen of the app,
    // same as any other purely-local state would - not a live sync.
    loadDueBillsFromServer: async () => {
      try {
        const { dueOrders } = await dueApi.getDueOrders("2000-01-01", "2100-01-01");
        const fresh = dueOrders.orders.map(mapRawDueOrder);
        patch((p) => ({
          ...p,
          dueBills: [
            ...fresh,
            ...p.dueBills.filter(
              (b) =>
                b.status === "Settled" && !fresh.some((f) => f.backendOrderId === b.backendOrderId),
            ),
          ],
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load due bills from server");
      }
    },
    loadCustomersFromServer: async () => {
      try {
        const { numbers } = await customerApi.getAll();
        const previousActiveById = new Map(s.customers.map((c) => [c.id, c.active]));
        patch((p) => ({
          ...p,
          customers: numbers.map((c) => mapRawCustomer(c, previousActiveById.get(String(c.id)))),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load customers from server");
      }
    },
    loadKitchensFromServer: async () => {
      try {
        const { kitchen } = await kitchenApi.getKitchens();
        const previousDefaultId = s.kitchens.find((k) => k.isDefault)?.id;
        const mapped = kitchen.map((k) => mapRawKitchen(k));
        const withDefault = mapped.some((k) => k.id === previousDefaultId)
          ? mapped.map((k) => ({ ...k, isDefault: k.id === previousDefaultId }))
          : mapped.map((k, i) => ({ ...k, isDefault: i === 0 }));
        patch((p) => ({ ...p, kitchens: withDefault }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load kitchens from server");
      }
    },
    loadPrintersFromServer: async () => {
      try {
        const { printerSettings } = await printerApi.getAll();
        const previousDefaultId = s.printers.find((p) => p.isDefault)?.id;
        const mapped = printerSettings.map((p) => mapRawPrinter(p, s.menuCategories));
        // isDefault (which KOT printer categories fall back to) has no
        // backend column that means anything - setPrinterSetting
        // hardcodes every row to default:true, confirmed live, so it
        // can't be read back from there either. Carried over across
        // reloads by id; falls back to the first KOT-capable printer.
        const fallbackId = mapped.find((p) => p.role !== "Bill")?.id;
        const withDefault = mapped.map((p) => ({
          ...p,
          isDefault: mapped.some((m) => m.id === previousDefaultId)
            ? p.id === previousDefaultId
            : p.id === fallbackId,
        }));
        patch((p) => ({ ...p, printers: withDefault }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load printers from server");
      }
    },
    upsertUser: (u) => {
      const isNew = !s.users.some((x) => x.id === u.id);
      const payload = {
        active: u.status === "Active",
        name: u.name,
        email: u.email,
        role: u.role,
        number: u.mobile,
        password: placeholderPassword(u.pin),
        ...(u.pin ? { pin: u.pin } : {}),
        // Best-effort role-default permissions, not a live sync of the
        // permission editor - see buildAccessNameFromRole's own comment.
        access_name: buildAccessNameFromRole(u.role, s.rolePermissions),
      };
      const run = async () => {
        try {
          if (isNew) {
            await userApi.createUser(payload);
          } else {
            await userApi.editUser({ ...payload, id: Number(u.id) });
          }
          await value.loadUsersFromServer();
          log("User Saved", u.name, "—", `${u.role} · ${u.status}`);
          toast.success("User saved", { description: `${u.name} · ${u.role}` });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save user");
        }
      };
      void run();
    },
    upsertExpense: (e) => {
      patch((p) => ({
        ...p,
        expenses: p.expenses.some((x) => x.id === e.id)
          ? p.expenses.map((x) => (x.id === e.id ? e : x))
          : [{ ...e, id: e.id || uid("e") }, ...p.expenses],
      }));
      toast.success("Expense saved");
    },
    upsertExpenseHead: (h) => {
      patch((p) => ({
        ...p,
        expenseHeads: p.expenseHeads.some((x) => x.id === h.id)
          ? p.expenseHeads.map((x) => (x.id === h.id ? h : x))
          : [...p.expenseHeads, { ...h, id: h.id || uid("eh") }],
      }));
      toast.success("Expense head saved");
    },
    upsertRawMaterial: (m) => {
      patch((p) => ({
        ...p,
        rawMaterials: p.rawMaterials.some((x) => x.id === m.id)
          ? p.rawMaterials.map((x) => (x.id === m.id ? m : x))
          : [...p.rawMaterials, { ...m, id: m.id || uid("rm") }],
      }));
      toast.success("Raw material saved");
    },
    upsertSupplier: (sup) => {
      patch((p) => ({
        ...p,
        suppliers: p.suppliers.some((x) => x.id === sup.id)
          ? p.suppliers.map((x) => (x.id === sup.id ? sup : x))
          : [...p.suppliers, { ...sup, id: sup.id || uid("s") }],
      }));
      toast.success("Supplier saved");
    },
    upsertPurchaseOrder: (po) => {
      patch((p) => ({
        ...p,
        purchaseOrders: p.purchaseOrders.some((x) => x.id === po.id)
          ? p.purchaseOrders.map((x) => (x.id === po.id ? po : x))
          : [{ ...po, id: po.id || uid("po") }, ...p.purchaseOrders],
      }));
      toast.success("Purchase order saved", { description: po.poNo });
    },
    receivePurchaseOrder: (id) => {
      const po = s.purchaseOrders.find((x) => x.id === id);
      if (!po) return;
      patch((p) => ({
        ...p,
        purchaseOrders: p.purchaseOrders.map((x) =>
          x.id === id ? { ...x, status: "Received" } : x,
        ),
        rawMaterials: p.rawMaterials.map((m) => {
          const l = po.lines.find((x) => x.materialId === m.id);
          return l ? { ...m, stock: m.stock + l.qty * m.conversion } : m;
        }),
      }));
      log("Purchase Received", po.poNo, "Ordered", "Received");
      toast.success(`${po.poNo} received`, { description: "Stock levels updated." });
    },
    addWastage: (w) => {
      patch((p) => ({
        ...p,
        wastages: [{ ...w, id: uid("w") }, ...p.wastages],
        rawMaterials: p.rawMaterials.map((m) =>
          m.id === w.materialId ? { ...m, stock: Math.max(0, m.stock - w.qty) } : m,
        ),
      }));
      toast.success("Wastage recorded");
    },
    produceSemiFinished: (id, batches) => {
      const sf = s.semiFinished.find((x) => x.id === id);
      if (!sf) return;
      patch((p) => ({
        ...p,
        semiFinished: p.semiFinished.map((x) =>
          x.id === id ? { ...x, stock: x.stock + x.batchQty * batches } : x,
        ),
        rawMaterials: p.rawMaterials.map((m) => {
          const c = sf.components.find((x) => x.materialId === m.id);
          return c ? { ...m, stock: Math.max(0, m.stock - c.qty * batches) } : m;
        }),
      }));
      toast.success("Production recorded", {
        description: `${batches} × ${sf.batchQty} ${sf.unit} of ${sf.name}`,
      });
    },

    /* ---------------- stock module ---------------- */
    upsertUnit: (u) => {
      patch((p) => ({
        ...p,
        units: p.units.some((x) => x.id === u.id)
          ? p.units.map((x) => (x.id === u.id ? u : x))
          : [...p.units, { ...u, id: u.id || uid("u") }],
      }));
      toast.success("Unit saved");
    },
    poTotals,
    savePurchase: (po, opts) => {
      const receive = opts?.receive ?? po.status === "Received";
      const totals = poTotals(po);
      const who = currentUser?.name ?? "Taj";
      const isNew = !s.purchaseOrders.some((x) => x.id === po.id);
      const id = po.id || uid("po");
      const record: PurchaseOrder = { ...po, id, status: receive ? "Received" : po.status };
      patch((p) => {
        const already = p.purchaseOrders.find((x) => x.id === id);
        const wasReceived = already?.status === "Received";
        const applyStock = receive && !wasReceived;
        const moves: StockMovement[] = [];
        const rawMaterials = p.rawMaterials.map((m) => {
          const l = record.lines.find((x) => x.materialId === m.id);
          if (!l || !applyStock) return m;
          const inQty = l.qty * m.conversion;
          const inCost = l.rate / m.conversion;
          const newStock = m.stock + inQty;
          // weighted average costing
          const rate = newStock > 0 ? (m.stock * m.rate + inQty * inCost) / newStock : inCost;
          moves.push(movement("Purchase", "raw", m.id, inQty, l.qty * l.rate, record.poNo, who));
          return { ...m, stock: newStock, rate: Math.round(rate * 10000) / 10000 };
        });
        const due = Math.max(0, totals.grand - (record.paidAmount ?? 0));
        const prevDue = already
          ? Math.max(0, poTotals(already).grand - (already.paidAmount ?? 0))
          : 0;
        return {
          ...p,
          purchaseOrders: already
            ? p.purchaseOrders.map((x) => (x.id === id ? record : x))
            : [record, ...p.purchaseOrders],
          rawMaterials,
          stockMovements: [...moves, ...p.stockMovements],
          suppliers: p.suppliers.map((sup) =>
            sup.id === record.supplierId
              ? { ...sup, outstanding: Math.max(0, sup.outstanding - prevDue + due) }
              : sup,
          ),
        };
      });
      log(isNew ? "Purchase Created" : "Purchase Updated", record.poNo, "—", record.status);
      toast.success(receive ? `${record.poNo} received` : `${record.poNo} saved`, {
        description: receive
          ? "Stock, supplier outstanding and reports updated."
          : "Draft saved. Stock updates on receipt.",
      });
    },
    payPurchaseOrder: (id, amount) => {
      const po = s.purchaseOrders.find((x) => x.id === id);
      if (!po) return;
      const grand = poTotals(po).grand;
      const paid = Math.min(grand, (po.paidAmount ?? 0) + amount);
      patch((p) => ({
        ...p,
        purchaseOrders: p.purchaseOrders.map((x) =>
          x.id === id
            ? {
                ...x,
                paidAmount: paid,
                paymentStatus: paid >= grand ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
              }
            : x,
        ),
        suppliers: p.suppliers.map((sup) =>
          sup.id === po.supplierId
            ? { ...sup, outstanding: Math.max(0, sup.outstanding - amount) }
            : sup,
        ),
      }));
      toast.success("Payment recorded", { description: `${po.poNo} · ₹${amount}` });
    },
    cancelPurchaseOrder: (id) => {
      const po = s.purchaseOrders.find((x) => x.id === id);
      if (!po) return;
      const due = Math.max(0, poTotals(po).grand - (po.paidAmount ?? 0));
      patch((p) => ({
        ...p,
        purchaseOrders: p.purchaseOrders.map((x) =>
          x.id === id ? { ...x, status: "Cancelled" } : x,
        ),
        suppliers: p.suppliers.map((sup) =>
          sup.id === po.supplierId
            ? { ...sup, outstanding: Math.max(0, sup.outstanding - due) }
            : sup,
        ),
      }));
      toast.success(`${po.poNo} cancelled`);
    },
    saveStockCount: (rows, note) => {
      const who = currentUser?.name ?? "Taj";
      const changed = rows.filter((r) => {
        const m = s.rawMaterials.find((x) => x.id === r.materialId);
        return m && Math.abs(m.stock - r.countedQty) > 0.0001;
      });
      if (!changed.length) {
        toast.info("Nothing to save", {
          description: "No counted quantity differs from system stock.",
        });
        return;
      }
      patch((p) => {
        const adjustments: StockAdjustment[] = [];
        const moves: StockMovement[] = [];
        const rawMaterials = p.rawMaterials.map((m) => {
          const r = changed.find((x) => x.materialId === m.id);
          if (!r) return m;
          const variance = r.countedQty - m.stock;
          adjustments.push({
            id: uid("sa"),
            materialId: m.id,
            systemQty: m.stock,
            countedQty: r.countedQty,
            variance,
            value: Math.round(variance * m.rate * 100) / 100,
            date: todayLabel,
            by: who,
            ...(note ? { note } : {}),
          });
          moves.push(
            movement(
              "Adjustment",
              "raw",
              m.id,
              variance,
              variance * m.rate,
              note ?? "Physical count",
              who,
            ),
          );
          return { ...m, stock: r.countedQty };
        });
        return {
          ...p,
          rawMaterials,
          stockAdjustments: [...adjustments, ...p.stockAdjustments],
          stockMovements: [...moves, ...p.stockMovements],
        };
      });
      log("Stock Reconciled", `${changed.length} materials`, "System stock", "Physical count");
      toast.success(`${changed.length} row${changed.length > 1 ? "s" : ""} reconciled`, {
        description: "Current stock and adjustment history updated.",
      });
    },
    addWastageBatch: (rows) => {
      const who = currentUser?.name ?? "Taj";
      const valid = rows.filter((r) => r.materialId && r.qty > 0);
      if (!valid.length) {
        toast.error("Add at least one wastage row");
        return;
      }
      patch((p) => {
        const moves: StockMovement[] = [];
        const entries: Wastage[] = [];
        const rawMaterials = p.rawMaterials.map((m) => {
          const mine = valid.filter((r) => r.materialId === m.id);
          if (!mine.length) return m;
          let stock = m.stock;
          mine.forEach((r) => {
            stock = Math.max(0, stock - r.qty);
            entries.push({
              id: uid("w"),
              materialId: m.id,
              qty: r.qty,
              reason: r.reason || "Not specified",
              date: todayLabel,
              recordedBy: who,
              cost: Math.round(r.qty * m.rate * 100) / 100,
              ...(r.notes ? { notes: r.notes } : {}),
            });
            moves.push(
              movement("Wastage", "raw", m.id, -r.qty, -r.qty * m.rate, r.reason || "Wastage", who),
            );
          });
          return { ...m, stock };
        });
        return {
          ...p,
          rawMaterials,
          wastages: [...entries, ...p.wastages],
          stockMovements: [...moves, ...p.stockMovements],
        };
      });
      toast.success(`Wastage posted for ${valid.length} item${valid.length > 1 ? "s" : ""}`, {
        description: "Stock reduced and cost captured.",
      });
    },
    upsertSemiFinished: (sf) => {
      patch((p) => ({
        ...p,
        semiFinished: p.semiFinished.some((x) => x.id === sf.id)
          ? p.semiFinished.map((x) => (x.id === sf.id ? sf : x))
          : [...p.semiFinished, { ...sf, id: sf.id || uid("sf") }],
      }));
      toast.success("Semi-finished item saved");
    },
    removeSemiFinished: (id) => {
      patch((p) => ({ ...p, semiFinished: p.semiFinished.filter((x) => x.id !== id) }));
      toast.success("Semi-finished item deleted");
    },
    semiUnitCost,
    recordProduction: (semiId, qty, notes) => {
      const sf = s.semiFinished.find((x) => x.id === semiId);
      if (!sf || qty <= 0) return;
      const who = currentUser?.name ?? "Taj";
      const cost = semiUnitCost(semiId) * qty;
      patch((p) => {
        const moves: StockMovement[] = [];
        const rawMaterials = p.rawMaterials.map((m) => {
          const c = sf.components.find((x) => x.materialId === m.id);
          if (!c) return m;
          const used = c.qty * qty;
          moves.push(movement("Production Out", "raw", m.id, -used, -used * m.rate, sf.name, who));
          return { ...m, stock: Math.max(0, m.stock - used) };
        });
        moves.push(movement("Production In", "semi", sf.id, qty, cost, "Production run", who));
        return {
          ...p,
          rawMaterials,
          semiFinished: p.semiFinished.map((x) =>
            x.id === semiId ? { ...x, stock: Math.round((x.stock + qty) * 1000) / 1000 } : x,
          ),
          productionRuns: [
            {
              id: uid("pr"),
              semiId,
              qty,
              cost: Math.round(cost * 100) / 100,
              at: nowStamp(),
              by: who,
              ...(notes ? { notes } : {}),
            },
            ...p.productionRuns,
          ],
          stockMovements: [...moves, ...p.stockMovements],
        };
      });
      log("Production Recorded", sf.name, "—", `${qty} ${sf.unit}`);
      toast.success("Production recorded", {
        description: `${qty} ${sf.unit} of ${sf.name} · raw materials consumed`,
      });
    },
    upsertRecipe: (r) => {
      patch((p) => ({
        ...p,
        recipes: p.recipes.some((x) => x.id === r.id)
          ? p.recipes.map((x) => (x.id === r.id ? r : x))
          : [...p.recipes, { ...r, id: r.id || uid("rc") }],
      }));
      toast.success("Recipe saved", { description: r.itemName });
    },
    removeRecipe: (id) => {
      patch((p) => ({ ...p, recipes: p.recipes.filter((x) => x.id !== id) }));
      toast.success("Recipe deleted");
    },
    recipeGroupCost: (g) =>
      Math.round(
        g.lines.reduce((sum, l) => {
          if (l.type === "raw") {
            const m = s.rawMaterials.find((x) => x.id === l.refId);
            return sum + (m ? m.rate * l.qty : 0);
          }
          return sum + semiUnitCost(l.refId) * l.qty;
        }, 0) * 100,
      ) / 100,
    createRequisition: (items, remarks) => {
      const valid = items.filter((i) => i.orderedQty > 0);
      if (!valid.length) {
        toast.error("Add at least one material");
        return;
      }
      const no = `REQ-2026-${String(
        Math.max(
          ...s.requisitions
            .map((r) => Number(r.reqNo.split("-").pop()))
            .filter((n) => !Number.isNaN(n)),
          0,
        ) + 1,
      ).padStart(3, "0")}`;
      patch((p) => ({
        ...p,
        requisitions: [
          {
            id: uid("fr"),
            reqNo: no,
            date: todayLabel,
            status: "Pending",
            raisedBy: currentUser?.name ?? "Taj",
            items: valid,
            ...(remarks ? { remarks } : {}),
          },
          ...p.requisitions,
        ],
      }));
      toast.success("Requisition placed", { description: `${no} · awaiting merchant approval` });
    },
    setRequisitionStatus: (id, status) => {
      patch((p) => ({
        ...p,
        requisitions: p.requisitions.map((r) => (r.id === id ? { ...r, status } : r)),
      }));
      toast.success(`Requisition ${status.toLowerCase()}`);
    },
    setRequisitionQty: (id, materialId, qty) =>
      patch((p) => ({
        ...p,
        requisitions: p.requisitions.map((r) =>
          r.id === id
            ? {
                ...r,
                items: r.items.map((i) =>
                  i.materialId === materialId ? { ...i, orderedQty: Math.max(0, qty) } : i,
                ),
              }
            : r,
        ),
      })),
    removeRequisition: (id) => {
      patch((p) => ({ ...p, requisitions: p.requisitions.filter((r) => r.id !== id) }));
      toast.success("Requisition deleted");
    },
    fulfilRequisition: (id) => {
      const req = s.requisitions.find((r) => r.id === id);
      if (!req || req.purchaseOrderId) return;
      const poId = uid("po");
      const poNo = `PO-2026-${String(
        Math.max(
          ...s.purchaseOrders
            .map((x) => Number(x.poNo.split("-").pop()))
            .filter((n) => !Number.isNaN(n)),
          0,
        ) + 1,
      ).padStart(3, "0")}`;
      const who = currentUser?.name ?? "Taj";
      const supplierId = s.suppliers[0]?.id ?? "s1";
      const po: PurchaseOrder = {
        id: poId,
        poNo,
        supplierId,
        date: todayLabel,
        status: "Received",
        paymentStatus: "Unpaid",
        paidAmount: 0,
        requisitionId: req.id,
        lines: req.items.map((i) => ({
          materialId: i.materialId,
          qty: i.approvedQty ?? i.orderedQty,
          rate: i.unitPrice,
          taxPct: 5,
        })),
      };
      const due = poTotals(po).grand;
      patch((p) => {
        const moves: StockMovement[] = [];
        const rawMaterials = p.rawMaterials.map((m) => {
          const l = po.lines.find((x) => x.materialId === m.id);
          if (!l) return m;
          const inQty = l.qty * m.conversion;
          moves.push(movement("Purchase", "raw", m.id, inQty, l.qty * l.rate, poNo, who));
          return { ...m, stock: m.stock + inQty };
        });
        return {
          ...p,
          rawMaterials,
          purchaseOrders: [po, ...p.purchaseOrders],
          stockMovements: [...moves, ...p.stockMovements],
          requisitions: p.requisitions.map((r) =>
            r.id === id ? { ...r, status: "Delivered", purchaseOrderId: poId } : r,
          ),
          suppliers: p.suppliers.map((sup) =>
            sup.id === supplierId ? { ...sup, outstanding: sup.outstanding + due } : sup,
          ),
        };
      });
      toast.success("Requisition fulfilled", { description: `${poNo} created and stock received` });
    },

    setConnection: (state) => {
      patch((p) => ({ ...p, connection: state }));
      if (state === "online") {
        patch((p) => ({ ...p, connection: "syncing" }));
        setTimeout(() => {
          set((p) => ({
            ...p,
            connection: "online",
            syncItems: p.syncItems.map((i) =>
              i.status === "Pending" ? { ...i, status: "Synced" } : i,
            ),
          }));
          toast.success("All changes synced");
        }, 1600);
      }
    },
    syncNow: () => {
      patch((p) => ({ ...p, connection: "syncing" }));
      setTimeout(() => {
        set((p) => ({
          ...p,
          connection: "online",
          syncItems: p.syncItems.map((i) =>
            i.status === "Pending" ? { ...i, status: "Synced" } : i,
          ),
        }));
        toast.success("Sync complete", { description: "Local server is up to date." });
      }, 1600);
    },
    retrySync: (id) => {
      setTimeout(() => {
        set((p) => ({
          ...p,
          syncItems: p.syncItems.map((i) =>
            (id ? i.id === id : i.status === "Failed") && i.status !== "Conflict"
              ? { ...i, status: "Synced" }
              : i,
          ),
        }));
        toast.success(id ? "Record synced" : "All failed records retried");
      }, 900);
    },
    resolveConflict: (id) => {
      patch((p) => ({
        ...p,
        syncItems: p.syncItems.map((i) => (i.id === id ? { ...i, status: "Synced" } : i)),
      }));
      toast.success("Conflict resolved", { description: "Local version kept and pushed." });
    },
    setDeviceStatus: (id, status) => {
      patch((p) => ({ ...p, devices: p.devices.map((d) => (d.id === id ? { ...d, status } : d)) }));
      toast.success(`Device ${status.toLowerCase()}`);
    },
    renameDevice: (id, name) => {
      patch((p) => ({ ...p, devices: p.devices.map((d) => (d.id === id ? { ...d, name } : d)) }));
      toast.success("Device renamed");
    },
    deregisterDevice: (id) => {
      patch((p) => ({ ...p, devices: p.devices.filter((d) => d.id !== id) }));
      toast.success("Device deregistered");
    },
    upsertPrinter: (pr) => {
      const print_type: "K" | "I" = pr.printType === "Invoice" ? "I" : "K";
      const printer_size = PRINTER_SIZE_TO_BACKEND[pr.size ?? "80mm"];
      const menuCategIds = pr.categories
        .map((name) => s.menuCategories.find((c) => c.name === name)?.id)
        .filter((id): id is string => !!id)
        .map(Number);
      const tableIdsNum = (pr.tableIds ?? []).map(Number);
      const orderTypeMap: Record<OpsOrderType, "dinin" | "pickup"> = {
        "Dine-in": "dinin",
        Pickup: "pickup",
      };
      const orderTypesBackend = (pr.orderTypes ?? ["Dine-in", "Pickup"]).map(
        (t) => orderTypeMap[t],
      );

      const run = async () => {
        try {
          let backendId: number;
          if (!pr.id) {
            // setPrinterSetting doesn't return the new row's id and
            // doesn't enforce unique names (see printerApi's own
            // comment), so a just-created row can't be found safely by
            // name - diffing the id set before/after is the only
            // reliable way.
            const before = await printerApi.getAll();
            const beforeIds = new Set(before.printerSettings.map((x) => x.id));
            await printerApi.create({
              printer_name: pr.name,
              printer_size,
              number_of_copies: pr.copies ?? 1,
              print_type,
            });
            const after = await printerApi.getAll();
            const created = after.printerSettings.find((x) => !beforeIds.has(x.id));
            if (!created) {
              toast.error("Printer was created but couldn't be found afterward");
              return;
            }
            backendId = created.id;
          } else {
            backendId = Number(pr.id);
            await printerApi.update({
              id: backendId,
              printer_name: pr.name,
              printer_size,
              number_of_copies: pr.copies ?? 1,
              print_type,
            });
          }
          await printerApi.setCategories({
            id: backendId,
            table_ids: tableIdsNum,
            menu_categ_ids: menuCategIds,
            order_type: orderTypesBackend,
          });
          await value.loadPrintersFromServer();
          log("Printer Saved", pr.name, "—", `${pr.printType ?? "KOT"} · ${printer_size}`);
          toast.success("Printer saved", { description: pr.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save printer");
        }
      };
      void run();
    },
    markNotificationRead: (id) =>
      patch((p) => ({
        ...p,
        notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      })),
    markAllNotificationsRead: () =>
      patch((p) => ({
        ...p,
        notifications: p.notifications.map((n) => ({ ...n, read: true })),
      })),
    toggleNotificationSetting: (trigger, channel) =>
      patch((p) => ({
        ...p,
        notificationSettings: p.notificationSettings.map((n) =>
          n.trigger === trigger ? { ...n, [channel]: !n[channel] } : n,
        ),
      })),
    toggleApprovalRule: (id) =>
      patch((p) => ({
        ...p,
        approvalRules: p.approvalRules.map((r) =>
          r.id === id && !r.locked ? { ...r, enabled: !r.enabled } : r,
        ),
      })),
    updateApprovalThreshold: (id, threshold, approver) => {
      patch((p) => ({
        ...p,
        approvalRules: p.approvalRules.map((r) =>
          r.id === id ? { ...r, threshold, approver } : r,
        ),
      }));
      toast.success("Approval rule updated");
    },
    setDeliveryChargeRule: (rule) => {
      patch((p) => ({ ...p, deliveryChargeRule: rule }));
      toast.success("Delivery charge rule saved");
    },
    setPackagingChargeRule: (rule) => {
      patch((p) => ({ ...p, packagingChargeRule: rule }));
      toast.success("Packaging charge rule saved");
    },
    setServiceCharge: (rule) => {
      patch((p) => ({ ...p, serviceCharge: rule }));
      toast.success("Service charge rule saved");
    },
    upsertTaxRule: (rule) => {
      patch((p) => ({
        ...p,
        taxRules: p.taxRules.some((t) => t.id === rule.id)
          ? p.taxRules.map((t) => (t.id === rule.id ? rule : t))
          : [...p.taxRules, { ...rule, id: rule.id || uid("tax") }],
      }));
      toast.success("Tax rule saved", { description: rule.name });
    },
    removeTaxRule: (id) => {
      patch((p) => ({ ...p, taxRules: p.taxRules.filter((t) => t.id !== id) }));
      toast.success("Tax rule removed", {
        description: "Prototype only — the live delete endpoint needs a backend fix.",
      });
    },
    toggleTaxRule: (id) =>
      patch((p) => ({
        ...p,
        taxRules: p.taxRules.map((t) => (t.id === id ? { ...t, active: !t.active } : t)),
      })),
    setInvoiceFormat: (fmt) => {
      patch((p) => ({ ...p, invoiceFormat: fmt }));
      // Only upiId has anywhere real to go on the backend right now (see
      // hotelApi's comment) - everything else this form manages is saved
      // locally above and nowhere else, same as before this was wired.
      const upiChanged = fmt.upiId !== s.invoiceFormat.upiId;
      if (upiChanged) {
        void hotelApi
          .updateUpiId(fmt.upiId)
          .catch((err) =>
            toast.error(
              err instanceof ApiError ? err.message : "Saved locally, but the UPI ID didn't sync",
            ),
          );
      }
      toast.success("Invoice format saved");
    },
    setGstCalculation: (on) => {
      patch((p) => ({ ...p, invoiceFormat: { ...p.invoiceFormat, gstCalculation: on } }));
      toast[on ? "success" : "warning"](
        on ? "GST calculation enabled" : "GST calculation disabled",
        {
          description: on
            ? "Active tax rules now calculate on bills."
            : "Configured tax rules will not calculate on bills.",
        },
      );
    },
    upsertPromo: (promo) => {
      patch((p) => ({
        ...p,
        promoCodes: p.promoCodes.some((x) => x.id === promo.id)
          ? p.promoCodes.map((x) => (x.id === promo.id ? promo : x))
          : [...p.promoCodes, { ...promo, id: promo.id || uid("pr") }],
      }));
      toast.success("Promo code saved", { description: promo.code });
    },
    togglePromo: (id) =>
      patch((p) => ({
        ...p,
        promoCodes: p.promoCodes.map((x) => (x.id === id ? { ...x, active: !x.active } : x)),
      })),
    upsertKitchen: (kitchen) => {
      const orderTypeMap: Record<OpsOrderType, "dinin" | "pickup"> = {
        "Dine-in": "dinin",
        Pickup: "pickup",
      };
      const run = async () => {
        try {
          let backendId: number;
          if (!kitchen.id) {
            // createKitchen only accepts the name (see kitchenApi's own
            // comment) - it auto-populates every other field and doesn't
            // return the new row's id, so the actual order types/
            // categories/tables the dialog chose still have to be applied
            // in a follow-up setCategoryForKitchen call, and the new id
            // has to be found by looking the fresh list up by name.
            await kitchenApi.createKitchen(kitchen.name);
            const { kitchen: created } = await kitchenApi.getKitchens();
            const match = created.find((k) => k.kitchen_name === kitchen.name);
            if (!match) {
              toast.error("Kitchen was created but couldn't be found afterward");
              return;
            }
            backendId = match.id;
          } else {
            backendId = Number(kitchen.id);
          }
          await kitchenApi.setCategoryForKitchen({
            id: backendId,
            table_ids: kitchen.tableIds.map(Number),
            menu_categ_ids: kitchen.menuCategoryIds.map(Number),
            order_type: kitchen.orderTypes.map((t) => orderTypeMap[t]),
          });
          await value.loadKitchensFromServer();
          log("Kitchen Saved", kitchen.name, "—", kitchen.orderTypes.join(", "));
          toast.success("Kitchen saved", { description: kitchen.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save kitchen");
        }
      };
      void run();
    },
    removeKitchen: (id) => {
      const target = s.kitchens.find((k) => k.id === id);
      if (!target) return;
      if (s.kitchens.length <= 1) {
        toast.error("Can't remove the only kitchen", {
          description: "At least one kitchen must exist as the routing fallback.",
        });
        return;
      }
      if (target.isDefault) {
        toast.error("Can't remove the default kitchen", {
          description: "Make another kitchen the default first.",
        });
        return;
      }
      const run = async () => {
        try {
          await kitchenApi.deleteKitchen(Number(id));
          await value.loadKitchensFromServer();
          toast.success("Kitchen removed", { description: target.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove kitchen");
        }
      };
      void run();
    },
    setDefaultKitchen: (id) => {
      patch((p) => ({
        ...p,
        kitchens: p.kitchens.map((k) => ({ ...k, isDefault: k.id === id })),
      }));
      toast.success("Default kitchen updated");
    },
    resolveKitchenForCategory: (categoryId) => resolveKitchen(s.kitchens, categoryId),
    removePrinter: (id) => {
      const target = s.printers.find((x) => x.id === id);
      if (!target) return;
      if (target.isDefault) {
        const otherKot = s.printers.some((x) => x.id !== id && x.role !== "Bill");
        toast.error("Can't remove the default KOT printer", {
          description: otherKot
            ? "Make another KOT printer the default first."
            : "At least one KOT printer must exist as the routing fallback.",
        });
        return;
      }
      const run = async () => {
        try {
          await printerApi.remove(Number(id));
          await value.loadPrintersFromServer();
          toast.success("Printer removed", { description: target.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove printer");
        }
      };
      void run();
    },
    setDefaultKotPrinter: (id) => {
      patch((p) => ({
        ...p,
        printers: p.printers.map((pr) =>
          pr.role === "Bill" ? pr : { ...pr, isDefault: pr.id === id },
        ),
      }));
      toast.success("Default KOT printer updated");
    },
    resolveKotPrinterForCategory: (categoryId) => {
      const name = s.menuCategories.find((c) => c.id === categoryId)?.name;
      return resolveKotPrinter(s.printers, name);
    },
    upsertPaymentMode: (mode) => {
      patch((p) => ({
        ...p,
        paymentModes: p.paymentModes.some((m) => m.id === mode.id)
          ? p.paymentModes.map((m) => (m.id === mode.id ? mode : m))
          : [...p.paymentModes, { ...mode, id: mode.id || uid("pm") }],
      }));
      toast.success("Payment mode saved", { description: mode.name });
    },
    removePaymentMode: (id) => {
      const target = s.paymentModes.find((m) => m.id === id);
      if (!target) return;
      if (!target.deletable) {
        toast.error(`${target.name} can't be removed`, {
          description: "It's a protected default mode.",
        });
        return;
      }
      patch((p) => ({ ...p, paymentModes: p.paymentModes.filter((m) => m.id !== id) }));
      toast.success("Payment mode removed");
    },
    setPaymentModeActive: (id, active) => {
      patch((p) => ({
        ...p,
        paymentModes: p.paymentModes.map((m) => (m.id === id ? { ...m, active } : m)),
      }));
    },
    upsertMenu: (menu) => {
      patch((p) => {
        const saved = { ...menu, id: menu.id || uid("menu") };
        const menus = p.menus.some((m) => m.id === saved.id)
          ? p.menus.map((m) => (m.id === saved.id ? saved : m))
          : [...p.menus, saved];
        return {
          ...p,
          menus: saved.isDefault
            ? menus.map((m) => (m.id === saved.id ? m : { ...m, isDefault: false }))
            : menus,
        };
      });
      toast.success("Menu saved", { description: menu.name });
    },
    removeMenu: (id) => {
      const target = s.menus.find((m) => m.id === id);
      if (!target) return;
      if (s.menus.length <= 1) {
        toast.error("Can't remove the only menu", {
          description: "At least one menu must exist as the routing fallback.",
        });
        return;
      }
      if (target.isDefault) {
        toast.error("Can't remove the default menu", {
          description: "Make another menu the default first.",
        });
        return;
      }
      patch((p) => {
        const removedCategoryIds = new Set(
          p.menuCategories.filter((c) => c.menuId === id).map((c) => c.id),
        );
        return {
          ...p,
          menus: p.menus.filter((m) => m.id !== id),
          menuCategories: p.menuCategories.filter((c) => c.menuId !== id),
          menuItems: p.menuItems.filter((m) => !removedCategoryIds.has(m.categoryId)),
          addonGroups: p.addonGroups.filter((a) => a.menuId !== id),
          variantMasters: p.variantMasters.filter((v) => v.menuId !== id),
          orders: p.orders.map((o) => (o.menuId === id ? { ...o, menuId: undefined } : o)),
        };
      });
      toast.success("Menu removed");
    },
    setDefaultMenu: (id) => {
      patch((p) => ({
        ...p,
        menus: p.menus.map((m) => ({ ...m, isDefault: m.id === id })),
      }));
      toast.success("Default menu updated");
    },
    setOrderMenu: (orderId, menuId) => {
      const o = s.orders.find((x) => x.id === orderId);
      const fromName = s.menus.find((m) => m.id === o?.menuId)?.name ?? "Default";
      const toName = s.menus.find((m) => m.id === menuId)?.name ?? "Default";
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) => (o.id === orderId ? { ...o, menuId } : o)),
      }));
      log("Menu Switched", `Order #${o?.orderNo}`, fromName, toName);
      toast.success("Menu switched", { description: toName });
    },
    setDisplayMode: (mode) => {
      patch((p) => ({ ...p, displayMode: mode }));
      toast.success(`${mode} layout applied to this terminal`);
    },
    setMenuImages: (on) => {
      patch((p) => ({ ...p, menuImages: on }));
      toast.success(on ? "Item grid shows images" : "Item grid shows a compact list");
    },
    setTableGridView: (view) => {
      patch((p) => ({ ...p, tableGridView: view }));
      toast.success(`Table Grid set to ${view === "Sections" ? "Sections" : "Tabs"} layout`);
    },
    setKeyboardOnly: (on) => {
      patch((p) => ({ ...p, keyboardOnly: on }));
      toast.success(
        on
          ? "Keyboard Billing is now the only billing screen"
          : "Biller (Table Grid) is visible again",
      );
    },
    setDefaultOrderType: (type) => {
      patch((p) => ({ ...p, defaultOrderType: type }));
      toast.success(`New orders default to ${type}`);
    },
    setGuestCount: (orderId, guests) => {
      const safe = Math.max(1, guests);
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) => (x.id === orderId ? { ...x, guests: safe } : x)),
        tables: p.tables.map((t) => (t.id === o?.tableId ? { ...t, guests: safe } : t)),
      }));
      if (o && o.guests !== safe) {
        log("Guests Updated", `Order #${o.orderNo}`, `${o.guests}`, `${safe}`);
      }
    },
    addCustomLine: (orderId, name, price, qty) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || !name.trim() || qty <= 0) return;
      const round = o.kotRounds + 1;
      const newLine: OrderLine = {
        id: uid("custom"),
        itemId: uid("custom-item"),
        name: name.trim(),
        qty,
        price,
        kotRound: round,
      };
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId ? { ...x, lines: [newLine, ...x.lines] } : x,
        ),
      }));
      log("Item Added", `Order #${o.orderNo}`, "—", `${qty}× ${name.trim()} (custom) · ₹${price}`);
      toast.success("Custom item added", { description: `${name.trim()} · ₹${price}` });
    },
    upsertCustomer: (customer) => {
      const isNew = !customer.id;
      const payload = {
        name: customer.name,
        number: customer.phone,
        gstin: customer.gstin ?? "",
        address: customer.address ?? "",
      };
      const run = async () => {
        try {
          if (isNew) {
            await customerApi.create(payload);
          } else {
            await customerApi.update({ ...payload, id: Number(customer.id) });
          }
          await value.loadCustomersFromServer();
          toast.success("Customer saved", { description: customer.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save customer");
        }
      };
      void run();
    },
    toggleCustomer: (id) =>
      patch((p) => ({
        ...p,
        customers: p.customers.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)),
      })),
    settleDueBills: (ids, payments) => {
      if (guardBlocked()) return;
      const known = new Set(["Cash", "UPI", "Card"]);
      const unknownMode = payments.find((p) => !known.has(p.mode));
      if (unknownMode) {
        toast.error(`"${unknownMode.mode}" isn't a payment mode the backend supports here`, {
          description: "Only Cash, UPI, and Card can be recorded against a due bill.",
        });
        return;
      }
      const bills = ids
        .map((id) => s.dueBills.find((b) => b.id === id))
        .filter((b): b is DueBill => !!b && b.status === "Due");
      if (!bills.length) return;
      const missingBackendId = bills.find((b) => !b.backendOrderId);
      if (missingBackendId) {
        toast.error("This due bill has no backend record to settle");
        return;
      }
      // allSettleDue (the only bulk endpoint) always settles each order's
      // FULL due in one mode - there's no way to send a per-mode split
      // across multiple bills in a single call, and no reasonable way to
      // guess how a merchant meant to divide it. A split across modes
      // only works one bill at a time (see the single-bill branch below,
      // which settleDue's own partial-`receive` support handles cleanly).
      if (bills.length > 1 && payments.length > 1) {
        toast.error("Can't split across payment modes when settling multiple bills at once", {
          description: "Settle them one at a time to use more than one payment mode.",
        });
        return;
      }

      const mode = payments.length > 1 ? "Split" : payments[0].mode;
      const cashPortion = payments
        .filter((p) => p.mode === "Cash")
        .reduce((sum, p) => sum + p.amount, 0);
      const modeMap: Record<string, "cash" | "upi" | "card"> = {
        Cash: "cash",
        UPI: "upi",
        Card: "card",
      };

      const run = async () => {
        try {
          if (bills.length === 1) {
            // Sequential partial settleDue calls, one per split entry -
            // confirmed live this correctly decrements the order's due
            // each call and records a separate audit row per mode, i.e. a
            // real split payment, not an approximation.
            for (const payment of payments) {
              await dueApi.settleDue({
                id: bills[0].backendOrderId!,
                mode: modeMap[payment.mode],
                receive: payment.amount,
              });
            }
          } else {
            await dueApi.settleAllDue(
              bills.map((b) => b.backendOrderId!),
              modeMap[payments[0].mode],
            );
          }
          patch((p) => ({
            ...p,
            dueBills: p.dueBills.map((b) =>
              ids.includes(b.id) && b.status === "Due"
                ? { ...b, status: "Settled" as const, settledMode: mode }
                : b,
            ),
            cashSessions: p.cashSessions.map((cs) =>
              cs.status === "Open" && cashPortion > 0
                ? {
                    ...cs,
                    movements: [
                      ...cs.movements,
                      {
                        id: uid("cm"),
                        type: "Settlement" as const,
                        amount: cashPortion,
                        reason: `Due settlement · ${ids.length} bill(s)`,
                        at: nowStamp(),
                        by: currentUser?.name ?? "Taj",
                      },
                    ],
                  }
                : cs,
            ),
          }));
          log(
            "Due Settled",
            bills.map((b) => b.billNo).join(", "),
            "Due",
            `${mode} · ₹${payments.reduce((sum, p) => sum + p.amount, 0)}`,
          );
          toast.success(bills.length > 1 ? `${bills.length} bills settled` : "Bill settled", {
            description: payments.map((p) => `${p.mode} ₹${p.amount}`).join(" + "),
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not settle due bill(s)");
        }
      };
      void run();
    },
    setMaxOfflineDays: (days) => {
      patch((p) => ({ ...p, maxOfflineDays: days }));
      toast.success(`Maximum offline duration set to ${days} day(s)`);
    },
    sendEBill: (orderId) => {
      if (s.eBillCredit <= 0) return false;
      const o = s.orders.find((x) => x.id === orderId);
      patch((p) => ({ ...p, eBillCredit: p.eBillCredit - 1 }));
      log(
        "E-Bill Sent",
        `Order #${o?.orderNo ?? orderId}`,
        `${s.eBillCredit} credits`,
        `${s.eBillCredit - 1} credits`,
      );
      return true;
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
