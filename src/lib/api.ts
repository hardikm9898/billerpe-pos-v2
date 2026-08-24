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
  // The pickup path additionally requires cash/card/upi/due and rejects
  // with PAYMENT_MODE_NOT_SELECTED if none are set and the total is > 0 -
  // this app's flow collects payment in a separate later settle step, so
  // pickup bill generation isn't wired through this call; only dine-in is.
  adminOrder: (payload: {
    order_type: "dinin";
    order_id: number;
    table_id: number;
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
};
