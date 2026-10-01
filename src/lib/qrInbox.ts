import { showStaffAlert } from "@/components/app/staff-alert";

import { qrOrderApi, type RawPendingQrOrder } from "./api";
import { connectChangeFeed } from "./changeFeedSocket";

// Pending QR orders (billerpe-local-exe/controller/qrOrder.js's local mirror),
// shared by the whole app. AppShell starts it once per session, so a new QR
// order rings and shows a toast on EVERY screen - it used to live inside the
// table grid only, so staff on any other screen never heard about it until
// they happened to open the table grid (owner report: "requires refresh or
// change the module").
//
// Refreshed instantly on the exe's "qrOrdersChanged" socket event, with a
// 10s poll as the fallback for a dropped socket.

let qrOrders: RawPendingQrOrder[] = [];
let seenIds: Set<number> | null = null;
const listeners = new Set<() => void>();

function publish(next: RawPendingQrOrder[]) {
  qrOrders = next;
  listeners.forEach((l) => l());
}

export function getQrInbox(): RawPendingQrOrder[] {
  return qrOrders;
}

export function subscribeQrInbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Drop one right away after this screen accepted/rejected it (the refresh confirms). */
export function removeFromQrInbox(id: number) {
  publish(qrOrders.filter((o) => o.id !== id));
}

let onOpenInbox: (() => void) | null = null;

export async function refreshQrInbox(): Promise<void> {
  try {
    const r = await qrOrderApi.getPending();
    // The very first load never alerts: nothing "new" about orders that
    // were already waiting before this tab opened.
    if (seenIds) {
      const fresh = r.qrOrders.filter((o) => !seenIds!.has(o.id));
      // Rings and stays on screen until opened or closed (owner list
      // 2026-09-30 #6) - components/app/staff-alert.tsx.
      for (const o of fresh) {
        showStaffAlert({
          id: `qr-order-${o.id}`,
          kind: "qr-order",
          title: `New QR order — ${o.table_name ?? "table"}`,
          description: `${o.customer_name || "Guest"} · ${o.items.length} item${o.items.length === 1 ? "" : "s"}`,
          ...(onOpenInbox ? { actionLabel: "View", onAction: () => onOpenInbox?.() } : {}),
        });
      }
    }
    seenIds = new Set(r.qrOrders.map((o) => o.id));
    publish(r.qrOrders);
  } catch {
    // Best-effort: the previous list stays until the next refresh succeeds.
  }
}

/** Starts the live inbox for this session. Returns a stop function. */
export function startQrInbox(opts: { onOpen: () => void }): () => void {
  onOpenInbox = opts.onOpen;
  seenIds = null;
  void refreshQrInbox();
  const poll = setInterval(() => void refreshQrInbox(), 10000);
  const disconnect = connectChangeFeed({
    onChange: () => {},
    onQrOrdersChange: () => void refreshQrInbox(),
    onConnect: () => void refreshQrInbox(),
  });
  return () => {
    clearInterval(poll);
    disconnect();
    onOpenInbox = null;
    seenIds = null;
    publish([]);
  };
}
