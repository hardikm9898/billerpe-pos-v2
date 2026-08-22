# BillerPe V2 — Frontend Prototype Build Plan

A frontend-only, mock-data-driven click-through POS product covering all 29 approved screens, built on one premium light-theme design system. The wireframe drives workflows and states; the visual design is new.

## Design system

- Brand red `#a4453a` as the single primary action colour, on a warm-neutral light surface palette (paper, subtle tinted section backgrounds, soft borders). Success green, amber warning, and the four table-status tints from the spec become semantic status tokens.
- All colours as oklch tokens in `src/styles.css` — no hardcoded colour classes in components.
- Typography: one modern geometric/grotesk pair with tabular numerals for money and counts. Currency always `₹`, dates `DD/MM/YYYY`.
- Radius scale 8–14px, layered soft shadows, generous whitespace, dense-but-calm data areas.
- Shared primitives built once: app shell, icon rail + flyouts, top header, page header, buttons, inputs/selects, cards, KPI cards, data table (with mobile card fallback), badges/status pills, tabs, segmented controls, modals, drawers/sheets, toasts (sonner), confirm dialog, empty/loading-skeleton/error states, charts.
- Lucide icons throughout; Framer Motion only for page/card entrance, modal-drawer transitions, list updates, press feedback.

## Mock data + service layer

- Centralised `src/mock/` dataset seeded from the Mock Data spec: 9 users across all 7 roles, 24 tables in 4 categories with mixed states, menu categories/items/variants/addons, order history with KOT rounds, bills, payments, customers, reservations, raw materials, recipes, semi-finished items, suppliers, purchases, expenses, cash sessions, devices, printers, sync queue, notifications, audit logs.
- A single in-memory store (React context + reducer, Zustand-style selectors) exposes mock services: create/hold/save order, generate KOT, apply discount, add delivery/packaging charge, generate bill, settle (incl. split payment), merge table, transfer table, reserve/release table, open/close cash session, mark notifications read, run sync actions, switch connection state.
- All dashboards, reports, stock and cash totals are **derived** from that same store, so any action propagates across screens.

## Screens (all 29)

Auth: Login (Password/OTP/PIN tabs, device-registration gate, 3-step forgot password).
Operational: Table Grid, Order & Cart (with Merge/Transfer/Discount/Customer), Settle Bill modal (split payment), KDS, Orders, Order Detail.
Management: Menu Categories/Items/Variants/Addons, Table Category/Manage, Manage Users (7 roles + permissions), Expense Head/Entry, Stock (11-item sub-nav; 8 functional, 3 clearly-labelled placeholders), Purchases, Recipes, Semi-finished.
Analytics: Dashboard (KPI cards, sales trend, order volume, payment mix, inventory alerts, recent activity, quick actions), Reports hub + 13 report details.
System: Operations hub (7 functional tiles, 9 marked deferred), Local Server / Device Mgmt / Sync Center, Audit Log, Notification Settings, Printer Settings, Approval Matrix (discount-only), Reservations (List primary + Calendar), Opening & Closing.
Support: Raise Ticket, Profile, Help & Support.

## Confirmed rules preserved exactly

Merge: explicit source+destination pick, items combined but grouped by origin, KOT histories merge, guests auto-sum, source→Free / destination→Running, allowed with two active orders, one combined bill, no unmerge. Transfer: free destination relocates, occupied destination reuses merge logic, reserved destination blocked, no reversal. Split Table rejected; "Split Bill" = Split Payment only. Offline: persistent 7-state header chip on every logged-in screen with demo state switcher, Local Server Unavailable blocking modal, 3-day default max offline duration blocking new transactions while staying logged in. Cash session: one per outlet, reasoned add/withdraw, withdraw hard-blocked over balance, variance requires written explanation. Reservations: books a specific table, inline customer capture, Manual/Auto release with live grace countdown. Approval Matrix is discount-domain only.

## Open items (not silently resolved)

Stock Adjustment, Negative Stock Policy UI, and the settled-bill-edit approval step get conservative, visibly labelled "decision pending" placeholders — no invented business rules.

## Excluded

Split Table, Wallet, Gift Card, Owner Mobile App, Multi Outlet, Central Kitchen, Purchase Approval Workflow, QR Ordering, Loyalty, Membership, AI features, separate Waiter role.

## Technical notes

TanStack Start file routes under `src/routes/` matching the spec's route table, with an `_authenticated` shell layout wrapping every logged-in screen; login is the entry point and `/` redirects there or to the Table Grid based on mock session. Route-level `head()` metadata per screen. Heavy screens (reports, KDS, stock) lazy-loaded. Responsive: rail collapses to a bottom/compact nav on mobile, tables fall back to cards, cart becomes a bottom sheet, filters become drawers.

## Build order

1. Tokens + primitives + app shell. 2. Mock data + store/services. 3. Routing. 4. Operational screens. 5. Management screens. 6. Dashboard + reports. 7. Cross-screen state wiring. 8. Responsive. 9. Motion. 10. A11y/perf and consistency QA.
