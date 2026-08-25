// Minimal real-backend client, seeded here for the auth wiring work.
// Talks to uat-backend (POS/uat-backend) - the only backend this design
// currently has anything real to call. Session is a cookie the backend
// sets (httpOnly), so every call needs credentials: "include".
export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// uat-backend's error()/success() helpers (responce/res.js) shape every
// response as { error: boolean, results: {...}, code }. Most error paths
// never call res.status(...) before res.json(...), so the HTTP status is
// commonly 200 even on auth failure - `error`/`results` are the only
// reliable signal, not res.ok.
type ApiEnvelope<T> = { error: boolean; results: T };

function unwrap<T>(json: ApiEnvelope<T> | null): T {
  if (!json || json.error) {
    const message =
      json?.results && typeof json.results === "object" && "message" in json.results
        ? String((json.results as { message?: unknown }).message)
        : "Request failed";
    throw new ApiError(message);
  }
  return json.results;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  return unwrap(json);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  return unwrap(json);
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  return unwrap(json);
}

async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    credentials: "include",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  return unwrap(json);
}

export const authApi = {
  pinLogin: (mobile: string, pin: string, deviceId: string) =>
    apiPost<{ message?: string; token?: string }>("/pinLogin", {
      mobile,
      pin,
      device_id: deviceId,
    }),
  restaurantLogin: (mobile: string, password: string, deviceId: string) =>
    apiPost<{ message?: string; token?: string }>("/restaurantLogin", {
      mobile,
      password,
      device_id: deviceId,
    }),
};

// hotelApi is scoped tightly to what's actually wired: the UPI VPA used to
// build the bill's payment QR code. The rest of what GET /singleHotel and
// POST /updateInvoiceFormate can read/write (gst_no, fssai_no,
// multiLanguage, the 10-slot header/footer line config on a *separate*
// hms_invoice_formate_mst row, etc.) stays local-only in this app's
// InvoiceFormat settings for now - that model doesn't line up with the
// backend's fixed-slot schema closely enough to force a full sync here.
//
// upiId itself had NO write path anywhere in the backend before this -
// confirmed by reading every reference to it (kto.js only ever reads
// hotel.upiId when rendering a bill) and live-testing
// updateInvoiceFormate with it included, which silently dropped it.
// Added it to that endpoint's destructure + update call (controller/
// hotel.js) since it already updates exactly this kind of Hotel-level
// setting - confirmed live afterward, and confirmed separately that
// omitting the other fields it manages (gst_no, fssai_no, ...) leaves
// them untouched rather than nulling them out (Sequelize drops undefined
// keys from its SET clause).
export type RawServiceCharge = {
  id: number;
  active: boolean;
  service_charge_type: "fixed" | "percentage";
  service_charge_value: number;
  calculation_on: "core" | "total";
  service_charge_automatic: unknown;
  calculation_on_tax: boolean;
  greater_less: "1" | "2" | "3";
  greater_less_amount: number;
};

export const hotelApi = {
  // GET /singleHotel returns the full Hotel row (confirmed live) - only
  // the fields this app actually reads are typed here. address2/gst_no/
  // fssai_no/invoiceFormateHeaderText/invoiceFormateBottomText/
  // printerSize are the real source for a printed bill's header/footer -
  // this app's own local invoiceFormat.header/footer (mock/types.ts) are
  // never synced from the server at all (loadInvoiceFormatFromServer only
  // ever pulls upiId off this same response), so they're seed/mock text
  // only and unsuitable for anything that has to be accurate.
  getSettings: () =>
    apiGet<{
      upiId: string;
      hotel_name: string;
      address1: string | null;
      address2: string | null;
      gst_no: string | null;
      fssai_no: string | null;
      invoiceFormateHeaderText: string | null;
      invoiceFormateBottomText: string | null;
      printerSize: string | null;
      hms_serviceCharge_mst: RawServiceCharge | null;
    }>("/singleHotel"),
  updateUpiId: (upiId: string) =>
    apiPost<{ message?: string }>("/updateInvoiceFormate", { hotel: { upiId } }),

  // One row per hotel - addEditServiceCharge upserts based on whether a
  // row already exists (its own findOne check), but its update branch's
  // WHERE clause uses `id` straight from the request body, not the row it
  // just found - confirmed live that omitting `id` on an update (i.e.
  // once a row already exists) 500s outright, not a silent no-op. `id`
  // must be the real existing row's id from the last load, or omitted
  // entirely only on the very first save for this hotel.
  updateServiceCharge: (params: {
    id?: number;
    active: boolean;
    service_charge_type: "fixed" | "percentage";
    service_charge_value: number;
    calculation_on: "core" | "total";
    service_charge_automatic: string[];
    calculation_on_tax: boolean;
    greater_less: "1" | "2" | "3";
    greater_less_amount: number;
  }) => apiPost<{ message?: string }>("/service_charge", params),
};

// Raw shapes as uat-backend actually returns them (controller/hotel.js) -
// kept separate from the app's mock RestaurantTable/TableCategory types so
// the adapter that converts between the two (src/mock/store.tsx) has one
// clear place to do it, rather than the two shapes silently drifting
// together.
export type RawTableCategory = {
  id: number;
  table_catag_nm: string;
  type: "T" | "R";
  active: boolean;
};

export type RawTable = {
  id: number;
  table_name: string;
  capacity: number | null;
  table_status: "R" | "F" | "P" | "H" | "B";
  active: boolean;
  type: "T" | "R";
  table_catag_id: number;
  hms_table_categ?: RawTableCategory;
};

export const tableApi = {
  getTables: () => apiGet<{ tables: RawTable[] }>("/table"),
  getCategories: () => apiGet<{ tableCatagories: RawTableCategory[] }>("/getTableCatagories"),

  // uat-backend's /table create is range-based (startNo-endNo), not
  // one-table-at-a-time - it already supports the bulk creation the old
  // app had and the new design's UI currently lacks. Its Joi schema
  // (createTableSchema) requires startNo/endNo/table_catag_id as numeric
  // strings, not numbers - unlike every other table endpoint here, which
  // isn't schema-validated and accepts plain numbers fine.
  createTables: (params: {
    startNo: number;
    endNo: number;
    table_catag_id: number;
    type: "T" | "R";
  }) =>
    apiPost<{ message?: string }>("/table", {
      startNo: String(params.startNo),
      endNo: String(params.endNo),
      table_catag_id: String(params.table_catag_id),
      type: params.type,
    }),

  editTable: (params: {
    id: number;
    table_name: string;
    table_catag_id: number;
    type: "T" | "R";
  }) => apiPost<{ message?: string }>("/editTable", params),

  // Accepts either a single id or a bulk allId array - mirrors the backend
  // route, which supports both in one endpoint.
  removeTables: (allId: number[]) => apiPost<{ message?: string }>("/removeTable", { allId }),

  createCategory: (params: { table_catag_nm: string; type: "T" | "R" }) =>
    apiPost<{ message?: string }>("/addTableCatagories", params),

  editCategory: (params: { id: number; table_catag_nm: string; type: "T" | "R" }) =>
    apiPost<{ message?: string }>("/editTableCatagories", params),

  removeCategories: (allId: number[]) =>
    apiPost<{ message?: string }>("/removeTableCatagories", { allId }),
};

export type RawMenuCategory = {
  id: number;
  menu_categ_nm: string;
  active: boolean;
  rank?: number;
};

export type RawMenuItem = {
  id: number;
  item_name: string;
  price: string; // model field is DataTypes.STRING, not a number
  favorite: boolean;
  active: boolean;
  sub_categories: string;
  description: string;
  shortCode: string;
  barcode_value: string;
  foodImage: string | null;
  gst_type: "S" | "G";
  menu_categ_id: number;
  hms_menu_categ?: RawMenuCategory;
};

export type RawVariant = { id: number; variants_name: string; active: boolean };

// controller/menu.js#getMenuItemsWithVariants (GET /menuShowWithVariants).
// Every other menu-list endpoint (MenuShow/MenuShowByCatagories/etc.)
// only ever includes Menu_categ - none of them read back a menu item's
// variant/addon-group associations (MenuVariants/MenuAddon rows, written
// by createMenu/editMenu) at all. The one existing endpoint that did
// (offlineMenu) is AES-encrypted and Redis-cached for 48h, so this
// mirrors its same include shape (model/index.js: Menu.belongsToMany(
// Variants, {as:"variantData"}), Menu.belongsToMany(AddonDepartment,
// {as:"addonDepartmentData"})) unencrypted and uncached instead. Each
// variantData entry's real per-item price lives on the junction row
// (hms_menu_variant_mst.variant_price), not on the Variants row itself -
// confirmed live, since Variants master rows have no price field at all.
export type RawMenuItemVariant = {
  id: number;
  variants_name: string;
  hms_menu_variant_mst?: { variant_price: number };
};
export type RawMenuItemAddonGroup = { id: number };

export type RawAddonOption = { id: number; addon_name: string; price: number; attributes: string };
export type RawAddonGroup = {
  id: number;
  department_name: string;
  maximum_allowed_addon: number;
  minimum_allowed_addon: number;
  singleSelection: boolean;
  hms_addon_msts?: RawAddonOption[];
};

type MenuItemPayload = {
  item_name: string;
  menu_categ_id: number;
  price: number;
  shortCode: string;
  favorite: boolean;
  sub_categories?: string;
  description?: string;
  gst_type: "S" | "G";
  barcode_value: string;
  imageUrl?: string;
  // Always required by the controller - it does `addons.length` with no
  // optional-chaining, on both create and edit, so an omitted array throws
  // a 500 rather than being treated as "no addons".
  addons: number[];
  // Both createMenu and editMenu accept this too (confirmed by reading
  // both controllers and their Joi schemas, validate.js's menuSchema/
  // editMenuSchema) - each `id` must be a real Variants master id, and
  // `variant_price` is a REQUIRED per-item price override (Joi rejects
  // <= 0). editMenu fully replaces the item's variant/addon links every
  // save (MenuVariants.destroy + recreate, same for MenuAddon) rather
  // than diffing, so this always needs the complete current list, not
  // just newly-added entries.
  variants: { id: number; variant_price: number }[];
};

type AddonGroupPayload = {
  department_name: string;
  maximum_allowed_addon: number;
  minimum_allowed_addon: number;
  singleSelection: boolean;
  addons: { addon_name: string; price: number; attributes: string }[];
};

export const menuApi = {
  // /catagories/all inner-joins on active menu items (Menu_categ.findAll
  // with include:{model:Menu, where:{active:true}}, no required:false) -
  // categories with zero items are silently excluded, which is wrong for
  // an admin "manage categories" screen (you need to see an empty category
  // to add items to it). /catagories/<substring> has no such join; a
  // literal "%" as the search key becomes a no-op LIKE pattern ("%%%"),
  // so this returns every category regardless of item count. Confirmed
  // live: /catagories/all silently dropped a just-created empty category
  // that /catagories/%25 correctly returned.
  getCategories: () => apiGet<{ catagories: RawMenuCategory[] }>("/catagories/%25"),
  getItems: () => apiGet<{ menu: RawMenuItem[] }>("/menuShow/all"),
  getItemsWithVariants: () =>
    apiGet<{
      menu: (RawMenuItem & {
        variantData?: RawMenuItemVariant[];
        addonDepartmentData?: RawMenuItemAddonGroup[];
      })[];
    }>("/menuShowWithVariants"),
  getVariants: () => apiGet<{ variants: RawVariant[] }>("/variant"),
  getAddonGroups: () => apiGet<{ addons: RawAddonGroup[] }>("/addon"),

  createCategory: (name: string) =>
    apiPost<{ message?: string }>("/catagories", { catagoriesFrom: { catagories_name: name } }),
  editCategory: (id: number, name: string, rank?: number) =>
    apiPost<{ message?: string }>("/catagoriesEdit", {
      editCatagoriesFrom: { id, menu_categ_nm: name, rank: rank ?? 0 },
    }),
  removeCategories: (allId: number[]) =>
    apiPost<{ message?: string }>("/catagoriesRemove", { allId }),

  createItem: (params: MenuItemPayload) => apiPost<{ message?: string }>("/menu", params),
  editItem: (params: MenuItemPayload & { id: number }) =>
    apiPost<{ message?: string }>("/menuEdit", params),
  removeItems: (allId: number[]) => apiPost<{ message?: string }>("/menuRemove", { allId }),

  createVariant: (variants_name: string, active: boolean) =>
    apiPost<{ message?: string; variants: RawVariant[] }>("/variant", { variants_name, active }),
  editVariant: (id: number, variants_name: string, active: boolean) =>
    apiPut<{ message?: string; variants: RawVariant[] }>("/variant", { id, variants_name, active }),

  createAddonGroup: (params: AddonGroupPayload) =>
    apiPost<{ message?: string; addons: RawAddonGroup[] }>("/addon", params),
  editAddonGroup: (params: AddonGroupPayload & { id: number }) =>
    apiPut<{ message?: string; addons: RawAddonGroup[] }>("/addon", params),
};

export type RawUserAccess = {
  access_name: string;
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

export type RawHotelUser = {
  id: number;
  name: string;
  email: string;
  number: string;
  active: boolean;
  pin: string | null; // bcrypt hash, never the real PIN
  role_mst?: { role_cd: number; role_name: string };
  hms_user_accesses?: RawUserAccess[];
};

type UserPayload = {
  active: boolean;
  name: string;
  email: string;
  role: string;
  number: string;
  password: string;
  pin?: string;
  access_name: {
    access: string;
    permissions: { read: boolean; create: boolean; edit: boolean; delete: boolean };
  }[];
};

export const userApi = {
  // GET /captain hardcodes a role_name IN ('C','A','B') filter (the old
  // 3-role convention) - a user created with any of the new design's role
  // names would never show up in it. GET /offlineHotelUser has no such
  // filter (built for the offline-sync cache, not role-scoped), so it's
  // used here instead even though its name suggests a different purpose.
  getUsers: () => apiGet<{ hotelUsers: RawHotelUser[] }>("/offlineHotelUser"),

  createUser: (params: UserPayload) => apiPost<{ message?: string }>("/user", params),
  // userSchemaUpdate requires `password` unconditionally (unlike create,
  // where it's optional in the schema but the controller hashes it
  // unconditionally anyway - effectively required either way).
  editUser: (params: UserPayload & { id: number }) =>
    apiPost<{ message?: string }>("/userUpdate", params),
};

export type KotCartItem = {
  id: number;
  qty: number;
  price: number;
  discount: number;
  addons: { name: string; price: number }[];
  comment: string;
  menu_categ_id: number;
};

type KotPayload = {
  order_type: "dinin" | "pickup";
  order_id?: number;
  table_id?: number;
  tableNumber?: string;
  cart: {
    gst: number;
    totalDiscount: number;
    grandAmount: number;
    myAmount: number;
    service_charger: number;
    discount_reason: string;
    discount_type: "fix" | "pr";
    discount_value: number;
    taxes: unknown[]; // OrderTax rows - empty until Tax Configuration is wired
    // Only one entry is ever sent: kotOrder's server-side code looks for
    // `cart.items.find(el => el.status === 'H')` (creating a new order) or
    // `cart.items.filter(el => el.status === 'H')[0]` (adding to an
    // existing one) - "H" is the only status this client needs to produce,
    // confirmed live for both the create and add-round paths.
    items: [{ status: "H"; menuItems: KotCartItem[] }];
  };
};

export const orderApi = {
  // POST /kotOrder is dual-purpose: with no order_id it creates a new
  // Order (and a placeholder Customer row, and sets the table to Running);
  // with order_id set it adds another KOT round to an existing order
  // (previously-fired rounds are untouched - only OrderDetails rows still
  // in an interim "in progress" state get replaced, confirmed live by
  // sending two rounds and checking both survived with separate
  // kotNumbers). Hard-requires the hotel to have at least one printer with
  // print_type "K" configured, or it fails outright with "Printer Not Set" -
  // Operations -> Printers isn't wired to the real backend yet, so this is
  // a real, current limitation, not a client-side gap.
  kotOrder: (payload: KotPayload) =>
    apiPost<{ message?: string; kotInfo: { order_id: number } }>("/kotOrder", payload),

  // POST /adminOrder finalizes an order (Running -> table status "P",
  // Pending Settle) - but ONLY the dine-in path is safe to call from a
  // "generate bill, no payment info yet" step. Its order_id branch runs
  // `OrderDetails.destroy({ where: { OrderId: order_id, ... } })` BEFORE
  // rebuilding from cart.items - unconditionally, regardless of each row's
  // status - so cart.items must carry the FULL accumulated set of order
  // lines (every KOT round), not just newly-added ones. This is the
  // opposite of kotOrder's contract and was confirmed the hard way: sending
  // only new items here first wiped every existing line, verified by
  // querying the table directly and finding 0 rows, then re-verified
  // correct after resending the full list (which correctly merged
  // identical lines into one row with combined qty, not duplicates).
  //
  // The pickup path additionally requires cash/card/upi/due (top-level
  // fields, not nested in cart - confirmed by reading AdminOrder's
  // destructuring of req.body) and rejects with PAYMENT_MODE_NOT_SELECTED
  // if none are set and the total is > 0. Order.payment is set to
  // STATUS.SUCCESS unconditionally for pickup in this same call (not
  // PENDING like dine-in), so for pickup this call both finalizes the bill
  // AND settles payment in one step - confirmed live: after calling this
  // with order_type "pickup" and cash:220, the order row read back as
  // status:"success", payment:"success", cash:220, and its OrderDetails
  // rows as status:"delivered", payment_status:"success". Stock is also
  // deducted in this same call for pickup (checkRawMaterialAvailableOrNot
  // runs inline, before the response), unlike dine-in where it only
  // happens later in settleBills - so there's no separate settle step to
  // wire for pickup at all.
  //
  // order_id is optional: omitting it takes AdminOrder's OTHER branch
  // (its "no order_id" `else`), which creates the Order fresh in this
  // same call instead of updating an existing one - for dine-in this
  // requires table_id and rejects with TABLE_RUNNING if that table
  // already has a pending order; for pickup it's the same create path
  // already used above. This is how a bill can be generated without ever
  // sending a KOT first - kotOrder is not the only way to create an
  // Order row.
  adminOrder: (payload: {
    order_type: "dinin" | "pickup";
    order_id?: number;
    table_id?: number;
    cash?: number;
    upi?: number;
    card?: number;
    due?: number;
    mobile?: string;
    cart: {
      items: [{ status: "H"; menuItems: KotCartItem[] }];
      gst: number;
      totalDiscount: number;
      grandAmount: number;
      myAmount: number;
      service_charger: number;
      discount_reason: string;
      discount_type: "fix" | "pr";
      discount_value: number;
      taxes: unknown[];
    };
  }) => apiPost<{ message?: string; orderId?: number }>("/adminOrder", payload),

  // POST /settleBills only ever looks up orders with order_type "dinin"
  // (its own WHERE clause) - pickup has no settlement step at all here,
  // its payment is collected directly in adminOrder's pickup branch
  // instead, confirmed by reading both functions together. Requires the
  // order to already be payment:"pending" (i.e. adminOrder must have run
  // first). cash+upi+card+due must sum to exactly `amount`, checked
  // server-side. This is also the one and only place dine-in stock gets
  // deducted (checkRawMaterialAvailableOrNot) - confirmed no other dine-in
  // code path calls it, so there's no double-deduction risk here the way
  // there is for pickup (which this app doesn't wire).
  settleBills: (payload: {
    id: number;
    amount: number;
    cash: number;
    upi: number;
    card: number;
    due: number;
    mobile?: string;
  }) => apiPost<{ message?: string }>("/settleBills", payload),

  // controller/order.js#deleteOrder (POST /orderRemove). Soft-delete only
  // (Order.deleted=true) - the row and its OrderDetails stay in the DB
  // forever, no stock is ever reversed (the one real stock-reversal
  // function in this backend, cancelOrderStock in controller/recipes.js,
  // is dead code - never called from here or anywhere), and there's no
  // status-transition guard: a fully-Settled order with real payment
  // recorded soft-deletes exactly the same way as a brand-new unpaid one,
  // no confirmation, no undo. Every order-read endpoint in this backend
  // filters deleted:false, so once this succeeds the order is gone from
  // every future load for good - confirmed live (deleted an order, then
  // both GET /order/:id and GET /searchOrder/all stopped returning it
  // entirely). There is no separate "Cancelled" list to browse
  // afterward: cancelOrderReport itself defines a "cancelled" order as
  // nothing but a soft-deleted, previously-settled row - this backend has
  // no real concept of cancel distinct from delete.
  remove: (id: number, opts?: { free?: boolean }) =>
    apiPost<{ message?: string }>("/orderRemove", {
      id,
      ...(opts?.free ? { free: "free" } : {}),
    }),
  // Same endpoint, bulk form (`allId` instead of `id`) - confirmed by
  // reading deleteOrder that the bulk path never frees tables even if
  // `free` is sent, unlike the single-id path.
  removeBulk: (ids: number[]) => apiPost<{ message?: string }>("/orderRemove", { allId: ids }),

  // controller/kto.js#sentEbill (POST /sentEbill). A genuine WhatsApp
  // Cloud API template send (graph.facebook.com), not a stub - but the
  // backend never awaits that call before responding, so a success
  // response here only means the request was credit-gated and accepted,
  // not that WhatsApp actually delivered anything. Requires a real
  // mobile number; the backend never looks one up automatically from the
  // order. Not tested live against a real send (would message a real
  // phone number) - wired from reading the controller in full instead.
  sendEBill: (params: { orderId: number; mobile: string }) =>
    apiPost<{ message?: string }>("/sentEbill", params),

  // controller/kto.js#getEbillCredit (GET /getEbillCredit). Returns 50 by
  // default when no credit row exists yet for this hotel - matches
  // sentEbill seeding a new row at 49 credits after its first successful
  // send (50 - 1).
  getEBillCredit: () => apiGet<{ credit: number }>("/getEbillCredit"),

  // controller/order.js#getPickupOrder (GET /pickupOrder). Named for
  // pickup but actually returns every currently active order regardless
  // of type - `order_type IN (dinin, pickup)`, `status IN (in-progress,
  // hold, success)`, `payment: pending`, `deleted: false` - confirmed
  // live, including a real dine-in order. This is the authoritative list
  // of every order this app should treat as "currently open" anywhere in
  // the UI (table-grid, Orders list), independent of which table (if
  // any) it's on - unlike GET /table's embedded orders, which only ever
  // surfaces orders tied to a table and misses tableless pickup orders
  // entirely. Doesn't include OrderDetails (line items), so
  // reconstructing a full order still needs a getSingleOrder follow-up
  // per id (orderHistoryApi.getDetail).
  getActiveOrders: () => apiGet<{ order: RawOrderHeader[] }>("/pickupOrder"),

  // controller/kto.js#invoiceGeneratePdf (POST /generateInvoicePdf).
  // Renders the bill via Puppeteer and returns the PDF as a raw byte
  // array inside JSON (`{type:"Buffer", data:[...]}`), not a URL or
  // base64 - reconstruct with `new Uint8Array(pdf.data)`. Item addons are
  // expected in a `{department_name, hms_addon_msts:[{addon_name,qty,
  // price}]}[]` shape this app's own OrderLine.addons (flat
  // {name,price}[]) doesn't carry - omitted from the printed bill rather
  // than sent in a fabricated shape.
  //
  // Puppeteer's browser-launch path is keyed off `data.origin ===
  // "http://localhost:3000"` exactly (an unrelated hardcoded dev port,
  // confirmed by reading generateInvoicePDF) - any other origin, which is
  // every origin this app will ever actually run on, falls through to a
  // `/usr/bin/google-chrome-stable` path that doesn't exist on this
  // Windows dev backend (confirmed live: the sibling generateKotPdf 500s
  // outright, this endpoint instead silently returns `pdf:{}`, an empty
  // object, with no error). The endpoint does produce a real PDF - this
  // was confirmed by resending the exact same request with an Origin
  // header spoofed to that hardcoded value and getting back real PDF
  // bytes - but that's not something a real browser's fetch can do (the
  // browser controls the Origin header, not app code). In a real Linux
  // production deployment with Chrome installed at that path, real
  // traffic would take the same branch that already works here, since
  // production origins won't be "localhost:3000" either - there's just
  // no way to verify that end-to-end from this dev environment.
  generateInvoicePdf: (payload: {
    orderId: number;
    printerSize: string;
    tableAndUserInfo: string;
    dateAndTime: string;
    type: "dinin" | "pickup";
    token: number;
    customerName?: string;
    customerNumber?: string;
    address?: string;
    gstin?: string;
    items: {
      item_name: string;
      qty: number;
      price: number;
      totalAmount: number;
      variantData?: { variants_name: string } | null;
    }[];
    totalQty: number;
    subtotal: number;
    totalDiscount: number;
    service_charge: number;
    orderTax: {
      hms_tax_type_mst: { tax_name: string };
      amount: number;
      tax_type: "pr" | "fix";
      tax_value: number;
    }[];
    totalBill: number;
    headerText: string[];
    footerText: string[];
  }) =>
    apiPost<{ orderId: number; pdf: { type: "Buffer"; data: number[] } }>(
      "/generateInvoicePdf",
      payload,
    ),

  // controller/order.js#getTimeLineByOrderId (GET /getTimelineByOrderId).
  // One row per real workflow event fired via addToTimeLine/
  // addToFroRemoveTimeLine in controller/kto.js - `action` is one of the
  // ACTION constants (constant/const.js): place_order, kot, hold, settle,
  // update_order, update_order_item, decrease_kot_qty, free_table,
  // delete_order ("remove_kot" exists in the enum but its one call site
  // is commented out, so it never actually fires). Each row is a
  // snapshot (order_status/grandAmount/items as of that moment), not an
  // explicit before/after diff - there's no prior-value field to read
  // back, only the state at each point.
  getTimeline: (orderId: number) =>
    apiGet<{ timesLines: RawTimelineEntry[] }>(`/getTimelineByOrderId?id=${orderId}`),
};

export type RawTimelineEntry = {
  id: number;
  order_type: string;
  bill_no: string;
  order_status: string;
  created_Date: string;
  from: string;
  device_name: string;
  action: string;
  creator: string;
  grandAmount: number;
  hotelUserId: number | null;
  hms_hotelUser_master?: { name?: string } | null;
};

export type RawOrderHeader = {
  id: number;
  bill_no: string;
  order_type: "dinin" | "pickup" | "delivery";
  payment: string;
  // "dispatch" (model default, never actually seen on a real row) |
  // "in-progress" | "hold" | "success" - overloaded ORDER_TYPE workflow
  // state, distinct from `payment`.
  status: string;
  grandAmount: number;
  gst: number;
  totalDiscount: number;
  discount_reason: string;
  service_charge: number;
  cash: number;
  upi: number;
  card: number;
  due: number;
  business_date: string;
  createdAt: string;
  updatedAt: string;
  hotelUserId: number | null;
  TableId: number | null;
  hms_table_mst?: { table_name: string } | null;
  hms_user_master?: { name?: string; number?: string } | null;
};

export type RawOrderLine = {
  id: number;
  qty: number;
  price: number;
  variant_name: string | null;
  addons: string;
  MenuId: number;
  hms_menu_mst?: { item_name?: string };
};

export type RawOrderDetail = RawOrderHeader & {
  hms_orderDetails: RawOrderLine[];
};

// controller/order.js. No date-ranged bulk listing endpoint exists that's
// simultaneously unencrypted and line-item-complete: getAllOrderPaginationWise
// (GET /paginateOrder) has full line detail but AES-encrypts its whole
// response with a server-side secret (CryptoJS, controller/order.js's own
// `encryptData` helper) this app has no decrypt path for and has never
// needed one before, has no date-range params at all (only `page` and an
// exact bill_no `search`), and hard-filters to payment:"success" only with
// a page size fixed at 10 the caller can't raise. So order history here is
// built from two unencrypted calls instead: getOrdersByBillNo
// (GET /searchOrder/all) for an unbounded list of every non-deleted
// order's header (no line items, no date filter of its own - the caller
// filters client-side), then getSingleOrder (GET /order/:id) per order
// actually wanted, for its real lines. Cancelled orders are invisible to
// both (cancellation is modelled purely as deleted:true, and both
// endpoints filter deleted:false) - there is no backend-retrievable
// source for a "Cancelled" history entry through this app at all.
export const orderHistoryApi = {
  getAllHeaders: () => apiGet<{ order: RawOrderHeader[] }>("/searchOrder/all"),
  getDetail: (id: number) => apiGet<{ order: RawOrderDetail }>(`/order/${id}`),
};

// Every /kitchen/* route is guarded by a *different* auth middleware
// (middleware/adminAuth.js's adminAuth, which additionally requires a
// matching UserSession row) than most of the routes above (middleware/
// auth.js's isAuth) - confirmed live that restaurantLogin's cookies
// satisfy both, so this doesn't need separate handling here, just noting
// the backend isn't internally consistent about which auth guard it uses.
export type RawKitchen = {
  id: number;
  kitchen_name: string;
  // JSON-typed columns (model/kitchen.js) but confirmed live to come back
  // as JSON-encoded strings ("[1,2]"), not parsed arrays - kept as unknown
  // here so the adapter (store.tsx's mapRawKitchen) has to handle both
  // rather than assume one.
  table_ids: unknown;
  menu_categ_ids: unknown;
  order_type: unknown;
};

export const kitchenApi = {
  getKitchens: () => apiGet<{ kitchen: RawKitchen[] }>("/kitchen/kitchens"),

  // Only accepts kitchen_name - table_ids/menu_categ_ids/order_type are
  // NOT settable at creation, the controller auto-populates them with
  // every currently-active table/category and both order types. Doesn't
  // return the new row's id either, so the caller has to reload and look
  // it up by name (kitchen_name is enforced unique per hotel - confirmed
  // by reading createKitchen's own duplicate-name check).
  createKitchen: (kitchenName: string) =>
    apiPost<{ message?: string }>("/kitchen/kitchens", { kitchen_name: kitchenName }),

  // The only way to actually set table_ids/menu_categ_ids/order_type -
  // used both right after createKitchen (to apply what the create dialog
  // actually chose, since create itself can't) and for editing an
  // existing kitchen. Does NOT accept kitchen_name - renaming a kitchen
  // has no endpoint anywhere in this backend at all (kds.js's editKitchen
  // function exists but the only route that could reach it is commented
  // out, and even uncommented it's wired to the wrong controller
  // function - editRecipes, not editKitchen. Confirmed by reading
  // routes/kitchen.js in full, not by a failed request).
  setCategoryForKitchen: (params: {
    id: number;
    table_ids: number[];
    menu_categ_ids: number[];
    order_type: ("dinin" | "pickup")[];
  }) => apiPost<{ message?: string }>("/kitchen/setCategoryForKitchen", params),

  deleteKitchen: (id: number) => apiDelete<{ message?: string }>(`/kitchen/deleteKitchen/${id}`),
};

export type RawDueOrder = {
  id: number;
  bill_no: string;
  due: number;
  createdAt: string;
  hms_user_master?: { name: string; number: string } | null;
};

// getDueOrders has two branches (controller/order.js): search-by-bill_no
// or search-by-mobile-number (neither wired here), and a date-range
// default that requires real startDate/endDate - passing them undefined
// runs Op.between [undefined, undefined] server-side and returns nothing
// useful, confirmed live. Only the date-range default is used here; the
// app's own client-side Today/7-days/30-days/All-time filter runs on top
// of one wide fetch rather than re-querying per range.
export const dueApi = {
  getDueOrders: (startDate: string, endDate: string) =>
    apiPost<{ dueOrders: { totalDuePayment: number | null; orders: RawDueOrder[] } }>(
      "/getDueOrders",
      { startDate, endDate, searchData: {} },
    ),

  // mode is lowercase ("cash"|"upi"|"card") - confirmed live, unlike every
  // other payment-mode field in this app (which is capitalized: "Cash").
  // receive can be less than the order's full due (a real partial
  // payment) - confirmed live that calling this twice with different
  // modes correctly splits the payment: due decremented each time, two
  // separate hms_due_payment_receives audit rows, one per mode. `amount`
  // is destructured server-side but never actually used - sent anyway to
  // match the shape rather than rely on that being permanent.
  settleDue: (params: { id: number; mode: "cash" | "upi" | "card"; receive: number }) =>
    apiPost<{ dueOrders: unknown }>("/settleDue", {
      data: { id: params.id, amount: params.receive, mode: params.mode, receive: params.receive },
      searchData: {},
    }),

  // Unlike settleDue, always settles each order's FULL remaining due, in
  // one payment mode, for every id in idArray - no partial amounts, no
  // per-bill mode. Used for the "Settle selected" bulk action.
  settleAllDue: (idArray: number[], mode: "cash" | "upi" | "card") =>
    apiPost<{ message?: string }>("/allSettleDue", { idArray, mode }),
};

export type RawCustomer = {
  id: number;
  number: string;
  name: string;
  address: string;
  gstin: string;
};

// /customer/getAll (controller/user.js's getNumberSuggestion, reused under
// a clearer route name) GROUP BYs on number - dedupes the many User rows
// that can share a phone number (one gets created per order unless a
// matching number already exists) down to one row per number, taking the
// MAX (i.e. most recently inserted) non-empty name/address/gstin/id for
// each. It's an identity list, not an order join, so there's no order
// count or last-visit date to load from here - confirmed by reading the
// query, nothing this app's Customer type wants for those two fields
// exists in the response.
export const customerApi = {
  // limit set high rather than wired to true pagination - this loads "the
  // first N customers" once and the existing local name/phone search runs
  // against that set, same pattern as loadDueBillsFromServer.
  getAll: () => apiGet<{ numbers: RawCustomer[]; total: number }>("/customer/getAll?limit=500"),

  // Rejects a duplicate number outright (its own findOne check) - not
  // silently deduped or merged.
  create: (params: { name: string; number: string; gstin: string; address: string }) =>
    apiPost<{ message?: string }>("/customer/create", params),

  update: (params: { id: number; name: string; number: string; gstin: string; address: string }) =>
    apiPut<{ message?: string }>("/customer/update", params),
};

export type RawPrinter = {
  id: number;
  printer_name: string;
  print_type: "K" | "I";
  printer_size: "2" | "3" | "4";
  number_of_copies: number;
  table_ids: unknown;
  menu_categ_ids: unknown;
  order_type: unknown;
};

// GET /printer (controller/printer_setting.js's getPrinter) strips every
// row's id before returning it - only printer_size/printer_name/
// number_of_copies survive, reshaped into a
// {defaultPrinter:{K,I,multi}, primaryPrinters:[...]} envelope. There is
// no way to edit, delete, or setCategoriesForPrinter on anything loaded
// from it, confirmed by reading the controller, not by a failed request.
// GET /offlinePrinterSetting (built for offline-sync caching) returns the
// raw model rows instead, id included - used here as the list endpoint
// instead, same kind of substitution as menuApi.getCategories using
// /catagories/%25 instead of the lossy /catagories/all.
export const printerApi = {
  getAll: () => apiGet<{ printerSettings: RawPrinter[] }>("/offlinePrinterSetting"),

  // setPrinterSetting hardcodes default:true on every row it creates (no
  // uniqueness check on printer_name either, unlike Kitchens) - confirmed
  // live creating two printers with the same name is allowed, so the
  // caller can't safely find a just-created row by name; it has to diff
  // the id set before/after instead (see upsertPrinter).
  create: (params: {
    printer_name: string;
    printer_size: string;
    number_of_copies: number;
    print_type: "K" | "I";
  }) => apiPost<{ message?: string }>("/setPrinter", params),

  update: (params: {
    id: number;
    printer_name: string;
    printer_size: string;
    number_of_copies: number;
    print_type: "K" | "I";
  }) => apiPost<{ message?: string }>("/EditPrinter", params),

  // items_ids is a genuine typo in the controller (the model's column is
  // item_ids) - confirmed live it never actually persists. Not sent here;
  // this app's Printer type has no per-item routing to lose anyway.
  setCategories: (params: {
    id: number;
    table_ids: number[];
    menu_categ_ids: number[];
    order_type: ("dinin" | "pickup")[];
  }) => apiPost<{ message?: string }>("/setCategoriesForPrinter", params),

  remove: (id: number) => apiPost<{ message?: string }>("/deletePrinter", { id }),
};

export type RawTaxType = {
  id: number;
  tax_name: string;
  tax_value: "fix" | "pr";
  amount: number;
  order_type: unknown;
  active: boolean;
  table_categ_ids: unknown;
  menu_ids: unknown;
};

// There is no delete endpoint for tax rules at all (confirmed by reading
// routes/tax.js in full - only GET/POST/PUT exist), and editTaxType can
// only ever turn a rule ON: `if (active) updateObject.active = active`
// means active:false is falsy and silently never gets included in the
// update - confirmed live, toggling a rule off has no effect at all on
// reload. Neither create nor edit here, both left local-only.
export const taxApi = {
  getAll: () => apiGet<{ taxtTypes: RawTaxType[] }>("/taxType/tax"),

  // menu_ids is validated (Joi) as an array of individual menu item ids,
  // not menu category ids - this app's TaxRule is category-scoped, so
  // the caller has to expand categories to their member items before
  // calling this (see store.tsx's upsertTaxRule). amount must be > 0,
  // confirmed live (Joi rejects 0 outright) - this app's UI doesn't
  // enforce that today, so callers need to check first.
  create: (params: {
    tax_name: string;
    tax_value: "fix" | "pr";
    amount: number;
    order_type: ("dinin" | "pickup")[];
    active: boolean;
    menu_ids: number[];
    table_categ_ids: number[];
  }) => apiPost<{ message?: string }>("/taxType/tax", params),

  // editTaxType's own destructure accesses order_type.length/menu_ids
  // .length/table_categ_ids.length unconditionally - omitting any of the
  // three throws a 500, confirmed live. All three are always sent here,
  // never left out even when unchanged.
  update: (params: {
    id: number;
    tax_name: string;
    tax_value: "fix" | "pr";
    amount: number;
    order_type: ("dinin" | "pickup")[];
    active: boolean;
    menu_ids: number[];
    table_categ_ids: number[];
  }) => apiPut<{ message?: string }>("/taxType/tax", params),
};

export type RawUnit = {
  id: number;
  unit_name: string;
  shortName: string;
};

// controller/stock_Mangement/unit.js - unlike most of the CRUD wired so
// far, this is genuinely clean: rejects a duplicate unit_name, and every
// mutation returns the fresh full list in the same response, so no
// separate reload call is needed after create/edit.
export const stockUnitApi = {
  getAll: () => apiGet<{ units: RawUnit[] }>("/stock/getAllUnit"),
  create: (params: { unitName: string; shortName: string }) =>
    apiPost<{ units: RawUnit[] }>("/stock/addUnit", params),
  update: (params: { id: number; unitName: string; shortName: string }) =>
    apiPut<{ units: RawUnit[] }>("/stock/editUnit", params),
};

export type RawRawMaterial = {
  id: number;
  raw_material_name: string;
  purchase_price: string;
  conversion_qty: number;
  // Genuinely an INTEGER column (0/1) despite being Joi-validated as a
  // boolean going in - the model's actual BOOLEAN column
  // (minimum_stock_level) is never written by either controller,
  // confirmed by reading both addRawMaterial and editRawMaterial in full.
  mini_stock_level: number;
  mini_stock_level_qty: number;
  unit_id: number;
  consumption_unit: number;
  purchaseUnit?: RawUnit;
  consumptionUnit?: RawUnit;
};

// controller/stock_Mangement/rawMaterial.js. purchase_price is a STRING
// matching /^\d+(\.\d+)?$/ (Joi), not a number - confirmed by reading the
// schema. editRawMaterial also blocks changing unit/consumption_unit/
// conversion_qty once any stock has been received against this material
// (a StockInHand row with available_stock_Consiompsion_qty > 0) - a real
// business rule surfaced as a normal ApiError, not specially handled here.
export const rawMaterialApi = {
  getAll: (search?: string) =>
    apiGet<{ rawMaterials: RawRawMaterial[] }>(
      `/stock/getAllRawMaterial${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),
  create: (params: {
    raw_material_name: string;
    purchase_price: string;
    unit: number;
    consumption_unit: number;
    conversion_qty: number;
    mini_stock_level: boolean;
    mini_stock_level_qty: number;
  }) => apiPost<{ rawMaterials: RawRawMaterial[] }>("/stock/addRowMaterial", params),
  update: (params: {
    id: number;
    raw_material_name: string;
    purchase_price: string;
    unit: number;
    consumption_unit: number;
    conversion_qty: number;
    mini_stock_level: boolean;
    mini_stock_level_qty: number;
  }) => apiPut<{ rawMaterials: RawRawMaterial[] }>("/stock/editRowMaterial", params),
};

export type RawSupplier = { id: number; name: string; deleted_status: boolean };

// model/Inventory/supplyer.js only has `name` - no contact/phone/gstin/
// outstanding at all, confirmed by reading the model. createSupplier's
// response returns just the new row under `supplier` (singular object);
// editSupplier's response reuses the exact same key name for the full
// list instead (an array) - confirmed live, not assumed - so callers
// reload via getAll after either write rather than trust either shape.
export const supplierApi = {
  getAll: () => apiGet<{ suppliers: RawSupplier[] }>("/stock/supplier"),
  create: (name: string) => apiPost<unknown>("/stock/supplier", { name }),
  update: (id: number, name: string) => apiPut<unknown>("/stock/supplier", { id, name }),
};

export type RawPurchaseOrderLine = {
  id: number;
  raw_material_id: number;
  raw_material_name?: string;
  quantity: number;
  unit?: RawUnit;
  price: number;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type RawPurchaseOrderPayment = {
  id: number;
  amount: number;
  paymentDate: string;
  payment_mode: string;
  payment_ref_no: string;
  deleted_status: boolean;
  createdAt: string;
};

export type RawPurchaseOrder = {
  id: number;
  date: string;
  invoice_date: string | null;
  invoice_number: string;
  Po_no: number;
  grandAmount: number;
  GSTNo: string;
  deleted_status: boolean;
  sub_total: number;
  discount: number;
  discount_type: "fix" | "pr";
  discount_value: number;
  supplier?: { id: number; name: string };
  rawMaterials: RawPurchaseOrderLine[];
  payments: number;
  paymentList: RawPurchaseOrderPayment[];
};

// controller/stock_Mangement/purchaseOrder.js - the most consequential
// contract read in full before writing anything, given real money and
// stock quantities move through it. Two confirmed gaps that shape how
// this is wired:
//
// 1. Creation immediately updates stock (calls stockInFunction for every
// line, inside a transaction) - there is no "ordered but not received"
// state server-side at all. This app's local Draft/Ordered stage before
// receipt has nothing to call here; only the "receive" step maps to an
// actual backend write (create, or edit if already received once).
//
// 2. createPurchaseOrder only records a payment (PurchaseOrderPayment)
// when payment_type is exactly "paid" - sending paidAmount alongside
// payment_type "partial" is silently discarded, confirmed live (created
// a PO with paidAmount:1000 and payment_type:"partial", payments came
// back 0). paidAmount > 0 is always recorded via the separate payment
// endpoint afterward instead of relying on create's embedded logic at
// all, for both "paid" and "partial".
//
// editPurchaseOrder is also NOT wrapped in a transaction (unlike create
// and delete) - a partial failure mid-edit could leave the order, its
// line items, and stock levels inconsistent. Pre-existing backend risk,
// not something fixed here.
//
// getPurchaseOrders requires real startDate/endDate (getShiftedDateRange
// defaults to "today" if omitted) and does NOT filter out
// deleted_status:true rows - they stay in the list, which is what this
// app's own "Cancelled" status already expects to see.
export const purchaseOrderApi = {
  getAll: (startDate: string, endDate: string) =>
    apiGet<{
      purchaseOrders: RawPurchaseOrder[];
      summary: {
        totalPurchase: number;
        totalPayment: number;
        outStandingPayment: number;
        totalOrders: number;
      };
    }>(`/stock/purchaseOrder?startDate=${startDate}&endDate=${endDate}`),

  getMaxPo: () => apiGet<{ maxPo: number }>("/stock/maxPo"),

  // payment_type is always sent as "unpaid" (with payment_mode "cash" and
  // payment_ref_no "" just to clear the Joi conditionals safely) - actual
  // payments are always recorded through the separate payment() call
  // below instead of relying on create's embedded payment_type === "paid"
  // logic, which only ever records a payment for that one exact value
  // (see this const's own comment above).
  create: (params: {
    supplier_id: number;
    GSTNo: string;
    grandAmount: number;
    discount: number;
    delivery_charge: number;
    invoice_date?: string;
    invoice_number: string;
    Po_no: number;
    discount_type: "fix" | "pr";
    discount_value: number;
    sub_total: number;
    rawMaterialData: {
      raw_material_id: number;
      qty: number;
      price: number;
      amount: number;
      cgst: number;
      sgst: number;
      igst: number;
      unit_id: number;
    }[];
  }) =>
    apiPost<{ message?: string }>("/stock/purchaseOrder", {
      ...params,
      payment_type: "unpaid",
      payment_mode: "cash",
      payment_ref_no: "",
    }),

  // rawMaterialData[].id is matched by editPurchaseOrder against this
  // PO's *currently active* PurchaseRawMaterial rows only (deleted_status
  // false); any line it fetched for this PO but that isn't claimed by a
  // matching id in the sent array gets silently soft-deleted (its stock
  // reversed) as "removed" - confirmed live the hard way: sending a line
  // id that belonged to a different, already-deleted PO caused this
  // PO's real line to be silently wiped, with no error surfaced at all.
  // Callers must always source `id` here from this PO's own most recent
  // load (mapRawPurchaseOrder's backendLineId), never a cached/stale one.
  update: (params: {
    id: number;
    supplier_id: number;
    GSTNo: string;
    grandAmount: number;
    discount: number;
    delivery_charge: number;
    invoice_date?: string;
    invoice_number: string;
    Po_no: number;
    discount_type: "fix" | "pr";
    discount_value: number;
    sub_total: number;
    rawMaterialData: {
      id?: number;
      raw_material_id: number;
      qty: number;
      price: number;
      amount: number;
      cgst: number;
      sgst: number;
      igst: number;
      unit_id: number;
    }[];
  }) =>
    apiPut<{ message?: string }>("/stock/purchaseOrder", {
      ...params,
      // updatePurchaseOrderSchema validates payment_type/payment_mode/
      // payment_ref_no (payment_mode required only when payment_type is
      // "paid"; payment_ref_no required whenever payment_mode isn't
      // "cash", including when payment_mode is simply absent - Joi's
      // `not: 'cash'` matches undefined too) even though
      // editPurchaseOrder's controller body destructures payment_type
      // but never actually uses it, and doesn't destructure payment_mode/
      // payment_ref_no at all - confirmed by reading the whole function.
      // Sent only to satisfy validation, with values that can't trip the
      // conditional requirements.
      payment_type: "unpaid",
      payment_mode: "cash",
      payment_ref_no: "",
    }),

  remove: (id: number) => apiDelete<{ message?: string }>("/stock/purchaseOrder", { id }),

  payment: (params: {
    id: number;
    payment_mode: "cash" | "card" | "online" | "cheque" | "other";
    payment_ref_no: string;
    payment_date: string;
    paidAmount: number;
  }) => apiPost<{ message?: string }>("/stock/payment", params),
};

export type RawStockInHand = {
  id: number;
  qty: number;
  price: string;
  average_price: string;
  total_amount: number;
  available_stock_Consiompsion_qty: number;
  raw_material_id: number;
};

// controller/stock_Mangement/stockInOut.js. qty here is always in
// purchase units (matching StockInHand.qty); consumption-unit quantity
// is available_stock_Consiompsion_qty, already converted server-side.
// stockOut has no price field - only stockIn does.
export const stockInHandApi = {
  getAll: () => apiGet<{ stockInHand: RawStockInHand[] }>("/stock/stockInHand"),
  stockIn: (params: { raw_material_id: number; qty: number; price: number }) =>
    apiPost<{ message?: string }>("/stock/stockIn", params),
  stockOut: (params: { raw_material_id: number; qty: number }) =>
    apiPost<{ message?: string }>("/stock/stockOut", params),
};

export type RawWastage = {
  id: number;
  qty: number;
  average_price: number;
  reason: string;
  notes: string;
  business_date: string;
  raw_material_id: number;
  // hms_hotelUser_master comes back on this response with the full staff
  // row attached - bcrypt password hash, JWT refresh token and all. Not
  // declared here at all; never read a field off it below.
  hms_hotelUser_master?: { name?: string };
};

// controller/stock_Mangement/westage.js - transactional both ways (create
// and delete), unlike editPurchaseOrder. Deliberately not wired: delete -
// this app's Wastage has no undo/remove action anywhere in its own store
// or UI, so there's nothing on this side to call it from.
export const wastageApi = {
  getAll: (startDate: string, endDate: string) =>
    apiGet<{ totalCost: number | null; data: RawWastage[] }>(
      `/stock/wastage?page=1&limit=1000&startDate=${startDate}&endDate=${endDate}`,
    ),

  // raw_material_id/unit_id are validated as STRINGS here (Joi's
  // joi.string(), confirmed live a numeric value gets rejected with
  // '"[0].raw_material_id" must be a string') - the one place in this
  // whole backend that requires numeric-looking ids as strings rather
  // than numbers, everywhere else wired so far wants numbers. qty is
  // always sent in consumption units with unit_id set to the material's
  // own consumption unit, since this app's Wastage.qty is already in
  // consumption units and the controller accepts either unit as long as
  // unit_id matches it consistently.
  create: (
    items: {
      raw_material_id: string;
      qty: number;
      unit_id: string;
      reason: string;
      notes?: string;
    }[],
  ) => apiPost<{ message?: string }>("/stock/wastage", items),
};

export type RawSFI = {
  id: number;
  name: string;
  unit_id: number | null;
  min_stock_level: boolean;
  min_stock_qty: string;
  unit?: { unit_name: string };
  stock?: { available_qty: string; cost_per_unit: string; total_amount: string };
};

export type RawSFIRecipeLine = {
  id: number;
  raw_material_id: number;
  consumption_qty: string;
};

export type RawSFIDetail = RawSFI & { recipes: RawSFIRecipeLine[] };

// controller/semiFinishedItems.js - genuinely well-built: real
// transactions on every write, row locking on production, hard deletes
// (not the soft-delete pattern most of the rest of this backend uses),
// correct weighted-average cost math (verified live). GET /all doesn't
// include each item's recipe lines, only GET /single does (confirmed
// live) - loading the full picture needs one /single call per item,
// acceptable since a hotel only has a handful of semi-finished items,
// not the N+1 concern it'd be for a larger list.
export const semiFinishedApi = {
  getAll: () => apiGet<RawSFI[]>("/semiFinished/all"),
  getSingle: (id: number) => apiGet<RawSFIDetail>(`/semiFinished/single?id=${id}`),

  create: (params: {
    name: string;
    unit_id: number;
    min_stock_level: boolean;
    min_stock_qty: number;
    recipes: { raw_material_id: number; consumption_qty: number }[];
  }) => apiPost<{ id: number }>("/semiFinished/add", params),

  update: (params: {
    id: number;
    name: string;
    unit_id: number;
    min_stock_level: boolean;
    min_stock_qty: number;
    recipes: { raw_material_id: number; consumption_qty: number }[];
  }) => apiPut<Record<string, never>>("/semiFinished/edit", params),

  remove: (id: number) => apiDelete<Record<string, never>>(`/semiFinished/delete?id=${id}`),

  // consumption_qty on each recipe line is "per 1 unit produced" both
  // sides already (this app's own SemiFinished doc comment says the same
  // thing about its BOM) - produced_qty multiplies straight through with
  // no unit conversion needed, confirmed live (2 units at 200g/unit
  // consumed exactly 400g and cost exactly what the weighted average
  // predicted).
  recordProduction: (params: {
    semi_finished_item_id: number;
    produced_qty: number;
    notes?: string;
  }) =>
    apiPost<{ produced_qty: number; raw_material_cost: number }>(
      "/semiFinished/production",
      params,
    ),
};

export type RawRecipeIngredient = {
  ingredient_type: "raw_material" | "semi_finished";
  raw_material_id?: number;
  semi_finished_item_id?: number;
  consumption_qty: number;
};

export type RawRecipeDetail = {
  menu_id: number;
  item_name: string;
  variants: { variant_id: number | null; raw_materials: RawRecipeIngredient[] }[];
};

export type RawRecipeSummary = { menu_id: number };

// controller/recipes.js. addRecipes/editRecipes each operate on exactly
// ONE (menu_id, variant_id, addon_id) combination per call, not a whole
// item's recipe at once - addRecipes 409s if that combination already
// exists ("use edit instead"), editRecipes 404s if it doesn't ("use add
// instead"), so the caller has to already know which one applies.
// editRecipes fully replaces (destroy then bulkCreate) rather than
// diffing by line id - the full current ingredient list is always sent,
// never a partial one, confirmed live.
//
// This app's RecipeEditor has no way to pick which real Variant/Addon a
// "variant group"/"addon group" corresponds to at all (its group `key`
// is a random local string, `label` is free text) - only the base group
// (variant_id: null, addon_id: null) is an unambiguous, addressable
// combination, so only that one is wired here (store.tsx's upsertRecipe
// warns rather than silently drops if a variant/addon group has content).
export const recipeApi = {
  getAllLinked: () => apiGet<{ recipes: RawRecipeSummary[] }>("/recipes/getAllRecipes"),
  getSingle: (menuId: number) =>
    apiGet<RawRecipeDetail>(`/recipes/getSingleRecipes?menu_id=${menuId}`),
  add: (params: {
    menu_id: number;
    raw_material_data: {
      raw_material_id?: number;
      semi_finished_item_id?: number;
      consumption_qty: number;
    }[];
  }) => apiPost<{ message?: string }>("/recipes/addRecipe", params),
  edit: (params: {
    menu_id: number;
    raw_material_data: {
      raw_material_id?: number;
      semi_finished_item_id?: number;
      consumption_qty: number;
    }[];
  }) => apiPut<{ message?: string }>("/recipes/editRecipe", params),
  remove: (menuId: number) =>
    apiDelete<{ message?: string }>("/recipes/deleteRecipe", { menu_id: menuId }),
};

export type RawExpenseHead = {
  id: number;
  expense_head_name: string;
  deleted: boolean;
};

// controller/expence/expence.js. No delete endpoint for heads exists at all
// (only add/edit) - a head created here can never be removed through this
// app either.
export const expenseHeadApi = {
  getAll: () => apiGet<{ expenseHeads: RawExpenseHead[] }>("/expense/getAllExpenseHead"),
  create: (expense_head_name: string) =>
    apiPost<{ expenseHeads: RawExpenseHead[] }>("/expense/addExpenseHead", {
      expense_head_name,
    }),
  update: (id: number, expense_head_name: string) =>
    apiPut<{ expenseHeads: RawExpenseHead[] }>("/expense/editExpenseHead", {
      id,
      expense_head_name,
    }),
};

export type RawExpenseEntry = {
  id: number;
  amount: string;
  reason: string;
  paymentMode: string;
  addExpense: boolean;
  business_date: string;
  expense_head_id: number;
  hms_expense_head_mst?: { expense_head_name?: string };
};

// controller/expence/expence.js. allEntry requires both startDate/endDate
// (Joi-enforced - confirmed live there's no "defaults to today" gap here
// unlike some other list endpoints), and buckets by business_date, not
// createdAt. addExpense:true is money going out (an actual expense),
// addExpense:false is money coming in - this app's Expense type only
// models outgoing expenses, so every entry created here always sends
// addExpense:true. No field on the response identifies which staff member
// recorded the entry (no user include, unlike Wastage's
// hms_hotelUser_master), so that's not something this app can show either.
export const expenseApi = {
  getAll: (startDate: string, endDate: string) =>
    apiGet<{ entry: RawExpenseEntry[] }>(
      `/expense/allEntry?startDate=${startDate}&endDate=${endDate}`,
    ),
  create: (params: {
    expense_head_id: number;
    amount: number;
    paymentMode: string;
    reason: string;
    addExpense: boolean;
  }) => apiPost<{ message?: string }>("/expense/addExpense", params),
  update: (params: {
    id: number;
    expense_head_id: number;
    amount: number;
    paymentMode: string;
    reason: string;
    addExpense: boolean;
  }) => apiPut<{ message?: string }>("/expense/editExpense", params),
  remove: (id: number) => apiDelete<{ message?: string }>("/expense/deleteExpense", { id }),
};

export type RawDayWisePeriod = {
  period: string;
  totalAmount: number;
  gst: number;
  grandAmount: number;
  totalDiscount: number;
  card: number;
  cash: number;
  upi: number;
  due: number;
  totalOrders: number;
};

export type RawItemWiseRow = {
  item_name: string;
  variant_name: string;
  catagoriesName: string;
  totalQty: number;
  totalSale: number;
  gst: number;
};

export type RawCategoryWiseRow = {
  categoryName: string;
  totalQty: number;
  totalSale: number;
};

export type RawTaxBreakdown = {
  taxName: string;
  totalAmount: string;
  applicableOrders: number;
};

export type RawPosCollection = {
  totalBills: number;
  cashTotal: string;
  dueTotal: string;
  upiTotal: string;
  cardTotal: string;
  totalGst: string;
  totalDiscount: string;
  totalDynamicTax: number;
  taxBreakdown: RawTaxBreakdown[];
};

export type RawDiscountedOrder = {
  id: number;
  bill_no: string;
  grandAmount: string | number;
  totalDiscount: string | number;
  order_type: string;
  createdAt: string;
};

// controller/reports/*.js. Every one of these requires BOTH
// startDate/endDate (confirmed live - no "defaults to today" gap here),
// and dayWiseSales additionally requires period=daily|monthly|yearly. The
// Reports screen this feeds has never had a date-range picker of its own -
// it always showed all-time data computed client-side from whatever was
// in the local store - so this app always calls these with a fixed wide
// range rather than adding a range control, since this is a backend swap
// for the existing "show everything" behaviour, not a new feature.
//
// dayWiseSales's periodData array has an extra "Total" summary row
// unshifted onto the front (period: "Total") - filter that out before
// treating it as a per-day table.
//
// discountedOrders (controller/reports/orderRelated.js#DiscountedOrdersReport)
// paginates server-side at a hardcoded 10 rows/page (the route's `limit`
// query param, if any, is ignored - confirmed by reading getPaginatedData's
// call site) - getAllDiscountedOrders below walks every page rather than
// silently truncating to the first 10, capped at 50 pages (500 rows) as a
// sanity bound.
export const reportApi = {
  dayWiseSales: (startDate: string, endDate: string) =>
    apiGet<{ periodData: RawDayWisePeriod[] }>(
      `/report/order-aggregation?period=daily&startDate=${startDate}&endDate=${endDate}`,
    ),
  itemAndCategoryWiseSales: (startDate: string, endDate: string) =>
    apiGet<{ itemWise: RawItemWiseRow[]; categoryWise: RawCategoryWiseRow[] }>(
      `/report/itemTextReports?startDate=${startDate}&endDate=${endDate}`,
    ),
  posCollection: (startDate: string, endDate: string) =>
    apiGet<{ posCollections: RawPosCollection }>(
      `/report/posCollection?startDate=${startDate}&endDate=${endDate}`,
    ),
  discountedOrdersPage: (startDate: string, endDate: string, page: number) =>
    apiGet<{
      discountedOrders: { data: RawDiscountedOrder[]; totalPages: number };
    }>(`/report/discountedReports?startDate=${startDate}&endDate=${endDate}&page=${page}`),
  getAllDiscountedOrders: async (startDate: string, endDate: string) => {
    const first = await reportApi.discountedOrdersPage(startDate, endDate, 1);
    const all = [...first.discountedOrders.data];
    const totalPages = Math.min(first.discountedOrders.totalPages, 50);
    for (let page = 2; page <= totalPages; page++) {
      const next = await reportApi.discountedOrdersPage(startDate, endDate, page);
      all.push(...next.discountedOrders.data);
    }
    return all;
  },
};

export type RawPromoCode = {
  id: number;
  promo_code_name: string;
  promo_code: string;
  discount_type: "fix" | "pr";
  discount_value: number;
  status: boolean;
};

// controller/discountPromocode.js. getAllPromoCode/createPromoCode/
// updatePromoCode all filter status:true, with no counterpart query
// anywhere in the controller that ever looks at status:false - so there
// is no way to list, or therefore reactivate, a promo code once
// deactivated. Deactivating one through this app is a one-way action,
// not a reversible toggle, despite the Switch in PromoSection implying
// otherwise; once it succeeds, the code disappears from every future
// load and there is no id left in this app's state to reactivate it by.
// Also: the duplicate-code check in both createPromoCode and
// updatePromoCode queries PromoCode with no hotel_id filter at all
// (`findOne({ where: { promo_code, status: true } })`) - a code already
// in use by a completely different hotel blocks creating the same code
// here, a real cross-tenant bug on the backend, confirmed by reading the
// query, not something to work around client-side.
export const promoCodeApi = {
  getAll: () => apiGet<{ promoCodes: RawPromoCode[] }>("/promocodes/getAll"),
  create: (params: {
    promo_code_name: string;
    promo_code: string;
    discount_type: "fix" | "pr";
    discount_value: number;
  }) => apiPost<{ promoCodes: RawPromoCode[] }>("/promocodes/create", params),
  update: (params: {
    id: number;
    promo_code_name: string;
    promo_code: string;
    discount_type: "fix" | "pr";
    discount_value: number;
    status: boolean;
  }) => apiPut<{ promoCodes: RawPromoCode[] }>("/promocodes/update", params),
};
