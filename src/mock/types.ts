export type Role =
  | "Owner"
  | "Manager"
  | "Cashier"
  | "Captain"
  | "Kitchen Staff"
  | "Inventory Manager"
  | "Accountant";

/** One entry per distinct permission-managed area of the app — groups the ~55 individual
 * views down to a manageable set, reusing the Stock/Operations sub-groups that already exist. */
export type PermissionModule =
  | "dashboard"
  | "biller"
  | "keyboard-billing"
  | "kds"
  | "orders"
  | "menu"
  | "tables"
  | "reservations"
  | "queue"
  | "users"
  | "permissions"
  | "reports"
  | "expense"
  | "stock-masters"
  | "stock-transactions"
  | "stock-recipes"
  | "stock-reports"
  | "cash-session"
  | "ops-billing"
  | "ops-hardware"
  | "ops-experience"
  | "ops-ledger"
  | "system"
  | "audit-log";

export type StandardAction = "view" | "create" | "edit" | "delete";

/** Non-CRUD-shaped rules that don't fit the standard action grid — each tied to a specific mutator. */
export type SpecialPermission =
  | "orders.editAfterKot"
  | "orders.reopenSettled"
  | "orders.deleteOrder"
  | "tables.mergeTransfer"
  | "system.remakeOrderSequence"
  | "users.editPermissions";

export interface ModuleGrant {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

/** Total — every role must have an entry for every module, so resolution never hits undefined. */
export type RolePermissions = Record<PermissionModule, ModuleGrant>;

/** Sparse — only the fields that differ from the signed-in user's role default. */
export interface PermissionOverrides {
  modules?: Partial<Record<PermissionModule, Partial<ModuleGrant>>>;
  special?: Partial<Record<SpecialPermission, boolean>>;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  mobile: string;
  email: string;
  status: "Active" | "Inactive";
  pin: string;
  /** Sparse exceptions to the role default. Owner ignores this entirely — always full access. */
  permissionOverrides?: PermissionOverrides;
  /** THE owner's own login: locked - never turned off, never moved to
   * another role, permissions never changed (owner rule, 2026-09-22). */
  isOwner?: boolean;
}

export type TableStatus = "Free" | "Hold" | "Running" | "Bill Generated" | "Reserved";

export interface TableCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface RestaurantTable {
  id: string;
  name: string;
  categoryId: string;
  seats: number;
  status: TableStatus;
  guests?: number;
  orderId?: string;
  occupiedSince?: string;
  /** Only set while status is "Reserved" - the guest name/number entered
   * when the reservation holding this table was booked (billerpe-local-exe's
   * services/reservationTableSync.js), so staff can see who it's for and
   * the order-builder can pre-fill it without retyping. */
  reservedGuestName?: string;
  reservedGuestPhone?: string;
  /** Cloud-authoritative (uat-backend-v2/model/table.js) - bumped only by
   * "regenerate this table's QR" (qrOrderApi.regenerateTableQr), which
   * invalidates every previously-printed/shared link for this table. */
  qrVersion?: number;
  /** This table's id on the cloud (RawTable.cloud_table_id). The only id a
   * printed ordering QR may encode - a customer's phone resolves it
   * against the cloud, which does not know this app's local ids.
   * Undefined means the table has not synced up yet, and no QR may be
   * shown for it at all. */
  cloudId?: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  itemCount?: number;
  active: boolean;
  sortOrder?: number;
  /** which Menu this category (and therefore its items) belongs to — menus are fully separate catalogues */
  menuId: string;
}

/**
 * A named menu (e.g. Main Menu, Bar Menu, Breakfast Menu). Each menu owns a fully
 * independent catalogue — its own categories, items, addon groups and variants (see the
 * `menuId` field on each of those types). Resolution for which menu an order defaults to:
 * the first non-default menu whose table-category and order-type scope both match, else
 * the default menu, else the first menu. See `resolveMenu` in `mock/store.tsx`.
 */
export interface Menu {
  id: string;
  name: string;
  /** exactly one menu should carry this — the fallback when nothing else matches */
  isDefault?: boolean;
  /** empty = not scoped by table category */
  tableCategoryIds: string[];
  /** empty = not scoped by order type */
  orderTypes: OpsOrderType[];
}

export interface VariantOption {
  id: string;
  name: string;
  price: number;
  /** which Menu's variant master this belongs to */
  menuId: string;
}

export interface AddonOption {
  id: string;
  name: string;
  price: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  min: number;
  max: number;
  selection: "Single" | "Multiple";
  options: AddonOption[];
  /** which Menu this addon group belongs to */
  menuId: string;
}

export type MenuDietary = "Regular Veg" | "Jain" | "Non-Veg" | "Vegan" | "Swaminarayan";

export interface MenuItem {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  favourite: boolean;
  active: boolean;
  veg: boolean;
  variants?: VariantOption[];
  addonGroupIds?: string[];
  dietary?: MenuDietary;
  sku?: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
}

export type OrderType = "Dine In" | "Pickup";
export type OrderStatus = "Hold" | "Running" | "Bill Generated" | "Settled" | "Cancelled";
/** Outlet-configurable — see `PaymentModeConfig` / `store.paymentModes`. "Split" is a derived label, never a configured mode. */
export type PaymentMode = string;

export interface PaymentModeConfig {
  id: string;
  name: string;
  active: boolean;
  /** Cash and Due are the two protected defaults — cannot be renamed away or deleted. */
  deletable: boolean;
}

/**
 * Pre-selects a payment mode when a new PaymentSplitEditor row is added -
 * pure UI convenience, never enforced server-side (a captain can still pick
 * any other active mode). `tableCategoryId` unset = the order type's own
 * base default; set = an override for that one table category, dine-in
 * only (pickup has no table). At most one base row per order type and one
 * override row per (order type, table category) - store.savePaymentModeDefault
 * upserts on that pair rather than allowing duplicates.
 */
export interface PaymentModeDefaultRule {
  id: string;
  orderType: OpsOrderType;
  tableCategoryId?: string;
  paymentModeId: string;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  qty: number;
  price: number;
  variant?: string;
  addons?: { name: string; price: number; qty: number; groupId?: string; addonId?: string }[];
  kotRound: number;
  originTable?: string;
  note?: string;
  /** Added at billing, not on the menu ("Custom item"). */
  custom?: boolean;
  /** A custom item's chosen KOT printer / KDS kitchen (exe hms_printer_settings /
   * hms_kitchen_settings id) - only asked when the outlet has more than one. */
  routePrinterId?: number;
  routeKitchenId?: number;
}

export interface PaymentSplit {
  mode: Exclude<PaymentMode, "Split">;
  amount: number;
}

export interface Order {
  id: string;
  /** Numeric-only, stripped-prefix derivative of billNo (parseBillNoAsOrderNo)
   * - kept for sorting/search, since it's cheap to compare numerically, but
   * NOT the real bill number: an unsynced order's billNo is "OFF12", which
   * parses to the same 12 a genuinely different, already-synced order could
   * also have as its real number - two unrelated orders can show the same
   * orderNo at the same time. Never use this for a customer- or staff-
   * facing "Bill No" display; use billNo (below) instead, which is exactly
   * what's actually stored server-side, prefix included. */
  orderNo: number;
  /** The real Order.bill_no string from the backend - "OFF12" until this
   * order syncs to the cloud and gets a permanent number, a plain numeric
   * string ("37") after. This is what a printed bill, the order list, and
   * the e-bill webview must all show as "the bill number" - showing
   * orderNo instead (as doPrintBill used to, via the even-more-wrong raw
   * backendId) was confirmed live as the cause of the printed bill's
   * number not matching the order list for the same order. Undefined only
   * for a local draft that has never touched the backend at all. */
  billNo?: string;
  type: OrderType;
  tableId?: string;
  tableLabel: string;
  guests: number;
  status: OrderStatus;
  lines: OrderLine[];
  kotRounds: number;
  /** which Menu this order is punching against — set at creation, changeable via `setOrderMenu` */
  menuId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  // `type`/`value` are only ever set by applyDiscount, within THIS session -
  // an order reloaded from the backend (mapRawLiveOrder/
  // mapRawOrderHistoryEntry) only ever gets `amount` back (the backend has
  // no column for "this was originally a percentage"), so it's correctly
  // frozen from that point on. While `type` is "percent", orderTotals
  // recomputes `amount` fresh off the order's CURRENT subtotal instead of
  // trusting this stale value - fixes a live-reported bug where adding an
  // item after applying a % discount left the discount amount frozen at
  // its pre-add value instead of growing with the new subtotal.
  discount?: { label: string; amount: number; type?: "percent" | "flat"; value?: number };
  deliveryCharge?: number;
  packagingCharge?: number;
  /** The cashier's manual service charge (₹), for an order type where the
   * service charge is not automatic - see serviceIsManual in store.tsx. */
  serviceCharge?: number;
  /** Waiter service tip, attributed to whoever created the order
   * (createdBy) - only ever set once, at settlement (store.settleOrder).
   * See uat-backend-v2/model/order.js's own comment. */
  tip?: number;
  /** Owner-visible "reprinted N times" counter (Task 5) - incremented only
   * by the explicit "Reprint bill" action (store.printBill), never the
   * first bill-generation print. See
   * billerpe-local-exe/model/order.js's own comment. */
  billPrintCount?: number;
  /** Real per-day, per-hotel running kitchen token number (Order.token on
   * the backend, uat-backend-v2/controller/kto.js's generateToken) - 0/
   * unset means tokens are off for this order (Hotel.is_token_on) or not
   * yet assigned. Used by the "token-number" KOT format line. */
  token?: number;
  payments?: PaymentSplit[];
  paymentMode?: PaymentMode;
  businessDate: string;
  createdAt: string;
  settledAt?: string;
  createdBy: string;
  mergedFrom?: string[];
  itemised: boolean;
  fallbackTotal?: number;
  /** uat-backend's real numeric hms_order_msts.id, set once the first KOT
   * round for this order succeeds against the real API. Undefined means
   * this order only exists locally (cart being built, nothing fired yet) -
   * matches the backend's own reality that no Order row exists until the
   * first KOT. */
  backendId?: number;
  /** Real historical totals as actually billed, present only on orders
   * synced via loadOrderHistoryFromServer. orderTotals() recomputes tax/
   * service/discount from *current* BillSettings, which would drift from
   * what a historical order was really charged if those rules have since
   * changed - consumers of order history should read this instead of
   * calling orderTotals() for these orders. */
  backendTotals?: { grand: number; tax: number; discount: number; serviceCharge: number };
  /** Set only on a local, editable copy of an already-settled order (see
   * store.startEditSettledOrder) - the value is that real order's
   * backendId. Lets the order screen show "Save changes"/"Cancel" instead
   * of the normal billing actions, and tells saveSettledOrderEdits which
   * real order to PATCH. */
  editingSettledOrderId?: number;
}

export interface RefundDue {
  id: string;
  billNo: string;
  /** Always positive - the amount owed back to the customer (the order's
   * real `due` column is negative; this is its absolute value). */
  amount: number;
  date: string;
  backendOrderId: number;
}

export type KotStatus =
  "Pending" | "Printed" | "Accepted" | "Preparing" | "Ready" | "Served" | "Cancelled";

export interface Kot {
  id: string;
  kotNo: number;
  orderId: string;
  tableLabel: string;
  round: number;
  /** resolved kitchen name (see `resolveKitchenForCategory`), not a fixed enum */
  station: string;
  status: KotStatus;
  createdAt: string;
  items: { name: string; qty: number; note?: string }[];
  /** uat-backend's hms_order_msts.id this round belongs to, paired with
   * kotNumber as the dedupe key against live /kds socket pushes for the
   * same round arriving from another device/tab - undefined for KOTs that
   * predate real-backend wiring. */
  backendOrderId?: number;
  /** Assumed equal to the local `round` counter at KOT-fire time (both
   * start at 1 and increment once per generateKot call for the order) -
   * confirmed live for fresh orders, not exhaustively for every backend
   * code path. A mismatch would at worst show a duplicate ticket on a
   * session that has both the Orders and KDS pages open, not corrupt
   * anything, per the "visibility only" scope this was built to. */
  kotNumber?: number;
  /** Fired with "Only KOT": on the bill, never on a Kitchen Display. */
  kdsHidden?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  orders: number;
  lastVisit: string;
  gstin?: string;
  address?: string;
  active?: boolean;
}

// Backed by uat-backend-v2's real hms_tableBooking_mst (controller/
// tableBooking.js) - cloud-routed, not local-exe (see reservationApi's own
// comment in lib/api.ts for why). A booking can span multiple tables
// sharing one booking_id; the cloud already collapses that into one row
// per booking with a `table_name` array on read. No status field: a
// cancelled/deleted booking is filtered out server-side (deleted:false)
// rather than coming back with a status flag, so anything in this list is
// implicitly active by construction.
export interface Reservation {
  id: string;
  customerName: string;
  mobile: string;
  email?: string;
  party: number;
  tables: { id: string; label: string }[];
  date: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  advance: number;
  gstNo?: string;
}

export type QueueStatus = "Waiting" | "Seated" | "No Show" | "Cancelled";

// Walk-in waitlist - deliberately not stored/synced anywhere but this
// hotel's own exe (billerpe-local-exe/model/queueEntry.js's own comment
// on why): real-time, single-shift, no accounting/compliance reason to
// outlive the day it happened.
export interface QueueEntry {
  id: string;
  backendId: number;
  name: string;
  mobile: string;
  partySize: number;
  status: QueueStatus;
  joinedAt: string;
  calledAt?: string;
  resolvedAt?: string;
  notes?: string;
}

export interface StockUnit {
  id: string;
  unitName: string;
  shortName: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  /** consumption unit (usage unit) */
  unit: string;
  /** purchase unit */
  purchaseUnit: string;
  /** consumption units per 1 purchase unit */
  conversion: number;
  /** stock on hand, in consumption units */
  stock: number;
  /** minimum / reorder level, in consumption units */
  reorderLevel: number;
  /** weighted average cost per consumption unit */
  rate: number;
  category: string;
  minStockEnabled?: boolean;
}

export type IngredientType = "raw" | "semi";

export interface RecipeLine {
  type: IngredientType;
  refId: string;
  qty: number;
}

export interface RecipeGroup {
  key: string;
  label: string;
  kind: "base" | "variant" | "addon";
  lines: RecipeLine[];
  /** The variant id (kind "variant") or addon id (kind "addon") this group is for -
   * the same ids a KOT line carries, so the sale deducts this group. */
  refId?: string;
}

export interface Recipe {
  id: string;
  itemName: string;
  yieldQty: number;
  yieldUnit: string;
  components: { materialId: string; qty: number }[];
  menuItemId?: string;
  groups?: RecipeGroup[];
}

export interface SemiFinished {
  id: string;
  name: string;
  unit: string;
  /** BOM is expressed per 1 unit produced; batchQty is the suggested run size */
  batchQty: number;
  stock: number;
  components: { materialId: string; qty: number }[];
  minStock?: number;
}

export interface ProductionRun {
  id: string;
  semiId: string;
  qty: number;
  cost: number;
  notes?: string;
  at: string;
  by: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  gstin: string;
  outstanding: number;
}

export interface PurchaseLine {
  materialId: string;
  /** quantity in purchase units */
  qty: number;
  /** rate per purchase unit */
  rate: number;
  taxPct?: number;
  /** uat-backend's hms_purchase_rawMaterial.id - lets an edit after
   * receipt reuse the backend's own update-vs-create-vs-remove diff (by
   * id) instead of this app trying to reimplement it. Undefined for a
   * line that hasn't reached the backend yet. */
  backendLineId?: number;
}

export interface PurchasePayment {
  id: number;
  amount: number;
  mode: string;
  /** DD/MM/YYYY */
  date: string;
  ref?: string;
  by?: string;
  /** Also recorded as a "Supplier payment" expense. */
  asExpense: boolean;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  supplierId: string;
  date: string;
  status: "Draft" | "Ordered" | "Received" | "Partially Received" | "Cancelled";
  lines: PurchaseLine[];
  invoiceNo?: string;
  gstin?: string;
  paymentStatus?: "Unpaid" | "Partial" | "Paid";
  paidAmount?: number;
  /** Payments recorded on the exe, oldest first. */
  payments?: PurchasePayment[];
  /** How the amount paid when the bill is entered was paid (new POs only). */
  firstPayment?: { mode: string; date: string; ref?: string; fromDrawer?: boolean };
  discountType?: "flat" | "percent";
  discountValue?: number;
  requisitionId?: string;
  /** uat-backend's hms_purchase_order.id, set once this PO is actually
   * received (creation there immediately updates stock - there is no
   * "ordered but not received" state server-side at all, confirmed by
   * reading createPurchaseOrder in full). Undefined means this PO only
   * exists locally as a Draft/Ordered stage, matching the backend's own
   * reality that no row exists until receipt. */
  backendId?: number;
}

export interface Wastage {
  id: string;
  materialId: string;
  qty: number;
  reason: string;
  date: string;
  recordedBy: string;
  notes?: string;
  cost?: number;
  /** uat-backend's hms_watage_mst.id - undefined for a row not yet synced. */
  backendId?: number;
}

export interface StockAdjustment {
  id: string;
  materialId: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  value: number;
  date: string;
  by: string;
  note?: string;
}

export type MovementKind =
  "Purchase" | "Wastage" | "Adjustment" | "Production In" | "Production Out" | "Sale";

export interface StockMovement {
  id: string;
  kind: MovementKind;
  /** raw material id or semi-finished id */
  refType: IngredientType;
  refId: string;
  /** signed quantity in the item's own unit */
  qty: number;
  value: number;
  reference: string;
  at: string;
  by: string;
}

export type RequisitionStatus =
  "Pending" | "Accepted" | "Out for delivery" | "Delivered" | "Rejected";

export interface FranchiseRequisition {
  id: string;
  reqNo: string;
  date: string;
  status: RequisitionStatus;
  items: { materialId: string; orderedQty: number; approvedQty?: number; unitPrice: number }[];
  remarks?: string;
  purchaseOrderId?: string;
  raisedBy: string;
}

export interface ExpenseHead {
  id: string;
  name: string;
  type: "Fixed" | "Variable";
  active: boolean;
  // Soft-deleted heads stay in this list (never dropped by
  // loadExpenseHeadsFromServer/removeExpenseHeads) purely so past expense
  // entries can still resolve their head's name - see headName() in
  // _shell.expense.entries.tsx. Any UI letting the user pick/manage heads
  // must filter these out itself.
  deleted?: boolean;
}

export interface Expense {
  id: string;
  headId: string;
  amount: number;
  /** "DD/MM/YYYY" - the business date this entry is bucketed under. */
  date: string;
  /** Real time-of-day this entry was recorded, "H:MM am/pm" - separate
   * from `date` so existing `date === X` day-bucket comparisons elsewhere
   * keep working unchanged. */
  time: string;
  mode: "Cash" | "Bank" | "UPI";
  note: string;
  createdBy: string;
  /** Real HotelUser id who recorded this, when known - lets the entries
   * screen filter "entered by" without re-deriving it from createdBy text. */
  createdByUserId?: string;
  /** Recorded from a supplier payment on a purchase order - changed there, not here. */
  fromPurchase?: boolean;
}

export interface CashMovement {
  id: string;
  type: "Opening" | "Add" | "Withdraw" | "Expense" | "Settlement";
  amount: number;
  reason: string;
  at: string;
  by: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  openedBy: string;
  openingFloat: number;
  status: "Open" | "Closed";
  movements: CashMovement[];
  closedAt?: string;
  countedCash?: number;
  variance?: number;
  varianceReason?: string;
}

export type ConnectionState =
  | "online"
  | "offline"
  | "syncing"
  | "sync-error"
  | "conflict"
  | "local-server-down"
  | "offline-limit-exceeded";

export interface Printer {
  id: string;
  name: string;
  type: "Thermal 80mm" | "Thermal 58mm" | "A4 Laser";
  connection: "LAN" | "USB" | "Bluetooth";
  role: "Bill" | "KOT" | "Both";
  categories: string[];
  status: "Ready" | "Offline" | "Paper Out";
  size?: "80mm" | "58mm" | "A4";
  copies?: number;
  printType?: "KOT" | "Invoice";
  orderTypes?: OpsOrderType[];
  tableIds?: string[];
  /** the KOT printer categories fall back to when not explicitly assigned to any printer. Exactly one KOT-role printer should carry this. */
  isDefault?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: "order" | "stock" | "sync" | "cash" | "system";
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  before: string;
  after: string;
  device: string;
  ip: string;
  at: string;
  reason?: string;
}

export interface NotificationSetting {
  trigger: string;
  whatsapp: boolean;
  sms: boolean;
  inApp: boolean;
}

/* ---------------- operations module ---------------- */

export type OpsOrderType = "Dine-in" | "Pickup";

export interface ServiceChargeRule {
  active: boolean;
  type: "percent" | "fixed";
  value: number;
  /** "core" = pre-discount subtotal, "total" = post-discount */
  calculationOn: "core" | "total";
  autoApply: OpsOrderType[];
  /** whether GST computes on top of the service charge */
  taxOnCharge: boolean;
  condition: "always" | "greater" | "less";
  threshold: number;
}

/** Same rule shape as ServiceChargeRule, reused for Delivery and Packaging charges. */
export type BillChargeRule = ServiceChargeRule;

export interface TaxRule {
  id: string;
  name: string;
  value: number;
  type: "percent" | "fixed";
  orderTypes: OpsOrderType[];
  tableCategoryIds: string[];
  menuCategoryIds: string[];
  active: boolean;
}

export type InvoiceLineContent =
  "logo" | "outlet-name" | "address" | "gstin" | "fssai" | "upi-qr" | "marketing" | "text";

export interface InvoiceLine {
  id: string;
  content: InvoiceLineContent;
  text?: string;
  fontSize: number;
}

/** Which order types a token setting applies to - Hotel.is_token_on /
 * bill_with_kot / bill_with_token, stored as "0" pickup, "1" dine-in,
 * "2" both, "3" off (same codes as the old BillerPe). */
export type TokenScope = "off" | "dinein" | "pickup" | "both";

export interface InvoiceFormat {
  /** the real GST master switch for the whole POS */
  gstCalculation: boolean;
  gstNo: string;
  fssaiNo: string;
  multiLanguage: boolean;
  upiId: string;
  /** Full, ready-to-render URL for the "logo" header/footer line content -
   * built client-side from the hotel's own uploaded filename
   * (hotelApi.getSettings/uploadLogo), never stored as a filename here. */
  logoUrl?: string;
  header: InvoiceLine[];
  footer: InvoiceLine[];
  /** Token settings (billerpe-local-exe/model/orderHooks.js assigns the
   * daily token; controller/print.js prints the token slip and the
   * bill-with-KOT on the bill's first print). */
  tokens: {
    /** which orders get a token */
    tokenFor: TokenScope;
    /** Generate Bill also prints the items the kitchen hasn't received, as a KOT on the invoice printer (never sent to the KDS) */
    billWithKot: TokenScope;
    /** Generate Bill also prints a token slip for the customer */
    billWithToken: TokenScope;
  };
  /** Hotel.saveBehave - "Save" only saves, or also opens the bill as a PDF
   * (for outlets without a printer). */
  saveBehave: "save" | "pdf";
}

// Dynamic KOT format (Task 1) - same header/footer-lines shape as
// InvoiceFormat, a separate content-type vocabulary since a KOT shows
// kitchen-relevant fields (order type, token/KOT number, customer/table)
// rather than billing ones (no logo/UPI-QR/GST here) - restaurant name and
// address are shared concepts and reuse the same content keys as
// InvoiceLineContent's "outlet-name"/"address".
export type KotLineContent =
  | "outlet-name"
  | "address"
  | "order-type"
  | "customer-details"
  | "bill-no"
  | "token-number"
  | "kot-number"
  | "billerpe-branding"
  | "text";

export interface KotLine {
  id: string;
  content: KotLineContent;
  text?: string;
  fontSize: number;
}

export interface KotFormat {
  header: KotLine[];
  footer: KotLine[];
}

export interface PromoCode {
  id: string;
  name: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  active: boolean;
}

export interface Kitchen {
  id: string;
  name: string;
  menuCategoryIds: string[];
  tableIds: string[];
  orderTypes: OpsOrderType[];
  /** menu categories not explicitly assigned to any kitchen route here. Exactly one kitchen should carry this. */
  isDefault?: boolean;
}

export type DueBillStatus = "Due" | "Settled";

export interface DueBill {
  id: string;
  billNo: string;
  customerName: string;
  mobile: string;
  date: string;
  /** ISO-ish day offset used only for the date filters in the prototype */
  daysAgo: number;
  /** What is still due on the bill. */
  amount: number;
  /** The whole bill, when known - lets the list show "due of bill" after a part-payment. */
  billTotal?: number;
  status: DueBillStatus;
  settledMode?: string;
  /** uat-backend's hms_order_msts.id this due bill was loaded from -
   * undefined for bills created before this was wired to the real
   * backend. Settling requires this; there's nothing to call without it. */
  backendOrderId?: number;
}

export type TableGridView = "Tabs" | "Sections";
