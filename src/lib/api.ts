// Minimal real-backend client, seeded here for the auth wiring work.
// Talks to uat-backend (POS/uat-backend) - the only backend this design
// currently has anything real to call. Session is a cookie the backend
// sets (httpOnly), so every call needs credentials: "include".
export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:4000";

// Milestone 1 Phase 8 (POS/system-understanding/MILESTONE-1-LOCAL-EXE-PLAN.md):
// billerpe-local-exe, the on-premise server. Only a subset of endpoints
// have a real EXE-side implementation as of Phases 1-7 - everything else
// keeps going to API_BASE_URL (the cloud) unchanged.
//
// Empty = same origin as the page (the build the exe serves). See
// checkLocalServerHealth for why this never changes at runtime.
export const EXE_BASE_URL: string = import.meta.env["VITE_EXE_BASE_URL"] ?? "http://localhost:4100";

// crypto.randomUUID() only exists in secure contexts (HTTPS, or the page's
// own localhost) - undefined (throws "not a function") on a plain-HTTP LAN
// address like http://192.168.1.12:8080, which this POS is routinely
// accessed at on a restaurant's own local network. Falls back to a manual
// RFC4122 v4 generator there instead of failing every login on that origin.
function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// This browser's own random per-profile id, sent as `device_id` on every
// restaurantLogin/pinLogin/registerDevice call - NOT to be confused with
// the exe's own device-identity.json id (surfaced via /health's
// `deviceId`, see getLocalServerIdentity above), which identifies the
// physical server PC instead. Shared here (rather than duplicated in
// login.tsx and the System page's re-authenticate action) since both now
// need to call registerDevice with the same value.
export function getBrowserDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "billerpe.deviceId";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

// The exe's own login (restaurantLogin/pinLogin) already returns this
// token in its response body, and middleware/adminAuth.js already accepts
// it as `Authorization: Bearer <token>` as a fallback when there's no
// cookie - both sides of this existed already, just never connected. The
// app relied ENTIRELY on the httpOnly cookie set by that same login call,
// which is a cross-origin cookie from the browser's point of view (the
// frontend and the exe are two different origins - different ports on
// the same host still count as different origins for cookie purposes in
// several real-world browser configurations, even when SameSite=Strict
// alone wouldn't explain it) - confirmed live as the actual cause of a
// repeated "logged out on every refresh" report: the exe's own endpoints
// all correctly authorize a valid session (tested directly, bypassing the
// browser), yet the browser's own copy of `billerpe.session` was getting
// wiped to authed:false right after a refresh, meaning a real 401 was
// happening in the browser specifically - the cookie just wasn't making
// it back. A bearer token sent as an ordinary header isn't subject to any
// of that cookie-specific policy at all, so this is the fix rather than a
// further guess at exactly which cookie rule was in play.
const AUTH_TOKEN_KEY = "billerpe.authToken";

export function setStoredAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore - falls back to cookie-only auth, same as before this existed
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

// Merged into every apiGet/apiPost/etc. call below - harmless to send
// even when there's no stored token (just omitted) or when the target is
// the cloud rather than the exe (the cloud's own adminAuth doesn't read
// this header at all, so it's simply ignored there, not a leak of
// anything sensitive to the wrong origin - this is a per-install exe-
// signed token, meaningless outside this one exe).
function authHeader(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function pingHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// Matched by (method, path) pair, not path alone - several EXE-ported reads
// share a path with a cloud-only write that hasn't been ported (e.g. GET
// /table is real on the EXE, POST /table - creating a table - is not; they
// must not both route to the EXE just because they share a prefix). Keep
// this list in sync with routes/index.js in billerpe-local-exe as further
// phases land - it is the actual source of truth for what's real there.
const EXE_ROUTES: { method: "GET" | "POST" | "PUT" | "DELETE"; test: (path: string) => boolean }[] =
  [
    { method: "POST", test: (p) => p === "/restaurantLogin" },
    { method: "POST", test: (p) => p === "/pinLogin" },
    // Bootstrap-only, no cloud equivalent exists at all - see
    // controller/deviceRegistration.js in billerpe-local-exe.
    { method: "POST", test: (p) => p === "/registerDevice" },
    { method: "GET", test: (p) => p === "/table" },
    { method: "POST", test: (p) => p === "/table" },
    { method: "GET", test: (p) => p === "/getTableCatagories" },
    { method: "POST", test: (p) => p === "/addTableCatagories" },
    { method: "POST", test: (p) => p === "/editTableCatagories" },
    { method: "POST", test: (p) => p === "/removeTableCatagories" },
    { method: "POST", test: (p) => p === "/editTable" },
    { method: "POST", test: (p) => p === "/removeTable" },
    { method: "POST", test: (p) => p === "/moveTable" },
    // Ported alongside moveTable - moves one KOT round rather than the
    // whole order, but the same class of order-mutating write.
    { method: "POST", test: (p) => p === "/moveKot" },
    { method: "GET", test: (p) => p === "/menu" },
    { method: "GET", test: (p) => p === "/menuShow/all" },
    // Full CRUD for menu categories and items, mirroring uat-backend-v2's
    // controller/menu.js exactly (see billerpe-local-exe/controller/menu.js's
    // own comments) - previously writes fell through to the cloud
    // unconditionally, which 401'd and force-logged-out every EXE-
    // authenticated session (confirmed live as the "adding a category
    // crashes the app" report). UNPORTED_CLOUD_WRITE_PATHS above no longer
    // needs these three - a 401 here now means a real EXE session expiry.
    { method: "POST", test: (p) => p === "/catagories" },
    { method: "POST", test: (p) => p === "/catagoriesEdit" },
    { method: "POST", test: (p) => p === "/catagoriesRemove" },
    { method: "POST", test: (p) => p === "/menu" },
    { method: "POST", test: (p) => p === "/menuEdit" },
    { method: "POST", test: (p) => p === "/menuRemove" },
    // Task 10 (Multi Menu backend support): full CRUD was mirrored onto the
    // EXE for menu catalogues, so all four route here rather than only the
    // read.
    { method: "GET", test: (p) => p === "/menuCatalog" },
    { method: "POST", test: (p) => p === "/menuCatalog" },
    { method: "POST", test: (p) => p === "/menuCatalogEdit" },
    { method: "POST", test: (p) => p === "/menuCatalogRemove" },
    // Payment Modes config backend build - full CRUD mirrored onto the
    // EXE the same way menu catalogues were.
    { method: "GET", test: (p) => p === "/paymentMode" },
    { method: "POST", test: (p) => p === "/paymentMode" },
    { method: "POST", test: (p) => p === "/paymentModeEdit" },
    { method: "POST", test: (p) => p === "/paymentModeRemove" },
    // Delivery/Packaging charge rules backend build - full CRUD mirrored
    // onto the EXE the same way.
    { method: "GET", test: (p) => p === "/billChargeRule" },
    { method: "POST", test: (p) => p === "/billChargeRule" },
    // Notification settings backend build.
    { method: "GET", test: (p) => p === "/notificationSetting" },
    { method: "POST", test: (p) => p === "/notificationSettingToggle" },
    // Rich Permissions role-defaults backend build.
    { method: "GET", test: (p) => p === "/rolePermissionDefault" },
    { method: "POST", test: (p) => p === "/rolePermissionDefault" },
    { method: "POST", test: (p) => p === "/rolePermissionDefaultSpecial" },
    { method: "GET", test: (p) => p.startsWith("/catagories/") },
    // loadMenuFromServer (mock/store.tsx) Promise.all's these three alongside
    // getCategories - same "one unported call poisons the whole load" lesson
    // as /pickupOrder above, found the same way (driving the browser).
    { method: "GET", test: (p) => p === "/menuShowWithVariants" },
    { method: "GET", test: (p) => p === "/variant" },
    { method: "POST", test: (p) => p === "/variant" },
    { method: "PUT", test: (p) => p === "/variant" },
    { method: "GET", test: (p) => p === "/addon" },
    { method: "POST", test: (p) => p === "/addon" },
    { method: "PUT", test: (p) => p === "/addon" },
    { method: "GET", test: (p) => p === "/role" },
    { method: "GET", test: (p) => p === "/getUserAccess" },
    { method: "POST", test: (p) => p === "/adminOrder" },
    { method: "GET", test: (p) => p.startsWith("/order/") },
    // Owner-visible bill-reprint counter (Task 5) - a real local write
    // against the exe's own Order row, not a cloud relay (see
    // billerpe-local-exe/controller/order.js's incrementBillPrintCount).
    { method: "POST", test: (p) => /^\/order\/\d+\/reprintCount$/.test(p) },
    // Load-bearing for the table grid: loadTablesFromServer (mock/store.tsx)
    // Promise.all's this alongside getTables/getCategories, so it failing
    // (still cloud-routed) took the whole table load down with it - found by
    // actually driving the browser, not by reading the route list.
    { method: "GET", test: (p) => p === "/pickupOrder" },
    { method: "POST", test: (p) => p === "/settleBills" },
    { method: "POST", test: (p) => p === "/saveAndSettle" },
    { method: "POST", test: (p) => p === "/kotOrder" },
    // Real local implementation (billerpe-local-exe/controller/holdOrder.js),
    // same create/update split as kotOrder - NOT a cloud relay, since hold
    // mutates the same local Order/OrderDetails/Table rows kotOrder and
    // adminOrder already own as this EXE's source of truth. Missing from
    // this list was a real bug: store.holdOrder posted straight to
    // POST /holdOrder with no EXE_ROUTES entry, so it fell through to a
    // direct browser->cloud call and 401'd - same class of bug as the
    // payment-mode-defaults one, confirmed live as "hold order logs the app
    // out."
    { method: "POST", test: (p) => p === "/holdOrder" },
    // Item-ready broadcast (billerpe-local-exe/controller/kot.js#markKotReady) -
    // the Kitchen Display's Ready transition used to be purely local state in
    // that one browser tab (setKotStatus, mock/store.tsx); this is the real
    // write + cross-device broadcast the Captain App's notifications need.
    { method: "POST", test: (p) => p === "/kotReady" },
    // Waitlist queue - real local implementation (billerpe-local-exe/
    // controller/queue.js), no cloud counterpart at all - see model/
    // queueEntry.js's own comment on why.
    { method: "POST", test: (p) => p === "/queue" },
    { method: "GET", test: (p) => p === "/queue" },
    { method: "PUT", test: (p) => /^\/queue\/\d+$/.test(p) },
    { method: "POST", test: (p) => /^\/queue\/\d+\/call$/.test(p) },
    { method: "POST", test: (p) => p === "/queue/clear" },
    // Order timeline - ported alongside kotOrder/adminOrder/settleBills/
    // editSettledOrder, which now each write a hms_timeline_mst row here
    // too (billerpe-local-exe/helpers/timeline.js). startsWith, not exact -
    // orderApi.getTimeline always calls this with "?id=..." appended (same
    // bug class as /stock/getAllRawMaterial above - caught this time before
    // shipping it, not after).
    { method: "GET", test: (p) => p.startsWith("/getTimelineByOrderId") },
    { method: "GET", test: (p) => p === "/localSyncStatus" },
    // Order History screen (orderHistoryApi.getAllHeaders) - see
    // controller/order.js#getOrdersByBillNo in billerpe-local-exe.
    { method: "GET", test: (p) => p.startsWith("/searchOrder/") },

    // Follow-up pass: read-only endpoints for screens that were falling
    // through to the real cloud on every login and 401ing there. Write
    // paths for these (create/edit forms) are NOT ported yet, except tax
    // rules (TaxType has no cloud sync endpoint at all to fall back to -
    // see cloudPull.js's own comment - so its writes are local-only by
    // necessity, not a shortcut).

    { method: "GET", test: (p) => p === "/offlineHotelUser" },
    { method: "POST", test: (p) => p === "/user" },
    { method: "POST", test: (p) => p === "/userUpdate" },
    { method: "GET", test: (p) => p === "/singleHotel" },
    { method: "POST", test: (p) => p === "/updateInvoiceFormate" },
    { method: "POST", test: (p) => p === "/updateRestaurantSetting" },
    { method: "POST", test: (p) => p === "/service_charge" },

    // Exact-match would miss this - customerApi.getAll() always calls
    // "/customer/getAll?limit=500" (query string included in the path
    // passed to apiGet), confirmed live as a real bug: this fell through
    // to the cloud on every call until switched to startsWith.

    { method: "GET", test: (p) => p.startsWith("/customer/getAll") },
    { method: "POST", test: (p) => p === "/customer/create" },
    { method: "PUT", test: (p) => p === "/customer/update" },
    { method: "GET", test: (p) => p.startsWith("/customer/lastOrder") },
    { method: "GET", test: (p) => p === "/offlinePrinterSetting" },
    { method: "POST", test: (p) => p === "/setPrinter" },
    { method: "POST", test: (p) => p === "/EditPrinter" },
    { method: "POST", test: (p) => p === "/deletePrinter" },
    { method: "POST", test: (p) => p === "/setCategoriesForPrinter" },
    { method: "GET", test: (p) => p === "/taxType/tax" },
    { method: "POST", test: (p) => p === "/taxType/tax" },
    { method: "PUT", test: (p) => p === "/taxType/tax" },
    { method: "GET", test: (p) => p === "/stock/getAllUnit" },
    { method: "POST", test: (p) => p === "/stock/addUnit" },
    { method: "PUT", test: (p) => p === "/stock/editUnit" },
    // startsWith, not exact - rawMaterialApi.getAll(search) appends
    // "?search=..." when a search term is typed, and an exact match would
    // miss that suffix and silently fall through to the cloud, same bug
    // class as the /customer/getAll fix above (confirmed by reading the
    // call site, same shape as that one - not yet reproduced live).
    { method: "GET", test: (p) => p.startsWith("/stock/getAllRawMaterial") },
    { method: "POST", test: (p) => p === "/stock/addRowMaterial" },
    { method: "PUT", test: (p) => p === "/stock/editRowMaterial" },
    { method: "GET", test: (p) => p === "/stock/stockInHand" },
    { method: "POST", test: (p) => p === "/stock/stockIn" },
    { method: "POST", test: (p) => p === "/stock/stockOut" },
    { method: "GET", test: (p) => p === "/stock/stockHistory" },
    { method: "PUT", test: (p) => p === "/stock/stockHistory" },
    { method: "DELETE", test: (p) => p === "/stock/stockHistory" },
    { method: "POST", test: (p) => p === "/stock/manualStock" },
    { method: "POST", test: (p) => p === "/stock/manualAveragePrice" },
    { method: "GET", test: (p) => p.startsWith("/report/order-aggregation") },
    { method: "GET", test: (p) => p.startsWith("/report/posCollection") },
    { method: "GET", test: (p) => p.startsWith("/report/itemTextReports") },
    { method: "GET", test: (p) => p.startsWith("/report/discountedReports") },
    { method: "GET", test: (p) => p.startsWith("/report/kotReport") },
    { method: "GET", test: (p) => p.startsWith("/report/tableAndStaffWise") },
    { method: "POST", test: (p) => p === "/getDueOrders" },
    { method: "POST", test: (p) => p === "/settleDue" },
    { method: "POST", test: (p) => p === "/allSettleDue" },
    { method: "POST", test: (p) => p === "/editSettledOrder" },
    { method: "GET", test: (p) => p === "/refundDue" },
    { method: "POST", test: (p) => p === "/refundDue" },
    { method: "POST", test: (p) => p === "/orderRemove" },

    // KDS - kitchen list/config. The /kds socket namespace itself isn't
    // path-routed here (kdsSocket.ts connects directly to EXE_BASE_URL,
    // not through apiGet/apiPost) - see its own comment.
    // Closing gaps in bill numbers is a local operation now that the exe
    // owns numbering. It was NOT listed here, so the call went to the cloud,
    // where a browser holding only an exe session has no cookie - the 401
    // then signed the user out, which is exactly what pressing "Renumber the
    // order number sequence" did.
    { method: "GET", test: (p) => p === "/makeSequenceBillNo" },
    { method: "GET", test: (p) => p === "/kitchen/kitchens" },
    { method: "POST", test: (p) => p === "/kitchen/kitchens" },
    { method: "POST", test: (p) => p === "/kitchen/setCategoryForKitchen" },
    { method: "DELETE", test: (p) => p.startsWith("/kitchen/deleteKitchen/") },

    // Phase F (architecture memo): recipes + semi-finished, closing one of
    // the 11 remaining direct-cloud paths - see
    // billerpe-local-exe/controller/{recipes,semiFinishedItems}.js.
    { method: "POST", test: (p) => p === "/recipes/addRecipe" },
    { method: "PUT", test: (p) => p === "/recipes/editRecipe" },
    { method: "DELETE", test: (p) => p === "/recipes/deleteRecipe" },
    { method: "GET", test: (p) => p === "/recipes/getAllRecipes" },
    { method: "GET", test: (p) => p === "/recipes/getAllRecipesForMenu" },
    { method: "GET", test: (p) => p.startsWith("/recipes/getSingleRecipes") },
    { method: "GET", test: (p) => p === "/semiFinished/all" },
    { method: "GET", test: (p) => p.startsWith("/semiFinished/single") },
    { method: "GET", test: (p) => p === "/semiFinished/names" },
    { method: "GET", test: (p) => p === "/semiFinished/stockLevels" },
    { method: "POST", test: (p) => p === "/semiFinished/add" },
    { method: "PUT", test: (p) => p === "/semiFinished/edit" },
    { method: "DELETE", test: (p) => p.startsWith("/semiFinished/delete") },
    { method: "POST", test: (p) => p === "/semiFinished/production" },

    // Phase F: expense + cash session.
    { method: "POST", test: (p) => p === "/expense/addExpenseHead" },
    { method: "GET", test: (p) => p === "/expense/getAllExpenseHead" },
    { method: "PUT", test: (p) => p === "/expense/editExpenseHead" },
    { method: "DELETE", test: (p) => p === "/expense/deleteExpenseHead" },
    { method: "POST", test: (p) => p === "/expense/addExpense" },
    { method: "GET", test: (p) => p.startsWith("/expense/allEntry") },
    { method: "PUT", test: (p) => p === "/expense/editExpense" },
    { method: "DELETE", test: (p) => p === "/expense/deleteExpense" },
    { method: "GET", test: (p) => p === "/cashSession" },
    { method: "POST", test: (p) => p === "/cashSession/open" },
    { method: "POST", test: (p) => p === "/cashSession/movement" },
    { method: "POST", test: (p) => p === "/cashSession/close" },

    // Phase F: promo codes + e-bill credit balance (read-only, cached
    // locally - see billerpe-local-exe/controller/ebillCredit.js).
    { method: "POST", test: (p) => p === "/promocodes/create" },
    { method: "PUT", test: (p) => p === "/promocodes/update" },
    { method: "GET", test: (p) => p === "/promocodes/getAll" },
    { method: "GET", test: (p) => p === "/getEbillCredit" },

    // Cloud relay (billerpe-local-exe/services/cloudRelay.js) - real
    // business logic (WhatsApp e-bill send, the reservation auto-open
    // scheduler, the shared stock-image catalogue) deliberately stays
    // cloud-side, not reimplemented here, but the browser only ever holds
    // a session for the EXE's own origin - a direct browser->cloud call
    // always 401'd regardless of session validity (confirmed live on the
    // Reservations screen). These now route to the EXE, which relays them
    // server-to-server using its own stored cloud session instead.
    { method: "POST", test: (p) => p === "/sentEbill" },
    { method: "GET", test: (p) => p === "/getBookingData" },
    { method: "POST", test: (p) => p === "/tableBooking" },
    { method: "POST", test: (p) => p.startsWith("/updatedBooking/") },
    { method: "POST", test: (p) => p === "/deleteBooking" },
    { method: "GET", test: (p) => p.startsWith("/getProductImages") },

    // Default payment mode - same relay reasoning as sentEbill above (real,
    // hotel-scoped cloud table, no local mirror). Missing from this list
    // was a real bug: a direct browser->cloud call 401s regardless of
    // session validity (no cookie for the cloud's own origin ever exists
    // under an exe-authenticated session), and that 401 is treated as fatal
    // everywhere except the isKnownOutOfScope exclusions below - so this
    // was forcing a full logout back to /login on every app boot, right
    // after a perfectly good exe login, the moment AppShell's own
    // loadPaymentModeDefaultsFromServer effect fired.
    { method: "GET", test: (p) => p === "/paymentModeDefault" },
    { method: "POST", test: (p) => p === "/paymentModeDefault" },
    { method: "POST", test: (p) => p === "/paymentModeDefaultRemove" },

    // Invoice header/footer lines + hotel logo upload - same relay
    // reasoning as payment-mode-defaults above (real cloud-side tables,
    // no local mirror, never on the offline order-taking path).
    { method: "GET", test: (p) => p === "/headerFooter" },
    { method: "POST", test: (p) => p === "/invoiceSetting" },
    { method: "GET", test: (p) => p === "/kotHeaderFooter" },
    { method: "POST", test: (p) => p === "/kotFormatSetting" },
    { method: "POST", test: (p) => p === "/hotelLogo" },

    // QR table ordering, staff-facing half (billerpe-local-exe/controller/
    // qrOrder.js). Pending-orders inbox and accept/reject are real local
    // reads/writes against the exe's own mirror, not a relay - only
    // "regenerate this table's QR" (qr_version is cloud-authoritative) goes
    // through the exe's cloudRelay pattern instead.
    { method: "GET", test: (p) => p === "/qrOrder/pending" },
    { method: "POST", test: (p) => p.startsWith("/qrOrder/") && p.endsWith("/accept") },
    { method: "POST", test: (p) => p.startsWith("/qrOrder/") && p.endsWith("/reject") },
    { method: "POST", test: (p) => p.startsWith("/table/") && p.endsWith("/qr-version") },

    // Phase F: stock/purchasing - the largest remaining piece, closing the
    // last of the 11 originally-flagged direct-cloud paths.
    { method: "GET", test: (p) => p === "/stock/supplier" },
    { method: "POST", test: (p) => p === "/stock/supplier" },
    { method: "PUT", test: (p) => p === "/stock/supplier" },
    { method: "GET", test: (p) => p === "/stock/maxPo" },
    { method: "POST", test: (p) => p === "/stock/payment" },
    { method: "POST", test: (p) => p === "/stock/purchaseOrder" },
    { method: "GET", test: (p) => p.startsWith("/stock/purchaseOrder") },
    { method: "PUT", test: (p) => p === "/stock/purchaseOrder" },
    { method: "DELETE", test: (p) => p === "/stock/purchaseOrder" },
    { method: "POST", test: (p) => p === "/stock/wastage" },
    { method: "GET", test: (p) => p.startsWith("/stock/wastage") },
    { method: "DELETE", test: (p) => p.startsWith("/stock/wastage/") },
    { method: "GET", test: (p) => p === "/stock/requisition" },
    { method: "POST", test: (p) => p === "/stock/requisition" },
    { method: "POST", test: (p) => p === "/stock/requisitionStatus" },
    { method: "POST", test: (p) => p === "/stock/requisitionItemQty" },
    { method: "POST", test: (p) => p === "/stock/requisitionRemove" },
    { method: "POST", test: (p) => p === "/stock/requisitionFulfil" },

    // Printing: real local printer enumeration + PDF generation (same
    // format as the old system) + direct silent printing from the EXE.
    { method: "GET", test: (p) => p === "/localPrinters" },
    { method: "GET", test: (p) => p === "/localServerStatus" },
    { method: "POST", test: (p) => p === "/localServerForceSync" },
    { method: "GET", test: (p) => p.startsWith("/auditLog") },
    { method: "POST", test: (p) => p === "/auditLog" },
    { method: "POST", test: (p) => p === "/generateKotPdf" },
    { method: "POST", test: (p) => p === "/generateInvoicePdf" },
    { method: "POST", test: (p) => p === "/printKotDirect" },
    { method: "POST", test: (p) => p === "/printInvoiceDirect" },
    { method: "POST", test: (p) => p === "/testPrintDirect" },
    { method: "POST", test: (p) => p === "/userPermissionOverrides" },
  ];

function resolveBaseUrl(method: "GET" | "POST" | "PUT" | "DELETE", path: string): string {
  const isExeRoute = EXE_ROUTES.some((route) => route.method === method && route.test(path));
  return isExeRoute ? EXE_BASE_URL : API_BASE_URL;
}

// Where this page's exe is - one rule, no discovery:
//  - built into the exe (empty base URL): the page's own address, on the
//    server PC and on every other device that opened the server's address;
//  - the public website: this PC's own localhost, the only plain-http address
//    an https page is allowed to reach.
// Discovery by the shared network name billerpe-local-server.local was
// removed: with two exes on one network (an office, a test PC next to a live
// till) it reached the WRONG restaurant's server - confirmed live, a login
// token was sent to another exe, refused, and the user signed out.
export async function checkLocalServerHealth(timeoutMs = 3000): Promise<boolean> {
  return pingHealth(EXE_BASE_URL, timeoutMs);
}

// login.tsx's boot-time reconciliation for a real production failure mode:
// this browser's cached `billerpe.session.device === true` survives a
// reinstall of the exe that wiped its local DB (data/ sits next to the .exe
// on disk - see billerpe-local-exe/utils/appPaths.js's own comment), so the
// cached flag no longer reflects reality. /health now carries
// {registered, deviceId} precisely so this can be checked without needing
// a session a wiped DB can never grant (the one endpoint that already
// computed this shape, /localServerStatus, is adminAuth-gated - useless
// here). Reuses checkLocalServerHealth's own discovery (last-known-good ->
// mDNS -> default) rather than duplicating it - that call already leaves
// EXE_BASE_URL pointed at whichever address actually answered. Returns
// null (not false) when unreachable, distinct from "reachable and not
// registered" - callers must not treat "can't tell" as "definitely not
// registered".
export async function getLocalServerIdentity(): Promise<{
  registered: boolean;
  deviceId: string;
  hotelName?: string;
  lanUrls: string[];
} | null> {
  try {
    // One request, with a timeout long enough for a busy PC. (It used to
    // ping /health and then fetch it again with no timeout at all.)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${EXE_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      registered?: unknown;
      deviceId?: unknown;
      hotelName?: unknown;
      lanUrls?: unknown;
    };
    return {
      registered: body.registered === true,
      deviceId: String(body.deviceId ?? ""),
      lanUrls: Array.isArray(body.lanUrls) ? body.lanUrls.map(String) : [],
      ...(typeof body.hotelName === "string" ? { hotelName: body.hotelName } : {}),
    };
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  // Set when the local exe's controller/auth.js finds no Hotel row at all
  // in its local DB (requireRegisteredDevice) - a real "wrong password" and
  // a real "this device's local data was wiped" produce byte-identical
  // MESSAGE.NOT_AUTHORIZE text otherwise, so login.tsx needs this explicit
  // flag to tell them apart and reset back to the registration screen
  // instead of showing a login-failure toast.
  needsRegistration?: boolean;
  /** The envelope's own `code` (e.g. 409 for a device-registration
   * conflict) and its full `results` payload, for callers that need more
   * than the message - the HTTP status is unreliable (see unwrap). */
  code?: number;
  details?: unknown;
  constructor(message: string, needsRegistration?: boolean, code?: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.needsRegistration = needsRegistration;
    this.code = code;
    this.details = details;
  }
}

// uat-backend's error()/success() helpers (responce/res.js) shape every
// response as { error: boolean, results: {...}, code }. Most business-logic
// error paths never call res.status(...) before res.json(...), so the HTTP
// status is commonly 200 even on failure - `error`/`results` are the only
// reliable signal there, not res.ok. adminAuth (middleware/adminAuth.js) is
// the one path that's actually reliable: every branch (no token, bad token,
// expired/logged-out-elsewhere session, deactivated user) real-401s via
// res.status(...), so that's what session-expiry detection below keys off.
// `code` is the backend's own status field (responce/res.js sets it on
// every response) - the real signal, since most error paths never call
// res.status() and answer HTTP 200 regardless. See ApiError.code.
type ApiEnvelope<T> = { error: boolean; results: T; code?: number };

// Architecture memo, Phase F: this list held 11 direct-cloud paths at the
// start of that pass (stock, recipes, semiFinished, expense, cashSession,
// promocodes, getEbillCredit) - all now ported to the EXE and removed here.
// sentEbill is the one deliberate, permanent exception (see its own
// comment below), not a leftover. Matched by prefix since a path can carry
// a query string or id/sub-action suffix.
// sentEbill, reservations (getBookingData/tableBooking/updatedBooking/
// deleteBooking) and getProductImages used to live here as "call the cloud
// directly, but don't force-logout on the inevitable 401" - the browser
// never has a cookie for the cloud's own origin (it only ever logs into
// the EXE), so those always real-401'd regardless of session validity.
// All of them are now relayed through the EXE instead (billerpe-local-exe/
// services/cloudRelay.js - real business logic stays cloud-side, only the
// browser<->cloud auth gap moved server-to-server), so a 401 on these
// paths now means a genuinely dead LOCAL session, same as everywhere else -
// no exclusion list needed here anymore. Kept as an empty, extensible list
// rather than deleted outright in case a future endpoint needs the same
// "deliberately unauthenticatable from the browser" treatment.
const KNOWN_OUT_OF_SCOPE_PATHS: string[] = [];

function isKnownOutOfScope(path: string): boolean {
  return KNOWN_OUT_OF_SCOPE_PATHS.some((p) => path.startsWith(p));
}

// A session that's expired, been logged out from another device, or been
// deactivated server-side previously surfaced as just another failed
// request - a "Could not load X" toast per in-flight call, nothing ever
// sending the user back to /login. Every wrapper below checks for the
// adminAuth 401 first and, if seen, clears the local session and hard-
// navigates to /login - a full reload so loadInitialState() (store.tsx)
// re-resolves cleanly with no session, rather than trying to unwind
// whatever React/store state was mid-flight. Returns a Promise that never
// settles so the caller's own .catch()/toast never fires on top of the
// redirect (the page is about to unload anyway).
//
// A 401 from EITHER backend (exe or cloud) is now treated as fatal and
// logs the user out, EXCEPT for the confirmed-out-of-scope paths above -
// those are excluded deliberately, not as a loophole: they 401 against
// the cloud on every single login regardless of session validity (no
// local model exists to serve them from instead), so treating them as
// fatal would bounce every login straight back to /login immediately -
// confirmed live as a real, unusable-app-level regression before this
// exclusion was added.
function handleUnauthorized<T>(path: string): Promise<T> | null {
  if (isKnownOutOfScope(path)) return null;
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    // A dead staff session doesn't mean the device itself is unregistered -
    // the exe already has this hotel's real data regardless - so this keeps
    // `device` from whatever was already saved rather than wiping the
    // whole entry, which previously forced a full re-registration on every
    // ordinary session expiry (confirmed live as the "asks to register
    // device again" bug, not the session-eviction one).
    try {
      const saved = window.localStorage.getItem("billerpe.session");
      const parsed = saved ? (JSON.parse(saved) as { device?: boolean }) : {};
      window.localStorage.setItem(
        "billerpe.session",
        JSON.stringify({ device: parsed.device ?? false, authed: false }),
      );
    } catch {
      window.localStorage.removeItem("billerpe.session");
    }
    setStoredAuthToken(null);
    window.location.href = "/login";
  }
  return new Promise<T>(() => {});
}

// handleUnauthorized returns null for exactly one reason: isKnownOutOfScope
// matched. Reaching this line always means that - a real 401 the app can't
// do anything about (no cookie for the cloud origin will ever exist under
// an EXE-authenticated session, by design). Without this, the raw backend
// message ("Not Authorize User" - identical to a genuinely wrong password,
// see controller/auth.js's own comment on that ambiguity) surfaced
// verbatim via unwrap() below, confirmed live as confusing on the
// Reservations screen once the forced-logout was suppressed - staff read
// it as "you're not allowed," not "this needs the internet."
function outOfScopeUnauthorized(): ApiError {
  return new ApiError(
    "This needs a connection to BillerPe cloud, which isn't available on this local-only session.",
  );
}

// Both backends' catch-all error handler returns this exact literal on
// every unhandled exception, in essentially every controller (constant/
// const.js's MESSAGE.INTERNAL_SERVER_ERROR, identical on uat-backend-v2
// and billerpe-local-exe) - shown to restaurant staff verbatim via toast,
// it reads as a confusing technical error rather than something actionable.
// This is the one shared chokepoint every API error passes through
// (~150 call sites), so fixing it here covers both backends at once
// without touching every individual catch block or toast call site.
// Deliberately narrow: specific business messages ("Category is in use",
// "Variant Name Already Available", etc.) are already clear and stay
// untouched - only the generic catch-all fallbacks get reworded.
const GENERIC_BACKEND_MESSAGES = new Set(["Internal Server Error", "Request failed"]);
const FRIENDLY_GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

function unwrap<T>(json: ApiEnvelope<T> | null): T {
  if (!json || json.error) {
    const results =
      json?.results && typeof json.results === "object"
        ? (json.results as { message?: unknown; needsRegistration?: unknown })
        : undefined;
    const message = results && "message" in results ? String(results.message) : "Request failed";
    const needsRegistration = results?.needsRegistration === true;
    throw new ApiError(
      GENERIC_BACKEND_MESSAGES.has(message) ? FRIENDLY_GENERIC_MESSAGE : message,
      needsRegistration,
      typeof json?.code === "number" ? json.code : undefined,
      json?.results,
    );
  }
  return json.results;
}

// Every real request in this app funnels through apiGet/apiPost/apiPut/
// apiDelete below, so tracking in-flight count here (rather than in each
// of the ~150 call sites) gives a single, always-accurate signal for a
// global "something is loading" indicator - see GlobalLoadingBar, the only
// consumer. Plain module state + a listener set, not React state, since
// this file has no component of its own; components read it via
// useSyncExternalStore (subscribePendingRequests/getPendingRequestCount).
let pendingRequestCount = 0;
const pendingRequestListeners = new Set<() => void>();

export function subscribePendingRequests(listener: () => void): () => void {
  pendingRequestListeners.add(listener);
  return () => pendingRequestListeners.delete(listener);
}

export function getPendingRequestCount(): number {
  return pendingRequestCount;
}

async function trackPending<T>(run: () => Promise<T>): Promise<T> {
  pendingRequestCount++;
  pendingRequestListeners.forEach((l) => l());
  try {
    return await run();
  } finally {
    pendingRequestCount--;
    pendingRequestListeners.forEach((l) => l());
  }
}

// ---------------------------------------------------------------------------
// Exe availability and registration, shared by the whole app.
//
// The exe is the only authority for "is this PC registered" - never this
// browser's storage - so every device and every page load asks it. When it
// can't be reached, the app shows ONE blocking screen (ServerGate) instead of
// a "could not load X" toast per request, and nothing half-loaded or stale
// is left on screen as if it were real.
// ---------------------------------------------------------------------------
export type ServerState =
  | { status: "checking" }
  | { status: "unreachable" }
  | { status: "reachable"; registered: boolean; hotelName: string | null; lanUrls: string[] };

let serverState: ServerState = { status: "checking" };
const serverStateListeners = new Set<() => void>();

// When the current outage began. ServerGate reloads the page afterwards
// only after a very long one: reads caught in an outage retry by themselves
// once the server is back (guardedFetch), so nothing is left half-loaded and
// the cart on screen survives.
let outageStartedAt: number | null = null;
const LONG_OUTAGE_MS = 5 * 60_000;

function setServerState(next: ServerState) {
  if (next.status === "unreachable" && serverState.status !== "unreachable") {
    outageStartedAt = Date.now();
  }
  serverState = next;
  serverStateListeners.forEach((l) => l());
}

/** After the server is back: should the page start clean? Resets the record. */
export function consumeOutageNeedsReload(): boolean {
  const long = outageStartedAt !== null && Date.now() - outageStartedAt > LONG_OUTAGE_MS;
  outageStartedAt = null;
  return long;
}

// Resolves once the server answers again.
function whenServerReachable(): Promise<void> {
  if (serverState.status === "reachable") return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = subscribeServerState(() => {
      if (serverState.status === "reachable") {
        unsubscribe();
        resolve();
      }
    });
  });
}

export function getServerState(): ServerState {
  return serverState;
}

export function subscribeServerState(listener: () => void): () => void {
  serverStateListeners.add(listener);
  return () => serverStateListeners.delete(listener);
}

let refreshInFlight: Promise<ServerState> | null = null;

export function refreshServerState(): Promise<ServerState> {
  refreshInFlight ??= refreshServerStateNow().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshServerStateNow(): Promise<ServerState> {
  let identity = await getLocalServerIdentity();
  // One missed answer (a Wi-Fi blip, the PC busy for a moment) is not an
  // outage: ask twice more before the whole screen is blocked. Once it is
  // blocked, a single answer is enough to lift it.
  if (!identity && serverState.status !== "unreachable") {
    for (const wait of [1500, 3000]) {
      await new Promise((r) => setTimeout(r, wait));
      identity = await getLocalServerIdentity();
      if (identity) break;
    }
  }
  setServerState(
    identity
      ? {
          status: "reachable",
          registered: identity.registered,
          hotelName: identity.hotelName ?? null,
          lanUrls: identity.lanUrls,
        }
      : { status: "unreachable" },
  );
  return serverState;
}

export function markServerUnreachable() {
  if (serverState.status !== "unreachable") setServerState({ status: "unreachable" });
}

// A request to the exe that fails at the network level means the exe is
// down: flag it (ServerGate takes over the screen) and never settle, so the
// caller's own catch/toast doesn't fire on top. Cloud calls (public customer
// pages only) still reject normally.
async function guardedFetch(base: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (base === API_BASE_URL) throw err;
    // A failed request alone doesn't mean the server is down - confirm first.
    const state = await refreshServerState();
    if (state.status === "reachable") {
      const method = (init.method ?? "GET").toUpperCase();
      if (method === "GET") {
        try {
          return await fetch(url, init);
        } catch {
          // fall through to the message below
        }
      }
      // A write is never re-sent blindly: it may have reached the server.
      throw new ApiError(
        "The connection to the BillerPe server was interrupted. Check and try again.",
      );
    }
    // A real outage: ServerGate is showing the blocking screen. A read waits
    // and runs again once the server is back; a write is not re-sent (it
    // may or may not have arrived) and fails with a clear message instead
    // of hanging forever.
    const method = (init.method ?? "GET").toUpperCase();
    for (;;) {
      await whenServerReachable();
      if (method !== "GET") {
        throw new ApiError(
          "The BillerPe server was unreachable, so this was not confirmed. Check and try again.",
        );
      }
      try {
        return await fetch(url, init);
      } catch {
        await refreshServerState();
      }
    }
  }
}

// The exe refuses reads a role isn't allowed (billerpe-local-exe/constant/
// routePermissions.js). The screens only load what the user can see, so this
// is a backstop: stay quiet rather than toast "no permission" at someone who
// never asked for that data.
function forbiddenRead<T>(path: string): Promise<T> {
  console.warn(`[api] ${path} is not permitted for this user - skipped`);
  return new Promise<T>(() => {});
}

async function apiGet<T>(path: string): Promise<T> {
  return trackPending(async () => {
    const base = resolveBaseUrl("GET", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { ...authHeader() },
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
      throw outOfScopeUnauthorized();
    }
    if (res.status === 403) return forbiddenRead<T>(path);
    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    return unwrap(json);
  });
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return trackPending(async () => {
    const base = resolveBaseUrl("POST", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
      throw outOfScopeUnauthorized();
    }

    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    return unwrap(json);
  });
}

// Same as apiPost, for the one call site (hotelApi.uploadLogo) that needs
// to send a real file. No "Content-Type" header set here deliberately -
// the browser fills in multipart/form-data with the correct boundary
// itself only when left to set the header, doing it manually breaks the
// boundary parsing on the receiving end.
async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  return trackPending(async () => {
    const base = resolveBaseUrl("POST", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { ...authHeader() },
      body: form,
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
      throw outOfScopeUnauthorized();
    }

    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    return unwrap(json);
  });
}

// billerpe-local-exe's dashboard controller (controller/dashboard.js -
// getStatus/forceSync) predates and doesn't use this codebase's
// success()/error() envelope convention - it returns plain JSON directly,
// matching what public/dashboard.html's own inline script already expects.
// Reused as-is under a different auth gate (see routes/index.js) rather
// than reshaping it, so apiGet/apiPost's hard-coded envelope unwrap can't
// be reused here - this is the one place in this file calling a
// non-enveloped endpoint.
async function apiGetRaw<T>(path: string): Promise<T | null> {
  return trackPending(async () => {
    const base = resolveBaseUrl("GET", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { ...authHeader() },
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
    }
    return (await res.json().catch(() => null)) as T | null;
  });
}

async function apiPostRaw<T>(path: string, body: unknown): Promise<T | null> {
  return trackPending(async () => {
    const base = resolveBaseUrl("POST", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
    }
    return (await res.json().catch(() => null)) as T | null;
  });
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return trackPending(async () => {
    const base = resolveBaseUrl("PUT", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
      throw outOfScopeUnauthorized();
    }

    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    return unwrap(json);
  });
}

async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return trackPending(async () => {
    const base = resolveBaseUrl("DELETE", path);
    const res = await guardedFetch(base, `${base}${path}`, {
      method: "DELETE",
      credentials: "include",
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify(body),
          }
        : { headers: { ...authHeader() } }),
    });
    if (res.status === 401) {
      const redirect = handleUnauthorized<T>(path);
      if (redirect) return redirect;
      throw outOfScopeUnauthorized();
    }
    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    return unwrap(json);
  });
}

export type RawBillViewItem = {
  item_name: string;
  variantData?: { variants_name?: string } | null;
  addons?: unknown;
  price: number;
  qty: number;
  sub_categories?: string;
  totalAmount: number;
};

export type RawBillViewTax = {
  hms_tax_type_mst?: { tax_name?: string; percentage?: number };
  amount?: number;
};

export type RawBillViewData = {
  customerName?: string;
  customerNumber?: string;
  gstin?: string;
  address?: string;
  // Each entry is a pre-built raw HTML fragment (`<p style="...">…</p>`,
  // `<img .../>`) - controller/kto.js#getHearderAndFooterDataBillView
  // assembles these server-side from the hotel's own Invoice Format
  // settings, not from anything a customer submits.
  footerText?: string[];
  headerText?: string[];
  dateAndTime: string;
  orderId: string;
  restaurantName: string;
  bottomText?: string;
  restaurantNumber?: string;
  restaurantAddress?: string;
  items: RawBillViewItem[];
  tableAndUserInfo?: string;
  type: string;
  subtotal: number;
  gst: number;
  totalBill: string;
  token: number;
  service_charge: number;
  delivery_charge?: number;
  packaging_charge?: number;
  tip?: number;
  totalQty: number;
  totalDiscount: number;
  orderTax: RawBillViewTax[];
  currency?: string;
};

// controller/kto.js#getBillViewData (POST /getBillDetails) - the one
// endpoint a customer's own browser ever calls directly, with no session
// of any kind. Deliberately public (no adminAuth in routes/hotel.js) and
// deliberately NOT in EXE_ROUTES: resolveBaseUrl already sends anything
// not listed there straight to API_BASE_URL (the cloud), which is exactly
// right here - a customer's phone has no network path to the restaurant's
// own local exe at all, only to whatever public URL SOCKET_URL points the
// e-bill link at (see controller/kto.js#sentEbill). `bill_no`/`id` here
// are the hashed values the link itself carries (generateHashId/
// decodeHashId on the backend) - passed straight through, never decoded
// client-side.
export const billViewApi = {
  getDetails: (billNoHash: string, hotelIdHash: string) =>
    apiPost<{ data: RawBillViewData }>("/getBillDetails", {
      bill_no: billNoHash,
      id: hotelIdHash,
    }),
};

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
  // EXE-only bootstrap: logs into the real cloud with the outlet owner's
  // real credentials, resolves which hotel this device belongs to, and
  // pulls that hotel's real data down for the first time - see
  // controller/deviceRegistration.js. Not a login itself; a registered
  // device still needs a normal restaurantLogin/pinLogin afterward. The exe
  // wipes its local data and downloads the restaurant fresh; a restaurant
  // already registered on another PC is refused with a contact-support
  // message (moving PCs is a support action).
  registerDevice: (mobile: string, password: string, deviceId: string) =>
    apiPost<{
      message?: string;
      hotelId?: number;
      pulled?: Record<string, number | string>;
      // Phase B: a normal (non-throwing) response always carries
      // bootstrapComplete: true - pullConfigFromCloud only returns without
      // throwing once every entity is done. On failure this call rejects
      // with an ApiError instead; see the resumable-bootstrap note on
      // billerpe-local-exe/controller/deviceRegistration.js for why simply
      // calling registerDevice again is itself the retry/resume path.
      bootstrapComplete?: boolean;
    }>("/registerDevice", {
      mobile,
      password,
      device_id: deviceId,
    }),
};

// Shared by the login page's registration panel and the System page's
// re-authenticate action.
export function registerThisPc(mobile: string, password: string) {
  return authApi.registerDevice(mobile, password, getBrowserDeviceId());
}

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
      // Same numeric id as req.user/hotel_id everywhere else - Hotel's own
      // primary key, preserved verbatim through registerDevice's
      // Hotel.upsert (billerpe-local-exe/controller/deviceRegistration.js),
      // so this is safe to encrypt for the public QR menu link
      // (src/lib/publicMenu.ts) even when this call is EXE-routed - it
      // resolves to the same row the cloud's own menuByCategory looks up.
      id: number;
      upiId: string;
      hotel_name: string;
      address1: string | null;
      address2: string | null;
      gst_no: string | null;
      fssai_no: string | null;
      invoiceFormateHeaderText: string | null;
      invoiceFormateBottomText: string | null;
      printerSize: string | null;
      // Just the stored filename (e.g. "hotel_logo-mylogo.png"), same
      // convention uploadLogo's response uses - never a full URL. Both
      // this app and the backend's own printed-invoice HTML (controller/
      // kto.js) build the actual image URL as `${base}/images/${filename}`
      // themselves; see uploadLogo's own comment for why this app uses
      // API_BASE_URL specifically for that, not EXE_BASE_URL.
      hotel_logo: string | null;
      // Real, load-bearing column - controller/kto.js reads this hotel-level
      // flag when computing an order's own gst/grandAmount server-side, not
      // just for display. This app's invoiceFormat.gstCalculation toggle
      // used to be local-only (see setGstCalculation's old comment) - if the
      // two ever disagreed, the backend's own value always won for what the
      // customer was actually billed, regardless of what this app showed.
      invoiceFormateIncGst: boolean;
      hms_serviceCharge_mst: RawServiceCharge | null;
      hms_res_setting: { qr_code_open_on_settle: boolean } | null;
    }>("/singleHotel"),
  // Same endpoint, now also carries the two "marketing" header/footer
  // line's actual text - those live on Hotel itself
  // (invoiceFormateHeaderText/invoiceFormateBottomText), not on
  // hms_invoice_formate_mst with everything else invoiceFormateApi
  // handles (controller/kto.js#getHearderAndFooterDataBillView's own
  // marketing_text branch reads them from here, not from the
  // headerLineN/footerLineN slot itself).
  updateIdentity: (params: {
    upiId?: string;
    invoiceFormateHeaderText?: string;
    invoiceFormateBottomText?: string;
    invoiceFormateIncGst?: boolean;
  }) => apiPost<{ message?: string }>("/updateInvoiceFormate", { hotel: params }),

  // POST /hotelLogo (controller/hotel.js#uploadHotelLogo) - deliberately
  // separate from the real editHotelDetails/hoteledit endpoint, which also
  // rewrites the owner's email/password and runs cross-hotel duplicate
  // checks (superAdmin territory). This does exactly one thing. EXE-routed
  // like every other authenticated write (billerpe-local-exe/controller/
  // cloudRelay.js#uploadHotelLogo rebuilds the multipart body server-to-
  // server from the buffer it received, since this app's own session only
  // exists against the EXE's origin).
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append("hotel_logo", file);
    return apiPostForm<{ message?: string; hotel_logo: string }>("/hotelLogo", form);
  },

  // POST /updateRestaurantSetting (controller/hotel.js) - the only
  // writable field on RestaurantSetting right now (see its own comment on
  // why it's scoped this narrowly).
  updateQrOnSettle: (qr_code_open_on_settle: boolean) =>
    apiPost<{ message?: string }>("/updateRestaurantSetting", { qr_code_open_on_settle }),

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

// controller/incoiceFormate.js - a complete, already-existing read/write
// pair for the bill's header/footer lines that this app's own Invoice
// Format settings screen never actually called (confirmed reading
// hotelApi.getSettings's own comment: this app's local header/footer
// arrays were seed/mock text only, with no real backend round-trip at
// all). Up to 10 slots each side, each holding either a content KEYWORD
// (mock/store.tsx's mapRawInvoiceLine/toRawInvoiceLine do the translation
// to/from this app's own InvoiceLine.content union) or, for anything that
// isn't a recognized keyword, the literal text to print as-is - matching
// controller/kto.js#getHearderAndFooterDataBillView's own fallback branch
// exactly (`else { data = el.value }`). Font sizes are "<n>px" strings
// here (e.g. "12px"), not the plain numbers this app's own InvoiceLine
// uses.
export type RawInvoiceFormate = Record<string, string | number | null | undefined> | null;

export const invoiceFormateApi = {
  getHeaderFooter: () => apiGet<{ headerFooterData: RawInvoiceFormate }>("/headerFooter"),
  saveHeaderFooter: (payload: Record<string, string>) =>
    apiPost<{ message?: string }>("/invoiceSetting", payload),
};

// controller/kotFormate.js - the dynamic KOT format (Task 1) twin of
// invoiceFormateApi above, same headerLineN/footerLineN/fontH/fontF slot
// shape against the separate hms_kot_formate_mst table. Unlike the invoice
// side, no backend function re-renders these keywords server-side - see
// mock/store.tsx's KOT_CONTENT_TO_KEYWORD comment for why the keyword
// convention is a frontend-only choice here.
export type RawKotFormate = Record<string, string | number | null | undefined> | null;

export const kotFormatApi = {
  getHeaderFooter: () => apiGet<{ headerFooterData: RawKotFormate }>("/kotHeaderFooter"),
  saveHeaderFooter: (payload: Record<string, string>) =>
    apiPost<{ message?: string }>("/kotFormatSetting", payload),
};

// Delivery/Packaging charge rules - same field shape as RawServiceCharge,
// two rows per hotel distinguished by rule_for. Unlike addEditServiceCharge,
// updateBillChargeRule upserts by (hotel, rule_for) server-side, so no row
// id needs to be tracked/sent from this app's side at all.
export type RawBillChargeRule = {
  id: number;
  rule_for: "delivery" | "packaging";
  active: boolean;
  charge_type: "fixed" | "percentage";
  charge_value: number;
  calculation_on: "core" | "total";
  charge_automatic: unknown;
  calculation_on_tax: boolean;
  greater_less: "1" | "2" | "3";
  greater_less_amount: number;
};

export const billChargeApi = {
  getAll: () => apiGet<{ rules: RawBillChargeRule[] }>("/billChargeRule"),
  update: (params: {
    rule_for: "delivery" | "packaging";
    active: boolean;
    charge_type: "fixed" | "percentage";
    charge_value: number;
    calculation_on: "core" | "total";
    charge_automatic: string[];
    calculation_on_tax: boolean;
    greater_less: "1" | "2" | "3";
    greater_less_amount: number;
  }) => apiPost<{ message?: string }>("/billChargeRule", params),
};

// Per-hotel, per-trigger, per-channel notification toggles. Management
// list only - doesn't itself wire up real WhatsApp/SMS sending, which stay
// the separate, largely hardcoded/dead call sites they already were (see
// model/notificationSetting.js's own comment on the backend side).
export type RawNotificationSetting = {
  id: number;
  trigger: string;
  whatsapp: boolean;
  sms: boolean;
  in_app: boolean;
};

export const notificationSettingApi = {
  getAll: () => apiGet<{ settings: RawNotificationSetting[] }>("/notificationSetting"),
  toggle: (trigger: string, channel: "whatsapp" | "sms" | "in_app") =>
    apiPost<{ message?: string }>("/notificationSettingToggle", { trigger, channel }),
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
  rank?: number;
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
  // Local-only (billerpe-local-exe/model/table.js), set by
  // services/reservationTableSync.js alongside table_status "B" - the
  // reservation guest's name/number, carried straight onto the table so
  // staff can see who a "Reserved" table is held for without opening the
  // Reservations screen separately.
  reserved_name?: string | null;
  reserved_number?: string | null;
  // Cloud-authoritative (uat-backend-v2/model/table.js), mirrored down on
  // the ordinary table pull - unlike reserved_name/reserved_number, staff
  // never edits this directly; only "regenerate this table's QR"
  // (qrOrderApi.regenerateTableQr) bumps it, cloud-side.
  qr_version?: number;
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
  // Bulk range: T1..T5 with a shared prefix.
  createTables: (params: {
    startNo: number;
    endNo: number;
    table_catag_id: number;
    type: "T" | "R";
    prefix?: string;
    capacity?: number;
  }) =>
    apiPost<{ message?: string }>("/table", {
      startNo: String(params.startNo),
      endNo: String(params.endNo),
      table_catag_id: String(params.table_catag_id),
      type: params.type,
      prefix: params.prefix ?? "",
      ...(params.capacity ? { capacity: params.capacity } : {}),
    }),

  // Single table with any free-text name ("G-1", "VIP", "Rooftop 2") - the
  // "New table" dialog. Same endpoint as createTables (POST /table); sending
  // table_name instead of startNo/endNo switches the exe to this mode.
  createTable: (params: {
    table_name: string;
    table_catag_id: number;
    type: "T" | "R";
    capacity?: number;
  }) =>
    apiPost<{ message?: string }>("/table", {
      table_name: params.table_name,
      table_catag_id: String(params.table_catag_id),
      type: params.type,
      ...(params.capacity ? { capacity: params.capacity } : {}),
    }),

  editTable: (params: {
    id: number;
    table_name: string;
    table_catag_id: number;
    type: "T" | "R";
    capacity?: number;
  }) => apiPost<{ message?: string }>("/editTable", params),

  // Accepts either a single id or a bulk allId array - mirrors the backend
  // route, which supports both in one endpoint.
  removeTables: (allId: number[]) => apiPost<{ message?: string }>("/removeTable", { allId }),

  createCategory: (params: { table_catag_nm: string; type: "T" | "R" }) =>
    apiPost<{ message?: string }>("/addTableCatagories", params),

  editCategory: (params: { id: number; table_catag_nm: string; type: "T" | "R"; rank?: number }) =>
    apiPost<{ message?: string }>("/editTableCatagories", params),

  removeCategories: (allId: number[]) =>
    apiPost<{ message?: string }>("/removeTableCatagories", { allId }),

  // Dual-purpose, exactly matching this app's own mergeTables/transferTable
  // split - the backend decides which one happens: if table2 already has an
  // active order, it folds table1's order into it (merge) and soft-deletes
  // the source order; otherwise it's a plain reassignment of Order/
  // OrderDetails.TableId from table1 to table2 (transfer). Confirmed live by
  // reading controller/table.js#moveTable in full.
  moveTable: (params: { tableId1: number; tableId2: number; orderId: number }) =>
    apiPost<{ message?: string; orderId: number }>("/moveTable", params),

  // controller/table.js#moveKot (POST /moveKot) - moves just one KOT round
  // (not the whole order) to another table. Same merge-if-occupied /
  // plain-move-otherwise split as moveTable, at the round level: folds into
  // table2's existing order (as a new round there) if one exists, else
  // creates a fresh order on table2 seeded from just this round.
  moveKot: (params: { orderId: number; kotNumber: number; tableId1: number; tableId2: number }) =>
    apiPost<{ message?: string; orderId: number }>("/moveKot", params),
};

export type RawMenuCategory = {
  id: number;
  menu_categ_nm: string;
  active: boolean;
  rank?: number;
  menu_catalog_id?: number;
};

// Which named menu catalogue (e.g. "Main Menu", "Bar Menu") a category/
// variant/addon-group belongs to - see uat-backend-v2/model/menuCatalog.js.
// Every hotel always has at least one (seeded on onboarding, backfilled for
// existing hotels), so this is never an empty list in practice.
export type RawMenuCatalog = {
  id: number;
  name: string;
  is_default: boolean;
  active: boolean;
  table_category_ids?: string[] | number[];
  order_types?: string[];
};

// hms_image_mst has no hotel_id at all - a shared, cloud-curated stock
// image catalogue, not per-tenant data. GET /getProductImages/:search? is
// only real on uat-backend-v2, not billerpe-local-exe - rather than
// mirroring a global reference catalogue onto every outlet's local
// server, this now routes to the EXE (EXE_ROUTES) purely as a relay
// (services/cloudRelay.js) - the real endpoint and its data stay
// cloud-side, only the browser<->cloud auth gap moved server-to-server.
export type RawProductImage = { id: number; name: string; url: string };

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

export type RawVariant = {
  id: number;
  variants_name: string;
  active: boolean;
  menu_catalog_id?: number;
};

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
  menu_catalog_id?: number;
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
  menu_catalog_id?: number;
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

  getMenuCatalogs: () => apiGet<{ menuCatalogs: RawMenuCatalog[] }>("/menuCatalog"),
  createMenuCatalog: (name: string, tableCategoryIds: string[] = [], orderTypes: string[] = []) =>
    apiPost<{ message?: string; menuCatalog: RawMenuCatalog }>("/menuCatalog", {
      name,
      table_category_ids: tableCategoryIds,
      order_types: orderTypes,
    }),
  editMenuCatalog: (
    id: number,
    name: string,
    isDefault: boolean,
    tableCategoryIds: string[] = [],
    orderTypes: string[] = [],
  ) =>
    apiPost<{ message?: string }>("/menuCatalogEdit", {
      id,
      name,
      is_default: isDefault,
      table_category_ids: tableCategoryIds,
      order_types: orderTypes,
    }),
  removeMenuCatalog: (id: number) => apiPost<{ message?: string }>("/menuCatalogRemove", { id }),

  getProductImages: (search = "") =>
    apiGet<{ data: RawProductImage[] }>(
      search ? `/getProductImages/${encodeURIComponent(search)}` : "/getProductImages",
    ),

  createCategory: (name: string, menuCatalogId?: number) =>
    apiPost<{ message?: string }>("/catagories", {
      catagoriesFrom: { catagories_name: name, menu_catalog_id: menuCatalogId },
    }),
  editCategory: (id: number, name: string, rank?: number, menuCatalogId?: number) =>
    apiPost<{ message?: string }>("/catagoriesEdit", {
      editCatagoriesFrom: {
        id,
        menu_categ_nm: name,
        rank: rank ?? 0,
        menu_catalog_id: menuCatalogId,
      },
    }),
  removeCategories: (allId: number[]) =>
    apiPost<{ message?: string }>("/catagoriesRemove", { allId }),

  createItem: (params: MenuItemPayload) => apiPost<{ message?: string }>("/menu", params),
  editItem: (params: MenuItemPayload & { id: number }) =>
    apiPost<{ message?: string }>("/menuEdit", params),
  removeItems: (allId: number[]) => apiPost<{ message?: string }>("/menuRemove", { allId }),

  createVariant: (variants_name: string, active: boolean, menuCatalogId?: number) =>
    apiPost<{ message?: string; variants: RawVariant[] }>("/variant", {
      variants_name,
      active,
      menu_catalog_id: menuCatalogId,
    }),
  editVariant: (id: number, variants_name: string, active: boolean, menuCatalogId?: number) =>
    apiPut<{ message?: string; variants: RawVariant[] }>("/variant", {
      id,
      variants_name,
      active,
      menu_catalog_id: menuCatalogId,
    }),

  createAddonGroup: (params: AddonGroupPayload) =>
    apiPost<{ message?: string; addons: RawAddonGroup[] }>("/addon", params),
  editAddonGroup: (params: AddonGroupPayload & { id: number }) =>
    apiPut<{ message?: string; addons: RawAddonGroup[] }>("/addon", params),
};

// Hotel-configurable payment mode labels (Operations -> Billing). Purely a
// management list - real settlement (settleOrder in mock/store.tsx) still
// only ever sends the fixed cash/upi/card/due amounts; this never changes
// that, it only lets the picklist itself be customized per hotel.
export type RawPaymentMode = {
  id: number;
  name: string;
  active: boolean;
  deletable: boolean;
};

export const paymentModeApi = {
  getAll: () => apiGet<{ paymentModes: RawPaymentMode[] }>("/paymentMode"),
  create: (name: string) =>
    apiPost<{ message?: string; paymentMode: RawPaymentMode }>("/paymentMode", { name }),
  edit: (id: number, name: string, active: boolean) =>
    apiPost<{ message?: string }>("/paymentModeEdit", { id, name, active }),
  remove: (id: number) => apiPost<{ message?: string }>("/paymentModeRemove", { id }),
};

export type RawPaymentModeDefault = {
  id: number;
  order_type: "dinin" | "pickup";
  table_categ_id: number | null;
  payment_mode_id: number;
};

export const paymentModeDefaultApi = {
  getAll: () => apiGet<{ paymentModeDefaults: RawPaymentModeDefault[] }>("/paymentModeDefault"),
  save: (payload: {
    order_type: "dinin" | "pickup";
    table_categ_id?: number | null;
    payment_mode_id: number;
  }) => apiPost<{ message?: string }>("/paymentModeDefault", payload),
  remove: (id: number) => apiPost<{ message?: string }>("/paymentModeDefaultRemove", { id }),
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
  /** Per-user exceptions to the role's permissions, stored and enforced by the exe. */
  permission_overrides?: RawPermissionOverrides | string | null;
};

export type RawPermissionOverrides = {
  modules?: Record<string, Partial<Record<"view" | "create" | "edit" | "delete", boolean>>>;
  special?: Record<string, boolean>;
};

type UserPayload = {
  active: boolean;
  name: string;
  email: string;
  role: string;
  number: string;
  // Required on create (createUser hashes it unconditionally); optional on
  // update (updateUser only applies it when present - see editUser below).
  password?: string;
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

  // controller/user.js#userAccess (GET /getUserAccess) - the one endpoint
  // that resolves to the SPECIFIC hotelUser the current session's cookie
  // belongs to (req.userId, not just req.user/hotel_id), same shape as
  // getUsers' RawHotelUser rows. Used right after a real login
  // (restaurantLogin/pinLogin) to find out who actually just authenticated,
  // instead of trusting whatever this app's own local "Staff account"
  // picker happens to have selected.
  getCurrentUserAccess: () => apiGet<{ access: RawHotelUser }>("/getUserAccess"),

  createUser: (params: UserPayload) => apiPost<{ message?: string }>("/user", params),
  editUser: (params: UserPayload & { id: number }) =>
    apiPost<{ message?: string }>("/userUpdate", params),
  // null resets the user to their role's defaults.
  setPermissionOverrides: (id: number, overrides: RawPermissionOverrides | null) =>
    apiPost<{ message?: string }>("/userPermissionOverrides", { id, overrides }),
};

export type KotCartItem = {
  id: number;
  qty: number;
  price: number;
  discount: number;
  // Department-grouped, with a per-addon qty - see controller/kto.js's
  // matchDepartmentsAndAddonsById and its KOT/invoice print templates,
  // which are what actually read this back (confirmed live).
  addons: { id: number; department_name: string; hms_addon_msts: KotCartAddon[] }[];
  comment: string;
  menu_categ_id: number;
};

export type KotCartAddon = { id: number; addon_name: string; price: number; qty: number };

// controller/kto.js's addOrderTax/updateOrderTax (this cart.taxes field is
// what actually persists OrderTax rows) - `id` must be the real TaxType id
// (TaxRule.id). addOrderTax (new order) and updateOrderTax (existing
// order) each read a different subset of the remaining fields for the
// same OrderTax columns, so all three are sent to satisfy either path -
// see mock/store.tsx's buildCartTaxes for how these get filled in.
export type RawCartTax = {
  id: number;
  amount: number;
  tax_type: string;
  tax_value: number;
  tax: number;
};

type KotPayload = {
  order_type: "dinin" | "pickup";
  order_id?: number;
  table_id?: number;
  tableNumber?: string;
  /** Attaches/upgrades the order's customer (controller/kto.js#kotOrder's
   * own findAndUpdateUser call, billerpe-local-exe/helpers/
   * customerAttach.js's ported twin) - previously never sent at all here,
   * so a customer attached via store.setCustomer (frontend-only state)
   * never reached the order's actual User row unless/until a later call
   * that DID send it (generateBill) happened to run. */
  userName?: string;
  mobile?: string;
  gstin?: string;
  address?: string;
  cart: {
    gst: number;
    totalDiscount: number;
    grandAmount: number;
    myAmount: number;
    service_charger: number;
    delivery_charge: number;
    packaging_charge: number;
    discount_reason: string;
    discount_type: "fix" | "pr";
    discount_value: number;
    /** Explicit packaging override (Web POS "Charges" sheet); omitted =
     * the exe applies the hotel's packaging rule itself. */
    packaging_override?: number;
    taxes: RawCartTax[];
    // Only one entry is ever sent: kotOrder's server-side code looks for
    // `cart.items.find(el => el.status === 'H')` (creating a new order) or
    // `cart.items.filter(el => el.status === 'H')[0]` (adding to an
    // existing one) - "H" is the only status this client needs to produce,
    // confirmed live for both the create and add-round paths.
    items: [{ status: "H"; menuItems: KotCartItem[] }];
  };
};

// The full-cart body adminOrder and saveAndSettle rebuild an order from.
export type AdminOrderCart = {
  items: [{ status: "H"; menuItems: KotCartItem[] }];
  gst: number;
  totalDiscount: number;
  grandAmount: number;
  myAmount: number;
  service_charger: number;
  delivery_charge: number;
  packaging_charge: number;
  discount_reason: string;
  discount_type: "fix" | "pr";
  discount_value: number;
  taxes: RawCartTax[];
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
    apiPost<{ message?: string; kotInfo: { order_id: number; bill_no?: string } }>(
      "/kotOrder",
      payload,
    ),

  // POST /holdOrder - same dual create/update shape and same "cart.items
  // must carry the FULL not-yet-fired set" contract as adminOrder (its own
  // destroy-then-recreate only targets rows still in ORDER_DETAILS_TYPE
  // "in-progress", i.e. not yet through a real KOT round, but it still
  // replaces ALL of those unconditionally from whatever cart is sent - a
  // partial cart here would silently drop any other still-held line).
  // Persists Order.status "hold" (backend's ORDER_TYPE.HOLD) and
  // Table.table_status "H" - this is what makes a held order actually
  // survive a refresh: mapRawLiveOrder already maps that "hold" status back
  // to this app's "Hold" the moment loadTablesFromServer reconstructs it,
  // confirmed live - the gap was only ever that nothing called this
  // endpoint in the first place.
  holdOrder: (payload: KotPayload) =>
    apiPost<{ message?: string; orderId: number; bill_no?: string }>("/holdOrder", payload),

  // POST /kotReady (billerpe-local-exe/controller/kot.js#markKotReady) -
  // marks every still-in-kitchen line of one fired round ready and broadcasts
  // it to every other connected device (Captain App notifications, other Web
  // POS tabs). Real backend write; previously the Kitchen Display's Ready
  // transition never left the browser tab that clicked it.
  markKotReady: (orderId: number, kotNumber: number) =>
    apiPost<{ message?: string }>("/kotReady", { order_id: orderId, kotNumber }),

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
    /** See KotPayload's own comment on userName/mobile - same
     * findAndUpdateUser attach/upgrade mechanism, AdminOrder's own call. */
    userName?: string;
    mobile?: string;
    gstin?: string;
    address?: string;
    cart: AdminOrderCart;
  }) => apiPost<{ message?: string; orderId?: number; bill_no?: string }>("/adminOrder", payload),

  // Dine-in "Settle" straight from an open table, in one call (billerpe-
  // local-exe controller/order.js#saveAndSettle): saves the full cart -
  // creating the order when it was never saved - and settles it. Same body
  // as adminOrder's dine-in branch plus the payment. When the save worked
  // but the settle did not, the error's details carry { orderId, bill_no,
  // saved: true } so the table can be shown as billed.
  saveAndSettle: (payload: {
    order_type: "dinin";
    order_id?: number;
    table_id: number;
    userName?: string;
    mobile?: string;
    gstin?: string;
    address?: string;
    cart: AdminOrderCart;
    payment: {
      amount: number;
      cash: number;
      upi: number;
      card: number;
      due: number;
      tip?: number;
      mobile?: string;
    };
  }) => apiPost<{ message?: string; orderId: number; bill_no?: string }>("/saveAndSettle", payload),

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
    /** Dine In only - waiter service tip, kept separate from the
     * cash+upi+card+due=amount reconciliation server-side (see
     * uat-backend-v2/model/order.js's own comment). */
    tip?: number;
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
  // Routes to the EXE now (EXE_ROUTES), which relays it to the cloud
  // using its own stored session (services/cloudRelay.js) - the send
  // itself, and the WhatsApp credentials it needs, stay cloud-side.
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
  // entirely. Now bundles OrderDetails (line items) directly - no more
  // getSingleOrder follow-up per row needed to reconstruct a full order.
  getActiveOrders: () => apiGet<{ order: RawOrderDetail[] }>("/pickupOrder"),

  // controller/kto.js#invoiceGeneratePdf (POST /generateInvoicePdf).
  // Renders the bill via Puppeteer and returns the PDF as a raw byte
  // array inside JSON (`{type:"Buffer", data:[...]}`), not a URL or
  // base64 - reconstruct with `new Uint8Array(pdf.data)`. Item addons are
  // now sent in the real `{department_name, hms_addon_msts:[{addon_name,
  // qty, price}]}[]` shape (see buildAddonsPayload in mock/store.tsx).
  //
  // Puppeteer's browser-launch path used to be keyed off `data.origin ===
  // "http://localhost:3000"` exactly, falling through to a hardcoded
  // `/usr/bin/google-chrome-stable` path for every other origin (i.e.
  // every real deployment) - fixed backend-side to use `CHROME_PATH` env
  // var instead (falls back to Puppeteer's bundled Chromium), so this
  // works from any origin now.
  generateInvoicePdf: (payload: {
    orderId: number;
    /** See localPrintApi.printInvoice's own comment on this same field. */
    billNo?: string;
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
      addons?: KotCartItem["addons"];
    }[];
    totalQty: number;
    subtotal: number;
    totalDiscount: number;
    service_charge: number;
    /** Previously not sent at all - the printed bill's own charge/tip
     * breakdown silently diverged from the e-bill webview's, which does
     * carry these (getBillViewData). See mock/store.tsx#doPrintBill. */
    delivery_charge?: number;
    packaging_charge?: number;
    tip?: number;
    orderTax: {
      hms_tax_type_mst: { tax_name: string };
      amount: number;
      tax_type: "pr" | "fix";
      tax_value: number;
    }[];
    totalBill: number;
    /** Signed delta applied to reach totalBill from the raw sum - positive rounded up, negative rounded down. Shown as its own line on the printed bill. */
    roundOff?: number;
    headerText: string[];
    footerText: string[];
  }) =>
    apiPost<{ orderId: number; pdf: { type: "Buffer"; data: number[] } }>(
      "/generateInvoicePdf",
      payload,
    ),

  // controller/kto.js#kotGeneratePdf (POST /generateKotPdf). Renders a
  // single KOT round's ticket (item/qty/note/addons only, no pricing) -
  // used for the Reprint KOT action, since there's no separate "already
  // sent" record to look up server-side, the caller re-supplies the same
  // round's item list it already has locally. Same raw-byte-array PDF
  // response shape as generateInvoicePdf.
  printKot: (payload: {
    order_type: "dinin" | "pickup";
    order_id: string;
    restaurantName: string;
    userOrTableNo: string;
    timeAndDate: string;
    printerSize: string;
    kotNumber: number;
    token: number;
    /** Dynamic KOT format (Task 1) - client-rendered HTML fragments from
     * store.kotFormat (renderKotHeaderFooter, near doPrintKot). Falls back
     * server-side to the old hardcoded layout when empty/omitted. */
    headerText?: string[];
    footerText?: string[];
    items: {
      item_name: string;
      qty: number;
      comment?: string;
      variantData?: { variants_name: string } | null;
      addons?: KotCartItem["addons"];
    }[];
  }) => apiPost<{ pdf: { type: "Buffer"; data: number[] } }>("/generateKotPdf", payload),

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

  // controller/order.js#makeSequenceBillNoOptimized (GET /makeSequenceBillNo)
  // - closes gaps in the bill_no sequence (e.g. left behind by deleted
  // orders), renumbering every non-deleted order back to a continuous run
  // starting at 1 (or from the start of the financial year, if the hotel's
  // RestaurantSetting.bill_reset_type is "financial_year"). Always starts
  // at 1 - there's no arbitrary start-number parameter on this endpoint.
  remakeSequence: () => apiGet<{ message?: string; updated_count: number }>("/makeSequenceBillNo"),
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
  /** Waiter service tip, attributed to hotelUserId below (the order's
   * creator) - see uat-backend-v2/model/order.js's own comment. */
  tip?: number | null;
  /** Owner-visible "reprinted N times" counter - see
   * billerpe-local-exe/model/order.js's own comment. */
  billPrintCount?: number | null;
  /** Real per-day kitchen token number (Order.token,
   * uat-backend-v2/controller/kto.js's generateToken). */
  token?: number | null;
  business_date: string;
  createdAt: string;
  updatedAt: string;
  hotelUserId: number | null;
  TableId: number | null;
  hms_table_mst?: { table_name: string } | null;
  hms_user_master?: { name?: string; number?: string; address?: string; gstin?: string } | null;
  /** Discount INPUT the exe recomputes from ("pr" = percent of subtotal). */
  discount_type?: "fix" | "pr" | null;
  discount_value?: number | null;
  /** Explicit per-order packaging override, null when the rule applies. */
  packaging_override?: number | null;
  packaging_charge?: number | null;
  totalAmount?: number | null;
  roundOff?: number | null;
  deleted?: boolean;
};

export type RawOrderLine = {
  id: number;
  qty: number;
  price: number;
  variant_name: string | null;
  // A DataTypes.JSON column on the exe side - arrives as an already-parsed
  // array, not a JSON string, despite how this used to be typed. See
  // mock/store.tsx#parseOrderAddons's own comment for the live bug that
  // came from trusting this type.
  addons: unknown;
  comment: string | null;
  MenuId: number;
  kotNumber: number;
  hms_menu_mst?: { item_name?: string };
};

export type RawOrderDetail = RawOrderHeader & {
  hms_orderDetails: RawOrderLine[];
};

// controller/order.js's getOrdersByBillNo (GET /searchOrder/all) now
// bundles OrderDetails and takes real page/limit/search params - confirmed
// live (network panel) that this used to return headers only, forcing a
// getSingleOrder (GET /order/:id) follow-up per row just to get line items
// (30+ extra requests on a single history-page load). That's gone: this
// call alone returns full detail, paginated, with server-side search
// across order no, bill_no, table name and customer name/phone. Cancelled
// orders are still invisible here (cancellation is modelled purely as
// deleted:true, and this endpoint filters deleted:false) - there is no
// backend-retrievable source for a "Cancelled" history entry through this
// app at all.
export type RawOrderHistoryPage = {
  order: RawOrderDetail[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export const orderHistoryApi = {
  getAllHeaders: (page: number, limit: number, search?: string) =>
    apiGet<RawOrderHistoryPage>(
      `/searchOrder/all?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),
  getDetail: (id: number) => apiGet<{ order: RawOrderDetail }>(`/order/${id}`),
  /** Owner-visible bill-reprint counter (Task 5) - fires only from the
   * explicit "Reprint bill" action, never the first bill-generation print.
   * Best-effort: a failure here must never block the actual print. */
  incrementBillPrintCount: (id: number) =>
    apiPost<{ billPrintCount: number }>(`/order/${id}/reprintCount`, {}),
};

// Reservations - uat-backend-v2's controller/tableBooking.js, a real,
// already-working feature (multi-table booking, per-table time-overlap
// conflict rejection, a node-schedule job that auto-opens an order on the
// table(s) at start_time). Deliberately NOT ported to billerpe-local-exe:
// duplicating this into the local-first sync engine would mean
// re-implementing real business logic that already exists and raises an
// ownership question (which side's scheduler fires the auto-open?).
//
// These paths ARE now in EXE_ROUTES, but only as a relay
// (billerpe-local-exe/services/cloudRelay.js), not a port - the EXE
// forwards each call to the cloud server-to-server using its own stored
// cloud session and relays the response back unchanged. This exists
// because the browser only ever holds a session for the EXE's own
// origin, never the cloud's, so a direct browser->cloud call always
// 401'd regardless of session validity - confirmed live as the
// Reservations screen force-logging the user out just for opening it.
// The scheduler/conflict logic itself is untouched and still runs
// entirely on the cloud; nothing about "which side owns this" changed.
//
// getBookingData collapses a multi-table booking into one row per
// booking_id with `table_name` as an array of table objects - note
// `no_of_persons` (plural) is a pre-existing bug in that controller (wrong
// field name, always undefined); the real party size is `no_of_person`
// (singular), used here instead. No `status`/`deleted` field comes back at
// all - deleted:false is already applied server-side, so every row this
// returns is implicitly active by construction; a delete just removes it
// from future listings, not a separate rendered "Cancelled" state.
export type RawReservation = {
  booking_id: number;
  name: string;
  email: string;
  number: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  no_of_person: number;
  totalAmount: number;
  gst_no: string;
  advance: number;
  table_name: { id: number; table_name: string }[];
};
export type ReservationPayload = {
  name: string;
  email: string;
  number: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  no_of_person: number;
  totalAmount: number;
  gst_no: string;
  advance: number;
  // Confusingly, the API's own field name for "table ids to book" is also
  // `table_name` (an array of ids, not the array-of-objects the read side
  // returns under the same key) - matching the controller's own request
  // body shape exactly, not renamed here.
  table_name: number[];
};
export const reservationApi = {
  getAll: () => apiGet<{ bookings: RawReservation[] }>("/getBookingData"),
  create: (payload: ReservationPayload) => apiPost<{ message: string }>("/tableBooking", payload),
  update: (bookingId: number, payload: ReservationPayload) =>
    apiPost<{ message: string }>(`/updatedBooking/${bookingId}`, payload),
  remove: (bookingId: number) => apiPost<{ message: string }>("/deleteBooking", { id: bookingId }),
};

// Walk-in waitlist queue - billerpe-local-exe/controller/queue.js, a real
// local implementation with no cloud counterpart at all (see model/
// queueEntry.js's own comment on why). Every terminal pointed at this same
// exe shares one live queue.
export type RawQueueEntry = {
  id: number;
  name: string;
  mobile: string;
  party_size: number;
  status: "waiting" | "seated" | "no_show" | "cancelled";
  joined_at: string;
  called_at: string | null;
  resolved_at: string | null;
  notes: string | null;
};
export const queueApi = {
  getAll: () => apiGet<{ queue: RawQueueEntry[] }>("/queue"),
  add: (payload: { name: string; mobile: string; party_size: number }) =>
    apiPost<{ queue: RawQueueEntry[] }>("/queue", payload),
  updateStatus: (id: number, status: RawQueueEntry["status"]) =>
    apiPut<{ entry: RawQueueEntry }>(`/queue/${id}`, { status }),
  markCalled: (id: number) => apiPost<{ entry: RawQueueEntry }>(`/queue/${id}/call`, {}),
  clear: () => apiPost<{ queue: RawQueueEntry[] }>("/queue/clear", {}),
};

// QR table ordering, staff-facing half - see billerpe-local-exe/controller/
// qrOrder.js. The pending-orders inbox is a real local read against the
// exe's own mirror (services/qrOrderSync.js), not a relay; accept/reject
// are real local writes (accept creates a real KOT). table_status/
// table_name come along on each row purely for the accept guardrail (warn,
// never block, if the table doesn't currently look occupied).
export type RawQrOrderItem = {
  menuId: number;
  qty: number;
  itemName: string;
  comment?: string;
  variantId?: number;
  variantName?: string;
  addonIds?: number[];
  addonNames?: string[];
};
export type RawPendingQrOrder = {
  id: number;
  hotel_id: number;
  table_id: number;
  qr_version: number;
  customer_name: string | null;
  customer_mobile: string;
  items: RawQrOrderItem[];
  status: "pending" | "accepted" | "rejected" | "expired";
  submitted_at: string;
  table_status: string | null;
  table_name: string | null;
};
export const qrOrderApi = {
  getPending: () => apiGet<{ qrOrders: RawPendingQrOrder[] }>("/qrOrder/pending"),
  accept: (id: number) => apiPost<{ orderId: number }>(`/qrOrder/${id}/accept`, {}),
  reject: (id: number) => apiPost<{ message: string }>(`/qrOrder/${id}/reject`, {}),
  regenerateTableQr: (tableId: number) =>
    apiPost<{ qr_version: number }>(`/table/${tableId}/qr-version`, {}),
};

// Audit Log persistence (billerpe-local-exe's controller/auditLog.js) -
// mock/store.tsx's log() POSTs here fire-and-forget right after its own
// in-memory patch. device/ip are captured server-side from the request,
// never sent from here - see that controller's own comment.
export type RawAuditLogEntry = {
  id: number;
  user_id: string | null;
  user_name: string;
  action: string;
  entity: string;
  before: string;
  after: string;
  reason: string | null;
  device: string | null;
  ip: string | null;
  createdAt: string;
};
export type RawAuditLogPage = {
  entries: RawAuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export const auditLogApi = {
  create: (entry: {
    user_id: string;
    user_name: string;
    action: string;
    entity: string;
    before: string;
    after: string;
    reason?: string;
  }) => apiPost<{ ok: boolean }>("/auditLog", entry),
  getAll: (page: number, limit: number, q?: string, userId?: string) =>
    apiGet<RawAuditLogPage>(
      `/auditLog?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}${userId && userId !== "all" ? `&userId=${encodeURIComponent(userId)}` : ""}`,
    ),
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

// controller/editSettledOrder.js - "reopen and edit a settled order"
// (orders.reopenSettled). Reverses and re-consumes stock server-side,
// replaces the item list wholesale, recomputes the total, and turns any
// gap against what's already been collected into `due` (negative = a
// refund is owed - see refundDueApi below).
export const editSettledOrderApi = {
  edit: (params: {
    orderId: number;
    items: {
      menuId: number;
      qty: number;
      price: number;
      totalDiscount?: number;
      variantId?: number;
      variantName?: string;
      addons?: unknown[];
    }[];
    totalAmount: number;
    gst: number;
    grandAmount: number;
    totalDiscount: number;
    discount_reason?: string;
    discount_type?: "fix" | "pr";
    discount_value?: number;
    service_charge?: number;
    /** How the full edited bill was paid, chosen by the biller when saving
     * the edit. `due` needs the customer's mobile. */
    payment?: {
      cash: number;
      upi: number;
      card: number;
      due: number;
      mobile?: string;
      name?: string;
      address?: string;
      gstin?: string;
    };
  }) => apiPost<{ message?: string; due: number }>("/editSettledOrder", params),
};

export type RawRefundDueOrder = {
  id: number;
  bill_no: string;
  due: number;
  createdAt: string;
};

export const refundDueApi = {
  getAll: () => apiGet<{ orders: RawRefundDueOrder[] }>("/refundDue"),
  settle: (id: number) => apiPost<{ message?: string }>("/refundDue", { id }),
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

  // Customers whose mobile contains `digits` - the customer form's
  // suggestions reach past the first 500 held in memory.
  searchByMobile: (digits: string) =>
    apiGet<{ numbers: RawCustomer[]; total: number }>(
      `/customer/getAll?limit=8&search=${encodeURIComponent(digits)}`,
    ),

  // Rejects a duplicate number outright (its own findOne check) - not
  // silently deduped or merged.
  create: (params: { name: string; number: string; gstin: string; address: string }) =>
    apiPost<{ message?: string }>("/customer/create", params),

  update: (params: { id: number; name: string; number: string; gstin: string; address: string }) =>
    apiPut<{ message?: string }>("/customer/update", params),

  // controller/customer.js#getLastOrderForCustomer (GET /customer/
  // lastOrder) - "repeat this customer's last order" suggestion for the
  // Attach customer dialog. Same RawOrderDetail shape getSingleOrder/
  // getAllHeaders already return (Menu + line items joined), just scoped
  // to "most recent non-deleted order for this number, real name/number
  // required so it never matches the blank placeholder every order gets
  // when no customer is attached". excludeOrderId leaves out the order
  // currently being built, so a returning customer's own brand-new (still
  // empty) order never "suggests" itself right back.
  getLastOrder: (number: string, excludeOrderId?: number) =>
    apiGet<{ order: RawOrderDetail | null }>(
      `/customer/lastOrder?number=${encodeURIComponent(number)}${
        excludeOrderId ? `&excludeOrderId=${excludeOrderId}` : ""
      }`,
    ),
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

// Real local Windows printers, from the EXE (see billerpe-local-exe's
// services/localPrinting.js) - lets the Printer Settings screen offer a
// dropdown of what's actually installed on this PC instead of free-text
// printer_name entry with no way to know it matches anything real.
export type RawLocalPrinter = { deviceId: string; name: string; paperSizes: string[] };
export const localPrinterApi = {
  getAll: () => apiGet<{ printers: RawLocalPrinter[] }>("/localPrinters"),
};

// Same payload/handlers as billerpe-local-exe's public/dashboard.html (its
// own GET /dashboard/api/status), reused here behind adminAuth instead of
// that page's separate per-install token - see routes/index.js's own
// comment on why duplicating the route (not the handler) was the right
// call. Backs the System page's real server/sync status.
export type RawLocalServerStatus =
  | { registered: false; deviceId: string; lanAddresses: string[]; serverStartedAt: string }
  | {
      registered: true;
      deviceId: string;
      hostname: string;
      app_version: string;
      lanAddresses: string[];
      hasCloudSession: boolean;
      hotelName: string;
      serverStartedAt: string;
      sync: {
        lastSuccessfulSyncAt: string | null;
        maxOfflineDays: number;
        daysSinceSync: number;
        transactionsBlocked: boolean;
        /** Heartbeat cadence - one cloud request per outlet per tick. */
        heartbeatSeconds: number;
        /** Push cadence - orders and other exe-owned rows, in chunks. */
        pushSeconds: number;
        lastHeartbeatAt: string | null;
        lastPushAt: string | null;
        /** A real queue depth: rows genuinely waiting to be pushed. */
        pendingOrderCount: number;
        /** Orders the cloud has refused, with the reason - no longer an
         * invisible stall. */
        stuckOrders?: { id: number; bill_no: string; sync_error: string; sync_attempts: number }[];
        /** No amount of waiting fixes this: the device's credential is gone
         * (released centrally, or another PC took the outlet over). */
        registrationRequired?: boolean;
        lastError: { phase: string; message: string; at: string } | null;
      };
      tables: { total: number; free: number; running: number };
      orders: { today: number };
    };
export const localServerApi = {
  getStatus: () => apiGetRaw<RawLocalServerStatus>("/localServerStatus"),
  forceSync: () => apiPostRaw<{ ok: boolean }>("/localServerForceSync", {}),
};

// Direct silent printing from the EXE - generates the same PDF format as
// generateKotPdf/generateInvoicePdf (see billerpe-local-exe's
// services/pdfGenerator.js, a verbatim port of the real backend's own
// templates) and sends it straight to whichever printer(s) Printer
// Settings has configured, no browser print dialog involved.
export const localPrintApi = {
  printKot: (params: {
    order_type: "dinin" | "pickup";
    order_id: string;
    restaurantName: string;
    userOrTableNo: string;
    timeAndDate: string;
    kotNumber: number;
    token: number;
    table_id?: string;
    /** Dynamic KOT format (Task 1) - see orderApi.printKot's own comment. */
    headerText?: string[];
    footerText?: string[];
    items: unknown[];
  }) =>
    apiPost<{ message?: string; results: { printer: string; ok: boolean; error?: string }[] }>(
      "/printKotDirect",
      params,
    ),
  printInvoice: (params: {
    orderId: string;
    /** The real bill number to print - see mock/store.tsx#doPrintBill's own
     * comment. Falls back to orderId server-side (services/pdfGenerator.js)
     * when omitted, so an older caller that never sends it still works. */
    billNo?: string;
    tableAndUserInfo: string;
    dateAndTime: string;
    type: "dinin" | "pickup";
    token: number;
    customerName?: string;
    customerNumber?: string;
    items: unknown[];
    totalQty: number;
    subtotal: number;
    totalDiscount: number;
    service_charge: number;
    delivery_charge?: number;
    packaging_charge?: number;
    tip?: number;
    orderTax: unknown[];
    totalBill: number;
    /** Signed delta applied to reach totalBill from the raw sum - positive rounded up, negative rounded down. Shown as its own line on the printed bill. */
    roundOff?: number;
    headerText: string[];
    footerText: string[];
  }) => apiPost<{ orderId: string; printer: string }>("/printInvoiceDirect", params),
  testPrint: (params: { printerName: string; printerSize?: string }) =>
    apiPost<{ printer: string }>("/testPrintDirect", params),
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
  /** DB column is `qty`, not `quantity` - confirmed live against
   * billerpe-local-exe/model/purchaseRawMaterial.js. */
  qty: number;
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

// Neither uat-backend-v2's controller/stock_Mangement/purchaseOrder.js nor
// billerpe-local-exe's own port (controller/purchaseOrder.js) puts an `as`
// alias on the PurchaseOrder->PurchaseRawMaterial/Supplier/
// PurchaseOrderPayment associations, so Sequelize's own default naming
// (the associated model's own registered table name, pluralized for a
// hasMany) is what actually comes back - confirmed live against a real
// hotel's data. The plain `rawMaterials`/`supplier`/`payments` field names
// this type used to declare never matched either backend's real response
// at all: `o.rawMaterials.map(...)` (mock/store.tsx#mapRawPurchaseOrder)
// threw the moment a hotel had any real PO data to load, surfacing as the
// generic "Could not load purchase orders from server" toast (a non-
// ApiError JS exception, not a clean API error). There was never a
// `payments: number` field either - "how much has been paid" has to be
// summed from hms_purchase_payments' own line amounts.
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
  hms_supplier?: { id: number; name: string };
  hms_purchase_rawMaterials: RawPurchaseOrderLine[];
  hms_purchase_payments: RawPurchaseOrderPayment[];
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

export type RawRequisitionItem = {
  id: number;
  raw_material_id: number;
  ordered_qty: number;
  approved_qty: number | null;
  unit_price: number;
};

export type RawRequisition = {
  id: number;
  req_no: number;
  createdAt: string;
  status: "Pending" | "Accepted" | "Out for delivery" | "Delivered" | "Rejected";
  remarks: string | null;
  raised_by: string | null;
  purchase_order_id: number | null;
  items: RawRequisitionItem[];
};

// controller/requisition.js - a procurement-request workflow that produces
// a real PurchaseOrder (via fulfil, one atomic transaction server-side)
// once accepted and out for delivery, mirroring purchaseOrderApi's own
// header+lines shape.
export const requisitionApi = {
  getAll: () => apiGet<{ requisitions: RawRequisition[] }>("/stock/requisition"),

  create: (
    items: { materialId: string; orderedQty: number; unitPrice: number }[],
    remarks?: string,
  ) =>
    apiPost<{ message?: string; id: number; req_no: number }>("/stock/requisition", {
      items: items.map((i) => ({
        materialId: Number(i.materialId),
        orderedQty: i.orderedQty,
        unitPrice: i.unitPrice,
      })),
      remarks,
    }),

  setStatus: (id: number, status: RawRequisition["status"]) =>
    apiPost<{ message?: string }>("/stock/requisitionStatus", { id, status }),

  setItemQty: (id: number, materialId: string, qty: number) =>
    apiPost<{ message?: string }>("/stock/requisitionItemQty", {
      id,
      materialId: Number(materialId),
      qty,
    }),

  remove: (id: number) => apiPost<{ message?: string }>("/stock/requisitionRemove", { id }),

  fulfil: (id: number) =>
    apiPost<{ message?: string; purchase_order_id: number; po_no: number }>(
      "/stock/requisitionFulfil",
      { id },
    ),
};

// controller/rolePermissionDefault.js - one row per (hotel, role), storing
// the frontend's grant matrix as opaque JSON (permissions/special_permissions
// aren't typed against mock/types.ts's RolePermissions/SpecialPermission
// here - this file stays independent of the mock layer, same as every
// other Raw* type; store.tsx's mapper does the real shape work).
export type RawRolePermissionDefault = {
  id: number;
  role: string;
  permissions: Record<string, unknown>;
  special_permissions: Record<string, unknown>;
};

export const rolePermissionApi = {
  getAll: () => apiGet<{ defaults: RawRolePermissionDefault[] }>("/rolePermissionDefault"),

  editPermissions: (role: string, permissions: Record<string, unknown>) =>
    apiPost<{ message?: string }>("/rolePermissionDefault", { role, permissions }),

  editSpecial: (role: string, special: Record<string, unknown>) =>
    apiPost<{ message?: string }>("/rolePermissionDefaultSpecial", { role, special }),
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

// controller/expence/expence.js
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
  remove: (allId: number[]) =>
    apiDelete<{ expenseHeads: RawExpenseHead[] }>("/expense/deleteExpenseHead", { allId }),
};

export type RawExpenseEntry = {
  id: number;
  amount: string;
  reason: string;
  paymentMode: string;
  addExpense: boolean;
  business_date: string;
  expense_head_id: number;
  user_id: number | null;
  // Sequelize's own timestamp, has real time-of-day unlike business_date
  // (DATEONLY) - what the entries screen's "date & time" column reads.
  createdAt: string;
  hms_expense_head_mst?: { expense_head_name?: string };
  // Was write-only before (user_id was always saved but never joined back
  // out) - controller/expense.js's allEntry now includes HotelUser, model/
  // index.js now has the reverse belongsTo that join needs.
  hms_hotelUser_master?: { id: number; name: string } | null;
};

// Optional filters allEntry now supports beyond the always-required date
// range - each maps straight to a `where` clause, so "no filter" just
// omits the query param entirely rather than sending an empty string.
export type ExpenseEntryFilters = {
  expense_head_id?: number;
  paymentMode?: string;
  user_id?: number;
};

export type RawExpenseEntryPage = {
  entry: RawExpenseEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Always computed over the FULL filtered set (every page), not just
  // whichever page is being viewed - see controller/expense.js's own
  // comment on why these are queried separately from the page rows.
  totalMoneyIn: number;
  totalExpense: number;
  totalSale: number;
  remainingAmount: number;
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
// controller/expense.js's allEntry - real server-side pagination, not a
// full unbounded fetch: `opts.page`/`opts.limit` gate which rows come
// back, `opts.all: true` bypasses that entirely (every matching row in
// one call) for the two callers that genuinely need the complete set -
// CSV export, and the full-range aggregate reads (Dashboard/Expense
// Heads/the expense report) that pre-date real pagination and still need
// "everything in this range," not one page of it.
export const expenseApi = {
  getAll: (
    startDate: string,
    endDate: string,
    opts?: { page?: number; limit?: number; all?: boolean } & ExpenseEntryFilters,
  ) => {
    const params = new URLSearchParams({ startDate, endDate });
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.all) params.set("all", "true");
    if (opts?.expense_head_id) params.set("expense_head_id", String(opts.expense_head_id));
    if (opts?.paymentMode) params.set("paymentMode", opts.paymentMode);
    if (opts?.user_id) params.set("user_id", String(opts.user_id));
    return apiGet<RawExpenseEntryPage>(`/expense/allEntry?${params.toString()}`);
  },
  create: (params: {
    expense_head_id: number;
    amount: number;
    paymentMode: string;
    reason: string;
    addExpense: boolean;
    // ISO timestamp - omitted means "now" (backend default). Staff can
    // backdate a forgotten entry; the backend independently rejects a
    // future one regardless of what the client sends.
    date?: string;
  }) => apiPost<{ message?: string }>("/expense/addExpense", params),
  update: (params: {
    id: number;
    expense_head_id: number;
    amount: number;
    paymentMode: string;
    reason: string;
    addExpense: boolean;
    date?: string;
  }) => apiPut<{ message?: string }>("/expense/editExpense", params),
  remove: (id: number) => apiDelete<{ message?: string }>("/expense/deleteExpense", { id }),
};

export type RawCashMovement = {
  id: number;
  type: "Opening" | "Add" | "Withdraw" | "Expense" | "Settlement";
  amount: number;
  reason: string | null;
  at: string;
  hotelUserId: number | null;
  hms_hotelUser_master?: { id: number; name: string } | null;
};

export type RawCashSession = {
  id: number;
  opening_float: number;
  status: "Open" | "Closed";
  opened_at: string;
  closed_at: string | null;
  counted_cash: number | null;
  variance: number | null;
  variance_reason: string | null;
  hotelUserId: number | null;
  hms_hotelUser_master?: { id: number; name: string } | null;
  hms_cashMovement_msts?: RawCashMovement[];
};

// controller/cashSession.js. One open drawer per hotel at a time (server
// rejects a second /open while one is already Open) - amount is always
// positive in the request; the server flips the sign for Withdraw/Expense
// before storing it, matching the frontend's own sign convention.
export const cashSessionApi = {
  getSessions: () => apiGet<{ sessions: RawCashSession[] }>("/cashSession"),
  open: (opening_float: number) =>
    apiPost<{ session: RawCashSession }>("/cashSession/open", { opening_float }),
  addMovement: (params: {
    type: "Add" | "Withdraw" | "Expense" | "Settlement";
    amount: number;
    reason: string;
  }) => apiPost<{ movement: RawCashMovement }>("/cashSession/movement", params),
  close: (params: { counted_cash: number; variance_reason?: string }) =>
    apiPost<{ session: RawCashSession; expected: number }>("/cashSession/close", params),
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

export type RawKotReportPeriod = {
  period: string;
  totalTickets: number;
  totalOrders: number;
  // A ticket counts here when its order was later deleted (deletedTickets)
  // or is still unsettled - payment !== "success" and not deleted -
  // (unbilledTickets); every other ticket belongs to a settled order.
  // deletedTickets + unbilledTickets is the "not in use" count staff asked
  // to see split out from the raw KOT total.
  deletedTickets: number;
  unbilledTickets: number;
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

export type RawTableStaffRow = {
  label: string;
  orders: number;
  amount: number;
  /** Staff rows only - tips are attributed to the order's own waiter. */
  tips?: number;
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
  /** Per order type, over the WHOLE range - added because the Dashboard was
   * deriving this from a single page of order history, so it was wrong as
   * soon as the range held more than ten bills. */
  orderTypeSplit?: { orderType: string; orders: number; amount: number }[];
  /** Discounted-order count and total over the whole range, same reason. */
  discounted?: { orders: number; amount: number };
};

export type RawDiscountedOrder = {
  id: number;
  bill_no: string;
  grandAmount: string | number;
  totalDiscount: string | number;
  order_type: string;
  createdAt: string;
  // Who billed/owns the order (Order.hotelUserId), not the customer -
  // task 44 wanted the discount report to show who gave a discount.
  hms_hotelUser_master?: { name: string } | null;
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
  /** Item and category totals for a range, aggregated in SQL over EVERY
   * order in it. Both the Item-wise report and the Dashboard's "Top ordered
   * items" read this one call, so the two cannot disagree - they used to,
   * because the Dashboard summed one page of ten cached orders. */
  itemAndCategoryWiseSales: (startDate: string, endDate: string) =>
    apiGet<{ itemWise: RawItemWiseRow[]; categoryWise: RawCategoryWiseRow[] }>(
      `/report/itemTextReports?startDate=${startDate}&endDate=${endDate}`,
    ),
  /** Per-table and per-staff performance over the whole range
   * (controller/reports.js#tableAndStaffWiseSales). Both used to be summed in
   * the browser from the ten settled orders that happened to be cached, which
   * ignored the date range completely - see that controller's comment. */
  tableAndStaffWise: (startDate: string, endDate: string) =>
    apiGet<{
      tableWise: RawTableStaffRow[];
      staffWise: RawTableStaffRow[];
      totalOrders: number;
      totalAmount: number;
    }>(`/report/tableAndStaffWise?startDate=${startDate}&endDate=${endDate}`),
  posCollection: (startDate: string, endDate: string) =>
    apiGet<{ posCollections: RawPosCollection }>(
      `/report/posCollection?startDate=${startDate}&endDate=${endDate}`,
    ),
  // controller/reports/orderRelated.js#kotReport (GET /report/kotReport) -
  // day-wise count of real KOT tickets fired, from hms_timeline_mst rows
  // with action "kot" (a true event log, not derived/guessed).
  kotReport: (startDate: string, endDate: string) =>
    apiGet<{
      periodData: RawKotReportPeriod[];
      totalTickets: number;
      deletedTickets: number;
      unbilledTickets: number;
    }>(`/report/kotReport?startDate=${startDate}&endDate=${endDate}`),
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
