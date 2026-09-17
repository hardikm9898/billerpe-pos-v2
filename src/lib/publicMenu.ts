// The customer-facing QR menu (scanned at a table, no login) - ported from
// the old BillerPe (POS/uat-frontend's MobileViewMenu.js +
// DownloadQrCode.js). Talks straight to the cloud (API_BASE_URL), never
// the local exe: a customer's own phone has no reason to be on the
// restaurant's LAN, and this endpoint has always been public/unauthenticated
// (uat-backend-v2/routes/hotel.js: `router.get("/menuByCategory/:key",
// menuByCategory)`, no adminAuth) - confirmed unchanged from the old system,
// byte-for-byte identical controller logic still live in uat-backend-v2.
import CryptoJS from "crypto-js";
import { API_BASE_URL } from "./api";

// Where a printed QR code must point. NOT window.location.origin, which is
// where a staff member's browser happens to have the POS open - and since
// billerpe-local-exe now serves the POS off local disk, that is routinely
// http://localhost:4100 or http://billerpe-local-server.local:4100.
// Generating a QR from either produces a code that resolves to the
// CUSTOMER'S OWN phone (or to nothing), on a sticker on a table, found out
// only when a customer complains. The QR menu is the one surface that is
// genuinely public, so its address has to be configured, not inferred.
const CONFIGURED_QR_BASE = (import.meta.env["VITE_PUBLIC_QR_BASE_URL"] ?? "").replace(/\/$/, "");

// A hostname only this machine or this LAN can resolve. Used to decide
// whether falling back to the current origin is safe.
function isLocalOrigin(origin: string): boolean {
    return /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(origin)
        || /\.local(:\d+)?$/i.test(origin);
}

/**
 * The public origin to encode into a QR, or null when there isn't a safe
 * one. Null is deliberate and callers must handle it by refusing to render
 * a QR: a missing code a staff member can report is recoverable, a printed
 * dead one is not.
 */
export function qrBaseUrl(): string | null {
    if (CONFIGURED_QR_BASE) return CONFIGURED_QR_BASE;
    if (typeof window === "undefined") return null;
    const origin = window.location.origin;
    return isLocalOrigin(origin) ? null : origin;
}

// Must match the backend's DESECRET_KEY (uat-backend-v2/.env) exactly - the
// old frontend's own config.SECRET_KEY was "MySuperSecretKey123", confirmed
// still equal to the backend's current DESECRET_KEY value. This is not a
// real access-control secret (the hotel id it protects isn't sensitive) -
// it only exists so the QR's URL doesn't show a bare, guessable integer.
const SECRET_KEY = "MySuperSecretKey123";

// CryptoJS.AES.encrypt(msg, passphrase) with no explicit salt derives a
// fresh RANDOM salt every single call (real AES semantic-security
// behavior, embedded in the "Salted__..." ciphertext header) - so the
// exact same hotel id produced a different ciphertext on every render,
// confirmed live as the printed QR/URL changing on every page load, which
// makes it useless as something you'd actually print and stick on a
// table. A fixed salt makes this deterministic (same id -> byte-identical
// ciphertext, always) while staying fully decryptable by the backend's
// existing decryptId (uat-backend-v2/controller/menu.js) unchanged - it
// reads whatever salt is embedded in the ciphertext's own header, it was
// never told to expect a random one specifically. Verified live against
// the real backend: this fixed-salt ciphertext still resolves to the
// correct hotel and returns real menu data. The salt value itself is
// arbitrary (any 8 bytes) - not a secret, just needs to stay constant.
const QR_SALT = CryptoJS.enc.Hex.parse("42696c6c657250655177".padEnd(16, "0").slice(0, 16));

export function encryptHotelId(id: number): string {
  const ciphertext = CryptoJS.AES.encrypt(String(id), SECRET_KEY, { salt: QR_SALT }).toString();
  return encodeURIComponent(ciphertext);
}

// QR table ordering (uat-backend-v2/controller/qrOrder.js's own
// decryptQrTablePayload) - same AES/salt scheme as encryptHotelId above,
// but carrying {hotelId, tableId, qrVersion} instead of a bare id, so a
// per-table QR can be told apart from the restaurant-level menu-only QR
// and invalidated independently (bumping qr_version changes the
// ciphertext for just that table). SECRET_KEY isn't a real access-control
// secret (see that constant's own comment) - decrypting it client-side
// here is no different in kind from the backend doing it.
export type QrTablePayload = { hotelId: number; tableId: number; qrVersion: number };

export function encryptQrPayload(payload: QrTablePayload): string {
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), SECRET_KEY, {
    salt: QR_SALT,
  }).toString();
  return encodeURIComponent(ciphertext);
}

// Only ever called client-side against this page's own URL, never sent
// anywhere - the actual submit (submitQrOrder below) forwards the raw
// ciphertext unchanged so the backend re-validates it itself, this is
// purely so the page can tell a table QR apart from a menu-only QR and
// know which table/qrVersion it's ordering against.
export function decryptQrPayload(encrypted: string): QrTablePayload | null {
  try {
    const decoded = decodeURIComponent(encrypted);
    const bytes = CryptoJS.AES.decrypt(decoded, SECRET_KEY);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(json) as Partial<QrTablePayload> | null;
    if (
      !parsed ||
      typeof parsed.hotelId !== "number" ||
      typeof parsed.tableId !== "number" ||
      typeof parsed.qrVersion !== "number"
    ) {
      return null;
    }
    return parsed as QrTablePayload;
  } catch {
    return null;
  }
}

export type PublicMenuVariant = {
  id: number;
  variants_name: string;
  hms_menu_variant_mst?: { variant_price: number };
};

export type PublicMenuAddon = { id: number; addon_name: string; price: number };
export type PublicMenuAddonGroup = {
  id: number;
  department_name: string;
  hms_addon_msts?: PublicMenuAddon[];
};

export type PublicMenuItem = {
  id: number;
  item_name: string;
  price: string;
  description: string;
  foodImage: string | null;
  sub_categories: string;
  variantData?: PublicMenuVariant[];
  addonDepartmentData?: PublicMenuAddonGroup[];
};

export type PublicMenuCategory = {
  id: number;
  menu_categ_nm: string;
  hms_menu_msts: PublicMenuItem[];
};

export type PublicRestaurantDetails = {
  currency: string | null;
  restaurantName: string;
  img: string | null;
  address: string;
};

export type PublicMenuResult = {
  menu: PublicMenuCategory[];
  restaurantDetails: PublicRestaurantDetails;
};

// key is a sub_categories filter ("regular"/"non-veg"/...) or "all" - only
// "all" is actually wired on the page today, matching the old app's own
// commented-out veg/non-veg filter buttons (MobileViewMenu.js:250-268).
export async function fetchPublicMenu(
  encryptedHotelId: string,
  key = "all",
): Promise<PublicMenuResult> {
  const res = await fetch(
    `${API_BASE_URL}/menuByCategory/${key}?restaurantName=${encryptedHotelId}`,
  );
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    error?: boolean;
    results?: PublicMenuResult;
  } | null;
  if (!json || json.error || !json.results) {
    throw new Error("Restaurant not found");
  }
  return json.results;
}

// QR table ordering - customer-facing half. Talks straight to the cloud,
// same as fetchPublicMenu above and for the same reason (a customer's own
// phone has no exe session and no reason to be on the restaurant's LAN).
// Deliberately not routed through src/lib/api.ts's apiPost/EXE_ROUTES
// machinery - that's built around an authenticated staff session
// (credentials/401-redirect handling) that doesn't exist here at all.
// variantId/addonIds are the only fields the exe's accept step actually
// trusts (controller/qrOrder.js's priceQrCartItem re-derives price from
// live MenuVariants/Addons rows by these ids alone) - itemName/
// variantName/addonNames are display-only, carried through purely so the
// staff inbox (table-grid.tsx) can show a readable line without a second
// lookup; a tampered name there would just look wrong, never mis-price.
export type QrCartItem = {
  menuId: number;
  qty: number;
  itemName: string;
  comment?: string;
  variantId?: number;
  variantName?: string;
  addonIds?: number[];
  addonNames?: string[];
};

type QrEnvelope<T> = { error?: boolean; results?: T & { message?: string } };

async function postPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as QrEnvelope<T> | null;
  if (!json || json.error || !json.results) {
    throw new Error(json?.results?.message || "Something went wrong - please try again.");
  }
  return json.results;
}

// `qr` is the exact ciphertext from this page's own URL, forwarded
// unchanged - the backend (decryptQrTablePayload) re-derives hotelId/
// tableId/qrVersion from it itself and rejects a stale/rotated one there,
// rather than trusting whatever this page decrypted client-side.
export async function submitQrOrder(params: {
  qr: string;
  customer_name: string;
  customer_mobile: string;
  items: QrCartItem[];
}): Promise<{ id: number }> {
  return postPublic("/qrOrder", params);
}

export async function getQrOrderStatus(
  id: number,
): Promise<{ status: "pending" | "accepted" | "rejected" | "expired" }> {
  const res = await fetch(`${API_BASE_URL}/qrOrder/${id}/status`);
  const json = (await res.json().catch(() => null)) as QrEnvelope<{
    status: "pending" | "accepted" | "rejected" | "expired";
  }> | null;
  if (!json || json.error || !json.results) {
    throw new Error("Could not check your order's status.");
  }
  return json.results;
}

// Lets the page know when its ordering session has genuinely ended (the
// table's bill was settled, or the table was otherwise cleared) rather
// than after any single round - staff accepting round 1 must not make the
// page forget it can still take round 2 (uat-backend-v2's
// getTableSessionStatus). `qr` is the same raw, already-URL-encoded
// ciphertext used everywhere else on this page - it's appended to the
// query string as-is (it's already percent-encoded, matching how it
// arrived in window.location.search) rather than re-encoded.
export async function getTableSessionStatus(
  qr: string,
): Promise<{ table_status: "R" | "F" | "P" | "H" | "B" }> {
  const res = await fetch(`${API_BASE_URL}/qrOrder/tableStatus?qr=${qr}`);
  const json = (await res.json().catch(() => null)) as QrEnvelope<{
    table_status: "R" | "F" | "P" | "H" | "B";
  }> | null;
  if (!json || json.error || !json.results) {
    throw new Error("Could not check this table's status.");
  }
  return json.results;
}
