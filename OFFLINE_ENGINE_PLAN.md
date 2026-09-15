# BillerPe V2 — Offline Engine: Scoping & Start Plan

Companion to `MIGRATION_PLAN.md`. That plan tracks wiring `billerpe-pos-pro-v2` to the real
`uat-backend-v2` API — as of now every core operational domain it lists as "Already wired"
(Tables, Menu, Users, Orders, Billing/Settlement, KDS, Stock, Purchases, Expenses, Cash
Sessions, Reports) is real. Offline is the one committed MVP piece (`BILLERPE-V2-MVP-FREEZE.md`
items 20–23, flagged there as "the single highest-risk item in the MVP scope") that hasn't
been scoped at all yet — it isn't even in `MIGRATION_PLAN.md`'s remaining-modules list.

This document exists to answer one question before any code gets written: **how do we start**,
given the full spec (`POS/system-understanding/BILLERPE-V2-FUNCTIONAL-SPECIFICATION.md` §3)
describes something much bigger (an installed Local Server EXE) than anything else in this
migration has needed.

---

## 1. What the spec actually requires

From §3 and `BILLERPE-V2-PO-UI-DECISIONS.md` §C6 (already PO-confirmed, not open questions):

- Zero-internet operation for: seat table, cart, KOT generation + printing, billing computation
  (tax/service charge/totals from last-synced config), settlement (Cash/UPI/Card/Due — gateway
  modes must clearly flag their own limitation, not fail generically).
- Persistent header connection chip with 7 states (Online/Offline/Syncing/Synced/Sync
  Error/Conflict/Local Server Unavailable) + a demo switcher — **this part is already built**,
  entirely as UI mock (`store.tsx` `connection` field, `AppShell.tsx`).
- Configurable max-offline-duration (default 3 days) blocking new transactions but not logout —
  **also already built as UI mock**.
- Auto silent sync on reconnect + manual "Sync Now".
- Conflict rules: **Settlement conflicts auto-resolve by earliest timestamp** (Owner/Manager
  notified only); every other conflict type (KOT, item mismatch, etc.) is manual-reconciliation-
  only, always audited. Config (menu/tax/pricing) is Cloud-wins on reconnect.
- **Bill numbers must never collide**, even across two devices offline simultaneously at the
  same outlet — outlet-reserved numbering ranges.
- **Stock deduction exactly-once** — the sync queue carries "already deducted" state with the
  order, not re-derived on the server.
- Local Server Dashboard: Sync Now, Restart Service, Backup, Restore, Check Updates, Download
  Logs. Device Management: register/rename/block/deregister, per-device online status + last
  sync + pending count.

## 2. What already exists to build on (and what doesn't)

| Piece | Status |
|---|---|
| Connection-state UI (chip, 7 states, demo switcher, blocking modal, max-duration banner) | ✅ Real UI, fake state — `store.tsx` `connection`/`maxOfflineDays`, driven only by `setConnection()` and a `setTimeout` |
| Real backend for every domain the sync queue would carry (Orders, Billing, Stock, Cash Session, etc.) | ✅ Real — see `MIGRATION_PLAN.md` |
| Local read cache (IndexedDB) | ⛔ Does not exist in `billerpe-pos-pro-v2` at all |
| Local write queue / outbox | ⛔ Does not exist |
| Sync-back engine, conflict resolution, exactly-once tracking | ⛔ Does not exist |
| Outlet-reserved bill-number ranges | ⛔ Does not exist in `uat-backend-v2` — current numbering is a plain sequence; this is a **new backend requirement**, not a reuse |
| Local Server EXE (installed on-premise process) | ⛔ Does not exist anywhere; confirmed net-new V2 concept, no V1 equivalent |
| Old app's `Idb.js` (15 IndexedDB stores) + `CheckConnectionStatus.js` gating | Real, but **read-cache + UI-gating only** — confirmed by reading the code; the "compare/increment" backend protocol in `services/syncIndexdb.js` is a **menu-version cache-invalidation check** (like an ETag), not a bidirectional transactional write-sync protocol. The old app's actual offline-order-queue-then-push-on-reconnect logic (`Services.js/Order.js`, `Biller.js`) needs a full read before assuming it's reusable — don't take the earlier migration report's "CONFIRMED, reusable" note at face value without re-verifying against the new domain models, which have already diverged (new role model, new table/order shapes) |

**Bottom line:** the hard, novel 80% of Offline Engine — local write queue, sync-back, conflict
resolution, collision-proof numbering, and the installed Local Server EXE — has to be built new.
Nothing in either the old app or the current mock gets us more than the UI shell and a read-cache
pattern to imitate.

## 3. The fork this plan exists to resolve

> **Superseded 2026-08-27** — confirmed with the user that the Local EXE is the always-on hub
> for Web POS *and* the future Captain mobile app from day one, not a deferred packaging step.
> See `POS/system-understanding/V2-MULTI-APP-ROADMAP.md` for the corrected sequencing (Local
> EXE MVP is Milestone 1, done first). The phase breakdown in §4 below is still the right
> internal engineering order — it now happens **inside the Local EXE**, not in the browser.
> Left in place for context on why browser-first was considered and rejected.

`BILLERPE-V2-MVP-FREEZE.md` elevated the **full** Offline Engine (Core + Local Server EXE +
Device Management + Sync Center) to MVP. But this migration's own working pattern — every module
in `MIGRATION_PLAN.md` — has been "wire one real thing at a time, live-verify, commit," never a
big-bang rebuild. Local Server EXE is a packaging/installed-software discipline (per
`V2-FEATURE-APPROVAL.md`: "a meaningfully different discipline from the rest of the product").
Building it first, before the sync logic it's meant to host is proven, inverts that pattern and
front-loads the riskiest, least-reusable part.

**Recommended sequencing** (scope stays "full Offline Engine is MVP," only the *build order*
changes): prove the local-cache → write-queue → sync-back → conflict-resolution logic running
in-browser against the real `uat-backend-v2` API first (this alone delivers real Hybrid Offline
Mode — the spec's actual minimum bar). Only once that's live-verified, layer the installed Local
Server EXE + its Dashboard on top as a packaging step, per spec's own distinction between Hybrid
Offline Mode and Local Server Mode being "functionally the same guarantees... described
separately because staff-facing behavior differs at scale."

This means near-term work is almost entirely inside `billerpe-pos-pro-v2` + small, additive
`uat-backend-v2` changes — no new installed-software project starts yet.

## 4. Proposed phases

Each phase ends in something live-verifiable against the real dev backend, matching
`MIGRATION_PLAN.md`'s own discipline (one module/slice per commit, typecheck+lint clean,
live-verified before "done").

### Phase 0 — Research (no code)
- Read the old app's actual offline-order-creation path end to end (`Order.js`, `Biller.js`,
  `CheckConnectionStatus.js`) to confirm exactly what, if anything, is reusable as a *pattern*
  (not code — the domain models have diverged).
- Read `uat-backend-v2`'s current bill-numbering logic to confirm the collision risk precisely
  (single sequence? per-hotel? any existing gap-handling?).
- Decide: does `uat-backend-v2` get idempotency-key support on write endpoints (order create,
  KOT fire, settle) now, so the sync-back engine has something safe to replay against? This is
  the one backend prerequisite that blocks Phase C below.

### Phase A — Real connection detection
Replace the fake `setConnection()` toggle with real detection: `navigator.onLine` +
an actual heartbeat/health-check against `uat-backend-v2`, distinguishing "no internet" from
"reachable internet, backend unreachable" (maps to the spec's Local-Server-Unavailable vs.
Offline distinction). Keep the existing demo switcher for QA — don't remove it, layer real
detection alongside it.

### Phase B — Local read cache
IndexedDB mirror of the data screens need to keep working offline: active tables, today's menu,
in-flight orders/KOTs. Populate on every successful load (piggybacking on the real API calls
`MIGRATION_PLAN.md` already wired), read from it when `connection !== "online"`.

### Phase C — Local write queue (highest-value transactions only, first)
Order create/update, KOT fire, settle/payment — exactly the spec's "must work offline" list.
Writes go to an IndexedDB outbox when offline; screens optimistically update from the outbox
immediately. Requires Phase 0's idempotency-key decision to be resolved first.

### Phase D — Sync-back engine
On reconnect, replay the outbox against real endpoints in order, exactly-once (idempotency
keys from Phase C), updating the outbox entry's status (Pending/Synced/Failed/Conflict) as it
goes — this state directly feeds Sync Center's tabs later.

### Phase E — Conflict resolution
Implement the spec's exact rules: settlement conflicts auto-resolve by earliest timestamp with
an Owner/Manager notification; every other conflict type is flagged for manual reconciliation
and produces an audit record. Config (menu/tax/pricing) pulls Cloud-wins on reconnect.

### Phase F — Bill-number collision guard (backend)
Outlet-reserved numbering ranges in `uat-backend-v2`, reconciled on sync — the one piece of
this whole plan that's a correctness-critical backend schema/logic change, not additive wiring.

### Phase G — Local Server Dashboard + Sync Center + Device Management (UI wiring)
Wire the already-built mock screens (`_shell.system.index.tsx` etc.) to the real outbox/sync
state from Phases C–D instead of the current fake data, plus real Register/Rename/Block/
Deregister device actions.

### Phase H — (Deferred decision, not started until G is live) Local Server EXE
Package the proven Hybrid logic behind an actual installed local process, if/when real-world
outage durations at pilot outlets show the browser-only outbox isn't enough on its own.

---

## 5. Open questions before Phase 0 starts

1. Confirm the sequencing in §3 — full Offline Engine stays MVP scope, but Local Server EXE
   (Phase H) ships after the browser-only sync logic (Phases A–G) is live-verified, not
   simultaneously. If a hard product deadline requires the installed EXE from day one, that
   changes the plan materially — say so now.
2. Idempotency-key support on `uat-backend-v2` write endpoints (Phase 0) — new backend work,
   needs sign-off since it touches Order/KOT/Settlement routes already in production use by the
   already-wired modules.
3. Bill-number collision fix (Phase F) is a schema-level backend change — needs its own
   sign-off separate from the rest, same as any other correctness-critical migration change in
   this project's established practice.

---

## How to pick up a step

Same discipline as `MIGRATION_PLAN.md`: read the real code before writing any, verify live
against the running dev backend, one phase-slice per commit, typecheck+lint clean, update this
file's phase status as work lands.
