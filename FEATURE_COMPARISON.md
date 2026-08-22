# BillerPe POS — Feature Comparison

**Old (production):** `D:\hardik\UAT-Billerpe\Billerpe\Billerpe\POS\uat-frontend` — CRA/craco, React 18, real backend, sockets, printing, payments, i18n.
**New (this repo):** `billerpe-pos-pro` — TanStack Start, React 19, UI redesign running entirely on in-memory mock data (`src/mock/store.tsx`). No backend, no auth, no sockets, no real printing/payments/export.

This doc catalogs what the old app actually does (read from its real component code, not just route names) against what the new design actually implements, so the gap list is concrete rather than guessed from filenames. Scope is the **merchant/restaurant-admin portal** on both sides — the old app's separate `/superAdmin/*` portal (multi-restaurant SaaS ops: onboarding, subscriptions, WhatsApp agent, CRM) has no counterpart in the new design and is treated as **out of scope**, not a gap.

---

## 1. How to read this doc

- ✅ **Present & equivalent** — new design covers the old feature, roughly at parity.
- 🟡 **Present but thinner** — new design has the screen, but with materially less depth than old.
- ⚪ **Present but not wired** — new design has the UI, but it's decorative (local state only, no store mutation, or a dead button).
- ❌ **Missing** — no screen or workflow for this in the new design at all.
- 🧟 **Old-app-only oddity** — exists in old, but broken/dormant/stub there too — not necessarily a gap to fill, just noted for context.

---

## 2. Architecture & platform gaps (cross-cutting)

These aren't per-page features — they're infrastructure the whole old app depends on that the new design doesn't attempt to model yet (reasonably, since it's a front-end-only prototype):

| Capability | Old app | New prototype |
|---|---|---|
| Backend / persistence | Real API (`/checkHotelLogin`, `/paginateOrder`, etc.), AES-encrypted payloads | None — `StoreProvider` context seeded from `src/mock/data.ts`, resets on reload except a `localStorage` login flag |
| Real-time updates | `socket.io-client`, hotel-scoped connection + separate `/kds` namespace/room per kitchen; drives Biller refresh, live menu push, KDS ticket flow, online-order ingestion | None — "connection state" in the header is a manual demo switcher (dropdown), not a real network monitor; KDS updates only when the local store mutates |
| Offline mode | IndexedDB (`restaurant-db`, 13+ stores), service worker, queued offline order creation/edit/delete/reprint, `-OFF` suffix on synced offline orders | Simulated only — `/system` has a "Sync Center" with fake `setTimeout` sync/retry and a manually-triggerable `offline-limit-exceeded` state that blocks transactions; nothing persists offline |
| Printing | JSPrintManager (local WebSocket print client) **or** a "Local Bridge" HTTP POST to `localhost:7878/print-html`; server-rendered invoice PDF; thermal-width-aware, multi-language (Gujarati/Hindi/Latin font stack) receipt HTML builder | `/operations/printers` is config-only (assign role, "Test" = toast, no real spooling); Order Detail's "Reprint" and "Share" are both `toast.success()` stubs |
| Payments (subscription/checkout) | `@cashfreepayments/cashfree-js` checkout for subscription renewal | Not modeled — no subscription/billing concept in the new design at all |
| i18n | `i18next` + `en/gu/hi` locale files, wired through nearly every component | English only, no i18n library in the stack |
| File export | `exceljs` (Expense, Customer Data, Purchase Orders), `jspdf` (QR download) | Reports page has an **Export button with no click handler** — dead UI, no export exists anywhere |
| Sound alerts | `use-sound` for table-time-exceeded alarm; plain `Audio` for new-KDS-order alert (`mp3/2.mp3`) | None |
| Multi-outlet switching | Exists only in the legacy `/merchant/*` portal (`MerchantContext`) — one login, multiple hotels | Not modeled — single restaurant only |
| Permission enforcement | Real per-module `{read,create,edit,delete}` matrix stored in IndexedDB, checked before rendering nav items and before mutating actions | `/users` renders a **static reference table** of what each role "should" access — not actually enforced anywhere at runtime |

---

## 3. Navigation / IA comparison

**Old app sidebar** (from `VerticalSideBar.js` + `App.js` routes), permission-gated per section:
Dashboard · Biller (POS billing) · Orders · Menu (Items/Categories/Variants/Addons/Menu Setting) · Table & Room (Categories, Table, Room) · [Table Booking — dormant] · Users · Reports (Sales/Item/Stock/Expense/Payment/Discount) · Expense (Entries/Head) · Stock (Dashboard/Purchase/Raw Material/Recipes/Units/Suppliers/Stock In-Out/Wastage/Semi-Finished/Warehouse Order) · Operations hub (Display/Kitchen Settings/Printer/Invoice/QR/Due Payment/Calculation/Discount-Promo/Customer Data/Tax Config/Menu Setting) · KDS · Help · Raise Ticket · What's New

**New app nav** (`AppShell.tsx` `NAV` const):
Dashboard · Biller (`/table-grid`) · Kitchen Display · Orders · Menu (Categories/Items/Variants/Addons) · Table (Table Category/Manage Table/Reservations) · Manage Users · Reports · Expense (Head/Entry) · Stock · Opening & Closing (cash session) · Operations · Profile · Help *(Raise Ticket and Audit Log are account-menu-only, not in the main rail)*

Structurally close — the new app mirrors the old IA well at the top level. The differences are in **depth per section** (below) and in a few **whole sections that don't exist yet**: standalone Customer Data/CRM, Tax Configuration, Invoice Format designer, QR Code download, Discount & Promo Code master, Due Payment (management, not report), Calculation (service charge rules), Kitchen Settings (routing config), What's New.

---

## 4. Module-by-module comparison

### Dashboard
| | Old | New |
|---|---|---|
| Date filter | Today/Yesterday/Last week/Last 30 days + custom range, business-day-aware (respects `hotel.startTime`, not midnight) | ❌ none — always shows a fixed mock window |
| KPIs | Total sale, invoices, dine-in sale, pickup sale, card/cash/UPI/due totals, Zomato/online sale, expense total, money-in, profit/loss % | 🟡 Net sales, bills settled+covers, avg bill, running orders — narrower set, and the "+12.4% vs yesterday" delta is a **hardcoded string, not computed** |
| Charts | "Most Order Items" bar chart (real data), order-type polar chart (pickup/dine-in split) | 🟡 7-day sales trend and hourly order flow are both **static mock arrays**, not derived from `store.orders`; "Kitchen load" (open KOT count per station) *is* live |
| Other | E-bill credit balance, live table/order counts | Low-stock alert list, live-orders table (both live) |

### Menu Management
| | Old | New |
|---|---|---|
| Items | `item_name`, category, price, **shortCode/SKU**, **`gst_type` (Goods/Services)**, **5-way dietary classification** (veg/jain/non-veg/vegan/swaminarayan), barcode, description, favorite, **image**, variant multi-select, addon-group multi-select, bulk select+delete | 🟡 Full CRUD but only: name, category, kitchen station, price, Veg toggle, Favourite, Active. **No image field, no SKU/barcode, no GST-type, no jain/vegan/swaminarayan classes, no per-item variant/addon attachment UI** (variants/addons are baked into seed data, not editable per item) |
| Categories | name + manual rank/sort order | ✅ name + Active toggle, live item-count |
| Variants | `variants_name` + active, full CRUD | ⚪ **read-only** master list, no add/edit/delete |
| Addons | Addon *departments* with min/max selectable, single/multi selection mode, per-addon veg/non-veg attribute, full CRUD | ⚪ **read-only** viewer of addon groups, no CRUD |
| Menu Setting | Dedicated screen: toggle whole-Biller between "with image" / "without image" grid | ❌ no dedicated screen (a similar toggle exists but only inside Operations → Display Settings, and it's not wired — see §6) |
| Kitchen routing | Indirect, via Kitchen Settings (category→kitchen map) *and* Printer Assign (category→printer map) — two overlapping mechanisms | ✅ simpler: a direct `station` field per item drives KOT routing (arguably a design improvement over old's two overlapping systems) |

### Tables / Rooms / Reservations
| | Old | New |
|---|---|---|
| Categories | name only, separately for Table type and Room type | ✅ name + sort order, one unified category list |
| Table/Room CRUD | **Bulk range creation** (`startNo`–`endNo` → auto-generates a numbered sequence) | 🟡 one-at-a-time only, no bulk/range creation |
| Rooms as distinct entity | Table and Room are the same component keyed by a `type: "T"|"R"` field — genuinely separate hotel-room inventory | ❌ no separate "Room" concept — table categories like "Lodging Room"/"AC Delux Rooms" exist as *table* categories only, no room-specific fields (check-in/out, etc.) |
| Reservation/Booking | 🧟 **Fully built** (customer info, date, start/end time picker, advance payment, multi-table select, edit/cancel) but its **route and nav are commented out** in `App.js` — dormant, invisible to users today | ✅ **New design actually ships this** — `/reservations` with list+calendar view, party size, table select, release mode; more complete/live than old app's *current build* (though old's dormant version has fields new lacks: advance payment, GST, email) |
| Floor/grid view | Not clearly a first-class "table grid" screen in old (table selection happens inside Biller) | ✅ New has a dedicated animated Table Grid with status filters, merge/transfer, elapsed timers — an upgrade over old's approach |
| Merge/Transfer | "Move KOT" (shift items between tables) and "Move Table" (relocate whole order) exist in Biller | ✅ equivalent `mergeTables`/`transferTable`, live-wired |

### Biller / POS Billing (order-building)
This is the single largest screen in the old app (~8,300 lines) — the new prototype's `table-grid/order/$orderId` is its closest analog and is genuinely full-featured, but several old capabilities have no equivalent:

| | Old | New |
|---|---|---|
| Order types | Dine-in, Pickup (Delivery/Zomato come in as a separate online-order feed, not a Biller order type) | ✅ comparable (dine-in via table, pickup via "New Pickup") |
| Item/variant/addon selection | ✅ | ✅ equivalent, with min/max/single-select enforcement |
| Custom / on-the-fly item | ✅ manual name+price line for one-off charges | ❌ not found — no "add custom item" affordance |
| Per-line comment | ✅ free-text comment attached to a line, shown on KOT/KDS | 🟡 new has a per-line "kitchen note" at add-time via the config dialog, roughly equivalent |
| Discount | Percent or fixed, **discount reason** field, line-level *and* order-level, server-side over-discount guard | ✅ percent/flat, auto-flags approval above threshold, audit-logged — no explicit "reason" field found in the dialog though |
| Promo codes | ✅ dedicated Discount & Promo Code master, applied at checkout | ❌ no promo code concept anywhere in new design |
| Tax calc | Per-item `gst_type`, tax scoped by order-type/item/table-category via Tax Configuration | 🟡 flat CGST/SGST from a single `RESTAURANT.cgst/sgst` — no per-item/per-category tax override |
| Service charge | Configurable (fixed/%, auto-apply by order type, threshold trigger) via Calculation settings | ❌ no service-charge concept in new design at all |
| Payment / settle | 4-way simultaneous split (Cash+Card+UPI+Due), inline UPI QR at checkout, **Due as first-class method feeding a settlement workflow** | ✅ split settle dialog with balance-must-match guard; Due is a payment mode but there's **no standalone Due Payment management screen** to later settle it (see Operations gaps) |
| Retrieve/resume order | ✅ rebuild cart from a held/KOT order | ✅ equivalent (Hold/Save + reopening from table grid or orders list) |
| E-bill (SMS/WhatsApp send + credit balance) | ✅ with low-credit block | ❌ "Share on WhatsApp" is a toast-only stub, no credit-balance concept |
| Stock-level warning at add-to-cart | ✅ warns if linked raw material is low | ❌ not found |
| Table time-over alert | ✅ countdown + sound alarm when a table exceeds its allotted duration | ❌ not present (Table Grid shows elapsed time, but no threshold alarm) |
| KOT edit after firing | ✅ decrease/remove a fired KOT line, live-reflected on KDS | Not confirmed in the new prototype's cart screen — lines show "New — not sent" vs "KOT n" badges, but no explicit post-fire decrease/remove action was found |

### Orders & Order Detail
| | Old | New |
|---|---|---|
| List | Server-paginated, search by order number, bulk multi-select+delete, "Timeline" audit view per order, admin-only bill-number resequencing tool | 🟡 search + status filter, no pagination/bulk-delete/resequencing (reasonable for a mock dataset), but there **is** a global Audit Log (`/system/audit-log`) that substitutes for per-order Timeline reasonably well |
| Detail | Full item/tax/discount/payment breakdown | ✅ equivalent, plus KOT trail list |
| Reprint/Share | Real JSPM/local-bridge print, real WhatsApp e-bill send | ⚪ both are toast-only stubs (expected, given no printing/messaging integration exists yet) |

### Kitchen Display (KDS)
| | Old | New |
|---|---|---|
| Kitchen routing | Named "kitchens" mapped to table/category/order-type, each with its own `/kds/:kitchenId` screen and socket room | 🟡 single KDS screen with **station filter chips** (Kitchen/Tandoor/Chinese/…) instead of per-kitchen dedicated screens/URLs — functionally similar but not multi-screen-deployable in the same way |
| Real-time | Live socket events (`newOrder`, `orderUpdate`, `readyKot`, item-level cancel/decrease reflected instantly) + sound alert | ❌ no real-time; board only changes when *you* mutate the store; no sound |
| Per-unit ready toggling | ✅ for qty>1 lines, mark individual units ready independently | ❌ not found — new only advances the whole ticket through one status at a time |
| Recall KOT (searchable history of completed tickets) | ✅ dedicated sidebar view | ❌ not present — "Served" tickets simply disappear from the board with nowhere to look them up |
| Status flow | Explicit legend, per-kitchen filtering | ✅ New/Accepted/Preparing/Ready lanes with amber/red elapsed-time warnings — a nice addition old doesn't have |

### Stock / Inventory
Old's `Inventory.js` hub is the single biggest module in the whole app — far more than the route list suggests:

| Old sub-module | New equivalent |
|---|---|
| Inventory Dashboard | ✅ `/stock` hub stat cards (valuation, low-stock, open POs) |
| Purchase Orders — full workflow (supplier, GST, partial-payment tracking with payment history, discount, delivery charge, Excel export) | 🟡 `/stock/purchases` — **view + Receive only**; no "Create PO" screen, no payment tracking, no Excel export (`upsertPurchaseOrder` exists in the mock store but no route calls it) |
| Raw Material master (purchase unit, consumption unit, conversion factor, low-stock threshold) | ⚪ `/stock/raw-materials` is **read-only** — `store.upsertRawMaterial` exists but is unreachable from any screen |
| Recipes — **per-variant and per-addon recipes**, multi-level BOM (can reference semi-finished items) | 🟡 `/stock/recipes` is **read-only** cards, flat BOM only, no per-variant/per-addon consumption, no CRUD |
| Units of Measure master | ❌ no dedicated Units screen |
| Supplier master | ⚪ `/stock/suppliers` read-only, `upsertSupplier` unreachable |
| Stock In/Out (manual adjustment) | ❌ this is exactly the "Stock Adjustment" module new explicitly marks **pending** ("no confirmed business rule") |
| Wastage | ✅ equivalent, live-wired (record wastage, deducts stock) |
| Semi-Finished Items (production batches) | ✅ equivalent, live-wired ("Produce" button, deducts components/adds stock) |
| Warehouse Order (central-warehouse ordering for franchises) | ❌ not modeled — reasonable, this is a multi-outlet-only feature |
| Negative stock policy | n/a in old (no explicit toggle found) | 🧟 new explicitly stubs this as **pending**, same as Stock Transfer |
| Stock Transfer (between locations) | n/a (old is single-location) | 🧟 explicitly marked **pending** in new — makes sense, ties to the missing multi-outlet concept |

### Expense
| | Old | New |
|---|---|---|
| Entries | Same form doubles as **expense AND "Money In"** entry (toggle), Excel export, date-range filters | 🟡 New only models expense entries, no "Money In" concept, no export |
| Heads | ✅ equivalent CRUD | ✅ equivalent |
| Cash-session tie-in | Not explicit in old (expense is separate from a "cash drawer" concept — old doesn't appear to have an Opening/Closing cash-session module at all) | ✅ **new is actually ahead here** — `/cash-session` (open/close float, variance calc, cash movements) is a fully-wired module with **no old-app equivalent found** |

### Reports
Old advertises ~21 report routes; the audit found **6 are literal stubs and 1 more fetches data but never renders it** (all concentrated in Stock and Expense-detail categories — which is exactly why the old Reports hub UI hides those two category tabs). New ships **13 reports, and all 13 are genuinely implemented** (bespoke aggregation logic per report, not a generic fallback) — so despite the smaller count, new's report coverage is **more reliable, if narrower**, than old's advertised-but-broken 21.

Report types in old with **no equivalent** in new's 13:
- POS Collection, Growth Report, All Order Type, Executive Sales (combined dashboard), User/Biller-Wise Sales *(new's "Staff Performance" is a partial substitute)*
- Highest Selling Items, Day-Wise Item Sales *(new's "Item Wise Sales" partially substitutes)*
- Current Stock, Stock Summary *(both were stubs in old anyway — 🧟)*, Order-Wise Consumption *(stub in old — 🧟)*
- Money In Report, Expense-By Report *(both stubs in old — 🧟)*
- Received Due Report *(distinct from new's Cash Session report)*
- Item-Wise Sales at `/item/2` was a stub/orphan in old — 🧟, not a real gap

New report types with **no old equivalent**: Payment Mode Report, Table Performance — both reasonable new additions.

Both apps have a **non-functional Export button** in some form (old: real Excel export in some report screens but not others; new: Export button exists with no handler at all) — worth deciding this deliberately rather than shipping a dead button.

### User Management
| | Old | New |
|---|---|---|
| Fields | name, email, mobile, role, active, password, **full per-module CRUD permission checkbox grid** (10 modules × 4 actions) | 🟡 name, mobile, 4-digit PIN, email, role (7 fixed roles), active — **no per-module permission editor**; a static reference table describes what each role "should" get, but it's copy text, not a configurable/enforced matrix |
| Enforcement | Real — nav and actions are gated by the stored permission matrix | ❌ not enforced anywhere at runtime in the new prototype |

### Operations / Settings umbrella
Old's `/operations` is a pure navigation hub to: Display Setting, Kitchen Settings, Printer, Invoice Format, QR Code, Due Payment, Calculation, Discount & Promo Code, Customer Data, Tax Configuration, Menu Setting.

New's `/operations` hub explicitly ships 7 of these and explicitly defers the rest — this is the clearest, most self-aware gap list already written into the product:

| New's "live" 7 | Maps to old |
|---|---|
| Printer Settings | 🟡 thinner — edit-only (Role select per existing printer), no "Add printer", no table/category/order-type routing assignment, no real print detection |
| Display Settings | ⚪ **not wired** — 6 toggles held in local `useState`, don't actually affect Table Grid/Order screens despite claiming to |
| Delivery & Packaging | ✅ live-wired (old has no direct equivalent — closest is Calculation's threshold-based service charge, a different concept) |
| Approval Matrix | ✅ new concept, no old equivalent (old has no discount-approval workflow — any biller can apply any discount) |
| Local Server & Sync | ✅ new concept substituting for old's real socket/offline infra, but simulated |
| Audit Log | ✅ new concept, no old equivalent (old has no centralized change log) |
| Notification Settings | ✅ new concept, no old equivalent |

New's `/operations` hub **explicitly lists as deferred**: Multi Outlet, Central Kitchen, QR Ordering, Loyalty Program, Membership, Wallet & Gift Card, Owner Mobile App, Purchase Approval Workflow, AI Insights — none of which existed in old either except Multi-Outlet (old has it only in the legacy `/merchant/*` portal).

**Old features with genuinely no home anywhere in the new IA:**
- ❌ **Customer Data / CRM** — old has a real customer master (name/phone/address/GSTIN, searchable, exportable) that auto-fills Biller for returning customers. New only has `customers` as background mock data (used to prefill the "attach customer" quick-picks in the order screen) — **no dedicated Customers page**.
- ❌ **Tax Configuration** — old lets tax rates be scoped per order-type/item/table-category. New has a single flat CGST/SGST rate baked into `RESTAURANT` config, no settings screen.
- ❌ **Invoice Format designer** — old's 10-line configurable header/footer + live preview + placeholder tokens has no counterpart.
- ❌ **QR Code download** (for the public digital-menu page) — no counterpart; new also has no public digital-menu page to link to.
- ❌ **Discount & Promo Code master** — see Biller section above.
- ❌ **Due Payment (management screen)** — old lets staff search outstanding dues and settle them (individually or bulk); new only has a Due Payment *report* concept folded into other reports, no action screen.
- ❌ **Calculation / Service Charge rules** — no service-charge concept in new at all.
- ❌ **Kitchen Settings** (named-kitchen → table/category/order-type routing) — superseded by new's simpler per-item `station` field, which is arguably cleaner but loses the "route by table" and "route by order type" dimensions.
- ❌ **What's New / changelog page** — cosmetic, low priority.

### Help / Support
| | Old | New |
|---|---|---|
| Help | Static shortcuts + table-status legend | ✅ static contact cards + FAQ accordion (more content, still static) |
| Raise Ticket | Real ticket system: type+message+image/video attachment, 5-star resolution rating, persisted history | 🟡 form is richer (subject/category/priority/details/auto-attached context) but the ticket list is **local `useState` only** — vanishes on reload, no attachments, no rating |

### Profile
Old's Profile page is a **non-functional stub** (🧟 inputs render but have no save handler — a real bug in the old app). New's Profile page is **partially wired** (Name/Mobile/Email/PIN save individually on blur) plus a redundant "Save changes" button that only toasts — so new is actually ahead of old here, though the redundant button is worth cleaning up.

---

## 5. New prototype's own internal gaps (not vs. old — just worth knowing)

Since this was flagged during the audit and matters for anyone building on top of this design: several screens in the new app **look interactive but aren't actually wired to the mock store**, independent of the old-app comparison:

- **Menu Variants & Addons pages** — read-only viewers, no CRUD, despite sitting in the main nav like configurable screens.
- **Stock → Raw Materials, Suppliers pages** — read-only; the store already has `upsertRawMaterial`/`upsertSupplier` mutators, just no UI calls them.
- **Stock → Purchases** — can Receive an existing PO but can't create one (`upsertPurchaseOrder` unused).
- **Stock → Recipes** — read-only, no CRUD.
- **Operations → Display Settings** — 6 toggles are local `useState` only, don't affect any other screen despite the copy claiming they do.
- **Reports → Export button** — no click handler at all.
- **Order Detail → Reprint / Share** — toast-only stubs.
- **Operations → Printers → Test** — toast-only, no real print.
- **Raise Ticket** — ticket list resets on navigation (local state, not store-backed).
- **Reservations → release mode** — `Auto`/`Manual` grace-period is stored per reservation but **no timer ever enforces it** (dead field).
- **Users page permission matrix** — display-only reference text, not an editable/enforced system.
- Three Stock modules (**Stock Adjustment, Negative Stock Policy, Stock Transfer**) are explicitly, deliberately left as a "pending decision" banner rather than an invented workflow — this is intentional scoping, not an oversight, and is the one gap category the app itself already flags honestly.

---

## 6. Summary punch list (highest-value gaps to close first)

Roughly ordered by how central the feature is to daily restaurant operation:

1. **Tax configuration** (per-item/category tax scoping) and **service charge rules** — both directly affect every bill's total and are currently hardcoded/absent.
2. **Customer Data / CRM screen** — the data model already exists (`store.customers`), just needs a page; also drives repeat-customer autofill.
3. **Due Payment management screen** — settling outstanding dues is a daily cashier task in the old app; today new only has scattered report views.
4. **Wire up the read-only Stock screens** (Raw Materials, Suppliers, Purchases-create, Recipes) — the mutators already exist in the store, this is UI work, not data-model work.
5. **Discount & Promo Code master** — old treats this as core billing functionality.
6. **Menu item depth** — image, SKU/barcode, GST type, dietary classes beyond veg/non-veg, and per-item variant/addon attachment.
7. **Invoice format customization** — merchants in the old app configure their own receipt layout; currently fixed in new.
8. **Wire or remove decorative screens** — Display Settings toggles, Reports Export button, Printer Test, Reprint/Share stubs — these currently look functional and aren't, which is worse than not having them.
9. **KDS: per-unit ready toggling and Recall KOT history** — old kitchen staff rely on both for high-volume services.
10. Decide deliberately (rather than by omission) on: Room-type inventory distinct from tables, Service Charge, Custom/one-off line items in the cart, Table time-over alerts, E-bill/WhatsApp credit system.

Everything under **§2 (Architecture)** — real backend, sockets, offline/IndexedDB, real printing, payments, i18n, exports — is expected to come later as this moves from design prototype to integrated build, and isn't a "missing feature" so much as the next phase of work.
