import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { computeBill, type EngineChargeRule, type EngineTax } from "@/lib/billEngine";
import QRCode from "qrcode";

import { OFFLINE_SETTINGS, ROLE_PERMISSION_DEFAULTS, ROLE_SPECIAL_DEFAULTS } from "./data";
import { nowStamp, realToday, isoToDMY } from "./format";
import {
  ApiError,
  API_BASE_URL,
  tableApi,
  menuApi,
  paymentModeApi,
  type RawPaymentMode,
  paymentModeDefaultApi,
  type RawPaymentModeDefault,
  invoiceFormateApi,
  type RawInvoiceFormate,
  kotFormatApi,
  type RawKotFormate,
  billChargeApi,
  type RawBillChargeRule,
  notificationSettingApi,
  type RawNotificationSetting,
  rolePermissionApi,
  type RawRolePermissionDefault,
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
  requisitionApi,
  type RawRequisition,
  editSettledOrderApi,
  refundDueApi,
  type RawRefundDueOrder,
  stockInHandApi,
  wastageApi,
  semiFinishedApi,
  recipeApi,
  expenseHeadApi,
  expenseApi,
  cashSessionApi,
  orderHistoryApi,
  reservationApi,
  type RawReservation,
  queueApi,
  type RawQueueEntry,
  auditLogApi,
  promoCodeApi,
  localPrintApi,
  localServerApi,
  type RawLocalServerStatus,
  type RawOrderDetail,
  type RawCashSession,
  type RawCashMovement,
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
  type RawMenuCatalog,
  type RawMenuItem,
  type RawMenuItemVariant,
  type RawMenuItemAddonGroup,
  type RawVariant,
  type RawAddonGroup,
  type RawHotelUser,
  setStoredAuthToken,
  setPermissionChecker,
} from "@/lib/api";
import type { KdsTicketPayload } from "@/lib/kdsSocket";
import type {
  AddonGroup,
  AppNotification,
  BillChargeRule,
  DueBill,
  RefundDue,
  InvoiceFormat,
  InvoiceLine,
  InvoiceLineContent,
  KotFormat,
  KotLine,
  KotLineContent,
  Kitchen,
  PaymentModeConfig,
  PaymentModeDefaultRule,
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
  AuditLog,
  CashMovement,
  CashSession,
  ConnectionState,
  Customer,
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
  QueueEntry,
  QueueStatus,
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
  TableCategory,
  TableStatus,
  TableGridView,
  User,
  VariantOption,
  Wastage,
} from "./types";

let seq = 1000;
const uid = (p: string) => `${p}-${++seq}`;

// A line's kotRound used to be assigned at ADD time as `kotRounds + 1` -
// "whichever round fires next gets this item." That worked as long as a
// KOT send always meant "everything currently pending," but item-wise KOT
// sending (generateKot's optional `lineIds`) breaks that: if only SOME of
// the pending lines get sent, the rest need to stay recognizably "not sent
// yet" under whatever round number actually ends up firing them later,
// which isn't knowable at add time. UNSENT_ROUND sidesteps that by not
// assigning a real round at all until a line is actually included in a
// successful send - every existing `kotRound <= kotRounds` / `kotRound >
// kotRounds` check elsewhere in this file keeps working unmodified, since
// Infinity is always ">" any real round count and never "<=" one.
const UNSENT_ROUND = Infinity;

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
  /** Mirrors the exe's own /health `registered` (ServerGate keeps it current) -
   * never this browser's storage. */
  deviceRegistered: boolean;
  /** Restaurant name the exe reports, for screens shown before sign-in. */
  serverHotelName: string | null;
  currentUserId: string;
  /** The signed-in user's own record and permissions, from GET /getUserAccess.
   * Nothing permission-dependent renders until this has loaded. */
  sessionUser: User | null;
  sessionReady: boolean;
  /** Real restaurant details from GET /singleHotel. */
  restaurant: { id: number; name: string; address: string; gstin: string } | null;
  tables: RestaurantTable[];
  tableCategories: TableCategory[];
  orders: Order[];
  /** Real settled-order history synced from the backend (last ~90 days),
   * separate from `orders` - which doubles as the live working set for
   * order-taking (held/running carts being built) and must never be
   * replaced wholesale by a server reload. Dashboard/Reports read this
   * for historical sales figures instead of `orders`. */
  orderHistory: Order[];
  /** Server pagination state for `orderHistory` - see
   * loadOrderHistoryFromServer's own comment. `orderHistory` only ever
   * holds the current page's rows, not the whole history. */
  orderHistoryPage: number;
  orderHistoryTotalPages: number;
  orderHistoryTotal: number;
  kots: Kot[];
  menuItems: MenuItem[];
  menuCategories: MenuCategory[];
  variantMasters: VariantOption[];
  addonGroups: AddonGroup[];
  users: User[];
  customers: Customer[];
  reservations: Reservation[];
  queue: QueueEntry[];
  /** Full-range set (Dashboard/Expense Heads/the expense report all need
   * every entry in whatever range they're looking at, not one page of it -
   * loaded via expenseApi's own `all: true` mode, see loadExpensesFromServer). */
  expenses: Expense[];
  /** The Expense Entries screen's own paginated view - a genuinely
   * different concern from `expenses` above (one page of rows for
   * whatever filters are currently set), populated by
   * loadExpenseEntriesPage, not loadExpensesFromServer. */
  expenseEntriesPageRows: Expense[];
  expenseEntriesPage: number;
  expenseEntriesTotalPages: number;
  expenseEntriesTotal: number;
  /** Aggregate totals for the CURRENT filters (not just the visible page) -
   * same figures controller/expense.js's allEntry always computes over the
   * full filtered set regardless of page. */
  expenseEntriesTotalMoneyIn: number;
  expenseEntriesTotalExpense: number;
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
  printers: Printer[];
  // Real local-server/sync status (billerpe-local-exe's GET
  // /localServerStatus - see api.ts's RawLocalServerStatus) - null until
  // loadServerStatusFromServer's first successful call. Replaced the old
  // devices/syncItems mock arrays (seed-only, no backend of any kind ever
  // existed for a per-device list or a per-record sync queue - the real
  // architecture is one active server per hotel with a periodic full
  // re-check, not either of those shapes).
  localServerStatus: RawLocalServerStatus | null;
  notifications: AppNotification[];
  notificationSettings: NotificationSetting[];
  auditLogs: AuditLog[];
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
  /** Dynamic KOT format (Task 1) - same header/footer-lines shape as
   * invoiceFormat, loaded/saved separately since it's a different backend
   * table (hms_kot_formate_mst) with a different content vocabulary. */
  kotFormat: KotFormat;
  /** RestaurantSetting.qr_code_open_on_settle - auto-shows a scannable UPI
   * QR in the settle dialog when UPI is selected. */
  qrOnSettle: boolean;
  promoCodes: PromoCode[];
  paymentModes: PaymentModeConfig[];
  paymentModeDefaults: PaymentModeDefaultRule[];
  kitchens: Kitchen[];
  menus: Menu[];
  displayMode: "Keyboard" | "Touch";
  menuImages: boolean;
  dueBills: DueBill[];
  refundDueOrders: RefundDue[];
  eBillCredit: number;
  tableGridView: TableGridView;
  keyboardOnly: boolean;
  defaultOrderType: OrderType;
  rolePermissions: Record<Role, RolePermissions>;
  roleSpecialPermissions: Record<Role, Partial<Record<SpecialPermission, boolean>>>;
}

// Neutral starting values while the exe's real settings load - never demo
// data. A charge rule is off, the invoice has no GSTIN/FSSAI/UPI until the
// restaurant's real ones arrive; the header/footer layout is only the slot
// order the settings screen starts from.
const CHARGE_OFF = {
  active: false,
  type: "fixed" as const,
  value: 0,
  calculationOn: "core" as const,
  autoApply: [],
  taxOnCharge: false,
  condition: "always" as const,
  threshold: 0,
};

const EMPTY_INVOICE_FORMAT: State["invoiceFormat"] = {
  gstCalculation: true,
  gstNo: "",
  fssaiNo: "",
  multiLanguage: false,
  upiId: "",
  header: [
    { id: "h1", content: "logo", fontSize: 14 },
    { id: "h2", content: "outlet-name", fontSize: 16 },
    { id: "h3", content: "address", fontSize: 11 },
    { id: "h4", content: "gstin", fontSize: 11 },
    { id: "h5", content: "fssai", fontSize: 10 },
  ],
  footer: [{ id: "f1", content: "upi-qr", fontSize: 12 }],
  unconfirmed: { isTokenOn: false, billWithKot: false, billWithToken: false, saveBehaviour: false },
};

const DEFAULT_KOT_FORMAT: State["kotFormat"] = {
  header: [
    { id: "kh1", content: "outlet-name", fontSize: 14 },
    { id: "kh2", content: "order-type", fontSize: 12 },
    { id: "kh3", content: "kot-number", fontSize: 12 },
    { id: "kh4", content: "token-number", fontSize: 16 },
    { id: "kh5", content: "customer-details", fontSize: 11 },
  ],
  footer: [{ id: "kf1", content: "billerpe-branding", fontSize: 10 }],
};

/** Stand-in before the signed-in user's record loads. Has no permissions
 * (can() is false until sessionUser exists), so nothing is unlocked by it. */
const NO_USER: User = {
  id: "",
  name: "",
  role: "Cashier",
  mobile: "",
  email: "",
  status: "Active",
  pin: "",
};

const initialState: State = {
  authed: false,
  deviceRegistered: false,
  currentUserId: "",
  sessionUser: null,
  sessionReady: false,
  restaurant: null,
  serverHotelName: null,
  tables: [],
  tableCategories: [],
  // Unlike tables/menu/etc., loadTablesFromServer never fully replaces
  // `orders` (it only appends real live orders it reconstructs, to avoid
  // ever clobbering an in-progress local edit) - so seed demo orders here
  // would otherwise sit forever, mixed in with real data. Starting empty
  // means every order in this list, once loaded, is real.
  orders: [],
  orderHistory: [],
  orderHistoryPage: 1,
  orderHistoryTotalPages: 1,
  orderHistoryTotal: 0,
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
  menuItems: [],
  menuCategories: [],
  variantMasters: [],
  addonGroups: [],
  users: [],
  customers: [],
  reservations: [],
  queue: [],
  expenses: [],
  expenseEntriesPageRows: [],
  expenseEntriesPage: 1,
  expenseEntriesTotalPages: 1,
  expenseEntriesTotal: 0,
  expenseEntriesTotalMoneyIn: 0,
  expenseEntriesTotalExpense: 0,
  expenseHeads: [],
  rawMaterials: [],
  recipes: [],
  semiFinished: [],
  suppliers: [],
  purchaseOrders: [],
  wastages: [],
  units: [],
  stockMovements: [],
  stockAdjustments: [],
  productionRuns: [],
  requisitions: [],
  // Same seed-pollution issue as orders/orderHistory (see their own
  // comment) - loadCashSessionsFromServer fully replaces this from the
  // real backend now that one exists, so starting empty means every
  // session shown, once loaded, is real.
  cashSessions: [],
  printers: [],
  localServerStatus: null,
  notifications: [],
  notificationSettings: [],
  auditLogs: [],
  connection: "online",
  maxOfflineDays: OFFLINE_SETTINGS.maxOfflineDays,
  serviceCharge: { ...CHARGE_OFF },
  serviceChargeBackendId: null,
  deliveryChargeRule: { ...CHARGE_OFF },
  packagingChargeRule: { ...CHARGE_OFF },
  taxRules: [],
  invoiceFormat: EMPTY_INVOICE_FORMAT,
  kotFormat: DEFAULT_KOT_FORMAT,
  qrOnSettle: false,
  promoCodes: [],
  paymentModes: [],
  paymentModeDefaults: [],
  kitchens: [],
  menus: [],
  displayMode: "Touch",
  menuImages: true,
  dueBills: [],
  refundDueOrders: [],
  eBillCredit: 0,
  tableGridView: "Tabs",
  keyboardOnly: false,
  defaultOrderType: "Dine In",
  rolePermissions: ROLE_PERMISSION_DEFAULTS,
  roleSpecialPermissions: ROLE_SPECIAL_DEFAULTS,
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
  /** Signed delta applied to reach `grand` from the raw paise-precision sum - positive means rounded up, negative means rounded down. */
  roundOff: number;
  grand: number;
}

export type BillSettings = Pick<
  State,
  "serviceCharge" | "deliveryChargeRule" | "packagingChargeRule" | "taxRules" | "invoiceFormat"
> & {
  /** Optional - lets tax rules scoped to a table category resolve the
   * order's table. The whole State satisfies this (it has `tables`). */
  tables?: Pick<RestaurantTable, "id" | "categoryId">[];
  /** Optional - lets tax rules scoped to menu categories resolve which
   * lines they apply to. The whole State satisfies this too. */
  menuItems?: Pick<MenuItem, "id" | "categoryId">[];
};

const OPS_TYPE_TO_ENGINE: Record<OpsOrderType, string> = { "Dine-in": "dinin", Pickup: "pickup" };

function toEngineCharge(rule: ServiceChargeRule | undefined): EngineChargeRule | null {
  if (!rule) return null;
  return {
    active: rule.active,
    type: rule.type === "percent" ? "percentage" : "fixed",
    value: rule.value,
    calculationOn: rule.calculationOn,
    orderTypes: (rule.autoApply ?? []).map((t) => OPS_TYPE_TO_ENGINE[t] ?? String(t)),
    taxOnCharge: rule.taxOnCharge,
    condition: rule.condition === "greater" ? "1" : rule.condition === "less" ? "2" : "3",
    threshold: rule.threshold,
  };
}

function toEngineTax(rule: TaxRule, menuItems: BillSettings["menuItems"]): EngineTax {
  // TaxRule is category-scoped in this app while the server stores item
  // ids (see mapRawTaxType) - expand the categories back to item ids so
  // the engine applies the same per-line filter the exe does.
  const menuIds =
    rule.menuCategoryIds.length && menuItems
      ? menuItems.filter((m) => rule.menuCategoryIds.includes(m.categoryId)).map((m) => m.id)
      : [];
  return {
    id: rule.id,
    name: rule.name,
    type: rule.type === "fixed" ? "fix" : "pr",
    rate: rule.value,
    active: rule.active,
    orderTypes: (rule.orderTypes ?? []).map((t) => OPS_TYPE_TO_ENGINE[t] ?? String(t)),
    tableCategIds: rule.tableCategoryIds ?? [],
    menuIds,
  };
}

/** Single bill-calculation engine - a thin adapter over the shared
 * computeBill() (src/lib/billEngine.ts), which is a literal port of the
 * exe's helpers/billEngine.js. The exe persists the authoritative figures
 * on every mutation; this recomputes the same way so a draft round being
 * built locally previews exactly what the exe will store. */
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
      roundOff: 0,
      grand: 0,
    };
  }
  const lines = order.itemised
    ? order.lines.map((l) => ({
        qty: l.qty,
        price: l.price,
        addons: (l.addons ?? []).map((a) => ({ price: a.price, qty: a.qty })),
        menuId: l.itemId,
      }))
    : [{ qty: 1, price: order.fallbackTotal ?? 0 }];
  const discount = order.discount
    ? order.discount.type === "percent"
      ? { type: "pr" as const, value: order.discount.value ?? 0 }
      : { type: "fix" as const, value: order.discount.amount }
    : null;
  const tableCategId = order.tableId
    ? (settings.tables?.find((t) => t.id === order.tableId)?.categoryId ?? null)
    : null;
  const totals = computeBill({
    lines,
    orderType: order.type === "Dine In" ? "dinin" : "pickup",
    tableCategId,
    discount,
    packagingOverride: order.packagingCharge,
    config: {
      gstOn: settings.invoiceFormat.gstCalculation,
      taxTypes: settings.taxRules.map((r) => toEngineTax(r, settings.menuItems)),
      serviceCharge: toEngineCharge(settings.serviceCharge),
      packagingRule: toEngineCharge(settings.packagingChargeRule),
    },
  });
  return {
    subtotal: totals.subtotal,
    discount: totals.discount,
    service: totals.service,
    delivery: totals.delivery,
    packaging: totals.packaging,
    taxLines: totals.taxLines.map((t) => ({ id: String(t.id), name: t.name, amount: t.amount })),
    tax: totals.tax,
    roundOff: totals.roundOff,
    grand: totals.grandAmount,
  };
}

// The discount INPUT (type + value) and any explicit packaging override,
// as the exe's helpers/orderTotals.js reads them off every cart payload -
// the exe recomputes everything else itself from the persisted lines, so
// the other cart figures (gst/grandAmount/...) are preview-only.
function discountPayload(o: Order, totals: BillTotals) {
  return {
    discount_reason: o.discount?.label ?? "",
    discount_type: (o.discount?.type === "percent" ? "pr" : "fix") as "fix" | "pr",
    discount_value: o.discount?.type === "percent" ? (o.discount.value ?? 0) : totals.discount,
    ...(o.packagingCharge !== undefined ? { packaging_override: o.packagingCharge } : {}),
  };
}

// The real `cart.taxes` payload holdOrder/kotOrder/adminOrder/AdminOrder
// (uat-backend-v2/controller/kto.js) need to actually persist OrderTax
// rows - every call site here used to hardcode `taxes: []` (api.ts's own
// comment called this out: "empty until Tax Configuration is wired"), so
// no tax ever got saved against an order at all, regardless of active tax
// rules. That's invisible on a printed/PDF bill (doPrintBill recomputes
// taxLines fresh from live tax-rule config, never reads persisted
// OrderTax back), but the cloud-rendered customer e-bill webview
// (getBillViewData) has no access to this app's tax-rule config and reads
// only the persisted OrderTax rows - so this was the reason taxes never
// showed there. `id` must be the real numeric TaxType id (TaxRule.id,
// stringified from the server row) for the FK to resolve; `tax_type`/
// `tax`/`tax_value` are inconsistently read between addOrderTax (new
// order) and updateOrderTax (existing order) server-side - sending all
// three covers either path without needing to fix that backend
// inconsistency here.
function buildCartTaxes(totals: BillTotals, taxRules: TaxRule[]) {
  return totals.taxLines.map((tx) => {
    const rule = taxRules.find((r) => r.id === tx.id);
    return {
      id: Number(tx.id),
      amount: tx.amount,
      tax_type: rule?.type === "percent" ? "pr" : "fix",
      tax_value: rule?.value ?? tx.amount,
      tax: rule?.value ?? tx.amount,
    };
  });
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
  /** Clears cached "this device is registered" state (both in-memory and
   * `billerpe.session`) without a full page reload - for when the exe's own
   * `/health` reports `registered:false` while this browser still thinks
   * it's registered (a fresh install/reinstall wiped the exe's local DB -
   * see login.tsx's boot-time reconciliation). Drops any cached userId too;
   * re-registering is a fresh start, not a resume. */
  resetDeviceRegistration: () => void;
  /** Called by ServerGate with what the exe's /health reports. */
  applyServerIdentity: (registered: boolean, hotelName: string | null) => void;
  /** Loads the signed-in user's own record and the role permissions, then
   * marks the session ready. False if the user could not be resolved. */
  loadSession: () => Promise<boolean>;
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
  /** Returns false if blocked by the already-sent-to-kitchen permission
   * guard (see removeLine's own comment - same reasoning applies here). */
  changeQty: (orderId: string, lineId: string, delta: number, module: BillingModule) => boolean;
  setLineQty: (orderId: string, lineId: string, qty: number, module: BillingModule) => void;
  setLineNote: (orderId: string, lineId: string, note: string) => void;
  setLinePrice: (orderId: string, lineId: string, price: number) => void;
  setLineAddons: (
    orderId: string,
    lineId: string,
    addons: NonNullable<OrderLine["addons"]>,
  ) => void;
  /** Returns false if blocked by the already-sent-to-kitchen permission
   * guard (nothing removed), true otherwise - callers that need to react
   * to the order becoming empty (e.g. navigating away) can't tell those
   * two outcomes apart from a void return. */
  removeLine: (orderId: string, lineId: string, module: BillingModule, reason?: string) => boolean;

  holdOrder: (orderId: string) => void;
  saveOrder: (orderId: string) => void;
  /** Returns false if blocked by the orders.deleteOrder special permission
   * - only actually gates when the order has at least one real fired KOT
   * line; an empty/draft order cancels freely regardless of role. */
  cancelOrder: (orderId: string, reason?: string) => boolean;
  /** Silently frees the table/drops the draft if it's still empty - see
   * freeEmptyDraft's own comment on why this stays quiet unlike cancelOrder. */
  freeIfEmpty: (orderId: string) => void;
  removeOrder: (id: string) => void;
  removeOrders: (ids: string[]) => void;
  remakeOrderSequence: () => void;
  generateKot: (orderId: string, options?: { print?: boolean; lineIds?: string[] }) => void;
  /** `type`/`value` are the ORIGINAL input (e.g. "percent", 10) - stored so
   * orderTotals can keep recomputing the discount amount as the order's
   * subtotal changes, rather than freezing it at today's subtotal. Pass
   * `type: "flat"` (value === the flat amount) for a flat discount or a
   * promo code that isn't percent-based. */
  applyDiscount: (orderId: string, label: string, type: "percent" | "flat", value: number) => void;
  setCustomer: (
    orderId: string,
    name: string,
    phone: string,
    extra?: { address?: string; gstin?: string },
  ) => void;
  setCharges: (orderId: string, packaging: number) => void;
  /** Resolves { ok: true, backendId } on success (ok:false on any failure/
   * guard) - the backendId is handed back explicitly rather than read off
   * `s.orders` afterward, since `s` is this render's stale snapshot and
   * won't reflect the patch() this call itself just made (see doPrintBill's
   * own comment on the same gotcha). Lets sendEBill auto-generate the bill
   * first without a second, separately-stale order lookup. */
  generateBill: (
    orderId: string,
    options?: { print?: boolean },
  ) => Promise<{ ok: boolean; backendId?: number }>;
  /** tip is Dine In only (settleBills' own contract - Pickup settles
   * through adminOrder instead, a different call this doesn't carry tip
   * into) and deliberately separate from `payments`: it's not part of the
   * cash+upi+card+due split that must sum to the bill total, an extra
   * amount on top instead. See model/order.js's own comment (uat-backend-v2)
   * on why. */
  settleOrder: (orderId: string, payments: PaymentSplit[], tip?: number) => void;
  /** orders.reopenSettled - copies a settled order (from orderHistory) into
   * a local, editable draft in `orders` and returns its local id, or
   * undefined if the order/permission isn't there. Caller navigates to
   * that id's order screen. */
  startEditSettledOrder: (orderId: string) => string | undefined;
  /** Rebuilds an "edit-<backendId>" copy from the exe (after a browser
   * refresh on the edit screen). Resolves false when it can't. */
  resumeEditSettledOrder: (backendId: number) => Promise<boolean>;
  /** Resolves true once saved. `payments` is how the biller says the
   * full edited bill was paid. */
  saveSettledOrderEdits: (localOrderId: string, payments?: PaymentSplit[]) => Promise<boolean>;
  cancelEditSettledOrder: (localOrderId: string) => void;
  loadRefundDueOrdersFromServer: () => Promise<void>;
  settleRefundDue: (id: string) => void;
  mergeTables: (sourceTableId: string, destTableId: string) => void;
  moveKot: (orderId: string, round: number, destTableId: string) => Promise<void>;
  transferTable: (orderId: string, destTableId: string) => void;
  /* kds */
  setKotStatus: (kotId: string, status: Kot["status"]) => void;
  /** Kitchen can't make an item (e.g. out of stock) - marks the KOT
   * Cancelled and notifies front-of-house, who still has to separately
   * remove it from the actual bill (KDS state is its own local board, not
   * tied to real order/billing state - see setKotStatus's own comment). */
  rejectKot: (kotId: string, reason?: string) => void;
  receiveKdsTicket: (payload: KdsTicketPayload) => void;
  receiveKdsOrderComplete: (backendOrderId: number) => void;
  /* reservations */
  loadReservationsFromServer: () => Promise<void>;
  createReservation: (r: {
    customerName: string;
    mobile: string;
    email: string;
    party: number;
    tableIds: string[];
    date: string;
    startTime: string;
    endTime: string;
    totalAmount: number;
    advance: number;
    gstNo: string;
  }) => Promise<boolean>;
  updateReservation: (
    id: string,
    r: {
      customerName: string;
      mobile: string;
      email: string;
      party: number;
      tableIds: string[];
      date: string;
      startTime: string;
      endTime: string;
      totalAmount: number;
      advance: number;
      gstNo: string;
    },
  ) => Promise<boolean>;
  cancelReservation: (id: string) => Promise<void>;
  /* waitlist queue */
  loadQueueFromServer: () => Promise<void>;
  addToQueue: (name: string, mobile: string, partySize: number) => Promise<void>;
  seatQueueEntry: (id: string) => Promise<void>;
  markQueueEntryNoShow: (id: string) => Promise<void>;
  cancelQueueEntry: (id: string) => Promise<void>;
  callQueueEntry: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  /* cash */
  openSession: (float: number) => void;
  addCash: (amount: number, reason: string) => void;
  withdrawCash: (amount: number, reason: string) => boolean;
  attachExpense: (headId: string, amount: number, note: string, date?: string) => Promise<boolean>;
  closeSession: (counted: number, reason: string) => void;
  sessionBalance: () => number;
  openSessionRecord: () => CashSession | undefined;
  loadCashSessionsFromServer: () => Promise<void>;
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
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  upsertMenuCategory: (c: MenuCategory) => void;
  removeMenuCategory: (id: string) => void;
  removeMenuCategories: (ids: string[]) => void;
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
  refreshOrderFromServer: (orderId: string) => Promise<void>;
  reconcileVanishedOrders: (backendIds: number[]) => Promise<void>;
  upsertUser: (u: User, newPassword?: string) => void;
  loadUsersFromServer: () => Promise<void>;
  loadInvoiceFormatFromServer: () => Promise<void>;
  loadKotFormatFromServer: () => Promise<void>;
  loadDueBillsFromServer: () => Promise<void>;
  loadCustomersFromServer: () => Promise<void>;
  loadKitchensFromServer: () => Promise<void>;
  loadPrintersFromServer: () => Promise<void>;
  loadTaxRulesFromServer: () => Promise<void>;
  loadPaymentModesFromServer: () => Promise<void>;
  loadPaymentModeDefaultsFromServer: () => Promise<void>;
  loadBillChargeRulesFromServer: () => Promise<void>;
  loadNotificationSettingsFromServer: () => Promise<void>;
  loadRolePermissionsFromServer: () => Promise<void>;
  loadServiceChargeFromServer: () => Promise<void>;
  loadUnitsFromServer: () => Promise<void>;
  loadRawMaterialsFromServer: () => Promise<void>;
  loadSuppliersFromServer: () => Promise<void>;
  loadPurchaseOrdersFromServer: () => Promise<void>;
  loadRequisitionsFromServer: () => Promise<void>;
  loadWastageFromServer: () => Promise<void>;
  loadSemiFinishedFromServer: () => Promise<void>;
  loadRecipesFromServer: () => Promise<void>;
  loadExpenseHeadsFromServer: () => Promise<void>;
  /** Full-range load for Dashboard/Expense Heads/the expense report - NOT
   * the paginated entries screen, see loadExpenseEntriesPage for that. */
  loadExpensesFromServer: () => Promise<void>;
  /** The Expense Entries screen's own paginated + filtered load - populates
   * expenseEntriesPageRows/expenseEntriesPage/etc, not `expenses`. */
  loadExpenseEntriesPage: (params: {
    from: string;
    to: string;
    page: number;
    limit: number;
    expenseHeadId?: string;
    paymentMode?: Expense["mode"];
    userId?: string;
  }) => Promise<void>;
  /** Every entry matching the given filters, no pagination - for CSV
   * export ONLY. Not stored in state; the caller builds the file directly
   * from the returned array. */
  loadAllExpensesForExport: (params: {
    from: string;
    to: string;
    expenseHeadId?: string;
    paymentMode?: Expense["mode"];
    userId?: string;
  }) => Promise<Expense[]>;
  loadOrderHistoryFromServer: (page?: number, search?: string) => Promise<void>;
  loadPromoCodesFromServer: () => Promise<void>;
  loadEBillCreditFromServer: () => Promise<void>;
  upsertExpense: (e: Expense, date?: string) => Promise<boolean>;
  deleteExpense: (id: string, reason?: string) => Promise<boolean>;
  upsertExpenseHead: (h: ExpenseHead) => Promise<boolean>;
  removeExpenseHead: (id: string) => Promise<void>;
  removeExpenseHeads: (ids: string[]) => Promise<void>;
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
  loadServerStatusFromServer: () => Promise<void>;
  forceSyncServer: () => Promise<void>;
  upsertPrinter: (p: Printer) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleNotificationSetting: (trigger: string, channel: "whatsapp" | "sms" | "inApp") => void;
  /* operations */
  setDeliveryChargeRule: (rule: BillChargeRule) => void;
  setPackagingChargeRule: (rule: BillChargeRule) => void;
  setServiceCharge: (rule: ServiceChargeRule) => void;
  upsertTaxRule: (rule: TaxRule) => void;
  removeTaxRule: (id: string) => void;
  toggleTaxRule: (id: string) => void;
  setInvoiceFormat: (fmt: InvoiceFormat) => void;
  setKotFormat: (fmt: KotFormat) => void;
  /** Resolves to the new logoUrl (undefined on failure) - InvoiceFormatSection
   * needs this back directly to refresh its own local draft copy of
   * invoiceFormat, which this action's patch() alone doesn't reach. */
  uploadHotelLogo: (file: File) => Promise<string | undefined>;
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
  saveDefaultPaymentMode: (
    orderType: OpsOrderType,
    tableCategoryId: string | undefined,
    paymentModeId: string,
  ) => void;
  removeDefaultPaymentMode: (id: string) => void;
  /** Table-category override (if one exists for `tableCategoryId`) wins over
   * the order type's own base default, which wins over the first active
   * mode - same fallback chain PaymentSplitEditor's "Add payment mode"
   * button already had ("Cash" as the last resort), just with real
   * defaults inserted ahead of it now. */
  resolveDefaultPaymentMode: (orderType: OpsOrderType, tableCategoryId?: string) => string;
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
  H: "Hold",
  B: "Reserved",
};

function mapRawCategory(c: RawTableCategory): TableCategory {
  return { id: String(c.id), name: c.table_catag_nm, sortOrder: c.rank ?? c.id };
}

function mapRawTable(t: RawTable): RestaurantTable {
  return {
    id: String(t.id),
    name: t.table_name,
    categoryId: String(t.table_catag_id),
    seats: t.capacity ?? 0,
    status: TABLE_STATUS_MAP[t.table_status],
    reservedGuestName: t.reserved_name || undefined,
    reservedGuestPhone: t.reserved_number || undefined,
    qrVersion: t.qr_version,
  };
}

// `table_name` entries can come back null if the join finds no matching
// table row (e.g. one of the booked tables was since deleted) - filtered
// out rather than rendering a blank row.
function mapRawReservation(raw: RawReservation): Reservation {
  return {
    id: String(raw.booking_id),
    customerName: raw.name,
    mobile: raw.number,
    email: raw.email || undefined,
    party: raw.no_of_person,
    tables: (raw.table_name || [])
      .filter((t): t is { id: number; table_name: string } => !!t)
      .map((t) => ({ id: String(t.id), label: t.table_name })),
    date: raw.booking_date,
    startTime: raw.start_time,
    endTime: raw.end_time,
    totalAmount: raw.totalAmount,
    advance: raw.advance,
    gstNo: raw.gst_no || undefined,
  };
}

const QUEUE_STATUS_FROM_RAW: Record<RawQueueEntry["status"], QueueStatus> = {
  waiting: "Waiting",
  seated: "Seated",
  no_show: "No Show",
  cancelled: "Cancelled",
};

function mapRawQueueEntry(raw: RawQueueEntry): QueueEntry {
  return {
    id: `q-${raw.id}`,
    backendId: raw.id,
    name: raw.name,
    mobile: raw.mobile,
    partySize: raw.party_size,
    status: QUEUE_STATUS_FROM_RAW[raw.status],
    joinedAt: raw.joined_at,
    calledAt: raw.called_at || undefined,
    resolvedAt: raw.resolved_at || undefined,
    notes: raw.notes || undefined,
  };
}

// Backend has no concept of multiple menu catalogues - every category/item/
// variant/addon it returns belongs to the whole hotel. Server-loaded rows
// get tagged with whichever menu is currently marked default so the
// existing menu-scoped UI keeps working, but switching menus after real
// data has loaded won't filter anything - there's only ever one real
// catalogue behind it.
const DIETARY_VALUES: MenuDietary[] = ["Regular Veg", "Jain", "Non-Veg", "Vegan", "Swaminarayan"];

// Defensive the same way mock/store.tsx's own kitchen-setting mapper is
// (model/kitchen.js's JSON columns are confirmed live to sometimes come
// back as JSON-encoded strings, not already-parsed arrays) - unlike that
// mapper's order_type field, this one is a brand-new column with no other
// consumer dictating its format, so it round-trips this app's own
// OpsOrderType strings ("Dine-in"/"Pickup") verbatim rather than the
// "dinin"/"pickup" convention kitchen.js happens to use.
function parseJsonArray(v: unknown): string[] {
  try {
    const arr = typeof v === "string" ? JSON.parse(v || "[]") : Array.isArray(v) ? v : [];
    return (arr as unknown[]).map((x) => String(x));
  } catch {
    return [];
  }
}

function mapRawMenuCatalog(m: RawMenuCatalog): Menu {
  return {
    id: String(m.id),
    name: m.name,
    isDefault: m.is_default,
    tableCategoryIds: parseJsonArray(m.table_category_ids),
    orderTypes: parseJsonArray(m.order_types) as OpsOrderType[],
  };
}

function mapRawPaymentMode(m: RawPaymentMode): PaymentModeConfig {
  return {
    id: String(m.id),
    name: m.name,
    active: m.active,
    deletable: m.deletable,
  };
}

const RAW_ORDER_TYPE_TO_OPS: Record<RawPaymentModeDefault["order_type"], OpsOrderType> = {
  dinin: "Dine-in",
  pickup: "Pickup",
};
const OPS_ORDER_TYPE_TO_RAW: Record<OpsOrderType, RawPaymentModeDefault["order_type"]> = {
  "Dine-in": "dinin",
  Pickup: "pickup",
};

function mapRawPaymentModeDefault(d: RawPaymentModeDefault): PaymentModeDefaultRule {
  return {
    id: String(d.id),
    orderType: RAW_ORDER_TYPE_TO_OPS[d.order_type],
    tableCategoryId: d.table_categ_id != null ? String(d.table_categ_id) : undefined,
    paymentModeId: String(d.payment_mode_id),
  };
}

// controller/kto.js#getHearderAndFooterDataBillView's own keyword
// vocabulary for a headerLineN/footerLineN slot's stored value - anything
// NOT in this map is treated as the literal text to print, matching that
// function's own fallback branch (`else { data = el.value }`) exactly, so
// a raw custom-text line round-trips correctly with no keyword collision.
const INVOICE_CONTENT_TO_KEYWORD: Record<Exclude<InvoiceLineContent, "text">, string> = {
  logo: "hotel_logo",
  "outlet-name": "hotel_name",
  address: "address",
  gstin: "gst_no",
  fssai: "fssai_no",
  "upi-qr": "upiId",
  marketing: "marketing_text",
};
const KEYWORD_TO_INVOICE_CONTENT: Partial<Record<string, InvoiceLineContent>> = Object.fromEntries(
  Object.entries(INVOICE_CONTENT_TO_KEYWORD).map(([content, keyword]) => [keyword, content]),
) as Partial<Record<string, InvoiceLineContent>>;

// hms_invoice_formate_mst has exactly 10 fixed header/footer slots
// (headerLine1..10/footerLine1..10, model/invoiceFormate.js) - not a
// flexible list, so this app's own header/footer arrays have to be capped
// here too (billing.tsx's "Add header/footer line" button enforces the
// same cap on the way in, so this is a safety net, not the only guard).
const INVOICE_LINE_SLOTS = 10;

function mapRawInvoiceLines(raw: RawInvoiceFormate, slot: "header" | "footer"): InvoiceLine[] {
  if (!raw) return [];
  const linePrefix = slot === "header" ? "headerLine" : "footerLine";
  const fontPrefix = slot === "header" ? "fontH" : "fontF";
  const lines: InvoiceLine[] = [];
  for (let i = 1; i <= INVOICE_LINE_SLOTS; i++) {
    const rawValue = raw[`${linePrefix}${i}`];
    const value = rawValue == null ? "" : String(rawValue).trim();
    if (!value) continue;
    const fontRaw = raw[`${fontPrefix}${i}`];
    const fontSize = fontRaw ? parseInt(String(fontRaw), 10) || 12 : 12;
    const content = KEYWORD_TO_INVOICE_CONTENT[value];
    lines.push(
      content
        ? { id: `${slot}-${i}`, content, fontSize }
        : { id: `${slot}-${i}`, content: "text", text: value, fontSize },
    );
  }
  return lines;
}

// The inverse of mapRawInvoiceLines - always emits all 10 slots per side
// (blank string for anything past the current line count), not just the
// slots currently in use. POST /invoiceSetting only touches keys present
// in its body (a partial Sequelize .update()), so omitting a now-empty
// slot would leave whatever was PREVIOUSLY saved there untouched on the
// backend instead of actually clearing it - confirmed by reading
// controller/incoiceFormate.js's own `InvoiceFormate.update(req.body, ...)`.
function toRawInvoiceFormatePayload(
  header: InvoiceLine[],
  footer: InvoiceLine[],
): Record<string, string> {
  const payload: Record<string, string> = {};
  (["header", "footer"] as const).forEach((slot) => {
    const lines = (slot === "header" ? header : footer).slice(0, INVOICE_LINE_SLOTS);
    const linePrefix = slot === "header" ? "headerLine" : "footerLine";
    const fontPrefix = slot === "header" ? "fontH" : "fontF";
    for (let i = 1; i <= INVOICE_LINE_SLOTS; i++) {
      const line = lines[i - 1];
      const value = !line
        ? ""
        : line.content === "text"
          ? (line.text ?? "")
          : INVOICE_CONTENT_TO_KEYWORD[line.content];
      payload[`${linePrefix}${i}`] = value;
      payload[`${fontPrefix}${i}`] = `${line?.fontSize ?? 12}px`;
    }
  });
  return payload;
}

// Dynamic KOT format (Task 1) - same headerLineN/footerLineN slot
// convention as invoice format (hms_kot_formate_mst, model/kotFormate.js),
// but this keyword vocabulary is purely a frontend convention: unlike the
// invoice side (where controller/kto.js's own getHearderAndFooterDataBillView
// re-renders these keywords server-side for the e-bill webview), nothing on
// the backend interprets a KOT line's stored keyword - the configured
// format is only ever rendered client-side (renderKotHeaderFooter, near
// doPrintKot) into ready HTML strings, same as the invoice's own bonus-fix
// print path. Kept as a keyword→content mapping anyway (not raw content
// enums stored directly) so it round-trips through the same "unknown value
// = literal custom text" fallback as the invoice mapping, for one
// consistent convention across both format editors.
const KOT_CONTENT_TO_KEYWORD: Record<Exclude<KotLineContent, "text">, string> = {
  "outlet-name": "hotel_name",
  address: "address",
  "order-type": "order_type",
  "customer-details": "customer_details",
  "bill-no": "bill_no",
  "token-number": "token_number",
  "kot-number": "kot_number",
  "billerpe-branding": "billerpe_branding",
};
const KEYWORD_TO_KOT_CONTENT: Partial<Record<string, KotLineContent>> = Object.fromEntries(
  Object.entries(KOT_CONTENT_TO_KEYWORD).map(([content, keyword]) => [keyword, content]),
) as Partial<Record<string, KotLineContent>>;

const KOT_LINE_SLOTS = 10;

function mapRawKotLines(raw: RawKotFormate, slot: "header" | "footer"): KotLine[] {
  if (!raw) return [];
  const linePrefix = slot === "header" ? "headerLine" : "footerLine";
  const fontPrefix = slot === "header" ? "fontH" : "fontF";
  const lines: KotLine[] = [];
  for (let i = 1; i <= KOT_LINE_SLOTS; i++) {
    const rawValue = raw[`${linePrefix}${i}`];
    const value = rawValue == null ? "" : String(rawValue).trim();
    if (!value) continue;
    const fontRaw = raw[`${fontPrefix}${i}`];
    const fontSize = fontRaw ? parseInt(String(fontRaw), 10) || 12 : 12;
    const content = KEYWORD_TO_KOT_CONTENT[value];
    lines.push(
      content
        ? { id: `${slot}-${i}`, content, fontSize }
        : { id: `${slot}-${i}`, content: "text", text: value, fontSize },
    );
  }
  return lines;
}

// The inverse of mapRawKotLines - see toRawInvoiceFormatePayload's own
// comment for why every slot is always emitted (partial-update semantics
// on POST /kotFormatSetting, controller/kotFormate.js).
function toRawKotFormatePayload(header: KotLine[], footer: KotLine[]): Record<string, string> {
  const payload: Record<string, string> = {};
  (["header", "footer"] as const).forEach((slot) => {
    const lines = (slot === "header" ? header : footer).slice(0, KOT_LINE_SLOTS);
    const linePrefix = slot === "header" ? "headerLine" : "footerLine";
    const fontPrefix = slot === "header" ? "fontH" : "fontF";
    for (let i = 1; i <= KOT_LINE_SLOTS; i++) {
      const line = lines[i - 1];
      const value = !line
        ? ""
        : line.content === "text"
          ? (line.text ?? "")
          : KOT_CONTENT_TO_KEYWORD[line.content];
      payload[`${linePrefix}${i}`] = value;
      payload[`${fontPrefix}${i}`] = `${line?.fontSize ?? 12}px`;
    }
  });
  return payload;
}

function mapRawNotificationSetting(n: RawNotificationSetting): NotificationSetting {
  return {
    trigger: n.trigger,
    whatsapp: n.whatsapp,
    sms: n.sms,
    inApp: n.in_app,
  };
}

// Folds the backend's (hotel, role) rows into the two Record<Role, ...>
// shapes the rest of the app reads directly (store.rolePermissions /
// store.roleSpecialPermissions). Missing roles/modules (a role that
// hasn't been touched since a schema change, or before the migration
// backfill has run against a given environment) fall back to the same
// seed defaults the app always shipped with, rather than leaving a hole -
// mirrors mapRawPurchaseOrder's own "carry forward, never drop to
// undefined" caution.
function mapRolePermissionDefaults(rows: RawRolePermissionDefault[]): {
  rolePermissions: Record<Role, RolePermissions>;
  roleSpecialPermissions: Record<Role, Partial<Record<SpecialPermission, boolean>>>;
} {
  const byRole = new Map(rows.map((r) => [r.role, r]));
  const roles = Object.keys(ROLE_PERMISSION_DEFAULTS) as Role[];
  const rolePermissions = {} as Record<Role, RolePermissions>;
  const roleSpecialPermissions = {} as Record<Role, Partial<Record<SpecialPermission, boolean>>>;
  for (const role of roles) {
    const row = byRole.get(role);
    rolePermissions[role] = {
      ...ROLE_PERMISSION_DEFAULTS[role],
      ...(row?.permissions as Partial<RolePermissions> | undefined),
    };
    roleSpecialPermissions[role] = {
      ...ROLE_SPECIAL_DEFAULTS[role],
      ...(row?.special_permissions as Partial<Record<SpecialPermission, boolean>> | undefined),
    };
  }
  return { rolePermissions, roleSpecialPermissions };
}

function mapRawMenuCategory(c: RawMenuCategory, fallbackMenuId: string): MenuCategory {
  return {
    id: String(c.id),
    name: c.menu_categ_nm,
    active: c.active,
    sortOrder: c.rank ?? c.id,
    // Real per-catalogue scope, not the single blanket id every row used
    // to get stamped with - falls back only for a row somehow missing it
    // (shouldn't happen post-backfill, but stays safe if it ever does).
    menuId: c.menu_catalog_id != null ? String(c.menu_catalog_id) : fallbackMenuId,
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

function mapRawVariant(v: RawVariant, fallbackMenuId: string): VariantOption {
  // The Variants master (GET /variant) has no price field at all - only
  // `id`/`variants_name`/`active`/`menu_catalog_id` (confirmed live and in
  // getAllVariant's own `attributes` allowlist). Real pricing only exists
  // per-menu-item, on the MenuVariants join row (variant_price), set when
  // a variant is attached to a specific item.
  return {
    id: String(v.id),
    name: v.variants_name,
    price: 0,
    menuId: v.menu_catalog_id != null ? String(v.menu_catalog_id) : fallbackMenuId,
  };
}

function mapRawAddonGroup(g: RawAddonGroup, fallbackMenuId: string): AddonGroup {
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
    menuId: g.menu_catalog_id != null ? String(g.menu_catalog_id) : fallbackMenuId,
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

// Stored by the exe (POST /userPermissionOverrides) as JSON; SQLite can hand
// it back as a string.
function parseOverrides(
  value: RawHotelUser["permission_overrides"],
): PermissionOverrides | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as PermissionOverrides;
    } catch {
      return undefined;
    }
  }
  return value as PermissionOverrides;
}

function mapRawUser(u: RawHotelUser): User {
  return {
    id: String(u.id),
    name: u.name,
    role: resolveRole(u.role_mst?.role_name),
    mobile: u.number,
    email: u.email,
    status: u.active ? "Active" : "Inactive",
    // The real PIN is never returned (only its bcrypt hash) - there is no
    // way to display or re-derive it. Left blank; only a re-save sets a
    // new one.
    pin: "",
    permissionOverrides: parseOverrides(u.permission_overrides),
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
    // parseBillNoAsOrderNo, not the raw bill_no - an exe-created order's
    // bill_no carries the real, required "OFF" prefix (localBillNumber.js's
    // own sync-contract comment) until it syncs to the cloud, so displaying
    // it as-is here showed "#OFF4" verbatim instead of the plain "#4" every
    // other screen already shows via this same stripping (mapRawLiveOrder's
    // orderNo, mapRawOrderHistoryEntry's, etc.) - confirmed live as a real
    // "why does my due bill say OFF4" report, not intended UI.
    billNo: `#${parseBillNoAsOrderNo(o.bill_no, o.id)}`,
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
    deleted: h.deleted,
  };
}

function mapRawExpenseEntry(e: RawExpenseEntry): Expense {
  const [y, m, d] = e.business_date.split("-");
  // createdAt carries the real time-of-day (business_date is DATEONLY) -
  // same "H:MM am/pm" style formatOrderTimestamp already uses for orders,
  // kept as its own field rather than folded into `date` so every
  // existing `date === X` day-bucket comparison keeps working unchanged.
  const createdAtDate = new Date(e.createdAt);
  const hh = createdAtDate.getHours() % 12 || 12;
  const mm = `${createdAtDate.getMinutes()}`.padStart(2, "0");
  const ap = createdAtDate.getHours() >= 12 ? "pm" : "am";
  return {
    id: `exp-${e.id}`,
    headId: `eh-${e.expense_head_id}`,
    amount: Number(e.amount),
    date: `${d}/${m}/${y}`,
    time: `${`${hh}`.padStart(2, "0")}:${mm} ${ap}`,
    mode: e.paymentMode === "Cash" || e.paymentMode === "UPI" ? e.paymentMode : "Bank",
    note: e.reason,
    // Was write-only before (user_id was saved but this endpoint never
    // joined it back out) - now surfaces the real staff name, falling
    // back to "Staff" only for a genuinely missing/deleted user.
    createdBy: e.hms_hotelUser_master?.name ?? "Staff",
    createdByUserId: e.user_id != null ? String(e.user_id) : undefined,
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
//
// `raw` is NOT reliably a JSON string despite RawOrderLine's own type claim -
// billerpe-local-exe/model/order_details.js declares this a DataTypes.JSON
// column, and Sequelize's JSON getter auto-parses it back to a real array
// the moment a non-raw query (every real endpoint here - getActiveOrders/
// getSingleOrder/getOrdersByBillNo, none pass raw:true) touches the row, so
// the value that actually arrives over the wire is already an array, not a
// string containing one. JSON.parse(anArray) silently threw here (caught,
// returned []) on every single order loaded from the server rather than
// built locally in this tab - confirmed live as the real cause of "addons
// aren't showing" for any order taken elsewhere (Captain App, another POS
// tab, a QR order) and then opened/reloaded here. This app's own orders
// never hit this path at all - their addons stay in local React state from
// the moment they're added, never round-tripping through this parser.
export function parseOrderAddons(raw: unknown): NonNullable<OrderLine["addons"]> {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
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

// bill_no is not always a plain number - offline/local-exe-created orders
// use an "OFF"-prefixed scheme (see billerpe-local-exe/helpers/
// localBillNumber.js; the "OFF" prefix is a required part of the real
// sync contract, not cosmetic). `Number("OFF6")` is NaN, and the old
// `Number(detail.bill_no) || detail.id` fallback silently substituted the
// row's raw internal database id instead - confirmed live as the actual
// cause of an order's displayed number changing (e.g. "#101" while still
// the in-session live entry, then "#6" - its own unrelated internal id -
// once a reload replaced it with the synced/historical entry). Stripping
// any leading non-digit prefix before parsing keeps the number stable
// and tied to the real bill_no on every reload, though it still won't
// match a session-local live counter's starting value (see startOrder's
// own comment on why that counter exists) - the two are inherently
// different sequences.
// What the header's connection chip shows, from GET /localServerStatus.
// The terminal reaching the exe at all is ServerGate's job (a blocking
// screen when it can't); this is about the exe's own cloud connection.
function connectionFromStatus(status: RawLocalServerStatus): ConnectionState {
  if (!status.registered) return "sync-error";
  const sync = status.sync;
  if (sync.transactionsBlocked) return "offline-limit-exceeded";
  if (sync.registrationRequired) return "sync-error";
  const lastBeat = sync.lastHeartbeatAt ? Date.parse(sync.lastHeartbeatAt) : 0;
  const heartbeatMs = (sync.heartbeatSeconds || 60) * 1000;
  // Several missed heartbeats: the exe can't reach the cloud. Billing
  // carries on locally, so this is "offline", not an error.
  if (!lastBeat || Date.now() - lastBeat > heartbeatMs * 4) return "offline";
  if (sync.stuckOrders?.length) return "sync-error";
  return "online";
}

function parseBillNoAsOrderNo(bill_no: string, fallbackId: number): number {
  const numeric = bill_no.replace(/^\D+/, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && numeric !== "" ? parsed : fallbackId;
}

// The one function every "Bill No" display should go through - never the
// raw Order.billNo string directly. billerpe-local-exe now resolves the
// real, final bill number synchronously against the cloud the instant an
// order is created (controller/order.js/kot.js/holdOrder.js's own
// pushPendingOrdersNow calls), so this exe's own "OFF#" local placeholder
// is only ever actually visible for the few hundred ms of that one round
// trip, or for as long as a genuine internet outage lasts - never a
// permanent state a customer or staff member should be shown as if it
// were a real bill number. Falls back to the already-stable, already-
// prefix-stripped orderNo (parseBillNoAsOrderNo) in that case, exactly
// matching what this same order will keep showing once reconciled.
export function displayBillNo(o: { billNo?: string; orderNo: number }): string {
  return o.billNo && !o.billNo.startsWith("OFF") ? o.billNo : String(o.orderNo);
}

// Real backend line items carry their own real kotNumber (billerpe-local-
// exe's controller/kot.js: each round's rows are stamped with maxKotNumber
// + 1 at the time it was fired) - this used to be thrown away and every
// line hardcoded to round 1, which not only mis-displayed a 2nd+ round as
// merged into "KOT 1" but, since order.kotRounds was ALSO hardcoded to 1,
// meant a NEXT round fired locally (`o.kotRounds + 1`) would try to reuse
// a round number a QR-accepted order had already used server-side.
// Matches addKotRoundToOrder's own "next round = current max + 1" formula
// exactly, not a guess at a different convention.
// A line that's been HELD but never fired carries the model's default
// kotNumber of 0 (controller/holdOrder.js's buildHoldRows never sets it) -
// `|| 1` and a floor of 1 both treated that as "round 1 fired", so an
// order that was only ever held (never sent to the kitchen) showed a
// phantom "KOT 1" instead of "New - not sent". Real fired rounds are
// always >= 1 (addKotRoundToOrder's own "current max + 1" formula), so 0
// unambiguously means "not fired" and the floor drops to 0 to match.
function maxKotRound(details: { kotNumber: number }[]): number {
  return details.reduce((max, d) => Math.max(max, d.kotNumber || 0), 0);
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
      // See mapRawLiveOrder's own comment on this same fallback - a
      // settled order shouldn't have any kotNumber-0 lines in practice,
      // but UNSENT_ROUND is the correct fallback here too if it ever did.
      kotRound: l.kotNumber || UNSENT_ROUND,
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
    orderNo: parseBillNoAsOrderNo(detail.bill_no, detail.id),
    billNo: detail.bill_no,
    type: detail.order_type === "dinin" ? "Dine In" : "Pickup",
    tableLabel: detail.hms_table_mst?.table_name ?? "—",
    // Not tracked anywhere on the backend Order model - no guest-count
    // column exists to sync, so history entries always show 0 covers
    // rather than a fabricated guess.
    guests: 0,
    status: "Settled",
    lines,
    kotRounds: maxKotRound(detail.hms_orderDetails),
    customerName: detail.hms_user_master?.name || undefined,
    customerPhone: detail.hms_user_master?.number || undefined,
    customerAddress: detail.hms_user_master?.address || undefined,
    customerGstin: detail.hms_user_master?.gstin || undefined,
    discount: mapRawDiscount(detail),
    payments,
    businessDate,
    createdAt: formatOrderTimestamp(detail.createdAt, businessDate),
    settledAt: formatOrderTimestamp(detail.updatedAt, businessDate),
    createdBy: staffName,
    itemised: lines.length > 0,
    fallbackTotal: lines.length ? undefined : detail.grandAmount,
    backendId: detail.id,
    tip: detail.tip ?? 0,
    billPrintCount: detail.billPrintCount ?? 0,
    token: detail.token ?? 0,
    backendTotals: {
      grand: detail.grandAmount,
      tax: detail.gst,
      discount: detail.totalDiscount,
      serviceCharge: detail.service_charge,
    },
  };
}

function formatRealTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN");
}

function mapRawCashMovement(m: RawCashMovement): CashMovement {
  return {
    id: String(m.id),
    type: m.type,
    amount: m.amount,
    reason: m.reason ?? "",
    at: formatRealTimestamp(m.at),
    by: m.hms_hotelUser_master?.name ?? "Staff",
  };
}

function mapRawCashSession(s: RawCashSession): CashSession {
  return {
    id: String(s.id),
    openedAt: formatRealTimestamp(s.opened_at),
    openedBy: s.hms_hotelUser_master?.name ?? "Staff",
    openingFloat: s.opening_float,
    status: s.status,
    movements: (s.hms_cashMovement_msts ?? [])
      .slice()
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .map(mapRawCashMovement),
    ...(s.closed_at ? { closedAt: formatRealTimestamp(s.closed_at) } : {}),
    ...(s.counted_cash != null ? { countedCash: s.counted_cash } : {}),
    ...(s.variance != null ? { variance: s.variance } : {}),
    ...(s.variance_reason ? { varianceReason: s.variance_reason } : {}),
  };
}

// The exe now stores the discount INPUT (discount_type "pr"/"fix" +
// discount_value) alongside the resolved totalDiscount, so a percent
// discount reloaded from the server keeps recomputing as lines change
// instead of freezing at whatever amount it was when last saved.
function mapRawDiscount(detail: RawOrderDetail): Order["discount"] {
  if (!(detail.totalDiscount > 0)) return undefined;
  const label = detail.discount_reason || "Discount";
  if (detail.discount_type === "pr" && (detail.discount_value ?? 0) > 0) {
    return {
      label,
      amount: detail.totalDiscount,
      type: "percent",
      value: detail.discount_value ?? 0,
    };
  }
  return { label, amount: detail.totalDiscount, type: "flat", value: detail.totalDiscount };
}

// Merges a fresh server copy of an order this session already knows into
// the local Order - fired lines, rounds, status, discount, customer, table
// and bill number come from the server; only lines still being built
// locally (kotRound === UNSENT_ROUND) survive from the local copy. This is
// what makes a KOT fired from the Captain App show up on an open POS
// order (and its table card total) immediately - the old code refused to
// touch an order it already had, or skipped entirely while a draft round
// existed, so the POS lagged until the cashier reopened the order.
function mergeServerOrder(local: Order, fresh: Order): Order {
  if (local.status === "Settled" || local.status === "Cancelled" || local.editingSettledOrderId) {
    return local;
  }
  // Holding an order PERSISTS its un-fired lines (controller/holdOrder.js
  // writes them as status "in-progress"), so the server copy that comes
  // back IS this order's local draft, not a second set of items. Keeping
  // both showed every held item twice - as a phantom "KOT 1" plus an
  // un-sent copy before held lines mapped to UNSENT_ROUND, and as plain
  // doubled lines after. Local drafts only survive while the server is
  // holding none of its own, which is exactly the "typed but never sent
  // anywhere" case this preservation exists for.
  const serverHasUnsent = fresh.lines.some((l) => l.kotRound === UNSENT_ROUND);
  const draftLines = serverHasUnsent ? [] : local.lines.filter((l) => l.kotRound === UNSENT_ROUND);
  const hasDraft = draftLines.length > 0;
  return {
    ...local,
    lines: [...draftLines, ...fresh.lines],
    kotRounds: fresh.kotRounds,
    status: fresh.status,
    backendId: fresh.backendId,
    billNo: fresh.billNo ?? local.billNo,
    orderNo: fresh.billNo ? fresh.orderNo : local.orderNo,
    tableId: fresh.tableId ?? local.tableId,
    tableLabel: fresh.tableLabel && fresh.tableLabel !== "—" ? fresh.tableLabel : local.tableLabel,
    customerName: fresh.customerName ?? local.customerName,
    customerPhone: fresh.customerPhone ?? local.customerPhone,
    customerAddress: fresh.customerAddress ?? local.customerAddress,
    customerGstin: fresh.customerGstin ?? local.customerGstin,
    // A discount applied locally mid-edit (applyDiscount only patches
    // local state until the next KOT/bill call carries it) must not be
    // wiped by a refresh while the draft is still open.
    discount: hasDraft ? local.discount : (fresh.discount ?? local.discount),
    packagingCharge: hasDraft ? local.packagingCharge : fresh.packagingCharge,
    itemised: fresh.itemised || hasDraft,
    fallbackTotal: fresh.fallbackTotal,
    tip: fresh.tip,
    billPrintCount: fresh.billPrintCount,
    token: fresh.token,
  };
}

// For a table that's genuinely occupied on the real backend (getTable's
// own query already filters to status in-progress/success/hold,
// payment:pending, deleted:false) but this session never created the
// order itself - e.g. an order accepted from a QR submission, or opened
// on another terminal. Fed straight from getActiveOrders'/pickupOrder's
// own bundled OrderDetails (loadTablesFromServer, below) - that endpoint
// now includes both the Menu and User joins this needs, so no separate
// getSingleOrder(/order/:id) follow-up call happens per table anymore.
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
      // kotNumber 0 (the model default - buildHoldRows never sets it) is a
      // held-but-never-fired line, exactly what UNSENT_ROUND already means
      // for a line added locally this session (see maxKotRound's own
      // comment). `|| 1` used to fold it into "KOT 1" - indistinguishable
      // from a real fired round 1, and once a real round 1 existed too,
      // held items merged straight into it as if already sent.
      kotRound: l.kotNumber || UNSENT_ROUND,
    };
  });
  const status: Order["status"] =
    detail.status === "hold" ? "Hold" : detail.status === "success" ? "Bill Generated" : "Running";
  return {
    id: `o-live-${detail.id}`,
    orderNo: parseBillNoAsOrderNo(detail.bill_no, detail.id),
    billNo: detail.bill_no,
    type: detail.order_type === "dinin" ? "Dine In" : "Pickup",
    tableId,
    tableLabel: detail.hms_table_mst?.table_name ?? "—",
    // Not tracked anywhere on the backend Order model - see
    // mapRawOrderHistoryEntry's own comment on the same gap.
    guests: 0,
    status,
    lines,
    kotRounds: maxKotRound(detail.hms_orderDetails),
    customerName: detail.hms_user_master?.name || undefined,
    customerPhone: detail.hms_user_master?.number || undefined,
    customerAddress: detail.hms_user_master?.address || undefined,
    customerGstin: detail.hms_user_master?.gstin || undefined,
    discount: mapRawDiscount(detail),
    ...(detail.packaging_override != null ? { packagingCharge: detail.packaging_override } : {}),
    businessDate,
    createdAt: formatOrderTimestamp(detail.createdAt, businessDate),
    createdBy: staffName,
    itemised: lines.length > 0,
    fallbackTotal: lines.length ? undefined : detail.grandAmount,
    backendId: detail.id,
    tip: detail.tip ?? 0,
    billPrintCount: detail.billPrintCount ?? 0,
    token: detail.token ?? 0,
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
  const lines: PurchaseLine[] = o.hms_purchase_rawMaterials.map((l) => {
    const taxAmount = (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0);
    return {
      materialId: String(l.raw_material_id),
      qty: l.qty,
      rate: l.price,
      taxPct: l.amount > 0 ? Math.round((taxAmount / l.amount) * 10000) / 100 : undefined,
      backendLineId: l.id,
    };
  });
  // No plain "payments: number" field exists on the real response - see
  // RawPurchaseOrder's own comment - sum the actual payment rows instead.
  const paid = o.hms_purchase_payments
    .filter((p) => !p.deleted_status)
    .reduce((sum, p) => sum + p.amount, 0);
  return {
    id: previous?.id ?? `po-${o.id}`,
    poNo: `PO-2026-${String(o.Po_no).padStart(3, "0")}`,
    supplierId: o.hms_supplier ? String(o.hms_supplier.id) : (previous?.supplierId ?? ""),
    date: previous?.date ?? realToday(),
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

function mapRawRequisition(r: RawRequisition): FranchiseRequisition {
  return {
    id: `req-${r.id}`,
    reqNo: `REQ-2026-${String(r.req_no).padStart(3, "0")}`,
    date: r.createdAt ? isoToDMY(r.createdAt.slice(0, 10)) : realToday(),
    status: r.status,
    items: r.items.map((i) => ({
      materialId: String(i.raw_material_id),
      orderedQty: i.ordered_qty,
      approvedQty: i.approved_qty ?? undefined,
      unitPrice: i.unit_price,
    })),
    remarks: r.remarks || undefined,
    purchaseOrderId: r.purchase_order_id ? `po-${r.purchase_order_id}` : undefined,
    raisedBy: r.raised_by || "—",
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

// role_msts.role_name is only reliably one of the 7 new-design role names
// above after migrations/20260824062338-extend-role-name-enum.js - older or
// still-live rows carry a legacy single-letter code instead (see
// uat-backend-v2's USER_ROLE constant): every hotel's owner account is
// auto-seeded at onboarding with role_name "A" (controller/hotel.js's
// addHotelDetails), not the string "Owner", and stays "A" going forward -
// it is not a one-time migration artifact. Mapping these explicitly rather
// than lumping them into the "unrecognized" fallback below, which used to
// silently turn every real owner login into a Cashier.
const LEGACY_ROLE_MAP: Partial<Record<string, Role>> = {
  A: "Owner", // legacy Admin code - roles.md confirms A = Admin = Owner/Manager
  C: "Captain",
  B: "Cashier", // legacy Biller code - roles.md confirms B = Biller = Cashier
};

// U (generic/normal staff) and S (Super Admin leftover, not a real
// hotel-level role per roles.md) have no real equivalent among the 7
// new-design roles, and a genuinely blank/invalid role_name (pre-migration
// MySQL silently coerced unrecognized enum values to "") is truly unknown -
// all three fall back to "Cashier" as the safest low-privilege default
// rather than leaving the UI with a blank/invalid role.
function resolveRole(roleName: string | undefined): Role {
  if (!roleName) return "Cashier";
  if (ROLE_VALUES.includes(roleName as Role)) return roleName as Role;
  return LEGACY_ROLE_MAP[roleName] ?? "Cashier";
}

// Backend's UserAccess is a flat 10-area x (read/create/edit/delete) grid,
// one full set of booleans per user (no separate role-default-vs-override
// layering the way this app's own permission model has) and no concept of
// the frontend's 23 granular modules or its 7 "special permissions"
// (orders.editAfterKot etc) at all. resolveEffectiveGrants below merges a
// user's role default with their permissionOverrides before this maps it
// down to the 10 backend areas - previously this sent the role default
// only, silently discarding any override the popup's "Permission
// overrides" editor let you set (confirmed live: editing a user's
// module grants and saving had no effect on their real access). The 13
// modules with no backend-area equivalent (menu items, keyboard-billing,
// kds, permissions, cash-session, stock-transactions/-recipes/-reports,
// ops-*, system, audit-log) and all 7 special permissions still have
// nowhere to persist - that's a real schema gap, not something this
// mapping can paper over, and stays exactly as limited as before for
// those. Not a live two-way sync either: a role-default change alone
// (no override) doesn't retroactively update every existing user with
// that role until each is individually re-saved.
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

function resolveEffectiveGrants(
  role: Role,
  rolePermissions: Record<Role, RolePermissions>,
  overrides: PermissionOverrides | undefined,
): RolePermissions {
  const base = rolePermissions[role];
  if (!overrides?.modules) return base;
  return Object.fromEntries(
    (Object.keys(base) as PermissionModule[]).map((m) => [
      m,
      { ...base[m], ...(overrides.modules?.[m] ?? {}) },
    ]),
  ) as RolePermissions;
}

function buildAccessName(grants: RolePermissions) {
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
    const parsed = JSON.parse(saved) as { userId?: string; authed: boolean };
    // Registration is never restored from here - ServerGate asks the exe.
    return {
      ...initialState,
      authed: parsed.authed === true && !!parsed.userId,
      currentUserId: parsed.userId ?? initialState.currentUserId,
    };
  } catch {
    return initialState;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(loadInitialState);

  const patch = useCallback((fn: (p: State) => State) => set(fn), []);

  // Chained table transfers (Table 2 -> Garden 1 -> Garden 3, back-to-back)
  // each fire their own loadTablesFromServer() call. Those calls race - the
  // second one can resolve before the first (or vice versa depending on
  // response timing), and the LAST resolved response always wins the
  // wholesale `tables:` patch below, regardless of which one was actually
  // issued last. That let a stale mid-transition response clobber the
  // correct final state, leaving a table looking permanently "stuck" in the
  // UI even though the backend had already freed it. Guarded with a call
  // sequence number - only the response to the most-recently-issued call is
  // ever applied.
  const tablesLoadSeq = useRef(0);

  const currentUser = useMemo(
    () => s.sessionUser ?? s.users.find((u) => u.id === s.currentUserId) ?? NO_USER,
    [s.sessionUser, s.users, s.currentUserId],
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
      const userId = s.currentUserId;
      const userName = currentUser.name;
      const entry: AuditLog = {
        id: uid("a"),
        userId,
        userName,
        action,
        entity,
        before,
        after,
        device: "Web POS",
        ip: "",
        at: nowStamp(),
        ...(reason ? { reason } : {}),
      };
      patch((p) => ({ ...p, auditLogs: [entry, ...p.auditLogs] }));
      // Persist for real - see auditLogApi's own comment. Fire-and-forget,
      // no toast on failure: this runs alongside 43 other real actions,
      // none of which should ever be blocked or interrupted by a logging
      // write failing in the background.
      void auditLogApi
        .create({ user_id: userId, user_name: userName, action, entity, before, after, reason })
        .catch(() => {});
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
    (moduleName: PermissionModule, action: StandardAction) => {
      if (!s.sessionUser) return false;
      return currentUser.role === "Owner"
        ? true
        : !!resolvedPermissions?.modules[moduleName]?.[action];
    },
    [s.sessionUser, currentUser, resolvedPermissions],
  );

  const canSpecial = useCallback(
    (perm: SpecialPermission) => {
      if (!s.sessionUser) return false;
      return currentUser.role === "Owner" ? true : !!resolvedPermissions?.special[perm];
    },
    [s.sessionUser, currentUser, resolvedPermissions],
  );

  // Every write the API layer sends is checked against these first
  // (lib/api.ts#assertPermitted) - the same rules the exe enforces.
  useEffect(() => {
    setPermissionChecker(s.sessionUser ? { can, canSpecial } : null);
  }, [s.sessionUser, can, canSpecial]);

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

  // The full dine-in bill payload the exe rebuilds an order from (adminOrder
  // and saveAndSettle): EVERY line the order has ever had, not just new
  // ones - see adminOrder's own comment in lib/api.ts for why.
  const dineInBillCart = (o: Order) => {
    const billSettings: BillSettings = {
      serviceCharge: s.serviceCharge,
      deliveryChargeRule: s.deliveryChargeRule,
      packagingChargeRule: s.packagingChargeRule,
      taxRules: s.taxRules,
      invoiceFormat: s.invoiceFormat,
      tables: s.tables,
      menuItems: s.menuItems,
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
        // finalizeExistingOrder (billerpe-local-exe/controller/order.js)
        // destroys and rebuilds every OrderDetails row - without the
        // round, every KOT round collapsed into one once billed.
        // Unsent lines have no round yet.
        ...(Number.isFinite(l.kotRound) ? { kotNumber: l.kotRound } : {}),
      };
    });
    return {
      totals,
      cart: {
        items: [{ status: "H" as const, menuItems: allMenuItems }] as [
          { status: "H"; menuItems: typeof allMenuItems },
        ],
        gst: totals.tax,
        totalDiscount: totals.discount,
        grandAmount: totals.grand,
        myAmount: totals.subtotal,
        service_charger: totals.service,
        delivery_charge: totals.delivery,
        packaging_charge: totals.packaging,
        ...discountPayload(o, totals),
        taxes: buildCartTaxes(totals, s.taxRules),
      },
    };
  };

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

  // Renders a configured header/footer (store.invoiceFormat.header/footer,
  // the same lines the Settings > Invoice Format preview shows) into the
  // string[] of HTML fragments every print/PDF path expects - mirrors the
  // backend's own getHearderAndFooterDataBillView keyword mapping and the
  // InvoiceFormatSection preview's renderLine, so what's configured is
  // exactly what prints. QR generation is best-effort: a failure there
  // must never block the rest of the bill from printing.
  const renderInvoiceHeaderFooter = async (
    lines: InvoiceLine[],
    ctx: {
      hotelName: string;
      address: string;
      gstNo: string;
      fssaiNo: string;
      logoUrl?: string;
      upiId: string;
      amount: number;
    },
  ): Promise<string[]> => {
    const out: string[] = [];
    for (const l of lines) {
      switch (l.content) {
        case "logo":
          if (ctx.logoUrl) {
            out.push(
              `<img style="display:block;margin:0 auto;max-height:80px;max-width:150px" src="${ctx.logoUrl}"/>`,
            );
          }
          break;
        case "upi-qr":
          if (ctx.upiId) {
            try {
              const merchantName = encodeURIComponent(ctx.hotelName);
              const transactionNote = encodeURIComponent(`Bill Payment - ${ctx.amount}`);
              const upiUrl = `upi://pay?pa=${ctx.upiId}&pn=${merchantName}&tn=${transactionNote}&am=${ctx.amount}&cu=INR`;
              const qr = await QRCode.toDataURL(upiUrl, { width: 150, margin: 2 });
              out.push(
                `<img style="display:block;margin:0 auto" width="120" height="120" src="${qr}"/>`,
              );
            } catch {
              // Skip the QR line rather than failing the whole print.
            }
          }
          break;
        case "outlet-name":
          out.push(`<p class="hotel-name">${ctx.hotelName}</p>`);
          break;
        case "address":
          if (ctx.address) out.push(`<p class="hotel-address">${ctx.address}</p>`);
          break;
        case "gstin":
          if (ctx.gstNo) out.push(`<p>GSTIN: ${ctx.gstNo}</p>`);
          break;
        case "fssai":
          if (ctx.fssaiNo) out.push(`<p>FSSAI: ${ctx.fssaiNo}</p>`);
          break;
        default:
          if (l.text) out.push(`<p>${l.text}</p>`);
          break;
      }
    }
    return out;
  };

  // Shared by printBill and generateBill's print option - takes backendId
  // as an explicit argument rather than re-deriving it from `s`, since `s`
  // is this render's immutable snapshot and won't reflect a patch() that
  // just happened moments earlier in the same async flow.
  const doPrintBill = async (o: Order, backendId: number): Promise<boolean> => {
    try {
      const hotel = await hotelApi.getSettings();
      const t = o.backendTotals
        ? {
            ...orderTotals(o, s),
            grand: o.backendTotals.grand,
            discount: o.backendTotals.discount,
            service: o.backendTotals.serviceCharge,
          }
        : orderTotals(o, s);
      const logoUrl =
        hotel.hotel_logo && hotel.hotel_logo !== "placeholder.png"
          ? `${API_BASE_URL}/images/${hotel.hotel_logo}`
          : undefined;
      const address = [hotel.address1, hotel.address2].filter(Boolean).join(", ");
      const hfCtx = {
        hotelName: hotel.hotel_name,
        address,
        gstNo: hotel.gst_no ?? "",
        fssaiNo: hotel.fssai_no ?? "",
        logoUrl,
        upiId: hotel.upiId ?? "",
        amount: t.grand,
      };
      // Uses the hotel's configured Invoice Format header/footer (Settings
      // > Invoice Format) so the actual printed bill matches the e-bill
      // webview and the settings preview. Falls back to the same plain
      // hotel-name/address/GST/FSSAI content printed before this feature
      // existed when the hotel hasn't configured a format yet (header
      // comes back empty) - otherwise those hotels would suddenly print
      // bills with no header at all.
      const [headerText, footerText] = s.invoiceFormat.header.length
        ? await Promise.all([
            renderInvoiceHeaderFooter(s.invoiceFormat.header, hfCtx),
            renderInvoiceHeaderFooter(s.invoiceFormat.footer, hfCtx),
          ])
        : [
            [
              `<p class="hotel-name">${hotel.hotel_name}</p>`,
              ...(address ? [`<p class="hotel-address">${address}</p>`] : []),
              ...(hotel.gst_no ? [`<p>GSTIN: ${hotel.gst_no}</p>`] : []),
              ...(hotel.fssai_no ? [`<p>FSSAI: ${hotel.fssai_no}</p>`] : []),
              ...(hotel.invoiceFormateHeaderText
                ? [`<p>${hotel.invoiceFormateHeaderText}</p>`]
                : []),
            ],
            hotel.invoiceFormateBottomText ? [`<p>${hotel.invoiceFormateBottomText}</p>`] : [],
          ];
      const items = o.lines.map((l) => ({
        item_name: l.name,
        qty: l.qty,
        price: l.price,
        totalAmount: lineTotal(l),
        variantData: l.variant ? { variants_name: l.variant } : null,
        addons: buildAddonsPayload(l.addons),
      }));
      // amount/tax_type here are the RATE (e.g. "@5%"), not the charged
      // amount - services/pdfGenerator.js's own template reads
      // `tax.amount` + `tax.tax_type === 'pr'` for that label and
      // `tax.tax_value` separately for the actual charged number. Was
      // previously hardcoded to amount:0/tax_type:"fix" (always printing
      // "@0", no "%"), even though the real rate is right here on
      // s.taxRules - a cosmetic-but-real inaccuracy on every printed bill.
      const orderTax = t.taxLines.map((tx) => {
        const rule = s.taxRules.find((r) => r.id === tx.id);
        return {
          hms_tax_type_mst: { tax_name: tx.name },
          amount: rule?.value ?? 0,
          tax_type: rule?.type === "percent" ? ("pr" as const) : ("fix" as const),
          tax_value: tx.amount,
        };
      });
      const totalQty = o.lines.reduce((sum, l) => sum + l.qty, 0);

      // Direct silent print first (billerpe-local-exe prints straight to
      // the configured Invoice printer, no browser dialog) - falls back to
      // the old "open a PDF tab" flow only if that fails (e.g. no invoice
      // printer configured yet, or the EXE can't be reached).
      try {
        const { printer } = await localPrintApi.printInvoice({
          orderId: String(backendId),
          // The actual bill number to print - see Order.billNo's own
          // comment. orderId above is the internal order id, kept only for
          // the API's own bookkeeping; printing it as "Bill No" (as this
          // used to) is what caused a printed bill's number to not match
          // the Orders list for the same order.
          billNo: displayBillNo(o),
          tableAndUserInfo: o.tableLabel,
          dateAndTime: o.createdAt,
          type: o.type === "Dine In" ? "dinin" : "pickup",
          token: o.token ?? 0,
          customerName: o.customerName,
          customerNumber: o.customerPhone,
          items,
          totalQty,
          subtotal: t.subtotal,
          totalDiscount: t.discount,
          service_charge: t.service,
          delivery_charge: t.delivery,
          packaging_charge: t.packaging,
          tip: o.tip ?? 0,
          orderTax,
          totalBill: t.grand,
          roundOff: t.roundOff ?? 0,
          headerText,
          footerText,
        });
        toast.success(`Bill sent to ${printer}`);
        return true;
      } catch {
        // Fall through to the PDF-preview path below.
      }

      const { pdf } = await orderApi.generateInvoicePdf({
        orderId: backendId,
        // See localPrintApi.printInvoice's own call above for why this is
        // separate from orderId.
        billNo: o.billNo ?? String(backendId),
        printerSize: hotel.printerSize ?? "1",
        tableAndUserInfo: o.tableLabel,
        dateAndTime: o.createdAt,
        type: o.type === "Dine In" ? "dinin" : "pickup",
        token: o.token ?? 0,
        customerName: o.customerName,
        customerNumber: o.customerPhone,
        items,
        totalQty,
        subtotal: t.subtotal,
        totalDiscount: t.discount,
        service_charge: t.service,
        delivery_charge: t.delivery,
        packaging_charge: t.packaging,
        tip: o.tip ?? 0,
        orderTax,
        totalBill: t.grand,
        roundOff: t.roundOff ?? 0,
        headerText,
        footerText,
      });
      const blob = new Blob([new Uint8Array(pdf.data)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("Bill ready to print (no local printer configured - opened as a PDF instead)");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate the bill PDF");
      return false;
    }
  };

  // Renders a configured KOT header/footer (store.kotFormat.header/footer)
  // into the string[] of HTML fragments both KOT print paths expect -
  // mirrors renderInvoiceHeaderFooter's convention (see doPrintBill above),
  // but synchronous (no logo/QR content types on the KOT side).
  const renderKotHeaderFooter = (
    lines: KotLine[],
    ctx: {
      hotelName: string;
      address: string;
      orderType: string;
      customerDetails: string;
      billNo: string;
      tokenNumber: number;
      kotNumber: number;
    },
  ): string[] => {
    const out: string[] = [];
    for (const l of lines) {
      switch (l.content) {
        case "outlet-name":
          out.push(`<p class="hotel-name">${ctx.hotelName}</p>`);
          break;
        case "address":
          if (ctx.address) out.push(`<p>${ctx.address}</p>`);
          break;
        case "order-type":
          out.push(`<p><strong>${ctx.orderType}</strong></p>`);
          break;
        case "customer-details":
          out.push(`<p><strong>${ctx.customerDetails}</strong></p>`);
          break;
        case "bill-no":
          out.push(`<p>KOT - ${ctx.billNo}</p>`);
          break;
        case "token-number":
          if (ctx.tokenNumber > 0) {
            out.push(`<p class="token"><strong>Token No.:${ctx.tokenNumber}</strong></p>`);
          }
          break;
        case "kot-number":
          out.push(`<p>KOT #${ctx.kotNumber}</p>`);
          break;
        case "billerpe-branding":
          out.push(`<p>Powered by BillerPe</p>`);
          break;
        default:
          if (l.text) out.push(`<p>${l.text}</p>`);
          break;
      }
    }
    return out;
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
      const items = lines.map((l) => {
        const mi = s.menuItems.find((m) => m.id === l.itemId);
        return {
          item_name: l.name,
          qty: l.qty,
          comment: l.note ?? "",
          // Was hardcoded null - the EXE's own printer routing
          // (helpers/kotPrinterRouting.js#arranPrintersForKotWithTheseItems)
          // treats a null category as "matches every configured printer
          // regardless of its own category assignment", which broke
          // per-station KOT routing entirely: a printer set up for only
          // Bar/Beverages (say) still received every item off every ticket
          // instead of just its own. generateKot (a few hundred lines up)
          // already computes this correctly for the same lines - matched
          // here.
          menu_categ_id: mi ? Number(mi.categoryId) : null,
          variantData: l.variant ? { variants_name: l.variant } : null,
          addons: buildAddonsPayload(l.addons),
        };
      });
      const tokenNumber = o.token ?? 0;
      // Uses the hotel's configured KOT Format (Settings > KOT Format) so
      // the actual printed ticket matches what's configured there. Falls
      // back to the same plain layout printed before this feature existed
      // when the hotel hasn't configured a format yet (header comes back
      // empty).
      const kotCtx = {
        hotelName: hotel.hotel_name,
        address: [hotel.address1, hotel.address2].filter(Boolean).join(", "),
        orderType: o.type === "Dine In" ? "Dine In" : "Pickup",
        customerDetails: userOrTableNo,
        billNo: String(o.orderNo),
        tokenNumber,
        kotNumber: round,
      };
      const [headerText, footerText] = s.kotFormat.header.length
        ? [
            renderKotHeaderFooter(s.kotFormat.header, kotCtx),
            renderKotHeaderFooter(s.kotFormat.footer, kotCtx),
          ]
        : [[], []];

      // Direct silent print first (billerpe-local-exe resolves the
      // configured KOT printer(s) itself and prints straight to them, no
      // browser dialog) - falls back to the old "open a PDF tab" flow only
      // if that fails (e.g. no KOT printer configured yet, or the EXE
      // can't be reached), so this never leaves the user with nothing.
      try {
        const { results } = await localPrintApi.printKot({
          order_type: o.type === "Dine In" ? "dinin" : "pickup",
          order_id: String(o.orderNo),
          restaurantName: hotel.hotel_name,
          userOrTableNo,
          timeAndDate: kot?.createdAt ?? o.createdAt,
          kotNumber: round,
          token: tokenNumber,
          table_id: o.tableId,
          headerText,
          footerText,
          items,
        });
        const failed = results.filter((r) => !r.ok);
        if (failed.length) {
          toast.error(`KOT failed to print on: ${failed.map((f) => f.printer).join(", ")}`);
        } else {
          toast.success(`KOT sent to ${results.map((r) => r.printer).join(", ")}`);
        }
        return;
      } catch {
        // Fall through to the PDF-preview path below.
      }

      const { pdf } = await orderApi.printKot({
        order_type: o.type === "Dine In" ? "dinin" : "pickup",
        order_id: String(o.orderNo),
        restaurantName: hotel.hotel_name,
        userOrTableNo,
        timeAndDate: kot?.createdAt ?? o.createdAt,
        printerSize: hotel.printerSize ?? "1",
        kotNumber: round,
        token: tokenNumber,
        headerText,
        footerText,
        items,
      });
      const blob = new Blob([new Uint8Array(pdf.data)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("KOT ready to print (no local printer configured - opened as a PDF instead)");
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
  // (and marks the table Hold), called only by actions that add real
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
        status: "Hold",
        kotRounds: 0,
        lines: [],
        menuId: resolveMenu(s.menus, table, "Dine In")?.id,
        businessDate: realToday(),
        createdAt: nowStamp(),
        createdBy: currentUser.name,
        itemised: true,
        // Reserved table (mapRawTable, sourced from billerpe-local-exe's
        // reserved_name/reserved_number) - pre-fill straight from the
        // reservation rather than making staff retype the same name/
        // number they already gave when booking. store.setCustomer can
        // still overwrite this normally if the actual walk-in differs.
        customerName: table.reservedGuestName,
        customerPhone: table.reservedGuestPhone,
      };
    }
    if (id.startsWith("draft-pickup-")) {
      return {
        id,
        orderNo: 0,
        type: "Pickup",
        tableLabel: "Take Away",
        guests: 1,
        status: "Hold",
        kotRounds: 0,
        lines: [],
        menuId: resolveMenu(s.menus, undefined, "Pickup")?.id,
        businessDate: realToday(),
        createdAt: nowStamp(),
        createdBy: currentUser.name,
        itemised: true,
      };
    }
    return undefined;
  };

  // Materializes a virtual draft into a real p.orders entry (and marks its
  // table Hold) if it isn't one already. No-ops for an id that's already
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
              status: "Hold",
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
        (o) => o.tableId === tableId && ["Hold", "Running", "Bill Generated"].includes(o.status),
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
      // Optimistic local patch for a snappy checkbox grid - reconciled by
      // the reload below, same pattern as setRequisitionQty.
      patch((p) => ({
        ...p,
        rolePermissions: { ...p.rolePermissions, [role]: permissions },
      }));
      log("Role Permissions Updated", role, "", "", `updated module grants for ${role}`);
      const run = async () => {
        try {
          await rolePermissionApi.editPermissions(role, permissions);
          await value.loadRolePermissionsFromServer();
          toast.success(`${role} permissions updated`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update role permissions");
          await value.loadRolePermissionsFromServer();
        }
      };
      void run();
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
      const run = async () => {
        try {
          await rolePermissionApi.editSpecial(role, special);
          await value.loadRolePermissionsFromServer();
          toast.success(`${role} permissions updated`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update role permissions");
          await value.loadRolePermissionsFromServer();
        }
      };
      void run();
    },

    updateUserPermissionOverrides: (userId, overrides) => {
      if (guardForbidden("permissions", "edit")) return;
      const u = s.users.find((x) => x.id === userId);
      if (!u) return;
      patch((p) => ({
        ...p,
        users: p.users.map((x) => (x.id === userId ? { ...x, permissionOverrides: overrides } : x)),
      }));
      const run = async () => {
        try {
          await userApi.setPermissionOverrides(Number(userId), overrides ?? null);
          log(
            "User Permission Override",
            u.name,
            "",
            "",
            overrides ? "set custom overrides" : "reset to role default",
          );
          toast.success(`${u.name}'s permissions updated`);
          if (userId === s.currentUserId) await value.syncCurrentUser();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save permissions");
        }
        await value.loadUsersFromServer();
      };
      void run();
    },

    // Persisted immediately, not just in React state - a device that just
    // registered but hasn't logged in yet still needs to survive a refresh
    // as "registered, please sign in" rather than reverting to "please
    // register" (confirmed live: this was missing, so any refresh between
    // Register Device and the first staff login bounced back to the
    // registration screen even though the exe already had the hotel's
    // real data pulled down).
    registerDevice: () => {
      patch((p) => ({ ...p, deviceRegistered: true }));
    },
    applyServerIdentity: (registered, hotelName) => {
      patch((p) =>
        p.deviceRegistered === registered && p.serverHotelName === hotelName
          ? p
          : { ...p, deviceRegistered: registered, serverHotelName: hotelName },
      );
    },
    loadSession: async () => {
      const [id] = await Promise.all([
        value.syncCurrentUser(),
        value.loadRolePermissionsFromServer(),
      ]);
      if (!id) return false;
      patch((p) => ({ ...p, currentUserId: id, sessionReady: true }));
      return true;
    },
    resetDeviceRegistration: () => {
      patch((p) => ({
        ...p,
        deviceRegistered: false,
        authed: false,
        sessionUser: null,
        sessionReady: false,
      }));
      setStoredAuthToken(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("billerpe.session", JSON.stringify({ authed: false }));
      }
    },
    login: (userId) => {
      const id = userId ?? s.currentUserId;
      patch((p) => ({ ...p, authed: true, currentUserId: id }));
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "billerpe.session",
          JSON.stringify({ userId: id, authed: true }),
        );
      }
    },
    // Signing out a staff member doesn't un-register the device - the exe
    // already has this hotel's real data either way - so this only clears
    // `authed`, keeping `device: true` so the next load shows the sign-in
    // tabs, not the registration screen again.
    logout: () => {
      patch((p) => ({ ...p, authed: false, sessionUser: null, sessionReady: false }));
      setStoredAuthToken(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("billerpe.session", JSON.stringify({ authed: false }));
      }
    },
    syncCurrentUser: async () => {
      try {
        const { access } = await userApi.getCurrentUserAccess();
        const mapped = mapRawUser(access);
        patch((p) => ({
          ...p,
          sessionUser: mapped,
          users: p.users.some((u) => u.id === mapped.id)
            ? p.users.map((u) => (u.id === mapped.id ? mapped : u))
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
          const existing = o.lines.find(
            (l) =>
              l.itemId === input.itemId &&
              l.kotRound === UNSENT_ROUND &&
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
            kotRound: UNSENT_ROUND,
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
        return false;
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
        // Hold/Running with zero items blocking the table for everyone else.
        if (newQty <= 0 && order.lines.length === 1) freeEmptyDraft(order);
      }
      return true;
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
        // Hold/Running with zero items blocking the table for everyone else.
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

    removeLine: (orderId, lineId, module, reason) => {
      const order = s.orders.find((o) => o.id === orderId);
      const line = order?.lines.find((l) => l.id === lineId);
      if (
        line &&
        order &&
        line.kotRound <= order.kotRounds &&
        guardForbidden(module, "delete", "Delete an item already sent to the kitchen")
      ) {
        return false;
      }
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o,
        ),
      }));
      if (order && line) {
        // reason is only ever passed for an already-fired line (the UI's
        // own confirm dialog is the one place that collects it - a line
        // still in the current draft cart needs no justification to edit).
        // Was already tracked before this (entity/before already carried
        // the bill number and item+qty), just never WITH a stated reason.
        log(
          "Item Removed",
          `Order #${order.orderNo}`,
          `${line.name} ×${line.qty}`,
          "Removed",
          reason,
        );
        // Nothing left on this table/pickup order - don't leave it sitting
        // Hold/Running with zero items blocking the table for everyone else.
        if (order.lines.length === 1) freeEmptyDraft(order);
      }
      return true;
    },

    // Used to be a pure local state.orders patch - flipped status to "Hold"
    // in memory only, never called the backend. POST /holdOrder already
    // exists and already persists Order.status "hold"/Table.table_status
    // "H" server-side (confirmed reading controller/kto.js#holdOrder) and
    // loadTablesFromServer already knows how to reconstruct a "hold" order
    // back into "Hold" on reload (mapRawLiveOrder's status map) - so the
    // fix is wiring this button to that endpoint, the same way generateKot
    // wires Send KOT to /kotOrder, not adding new reload logic. Without
    // this, a held-only order (never KOT'd/Saved) had no backendId, so
    // getActiveOrders() never saw it and it vanished on refresh - exactly
    // the reported bug.
    holdOrder: (orderId) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      // Same "not yet fired" set as generateKot's `pending` - hold's own
      // destroy-then-recreate on the backend only targets OrderDetails rows
      // still in "in-progress" status (i.e. never through a real KOT
      // round), so anything already fired is left alone there and doesn't
      // belong in this payload either.
      const pending = o.lines.filter((l) => l.kotRound > o.kotRounds);
      if (!pending.length) {
        toast.info("Nothing to hold", { description: "Add items before holding this order." });
        return;
      }

      const billSettings: BillSettings = {
        serviceCharge: s.serviceCharge,
        deliveryChargeRule: s.deliveryChargeRule,
        packagingChargeRule: s.packagingChargeRule,
        taxRules: s.taxRules,
        invoiceFormat: s.invoiceFormat,
        tables: s.tables,
        menuItems: s.menuItems,
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
          const res = await orderApi.holdOrder({
            order_type: o.type === "Dine In" ? "dinin" : "pickup",
            ...(o.backendId ? { order_id: o.backendId } : {}),
            ...(o.type === "Dine In" && table
              ? { table_id: Number(table.id), tableNumber: table.name }
              : {}),
            userName: o.customerName,
            mobile: o.customerPhone,
            gstin: o.customerGstin,
            address: o.customerAddress,
            cart: {
              gst: totals.tax,
              totalDiscount: totals.discount,
              grandAmount: totals.grand,
              myAmount: totals.subtotal,
              service_charger: totals.service,
              delivery_charge: totals.delivery,
              packaging_charge: totals.packaging,
              ...discountPayload(o, totals),
              taxes: buildCartTaxes(totals, s.taxRules),
              items: [{ status: "H", menuItems: menuItemsPayload }],
            },
          });
          const backendId = res.orderId;
          // billNo is the real bill number to ever show a user (see its own
          // comment on Order) - orderNo derived from it the same way a
          // server-loaded order already is (parseBillNoAsOrderNo), instead
          // of the raw backendId this used to fall back to, which is a
          // completely different number from the actual bill_no and was
          // confirmed live as a cause of the printed bill's number not
          // matching the order list for the same order.
          const billNo = res.bill_no;
          const orderNo = billNo ? parseBillNoAsOrderNo(billNo, backendId) : backendId;
          patch((p) => ({
            ...p,
            orders: p.orders.map((x) =>
              x.id === orderId ? { ...x, status: "Hold", backendId, orderNo, billNo } : x,
            ),
            tables: p.tables.map((t) => (t.id === o.tableId ? { ...t, status: "Hold" } : t)),
          }));
          log("Order Hold", `Order #${backendId}`, o.status ?? "", "Hold");
          toast.success(`Order #${backendId} on hold`, { description: o.tableLabel });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not hold order");
        }
      };
      void run();
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

    cancelOrder: (orderId, reason) => {
      const o = s.orders.find((x) => x.id === orderId);
      // Deleting a WHOLE order used to have no gate at all - any role could
      // cancel/soft-delete an order with real, already-fired KOT lines
      // (food already sent to the kitchen) with just a confirmation click,
      // confirmed live: controller/order.js's deleteOrder itself does no
      // status-transition check either, by its own comment. The
      // "orders.deleteOrder" special permission already exists with real
      // role defaults (mock/data.ts's ROLE_SPECIAL_DEFAULTS - Owner/
      // Manager true, everyone else false) - it just was never actually
      // wired to this flow. Only gates when the order has something real
      // fired on it; an order with nothing sent yet (still a Hold/empty
      // draft) cancels freely regardless of role, same as before - this
      // isn't about locking down every accidental "opened the wrong
      // table" undo, just the case staff specifically flagged.
      const hasFiredItems = (o?.lines ?? []).some((l) => l.kotRound <= (o?.kotRounds ?? 0));
      if (
        hasFiredItems &&
        guardForbiddenSpecial(
          "orders.deleteOrder",
          "Cancel an order with items already sent to the kitchen",
        )
      ) {
        return false;
      }
      patch((p) => ({
        ...p,
        // Same id-reuse fix as settleOrder's applySettlement - see its
        // comment. cancelOrder is only ever called with a real backendId
        // present (freeEmptyDraft's own comment: no backendId means no
        // real order to cancel, it just frees the table directly), so
        // there's always a stable id to rename to here.
        orders: p.orders.map((x) =>
          x.id === orderId ? { ...x, id: `o-final-${x.backendId}`, status: "Cancelled" } : x,
        ),
        tables: p.tables.map((t) =>
          t.id === o?.tableId ? { ...t, status: "Free", guests: undefined, orderId: undefined } : t,
        ),
        kots: p.kots.map((k) =>
          k.orderId === orderId
            ? { ...k, orderId: `o-final-${o?.backendId}`, status: "Cancelled" }
            : k,
        ),
      }));
      log("Order Cancelled", `Order #${o?.orderNo}`, o?.status ?? "", "Cancelled", reason);
      toast.success(`Order #${o?.orderNo} cancelled`);
      // The backend has no concept of "cancel" distinct from delete (see
      // orderApi.remove's comment) - this soft-deletes the order for
      // real, so it will not reappear anywhere, including under this
      // app's own "Cancelled" filter, once orders/orderHistory reload.
      if (!o?.backendId) return true;
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
      return true;
    },
    freeIfEmpty: (orderId) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || o.lines.length > 0) return;
      freeEmptyDraft(o);
    },
    removeOrder: (id) => value.removeOrders([id]),
    removeOrders: (ids) => {
      const targets = ids
        .map((id) => s.orders.find((x) => x.id === id) ?? s.orderHistory.find((x) => x.id === id))
        .filter((o): o is Order => !!o);
      const backendIds = targets
        .map((o) => o.backendId)
        .filter((id): id is number => id !== undefined);
      // Drops the orders and frees any table one of them was still open on.
      // Leaving the table as it was is what showed a deleted order's table
      // as "running", with an error when it was opened.
      const dropLocally = () =>
        patch((p) => {
          const tableIds = new Set(
            targets
              .filter((o) => o.tableId && !["Settled", "Cancelled"].includes(o.status))
              .map((o) => o.tableId!),
          );
          return {
            ...p,
            orders: p.orders.filter((o) => !ids.includes(o.id)),
            orderHistory: p.orderHistory.filter((o) => !ids.includes(o.id)),
            tables: p.tables.map((t) =>
              tableIds.has(t.id) || (t.orderId && ids.includes(t.orderId))
                ? {
                    ...t,
                    status: "Free",
                    guests: undefined,
                    orderId: undefined,
                    occupiedSince: undefined,
                  }
                : t,
            ),
          };
        });
      const done = () =>
        toast.success(ids.length === 1 ? "Order removed" : `${ids.length} orders removed`);
      if (!backendIds.length) {
        dropLocally();
        done();
        return;
      }
      // The exe decides (it may refuse, e.g. food already sent to the
      // kitchen needs a manager): only then does the order leave the screen.
      const run = async () => {
        try {
          if (backendIds.length === 1) await orderApi.remove(backendIds[0]!, { free: true });
          else await orderApi.removeBulk(backendIds);
          dropLocally();
          done();
          void value.loadTablesFromServer();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove the order");
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

    generateKot: (orderId, options) => {
      if (guardBlocked()) return;
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      const round = o.kotRounds + 1;
      const shouldPrint = options?.print ?? false;
      const allUnsent = o.lines.filter((l) => l.kotRound === UNSENT_ROUND);
      // A lineIds subset sends just those items this round, leaving
      // whatever's left unchecked still unsent (UNSENT_ROUND) for a later
      // round - see UNSENT_ROUND's own comment. No lineIds (or an empty
      // list) keeps the original "send everything pending" behaviour.
      const pending = options?.lineIds?.length
        ? allUnsent.filter((l) => options.lineIds!.includes(l.id))
        : allUnsent;
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
        tables: s.tables,
        menuItems: s.menuItems,
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
            userName: o.customerName,
            mobile: o.customerPhone,
            gstin: o.customerGstin,
            address: o.customerAddress,
            cart: {
              gst: totals.tax,
              totalDiscount: totals.discount,
              grandAmount: totals.grand,
              myAmount: totals.subtotal,
              service_charger: totals.service,
              delivery_charge: totals.delivery,
              packaging_charge: totals.packaging,
              ...discountPayload(o, totals),
              taxes: buildCartTaxes(totals, s.taxRules),
              items: [{ status: "H", menuItems: menuItemsPayload }],
            },
          });
          const backendId = res.kotInfo.order_id;
          const billNo = res.kotInfo.bill_no;
          const orderNo = billNo ? parseBillNoAsOrderNo(billNo, backendId) : backendId;

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
              x.id === orderId
                ? {
                    ...x,
                    kotRounds: round,
                    status: "Running",
                    backendId,
                    // startOrder's materialization (ensureRealOrder) gave
                    // this a session-local placeholder number (101, 102,
                    // ...) since no real order existed yet to derive one
                    // from. Now that the real backend order exists, orderNo/
                    // billNo are corrected to match it immediately, via the
                    // exact same parseBillNoAsOrderNo a server reload
                    // already uses - NOT the raw backendId this used to
                    // fall back to (a different number from the real
                    // bill_no entirely, confirmed live as the cause of a
                    // printed bill's number not matching the Orders list
                    // for the same order), so there's no more "#101 becomes
                    // #6 [becomes something else again]" double-jump, and
                    // the Orders list reads in real bill-number order
                    // immediately, not just after some future reload.
                    orderNo,
                    billNo,
                    // Every line used to get a real round number for free
                    // at add time (kotRounds + 1, matching whichever round
                    // fired next), so bumping kotRounds alone was enough to
                    // make the fired-check true for them. Lines now stay at
                    // UNSENT_ROUND until actually included in a send (see
                    // its own comment) - this is the step that used to be
                    // implicit, now done explicitly for just the lines that
                    // were actually part of THIS send, so a line left
                    // unchecked stays correctly unsent.
                    lines: x.lines.map((l) =>
                      pending.some((pl) => pl.id === l.id) ? { ...l, kotRound: round } : l,
                    ),
                  }
                : x,
            ),
            tables: p.tables.map((t) => (t.id === o.tableId ? { ...t, status: "Running" } : t)),
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
          // Firing a KOT and physically printing it are separate backend
          // calls (kotOrder never prints anything itself - it only returns
          // print-job data the caller has to act on, and doPrintKot/
          // localPrintApi.printKot is the only code path that actually
          // does). This used to unconditionally claim "N ticket(s)
          // printed" regardless of whether printing was even requested,
          // which was simply false - "Only KOT" callers got a lying toast
          // and nothing was ever sent to a printer.
          if (shouldPrint) {
            toast.success(`KOT round ${round} sent`, {
              description: `Sending ${newKots.length} station ticket(s) to print…`,
            });
            await doPrintKot(o, round);
          } else {
            toast.success(`KOT round ${round} sent to kitchen`);
          }
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not send KOT");
        }
      };
      void run();
    },

    applyDiscount: (orderId, label, type, value) => {
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
      // Same subtotal formula as orderTotals - kept in sync there for the
      // toast/log's own preview amount, but the stored type/value (not this
      // resolved amount) is what actually drives future recalculation.
      const subtotal = o.itemised
        ? o.lines.reduce((sum, l) => sum + lineTotal(l), 0)
        : (o.fallbackTotal ?? 0);
      const amount =
        type === "percent" ? Math.round(((subtotal * value) / 100) * 100) / 100 : value;
      patch((p) => ({
        ...p,
        orders: p.orders.map((x) =>
          x.id === orderId
            ? { ...x, discount: value ? { label, amount, type, value } : undefined }
            : x,
        ),
      }));
      log("Discount Applied", `Order #${o.orderNo}`, "₹0", `₹${amount} (${label})`);
      toast.success(value ? `Discount applied · ₹${amount}` : "Discount removed");
    },

    setCustomer: (orderId, name, phone, extra) => {
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                customerName: name,
                customerPhone: phone,
                customerAddress: extra?.address,
                customerGstin: extra?.gstin,
              }
            : o,
        ),
        // Keeps the suggestion list current: a new mobile is added, a known
        // one picks up any name/address/GSTIN typed now.
        customers: !phone
          ? p.customers
          : p.customers.some((c) => c.phone === phone)
            ? p.customers.map((c) =>
                c.phone === phone
                  ? {
                      ...c,
                      name: name || c.name,
                      address: extra?.address || c.address,
                      gstin: extra?.gstin || c.gstin,
                    }
                  : c,
              )
            : [
                {
                  id: uid("c"),
                  name,
                  phone,
                  orders: 1,
                  lastVisit: realToday(),
                  address: extra?.address,
                  gstin: extra?.gstin,
                },
                ...p.customers,
              ],
      }));
      log("Customer Attached", `Order #${o?.orderNo}`, "—", `${name} · ${phone}`);
      toast.success("Customer details saved");
    },

    setCharges: (orderId, packaging) => {
      const draft = ensureRealOrder(orderId);
      const o = s.orders.find((x) => x.id === orderId) ?? draft;
      if (!o) return;
      patch((p) => ({
        ...p,
        orders: p.orders.map((o) => (o.id === orderId ? { ...o, packagingCharge: packaging } : o)),
      }));
      log("Charges Updated", `Order #${o?.orderNo}`, "—", `Packaging ₹${packaging}`);
      toast.success("Charges updated");
    },

    generateBill: async (orderId, options) => {
      if (guardBlocked()) return { ok: false };
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return { ok: false };

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
        return { ok: true, backendId: o.backendId };
      }

      const table = o.tableId ? s.tables.find((t) => t.id === o.tableId) : undefined;
      if (!table) {
        toast.error("Could not find this order's table");
        return { ok: false };
      }

      const { cart } = dineInBillCart(o);

      const run = async (): Promise<{ ok: boolean; backendId?: number }> => {
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
            userName: o.customerName,
            mobile: o.customerPhone,
            gstin: o.customerGstin,
            address: o.customerAddress,
            cart,
          });
          const backendId = o.backendId ?? res.orderId;
          const billNo = res.bill_no;
          const orderNo =
            billNo && backendId != null
              ? parseBillNoAsOrderNo(billNo, backendId)
              : (backendId ?? o.orderNo);
          patch((p) => ({
            ...p,
            orders: p.orders.map((x) =>
              // Same orderNo/billNo correction as generateKot's own patch -
              // see its comment. This is the OTHER path an order first gets
              // a real backendId through (billing without ever sending a
              // KOT), so it needs the same fix.
              x.id === orderId ? { ...x, status: "Bill Generated", backendId, orderNo, billNo } : x,
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
          return { ok: true, backendId };
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not generate bill");
          return { ok: false };
        }
      };
      return run();
    },

    settleOrder: (orderId, payments, tip) => {
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
      // Dine-in no longer needs a saved order first: saveAndSettle below
      // saves and settles in one call. Pickup still settles through the
      // order it was saved as.
      if (o.type !== "Dine In" && !o.backendId) {
        toast.error("Send a KOT first, then settle this order");
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
        let backendId = o.backendId;
        // A never-saved order only gets its real bill number now.
        let orderNo = o.orderNo;
        let billNo = o.billNo;
        try {
          if (o.type === "Dine In") {
            // Already billed and nothing changed since: settle that bill.
            // Anything else (never saved, running without a bill, or items
            // added since) is saved and settled in ONE call, so what gets
            // settled is exactly what is on screen.
            const upToDate =
              !!o.backendId &&
              o.status === "Bill Generated" &&
              o.lines.every((l) => Number.isFinite(l.kotRound));
            if (upToDate) {
              await orderApi.settleBills({
                id: o.backendId!,
                amount: settleTotal,
                cash: cashAmt,
                upi: upiAmt,
                card: cardAmt,
                due: dueAmt,
                ...(tip ? { tip } : {}),
                ...(dueAmt > 0 && o.customerPhone ? { mobile: o.customerPhone } : {}),
              });
            } else {
              if (!o.tableId || !o.lines.length) {
                toast.error("Add items to this table before settling");
                return;
              }
              const { cart } = dineInBillCart(o);
              const res = await orderApi.saveAndSettle({
                order_type: "dinin",
                ...(o.backendId ? { order_id: o.backendId } : {}),
                table_id: Number(o.tableId),
                userName: o.customerName,
                mobile: o.customerPhone,
                gstin: o.customerGstin,
                address: o.customerAddress,
                cart,
                payment: {
                  amount: settleTotal,
                  cash: cashAmt,
                  upi: upiAmt,
                  card: cardAmt,
                  due: dueAmt,
                  ...(tip ? { tip } : {}),
                  ...(dueAmt > 0 && o.customerPhone ? { mobile: o.customerPhone } : {}),
                },
              });
              backendId = res.orderId;
              if (res.bill_no) {
                billNo = res.bill_no;
                orderNo = parseBillNoAsOrderNo(res.bill_no, res.orderId);
              }
            }
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
              tables: s.tables,
              menuItems: s.menuItems,
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
              userName: o.customerName,
              mobile: o.customerPhone,
              gstin: o.customerGstin,
              address: o.customerAddress,
              cart: {
                items: [{ status: "H", menuItems: allMenuItems }],
                gst: totals.tax,
                totalDiscount: totals.discount,
                grandAmount: totals.grand,
                myAmount: totals.subtotal,
                service_charger: totals.service,
                delivery_charge: totals.delivery,
                packaging_charge: totals.packaging,
                ...discountPayload(o, totals),
                taxes: buildCartTaxes(totals, s.taxRules),
              },
            });
          }
          applySettlement(backendId, orderNo, billNo);
          log("Bill Settled", `Order #${orderNo}`, o.status, `Settled · ${mode} ₹${total}`);
          toast.success(`Order #${orderNo} settled`, {
            description:
              payments.map((p) => `${p.mode} ₹${p.amount}`).join(" + ") +
              (tip ? ` · Tip ₹${tip}` : ""),
          });
        } catch (err) {
          // Saved but not settled (e.g. the payment was refused): the table
          // now holds a real generated bill - show it that way so settling
          // again takes the normal path.
          const saved =
            err instanceof ApiError
              ? (err.details as { saved?: boolean; orderId?: number; bill_no?: string } | undefined)
              : undefined;
          if (saved?.saved && saved.orderId) {
            const savedId = saved.orderId;
            patch((p) => ({
              ...p,
              orders: p.orders.map((x) =>
                x.id === orderId
                  ? {
                      ...x,
                      status: "Bill Generated",
                      backendId: savedId,
                      lines: x.lines.map((l) =>
                        Number.isFinite(l.kotRound) ? l : { ...l, kotRound: 1 },
                      ),
                      ...(saved.bill_no
                        ? {
                            billNo: saved.bill_no,
                            orderNo: parseBillNoAsOrderNo(saved.bill_no, savedId),
                          }
                        : {}),
                    }
                  : x,
              ),
              tables: p.tables.map((t) =>
                t.id === o.tableId ? { ...t, status: "Bill Generated" } : t,
              ),
            }));
          }
          toast.error(err instanceof ApiError ? err.message : "Could not settle order");
        }
      };

      const applySettlement = (
        bid: number | undefined,
        orderNo: Order["orderNo"],
        billNo: Order["billNo"],
      ) =>
        patch((p) => ({
          ...p,
          orders: p.orders.map((x) =>
            x.id === orderId
              ? {
                  ...x,
                  // startOrder hands back a DETERMINISTIC id
                  // (`draft-table-<tableId>`) so re-clicking the same
                  // table before any real content exists doesn't spawn
                  // two different phantom drafts - but that means the
                  // same id gets reused for every order ever started on
                  // this table. Once an order is genuinely finished, it
                  // needs a permanent identity of its own so the next
                  // startOrder() on this table (same deterministic id)
                  // doesn't resolve straight back to this settled one via
                  // orderById's own s.orders lookup - confirmed live as
                  // exactly that: reopening the table after settling
                  // silently reopened the OLD settled bill (menu
                  // disabled, since its status was already "Settled")
                  // instead of starting a fresh order.
                  id: `o-final-${bid}`,
                  backendId: bid,
                  orderNo,
                  billNo,
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
                    billNo: `#${orderNo}`,
                    customerName: o.customerName ?? "Guest",
                    mobile: o.customerPhone ?? "",
                    date: realToday(),
                    daysAgo: 0,
                    amount: duePortion,
                    status: "Due" as const,
                    // Tagged immediately so this bill is settleable from
                    // the Due Bills screen right away, without waiting for
                    // the next loadDueBillsFromServer to pick it up.
                    backendOrderId: bid,
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
          // Keep KOT records pointed at the order's new permanent id (see
          // the id-rename comment above) rather than the now-retired
          // draft-table- id, so a later lookup like `kots.filter(k =>
          // k.orderId === order.id)` still finds them.
          kots: p.kots.map((k) =>
            k.orderId === orderId ? { ...k, orderId: `o-final-${bid}` } : k,
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
                      by: currentUser.name,
                    },
                  ],
                }
              : cs,
          ),
        }));
      void run();
    },

    // reopenOrder (the plain revert-to-pending version) stays gone - no
    // backend capability exists for that (settleBills only ever operates
    // on payment:"pending" rows). What editSettledOrder.js (both backends)
    // now supports instead is narrower and safer: edit a settled order's
    // items/discount in place, re-settling only the difference against
    // what's already been collected - see AskUserQuestion decisions this
    // was built against (re-settle for the difference; refund-due is
    // lightweight, not a full reversal).
    startEditSettledOrder: (orderId) => {
      if (!canSpecial("orders.reopenSettled")) {
        toast.error("You don't have permission to edit settled orders");
        return undefined;
      }
      const original = s.orderHistory.find((o) => o.id === orderId);
      if (!original || !original.backendId) {
        toast.error("This order has no backend record to edit");
        return undefined;
      }
      const draftId = `edit-${original.backendId}`;
      if (!s.orders.some((o) => o.id === draftId)) {
        patch((p) => ({
          ...p,
          orders: [
            {
              ...original,
              id: draftId,
              status: "Running",
              editingSettledOrderId: original.backendId,
            },
            ...p.orders,
          ],
        }));
      }
      return draftId;
    },

    resumeEditSettledOrder: async (backendId) => {
      if (!canSpecial("orders.reopenSettled")) return false;
      const draftId = `edit-${backendId}`;
      if (s.orders.some((o) => o.id === draftId)) return true;
      try {
        const { order: raw } = await orderHistoryApi.getDetail(backendId);
        if (!raw || raw.payment !== "success" || (raw as { deleted?: boolean }).deleted)
          return false;
        const staffName = raw.hotelUserId
          ? (s.users.find((u) => u.id === String(raw.hotelUserId))?.name ?? "Staff")
          : "Staff";
        const original = mapRawOrderHistoryEntry(raw, staffName);
        patch((p) =>
          p.orders.some((o) => o.id === draftId)
            ? p
            : {
                ...p,
                orders: [
                  { ...original, id: draftId, status: "Running", editingSettledOrderId: backendId },
                  ...p.orders,
                ],
              },
        );
        return true;
      } catch {
        return false;
      }
    },

    cancelEditSettledOrder: (localOrderId) => {
      patch((p) => ({ ...p, orders: p.orders.filter((o) => o.id !== localOrderId) }));
    },

    saveSettledOrderEdits: async (localOrderId, payments) => {
      const o = s.orders.find((x) => x.id === localOrderId);
      if (!o || !o.editingSettledOrderId) return false;
      if (!o.lines.length) {
        toast.error("An order must have at least one item");
        return false;
      }
      let payment: Parameters<typeof editSettledOrderApi.edit>[0]["payment"];
      if (payments) {
        const unknown = payments.find((p) => !["Cash", "UPI", "Card", "Due"].includes(p.mode));
        if (unknown) {
          toast.error(`"${unknown.mode}" isn't a payment mode the backend supports yet`);
          return false;
        }
        const sum = (mode: string) =>
          payments.filter((p) => p.mode === mode).reduce((t, p) => t + p.amount, 0);
        payment = { cash: sum("Cash"), upi: sum("UPI"), card: sum("Card"), due: sum("Due") };
        if (payment.due > 0) {
          if (!o.customerPhone) {
            toast.error("Attach the customer's mobile number to keep an amount as Due");
            return false;
          }
          payment.mobile = o.customerPhone;
          if (o.customerName) payment.name = o.customerName;
          if (o.customerAddress) payment.address = o.customerAddress;
          if (o.customerGstin) payment.gstin = o.customerGstin;
        }
      }
      const billSettings: BillSettings = {
        serviceCharge: s.serviceCharge,
        deliveryChargeRule: s.deliveryChargeRule,
        packagingChargeRule: s.packagingChargeRule,
        taxRules: s.taxRules,
        invoiceFormat: s.invoiceFormat,
        tables: s.tables,
        menuItems: s.menuItems,
      };
      const totals = orderTotals(o, billSettings);
      const items = o.lines.map((l) => {
        const mi = s.menuItems.find((m) => m.id === l.itemId);
        const variant = mi?.variants?.find((v) => v.name === l.variant);
        return {
          menuId: Number(l.itemId),
          qty: l.qty,
          price: l.price,
          ...(variant ? { variantId: Number(variant.id) } : {}),
          ...(l.variant ? { variantName: l.variant } : {}),
          addons: buildAddonsPayload(l.addons),
        };
      });
      try {
        const { due } = await editSettledOrderApi.edit({
          orderId: o.editingSettledOrderId,
          items,
          totalAmount: totals.subtotal,
          gst: totals.tax,
          grandAmount: totals.grand,
          totalDiscount: totals.discount,
          ...discountPayload(o, totals),
          service_charge: totals.service,
          ...(payment ? { payment } : {}),
        });
        patch((p) => ({ ...p, orders: p.orders.filter((x) => x.id !== localOrderId) }));
        await Promise.all([value.loadOrderHistoryFromServer(), value.loadRawMaterialsFromServer()]);
        if (due < 0) {
          await value.loadRefundDueOrdersFromServer();
        } else if (due > 0) {
          await value.loadDueBillsFromServer();
        }
        log("Order Edited", `Order #${o.orderNo}`, "Settled", `updated after settlement`);
        toast.success(`Order #${o.orderNo} updated`, {
          description:
            due > 0
              ? `₹${due} now due`
              : due < 0
                ? `₹${Math.abs(due)} refund owed to customer`
                : "Fully settled, no balance",
        });
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not save changes to this order");
        return false;
      }
    },

    loadRefundDueOrdersFromServer: async () => {
      try {
        const { orders } = await refundDueApi.getAll();
        patch((p) => ({
          ...p,
          refundDueOrders: orders.map((o) => ({
            id: `refund-${o.id}`,
            // Same OFF-prefix stripping as mapRawDueOrder's own billNo -
            // see its comment.
            billNo: `#${parseBillNoAsOrderNo(o.bill_no, o.id)}`,
            amount: Math.abs(o.due),
            date: isoToDMY(o.createdAt.slice(0, 10)),
            backendOrderId: o.id,
          })),
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load refunds due");
      }
    },

    settleRefundDue: (id) => {
      const target = s.refundDueOrders.find((r) => r.id === id);
      if (!target) return;
      const run = async () => {
        try {
          await refundDueApi.settle(target.backendOrderId);
          await value.loadRefundDueOrdersFromServer();
          toast.success("Refund recorded", { description: `${target.billNo} · ₹${target.amount}` });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not record refund");
        }
      };
      void run();
    },

    mergeTables: (sourceTableId, destTableId) => {
      if (guardBlocked()) return;
      const sourceLabel = tableLabel(sourceTableId);
      const destLabel = tableLabel(destTableId);
      const src = s.tables.find((t) => t.id === sourceTableId);
      const dst = s.tables.find((t) => t.id === destTableId);
      const srcOrder = s.orders.find(
        (o) =>
          o.tableId === sourceTableId && ["Hold", "Running", "Bill Generated"].includes(o.status),
      );
      const dstOrder = s.orders.find(
        (o) =>
          o.tableId === destTableId && ["Hold", "Running", "Bill Generated"].includes(o.status),
      );
      if (!srcOrder) {
        toast.error("Source table has no active order");
        return;
      }
      // Once a bill is printed, that order is meant to be settled as-is -
      // folding more items/another table's tab into it (or into it from the
      // other side) after the guest has already seen a final total would
      // silently change what they were billed. Blocks both directions:
      // merging a billed table INTO another, and merging something INTO a
      // table whose own bill is already generated.
      if (srcOrder.status === "Bill Generated") {
        toast.error("Bill already generated", {
          description: `${sourceLabel}'s bill has already been generated — settle or reprint it instead of merging.`,
        });
        return;
      }
      if (dstOrder?.status === "Bill Generated") {
        toast.error("Bill already generated", {
          description: `${destLabel}'s bill has already been generated — settle or reprint it instead of merging into it.`,
        });
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
      // Same reasoning as mergeTables - a printed bill is meant to be
      // settled as-is, not silently moved to a different table afterward.
      if (o.status === "Bill Generated") {
        toast.error("Bill already generated", {
          description: "This order's bill has already been generated — it can no longer be moved.",
        });
        return;
      }
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
            // moveTable only moves the table on the backend - the local
            // order object still points at the source table until this
            // patches it directly, same as the local-only branch below.
            // loadTablesFromServer alone doesn't fix this: it only
            // reconstructs orders it doesn't already know locally (matched
            // by backendId), so an already-known order's own tableId/
            // tableLabel was never refreshed here, leaving the destination
            // table looking empty even though the transfer succeeded.
            patch((p) => ({
              ...p,
              orders: p.orders.map((x) =>
                x.id === orderId ? { ...x, tableId: destTableId, tableLabel: destLabel } : x,
              ),
              kots: p.kots.map((k) =>
                k.orderId === orderId ? { ...k, tableLabel: destLabel } : k,
              ),
            }));
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

      const destOccupied = ["Running", "Bill Generated", "Hold"].includes(dst.status);
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
      // Accepted/Preparing stay purely local board state (see this
      // function's own comment) - only Ready is a real cross-device signal
      // now: billerpe-local-exe/controller/kot.js#markKotReady persists it
      // and broadcasts "kotReady" to every other connected device, which is
      // what the Captain App's item-ready notifications key off.
      if (status === "Ready") {
        const kot = s.kots.find((k) => k.id === kotId);
        if (kot?.backendOrderId && kot.kotNumber) {
          void orderApi.markKotReady(kot.backendOrderId, kot.kotNumber).catch(() => {
            // Best-effort: the local board already shows Ready either way,
            // this only affects other devices' visibility into it.
          });
        }
      }
    },

    rejectKot: (kotId, reason) => {
      const k = s.kots.find((x) => x.id === kotId);
      if (!k) return;
      patch((p) => ({
        ...p,
        kots: p.kots.map((x) => (x.id === kotId ? { ...x, status: "Cancelled" } : x)),
        notifications: [
          {
            id: uid("n"),
            title: "Kitchen rejected an item",
            body: `${k.tableLabel} · Round ${k.round} · ${k.items.map((i) => i.name).join(", ")}${reason ? ` — ${reason}` : ""}`,
            at: nowStamp(),
            read: false,
            kind: "order",
          },
          ...p.notifications,
        ],
      }));
      toast.success("KOT rejected", { description: reason || undefined });
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

    // Real cloud reservations (uat-backend-v2's TableBooking) - see
    // reservationApi's own comment in api.ts for why this is cloud-routed
    // rather than local-exe. Table status ("Reserved") is NOT set here on
    // create - the real automation is a node-schedule job on the cloud
    // that flips the table's own status at start_time, which the normal
    // loadTablesFromServer poll already picks up on its own; setting it
    // locally too would just be a redundant guess.
    loadReservationsFromServer: async () => {
      try {
        const { bookings } = await reservationApi.getAll();
        patch((p) => ({ ...p, reservations: bookings.map(mapRawReservation) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load reservations");
      }
    },

    createReservation: async (r) => {
      try {
        await reservationApi.create({
          name: r.customerName,
          email: r.email,
          number: r.mobile,
          booking_date: r.date,
          start_time: r.startTime,
          end_time: r.endTime,
          no_of_person: r.party,
          totalAmount: r.totalAmount,
          gst_no: r.gstNo,
          advance: r.advance,
          table_name: r.tableIds.map(Number),
        });
        await value.loadReservationsFromServer();
        toast.success("Reservation created", {
          description: `${r.customerName} · ${r.party} guests`,
        });
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not create reservation");
        return false;
      }
    },

    updateReservation: async (id, r) => {
      try {
        await reservationApi.update(Number(id), {
          name: r.customerName,
          email: r.email,
          number: r.mobile,
          booking_date: r.date,
          start_time: r.startTime,
          end_time: r.endTime,
          no_of_person: r.party,
          totalAmount: r.totalAmount,
          gst_no: r.gstNo,
          advance: r.advance,
          table_name: r.tableIds.map(Number),
        });
        await value.loadReservationsFromServer();
        toast.success("Reservation updated", {
          description: `${r.customerName} · ${r.party} guests`,
        });
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not update reservation");
        return false;
      }
    },

    cancelReservation: async (id) => {
      const r = s.reservations.find((x) => x.id === id);
      try {
        await reservationApi.remove(Number(id));
        patch((p) => ({ ...p, reservations: p.reservations.filter((x) => x.id !== id) }));
        toast.success("Reservation cancelled", { description: r?.customerName });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not cancel reservation");
      }
    },

    // Walk-in waitlist - see model/queueEntry.js's own comment (exe-only,
    // no cloud sync at all, unlike reservations above).
    loadQueueFromServer: async () => {
      try {
        const { queue } = await queueApi.getAll();
        patch((p) => ({ ...p, queue: queue.map(mapRawQueueEntry) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load the waitlist queue");
      }
    },

    addToQueue: async (name, mobile, partySize) => {
      try {
        const { queue } = await queueApi.add({ name, mobile, party_size: partySize });
        patch((p) => ({ ...p, queue: queue.map(mapRawQueueEntry) }));
        toast.success(`${name} added to the waitlist`, { description: `Party of ${partySize}` });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not add to the waitlist");
      }
    },

    seatQueueEntry: async (id) => {
      const entry = s.queue.find((x) => x.id === id);
      if (!entry) return;
      try {
        const { entry: raw } = await queueApi.updateStatus(entry.backendId, "seated");
        const updated = mapRawQueueEntry(raw);
        patch((p) => ({ ...p, queue: p.queue.map((x) => (x.id === id ? updated : x)) }));
        toast.success(`${entry.name} seated`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not update the waitlist entry");
      }
    },

    markQueueEntryNoShow: async (id) => {
      const entry = s.queue.find((x) => x.id === id);
      if (!entry) return;
      try {
        const { entry: raw } = await queueApi.updateStatus(entry.backendId, "no_show");
        const updated = mapRawQueueEntry(raw);
        patch((p) => ({ ...p, queue: p.queue.map((x) => (x.id === id ? updated : x)) }));
        toast.success(`${entry.name} marked as no-show`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not update the waitlist entry");
      }
    },

    cancelQueueEntry: async (id) => {
      const entry = s.queue.find((x) => x.id === id);
      if (!entry) return;
      try {
        const { entry: raw } = await queueApi.updateStatus(entry.backendId, "cancelled");
        const updated = mapRawQueueEntry(raw);
        patch((p) => ({ ...p, queue: p.queue.map((x) => (x.id === id ? updated : x)) }));
        toast.success(`${entry.name} removed from the waitlist`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not update the waitlist entry");
      }
    },

    // The call itself is a plain tel: link (browsers hand this off to the
    // OS's own default calling app - there's no telephony backend to place
    // a real call from, see controller/queue.js's own comment). Fires
    // regardless of whether the "mark called" write below succeeds, since
    // the actual call doesn't depend on that bookkeeping.
    callQueueEntry: async (id) => {
      const entry = s.queue.find((x) => x.id === id);
      if (!entry) return;
      try {
        const { entry: raw } = await queueApi.markCalled(entry.backendId);
        const updated = mapRawQueueEntry(raw);
        patch((p) => ({ ...p, queue: p.queue.map((x) => (x.id === id ? updated : x)) }));
      } catch {
        // Best-effort - a failed "mark called" write should never block
        // actually placing the call below.
      }
      window.location.href = `tel:${entry.mobile}`;
    },

    clearQueue: async () => {
      try {
        const { queue } = await queueApi.clear();
        patch((p) => ({ ...p, queue: queue.map(mapRawQueueEntry) }));
        toast.success("Waitlist cleared");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not clear the waitlist");
      }
    },

    openSession: (float) => {
      const run = async () => {
        try {
          await cashSessionApi.open(float);
          await value.loadCashSessionsFromServer();
          toast.success("Cash session opened", { description: `Opening float ₹${float}` });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not open cash session");
        }
      };
      void run();
    },

    addCash: (amount, reason) => {
      const run = async () => {
        try {
          await cashSessionApi.addMovement({ type: "Add", amount, reason });
          await value.loadCashSessionsFromServer();
          toast.success(`₹${amount} added to drawer`, { description: reason });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not add cash");
        }
      };
      void run();
    },

    withdrawCash: (amount, reason) => {
      // Same balance check the backend itself enforces - done here too so
      // the dialog gets an instant answer instead of waiting on a
      // round-trip; the server call below is still the authoritative one.
      const open = s.cashSessions.find((c) => c.status === "Open");
      const balance = open ? open.movements.reduce((sum, m) => sum + m.amount, 0) : 0;
      if (amount > balance) {
        toast.error("Withdrawal blocked", {
          description: `Amount exceeds the drawer balance of ₹${balance}. No override is available.`,
        });
        return false;
      }
      const run = async () => {
        try {
          await cashSessionApi.addMovement({ type: "Withdraw", amount, reason });
          await value.loadCashSessionsFromServer();
          log("Cash Withdrawn", "Cash Session", `₹${balance}`, `₹${balance - amount}`, reason);
          toast.success(`₹${amount} withdrawn`, { description: reason });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not withdraw cash");
        }
      };
      void run();
      return true;
    },

    attachExpense: (headId, amount, note, date) => {
      const head = s.expenseHeads.find((h) => h.id === headId);
      const headBackendId = headId.startsWith("eh-")
        ? Number(headId.replace("eh-", ""))
        : undefined;
      const run = async () => {
        try {
          if (headBackendId) {
            await expenseApi.create({
              expense_head_id: headBackendId,
              amount,
              paymentMode: "Cash",
              reason: note,
              addExpense: true,
              date,
            });
            await value.loadExpensesFromServer();
          }
          await cashSessionApi.addMovement({
            type: "Expense",
            amount,
            reason: `${head?.name ?? "Expense"} — ${note}`,
          });
          await value.loadCashSessionsFromServer();
          log("Expense Added", head?.name ?? "Expense", "—", `₹${amount} · Cash · ${note}`);
          toast.success("Expense attached to session", {
            description: `${head?.name} · ₹${amount}`,
          });
          return true;
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not attach expense to cash session",
          );
          return false;
        }
      };
      return run();
    },

    closeSession: (counted, reason) => {
      const open = s.cashSessions.find((c) => c.status === "Open");
      if (!open) return;
      const expected = open.movements.reduce((sum, m) => sum + m.amount, 0);
      const run = async () => {
        try {
          await cashSessionApi.close({
            counted_cash: counted,
            variance_reason: reason || undefined,
          });
          await value.loadCashSessionsFromServer();
          log(
            "Cash Session Closed",
            open.id,
            `Expected ₹${expected}`,
            `Counted ₹${counted}`,
            reason,
          );
          toast.success("Cash session closed", {
            description:
              counted === expected
                ? "No variance recorded."
                : `Variance ₹${counted - expected} recorded with explanation.`,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not close cash session");
        }
      };
      void run();
    },

    sessionBalance: () => {
      const open = s.cashSessions.find((c) => c.status === "Open");
      return open ? open.movements.reduce((sum, m) => sum + m.amount, 0) : 0;
    },
    openSessionRecord: () => s.cashSessions.find((c) => c.status === "Open"),

    // Cash Sessions is confirmed out of scope for the Local EXE (no local
    // model) - this will always fail while working through it, so unlike
    // every other load*FromServer here, a failure here does NOT toast.
    // Confirmed live: toasting on every mount of a screen that will never
    // succeed offline is pure noise, not an actionable error - the
    // distinction from a genuine transient failure (which should and does
    // still toast elsewhere) matters here.
    loadCashSessionsFromServer: async () => {
      try {
        const { sessions } = await cashSessionApi.getSessions();
        patch((p) => ({ ...p, cashSessions: sessions.map(mapRawCashSession) }));
      } catch (err) {
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
        toast.error(
          err instanceof ApiError ? err.message : "Could not load cash sessions from server",
        );
      }
    },

    loadMenuFromServer: async () => {
      try {
        const [{ menuCatalogs }, { catagories }, { menu }, { variants }, { addons }] =
          await Promise.all([
            menuApi.getMenuCatalogs(),
            menuApi.getCategories(),
            menuApi.getItemsWithVariants(),
            menuApi.getVariants(),
            menuApi.getAddonGroups(),
          ]);
        const mappedMenus = menuCatalogs.map(mapRawMenuCatalog);
        // Every hotel always has a real default catalogue, so this only
        // ever matters for a category/variant/addon-group row that somehow
        // has no menu_catalog_id of its own (see the mappers' own comment).
        const fallbackMenuId =
          mappedMenus.find((m) => m.isDefault)?.id ?? mappedMenus[0]?.id ?? "menu-default";
        patch((p) => ({
          ...p,
          // Keep the local list on an empty fetch (shouldn't happen given
          // every hotel always has one, but avoids the "Viewing menu"
          // selector going empty for a moment on a transient race).
          menus: mappedMenus.length ? mappedMenus : p.menus,
          menuCategories: catagories.map((c) => mapRawMenuCategory(c, fallbackMenuId)),
          menuItems: menu.map((m) => mapRawMenuItem(m, fallbackMenuId)),
          variantMasters: variants
            .filter((v) => v.active)
            .map((v) => mapRawVariant(v, fallbackMenuId)),
          addonGroups: addons.map((g) => mapRawAddonGroup(g, fallbackMenuId)),
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
    // Wired to the real backend: resolves/creates each row's category then
    // creates-or-edits the item, looping sequentially (not Promise.all) so
    // two rows sharing a brand-new category name can't both race the
    // backend's create-category call and collide on its duplicate-name
    // check. An existing item is matched by name (case-insensitive, same
    // rule as the backend's own duplicate-category check) and updated in
    // place instead of always inserting - re-importing the same CSV twice
    // used to duplicate every item.
    bulkImportMenuItems: (rows, menuId, onProgress) => {
      const run = async () => {
        let createdCount = 0;
        let updatedCount = 0;
        try {
          const categoryIdByName = new Map(
            s.menuCategories
              .filter((c) => c.menuId === menuId)
              .map((c) => [c.name.trim().toLowerCase(), c.id] as const),
          );
          const itemIdByName = new Map(
            s.menuItems.map((i) => [i.name.trim().toLowerCase(), i.id] as const),
          );
          const seed = String(Date.now()).slice(-6);

          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const catKey = r.categoryName.trim().toLowerCase();
            let categoryId = categoryIdByName.get(catKey);
            if (!categoryId) {
              try {
                await menuApi.createCategory(r.categoryName.trim(), Number(menuId));
              } catch {
                // May already exist server-side (this session's local
                // category list is stale) - fall through to the lookup
                // below regardless of why the create call failed.
              }
              const { catagories } = await menuApi.getCategories();
              const found = catagories.find((x) => x.menu_categ_nm.trim().toLowerCase() === catKey);
              if (!found) throw new Error(`Could not create category "${r.categoryName}"`);
              categoryId = String(found.id);
              categoryIdByName.set(catKey, categoryId);
            }

            const payload = {
              item_name: r.name.trim(),
              menu_categ_id: Number(categoryId),
              price: r.price,
              shortCode: toShortCode(r.sku, r.name, `${seed}${i}`),
              favorite: false,
              gst_type: "S" as const,
              barcode_value: "",
              addons: [] as number[],
              variants: [] as { id: number; variant_price: number }[],
            };
            const nameKey = r.name.trim().toLowerCase();
            const existingItemId = itemIdByName.get(nameKey);
            if (existingItemId) {
              await menuApi.editItem({ ...payload, id: Number(existingItemId) });
              updatedCount++;
            } else {
              await menuApi.createItem(payload);
              createdCount++;
            }
            onProgress?.(i + 1, rows.length);
          }
          await value.loadMenuFromServer();
          toast.success(`${rows.length} row(s) imported`, {
            description: `${createdCount} created, ${updatedCount} updated`,
          });
        } catch (err) {
          await value.loadMenuFromServer();
          toast.error(err instanceof ApiError ? err.message : "Could not import all menu items", {
            description:
              createdCount || updatedCount
                ? `${createdCount + updatedCount} of ${rows.length} row(s) completed before this failed.`
                : undefined,
          });
        }
      };
      return run();
    },
    upsertMenuCategory: (c) => {
      const isNew = !s.menuCategories.some((x) => x.id === c.id);
      // Both bugs below trace back to the same root cause: uat-backend-v2's
      // create-category endpoint has no rank field at all - it always
      // auto-assigns rank = current-max + 1 and ignores anything sent -
      // while its edit endpoint blindly overwrites one row's rank with
      // whatever number it's given, never touching siblings. Neither path
      // keeps ranks unique/contiguous, so two categories can end up with
      // the same rank; the *next* reload's re-sort (a stable sort, so ties
      // fall back to whatever order the server happened to return rows in)
      // can then show categories in a different relative order than
      // before - which reads as "other categories' sort order changed on
      // their own" even though no other row's rank value actually moved.
      // The fix treats "Sort order" as "move to this position" and
      // reflows every category in view to a clean 1..N ranking, only
      // pushing an edit for rows whose rank actually needs to change.
      const run = async () => {
        try {
          const inView = s.menuCategories.filter((x) => x.menuId === c.menuId);
          let ordered: MenuCategory[];
          if (isNew) {
            await menuApi.createCategory(c.name, Number(c.menuId));
            // Need the backend-assigned id before this new row can be
            // repositioned - loadMenuFromServer's own patch() wouldn't be
            // visible through this closure's stale `s` snapshot, so fetch
            // directly instead of relying on a reload here.
            const { catagories } = await menuApi.getCategories();
            const created = catagories.find(
              (x) => x.menu_categ_nm.toLowerCase() === c.name.trim().toLowerCase(),
            );
            if (!created) throw new Error("Category was created but could not be found again");
            const newCat: MenuCategory = {
              id: String(created.id),
              name: c.name,
              active: c.active,
              sortOrder: created.rank ?? created.id,
              menuId: c.menuId,
            };
            ordered = [...inView, newCat];
          } else {
            ordered = inView.map((x) => (x.id === c.id ? { ...x, name: c.name } : x));
          }
          const targetId = isNew ? ordered[ordered.length - 1].id : c.id;
          const withoutTarget = ordered
            .filter((x) => x.id !== targetId)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const target = ordered.find((x) => x.id === targetId)!;
          const clampedPosition = Math.max(
            1,
            Math.min(c.sortOrder ?? ordered.length, ordered.length),
          );
          withoutTarget.splice(clampedPosition - 1, 0, target);
          const reflowed = withoutTarget.map((x, i) => ({ ...x, sortOrder: i + 1 }));

          await Promise.all(
            reflowed
              .filter((x) => {
                const before = ordered.find((o) => o.id === x.id);
                return !before || before.sortOrder !== x.sortOrder || x.id === targetId;
              })
              .map((x) =>
                menuApi.editCategory(Number(x.id), x.name, x.sortOrder, Number(c.menuId)),
              ),
          );
          await value.loadMenuFromServer();
          toast.success("Category saved", { description: c.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save category");
        }
      };
      void run();
    },
    removeMenuCategory: (id) => {
      if (s.menuItems.some((i) => i.categoryId === id && i.active)) {
        toast.error("Category is in use", {
          description: "Deactivate or move its active items first.",
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
    removeMenuCategories: (ids) => {
      const blocked = ids.filter((id) => s.menuItems.some((i) => i.categoryId === id && i.active));
      const removable = ids.filter((id) => !blocked.includes(id));
      if (!removable.length) {
        toast.error("Selected categories are in use", {
          description: "Deactivate or move their active items first.",
        });
        return;
      }
      const run = async () => {
        try {
          await menuApi.removeCategories(removable.map(Number));
          await value.loadMenuFromServer();
          toast.success(
            `${removable.length} categor${removable.length === 1 ? "y" : "ies"} removed`,
            {
              description: blocked.length
                ? `${blocked.length} skipped — still has active item(s).`
                : undefined,
            },
          );
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove categories");
        }
      };
      void run();
    },
    upsertVariant: (v) => {
      const isNew = !s.variantMasters.some((x) => x.id === v.id);
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createVariant(v.name, true, Number(v.menuId));
          } else {
            await menuApi.editVariant(Number(v.id), v.name, true, Number(v.menuId));
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
          await menuApi.editVariant(Number(id), v.name, false, Number(v.menuId));
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
        menu_catalog_id: Number(g.menuId),
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
      const callId = ++tablesLoadSeq.current;
      try {
        const [{ tables }, { tableCatagories }, { order: activeOrders }] = await Promise.all([
          tableApi.getTables(),
          tableApi.getCategories(),
          orderApi.getActiveOrders(),
        ]);
        if (callId !== tablesLoadSeq.current) return;
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
        // getActiveOrders now bundles OrderDetails directly (see its own
        // comment in api.ts) - no more per-row getDetail follow-up needed
        // to reconstruct a full local Order from an unresolved active one.
        const staffNameFor = (raw: RawOrderDetail) =>
          raw.hotelUserId
            ? (s.users.find((u) => u.id === String(raw.hotelUserId))?.name ?? "Staff")
            : "Staff";
        const toResolve = activeOrders.filter((o) => !knownBackendIds.has(o.id));
        const resolved = toResolve.map((raw) => {
          const tableId = raw.TableId ? String(raw.TableId) : undefined;
          return mapRawLiveOrder(raw, staffNameFor(raw), tableId);
        });
        const freshByBackendId = new Map(
          activeOrders.map((raw) => [
            raw.id,
            mapRawLiveOrder(raw, staffNameFor(raw), raw.TableId ? String(raw.TableId) : undefined),
          ]),
        );
        // Orders this session still shows as live but the server no longer
        // lists as active were settled or cancelled elsewhere (the Captain
        // App, another tab). Computed HERE rather than inside the patch
        // below: a state updater must stay pure, and React invokes it twice
        // in development. Resolved afterwards with one GET each - normally
        // zero or one order.
        const vanishedIds = s.orders
          .filter(
            (o) =>
              o.backendId !== undefined &&
              !freshByBackendId.has(o.backendId) &&
              !o.editingSettledOrderId &&
              (o.status === "Running" || o.status === "Hold" || o.status === "Bill Generated"),
          )
          .map((o) => o.backendId!)
          .filter((id): id is number => id !== undefined);
        if (callId !== tablesLoadSeq.current) return;
        patch((p) => {
          // Re-check against `p` (guaranteed current as of THIS patch),
          // not the `s`/`knownBackendIds` snapshot `resolved` was built
          // from above, before the network round-trip. A local action that
          // gives an order its backendId (holdOrder/generateKot/
          // generateBill - all patch locally, no forced refresh after) can
          // land in the gap between that snapshot and here: this same poll
          // started before it, so `resolved` still treated that order as
          // "unknown" and reconstructed it - without re-checking here, that
          // becomes a second, duplicate Order object for the same backend
          // order (confirmed live: a just-held order briefly showing twice
          // in the Running Orders list, no server-side duplication - both
          // objects pointed at the exact same real order id underneath).
          // Re-filtering with `p` instead of `s` closes the race
          // regardless of timing, rather than trying to shrink the window.
          const currentKnownIds = new Set(
            p.orders.map((o) => o.backendId).filter((id): id is number => id !== undefined),
          );
          const trulyNew = resolved.filter(
            (o) => o.backendId === undefined || !currentKnownIds.has(o.backendId),
          );
          // Prefer a freshly-resolved order for this table (a genuinely new
          // discovery this call). Otherwise, if the server's activeOrders
          // list still includes an order for this table, keep pointing at
          // whatever local order already represents it (matched by
          // backendId) - the old version here only ever set orderId for
          // NEWLY-resolved orders, silently dropping it for any order this
          // app already knew about on every repeat call (this function
          // reruns on every table-grid mount) - confirmed as the mechanism
          // behind a table losing its own orderId (and, via openOrder's own
          // resync branch, becoming unopenable with a "Could not open this
          // table's order" toast) after nothing more than revisiting the
          // table grid a second time. Reads `p.orders` here too (not
          // `s.orders`) for the same freshness reason as trulyNew above.
          const tablesWithOrders = mappedTables.map((t) => {
            const freshMatch = trulyNew.find((o) => o.tableId === t.id);
            if (freshMatch) return { ...t, orderId: freshMatch.id };
            const stillActiveBackendId = activeOrders.find(
              (o) => o.TableId !== null && String(o.TableId) === t.id,
            )?.id;
            const knownLocal =
              stillActiveBackendId !== undefined
                ? p.orders.find((o) => o.backendId === stillActiveBackendId)
                : undefined;
            return knownLocal ? { ...t, orderId: knownLocal.id } : t;
          });
          const merged = p.orders.map((o) => {
            if (o.backendId === undefined) return o;
            const fresh = freshByBackendId.get(o.backendId);
            // The merge is what makes a KOT fired on the Captain App show up
            // here at once. This used to skip any order it already knew,
            // which is exactly why a cashier had to reopen the order (or
            // wait for a 20s poll) to see it, and why the table card's total
            // disagreed with the Captain App's.
            return fresh ? mergeServerOrder(o, fresh) : o;
          });
          return {
            ...p,
            tables: tablesWithOrders,
            tableCategories: tableCatagories.map(mapRawCategory),
            orders: [...merged, ...trulyNew],
          };
        });
        if (vanishedIds.length) void value.reconcileVanishedOrders(vanishedIds);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load tables from server");
      }
    },
    // See loadTablesFromServer: a locally-live order the server no longer
    // reports as active was settled or cancelled on another device. One
    // GET /order/:id each decides which, then the local copy is finalised
    // the same way this POS's own settleOrder/cancelOrder would have.
    reconcileVanishedOrders: async (backendIds) => {
      for (const backendId of backendIds) {
        try {
          const { order: raw } = await orderHistoryApi.getDetail(backendId);
          if (!raw) continue;
          const settled = raw.payment === "success";
          const cancelled = Boolean((raw as { deleted?: boolean }).deleted);
          if (!settled && !cancelled) continue;
          patch((p) => ({
            ...p,
            orders: p.orders.map((x) =>
              x.backendId === backendId &&
              x.status !== "Settled" &&
              x.status !== "Cancelled" &&
              !x.editingSettledOrderId
                ? settled
                  ? {
                      ...x,
                      id: `o-final-${backendId}`,
                      status: "Settled",
                      settledAt: nowStamp(),
                      payments: (
                        [
                          { mode: "Cash" as const, amount: raw.cash },
                          { mode: "UPI" as const, amount: raw.upi },
                          { mode: "Card" as const, amount: raw.card },
                          { mode: "Due" as const, amount: raw.due },
                        ] satisfies PaymentSplit[]
                      ).filter((pm) => pm.amount > 0),
                    }
                  : { ...x, id: `o-final-${backendId}`, status: "Cancelled" }
                : x,
            ),
            kots: p.kots.map((k) =>
              k.backendOrderId === backendId ? { ...k, orderId: `o-final-${backendId}` } : k,
            ),
          }));
        } catch {
          // best-effort - the next refresh tries again
        }
      }
    },
    // Fills the other gap loadTablesFromServer deliberately leaves open
    // (see its own comment: it only ever discovers orders this session
    // didn't know about yet, never refreshes one it already has) - without
    // this, an order already open on screen never learns about a KOT
    // round added elsewhere (another terminal, or a QR order accepted in
    // the background) until a full page reload. Confirmed live: staff
    // reported needing to refresh to see a 2nd QR round at all.
    //
    // Only refreshes when there's nothing local to lose: if every line on
    // this order is already fired (kotRound <= kotRounds), the fresh
    // server copy is unambiguously correct and safe to replace wholesale.
    // If a draft/not-yet-fired round is being built locally (a line with
    // kotRound > kotRounds - see addToCart's own "next round" comment),
    // skip this tick rather than risk merging it wrong; the next poll
    // after that round is sent (making the order draft-free again) will
    // pick up whatever changed in the meantime.
    refreshOrderFromServer: async (orderId) => {
      const order = s.orders.find((o) => o.id === orderId);
      // An edit of a settled bill is a local copy of an order the server
      // rightly reports as paid - "refreshing" it used to treat it as just
      // settled elsewhere and replace it, so the edit screen showed "Order
      // not found - may have been settled" the moment it opened.
      if (!order?.backendId || order.editingSettledOrderId) return;
      try {
        const { order: raw } = await orderHistoryApi.getDetail(order.backendId);
        if (!raw) return;
        if (raw.payment === "success" || (raw as { deleted?: boolean }).deleted) {
          await value.reconcileVanishedOrders([order.backendId]);
          return;
        }
        const staffName = raw.hotelUserId
          ? (s.users.find((u) => u.id === String(raw.hotelUserId))?.name ?? "Staff")
          : "Staff";
        const fresh = mapRawLiveOrder(
          raw,
          staffName,
          raw.TableId ? String(raw.TableId) : order.tableId,
        );
        // mergeServerOrder keeps whatever draft round is being built here
        // and takes everything else from the server - so a KOT fired on
        // the Captain App lands on this open order immediately, even while
        // the cashier is mid-way through adding their own items.
        patch((p) => ({
          ...p,
          orders: p.orders.map((o) => (o.id === orderId ? mergeServerOrder(o, fresh) : o)),
        }));
      } catch {
        // best-effort - a failed background refresh just leaves the
        // current view as-is until the next tick
      }
    },
    upsertTable: (t) => {
      const isNew = !s.tables.some((x) => x.id === t.id);
      if (isNew && !t.name.trim()) {
        toast.error("Table name is required");
        return;
      }

      const run = async () => {
        try {
          if (isNew) {
            await tableApi.createTable({
              table_name: t.name.trim(),
              table_catag_id: Number(t.categoryId),
              type: "T",
              capacity: t.seats,
            });
          } else {
            await tableApi.editTable({
              id: Number(t.id),
              table_name: t.name,
              table_catag_id: Number(t.categoryId),
              type: "T",
              capacity: t.seats,
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
      // Names come from the bulk dialog as <prefix><number> (e.g. T1..T5).
      const parts = tables.map((t) => /^(.*?)(\d+)$/.exec(t.name.trim()));
      const prefix = parts[0]?.[1] ?? "";
      if (!parts.length || parts.some((p) => !p || p[1] !== prefix)) {
        toast.error("Table names must end in a number", {
          description: "For example T1, T2, T3 - the number is what increases.",
        });
        return;
      }
      const nums = parts.map((p) => Number(p![2]));
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
            prefix,
            capacity: tables[0]?.seats,
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
            // Always appended at the end (exe assigns max rank + 1) - the
            // Sort order field only matters for reordering existing rows.
            await tableApi.createCategory({ table_catag_nm: c.name, type: "T" });
          } else {
            await tableApi.editCategory({
              id: Number(c.id),
              table_catag_nm: c.name,
              type: "T",
              rank: c.sortOrder,
            });
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
        // Overrides now live on the exe with the user, so the server copy is
        // the truth - nothing local to carry forward.
        patch((p) => ({ ...p, users: hotelUsers.map(mapRawUser) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load users from server");
      }
    },

    // Pulls upiId plus invoiceFormateIncGst - see hotelApi's own comment for
    // why the rest of this app's InvoiceFormat stays local-only.
    // invoiceFormateIncGst is the one exception: it's a real, load-bearing
    // Hotel column (controller/kto.js reads it server-side when computing
    // an order's own gst/grandAmount), not just a display setting, so this
    // app's local gstCalculation toggle must be hydrated from - and, in
    // setGstCalculation, written back to - this same value rather than
    // silently drifting from what the backend actually bills.
    loadInvoiceFormatFromServer: async () => {
      try {
        const [settings, { headerFooterData }] = await Promise.all([
          hotelApi.getSettings(),
          invoiceFormateApi.getHeaderFooter(),
        ]);
        const { upiId, hotel_logo, hms_res_setting, invoiceFormateIncGst } = settings;
        patch((p) => ({
          ...p,
          restaurant: {
            id: settings.id,
            name: settings.hotel_name,
            address: [settings.address1, settings.address2].filter(Boolean).join(", "),
            gstin: settings.gst_no ?? "",
          },
          invoiceFormat: {
            ...p.invoiceFormat,
            gstNo: settings.gst_no ?? "",
            fssaiNo: settings.fssai_no ?? "",
            upiId: upiId ?? "",
            gstCalculation: invoiceFormateIncGst,
            // Same filename-only convention as hotel_logo everywhere else
            // on the backend - "placeholder.png"/empty/unset all mean "no
            // real logo uploaded yet", not a literal image to fetch.
            logoUrl:
              hotel_logo && hotel_logo !== "placeholder.png"
                ? `${API_BASE_URL}/images/${hotel_logo}`
                : undefined,
            header: mapRawInvoiceLines(headerFooterData, "header"),
            footer: mapRawInvoiceLines(headerFooterData, "footer"),
          },
          qrOnSettle: hms_res_setting?.qr_code_open_on_settle ?? false,
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load billing settings from server",
        );
      }
    },

    // Dynamic KOT format (Task 1) - same idea as loadInvoiceFormatFromServer
    // above, against the separate hms_kot_formate_mst table.
    loadKotFormatFromServer: async () => {
      try {
        const { headerFooterData } = await kotFormatApi.getHeaderFooter();
        patch((p) => ({
          ...p,
          kotFormat: {
            header: mapRawKotLines(headerFooterData, "header"),
            footer: mapRawKotLines(headerFooterData, "footer"),
          },
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load KOT format settings from server",
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
    // Suppliers, Purchase Orders, and Wastage are confirmed out of scope
    // for the Local EXE (no local model) - see loadCashSessionsFromServer's
    // comment on why these stay silent on failure rather than toasting.
    loadSuppliersFromServer: async () => {
      try {
        const { suppliers } = await supplierApi.getAll();
        const previousById = new Map(s.suppliers.map((x) => [x.id, x]));
        patch((p) => ({
          ...p,
          suppliers: suppliers.map((x) => mapRawSupplier(x, previousById.get(String(x.id)))),
        }));
      } catch (err) {
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
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
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
        toast.error(
          err instanceof ApiError ? err.message : "Could not load purchase orders from server",
        );
      }
    },
    loadRequisitionsFromServer: async () => {
      try {
        const { requisitions } = await requisitionApi.getAll();
        patch((p) => ({ ...p, requisitions: requisitions.map(mapRawRequisition) }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load requisitions from server",
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
        toast.error(
          err instanceof ApiError ? err.message : "Could not load wastage records from server",
        );
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
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
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
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
        toast.error(err instanceof ApiError ? err.message : "Could not load recipes from server");
      }
    },
    // Expense Heads/Expenses: ported to the Local EXE (Phase F) - a
    // failure here is now a real error worth surfacing.
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
        const { entry } = await expenseApi.getAll("2000-01-01", "2100-01-01", { all: true });
        patch((p) => ({ ...p, expenses: entry.map(mapRawExpenseEntry) }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load expenses from server");
      }
    },
    loadExpenseEntriesPage: async (params) => {
      try {
        const expenseHeadBackendId = params.expenseHeadId?.startsWith("eh-")
          ? Number(params.expenseHeadId.replace("eh-", ""))
          : undefined;
        const userBackendId = params.userId ? Number(params.userId) : undefined;
        const { entry, page, totalPages, total, totalMoneyIn, totalExpense } =
          await expenseApi.getAll(params.from, params.to, {
            page: params.page,
            limit: params.limit,
            expense_head_id: expenseHeadBackendId,
            paymentMode: params.paymentMode,
            user_id: userBackendId,
          });
        patch((p) => ({
          ...p,
          expenseEntriesPageRows: entry.map(mapRawExpenseEntry),
          expenseEntriesPage: page,
          expenseEntriesTotalPages: totalPages,
          expenseEntriesTotal: total,
          expenseEntriesTotalMoneyIn: totalMoneyIn,
          expenseEntriesTotalExpense: totalExpense,
        }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not load expense entries");
      }
    },
    loadAllExpensesForExport: async (params) => {
      const expenseHeadBackendId = params.expenseHeadId?.startsWith("eh-")
        ? Number(params.expenseHeadId.replace("eh-", ""))
        : undefined;
      const userBackendId = params.userId ? Number(params.userId) : undefined;
      try {
        const { entry } = await expenseApi.getAll(params.from, params.to, {
          all: true,
          expense_head_id: expenseHeadBackendId,
          paymentMode: params.paymentMode,
          user_id: userBackendId,
        });
        return entry.map(mapRawExpenseEntry);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not export expenses");
        return [];
      }
    },
    // page/limit/search now do real work server-side (see
    // orderHistoryApi.getAllHeaders's own comment) - settled-only
    // filtering and the LIMIT/OFFSET both happen in the query itself, so
    // there's no client-side re-filter or per-row detail follow-up left
    // here at all, just a straight map from already-complete rows.
    loadOrderHistoryFromServer: async (page = 1, search = "") => {
      try {
        const {
          order: rows,
          page: gotPage,
          totalPages,
          total,
        } = await orderHistoryApi.getAllHeaders(page, 10, search);
        const mapped = rows.map((h) =>
          mapRawOrderHistoryEntry(
            h,
            h.hotelUserId
              ? (s.users.find((u) => u.id === String(h.hotelUserId))?.name ?? "Staff")
              : "Staff",
          ),
        );
        patch((p) => ({
          ...p,
          orderHistory: mapped,
          orderHistoryPage: gotPage,
          orderHistoryTotalPages: totalPages,
          orderHistoryTotal: total,
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load order history from server",
        );
      }
    },
    // Promo Codes and E-Bill Credit are confirmed out of scope for the
    // Local EXE - see loadCashSessionsFromServer's comment. Promo Codes
    // in particular loads on every billing-screen visit (see its own
    // useEffect in _shell.table-grid.order.$orderId.tsx), so toasting on
    // failure there was especially noisy - confirmed live.
    loadPromoCodesFromServer: async () => {
      try {
        const { promoCodes } = await promoCodeApi.getAll();
        patch((p) => ({ ...p, promoCodes: promoCodes.map(mapRawPromoCode) }));
      } catch (err) {
        // Phase F: ported to the Local EXE - a failure here is now a real
        // error worth surfacing, not the expected 401 it used to be.
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
        // Phase F: getEbillCredit ported to the Local EXE (a locally-cached
        // read - see controller/ebillCredit.js) - a failure here is now a
        // real error worth surfacing.
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
        // Role default merged with this user's own permissionOverrides -
        // see resolveEffectiveGrants's own comment for exactly what does
        // and doesn't survive the trip to the backend's 10-area grid.
        access_name: buildAccessName(
          resolveEffectiveGrants(u.role, s.rolePermissions, u.permissionOverrides),
        ),
      };
      const run = async () => {
        try {
          if (isNew) {
            await userApi.createUser(payload);
          } else {
            await userApi.editUser({ ...payload, id: Number(u.id) });
          }
          // permissionOverrides is a purely local concept - the backend's
          // flat UserAccess grid has no "this is a custom override, not
          // just the role default" flag of its own (see
          // resolveEffectiveGrants's comment), so nothing about the API
          // call above persists it. loadUsersFromServer only ever carries
          // an override forward from whatever's ALREADY in local state;
          // without patching it in here first, an edited existing user's
          // override had nothing to carry forward and silently reverted
          // to "Role default" the moment this save completed - confirmed
          // live as "override a permission, save, reopen the popup - the
          // override is gone." Skipped for a brand-new user: its draft id
          // is a local placeholder, not the real backend id the reload
          // will assign, so there's no row to patch by id yet.
          if (!isNew) {
            // Same "nothing to carry forward without patching it in first"
            // problem as permissionOverrides just above, for the same
            // reason: the real PIN is never returned by the backend (only
            // its hash - see mapRawUser's own comment), so
            // loadUsersFromServer always resets pin to "" unless the
            // just-saved value is patched in here first. Confirmed live as
            // "set your PIN in Profile, navigate away and back - it's
            // blank again."
            patch((p) => ({
              ...p,
              users: p.users.map((x) =>
                x.id === u.id
                  ? { ...x, permissionOverrides: u.permissionOverrides, pin: u.pin }
                  : x,
              ),
            }));
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
    upsertExpense: (e, date) => {
      const headBackendId = e.headId.startsWith("eh-")
        ? Number(e.headId.replace("eh-", ""))
        : undefined;
      if (!headBackendId) {
        toast.error("Select a valid expense head");
        return Promise.resolve(false);
      }
      const backendId = e.id.startsWith("exp-") ? Number(e.id.replace("exp-", "")) : undefined;
      const headName = s.expenseHeads.find((h) => h.id === e.headId)?.name ?? "Expense";
      // Snapshot of what this row looked like before the edit, for the audit
      // log's before/after - taken from whichever loaded list currently has
      // it (the paginated Entries screen is the only place an edit can be
      // started from, but the full-range `expenses` is a safe fallback).
      const before = backendId
        ? (s.expenseEntriesPageRows.find((x) => x.id === e.id) ??
          s.expenses.find((x) => x.id === e.id))
        : undefined;
      const payload = {
        expense_head_id: headBackendId,
        amount: e.amount,
        paymentMode: e.mode,
        reason: e.note,
        addExpense: true,
        date,
      };
      const run = async () => {
        try {
          if (!backendId) {
            await expenseApi.create(payload);
            log("Expense Added", headName, "—", `₹${e.amount} · ${e.mode} · ${e.note}`);
          } else {
            await expenseApi.update({ ...payload, id: backendId });
            log(
              "Expense Edited",
              headName,
              before ? `₹${before.amount} · ${before.mode} · ${before.note}` : "—",
              `₹${e.amount} · ${e.mode} · ${e.note}`,
            );
          }
          await value.loadExpensesFromServer();
          toast.success("Expense saved");
          return true;
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save expense");
          return false;
        }
      };
      return run();
    },
    deleteExpense: (id, reason) => {
      const backendId = id.startsWith("exp-") ? Number(id.replace("exp-", "")) : undefined;
      if (!backendId) {
        toast.error("Could not delete this expense entry");
        return Promise.resolve(false);
      }
      const existing =
        s.expenseEntriesPageRows.find((x) => x.id === id) ?? s.expenses.find((x) => x.id === id);
      const headName = existing
        ? (s.expenseHeads.find((h) => h.id === existing.headId)?.name ?? "Expense")
        : "Expense";
      const run = async () => {
        try {
          await expenseApi.remove(backendId);
          await value.loadExpensesFromServer();
          log(
            "Expense Deleted",
            headName,
            existing ? `₹${existing.amount} · ${existing.mode} · ${existing.note}` : "—",
            "—",
            reason,
          );
          toast.success("Expense entry deleted");
          return true;
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not delete this expense entry",
          );
          return false;
        }
      };
      return run();
    },
    upsertExpenseHead: (h) => {
      if (!h.name.trim()) {
        toast.error("Enter a head name");
        return Promise.resolve(false);
      }
      // Client-side duplicate-name guard (case-insensitive) so a mistaken
      // resubmit fails fast with a clear message instead of round-tripping
      // to the backend's own (case-sensitive) uniqueness check.
      //
      // Deleted heads are excluded, exactly as the backend's own check is
      // (`where: { ..., deleted: false }` in controller/expense.js): they
      // stay in store.expenseHeads only so past entries can resolve a name
      // by id. Counting them here blocked re-adding a name that had been
      // deleted - the management list showed nothing while this still said
      // "already exists", and the API was never even called.
      const nameKey = h.name.trim().toLowerCase();
      if (
        s.expenseHeads.some(
          (x) => !x.deleted && x.id !== h.id && x.name.trim().toLowerCase() === nameKey,
        )
      ) {
        toast.error("A head with this name already exists");
        return Promise.resolve(false);
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
            return false;
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
          return true;
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save expense head");
          return false;
        }
      };
      return run();
    },
    removeExpenseHead: (id) => value.removeExpenseHeads([id]),
    removeExpenseHeads: (ids) => {
      const backendIds = ids
        .map((id) => (id.startsWith("eh-") ? Number(id.replace("eh-", "")) : undefined))
        .filter((id): id is number => id !== undefined);
      if (!backendIds.length) return Promise.resolve();
      const run = async () => {
        try {
          const { expenseHeads } = await expenseHeadApi.remove(backendIds);
          const previousById = new Map(
            s.expenseHeads.map((h) => [h.id, { type: h.type, active: h.active }]),
          );
          patch((p) => ({
            ...p,
            expenseHeads: expenseHeads.map((h) =>
              mapRawExpenseHead(h, previousById.get(`eh-${h.id}`)),
            ),
          }));
          toast.success(`${ids.length} expense head${ids.length === 1 ? "" : "s"} deleted`);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not delete expense head(s)");
        }
      };
      return run();
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
      const who = currentUser.name;
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
      const who = currentUser.name;
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
            date: realToday(),
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
      const who = currentUser.name;
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
              date: realToday(),
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
      const who = currentUser.name;
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
      const run = async () => {
        try {
          const { req_no } = await requisitionApi.create(valid, remarks);
          await value.loadRequisitionsFromServer();
          toast.success("Requisition placed", {
            description: `REQ-2026-${String(req_no).padStart(3, "0")} · awaiting merchant approval`,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not place requisition");
        }
      };
      void run();
    },
    setRequisitionStatus: (id, status) => {
      const req = s.requisitions.find((r) => r.id === id);
      if (!req) return;
      const run = async () => {
        try {
          await requisitionApi.setStatus(Number(id.replace("req-", "")), status);
          await value.loadRequisitionsFromServer();
          toast.success(`Requisition ${status.toLowerCase()}`);
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not update requisition status",
          );
        }
      };
      void run();
    },
    setRequisitionQty: (id, materialId, qty) => {
      // Optimistic local patch for snappy +/- clicks in the sheet, same
      // pattern as elsewhere - reconciled by the reload below.
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
      }));
      const run = async () => {
        try {
          await requisitionApi.setItemQty(
            Number(id.replace("req-", "")),
            materialId,
            Math.max(0, qty),
          );
          await value.loadRequisitionsFromServer();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update quantity");
          await value.loadRequisitionsFromServer();
        }
      };
      void run();
    },
    removeRequisition: (id) => {
      const run = async () => {
        try {
          await requisitionApi.remove(Number(id.replace("req-", "")));
          await value.loadRequisitionsFromServer();
          toast.success("Requisition deleted");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not delete requisition");
        }
      };
      void run();
    },
    fulfilRequisition: (id) => {
      const req = s.requisitions.find((r) => r.id === id);
      if (!req || req.purchaseOrderId) return;
      const run = async () => {
        try {
          const { po_no } = await requisitionApi.fulfil(Number(id.replace("req-", "")));
          await Promise.all([
            value.loadRequisitionsFromServer(),
            value.loadPurchaseOrdersFromServer(),
          ]);
          await value.loadRawMaterialsFromServer();
          toast.success("Requisition fulfilled", {
            description: `PO-2026-${String(po_no).padStart(3, "0")} created and stock received`,
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not fulfil requisition");
        }
      };
      void run();
    },

    setConnection: (state) => {
      patch((p) => (p.connection === state ? p : { ...p, connection: state }));
    },
    // Real status from billerpe-local-exe's GET /localServerStatus (see
    // api.ts's RawLocalServerStatus) - backs the System page. Silent on
    // failure (no toast) since this is called on a poll/interval, not a
    // deliberate user action - a transient blip shouldn't spam toasts.
    loadServerStatusFromServer: async () => {
      const result = await localServerApi.getStatus();
      if (!result) return;
      // The header's connection chip follows the exe's real sync state
      // (it used to be a hand-picked demo value - picking "Offline Limit
      // Exceeded" there even blocked billing on that terminal).
      patch((p) => ({ ...p, localServerStatus: result, connection: connectionFromStatus(result) }));
    },
    // Real POST /localServerForceSync, then reload status so the page
    // reflects the result immediately rather than waiting for the next
    // poll.
    forceSyncServer: async () => {
      try {
        await localServerApi.forceSync();
        await value.loadServerStatusFromServer();
        toast.success("Sync complete", { description: "Local server is up to date." });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Sync failed - check the logs");
      }
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
    loadNotificationSettingsFromServer: async () => {
      try {
        const { settings } = await notificationSettingApi.getAll();
        patch((p) => ({ ...p, notificationSettings: settings.map(mapRawNotificationSetting) }));
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Could not load notification settings from server",
        );
      }
    },
    loadRolePermissionsFromServer: async () => {
      try {
        const { defaults } = await rolePermissionApi.getAll();
        const { rolePermissions, roleSpecialPermissions } = mapRolePermissionDefaults(defaults);
        patch((p) => ({ ...p, rolePermissions, roleSpecialPermissions }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load role permissions from server",
        );
      }
    },
    toggleNotificationSetting: (trigger, channel) => {
      const backendChannel = channel === "inApp" ? "in_app" : channel;
      const run = async () => {
        try {
          await notificationSettingApi.toggle(trigger, backendChannel);
          await value.loadNotificationSettingsFromServer();
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not update notification setting",
          );
        }
      };
      void run();
    },
    loadBillChargeRulesFromServer: async () => {
      try {
        const { rules } = await billChargeApi.getAll();
        const greaterLessMap: Record<
          RawBillChargeRule["greater_less"],
          "always" | "greater" | "less"
        > = { "1": "greater", "2": "less", "3": "always" };
        const mapRule = (r: RawBillChargeRule): BillChargeRule => ({
          active: r.active,
          type: r.charge_type === "fixed" ? "fixed" : "percent",
          value: r.charge_value,
          calculationOn: r.calculation_on,
          autoApply: (parseBackendArray(r.charge_automatic) as string[]).map((t) =>
            t === "dinin" ? "Dine-in" : "Pickup",
          ) as OpsOrderType[],
          taxOnCharge: r.calculation_on_tax,
          condition: greaterLessMap[r.greater_less] ?? "always",
          threshold: r.greater_less_amount,
        });
        const delivery = rules.find((r) => r.rule_for === "delivery");
        const packaging = rules.find((r) => r.rule_for === "packaging");
        patch((p) => ({
          ...p,
          ...(delivery ? { deliveryChargeRule: mapRule(delivery) } : {}),
          ...(packaging ? { packagingChargeRule: mapRule(packaging) } : {}),
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load charge rules from server",
        );
      }
    },
    setDeliveryChargeRule: (rule) => {
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
          await billChargeApi.update({
            rule_for: "delivery",
            active: rule.active,
            charge_type: rule.type === "percent" ? "percentage" : "fixed",
            charge_value: rule.value,
            calculation_on: rule.calculationOn,
            charge_automatic: rule.autoApply.map((t) => orderTypeMap[t]),
            calculation_on_tax: rule.taxOnCharge,
            greater_less: greaterLessMap[rule.condition],
            greater_less_amount: rule.threshold,
          });
          await value.loadBillChargeRulesFromServer();
          toast.success("Delivery charge rule saved");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not save delivery charge rule",
          );
        }
      };
      void run();
    },
    setPackagingChargeRule: (rule) => {
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
          await billChargeApi.update({
            rule_for: "packaging",
            active: rule.active,
            charge_type: rule.type === "percent" ? "percentage" : "fixed",
            charge_value: rule.value,
            calculation_on: rule.calculationOn,
            charge_automatic: rule.autoApply.map((t) => orderTypeMap[t]),
            calculation_on_tax: rule.taxOnCharge,
            greater_less: greaterLessMap[rule.condition],
            greater_less_amount: rule.threshold,
          });
          await value.loadBillChargeRulesFromServer();
          toast.success("Packaging charge rule saved");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not save packaging charge rule",
          );
        }
      };
      void run();
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
    // Used to be local-only (just flipping `active` in state, no API call)
    // - it looked like it worked, but the backend's own copy never changed,
    // so the tax rule kept applying to real orders regardless, and the
    // switch itself reverted to its server value on the next
    // loadTaxRulesFromServer (e.g. a page refresh). Delegates to
    // upsertTaxRule for the actual persist + reload, same as the full edit
    // form's own Save button.
    toggleTaxRule: (id) => {
      const rule = s.taxRules.find((t) => t.id === id);
      if (!rule) return;
      value.upsertTaxRule({ ...rule, active: !rule.active });
    },
    setInvoiceFormat: (fmt) => {
      patch((p) => ({ ...p, invoiceFormat: fmt }));
      const run = async () => {
        try {
          // marketing_text lives on Hotel itself, not on
          // hms_invoice_formate_mst with the rest of these lines - see
          // hotelApi.updateIdentity's own comment. Reads whichever line
          // (header or footer) actually has content:"marketing" right
          // now; if neither side uses it, sends "" to clear a
          // previously-set value rather than leaving a stale one behind.
          await Promise.all([
            hotelApi.updateIdentity({
              upiId: fmt.upiId,
              invoiceFormateHeaderText:
                fmt.header.find((l) => l.content === "marketing")?.text ?? "",
              invoiceFormateBottomText:
                fmt.footer.find((l) => l.content === "marketing")?.text ?? "",
            }),
            invoiceFormateApi.saveHeaderFooter(toRawInvoiceFormatePayload(fmt.header, fmt.footer)),
          ]);
          toast.success("Invoice format saved");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Saved locally, but didn't sync to the server",
          );
        }
      };
      void run();
    },
    setKotFormat: (fmt) => {
      patch((p) => ({ ...p, kotFormat: fmt }));
      const run = async () => {
        try {
          await kotFormatApi.saveHeaderFooter(toRawKotFormatePayload(fmt.header, fmt.footer));
          toast.success("KOT format saved");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Saved locally, but didn't sync to the server",
          );
        }
      };
      void run();
    },
    uploadHotelLogo: async (file) => {
      try {
        const { hotel_logo } = await hotelApi.uploadLogo(file);
        const logoUrl = hotel_logo ? `${API_BASE_URL}/images/${hotel_logo}` : undefined;
        patch((p) => ({
          ...p,
          invoiceFormat: { ...p.invoiceFormat, logoUrl },
        }));
        toast.success("Logo uploaded");
        return logoUrl;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not upload logo");
        return undefined;
      }
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
      const run = async () => {
        try {
          // Real Hotel column, not a local-only display flag - see
          // loadInvoiceFormatFromServer's own comment. Without this write,
          // the toggle reverted to whatever the backend still had on the
          // next reload, and the backend kept billing GST regardless of
          // what this screen showed in the meantime.
          await hotelApi.updateIdentity({ invoiceFormateIncGst: on });
          toast[on ? "success" : "warning"](
            on ? "GST calculation enabled" : "GST calculation disabled",
            {
              description: on
                ? "Active tax rules now calculate on bills."
                : "Configured tax rules will not calculate on bills.",
            },
          );
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Saved locally, but didn't sync to the server",
          );
        }
      };
      void run();
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
    loadPaymentModesFromServer: async () => {
      try {
        const { paymentModes } = await paymentModeApi.getAll();
        patch((p) => ({ ...p, paymentModes: paymentModes.map(mapRawPaymentMode) }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not load payment modes from server",
        );
      }
    },
    upsertPaymentMode: (mode) => {
      const isNew = !s.paymentModes.some((m) => m.id === mode.id);
      const run = async () => {
        try {
          if (isNew) {
            await paymentModeApi.create(mode.name);
          } else {
            await paymentModeApi.edit(Number(mode.id), mode.name, mode.active);
          }
          await value.loadPaymentModesFromServer();
          toast.success("Payment mode saved", { description: mode.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save payment mode");
        }
      };
      void run();
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
      const run = async () => {
        try {
          await paymentModeApi.remove(Number(id));
          await value.loadPaymentModesFromServer();
          toast.success("Payment mode removed");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove payment mode");
        }
      };
      void run();
    },
    setPaymentModeActive: (id, active) => {
      const target = s.paymentModes.find((m) => m.id === id);
      if (!target) return;
      const run = async () => {
        try {
          await paymentModeApi.edit(Number(id), target.name, active);
          await value.loadPaymentModesFromServer();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update payment mode");
        }
      };
      void run();
    },
    loadPaymentModeDefaultsFromServer: async () => {
      try {
        const { paymentModeDefaults } = await paymentModeDefaultApi.getAll();
        patch((p) => ({
          ...p,
          paymentModeDefaults: paymentModeDefaults.map(mapRawPaymentModeDefault),
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Could not load default payment modes from server",
        );
      }
    },
    saveDefaultPaymentMode: (orderType, tableCategoryId, paymentModeId) => {
      const run = async () => {
        try {
          await paymentModeDefaultApi.save({
            order_type: OPS_ORDER_TYPE_TO_RAW[orderType],
            table_categ_id: tableCategoryId ? Number(tableCategoryId) : null,
            payment_mode_id: Number(paymentModeId),
          });
          await value.loadPaymentModeDefaultsFromServer();
          toast.success("Default payment mode saved");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not save default payment mode",
          );
        }
      };
      void run();
    },
    removeDefaultPaymentMode: (id) => {
      const run = async () => {
        try {
          await paymentModeDefaultApi.remove(Number(id));
          await value.loadPaymentModeDefaultsFromServer();
          toast.success("Default removed");
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "Could not remove default payment mode",
          );
        }
      };
      void run();
    },
    resolveDefaultPaymentMode: (orderType, tableCategoryId) => {
      const activeModes = s.paymentModes.filter((m) => m.active);
      const override = tableCategoryId
        ? s.paymentModeDefaults.find(
            (d) => d.orderType === orderType && d.tableCategoryId === tableCategoryId,
          )
        : undefined;
      const base = s.paymentModeDefaults.find(
        (d) => d.orderType === orderType && !d.tableCategoryId,
      );
      const resolvedId = override?.paymentModeId ?? base?.paymentModeId;
      const resolved = resolvedId ? activeModes.find((m) => m.id === resolvedId) : undefined;
      return resolved?.name ?? activeModes[0]?.name ?? "Cash";
    },
    upsertMenu: (menu) => {
      const isNew = !s.menus.some((m) => m.id === menu.id);
      const run = async () => {
        try {
          if (isNew) {
            await menuApi.createMenuCatalog(menu.name, menu.tableCategoryIds, menu.orderTypes);
          } else {
            await menuApi.editMenuCatalog(
              Number(menu.id),
              menu.name,
              !!menu.isDefault,
              menu.tableCategoryIds,
              menu.orderTypes,
            );
          }
          await value.loadMenuFromServer();
          toast.success("Menu saved", { description: menu.name });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not save menu");
        }
      };
      void run();
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
      // The real backend rejects removal outright while anything still
      // references this catalogue (same "reject deletion in use" guard as
      // removeMenuCategory below) - checked locally first to avoid a round
      // trip for the common case.
      if (
        s.menuCategories.some((c) => c.menuId === id) ||
        s.variantMasters.some((v) => v.menuId === id) ||
        s.addonGroups.some((a) => a.menuId === id)
      ) {
        toast.error("Menu is in use", {
          description: "Move or delete its categories, variants and addon groups first.",
        });
        return;
      }
      const run = async () => {
        try {
          await menuApi.removeMenuCatalog(Number(id));
          await value.loadMenuFromServer();
          toast.success("Menu removed");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not remove menu");
        }
      };
      void run();
    },
    setDefaultMenu: (id) => {
      const target = s.menus.find((m) => m.id === id);
      if (!target) return;
      const run = async () => {
        try {
          await menuApi.editMenuCatalog(
            Number(id),
            target.name,
            true,
            target.tableCategoryIds,
            target.orderTypes,
          );
          await value.loadMenuFromServer();
          toast.success("Default menu updated");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not update default menu");
        }
      };
      void run();
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
      const newLine: OrderLine = {
        id: uid("custom"),
        itemId: uid("custom-item"),
        name: name.trim(),
        qty,
        price,
        kotRound: UNSENT_ROUND,
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
                        by: currentUser.name,
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
      // Local credit check for instant feedback before round-tripping -
      // the real gate is server-side too (sentEbill 400s once credit hits
      // 0), so this is just avoiding an unnecessary request (and, now,
      // avoiding an unnecessary auto-generate below), not the source of
      // truth.
      if (s.eBillCredit <= 0) {
        toast.error("E-bill credits exhausted", {
          description: "Top up e-bill credits from Operations to send digital bills again.",
        });
        return false;
      }
      let backendId = o.backendId;
      // "Send e-bill" now behaves as save-then-send: an order whose bill
      // hasn't been generated yet gets generated here first (the same
      // effect as pressing "Save"/"Generate Bill"), instead of erroring
      // out and making the staff do that separately first. A previously
      // held/still-open order can reach here with no backendId at all -
      // generateBill's dine-in branch creates the real backend order in
      // that same call (see its own comment), so nothing needs to exist
      // yet for this to work. Only live s.orders entries reach this
      // branch; orderHistory entries are already "Settled"
      // (mapRawOrderHistoryEntry), so they never do.
      if (o.status !== "Bill Generated" && o.status !== "Settled") {
        const result = await value.generateBill(orderId);
        if (!result.ok) return false; // generateBill already toasted why
        backendId = result.backendId;
      }
      if (!backendId) {
        toast.error("Order isn't synced with the server yet");
        return false;
      }
      try {
        await orderApi.sendEBill({ orderId: backendId, mobile: o.customerPhone });
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
      const printed = await doPrintBill(o, o.backendId);
      if (!printed) return;
      // Owner-visible reprint counter (Task 5) - only this explicit
      // "Reprint bill" action counts, never the first bill-generation
      // print (generateBill's own doPrintBill calls bypass this). Never
      // blocks or surfaces an error on the print itself.
      try {
        const { billPrintCount } = await orderHistoryApi.incrementBillPrintCount(o.backendId);
        patch((p) => ({
          ...p,
          orders: p.orders.map((x) => (x.id === orderId ? { ...x, billPrintCount } : x)),
          orderHistory: p.orderHistory.map((x) =>
            x.id === orderId ? { ...x, billPrintCount } : x,
          ),
        }));
      } catch {
        // Best-effort only - a reprint count miss is never worth surfacing.
      }
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
      // Same rule as mergeTables/transferTable - a generated bill is meant
      // to be settled as printed, not have items moved off it afterward.
      if (o.status === "Bill Generated") {
        toast.error("Bill already generated", {
          description:
            "This order's bill has already been generated — its KOT rounds can no longer be moved.",
        });
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
