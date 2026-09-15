# BillerPe POS — Backend Wiring Plan

Tracks migration of `billerpe-pos-pro-v2` (frontend) from mock/local data onto the real
`uat-backend-v2` API. Updated as work lands — treat this as the live source of truth for
what's real, what's a confirmed dead end, and what's left.

**Ground rules carried through this whole plan:**
- Read real backend source before writing any frontend code for a module. Never guess a
  request/response shape.
- Verify every contract live against the running backend before calling it done.
- Document real backend bugs/gaps found in code comments where the workaround lives —
  don't silently paper over them.
- Skip or narrow scope where the backend genuinely has no clean mapping, rather than
  forcing a fit (e.g. Requisitions vs. Franchise Orders).
- Prefer fixing a real, narrow backend gap (missing endpoint, dead logic, a genuinely
  missing column) over any schema redesign or engine change — nothing found so far has
  needed one.
- One module per commit, typecheck + lint clean, live-verified before marking done.

---

## Status legend

- ✅ **Done** — wired to the real backend, live-verified, committed.
- ⛔ **Dead end** — investigated, no real backend capability exists. Not revisited unless
  new backend work is authorized.
- 🔲 **Remaining** — not started, or partially started.
- 🔍 **Needs research** — real backend support unconfirmed; investigate before wiring.

---

## ✅ Already wired

| Module | Notes |
|---|---|
| Tables & table categories | Real load + CRUD |
| Menu (items, categories, variants, addon groups) | Real load + CRUD |
| Users & roles | Real load + CRUD |
| Orders — write path | Real KOT fire, admin order, settle |
| Orders — live reconstruction | Any currently-active order (dine-in or pickup, on a table or not) not already known locally is fetched and rebuilt on load, via `GET /pickupOrder` + `GET /order/:id` — fixes the "table shows occupied but biller opens empty" bug |
| Orders — settled history | Last 90 days, capped at 300, separate from live `orders` array |
| Orders — actions | Cancel, delete (single + bulk), e-bill send, reprint bill (real PDF), timeline |
| Table merge / transfer | Real `POST /moveTable` for any order already synced to the backend (has a `backendId` and, for transfer, a current table) — the backend itself decides merge-vs-plain-transfer based on whether the destination table already has an order. A draft never sent to KOT has nothing on the backend to move yet, so that case stays the original local-only reassignment |
| KDS | Real ticket flow |
| UPI | Real |
| Due Bills | Real load + settle |
| Customers | Real load + CRUD |
| Kitchens & Printers | Real load + CRUD |
| Tax Rules & Service Charge | Real load + CRUD |
| Units | Real load + CRUD |
| Raw Materials & Suppliers | Real load + CRUD |
| Purchase Orders | Real full CRUD incl. edit-diff logic |
| Stock In/Out | Real |
| Wastage | Real create (no delete — backend has none) |
| Semi-Finished Items | Real full CRUD incl. production recording |
| Recipes | Real CRUD, base ingredients only (see Dead ends — variant/addon groups) |
| Expense Heads & Entries | Real CRUD |
| Promo Codes | Real CRUD (deactivate is one-way — see Dead ends) |
| Dashboard | Real settled-order stats (last 90 days), real-date range picker scoped to this page |
| Reservations | Real load + create via `reservationApi` (cloud-routed, not local-exe — see its own comment in api.ts). This table's "Dead end" entry below was stale as of 2026-09-02 — reservations were wired at some point after that entry was written and the entry was never removed |
| Cash Sessions | Real open/close/movement + load via `cashSessionApi` (ported to the Local EXE — see loadCashSessionsFromServer's own comment). Also stale below for the same reason as Reservations |
| Reports — 7 of 13 | day-wise-sales, item-wise-sales, category-wise-sales, payment-mode, tax-report, discount-report, **and kot-report** (also stale below) via real report endpoints |
| Reports — 6 of 13 (no dedicated endpoint needed, but real data) | cash-session, table-performance, staff-performance, expense-report, purchase-report, closing-stock all compute from other already-backend-synced store data (orders, cash sessions, expenses, etc.) rather than a dedicated `/report/*` call — genuinely real, not mock, just derived client-side |
| Multi Menu (menu catalogues) | Real full CRUD as of 2026-09-02 — new `MenuCatalog` model + migration + endpoints built in both `uat-backend-v2` and `billerpe-local-exe` (was local-only before; see task 10 in that session's work) |

---

## ⛔ Confirmed dead ends

No further work planned unless the user explicitly authorizes new backend capability.

**Reservations, Cash Sessions and kot-report were wrongly listed here as dead ends** in an
earlier version of this file — all three were verified real and moved to the "Already wired"
table above on 2026-09-02. Whatever backend work un-blocked them (not captured in this file at
the time) already landed; nothing further needed for them.

| Module | Why |
|---|---|
| Rich Permissions editor (role-level defaults) | Backend only has coarse per-user CRUD flags across 10 areas, one flat set of booleans per user — no role-level default-permission concept exists, and no way to distinguish "custom override" from "role default" at all. Per-user overrides *within* those 10 areas do now persist (`updateUserPermissionOverrides`/`upsertUser`'s `access_name` payload, fixed 2026-09-02) - the still-missing piece is the 7 special permissions and 13 modules with no backend-area equivalent (menu items, keyboard-billing, kds, permissions, cash-session, stock-transactions/-recipes/-reports, ops-*, system, audit-log), plus role-level default editing itself (`updateRoleDefaults`/`updateRoleSpecialDefaults`) |
| Payment Modes config | No payment-mode master/config model anywhere in the backend |
| Delivery/Packaging charge rules | No rule-engine config or bill-inclusion logic on the backend at all |
| ~~Approval Rules (discount thresholds)~~ | No discount-approval-by-role config existed. Rather than build one, the underlying `orders.applyDiscountOverThreshold` permission concept was removed entirely from the app (types, role defaults, permission editor) on 2026-09-02, per explicit product decision — not applicable anymore, nothing to wire |
| Requisitions | Closest backend match (Franchise Orders) is a different business domain — franchise-outlet-to-merchant-hub ordering, requires a `merchant_id` this app has no UI to select |
| Reopen a settled order | No endpoint anywhere resets `payment` back to `pending`; `settleBills` only ever operates on `payment:"pending"` rows |
| Notification settings (`toggleNotificationSetting`) | No per-hotel, per-trigger, per-channel config exists anywhere. WhatsApp sends are hardcoded at fixed call sites in `smsService.js` with no on/off flag; SMS sending itself is dead/commented-out code; the only adjacent "config" (`autoReplyConfig` in the WhatsApp agent controller) is a global, in-memory, superadmin-only chat auto-reply toggle, unrelated to the 6 seeded triggers (Order settled, KOT ready, Low stock, Sync failure, Cash variance, Reservation reminder). `RestaurantSetting` has no channel-toggle columns either |

---

## 🔲 Remaining modules

Ordered roughly by value vs. effort. Pick up top-down unless you want something specific.

### 1. 🔲 Online Orders (Zomato/Swiggy aggregator)
Real backend feature (`routes/zomato.js`, `controller/zomotoSwiggy.js` — webhook intake,
KOT/bill generation, order status sync) but **no frontend screen exists for it at all**.
Not a "wire the mock" task — this is a net-new feature: an aggregator-order queue/KDS
integration screen.
**Next step:** scope as its own project if wanted — this is bigger than everything else
in this plan combined. Don't fold into a single slice.

### 2. ✅ Reports — date-range picker (done 2026-08-26, frontend commit `d46b420`)
Added Dashboard's Today/Yesterday/7d/30d/Custom range control (extracted to `mock/format.ts`
so both screens share it) to the Reports hub, wired into the 6 remote report types plus
expense-report (the one local report with real date-bearing data). closing-stock (point-in-
time, no history) and purchase-report (`PurchaseOrder.date` isn't real backend data) stay
unfiltered by design. Decided **not** to remove the 4 dead-end report types from the hub -
matches this whole migration's existing precedent (Reservations, Cash Sessions, etc. are
still in nav too; "dead end" means no further wiring, not removal from the UI).

### 3. ✅ Real backend fixes (done 2026-08-25, backend commit `0e29291`)
- Fixed: `getSingleOrderForAdminCart`/`editOrderClick` missing `hotel_id` filter (real
  cross-tenant order read/edit leak), `editExpenseHead` missing `hotel_id` on both its
  lookup and update (real cross-tenant write bug, worse than first documented) plus its
  missing duplicate-name recheck, `PromoCode` duplicate-check missing `hotel_id`, the
  5-site Puppeteer `origin === "http://localhost:3000"` launch hack (now `CHROME_PATH`
  env var, matching `generatePdf.js`'s existing convention), and `EBillCreditDebit.orderId`
  being commented out of the model (added a defensive migration + uncommented the field).
- Still open: guest count has no column anywhere on `Order` — if guest-count accuracy in
  Dashboard/Reports matters, this needs a real migration (small, additive: one nullable
  column, no redesign).
- Note: the local dev DB (`DATABASE_NAME=live_backup1`) appears to be a restored backup of
  live production data, not synthetic seed data — worth being aware of before any further
  live-curl testing that touches real records.

---

## How to pick up a step

1. Read the relevant backend controller/route/model in full — don't skim.
2. Verify the exact request/response shape live via curl against the running dev backend.
3. Wire `api.ts` → `store.tsx` (mapper + loader + rewritten action) → the route/component.
4. `npx tsc --noEmit` and `npx eslint --fix` clean on every touched file.
5. Live-verify the real endpoint(s) again against the finished code's exact payload shape.
6. Commit with a message documenting what's real, what's simplified, and any backend bug
   found along the way.
7. Update this file's status table.
