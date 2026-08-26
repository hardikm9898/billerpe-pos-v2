# Biller / Billing Screen — Old vs. New (v2) Feature Comparison

Scope: **only** the order-building/billing screens — old app's `Biller.js` (8,296 lines) +
`KeyBoardDisplay.js`/`TouchDisplay.js` + `PaymentMode.js`/`Avatar.js`/`PreparationTime.js`/
`SearchItems.js`/`StopWatch.js`/`TableItem.js`/`TableTimeOver.js` + the offline service layer
`Services.js/Biller.js`, against new's `_shell.table-grid.order.$orderId.tsx` +
`components/billing/keyboard-display.tsx` + the relevant `mock/store.tsx` cart/KOT/bill/settle
actions. Every line of the old files was read directly (not inferred from docs) to produce this.
The rest of the app (Menu, Stock, Reports, etc.) is already covered by the broader, older
`billerpe-pos-pro/FEATURE_COMPARISON.md` — not repeated here.

**Why this matters:** new (v2) is now wired to a real backend (this migration's whole point), so
it's ahead of old in some ways (real merge/transfer, real e-bill credit gating, live addon qty)
and behind in others (no offline mode at all — expected, out of scope). The list below is about
**billing-flow feature parity**, not architecture.

## Legend
- ✅ Present & equivalent
- 🟡 Present but thinner/simplified than old
- ⚪ Present in UI but not fully wired
- ❌ Missing entirely in new
- 🆕 New in v2 with no old-app equivalent (real improvement, not a gap)
- 🐛 Old-app bug/inconsistency, documented so it's not accidentally "faithfully" reproduced

---

## 1. Item entry, search, shortcuts

| | Old | New (v2) |
|---|---|---|
| Two distinct entry UIs | `KeyBoardDisplay` (search-select + qty-then-Enter, single column) vs `TouchDisplay` (product grid, tap-adds-qty-1, two separate name/shortcode search boxes) | 🟡 New has the same two-screen split (`keyboard-display.tsx` vs `table-grid.order.$orderId.tsx`'s grid), but the grid screen taps-to-add like old's TouchDisplay while `keyboard-display.tsx` is closer to old's KeyBoardDisplay — reasonable match, though new's grid screen has no dedicated shortcode-only search box (one combined search input) |
| Barcode scanning | Both old screens: 100ms/4-char/300ms-debounce scan-vs-typing heuristic, toast on no-match | 🟡 **Only `keyboard-display.tsx`** has this (same style: gap<60ms fast-typing heuristic, ≥4 chars, ≥3 fast keystrokes); **`table-grid.order.$orderId.tsx` has no barcode handling at all** — old had it on both screens, new has it on only one |
| F-key shortcuts | F2=Save&Print, F3=KOT&Print, F5=Hold (both screens); F4=focus search (KeyBoardDisplay only). 🐛 A `functionCalled` guard means each F-key **only fires once per component mount** — stops working after first use until you navigate away and back | ✅ **Better than old** — `keyboard-display.tsx` has F2/F3/F4/F5 (same mapping) with no once-only bug, reusable indefinitely. ❌ `table-grid.order.$orderId.tsx` has no keyboard shortcuts at all |
| Type-ahead item picker | `react-select`-based, sorted by shortcode, label `"{shortCode}-{item_name}"`, qty auto-focus+select after pick, Enter-to-confirm | ✅ equivalent search-and-add flow in `keyboard-display.tsx`, though matching is substring search rather than a shortcode-sorted dropdown |
| Qty-field Enter-to-next-row | Pressing Enter in a cart row's qty input jumps focus to the next row's qty input (both old screens) | ✅ present in `keyboard-display.tsx` (`data-qty-row`, Arrow/Enter navigation) |
| Custom / one-off item | Name + price form; name validated against `^[A-Za-z0-9\s&.,'()\-\[\]]+$`, price must be `>0` | 🟡 present in `table-grid.order.$orderId.tsx` (name+qty+price form) — only checks `name.trim()` and `price>0`, no character-pattern validation. ❌ Not found in `keyboard-display.tsx` at all |
| Product tiles with image fallback | `Avatar.js` — deterministic color+initials SVG when `foodImage` missing | ❌ not found — new's item tiles don't appear to have an image-with-fallback system (menu items may not carry images at all yet, per the broader `FEATURE_COMPARISON.md`'s "no image field" finding) |

## 2. Cart line management

| | Old | New (v2) |
|---|---|---|
| Qty adjust (not-yet-sent items) | Stepper buttons (Touch) or raw number input (KeyBoard), floors at 1 via decrement (never reaches 0 that way) | ✅ equivalent (`+`/`-` buttons and direct number entry in both screens), and **new additionally lets qty reach 0 → auto-removes the line and frees the table if it was the last item** (see §4) — old has no such table-auto-free behavior |
| Remove line | ✅ | ✅ |
| Per-line note/comment | Free-text, shown on KOT/KDS, matched by item `id` only (🐛 could mis-target when two lines share a base item id with different variants) | ✅ equivalent (`NoteDialog`, matched by unique line id — actually **more correct** than old since it can't cross-target a variant line) |
| Per-line price override | Only for `status:'H'` (not-yet-sent) lines; separate "Reason" field exists in the UI but is 🐛 **never wired to any state** — silently discarded despite being marked required | ✅ equivalent scope (only editable pre-KOT lines), simpler — no reason field at all (so nothing to silently drop) |
| Post-fire (KOT'd) qty decrease | `decriesKotDeliveryqty` — real-time API call, decrements one unit of an already-sent line; requires **both** edit+delete permission, hard-blocks if offline (no fallback) | ❌ **not found in new** — once a line is sent to KOT, new's UI only allows full removal (`removeLine`, itself allowed on any status) or qty edit gated by "not yet sent" (`editable = round > order.kotRounds`); there's no "reduce quantity of an already-fired KOT line by one" affordance distinct from remove |
| Post-fire full removal | `removeFromCartAllQty` — real API call, removes all qty of one item from one KOT round | 🟡 `removeLine`/`changeQty` in new can remove any line regardless of KOT status, but this is **entirely local** — nothing pushes that removal to the backend as an explicit "this KOT-round item was struck" event the way old's dedicated endpoint does. (Whether the backend even reflects a locally-removed-but-already-KOT'd line correctly on next sync wasn't verified as part of this pass.) |
| Variant selection | Full popup: variant list + addon departments, min/max enforcement, single/multi-select, **keyboard nav** (Arrow keys cycle variants, Enter confirms, Escape closes) | 🟡 equivalent variant/addon popup with min/max + single/multi enforcement (added addon **qty** support this session, matching old's per-addon qty concept) — but **no keyboard navigation** (no Arrow/Enter/Escape handling in the config dialog) |
| Addon qty on an existing (already-added) line | ✅ can re-open and adjust (`clickEditAddon`/`saveEditEddon`) | ✅ **now matches** — `AddonDialog` (added this session) lets you edit addons+qty on any not-yet-sent cart line |
| Addon merge-matching when re-adding the same item | Matches by item id + variant id + exact addon-set-and-qty equality (`matchDepartmentsAndAddonsById`) before deciding to merge qty vs. push a new line | 🟡 new's `addLine` merge check compares `JSON.stringify(addons)` for exact equality — functionally similar outcome, less explicit about *why* two addon sets are considered equal (order-sensitive string compare vs. old's structured id+qty comparison) |
| Stock-level warning at add-to-cart | Real API call (`POST /stock/checkStockLevel`, checks **qty:1 only regardless of actual qty**), shows a blocking-style popup with Cancel/Continue-anyway | 🟡 **thinner but arguably better UX** — new shows a local `toast.warning` (non-blocking, item is added either way) computed from already-loaded recipe/raw-material data, no extra round-trip. No override-confirm step exists because nothing is blocked in the first place |

## 3. Discount & tax

| | Old | New (v2) |
|---|---|---|
| Discount scope | **Both** line-level (`discount` field per menu item in cart) and order-level (`applyDiscount`) | ❌ **order-level only** — `store.applyDiscount(orderId, label, amount)` is the only discount action; no per-line discount concept exists in new at all |
| Discount type | Percent (capped 0–100) or fixed (capped at 99,999,999); type change resets the amount to 0 | ✅ percent/flat exists in new's discount dialog, with auto-flag-for-approval above a configured threshold (a genuine **new feature old doesn't have** — old has no discount-approval workflow, any biller can apply any amount) |
| Discount reason | A `discount_reason` field is captured and stored server-side (used on printed invoices) | ❌ **not found** — no reason/note field in new's discount dialog or `applyDiscount` signature |
| Promo codes at checkout | Discount popup has a "Promocode" tab, cards list active codes with inline Apply | 🟡 **inconsistent between new's two screens** — `keyboard-display.tsx`'s discount dialog lists active promo codes with click-to-apply; `table-grid.order.$orderId.tsx`'s discount dialog has **no promo code section at all** |
| Tax calc | Per-item `gst_type` (only "S"-flagged items taxed), optionally scoped by table-category for dine-in, prorated for discount, hardcoded flat 5% GST in several of the calculation-engine variants, fully suppressed if a hotel-level `invoiceFormateIncGst` toggle is off | 🟡 flat CGST/SGST from a single configured rate (`store.taxRules`), no per-item/per-category override — this matches what the broader `FEATURE_COMPARISON.md` already flagged; not re-litigated in depth here since it's not billing-*flow* specific |
| Service charge | Configurable auto-apply rules (by order type, threshold, fixed/%), manual override locks out auto-recalc while a manual value is present | 🟡 new has a service-charge concept (`store.serviceCharge`) — auto-apply/threshold rule parity wasn't re-verified in this pass; worth a follow-up if this becomes a priority |

## 4. Table / order lifecycle

| | Old | New (v2) |
|---|---|---|
| Hold order | ✅ | ✅ |
| Save / KOT / Bill semantics | Save=hold-style persist, KOT=send to kitchen (prints), Bill/Print=finalize+print | ✅ **redefined this session** to: Save=mark items delivered (`generateBill`, no print), Bill Print=same + actually opens the PDF (previously silently skipped printing despite the label) |
| Table auto-frees when cart hits zero | ❌ not found — an emptied table sits in whatever status it was in | 🆕 **new-only improvement** (added this session) — removing the last line auto-cancels the order and frees the table |
| Table shows "occupied" the instant it's opened, before any real action | Yes — old sets a real status via the first API call at table-open time | 🆕 **new is better here too** (fixed this session) — opening a table now stays "Held" (not falsely "Running") until a real action (Hold/KOT/Save/Bill/E-Bill) happens |
| Table time-over alarm | `TableTimeOver.useTableTimer` — 1s poll, plays `/mp3/1.wav` once when a reservation's booked time elapses, persists `timeOver` flag, notifies backend. 🐛 Actually **disconnected** in the current old code (`TableItem.js` imports the hook but its invocation is commented out) — old app currently relies on `order.timeOver` being set by some other path | ❌ **not present at all** — new has no countdown/alarm/booked-duration concept on tables (Table Grid shows elapsed time only, no threshold warning). Since old's own version is dormant, this is a low-priority gap, not an active regression |
| Move Table (transfer) | `POST /moveTable`; blocked if source order status is `'hold'` (🐛 the destination-occupied check has a broken `\|\| 'in-progress'` condition that's always truthy, so it silently ignores the intended "must be hold or in-progress" restriction and merges into *any* pending order on the destination table); destination list excludes payment-pending tables and hides `(1)`-suffixed "child" tables | ✅ **wired this session** to the same real `POST /moveTable` endpoint. New has no "blocked if held" restriction (a `Held` order can be transferred) and no payment-pending-table exclusion in the destination picker — worth deciding whether either old restriction is worth adding |
| Merge Table | Folds one table's order into another's; `moveKotIdb`'s in-file offline variant collapses moved rows into a new round; `moveTableIdb` preserves per-round history | ✅ wired to the same endpoint — the real backend (not new's own code) owns the merge math, so round-history handling matches whatever `controller/table.js#moveTable` actually does server-side |
| Move KOT (single round to another table) | ✅ dedicated `POST /moveKot`, separate from full table move | ❌ **not wired** — new has no per-KOT-round move, only whole-order transfer/merge. `POST /moveKot` exists server-side (confirmed this session) but nothing in new calls it |
| Retrieve/resume a held order | ✅ | ✅ |
| Cancel/void order | ✅ (`discardOrderFromIdb` / online equivalent) — soft-delete, frees table | ✅ equivalent (`cancelOrder`) |

## 5. Payment & settlement

| | Old | New (v2) |
|---|---|---|
| Split payment | Two UI modes: non-split = 4 mutually-exclusive radios that assign the **full amount** to one mode; split = 4 free numeric inputs, no live sum-vs-total validation in the UI itself (validated server-side / on submit) | ✅ new's `PaymentSplitEditor` supports multi-mode split with a live **balance-must-match guard** before allowing settle — stricter/better UX than old's submit-time-only check |
| Due as a payment mode | ✅ first-class, feeds a due-balance lookup (searches by mobile number, auto-populates on 10-digit entry) | ✅ present; new additionally **requires a customer be attached** before settling any portion as Due (a real, sensible guard old doesn't explicitly have) |
| UPI QR at checkout | Live, auto-shown when payment mode is UPI (`hotel.qr_code_open_on_settle`), generates a real `upi://pay?...` scannable QR sized to the actual amount | ❌ **not found in the live settle flow** — new has a QR-code component (`qrcode` package, `upi://pay` URL builder), but it's only used in the **Invoice Format settings preview** (`/operations`), not in the actual settle dialog on either billing screen. Settling via UPI in new has no scannable QR — a genuine functional gap for a common real-world workflow |
| "Received Amount" display bug | 🐛 old's settle popup sums only cash+upi+card+due, silently excluding any custom hotel-configured payment modes from the displayed total (though they may still be sent to the server) | N/A — new's `PaymentSplitEditor` sums whatever modes are actually configured, so this specific bug has no equivalent to worry about |
| Custom payment modes | Hotel can configure extra payment-mode buttons beyond cash/card/upi/due | 🟡 new has a `PaymentModeConfig` concept, but **the real backend only supports cash/upi/card/due** (confirmed earlier this session — `settleOrder` explicitly rejects any other configured mode with "isn't a payment mode the backend supports yet") — so custom modes exist as local UI config but can't actually settle for real |
| Add item mid-settlement | ✅ "Add Item" button on the settle popup re-opens the order for editing before finalizing | ❌ not found — new's settle dialog doesn't offer a path back into the cart; you'd have to cancel/close and reopen the order separately (if that's even possible once settlement is in progress) |
| E-bill send + credit balance | ✅ checks `GET /getEBillCredit`, blocks with a "low credit" popup (contact-support message, no working recharge button — 🐛 dead "Recharge Now" button) if `credit <= 0` | ✅ **equivalent, wired this session** — `sendEBill` checks `store.eBillCredit`, blocks with a toast pointing to Operations to top up (a real, reachable path — better than old's dead-end popup) |

## 6. Printing & sharing

| | Old | New (v2) |
|---|---|---|
| Backend | Dual: local WebSocket "Print Bridge" (`localhost:7878/print-html`) or JSPrintManager (legacy websocket client), chosen per-hotel via `printer_infrastructure` config | ❌ neither exists — new has no local print-client integration at all (expected — this is real desktop/hardware integration, a separate build phase, not a billing-*logic* gap) |
| Invoice PDF | Server-rendered (`/generateInvoicePdf`), multi-language font stack (Gujarati/Hindi/Latin) | ✅ **new actually calls the real `/generateInvoicePdf` endpoint** (wired this session) and opens the resulting PDF in a new tab — no local print-client needed since it just opens the PDF, which is arguably a reasonable "web app" equivalent given no desktop bridge exists yet |
| KOT ticket print | Server-rendered or client-formatted ESC/POS text, routed to a per-category printer with a shared default fallback (`multi-printer-by-category` logic, duplicated 4+ times across the old file) | 🟡 new sends the real `POST /kotOrder` call (which triggers the backend's own print/queue logic per the old system's server-side conventions) but has no client-side printer-routing UI/logic of its own — reasonable, since actual print dispatch is a backend/hardware concern either way |
| Reprint | Real reprint via either backend | ✅ wired this session (`printBill`, calls the real invoice-PDF endpoint) |
| Token print | Separate token ticket print, gated by a per-hotel `tokenPrint` count | ❌ not found in new |
| Share bill (WhatsApp) | Folded into the e-bill flow above | ✅ same as e-bill above |

## 7. Access control

| | Old | New (v2) |
|---|---|---|
| Per-action permission gates | Real, IndexedDB-cached `{read,create,edit,delete}` matrix checked before nearly every mutating action on this screen (add item, remove item, decrease KOT qty needs *both* edit+delete, etc.) | 🟡 per the broader `FEATURE_COMPARISON.md`, new's permission system exists as a *reference table*, not an enforced runtime matrix — this applies to the Biller screen too: nothing here currently blocks an action based on a per-user permission flag the way old's `access.find(...).create/.edit/.delete` checks do throughout |
| Screen-level auth gate | If the user's `Biller` module has no `.read` access, the **entire screen** is replaced with a "User Not Authenticated" block | ❌ not found — new has no per-screen module-read gate; access is all-or-nothing at the login/session level (see this session's session-expiry-redirect fix, which is a different, complementary concern — global auth, not per-module) |

## 8. Notable old-app bugs found (documented for awareness — NOT recommendations to replicate)

- `applyDiscount2` — an orphaned, seemingly-dead duplicate discount calculator with two real bugs (a commented-out service-charge branch; a malformed function argument). No live caller found.
- F2/F3/F5 shortcuts stop working after the first use per component mount (`functionCalled` guard never resets).
- Move-KOT/Move-Table's "is destination occupied" check has a `status === 'hold' || 'in-progress'` condition — the second operand is a non-empty string, always truthy, so the intended status restriction never actually applies.
- Price-edit popup's "Reason" field is marked required but has no `name`/`onChange` — always discarded.
- `increaseItemQty` omits the discount argument its sibling cart-mutation functions pass — a likely-unintentional inconsistency.
- `addToCartforKot`'s two code paths (new-KOT-group vs. existing-KOT-group) disagree on whether `due` participates in "preserve last payment mode" logic; `addToCartforKotForCustomeItems` checks only `orderType==='pickup'` where the catalog-item version checks `pickup || editOrder`.
- `checkStockLevel` always checks stock for exactly `qty:1`, regardless of the actual quantity being added.
- Settle popup's "Received Amount" display excludes custom payment-mode amounts from its sum.

---

## Summary punch list — highest-value gaps to consider closing (billing-flow only)

Roughly ordered by how often a real cashier would hit the gap:

1. **UPI QR at actual settlement** — currently only exists in a settings preview, not the live payment flow. This is a daily-use feature for any UPI-heavy outlet.
2. **Barcode scanning and keyboard shortcuts missing on the table-grid order screen** — only `keyboard-display.tsx` has them; the other billing screen has neither.
3. **Line-level discount and discount reason field** — new is order-level-only with no reason capture.
4. **Post-fire single-unit KOT decrease** — new can only remove a fired line entirely, not decrement it by one.
5. **Promo-code application missing from one of the two discount dialogs** — internal inconsistency, quick fix.
6. **Move KOT (single round)** — real endpoint exists and is already used elsewhere in this codebase's context (table.js), just not called from either billing screen.
7. **"Add item" mid-settlement** — no path back into the cart once the settle dialog is open.
8. **Custom item on the keyboard-billing screen** — exists on the table-grid screen only.

Everything else — offline mode, local print-client integration, i18n, table time-over alarm (dormant in old anyway) — is either explicitly out of scope for this phase or a pre-existing, already-documented architecture gap, not a new billing-flow finding.
