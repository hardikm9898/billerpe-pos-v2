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
  taxApi,
  stockUnitApi,
  rawMaterialApi,
  supplierApi,
  purchaseOrderApi,
  stockInHandApi,
  wastageApi,
  semiFinishedApi,
  recipeApi,
  expenseHeadApi,
  expenseApi,
  orderHistoryApi,
  promoCodeApi,
  type RawOrderDetail,
  type RawPromoCode,
  type RawUnit,
  type RawRawMaterial,
  type RawSupplier,
  type RawPurchaseOrder,
  type RawStockInHand,
  type RawWastage,
  type RawSFI,
  type RawSFIRecipeLine,
  type RawRecipeDetail,
  type RawExpenseHead,
  type RawExpenseEntry,
  type RawDueOrder,
  type RawCustomer,
  type RawKitchen,
  type RawPrinter,
  type RawTaxType,
  type RawServiceCharge,
  type RawTable,
  type RawTableCategory,
  type RawMenuCategory,
  type RawMenuItem,
  type RawMenuItemVariant,
  type RawMenuItemAddonGroup,
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
  RecipeLine,
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
  PurchaseLine,
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

/** The two billing screens each carry their own permission grant - callers
 * that mutate a cart line pass which one they're on so the right module's
 * delete permission gets checked once a line was already sent to KOT. */
export type BillingModule = Extract<PermissionModule, "biller" | "keyboard-billing">;

export interface AddLineInput {
  itemId: string;
  qty?: number;
  variant?: string;
  addons?: { name: string; price: number; qty: number; groupId?: string; addonId?: string }[];
  note?: string;
}

interface State {
  authed: boolean;
  deviceRegistered: boolean;
  currentUserId: string;
  tables: RestaurantTable[];
  tableCategories: TableCategory[];
  orders: Order[];
  /** Real settled-order history synced from the backend (last ~90 days),
   * separate from `orders` - which doubles as the live working set for
   * order-taking (held/running carts being built) and must never be
   * replaced wholesale by a server reload. Dashboard/Reports read this
   * for historical sales figures instead of `orders`. */
  orderHistory: Order[];
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
  /** hms_serviceCharge_mst's real row id once loaded - addEditServiceCharge's
   * update branch 500s if this is omitted after a row already exists (see
   * hotelApi.updateServiceCharge's own comment), so it has to be tracked
   * separately from the rule itself (which has no id field - it's also
   * reused for delivery/packaging charges, which have no backend row at
   * all). null until the first successful load or save. */
  serviceChargeBackendId: number | null;
  deliveryChargeRule: BillChargeRule;
  packagingChargeRule: BillChargeRule;
  taxRules: TaxRule[];
  invoiceFormat: InvoiceFormat;
  /** RestaurantSetting.qr_code_open_on_settle - auto-shows a scannable UPI
   * QR in the settle dialog when UPI is selected. */
  qrOnSettle: boolean;
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
  // Unlike tables/menu/etc., loadTablesFromServer never fully replaces
  // `orders` (it only appends real live orders it reconstructs, to avoid
  // ever clobbering an in-progress local edit) - so seed demo orders here
  // would otherwise sit forever, mixed in with real data. Starting empty
  // means every order in this list, once loaded, is real.
  orders: [],
  orderHistory: [],
  // Same seed-pollution issue as `orders` above: KDS was only ever wired
  // for real-time ticket receipt (a new KOT fired this session, or a
  // ticket pushed over the socket) - both paths only ever prepend onto
  // `kots`, never replace it, so seed demo tickets would sit here
  // forever too. There's also no bulk "load currently active KOT
  // tickets" call at all yet, so a real ticket that was already in
  // progress before this session started (including for orders now
  // reconstructed into `orders` via loadTablesFromServer) won't show on
  // KDS until it gets a new real-time event - a real remaining gap, not
  // something starting empty here fixes.
  kots: [],
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
  serviceChargeBackendId: null,
  deliveryChargeRule: opsSeed.deliveryChargeRule,
  packagingChargeRule: opsSeed.packagingChargeRule,
  taxRules: opsSeed.taxRules,
  invoiceFormat: opsSeed.invoiceFormat,
  qrOnSettle: false,
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
  const addons = (l.addons ?? []).reduce((s, a) => s + a.price * a.qty, 0);
  return l.price * l.qty + addons;
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
  /** Resolves the real hotelUser the current session's cookie belongs to
   * (GET /getUserAccess), adds/updates it in `users`, and returns its id -
   * or null if the lookup failed. Called right after a real credential
   * login (password/PIN), so `login()` authenticates as who actually just
   * signed in rather than whatever the local account picker has selected. */
  syncCurrentUser: () => Promise<string | null>;
  logout: () => void;
  /* helpers */
  tableLabel: (tableId: string) => string;
  tableById: (id: string) => RestaurantTable | undefined;
  orderById: (id: string) => Order | undefined;
  orderForTable: (tableId: string) => Order | undefined;
  /** `orders` (live working set) merged with `orderHistory` (synced real
   * settled history), deduplicated by backendId so an order already
   * present in orderHistory isn't shown twice just because it also still
   * sits in the live array from earlier this session. Historical entries
   * win the dedup since they carry accurate backendTotals. */
  allOrders: () => Order[];
  /* order lifecycle */
  startOrder: (tableId: string) => string;
  startTakeAway: () => string;
  /** Starts a new order using the outlet's configured default order type — auto-picks a free table for Dine In, falling back to Pickup if none are free. */
  startDefaultOrder: () => string;
  setOrderType: (orderId: string, type: OrderType) => void;
  addLine: (orderId: string, input: AddLineInput) => void;
  changeQty: (orderId: string, lineId: string, delta: number, module: BillingModule) => void;
  setLineQty: (orderId: string, lineId: string, qty: number, module: BillingModule) => void;
  setLineNote: (orderId: string, lineId: string, note: string) => void;
  setLinePrice: (orderId: string, lineId: string, price: number) => void;
  setLineAddons: (
    orderId: string,
    lineId: string,
    addons: NonNullable<OrderLine["addons"]>,
  ) => void;
  removeLine: (orderId: string, lineId: string, module: BillingModule) => void;

  holdOrder: (orderId: string) => void;
  saveOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  /** Silently frees the table/drops the draft if it's still empty - see
   * freeEmptyDraft's own comment on why this stays quiet unlike cancelOrder. */
  freeIfEmpty: (orderId: string) => void;
  removeOrder: (id: string) => void;
  removeOrders: (ids: string[]) => void;
  remakeOrderSequence: () => void;
  generateKot: (orderId: string) => void;
  applyDiscount: (orderId: string, label: string, amount: number) => void;
  setCustomer: (orderId: string, name: string, phone: string) => void;
  setCharges: (orderId: string, delivery: number, packaging: number) => void;
  generateBill: (orderId: string, options?: { print?: boolean }) => Promise<void>;
  settleOrder: (orderId: string, payments: PaymentSplit[]) => void;
  mergeTables: (sourceTableId: string, destTableId: string) => void;
  moveKot: (orderId: string, round: number, destTableId: string) => Promise<void>;
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
  upsertUser: (u: User, newPassword?: string) => void;
  loadUsersFromServer: () => Promise<void>;
  loadInvoiceFormatFromServer: () => Promise<void>;
  loadDueBillsFromServer: () => Promise<void>;
  loadCustomersFromServer: () => Promise<void>;
  loadKitchensFromServer: () => Promise<void>;
  loadPrintersFromServer: () => Promise<void>;
  loadTaxRulesFromServer: () => Promise<void>;
  loadServiceChargeFromServer: () => Promise<void>;
  loadUnitsFromServer: () => Promise<void>;
  loadRawMaterialsFromServer: () => Promise<void>;
  loadSuppliersFromServer: () => Promise<void>;
  loadPurchaseOrdersFromServer: () => Promise<void>;
  loadWastageFromServer: () => Promise<void>;
  loadSemiFinishedFromServer: () => Promise<void>;
  loadRecipesFromServer: () => Promise<void>;
  loadExpenseHeadsFromServer: () => Promise<void>;
  loadExpensesFromServer: () => Promise<void>;
  loadOrderHistoryFromServer: () => Promise<void>;
  loadPromoCodesFromServer: () => Promise<void>;
  loadEBillCreditFromServer: () => Promise<void>;
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
  setQrOnSettle: (on: boolean) => void;
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
  sendEBill: (orderId: string) => Promise<boolean>;
  printBill: (orderId: string) => Promise<void>;
  printKot: (orderId: string, round: number) => Promise<void>;
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

function mapRawMenuItem(
  m: RawMenuItem & {
    variantData?: RawMenuItemVariant[];
    addonDepartmentData?: RawMenuItemAddonGroup[];
  },
  menuId: string,
): MenuItem {
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
    // Real per-item price lives on the junction row
    // (hms_menu_variant_mst.variant_price), not on the Variants row -
    // see RawMenuItemVariant's own comment. Only present when this
    // mapping is fed getItemsWithVariants's response.
    variants: m.variantData?.map((v) => ({
      id: String(v.id),
      name: v.variants_name,
      price: v.hms_menu_variant_mst?.variant_price ?? 0,
      menuId,
    })),
    addonGroupIds: m.addonDepartmentData?.map((g) => String(g.id)),
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
    // permissionOverrides deliberately isn't seeded from the real
    // backend's own hms_user_accesses here (used to be, via
    // MODULE_TO_ACCESS_AREA) - those are coarse legacy CRUD flags on the
    // real account, and letting them populate an override meant a real
    // backend admin account's own broad access silently beat whatever
    // role default or explicit grant was set in this app's own Users/
    // Permissions screen (e.g. a Manager showing up with Users access
    // despite the role default being NONE, because the authenticated
    // backend account happened to have broad legacy access). This app's
    // own role-based system + explicit per-user overrides (set via
    // updateUserPermissionOverrides) is the intended source of truth for
    // gating features inside this app - callers that load users are
    // expected to carry forward any existing local override (see
    // loadUsersFromServer) rather than relying on this function for it.
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

function parseBackendArray(v: unknown): unknown[] {
  try {
    return typeof v === "string" ? JSON.parse(v || "[]") : Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapRawTaxType(
  t: RawTaxType,
  menuItems: MenuItem[],
  menuCategories: MenuCategory[],
): TaxRule {
  const menuIds = parseBackendArray(t.menu_ids).map((n) => String(n));
  const orderTypes = (parseBackendArray(t.order_type) as string[]).map((x) =>
    x === "dinin" ? "Dine-in" : "Pickup",
  ) as OpsOrderType[];
  // menu_ids is item-scoped server-side; this app's TaxRule is
  // category-scoped, so this can only approximate - a category shows as
  // selected if ANY of its items are present in menu_ids, not
  // necessarily all of them (a partial-category selection round-trips as
  // "the whole category" on reload). See upsertTaxRule's own comment for
  // the save-side half of this mismatch.
  const menuCategoryIds = menuCategories
    .filter((c) => menuItems.some((m) => m.categoryId === c.id && menuIds.includes(m.id)))
    .map((c) => c.id);
  return {
    id: String(t.id),
    name: t.tax_name,
    value: Number(t.amount),
    type: t.tax_value === "fix" ? "fixed" : "percent",
    orderTypes,
    tableCategoryIds: parseBackendArray(t.table_categ_ids).map((n) => String(n)),
    menuCategoryIds,
    active: t.active,
  };
}

function mapRawUnit(u: RawUnit): StockUnit {
  return { id: String(u.id), unitName: u.unit_name, shortName: u.shortName };
}

function mapRecipeDetail(
  detail: RawRecipeDetail,
  previous?: { yieldQty: number; yieldUnit: string },
): Recipe {
  const base = detail.variants.find((v) => v.variant_id === null);
  const lines: RecipeLine[] = (base?.raw_materials ?? []).map((ing) => ({
    type: ing.ingredient_type === "raw_material" ? "raw" : "semi",
    refId: String(ing.raw_material_id ?? ing.semi_finished_item_id),
    qty: ing.consumption_qty,
  }));
  return {
    id: `recipe-${detail.menu_id}`,
    itemName: detail.item_name,
    // No backend field for either - a pure local yield/portioning note,
    // carried over across reloads by id.
    yieldQty: previous?.yieldQty ?? 1,
    yieldUnit: previous?.yieldUnit ?? "plate",
    menuItemId: String(detail.menu_id),
    components: lines
      .filter((l) => l.type === "raw")
      .map((l) => ({ materialId: l.refId, qty: l.qty })),
    groups: [{ key: "base", label: "Base recipe", kind: "base", lines }],
  };
}

function mapRawExpenseHead(
  h: RawExpenseHead,
  previous?: { type: ExpenseHead["type"]; active: boolean },
): ExpenseHead {
  return {
    id: `eh-${h.id}`,
    name: h.expense_head_name,
    // Neither field exists on the backend (only expense_head_name/deleted)
    // - both are pure local classification, carried over across reloads.
    type: previous?.type ?? "Variable",
    active: previous?.active ?? true,
  };
}

function mapRawExpenseEntry(e: RawExpenseEntry): Expense {
  const [y, m, d] = e.business_date.split("-");
  return {
    id: `exp-${e.id}`,
    headId: `eh-${e.expense_head_id}`,
    amount: Number(e.amount),
    date: `${d}/${m}/${y}`,
    mode: e.paymentMode === "Cash" || e.paymentMode === "UPI" ? e.paymentMode : "Bank",
    note: e.reason,
    // No user info comes back on this endpoint at all - see expenseApi's
    // comment on why.
    createdBy: "Staff",
  };
}

// Matches nowStamp()'s "H:MM am/pm" suffix convention (see mock/format.ts)
// so the Dashboard's hourly-flow regex, which only looks for that suffix
// anywhere in the string, keeps working against synced history the same
// way it does against locally-created orders.
function formatOrderTimestamp(iso: string, businessDateDMY: string): string {
  const d = new Date(iso);
  const hh = d.getHours() % 12 || 12;
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ap = d.getHours() >= 12 ? "pm" : "am";
  return `${businessDateDMY} ${`${hh}`.padStart(2, "0")}:${mm} ${ap}`;
}

// hms_orderDetails.addons is a free-form JSON column - the real backend
// (kto.js's own KOT/invoice print templates and matchDepartmentsAndAddonsById)
// reads/writes it as a department-grouped shape with a per-addon qty
// ([{id, department_name, hms_addon_msts: [{id, addon_name, price, qty}]}]),
// which is what the old BillerPe app that supported multi-qty addons wrote.
// Also tolerates the flat {name, price} shape this app itself used to send
// (qty defaults to 1) so previously-created rows still read back correctly.
function parseOrderAddons(raw: string | null | undefined): NonNullable<OrderLine["addons"]> {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: NonNullable<OrderLine["addons"]> = [];
  for (const entry of parsed as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (Array.isArray(rec["hms_addon_msts"])) {
      const groupId = rec["id"] !== undefined ? String(rec["id"]) : undefined;
      for (const rawAddon of rec["hms_addon_msts"] as unknown[]) {
        if (!rawAddon || typeof rawAddon !== "object") continue;
        const a = rawAddon as Record<string, unknown>;
        out.push({
          name: typeof a["addon_name"] === "string" ? a["addon_name"] : "",
          price: Number(a["price"]) || 0,
          qty: Number(a["qty"]) || 1,
          groupId,
          addonId: a["id"] !== undefined ? String(a["id"]) : undefined,
        });
      }
    } else if (typeof rec["name"] === "string") {
      out.push({
        name: rec["name"],
        price: Number(rec["price"]) || 0,
        qty: Number(rec["qty"]) || 1,
      });
    }
  }
  return out;
}

function mapRawOrderHistoryEntry(detail: RawOrderDetail, staffName: string): Order {
  const [y, m, d] = detail.business_date.split("-");
  const businessDate = `${d}/${m}/${y}`;
  const lines: OrderLine[] = detail.hms_orderDetails.map((l) => {
    const addons = parseOrderAddons(l.addons);
    return {
      id: `ol-${l.id}`,
      itemId: String(l.MenuId),
      name: l.hms_menu_mst?.item_name ?? "Unknown item",
      qty: l.qty,
      price: l.price,
      variant: l.variant_name ?? undefined,
      addons: addons.length ? addons : undefined,
      kotRound: 1,
    };
  });
  const payments: PaymentSplit[] = (
    [
      { mode: "Cash" as const, amount: detail.cash },
      { mode: "UPI" as const, amount: detail.upi },
      { mode: "Card" as const, amount: detail.card },
      { mode: "Due" as const, amount: detail.due },
    ] satisfies PaymentSplit[]
  ).filter((p) => p.amount > 0);
  return {
    id: `oh-${detail.id}`,
    orderNo: Number(detail.bill_no) || detail.id,
    type: detail.order_type === "dinin" ? "Dine In" : "Pickup",
    tableLabel: detail.hms_table_mst?.table_name ?? "—",
    // Not tracked anywhere on the backend Order model - no guest-count
    // column exists to sync, so history entries always show 0 covers
    // rather than a fabricated guess.
    guests: 0,
    status: "Settled",
    lines,
    kotRounds: 1,
    customerName: detail.hms_user_master?.name || undefined,
    customerPhone: detail.hms_user_master?.number || undefined,
    discount:
      detail.totalDiscount > 0
        ? { label: detail.discount_reason || "Discount", amount: detail.totalDiscount }
        : undefined,
    payments,
    businessDate,
    createdAt: formatOrderTimestamp(detail.createdAt, businessDate),
    settledAt: formatOrderTimestamp(detail.updatedAt, businessDate),
    createdBy: staffName,
    itemised: lines.length > 0,
    fallbackTotal: lines.length ? undefined : detail.grandAmount,
    backendId: detail.id,
    backendTotals: {
      grand: detail.grandAmount,
      tax: detail.gst,
      discount: detail.totalDiscount,
      serviceCharge: detail.service_charge,
    },
  };
}

// For a table that's genuinely occupied on the real backend (getTable's
// own query already filters to status in-progress/success/hold,
// payment:pending, deleted:false) but this session never created the
// order itself - GET /table only tells us an order id exists on that
// table, not its line items with real names, so this always follows up
// with a real getSingleOrder call (same one orderHistory uses) rather
// than trusting the sparser embedded row.
function mapRawLiveOrder(detail: RawOrderDetail, staffName: string, tableId?: string): Order {
  const [y, m, d] = detail.business_date.split("-");
  const businessDate = `${d}/${m}/${y}`;
  const lines: OrderLine[] = detail.hms_orderDetails.map((l) => {
    const addons = parseOrderAddons(l.addons);
    return {
      id: `ol-${l.id}`,
      itemId: String(l.MenuId),
      name: l.hms_menu_mst?.item_name ?? "Unknown item",
      qty: l.qty,
      price: l.price,
      variant: l.variant_name ?? undefined,
      addons: addons.length ? addons : undefined,
      kotRound: 1,
    };
  });
  const status: Order["status"] =
    detail.status === "hold" ? "Held" : detail.status === "success" ? "Bill Generated" : "Running";
  return {
    id: `o-live-${detail.id}`,
    orderNo: Number(detail.bill_no) || detail.id,
    type: detail.order_type === "dinin" ? "Dine In" : "Pickup",
    tableId,
    tableLabel: detail.hms_table_mst?.table_name ?? "—",
    // Not tracked anywhere on the backend Order model - see
    // mapRawOrderHistoryEntry's own comment on the same gap.
    guests: 0,
    status,
    lines,
    kotRounds: 1,
    customerName: detail.hms_user_master?.name || undefined,
    customerPhone: detail.hms_user_master?.number || undefined,
    discount:
      detail.totalDiscount > 0
        ? { label: detail.discount_reason || "Discount", amount: detail.totalDiscount }
        : undefined,
    businessDate,
    createdAt: formatOrderTimestamp(detail.createdAt, businessDate),
    createdBy: staffName,
    itemised: lines.length > 0,
    fallbackTotal: lines.length ? undefined : detail.grandAmount,
    backendId: detail.id,
    // No backendTotals here, deliberately - this order is still being
    // built/settled, so orderTotals() recomputing live off the current
    // tax/service-charge config is exactly what's wanted, unlike a
    // frozen historical record.
  };
}

function mapRawPromoCode(p: RawPromoCode): PromoCode {
  return {
    id: `promo-${p.id}`,
    name: p.promo_code_name,
    code: p.promo_code,
    type: p.discount_type === "pr" ? "percent" : "fixed",
    value: p.discount_value,
    active: p.status,
  };
}

function mapRawSFI(
  item: RawSFI,
  recipeLines: RawSFIRecipeLine[],
  units: StockUnit[],
  previousBatchQty?: number,
): SemiFinished {
  // GET /all's nested unit only carries unit_name (the long name, e.g.
  // "Gram") - this app's own unit convention everywhere is the short
  // name ("g"), resolved here against the already-wired Units list
  // instead of trusting the long name.
  const unitShort = units.find((u) => u.id === String(item.unit_id))?.shortName ?? "";
  return {
    id: `sf-${item.id}`,
    name: item.name,
    unit: unitShort,
    // No backend field at all - a pure local production-run-size
    // suggestion, carried over across reloads.
    batchQty: previousBatchQty ?? 1,
    stock: item.stock ? Number(item.stock.available_qty) : 0,
    components: recipeLines.map((r) => ({
      materialId: String(r.raw_material_id),
      qty: Number(r.consumption_qty),
    })),
    minStock: item.min_stock_level ? Number(item.min_stock_qty) : undefined,
  };
}

function mapRawWastage(w: RawWastage, previous?: Wastage): Wastage {
  const [y, m, d] = w.business_date.split("-");
  return {
    id: previous?.id ?? `w-${w.id}`,
    materialId: String(w.raw_material_id),
    qty: w.qty,
    reason: w.reason || "Not specified",
    date: `${d}/${m}/${y}`,
    // hms_hotelUser_master?.name is the only field ever read off that
    // nested object - see wastageApi's own comment on why nothing else
    // on it is touched.
    recordedBy: w.hms_hotelUser_master?.name ?? "Unknown",
    ...(w.notes ? { notes: w.notes } : {}),
    cost: w.average_price,
    backendId: w.id,
  };
}

function mapRawPurchaseOrder(o: RawPurchaseOrder, previous?: PurchaseOrder): PurchaseOrder {
  const lines: PurchaseLine[] = o.rawMaterials.map((l) => {
    const taxAmount = (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0);
    return {
      materialId: String(l.raw_material_id),
      qty: l.quantity,
      rate: l.price,
      taxPct: l.amount > 0 ? Math.round((taxAmount / l.amount) * 10000) / 100 : undefined,
      backendLineId: l.id,
    };
  });
  const paid = o.payments;
  return {
    id: previous?.id ?? `po-${o.id}`,
    poNo: `PO-2026-${String(o.Po_no).padStart(3, "0")}`,
    supplierId: o.supplier ? String(o.supplier.id) : (previous?.supplierId ?? ""),
    date: previous?.date ?? todayLabel,
    // No status column at all server-side (confirmed by reading the
    // model - the list endpoint's own response literally references
    // order.status/order.paymentStatus, which come back undefined since
    // neither is a real column). Creation there immediately updates
    // stock, so every backend-sourced order is either "Received" or, if
    // soft-deleted, "Cancelled" - the other three local statuses
    // (Draft/Ordered/Partially Received) have nothing to derive from and
    // are never assigned here.
    status: o.deleted_status ? "Cancelled" : "Received",
    lines,
    invoiceNo: o.invoice_number || undefined,
    gstin: o.GSTNo || undefined,
    paymentStatus:
      paid >= o.grandAmount && o.grandAmount > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
    paidAmount: paid,
    discountType: o.discount_type === "pr" ? "percent" : "flat",
    discountValue: o.discount_value,
    requisitionId: previous?.requisitionId,
    backendId: o.id,
  };
}

function mapRawSupplier(
  s: RawSupplier,
  previous?: Pick<Supplier, "contact" | "phone" | "gstin" | "outstanding">,
): Supplier {
  return {
    id: String(s.id),
    name: s.name,
    // No backend field for any of these (model/Inventory/supplyer.js
    // only has `name`) - carried over across reloads by id, same pattern
    // as raw materials' `category`. `outstanding` is also meant to be
    // derived from purchase orders once that's wired, not a raw field.
    contact: previous?.contact ?? "",
    phone: previous?.phone ?? "",
    gstin: previous?.gstin ?? "",
    outstanding: previous?.outstanding ?? 0,
  };
}

function mapRawMaterial(m: RawRawMaterial, previousCategory?: string): RawMaterial {
  const conversion = m.conversion_qty || 1;
  const purchasePrice = Number(m.purchase_price) || 0;
  return {
    id: String(m.id),
    name: m.raw_material_name,
    unit: m.consumptionUnit?.shortName ?? "",
    purchaseUnit: m.purchaseUnit?.shortName ?? "",
    conversion,
    // Not part of this endpoint's response at all - populated by a later
    // Stock In/Out slice, 0 until then.
    stock: 0,
    reorderLevel: m.mini_stock_level_qty,
    // This app's `rate` is per consumption unit; the backend stores
    // purchase_price per purchase unit - converted with conversion_qty.
    rate: purchasePrice / conversion,
    // No backend field for this at all (model/rawItem.js has none) -
    // carried over across reloads by id, defaults to "Uncategorized".
    category: previousCategory ?? "Uncategorized",
    minStockEnabled: !!m.mini_stock_level,
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

// Password isn't a field on the User type (it's never round-tripped from
// the backend - only entered transiently via the Users dialog's "Reset
// password" input, see _shell.users.tsx). createUser hashes `password`
// unconditionally, so a brand-new user still needs *something* here even
// if the Owner left that field blank; this derives a placeholder from the
// PIN that satisfies the backend's min-length-6 rule as a fallback only.
function placeholderPassword(pin: string) {
  return `Pin${pin || "0000"}`;
}

const StoreContext = createContext<Ctx | null>(null);

// Restoring the session inside a useEffect (as this used to) loses a race
// on every page reload: AppShell's own "redirect to /login if not authed"
// effect lives on a descendant of StoreProvider, and React fires child
// effects before parent effects on mount - so that guard always saw the
// fresh, unauthenticated initialState first and navigated to /login
// before this provider's effect ever got to read localStorage and flip
// authed back to true. login.tsx never redirects back once authed does
// flip, so the user was stuck on the login screen despite having a valid
// session - "reload logs me out" without any real auth failure involved.
// Reading localStorage synchronously in the lazy useState initializer
// instead means `authed` is already correct on the very first render,
// before any effect (this provider's or any descendant's) runs at all.
function loadInitialState(): State {
  if (typeof window === "undefined") return initialState;
  try {
    const saved = window.localStorage.getItem("billerpe.session");
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as { userId: string; device: boolean };
    return {
      ...initialState,
      authed: true,
      deviceRegistered: parsed.device,
      currentUserId: parsed.userId,
    };
  } catch {
    return initialState;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(loadInitialState);

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

  // Converts this app's flat per-line addon selections back into the
  // department-grouped shape the backend actually reads/writes (see
  // parseOrderAddons's comment - same shape, reverse direction) for every
  // KOT/bill payload that carries addons.
  const buildAddonsPayload = (addons?: OrderLine["addons"]) => {
    if (!addons?.length) return [];
    const byGroup = new Map<
      string,
      {
        id: number;
        department_name: string;
        hms_addon_msts: { id: number; addon_name: string; price: number; qty: number }[];
      }
    >();
    addons.forEach((a, i) => {
      const key = a.groupId ?? `_ungrouped_${a.name}_${i}`;
      if (!byGroup.has(key)) {
        const group = a.groupId ? s.addonGroups.find((g) => g.id === a.groupId) : undefined;
        byGroup.set(key, {
          id: Number(a.groupId) || 0,
          department_name: group?.name ?? "",
          hms_addon_msts: [],
        });
      }
      byGroup.get(key)!.hms_addon_msts.push({
        id: Number(a.addonId) || 0,
        addon_name: a.name,
        price: a.price,
        qty: a.qty,
      });
    });
    return [...byGroup.values()];
  };

  // Shared by printBill and generateBill's print option - takes backendId
  // as an explicit argument rather than re-deriving it from `s`, since `s`
  // is this render's immutable snapshot and won't reflect a patch() that
  // just happened moments earlier in the same async flow.
  const doPrintBill = async (o: Order, backendId: number) => {
    try {
      // Real hotel_name/address/gst_no/fssai_no/invoiceFormate*Text -
      // this app's own local invoiceFormat.header/footer are never
      // synced from the server (see hotelApi.getSettings's comment), so
      // they're mock text only and unusable for an actual printed bill.
      const hotel = await hotelApi.getSettings();
      const t = o.backendTotals
        ? {
            ...orderTotals(o, s),
            grand: o.backendTotals.grand,
            discount: o.backendTotals.discount,
            service: o.backendTotals.serviceCharge,
          }
        : orderTotals(o, s);
      const headerText = [
        `<p class="hotel-name">${hotel.hotel_name}</p>`,
        ...([hotel.address1, hotel.address2].filter(Boolean).length
          ? [
              `<p class="hotel-address">${[hotel.address1, hotel.address2].filter(Boolean).join(", ")}</p>`,
            ]
          : []),
        ...(hotel.gst_no ? [`<p>GSTIN: ${hotel.gst_no}</p>`] : []),
        ...(hotel.fssai_no ? [`<p>FSSAI: ${hotel.fssai_no}</p>`] : []),
        ...(hotel.invoiceFormateHeaderText ? [`<p>${hotel.invoiceFormateHeaderText}</p>`] : []),
      ];
      const footerText = hotel.invoiceFormateBottomText
        ? [`<p>${hotel.invoiceFormateBottomText}</p>`]
        : [];
      const { pdf } = await orderApi.generateInvoicePdf({
        orderId: backendId,
        printerSize: hotel.printerSize ?? "1",
        tableAndUserInfo: o.tableLabel,
        dateAndTime: o.createdAt,
        type: o.type === "Dine In" ? "dinin" : "pickup",
        token: 0,
        customerName: o.customerName,
        customerNumber: o.customerPhone,
        items: o.lines.map((l) => ({
          item_name: l.name,
          qty: l.qty,
          price: l.price,
          totalAmount: lineTotal(l),
          variantData: l.variant ? { variants_name: l.variant } : null,
          addons: buildAddonsPayload(l.addons),
        })),
        totalQty: o.lines.reduce((sum, l) => sum + l.qty, 0),
        subtotal: t.subtotal,
        totalDiscount: t.discount,
        service_charge: t.service,
        orderTax: t.taxLines.map((tx) => ({
          hms_tax_type_mst: { tax_name: tx.name },
          amount: 0,
          tax_type: "fix" as const,
          tax_value: tx.amount,
        })),
        totalBill: t.grand,
        headerText,
        footerText,
      });
      const blob = new Blob([new Uint8Array(pdf.data)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("Bill ready to print");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate the bill PDF");
    }
  };

  // Reprint KOT - renders just one already-sent round's ticket (items/qty/
  // note/addons only, no pricing), matching controller/kto.js#reprintkot's
  // real KOT template. There's no "fetch this round back" endpoint, so this
  // re-supplies the round's item list from local state, same as every other
  // print helper here.
  const doPrintKot = async (o: Order, round: number) => {
    try {
      const lines = o.lines.filter((l) => l.kotRound === round);
      if (!lines.length) {
        toast.error("No items found for this KOT round");
        return;
      }
      const hotel = await hotelApi.getSettings();
      const kot = s.kots.find((k) => k.orderId === o.id && k.round === round);
      const userOrTableNo =
        o.type === "Dine In"
          ? o.tableLabel
          : o.customerName
            ? `Customer: ${o.customerName}`
            : "Pickup";
      const { pdf } = await orderApi.printKot({
        order_type: o.type === "Dine In" ? "dinin" : "pickup",
        order_id: String(o.orderNo),
        restaurantName: hotel.hotel_name,
        userOrTableNo,
        timeAndDate: kot?.createdAt ?? o.createdAt,
        printerSize: hotel.printerSize ?? "1",
        kotNumber: round,
        token: 0,
        items: lines.map((l) => ({
          item_name: l.name,
          qty: l.qty,
          comment: l.note ?? "",
          variantData: l.variant ? { variants_name: l.variant } : null,
          addons: buildAddonsPayload(l.addons),
        })),
      });
      const blob = new Blob([new Uint8Array(pdf.data)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("KOT ready to print");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate the KOT PDF");
    }
  };

  // Old BillerPe creates nothing at all when a table/pickup screen is
  // opened - no order, no id, no table-status change - until a real
  // action with a non-empty cart actually succeeds (confirmed by reading
  // Biller.js's tableClick/orderHold/orderKot/orderPlace, and kto.js's
  // holdOrder rejecting an empty cart outright: `if (!cart?.items?.length)
  // return error(CART_NOT_FOUND)`). Matched here: startOrder/startTakeAway
  // hand back a deterministic id with nothing real behind it yet;
  // synthesizeDraft reconstructs a blank, unsaved Order on read so the
  // cart-builder screen has something to render; ensureRealOrder is the
  // one place that actually promotes a draft into a real p.orders entry
  // (and marks the table Held), called only by actions that add real
  // content - never by finalize-only actions (hold/KOT/bill/settle),
  // which keep failing against a still-nonexistent order exactly like
  // they already fail against an empty one.
  const synthesizeDraft = (id: string): Order | undefined => {
    const tableMatch = /^draft-table-(.+)$/.exec(id);
    if (tableMatch) {
      const tableId = tableMatch[1]!;
      const table = s.tables.find((t) => t.id === tableId);
      // Table doesn't exist, or already has a real order under a
      // different id - this virtual id no longer resolves to anything.
      if (!table || table.orderId) return undefined;
      return {
        id,
        orderNo: 0,
        type: "Dine In",
        tableId,
        tableLabel: tableLabel(tableId),
        guests: Math.min(table.seats || 1, 2),
        status: "Held",
        kotRounds: 0,
        lines: [],
        menuId: resolveMenu(s.menus, table, "Dine In")?.id,
        businessDate: todayLabel,
        createdAt: nowStamp(),
        createdBy: currentUser?.name ?? "Taj",
        itemised: true,
      };
    }
    if (id.startsWith("draft-pickup-")) {
      return {
        id,
        orderNo: 0,
        type: "Pickup",
        tableLabel: "Take Away",
        guests: 1,
        status: "Held",
        kotRounds: 0,
        lines: [],
        menuId: resolveMenu(s.menus, undefined, "Pickup")?.id,
        businessDate: todayLabel,
        createdAt: nowStamp(),
        createdBy: currentUser?.name ?? "Taj",
        itemised: true,
      };
    }
    return undefined;
  };

  // Materializes a virtual draft into a real p.orders entry (and marks its
  // table Held) if it isn't one already. No-ops for an id that's already
  // real, or that doesn't resolve to a draft at all. Returns the draft
  // object used (for callers that need it for logging etc. right away,
  // since `s` here won't reflect this patch() until next render).
  const ensureRealOrder = (orderId: string): Order | undefined => {
    if (s.orders.some((o) => o.id === orderId)) return undefined;
    const draft = synthesizeDraft(orderId);
    if (!draft) return undefined;
    patch((p) => ({
      ...p,
      orders: [
        { ...draft, orderNo: Math.max(...p.orders.map((o) => o.orderNo), 100) + 1 },
        ...p.orders,
      ],
      tables: p.tables.map((t) =>
        t.id === draft.tableId
          ? {
              ...t,
              status: "Held",
              guests: draft.guests,
              orderId: draft.id,
              occupiedSince: nowStamp(),
            }
          : t,
      ),
    }));
    return draft;
  };

  // A table/pickup order that never had a real action taken on it (no
  // items ever added, or every item removed again before Hold/KOT/Save)
  // never reached the backend - there's nothing a "cancelled" toast would
  // meaningfully be announcing, since nothing was ever really created from
  // the user's point of view. Falls back to the full cancelOrder (toast +
  // backend cleanup) only when a real backend order exists to clean up.
  const freeEmptyDraft = (o: Order) => {
    if (o.backendId) {
      value.cancelOrder(o.id);
      return;
    }
    patch((p) => ({
      ...p,
      orders: p.orders.filter((x) => x.id !== o.id),
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
    }));
  };

  const value: Ctx = {
    ...s,
    currentUser,
    transactionsBlocked,
    can,
    canSpecial,
    tableLabel,
    tableById: (id) => s.tables.find((t) => t.id === id),
    orderById: (id) =>
      s.orders.find((o) => o.id === id) ??
      s.orderHistory.find((o) => o.id === id) ??
      synthesizeDraft(id),
    orderForTable: (tableId) =>
      s.orders.find(
        (o) => o.tableId === tableId && ["Held", "Running", "Bill Generated"].includes(o.status),
      ),
    allOrders: () => {
      const historyBackendIds = new Set(
        s.orderHistory.map((o) => o.backendId).filter((id): id is number => id !== undefined),
      );
      const liveOnly = s.orders.filter((o) => !(o.backendId && historyBackendIds.has(o.backendId)));
      return [...liveOnly, ...s.orderHistory];
    },

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
    syncCurrentUser: async () => {
      try {
        const { access } = await userApi.getCurrentUserAccess();
        const mapped = mapRawUser(access);
        patch((p) => ({
          ...p,
          users: p.users.some((u) => u.id === mapped.id)
            ? p.users.map((u) =>
                u.id === mapped.id ? { ...mapped, permissionOverrides: u.permissionOverrides } : u,
              )
            : [...p.users, mapped],
        }));
        return mapped.id;
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not identify the logged-in account",
        );
        return null;
      }
    },

    // Just hands back a deterministic id for the cart-builder screen to
    // route to - nothing is created here (no order, no table-status
    // change). See ensureRealOrder's own comment for why: matches old
    // BillerPe, which does exactly the same thing on a table click.
    // Deterministic (not uid()-based) so navigating to the same table
    // again before anything's been added returns to the same draft rather
    // than minting a new id each time.
    startOrder: (tableId) => `draft-table-${tableId}`,

    startTakeAway: () => uid("draft-pickup"),

    startDefaultOrder: () => {
      if (s.defaultOrderType === "Dine In") {
        const freeTable = s.tables.find((t) => t.status === "Free");
        if (freeTable) return value.startOrder(freeTable.id);
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
      const draft = ensureRealOrder(orderId);
      const order = s.orders.find((o) => o.id === orderId) ?? draft;
      if (!order) return;
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

    changeQty: (orderId, lineId, delta, module) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      // Dropping an already-sent line's qty to zero removes it just like
      // removeLine does - same delete permission applies, or a Cashier-role
      // user could bypass the Trash-button block just by using the stepper.
      if (
        line &&
        order &&
        line.qty + delta <= 0 &&
        line.kotRound <= order.kotRounds &&
        guardForbidden(module, "delete", "Delete an item already sent to the kitchen")
      ) {
        return;
      }
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
        // Nothing left on this table/pickup order - don't leave it sitting
        // Held/Running with zero items blocking the table for everyone else.
        if (newQty <= 0 && order.lines.length === 1) freeEmptyDraft(order);
      }
    },

    setLineQty: (orderId, lineId, qty, module) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      if (
        line &&
        order &&
        Math.max(0, Math.round(qty)) <= 0 &&
        line.kotRound <= order.kotRounds &&
        guardForbidden(module, "delete", "Delete an item already sent to the kitchen")
      ) {
        return;
      }
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
      const newQty = Math.max(0, Math.round(qty));
      if (order && line) {
        log(
          "Qty Changed",
          `Order #${order.orderNo}`,
          `${line.name} ×${line.qty}`,
          newQty > 0 ? `×${newQty}` : "Removed",
        );
        // Nothing left on this table/pickup order - don't leave it sitting
        // Held/Running with zero items blocking the table for everyone else.
        if (newQty <= 0 && order.lines.length === 1) freeEmptyDraft(order);
      }
    },

    // Purely local, same as setLineQty/setLineNote - only meant to be
    // called for a line that hasn't been sent to KOT yet (kotRound >
    // order.kotRounds), matching the UI's own editable gate. A line
    // already sent has already been created as a real OrderDetails row
    // server-side at its original price; this only ever changes what
    // gets sent the next time this line is included in a KOT/bill call.
    setLinePrice: (orderId, lineId, price) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      const next = Math.max(0, Math.round(price * 100) / 100);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, price: next } : l)) }
            : o,
        ),
      }));
      if (order && line) {
        log("Price Changed", `Order #${order.orderNo}`, `${line.name} ₹${line.price}`, `₹${next}`);
      }
    },

    setLineAddons: (orderId, lineId, addons) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                lines: o.lines.map((l) =>
                  l.id === lineId ? { ...l, addons: addons.length ? addons : undefined } : l,
                ),
              }
            : o,
        ),
      }));
      if (order && line) {
        log(
          "Addons Changed",
          `Order #${order.orderNo}`,
          line.addons?.map((a) => a.name).join(", ") || "—",
          addons.map((a) => a.name).join(", ") || "—",
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

    removeLine: (orderId, lineId, module) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      if (
        line &&
        order &&
        line.kotRound <= order.kotRounds &&
        guardForbidden(module, "delete", "Delete an item already sent to the kitchen")
      ) {
        return;
      }
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o,
        ),
      }));
      if (order && line) {
        log("Item Removed", `Order #${order.orderNo}`, `${line.name} ×${line.qty}`, "Removed");
        // Nothing left on this table/pickup order - don't leave it sitting
        // Held/Running with zero items blocking the table for everyone else.
        if (order.lines.length === 1) freeEmptyDraft(order);
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
      // The backend has no concept of "cancel" distinct from delete (see
      // orderApi.remove's comment) - this soft-deletes the order for
      // real, so it will not reappear anywhere, including under this
      // app's own "Cancelled" filter, once orders/orderHistory reload.
      if (!o?.backendId) return;
      const run = async () => {
        try {
          await orderApi.remove(o.backendId!, { free: true });
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Cancelled locally but the backend removal failed",
          );
        }
      };
      void run();
    },
    freeIfEmpty: (orderId) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || o.lines.length > 0) return;
      freeEmptyDraft(o);
    },
    removeOrder: (id) => {
      const o = s.orders.find((x) => x.id === id) ?? s.orderHistory.find((x) => x.id === id);
      patch((p) => ({
        ...p,
        orders: p.orders.filter((x) => x.id !== id),
        orderHistory: p.orderHistory.filter((x) => x.id !== id),
      }));
      toast.success("Order removed");
      if (!o?.backendId) return;
      const run = async () => {
        try {
          await orderApi.remove(o.backendId!);
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Removed locally but the backend removal failed",
          );
        }
      };
      void run();
    },
    removeOrders: (ids) => {
      const backendIds = ids
        .map(
          (id) =>
            (s.orders.find((x) => x.id === id) ?? s.orderHistory.find((x) => x.id === id))
              ?.backendId,
        )
        .filter((id): id is number => id !== undefined);
      patch((p) => ({
        ...p,
        orders: p.orders.filter((o) => !ids.includes(o.id)),
        orderHistory: p.orderHistory.filter((o) => !ids.includes(o.id)),
      }));
      toast.success(`${ids.length} order(s) removed`);
      if (!backendIds.length) return;
      const run = async () => {
        try {
          await orderApi.removeBulk(backendIds);
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Removed locally but the backend removal failed",
          );
        }
      };
      void run();
    },

    remakeOrderSequence: () => {
      if (guardForbiddenSpecial("system.remakeOrderSequence")) return;
      const run = async () => {
        try {
          const { updated_count } = await orderApi.remakeSequence();
          await value.loadOrderHistoryFromServer();
          log(
            "Order Sequence Renumbered",
            "All orders",
            "",
            `${updated_count} bill number(s) closed back into sequence`,
          );
          toast.success(
            updated_count > 0
              ? `${updated_count} order(s) renumbered`
              : "Sequence already has no gaps",
          );
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not renumber the order sequence",
          );
        }
      };
      void run();
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
          addons: buildAddonsPayload(l.addons),
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
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
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
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
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
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
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

    generateBill: async (orderId, options) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;

      if (o.type !== "Dine In") {
        // Pickup has no backend-visible "bill generated" state -
        // AdminOrder's pickup branch requires payment info up front and
        // finalizes + settles in one call (confirmed live, see
        // settleOrder and adminOrder's comment in lib/api.ts), so this
        // step stays purely local until the real settle call - no
        // backendId needed either way, so nothing to gate on here.
        patch((p) => ({
          ...p,
          orders: p.orders.map((x) => (x.id === orderId ? { ...x, status: "Bill Generated" } : x)),
        }));
        log("Bill Generated", `Order #${o.orderNo}`, o.status, "Bill Generated");
        toast.success(`Bill generated for #${o.orderNo}`);
        if (options?.print) {
          if (o.backendId) {
            await doPrintBill(o, o.backendId);
          } else {
            toast.error("Send a KOT first to print a pickup bill without settling");
          }
        }
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
          addons: buildAddonsPayload(l.addons),
          comment: l.note ?? "",
          menu_categ_id: mi ? Number(mi.categoryId) : 0,
        };
      });

      const run = async () => {
        try {
          // No KOT fired yet (no backendId) - controller/kto.js#AdminOrder's
          // "no order_id" branch creates the Order fresh in this same call
          // for dine-in (confirmed by reading it in full: requires
          // table_id, rejects with TABLE_RUNNING if that table already has
          // a pending order, and returns the new order's real id) -
          // omitting order_id here triggers that path instead of
          // AdminOrder's "update an existing order" branch. This is the
          // whole mechanism behind billing without ever sending a KOT.
          const res = await orderApi.adminOrder({
            order_type: "dinin",
            ...(o.backendId ? { order_id: o.backendId } : {}),
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
          const backendId = o.backendId ?? res.orderId;
          patch((p) => ({
            ...p,
            orders: p.orders.map((x) =>
              x.id === orderId ? { ...x, status: "Bill Generated", backendId } : x,
            ),
            tables: p.tables.map((t) =>
              t.id === o.tableId ? { ...t, status: "Bill Generated" } : t,
            ),
          }));
          log("Bill Generated", `Order #${o.orderNo}`, o.status, "Bill Generated");
          toast.success(`Bill generated for #${o.orderNo}`);
          if (options?.print && backendId) {
            await doPrintBill(o, backendId);
          }
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not generate bill");
        }
      };
      await run();
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
                addons: buildAddonsPayload(l.addons),
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

    // reopenOrder was removed: confirmed by reading every order-mutating
    // controller in this backend that there is no capability anywhere to
    // reset a Settled order's payment back to "pending" (settleBills
    // itself only ever operates on payment:"pending" rows) or to free its
    // table server-side. A local-only "reopen" would desync from the
    // backend's real state - the order stays Settled there regardless of
    // what this app shows - so it's gone rather than left as a dead end
    // that quietly corrupts local state.

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

      // POST /moveTable (controller/table.js) does exactly this merge -
      // folds table1's order into whatever's already on table2 - but it
      // only operates on a real Order row. A draft never sent to KOT has
      // nothing on the backend to move yet, so that case stays local-only
      // (same as it's always been) rather than failing an ORDER_NOT_FOUND.
      if (srcOrder.backendId) {
        const run = async () => {
          try {
            await tableApi.moveTable({
              tableId1: Number(sourceTableId),
              tableId2: Number(destTableId),
              orderId: srcOrder.backendId!,
            });
            await value.loadTablesFromServer();
            log("Table Merged", `${sourceLabel} → ${destLabel}`, "2 orders", "1 combined order");
            toast.success(`Merged ${sourceLabel} into ${destLabel}`, {
              description: "Items grouped by origin · one combined bill. Merge cannot be undone.",
            });
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Could not merge tables");
          }
        };
        void run();
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

      // See mergeTables' comment - POST /moveTable decides merge-vs-transfer
      // itself based on whether table2 already has an order, so a synced
      // order that's currently on a table can always go straight to it (an
      // order not yet on any table - a pickup order never assigned one -
      // has no TableId for the backend to move from, so that stays local).
      if (o.backendId && o.tableId) {
        const sourceLabel = o.tableLabel;
        const sourceTableId = o.tableId;
        const destLabel = tableLabel(destTableId);
        const run = async () => {
          try {
            await tableApi.moveTable({
              tableId1: Number(sourceTableId),
              tableId2: Number(destTableId),
              orderId: o.backendId!,
            });
            await value.loadTablesFromServer();
            log("Table Transferred", `${sourceLabel} → ${destLabel}`, sourceLabel, destLabel);
            toast.success(`Order moved to ${destLabel}`, {
              description: "Transfers cannot be reversed.",
            });
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Could not transfer the order");
          }
        };
        void run();
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

      // Cash Sessions have no backend representation at all (confirmed
      // earlier this session - no hotel_id/status/cashier on the model,
      // no controller code touches it) - the movement above stays purely
      // local. The expense entry itself is real though, so it's synced.
      const headBackendId = headId.startsWith("eh-")
        ? Number(headId.replace("eh-", ""))
        : undefined;
      if (!headBackendId) return;
      const run = async () => {
        try {
          await expenseApi.create({
            expense_head_id: headBackendId,
            amount,
            paymentMode: "Cash",
            reason: note,
            addExpense: true,
          });
          await value.loadExpensesFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Attached to the cash session locally but the backend sync failed",
          );
        }
      };
      void run();
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
          menuApi.getItemsWithVariants(),
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
      // Variant rows carry the item-editor's own local draft id, not the
      // real Variants master id - resolve each by name against
      // variantMasters to get the id the backend actually wants. Joi
      // rejects a variant_price <= 0 (validate.js's menuSchema/
      // editMenuSchema both require it > 0), so a row left at 0 is
      // dropped here rather than failing the whole save.
      const variants = (item.variants ?? [])
        .map((v) => {
          const masterId = s.variantMasters.find((m) => m.name === v.name)?.id;
          return masterId && v.price > 0 ? { id: Number(masterId), variant_price: v.price } : null;
        })
        .filter((v): v is { id: number; variant_price: number } => v !== null);
      const payload = {
        item_name: item.name,
        menu_categ_id: Number(item.categoryId),
        price: item.price,
        shortCode: toShortCode(item.sku, item.name, seed),
        favorite: item.favourite,
        gst_type: "S" as const, // no UI field yet - defaults to the model's own default
        barcode_value: item.barcode ?? "",
        addons: (item.addonGroupIds ?? []).map(Number),
        variants,
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
        const [{ tables }, { tableCatagories }, { order: activeOrders }] = await Promise.all([
          tableApi.getTables(),
          tableApi.getCategories(),
          orderApi.getActiveOrders(),
        ]);
        const mappedTables = tables.map(mapRawTable);
        // Any currently-active order (dine-in or pickup, table or no
        // table - see orderApi.getActiveOrders's own comment) this
        // session has no matching local order for (opened on another
        // device, left running from before this login, or this is a
        // fresh page load) gets reconstructed here - otherwise opening
        // an occupied table would silently start a brand-new empty order
        // on top of the real one already in progress there (table-grid's
        // openOrder only ever checks the local table.orderId field,
        // never the backend, to decide that), and a live pickup order
        // with no table at all would be invisible everywhere.
        const knownBackendIds = new Set(
          s.orders.map((o) => o.backendId).filter((id): id is number => id !== undefined),
        );
        const toResolve = activeOrders.filter((o) => !knownBackendIds.has(o.id));
        const resolved = (
          await Promise.all(
            toResolve.map(async (raw) => {
              try {
                const { order: detail } = await orderHistoryApi.getDetail(raw.id);
                const staffName = detail.hotelUserId
                  ? (s.users.find((u) => u.id === String(detail.hotelUserId))?.name ?? "Staff")
                  : "Staff";
                const tableId = detail.TableId ? String(detail.TableId) : undefined;
                return mapRawLiveOrder(detail, staffName, tableId);
              } catch {
                return null;
              }
            }),
          )
        ).filter((o): o is Order => o !== null);
        const tablesWithOrders = mappedTables.map((t) => {
          const match = resolved.find((o) => o.tableId === t.id);
          return match ? { ...t, orderId: match.id } : t;
        });
        patch((p) => ({
          ...p,
          tables: tablesWithOrders,
          tableCategories: tableCatagories.map(mapRawCategory),
          orders: [...p.orders, ...resolved],
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
        patch((p) => ({
          ...p,
          // A per-user override set locally via updateUserPermissionOverrides
          // (the Users screen's own permission editor) must survive a
          // resync - mapRawUser always returns a fresh user with no
          // override of its own, so carry the existing one forward by id
          // rather than letting every reload silently wipe an Owner's
          // explicit grant back to the role default.
          users: hotelUsers.map((u) => {
            const fresh = mapRawUser(u);
            const existing = p.users.find((x) => x.id === fresh.id);
            return existing?.permissionOverrides
              ? { ...fresh, permissionOverrides: existing.permissionOverrides }
              : fresh;
          }),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load users from server");
      }
    },

    // Only pulls upiId - see hotelApi's own comment for why the rest of
    // this app's InvoiceFormat stays local-only.
    loadInvoiceFormatFromServer: async () => {
      try {
        const { upiId, hms_res_setting } = await hotelApi.getSettings();
        patch((p) => ({
          ...p,
          invoiceFormat: { ...p.invoiceFormat, upiId: upiId ?? "" },
          qrOnSettle: hms_res_setting?.qr_code_open_on_settle ?? false,
        }));
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
    loadTaxRulesFromServer: async () => {
      try {
        const { taxtTypes } = await taxApi.getAll();
        patch((p) => ({
          ...p,
          taxRules: taxtTypes.map((t) => mapRawTaxType(t, p.menuItems, p.menuCategories)),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load tax rules from server");
      }
    },
    loadServiceChargeFromServer: async () => {
      try {
        const { hms_serviceCharge_mst } = await hotelApi.getSettings();
        if (!hms_serviceCharge_mst) return;
        const sc = hms_serviceCharge_mst;
        const greaterLessMap: Record<
          RawServiceCharge["greater_less"],
          "always" | "greater" | "less"
        > = { "1": "greater", "2": "less", "3": "always" };
        patch((p) => ({
          ...p,
          serviceChargeBackendId: sc.id,
          serviceCharge: {
            active: sc.active,
            type: sc.service_charge_type === "fixed" ? "fixed" : "percent",
            value: sc.service_charge_value,
            calculationOn: sc.calculation_on,
            autoApply: (parseBackendArray(sc.service_charge_automatic) as string[]).map((t) =>
              t === "dinin" ? "Dine-in" : "Pickup",
            ) as OpsOrderType[],
            taxOnCharge: sc.calculation_on_tax,
            condition: greaterLessMap[sc.greater_less] ?? "always",
            threshold: sc.greater_less_amount,
          },
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load service charge from server",
        );
      }
    },
    loadUnitsFromServer: async () => {
      try {
        const { units } = await stockUnitApi.getAll();
        patch((p) => ({ ...p, units: units.map(mapRawUnit) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load units from server");
      }
    },
    // Stock-in-hand is fetched here too, in the same async function
    // rather than as a separate AppShell effect - both need
    // rawMaterials to already be the fresh server list before merging,
    // and two independent effects racing on the same store.authed
    // trigger can't guarantee that ordering (whichever fetch resolves
    // first would either merge against stale seed data or get
    // immediately overwritten by the other).
    loadRawMaterialsFromServer: async () => {
      try {
        const { rawMaterials } = await rawMaterialApi.getAll();
        const previousCategoryById = new Map(s.rawMaterials.map((m) => [m.id, m.category]));
        const mapped = rawMaterials.map((m) =>
          mapRawMaterial(m, previousCategoryById.get(String(m.id))),
        );
        let withStock = mapped;
        try {
          const { stockInHand } = await stockInHandApi.getAll();
          const byMaterialId = new Map(stockInHand.map((x) => [String(x.raw_material_id), x]));
          withStock = mapped.map((m) => {
            const entry = byMaterialId.get(m.id);
            if (!entry) return { ...m, stock: 0 };
            const avgPrice = Number(entry.average_price) || 0;
            return {
              ...m,
              stock: entry.available_stock_Consiompsion_qty,
              rate: m.conversion > 0 ? avgPrice / m.conversion : avgPrice,
            };
          });
        } catch (stockErr) {
          // Raw material master data loaded fine; stock levels just
          // couldn't be fetched - materials still show (at whatever
          // stock/rate mapRawMaterial defaulted to) rather than the
          // whole screen failing.
          toast.error(
            stockErr instanceof ApiError
              ? stockErr.message
              : "Could not load stock levels from server",
          );
        }
        patch((p) => ({ ...p, rawMaterials: withStock }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load raw materials from server",
        );
      }
    },
    loadSuppliersFromServer: async () => {
      try {
        const { suppliers } = await supplierApi.getAll();
        const previousById = new Map(s.suppliers.map((x) => [x.id, x]));
        patch((p) => ({
          ...p,
          suppliers: suppliers.map((x) => mapRawSupplier(x, previousById.get(String(x.id)))),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load suppliers from server");
      }
    },
    loadPurchaseOrdersFromServer: async () => {
      try {
        const { purchaseOrders } = await purchaseOrderApi.getAll("2000-01-01", "2100-01-01");
        const previousByBackendId = new Map(
          s.purchaseOrders.filter((p) => p.backendId).map((p) => [p.backendId, p]),
        );
        const fresh = purchaseOrders.map((o) =>
          mapRawPurchaseOrder(o, previousByBackendId.get(o.id)),
        );
        patch((p) => ({
          ...p,
          purchaseOrders: [
            ...fresh,
            // Draft/Ordered POs never sent to the backend yet - this
            // endpoint has no way to represent "ordered but not received"
            // at all (see purchaseOrderApi's own comment), so these stay
            // exactly as local as before this was wired.
            ...p.purchaseOrders.filter((x) => !x.backendId),
          ],
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load purchase orders from server",
        );
      }
    },
    loadWastageFromServer: async () => {
      try {
        const { data } = await wastageApi.getAll("2000-01-01", "2100-01-01");
        const previousByBackendId = new Map(
          s.wastages.filter((w) => w.backendId).map((w) => [w.backendId, w]),
        );
        patch((p) => ({
          ...p,
          wastages: data.map((w) => mapRawWastage(w, previousByBackendId.get(w.id))),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load wastage from server");
      }
    },
    // Units are fetched fresh here rather than read off s.units - this is
    // an independent AppShell effect from loadUnitsFromServer, and two
    // effects racing on the same store.authed trigger can't guarantee
    // units would already be loaded by the time this runs (same reasoning
    // as loadRawMaterialsFromServer folding in its own stockInHand fetch).
    loadSemiFinishedFromServer: async () => {
      try {
        const [items, { units: rawUnits }] = await Promise.all([
          semiFinishedApi.getAll(),
          stockUnitApi.getAll(),
        ]);
        const units = rawUnits.map(mapRawUnit);
        const previousBatchQtyById = new Map(s.semiFinished.map((sf) => [sf.id, sf.batchQty]));
        const mapped = await Promise.all(
          items.map(async (item) => {
            const localId = `sf-${item.id}`;
            try {
              const detail = await semiFinishedApi.getSingle(item.id);
              return mapRawSFI(item, detail.recipes, units, previousBatchQtyById.get(localId));
            } catch {
              // Base item still shows even if its recipe lines couldn't
              // be fetched - an empty BOM rather than the whole item
              // disappearing.
              return mapRawSFI(item, [], units, previousBatchQtyById.get(localId));
            }
          }),
        );
        patch((p) => ({ ...p, semiFinished: mapped }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load semi-finished items from server",
        );
      }
    },
    loadRecipesFromServer: async () => {
      try {
        const { recipes: summaries } = await recipeApi.getAllLinked();
        const previousById = new Map(
          s.recipes.map((r) => [r.id, { yieldQty: r.yieldQty, yieldUnit: r.yieldUnit }]),
        );
        const mapped = (
          await Promise.all(
            summaries.map(async (summary) => {
              try {
                const detail = await recipeApi.getSingle(summary.menu_id);
                const localId = `recipe-${summary.menu_id}`;
                return mapRecipeDetail(detail, previousById.get(localId));
              } catch {
                return null;
              }
            }),
          )
        ).filter((r): r is Recipe => r !== null);
        patch((p) => ({ ...p, recipes: mapped }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load recipes from server");
      }
    },
    loadExpenseHeadsFromServer: async () => {
      try {
        const { expenseHeads } = await expenseHeadApi.getAll();
        const previousById = new Map(
          s.expenseHeads.map((h) => [h.id, { type: h.type, active: h.active }]),
        );
        patch((p) => ({
          ...p,
          expenseHeads: expenseHeads.map((h) =>
            mapRawExpenseHead(h, previousById.get(`eh-${h.id}`)),
          ),
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load expense heads from server",
        );
      }
    },
    loadExpensesFromServer: async () => {
      try {
        const { entry } = await expenseApi.getAll("2000-01-01", "2100-01-01");
        patch((p) => ({ ...p, expenses: entry.map(mapRawExpenseEntry) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load expenses from server");
      }
    },
    loadOrderHistoryFromServer: async () => {
      try {
        const { order: headers } = await orderHistoryApi.getAllHeaders();
        // Real settled orders only - unsettled ones are already visible
        // live via `orders`, and reconstructing this app's full
        // Held/Running/Bill Generated workflow state for them isn't
        // needed for the historical reporting this feeds. `business_date`
        // is real-world dated, unlike this app's frozen local "today" -
        // no window bound exists on the backend side of this endpoint, so
        // it's applied here, capped at 300 orders as a sanity bound (see
        // orderHistoryApi's own comment on why there's no cheaper way to
        // get this).
        const windowStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const inWindow = headers
          .filter((h) => h.payment === "success" && h.business_date >= windowStart)
          .slice(0, 300);
        const mapped = (
          await Promise.all(
            inWindow.map(async (h) => {
              try {
                const { order: detail } = await orderHistoryApi.getDetail(h.id);
                const staffName = h.hotelUserId
                  ? (s.users.find((u) => u.id === String(h.hotelUserId))?.name ?? "Staff")
                  : "Staff";
                return mapRawOrderHistoryEntry(detail, staffName);
              } catch {
                return null;
              }
            }),
          )
        ).filter((o): o is Order => o !== null);
        patch((p) => ({ ...p, orderHistory: mapped }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load order history from server",
        );
      }
    },
    loadPromoCodesFromServer: async () => {
      try {
        const { promoCodes } = await promoCodeApi.getAll();
        patch((p) => ({ ...p, promoCodes: promoCodes.map(mapRawPromoCode) }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load promo codes from server",
        );
      }
    },
    loadEBillCreditFromServer: async () => {
      try {
        const { credit } = await orderApi.getEBillCredit();
        patch((p) => ({ ...p, eBillCredit: credit }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load e-bill credit from server",
        );
      }
    },
    upsertUser: (u, newPassword) => {
      const isNew = !s.users.some((x) => x.id === u.id);
      const payload = {
        active: u.status === "Active",
        name: u.name,
        email: u.email,
        role: u.role,
        number: u.mobile,
        // The backend requires a password on create (createUser hashes it
        // unconditionally) but only applies it on update when present
        // (updateUser's `if (password)` guard) - so on create, fall back to
        // a placeholder derived from the PIN only if the Owner didn't set a
        // real one; on update, omit the field entirely unless they typed a
        // new one, so saving an unrelated change (e.g. toggling Active)
        // doesn't silently reset the account's real login password.
        ...(isNew
          ? { password: newPassword || placeholderPassword(u.pin) }
          : newPassword
            ? { password: newPassword }
            : {}),
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
      const headBackendId = e.headId.startsWith("eh-")
        ? Number(e.headId.replace("eh-", ""))
        : undefined;
      if (!headBackendId) {
        toast.error("Select a valid expense head");
        return;
      }
      const backendId = e.id.startsWith("exp-") ? Number(e.id.replace("exp-", "")) : undefined;
      const payload = {
        expense_head_id: headBackendId,
        amount: e.amount,
        paymentMode: e.mode,
        reason: e.note,
        addExpense: true,
      };
      const run = async () => {
        try {
          if (!backendId) {
            await expenseApi.create(payload);
          } else {
            await expenseApi.update({ ...payload, id: backendId });
          }
          await value.loadExpensesFromServer();
          toast.success("Expense saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save expense");
        }
      };
      void run();
    },
    upsertExpenseHead: (h) => {
      if (!h.name.trim()) {
        toast.error("Enter a head name");
        return;
      }
      // type/active have no backend field at all (see mapRawExpenseHead) -
      // a reload's previous-value lookup can't see an edit made in this
      // same action (its "previous" map is built from state as of this
      // render, before this save resolves), so rather than reload and
      // risk losing the edit just made, the full local row (including the
      // save's own type/active) is patched in directly once the real id
      // is known.
      const backendId = h.id.startsWith("eh-") ? Number(h.id.replace("eh-", "")) : undefined;
      const knownIds = new Set(
        s.expenseHeads
          .filter((x) => x.id.startsWith("eh-"))
          .map((x) => Number(x.id.replace("eh-", ""))),
      );
      const run = async () => {
        try {
          const { expenseHeads } = backendId
            ? await expenseHeadApi.update(backendId, h.name)
            : await expenseHeadApi.create(h.name);
          const resolvedId = backendId ?? expenseHeads.find((x) => !knownIds.has(x.id))?.id;
          if (!resolvedId) {
            toast.error("Saved on the server but could not resolve its id");
            return;
          }
          const mapped: ExpenseHead = {
            id: `eh-${resolvedId}`,
            name: h.name,
            type: h.type,
            active: h.active,
          };
          patch((p) => ({
            ...p,
            expenseHeads: p.expenseHeads.some((x) => x.id === mapped.id)
              ? p.expenseHeads.map((x) => (x.id === mapped.id ? mapped : x))
              : [...p.expenseHeads, mapped],
          }));
          toast.success("Expense head saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save expense head");
        }
      };
      void run();
    },
    upsertRawMaterial: (m) => {
      const purchaseUnitId = s.units.find((u) => u.shortName === m.purchaseUnit)?.id;
      const consumptionUnitId = s.units.find((u) => u.shortName === m.unit)?.id;
      if (!purchaseUnitId || !consumptionUnitId) {
        toast.error("Select a valid purchase and consumption unit");
        return;
      }
      const payload = {
        raw_material_name: m.name,
        purchase_price: String(Math.round(m.rate * m.conversion * 100) / 100),
        unit: Number(purchaseUnitId),
        consumption_unit: Number(consumptionUnitId),
        conversion_qty: m.conversion,
        mini_stock_level: m.minStockEnabled ?? m.reorderLevel > 0,
        mini_stock_level_qty: m.reorderLevel,
      };
      const previousIds = new Set(s.rawMaterials.map((x) => x.id));
      const previousCategoryById = new Map(s.rawMaterials.map((x) => [x.id, x.category]));
      const run = async () => {
        try {
          const { rawMaterials } = m.id
            ? await rawMaterialApi.update({ ...payload, id: Number(m.id) })
            : await rawMaterialApi.create(payload);
          patch((p) => ({
            ...p,
            rawMaterials: rawMaterials.map((r) => {
              const id = String(r.id);
              // The row this call just created or edited keeps the
              // draft's category (a purely local field, see
              // mapRawMaterial's own comment); every other row keeps
              // whatever category it already had.
              const isSavedRow = m.id ? id === m.id : !previousIds.has(id);
              return mapRawMaterial(r, isSavedRow ? m.category : previousCategoryById.get(id));
            }),
          }));
          toast.success("Raw material saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save raw material");
        }
      };
      void run();
    },
    upsertSupplier: (sup) => {
      if (!sup.name.trim()) {
        toast.error("Supplier name is required");
        return;
      }
      const previousIds = new Set(s.suppliers.map((x) => x.id));
      const previousById = new Map(s.suppliers.map((x) => [x.id, x]));
      const localFields = {
        contact: sup.contact,
        phone: sup.phone,
        gstin: sup.gstin,
        outstanding: sup.outstanding,
      };
      const run = async () => {
        try {
          if (sup.id) {
            await supplierApi.update(Number(sup.id), sup.name);
          } else {
            await supplierApi.create(sup.name);
          }
          // create/edit responses use inconsistent shapes for the same
          // key (see supplierApi's own comment) - reloading the canonical
          // list instead of trusting either one.
          const { suppliers } = await supplierApi.getAll();
          patch((p) => ({
            ...p,
            suppliers: suppliers.map((x) => {
              const id = String(x.id);
              // The row this call just created or edited keeps the
              // draft's local-only fields (contact/phone/gstin/
              // outstanding - none of which the backend has); every
              // other row keeps whatever it already had.
              const isSavedRow = sup.id ? id === sup.id : !previousIds.has(id);
              return mapRawSupplier(x, isSavedRow ? localFields : previousById.get(id));
            }),
          }));
          toast.success("Supplier saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save supplier");
        }
      };
      void run();
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
      const run = async () => {
        try {
          const { units } = u.id
            ? await stockUnitApi.update({
                id: Number(u.id),
                unitName: u.unitName,
                shortName: u.shortName,
              })
            : await stockUnitApi.create({ unitName: u.unitName, shortName: u.shortName });
          patch((p) => ({ ...p, units: units.map(mapRawUnit) }));
          toast.success("Unit saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save unit");
        }
      };
      void run();
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

      // The one moment this actually talks to the backend - creating a
      // purchase order there immediately updates real stock (see
      // purchaseOrderApi's own comment), so only receiving (not the
      // local Draft/Ordered stage, which has no backend equivalent at
      // all) maps to a write. Runs after the optimistic local update
      // above, same pattern as the rest of this app: local state drives
      // the UI immediately, this syncs it to the backend and reconciles
      // once that resolves.
      if (!receive) return;
      const supplierId = Number(record.supplierId);
      if (!supplierId) {
        toast.error("Select a valid supplier before receiving");
        return;
      }
      const rawMaterialData = record.lines.map((l) => {
        const material = s.rawMaterials.find((m) => m.id === l.materialId);
        const purchaseUnitId = material
          ? s.units.find((u) => u.shortName === material.purchaseUnit)?.id
          : undefined;
        const amount = Math.round(l.qty * l.rate * 100) / 100;
        const taxAmount = (amount * (l.taxPct ?? 0)) / 100;
        return {
          ...(l.backendLineId ? { id: l.backendLineId } : {}),
          raw_material_id: Number(l.materialId),
          qty: l.qty,
          price: l.rate,
          amount,
          cgst: Math.round((taxAmount / 2) * 100) / 100,
          sgst: Math.round((taxAmount / 2) * 100) / 100,
          igst: 0,
          unit_id: purchaseUnitId ? Number(purchaseUnitId) : 0,
        };
      });
      if (rawMaterialData.some((l) => !l.unit_id)) {
        toast.error("One or more materials has no purchase unit configured", {
          description: "Set a purchase unit on it under Stock › Raw Materials first.",
        });
        return;
      }
      const payload = {
        supplier_id: supplierId,
        GSTNo: record.gstin ?? "",
        grandAmount: totals.grand,
        discount: totals.discount,
        delivery_charge: 0,
        invoice_number: record.invoiceNo ?? "",
        Po_no: Number(record.poNo.split("-").pop()) || 0,
        discount_type: record.discountType === "percent" ? ("pr" as const) : ("fix" as const),
        discount_value: record.discountValue ?? 0,
        sub_total: totals.subtotal,
        rawMaterialData,
      };
      const backendId = record.backendId;
      const previousBackendIds = new Set(
        s.purchaseOrders.filter((p) => p.backendId).map((p) => p.backendId),
      );
      const paidAmount = record.paidAmount ?? 0;
      const runSync = async () => {
        try {
          let realId = backendId;
          if (!realId) {
            // createPurchaseOrder doesn't return the new row's id -
            // finding it by diffing the id set before/after, same
            // pattern as Kitchens/Printers.
            await purchaseOrderApi.create(payload);
            const { purchaseOrders } = await purchaseOrderApi.getAll("2000-01-01", "2100-01-01");
            const created = purchaseOrders.find((o) => !previousBackendIds.has(o.id));
            if (!created) {
              toast.error("Purchase order saved locally but couldn't be confirmed on the server", {
                description: "Reload the Purchase Orders screen to check.",
              });
              return;
            }
            realId = created.id;
          } else {
            await purchaseOrderApi.update({ id: realId, ...payload });
          }
          if (paidAmount > 0) {
            // paidAmount sent at create time only actually persists when
            // payment_type is exactly "paid" (confirmed live) - always
            // recorded through the separate payment endpoint instead, for
            // both the first receipt and any later edit.
            await purchaseOrderApi.payment({
              id: realId,
              payment_mode: "cash",
              payment_ref_no: "",
              payment_date: new Date().toISOString().slice(0, 10),
              paidAmount,
            });
          }
          await value.loadPurchaseOrdersFromServer();
          patch((p) => ({
            ...p,
            // Drop the temporary local-only record now superseded by the
            // backend-derived one loadPurchaseOrdersFromServer just added.
            purchaseOrders: p.purchaseOrders.filter((x) => x.id !== id || !!x.backendId),
          }));
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not sync purchase order to the server",
          );
        }
      };
      void runSync();
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

      if (!po.backendId) return;
      const run = async () => {
        try {
          await purchaseOrderApi.payment({
            id: po.backendId!,
            payment_mode: "cash",
            payment_ref_no: "",
            payment_date: new Date().toISOString().slice(0, 10),
            paidAmount: amount,
          });
          await value.loadPurchaseOrdersFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Payment saved locally but couldn't be synced",
          );
        }
      };
      void run();
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

      if (!po.backendId) return;
      const run = async () => {
        try {
          await purchaseOrderApi.remove(po.backendId!);
          await value.loadPurchaseOrdersFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Cancelled locally but the backend reversal failed",
          );
        }
      };
      void run();
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

      // Sync each changed material to the real backend - stockIn/stockOut
      // both take qty in purchase units (StockInHand.qty), while this
      // app's stock and variance are in consumption units, converted
      // through each material's own conversion_qty.
      const varianceByMaterialId = new Map(
        changed.map((r) => {
          const m = s.rawMaterials.find((x) => x.id === r.materialId)!;
          return [r.materialId, r.countedQty - m.stock] as const;
        }),
      );
      const run = async () => {
        try {
          for (const [materialId, variance] of varianceByMaterialId) {
            const m = s.rawMaterials.find((x) => x.id === materialId);
            if (!m || Math.abs(variance) < 0.0001) continue;
            const purchaseQty = Math.abs(variance) / (m.conversion || 1);
            if (variance > 0) {
              await stockInHandApi.stockIn({
                raw_material_id: Number(materialId),
                qty: purchaseQty,
                price: m.rate * (m.conversion || 1),
              });
            } else {
              await stockInHandApi.stockOut({
                raw_material_id: Number(materialId),
                qty: purchaseQty,
              });
            }
          }
          await value.loadRawMaterialsFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Reconciled locally but the backend sync failed",
          );
        }
      };
      void run();
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

      // qty is sent as-is (already in consumption units, matching this
      // app's own convention) with unit_id set to each material's own
      // consumption unit - both ids sent as strings, the one place in
      // this backend that requires that (see wastageApi's own comment).
      const items = valid
        .map((r) => {
          const m = s.rawMaterials.find((x) => x.id === r.materialId);
          const consumptionUnitId = m ? s.units.find((u) => u.shortName === m.unit)?.id : undefined;
          if (!consumptionUnitId) return null;
          return {
            raw_material_id: r.materialId,
            qty: r.qty,
            unit_id: consumptionUnitId,
            reason: r.reason || "Not specified",
            ...(r.notes ? { notes: r.notes } : {}),
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (items.length !== valid.length) {
        toast.error("One or more materials has no consumption unit configured", {
          description: "Recorded locally, but not synced to the server.",
        });
        return;
      }
      const run = async () => {
        try {
          await wastageApi.create(items);
          await value.loadWastageFromServer();
          await value.loadRawMaterialsFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Recorded locally but the backend sync failed",
          );
        }
      };
      void run();
    },
    upsertSemiFinished: (sf) => {
      if (!sf.components.length) {
        toast.error("Add at least one raw material to the recipe");
        return;
      }
      const unitId = s.units.find((u) => u.shortName === sf.unit)?.id;
      if (!unitId) {
        toast.error("Select a valid unit");
        return;
      }
      const payload = {
        name: sf.name,
        unit_id: Number(unitId),
        min_stock_level: !!sf.minStock,
        min_stock_qty: sf.minStock ?? 0,
        recipes: sf.components.map((c) => ({
          raw_material_id: Number(c.materialId),
          consumption_qty: c.qty,
        })),
      };
      // Ids for anything already loaded from the server are always
      // "sf-<backend id>" (see mapRawSFI) - a genuinely new draft's id is
      // "" (blankSemi), so this alone tells create from update apart.
      const backendId = sf.id ? Number(sf.id.replace("sf-", "")) : undefined;
      const run = async () => {
        try {
          if (!backendId) {
            await semiFinishedApi.create(payload);
          } else {
            await semiFinishedApi.update({ ...payload, id: backendId });
          }
          await value.loadSemiFinishedFromServer();
          toast.success("Semi-finished item saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save semi-finished item");
        }
      };
      void run();
    },
    removeSemiFinished: (id) => {
      const backendId = id ? Number(id.replace("sf-", "")) : undefined;
      patch((p) => ({ ...p, semiFinished: p.semiFinished.filter((x) => x.id !== id) }));
      toast.success("Semi-finished item deleted");
      if (!backendId) return;
      const run = async () => {
        try {
          await semiFinishedApi.remove(backendId);
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Deleted locally but the backend removal failed",
          );
        }
      };
      void run();
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

      const backendId = semiId ? Number(semiId.replace("sf-", "")) : undefined;
      if (!backendId) {
        toast.error("This item hasn't been saved to the server yet", {
          description: "Save it first, then record production - stock won't sync until then.",
        });
        return;
      }
      const run = async () => {
        try {
          await semiFinishedApi.recordProduction({
            semi_finished_item_id: backendId,
            produced_qty: qty,
            ...(notes ? { notes } : {}),
          });
          await value.loadSemiFinishedFromServer();
          await value.loadRawMaterialsFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Recorded locally but the backend sync failed",
          );
        }
      };
      void run();
    },
    upsertRecipe: (r) => {
      if (!r.menuItemId) {
        toast.error("Select a menu item for this recipe");
        return;
      }
      const base = (r.groups ?? []).find((g) => g.kind === "base");
      const rawMaterialData = (base?.lines ?? []).map((l) =>
        l.type === "raw"
          ? { raw_material_id: Number(l.refId), consumption_qty: l.qty }
          : { semi_finished_item_id: Number(l.refId), consumption_qty: l.qty },
      );
      if (!rawMaterialData.length) {
        toast.error("Add at least one ingredient to the recipe");
        return;
      }
      // Variant/addon groups have no backend equivalent yet (no real
      // Variant/Addon picker in this editor) - only the base group is
      // synced, so anything in the other groups is silently dropped on
      // the next reload. Warn rather than pretend it was saved.
      const hasExtraGroups = (r.groups ?? []).some((g) => g.kind !== "base" && g.lines.length);
      const menuId = Number(r.menuItemId);
      const isNew = !s.recipes.some((x) => x.id === `recipe-${menuId}`);
      const run = async () => {
        try {
          if (isNew) {
            await recipeApi.add({ menu_id: menuId, raw_material_data: rawMaterialData });
          } else {
            await recipeApi.edit({ menu_id: menuId, raw_material_data: rawMaterialData });
          }
          await value.loadRecipesFromServer();
          toast.success(
            hasExtraGroups
              ? "Recipe saved (variant/addon groups aren't synced to the backend)"
              : "Recipe saved",
            { description: r.itemName },
          );
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save recipe");
        }
      };
      void run();
    },
    removeRecipe: (id) => {
      const menuId = id.startsWith("recipe-") ? Number(id.replace("recipe-", "")) : undefined;
      patch((p) => ({ ...p, recipes: p.recipes.filter((x) => x.id !== id) }));
      toast.success("Recipe deleted");
      if (!menuId) return;
      const run = async () => {
        try {
          await recipeApi.remove(menuId);
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Deleted locally but the backend removal failed",
          );
        }
      };
      void run();
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
      const orderTypeMap: Record<OpsOrderType, "dinin" | "pickup"> = {
        "Dine-in": "dinin",
        Pickup: "pickup",
      };
      const greaterLessMap: Record<"always" | "greater" | "less", "1" | "2" | "3"> = {
        greater: "1",
        less: "2",
        always: "3",
      };
      const run = async () => {
        try {
          await hotelApi.updateServiceCharge({
            ...(s.serviceChargeBackendId ? { id: s.serviceChargeBackendId } : {}),
            active: rule.active,
            service_charge_type: rule.type === "percent" ? "percentage" : "fixed",
            service_charge_value: rule.value,
            calculation_on: rule.calculationOn,
            service_charge_automatic: rule.autoApply.map((t) => orderTypeMap[t]),
            calculation_on_tax: rule.taxOnCharge,
            greater_less: greaterLessMap[rule.condition],
            greater_less_amount: rule.threshold,
          });
          await value.loadServiceChargeFromServer();
          toast.success("Service charge rule saved");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save service charge rule");
        }
      };
      void run();
    },
    upsertTaxRule: (rule) => {
      if (rule.value <= 0) {
        toast.error("Tax value must be greater than 0", {
          description: "The backend rejects a zero or negative amount outright.",
        });
        return;
      }
      const isNew = !s.taxRules.some((t) => t.id === rule.id);
      const orderTypeMap: Record<OpsOrderType, "dinin" | "pickup"> = {
        "Dine-in": "dinin",
        Pickup: "pickup",
      };
      const payload = {
        tax_name: rule.name,
        tax_value: (rule.type === "fixed" ? "fix" : "pr") as "fix" | "pr",
        amount: rule.value,
        order_type: rule.orderTypes.map((t) => orderTypeMap[t]),
        active: rule.active,
        // menu_ids is item-scoped server-side, not category-scoped like
        // this app's menuCategoryIds - expanded to every item currently
        // in the selected categories. A category edited after this saves
        // won't retroactively update the tax's item list - this is a
        // point-in-time snapshot, not a live link (see mapRawTaxType's
        // own comment for the load-side half of this).
        menu_ids: s.menuItems
          .filter((m) => rule.menuCategoryIds.includes(m.categoryId))
          .map((m) => Number(m.id)),
        table_categ_ids: rule.tableCategoryIds.map(Number),
      };
      const run = async () => {
        try {
          if (isNew) {
            await taxApi.create(payload);
          } else {
            await taxApi.update({ ...payload, id: Number(rule.id) });
          }
          await value.loadTaxRulesFromServer();
          toast.success("Tax rule saved", { description: rule.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save tax rule");
        }
      };
      void run();
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
    setQrOnSettle: (on) => {
      patch((p) => ({ ...p, qrOnSettle: on }));
      const run = async () => {
        try {
          await hotelApi.updateQrOnSettle(on);
          toast.success(on ? "UPI QR will auto-open at settle" : "UPI QR auto-open disabled");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Saved locally, but this didn't sync",
          );
        }
      };
      void run();
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
      if (!promo.name.trim() || !promo.code.trim()) {
        toast.error("Enter a name and code");
        return;
      }
      const backendId = promo.id.startsWith("promo-")
        ? Number(promo.id.replace("promo-", ""))
        : undefined;
      const payload = {
        promo_code_name: promo.name,
        promo_code: promo.code,
        discount_type: (promo.type === "percent" ? "pr" : "fix") as "pr" | "fix",
        discount_value: promo.value,
      };
      const run = async () => {
        try {
          if (!backendId) {
            await promoCodeApi.create(payload);
          } else {
            await promoCodeApi.update({ ...payload, id: backendId, status: promo.active });
          }
          await value.loadPromoCodesFromServer();
          toast.success("Promo code saved", { description: promo.code });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save promo code");
        }
      };
      void run();
    },
    togglePromo: (id) => {
      const promo = s.promoCodes.find((x) => x.id === id);
      if (!promo) return;
      const backendId = id.startsWith("promo-") ? Number(id.replace("promo-", "")) : undefined;
      if (!backendId) return;
      // Deactivating here is one-way (see promoCodeApi's comment) - once
      // this succeeds the code drops out of every future load for good,
      // with no way back through this app.
      const run = async () => {
        try {
          await promoCodeApi.update({
            id: backendId,
            promo_code_name: promo.name,
            promo_code: promo.code,
            discount_type: promo.type === "percent" ? "pr" : "fix",
            discount_value: promo.value,
            status: !promo.active,
          });
          await value.loadPromoCodesFromServer();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update promo code");
        }
      };
      void run();
    },
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
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
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
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
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
      if (!name.trim() || qty <= 0) return;
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
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
    sendEBill: async (orderId) => {
      const o =
        s.orders.find((x) => x.id === orderId) ?? s.orderHistory.find((x) => x.id === orderId);
      if (!o?.customerPhone) {
        toast.error("No customer phone number attached to this order");
        return false;
      }
      if (!o.backendId) {
        toast.error("Order isn't synced with the server yet");
        return false;
      }
      // Local credit check for instant feedback before round-tripping -
      // the real gate is server-side too (sentEbill 400s once credit hits
      // 0), so this is just avoiding an unnecessary request, not the
      // source of truth.
      if (s.eBillCredit <= 0) {
        toast.error("E-bill credits exhausted", {
          description: "Top up e-bill credits from Operations to send digital bills again.",
        });
        return false;
      }
      try {
        await orderApi.sendEBill({ orderId: o.backendId, mobile: o.customerPhone });
        await value.loadEBillCreditFromServer();
        log(
          "E-Bill Sent",
          `Order #${o.orderNo}`,
          `${s.eBillCredit} credits`,
          `${Math.max(0, s.eBillCredit - 1)} credits`,
        );
        toast.success("Bill shared on WhatsApp", {
          description: `${o.customerPhone} · sent via WhatsApp`,
        });
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not send the e-bill");
        return false;
      }
    },
    printBill: async (orderId) => {
      const o =
        s.orders.find((x) => x.id === orderId) ?? s.orderHistory.find((x) => x.id === orderId);
      if (!o) return;
      if (!o.backendId) {
        toast.error("Order isn't synced with the server yet");
        return;
      }
      await doPrintBill(o, o.backendId);
    },
    printKot: async (orderId, round) => {
      const o =
        s.orders.find((x) => x.id === orderId) ?? s.orderHistory.find((x) => x.id === orderId);
      if (!o) return;
      await doPrintKot(o, round);
    },
    moveKot: async (orderId, round, destTableId) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      if (!o.backendId || !o.tableId) {
        toast.error("This KOT round hasn't been sent to the kitchen yet");
        return;
      }
      const destLabel = tableLabel(destTableId);
      try {
        await tableApi.moveKot({
          orderId: o.backendId,
          kotNumber: round,
          tableId1: Number(o.tableId),
          tableId2: Number(destTableId),
        });
        await value.loadTablesFromServer();
        log("KOT Moved", `Round ${round} · ${o.tableLabel}`, o.tableLabel, destLabel);
        toast.success(`KOT round ${round} moved to ${destLabel}`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not move this KOT round");
      }
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
