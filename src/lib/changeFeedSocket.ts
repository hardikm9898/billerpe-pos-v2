import { io, type Socket } from "socket.io-client";

import { EXE_BASE_URL, getStoredAuthToken } from "./api";

// Live "something changed" feed from the exe (connection/socket.js emits
// `webChange { orderId }` on every order mutation from ANY terminal -
// another POS tab, the Kitchen Display's markKotReady, or the Captain App).
// This app already has its own equivalent for the /kds namespace
// (lib/kdsSocket.ts) but never had one for the general order/table feed -
// confirmed live as the actual cause of an action taken on the Captain App
// (fire a KOT, remove a line, request a bill) not showing up here until
// the next 20s poll (table-grid.index.tsx / table-grid.order.$orderId.tsx's
// own setInterval), not "immediately" as expected. Same cookie-based auth
// as every other request this app makes (see kdsSocket.ts's own comment) -
// this app runs in a normal browser, not a WebView, so it never needed the
// bearer-token handshake the Captain App's own connectChangeFeed uses.
//
// Deliberately does NOT replace the existing 20s polls - this is a fast
// path on top of them, not instead of them, so a missed/dropped socket
// event (a reconnect window, a momentary network blip) still self-heals on
// the next poll tick rather than leaving a screen stale indefinitely.
export type ChangeFeedEvent = {
  orderId: number;
  tableId?: number | null;
  action?: string;
};

export type KotPrintStatusEvent = {
  orderId: number;
  tableId: number | null;
  kotNumber: number;
  results: { printer: string; ok: boolean; error?: string }[];
};

export type ChangeFeedHandlers = {
  onChange: (orderId: number, event: ChangeFeedEvent) => void;
  /** Table status/structure changed with no single order behind it (move, reservation hold, edit). */
  onTableChange?: (tableIds: number[], action?: string) => void;
  /** Config (menu/tax/settings/users) changed on the exe - locally or pulled from the cloud. */
  onConfigChange?: (entities: string[]) => void;
  /** The QR ordering inbox changed (new, expired, accepted or rejected). */
  onQrOrdersChange?: () => void;
  /** The exe finished printing a fired KOT round itself (billerpe-local-exe/services/kotAutoPrint.js). */
  onKotPrintStatus?: (event: KotPrintStatusEvent) => void;
  /** Fired on every (re)connect - the caller should do one full refresh to cover anything missed. */
  onConnect?: () => void;
};

export function connectChangeFeed(
  handlers: ChangeFeedHandlers | ((orderId: number) => void),
): () => void {
  const h: ChangeFeedHandlers = typeof handlers === "function" ? { onChange: handlers } : handlers;
  const socket: Socket = io(EXE_BASE_URL, {
    transports: ["websocket"],
    withCredentials: true,
    auth: (cb) => {
      // Same bearer token every REST call sends (see api.ts's own comment on
      // why the cookie alone was unreliable across origins).
      const token = getStoredAuthToken();
      cb(token ? { token } : {});
    },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
  });
  socket.on("connect", () => h.onConnect?.());
  socket.on("webChange", (data: ChangeFeedEvent) => {
    if (data && typeof data.orderId === "number") h.onChange(data.orderId, data);
  });
  socket.on("tableChange", (data: { tableIds?: number[]; action?: string }) => {
    if (data && Array.isArray(data.tableIds)) h.onTableChange?.(data.tableIds, data.action);
  });
  socket.on("configChange", (data: { entities?: string[] }) => {
    if (data && Array.isArray(data.entities)) h.onConfigChange?.(data.entities);
  });
  socket.on("qrOrdersChanged", () => h.onQrOrdersChange?.());
  socket.on("kotPrintStatus", (data: KotPrintStatusEvent) => {
    if (data && Array.isArray(data.results)) h.onKotPrintStatus?.(data);
  });
  return () => {
    socket.removeAllListeners();
    socket.close();
  };
}
