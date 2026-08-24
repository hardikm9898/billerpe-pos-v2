import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "./api";

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

// Handshake auth is the same httpOnly "token" cookie every REST call
// already sends (see connection/socket.js's socketAuth) - withCredentials
// makes the browser attach it automatically, same as fetch's
// credentials: "include" in lib/api.ts.
export function connectKdsSocket(handlers: {
  onTicket: (order: KdsTicketPayload) => void;
  onOrderComplete: (orderId: number) => void;
}): () => void {
  const socket: Socket = io(`${API_BASE_URL}/kds`, {
    transports: ["websocket"],
    withCredentials: true,
  });

  const joinAllKitchens = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/kitchen/kitchens`, { credentials: "include" });
      const json = (await res.json().catch(() => null)) as {
        results?: { kitchen?: { id: number }[] };
      } | null;
      const kitchens = json?.results?.kitchen ?? [];
      kitchens.forEach((k) => socket.emit("joinKitchen", { kitchenId: k.id }));
    } catch {
      // No kitchens configured for this hotel (or the lookup failed) -
      // the board just stays whatever this tab already knows locally,
      // same as before this was wired.
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
    socket.close();
  };
}
