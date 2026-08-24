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
