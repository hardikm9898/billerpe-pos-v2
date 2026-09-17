import { io, type Socket } from "socket.io-client";

import { EXE_BASE_URL, getStoredAuthToken, kitchenApi } from "./api";

// The /kds namespace's per-KOT-round push shape - shared by "newOrder"
// (fired on generateKot success, both for a brand-new order and for a
// later round added to an existing one - see kto.js's
// sendKotToAllKdsClient/otherkot) and each entry of "initialOrders"
// (fired once per kitchen room on join, snapshotting every order still
// in progress hotel-wide). Confirmed live: both real call sites always
// emit a single spread object for "newOrder", never the array shape
// kds.js's code also has a path for - that path (neworder=false) is
// dead, nothing in kto.js ever calls sendKotToAllKdsClient that way.
export type KdsTicketPayload = {
  id: number;
  kotNumber: number;
  type: "dinin" | "pickup";
  tableId: number | "";
  items: {
    name: string;
    qty: number;
    comment: string;
    menu_categ_id: number;
  }[];
};

// Connects through the Local EXE, not the cloud directly - Web POS never
// talks to the cloud directly per the confirmed Milestone 1 architecture,
// and the EXE's own /kds namespace (connection/socket.js) ports this exact
// contract.
//
// Handshake auth is the BEARER TOKEN, not the cookie. This was the reason
// no KOT ever reached the board: the exe's login cookie is set
// SameSite=strict (controller/auth.js), and the POS and the exe are
// different origins, so a browser never sends that cookie here - the exact
// problem already documented in lib/api.ts, which is why every REST call
// and lib/changeFeedSocket.ts send the token as a header instead. This
// connection was the last one still relying on the cookie, so its handshake
// was rejected as Unauthorized and the board simply stayed empty, with
// nothing to indicate why. Verified end to end against the real exe with
// billerpe-local-exe/scripts/verify-kds-delivery.js: with a token the
// initialOrders snapshot and every newOrder push arrive correctly.
//
// The token is read inside the `auth` callback rather than captured once, so
// a reconnect after a re-login uses the current one.
export function connectKdsSocket(handlers: {
  onTicket: (order: KdsTicketPayload) => void;
  onOrderComplete: (orderId: number) => void;
  /** Called with 0 when this hotel has no kitchens configured - without a
   * kitchen there is no room to broadcast into, so the board can never
   * receive anything and should say so rather than look merely idle. */
  onKitchensResolved?: (count: number) => void;
}): () => void {
  const socket: Socket = io(`${EXE_BASE_URL}/kds`, {
    transports: ["websocket"],
    withCredentials: true,
    auth: (cb) => {
      const token = getStoredAuthToken();
      cb(token ? { token } : {});
    },
  });

  const joinAllKitchens = async () => {
    try {
      // kitchenApi (not a raw fetch) so this carries the same auth header
      // as every other request. The previous raw fetch sent only
      // credentials: "include", so it 401'd for the same cookie reason as
      // the handshake above - meaning even a connected socket never joined
      // a room, because the kitchen list came back empty.
      const { kitchen } = await kitchenApi.getKitchens();
      const kitchens = kitchen ?? [];
      handlers.onKitchensResolved?.(kitchens.length);
      kitchens.forEach((k) => socket.emit("joinKitchen", { kitchenId: k.id }));
    } catch {
      // Lookup failed (exe briefly unreachable) - the board keeps whatever
      // this tab already knows locally, and the next reconnect retries.
    }
  };

  socket.on("connect", () => {
    void joinAllKitchens();
  });

  // Same payload shape as "newOrder", fired once per kitchen room joined
  // above - every kitchen's snapshot is the same hotel-wide in-progress
  // list (joinKitchen's server-side query isn't scoped by that kitchen's
  // own menu_categ_ids/table_ids), so joining N kitchens means N
  // duplicate arrivals of the same tickets. Dedup happens on the
  // receiving end (store's backendOrderId+kotNumber check), not here.
  socket.on("initialOrders", (data: KdsTicketPayload[]) => {
    (Array.isArray(data) ? data : []).forEach((order) => {
      if (order && typeof order.id === "number") handlers.onTicket(order);
    });
  });

  socket.on("newOrder", (data: KdsTicketPayload) => {
    if (data && typeof data.id === "number") handlers.onTicket(data);
  });

  socket.on("orderComplete", (orderId: number) => {
    if (typeof orderId === "number") handlers.onOrderComplete(orderId);
  });

  return () => {
    socket.removeAllListeners();
    socket.close();
  };
}
