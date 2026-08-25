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
| Reports — 6 of 13 | day-wise-sales, item-wise-sales, category-wise-sales, payment-mode, tax-report, discount-report via real report endpoints |
| Reports — 3 of 13 (no dedicated endpoint needed) | expense-report, purchase-report, closing-stock already read fully-synced store data |

---

## ⛔ Confirmed dead ends

No further work planned unless the user explicitly authorizes new backend capability.

| Module | Why |
|---|---|
| Reservations | Backend controller references columns (`vacant`, `tableNumber`) that no longer exist on the current `Table` schema — dead/broken legacy code |
| Cash Sessions | No `hotel_id`, no status, no cashier reference on the model; zero controller/route code touches it |
| Rich Permissions editor | Backend only has coarse per-user CRUD flags across 10 areas — no role-level default-permission concept exists |
| Payment Modes config | No payment-mode master/config model anywhere in the backend |
| Delivery/Packaging charge rules | No rule-engine config or bill-inclusion logic on the backend at all |
| Approval Rules (discount thresholds) | No discount-approval-by-role config exists; only unrelated CRM/superadmin "approval" concepts |
| Requisitions | Closest backend match (Franchise Orders) is a different business domain — franchise-outlet-to-merchant-hub ordering, requires a `merchant_id` this app has no UI to select |
| Reopen a settled order | No endpoint anywhere resets `payment` back to `pending`; `settleBills` only ever operates on `payment:"pending"` rows |
| Reports — 4 of 13 (cash-session, table-performance, staff-performance, kot-report) | No dedicated backend report endpoint for any of these |

---

## 🔲 Remaining modules

Ordered roughly by value vs. effort. Pick up top-down unless you want something specific.

### 1. 🔍 Notification settings (`toggleNotificationSetting`)
WhatsApp/SMS/in-app trigger config, currently local-only. Backend has `smsService.js` and
a WhatsApp agent controller — real capability plausible but unconfirmed.
**Next step:** read those controllers, find the actual trigger-config endpoint (if any),
verify live.

### 2. 🔍 Table merge / transfer (`mergeTables`, `transferTable`)
Currently local-only. No merge/transfer endpoint found in `controller/table.js` on a first
pass, but not exhaustively checked.
**Next step:** re-read `controller/table.js` in full for anything resembling this; if
nothing exists, this becomes a dead end (would need new backend work).

### 3. 🔲 Online Orders (Zomato/Swiggy aggregator)
Real backend feature (`routes/zomato.js`, `controller/zomotoSwiggy.js` — webhook intake,
KOT/bill generation, order status sync) but **no frontend screen exists for it at all**.
Not a "wire the mock" task — this is a net-new feature: an aggregator-order queue/KDS
integration screen.
**Next step:** scope as its own project if wanted — this is bigger than everything else
in this plan combined. Don't fold into a single slice.

### 4. 🔲 Reports — remaining polish
The 9 "wired" report types were built against a fixed 90-day-style window with no picker.
Consider whether Dashboard-style range controls belong on the Reports hub too, and whether
the 4 dead-end report types (cash-session, table-performance, staff-performance, kot-report)
should be quietly removed from the hub's list rather than left pointing at local-only data.

### 5. 🔲 Real backend fixes worth doing regardless of frontend work
Found and documented this session, not yet fixed on the backend (all narrow, targeted —
no schema redesign):
- `generateInvoicePDF`'s Puppeteer launch path is hardcoded to `origin === "http://localhost:3000"`
  with a Linux-only fallback — breaks for every real origin on a Windows deploy, and is
  fragile even on Linux. Should key off `NODE_ENV` or an explicit config flag instead.
- `PromoCode`/`ExpenseHead` duplicate-check queries in `discountPromocode.js` are missing
  `hotel_id` scoping — a real cross-tenant bug (one hotel's promo code blocks another
  hotel's identical code).
- `getSingleOrderForAdminCart` and `editOrderClick` (`controller/order.js`/`kto.js`) fetch
  `Order.findOne` with no `hotel_id` filter — real cross-tenant data leaks.
- `EBillCreditDebit.orderId` column is commented out of the model — every e-bill debit
  ledger row silently drops which order it was for.
- Guest count has no column anywhere on `Order` — if guest-count accuracy in
  Dashboard/Reports matters, this needs a real migration (small, additive: one nullable
  column, no redesign).

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
