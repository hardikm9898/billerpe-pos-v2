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
  | "approval-matrix"
  | "system"
  | "audit-log";

export type StandardAction = "view" | "create" | "edit" | "delete";

/** Non-CRUD-shaped rules that don't fit the standard action grid — each tied to a specific mutator. */
export type SpecialPermission =
  | "orders.editAfterKot"
  | "orders.reopenSettled"
  | "orders.deleteOrder"
  | "orders.applyDiscountOverThreshold"
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
}

export type TableStatus = "Free" | "Held" | "Running" | "Bill Generated" | "Reserved";

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
  reservationId?: string;
  occupiedSince?: string;
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
export type OrderStatus = "Held" | "Running" | "Bill Generated" | "Settled" | "Cancelled";
/** Outlet-configurable — see `PaymentModeConfig` / `store.paymentModes`. "Split" is a derived label, never a configured mode. */
export type PaymentMode = string;

export interface PaymentModeConfig {
  id: string;
  name: string;
  active: boolean;
  /** Cash and Due are the two protected defaults — cannot be renamed away or deleted. */
  deletable: boolean;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  qty: number;
  price: number;
  variant?: string;
  addons?: { name: string; price: number }[];
  kotRound: number;
  originTable?: string;
  note?: string;
}

export interface PaymentSplit {
  mode: Exclude<PaymentMode, "Split">;
  amount: number;
}

export interface Order {
  id: string;
  orderNo: number;
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
  discount?: { label: string; amount: number; approvalFlagged?: boolean };
  deliveryCharge?: number;
  packagingCharge?: number;
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

export type ReservationStatus =
  "Booked" | "Confirmed" | "Seated" | "Completed" | "Cancelled" | "No Show";

export interface Reservation {
  id: string;
  customerName: string;
  mobile: string;
  party: number;
  tableId: string;
  tableLabel: string;
  date: string;
  time: string;
  status: ReservationStatus;
  releaseMode: "Manual" | "Auto";
  graceSeconds: number;
  note?: string;
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
}

export interface Expense {
  id: string;
  headId: string;
  amount: number;
  date: string;
  mode: "Cash" | "Bank" | "UPI";
  note: string;
  createdBy: string;
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

export interface Device {
  id: string;
  name: string;
  type: "POS Terminal" | "Tablet" | "KDS Screen" | "Mobile";
  status: "Online" | "Offline" | "Blocked";
  lastSeen: string;
  ip: string;
  registeredOn: string;
}

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

export interface SyncItem {
  id: string;
  entity: string;
  reference: string;
  action: string;
  status: "Pending" | "Synced" | "Failed" | "Conflict";
  conflictTier?: "Auto-Resolved" | "Needs Review";
  queuedAt: string;
  device: string;
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

export interface ApprovalRule {
  id: string;
  domain: string;
  threshold: string;
  approver: Role;
  enabled: boolean;
  locked: boolean;
  note?: string;
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

export interface InvoiceFormat {
  /** the real GST master switch for the whole POS */
  gstCalculation: boolean;
  gstNo: string;
  fssaiNo: string;
  multiLanguage: boolean;
  upiId: string;
  header: InvoiceLine[];
  footer: InvoiceLine[];
  /** fields present in the source form with no confirmed frontend consumer */
  unconfirmed: {
    isTokenOn: boolean;
    billWithKot: boolean;
    billWithToken: boolean;
    saveBehaviour: boolean;
  };
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
  amount: number;
  status: DueBillStatus;
  settledMode?: string;
  /** uat-backend's hms_order_msts.id this due bill was loaded from -
   * undefined for bills created before this was wired to the real
   * backend. Settling requires this; there's nothing to call without it. */
  backendOrderId?: number;
}

export type TableGridView = "Tabs" | "Sections";
