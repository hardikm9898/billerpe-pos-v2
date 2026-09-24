import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, Receipt, Search, Share2, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/lib/api";
import {
  decryptQrPayload,
  encryptHotelId,
  fetchPublicMenu,
  getQrSession,
  QrRequestError,
  startQrSession,
  submitQrOrder,
  type PublicMenuAddon,
  type PublicMenuCategory,
  type PublicMenuItem,
  type PublicMenuVariant,
  type PublicRestaurantDetails,
  type QrCartItem,
  type QrRoundStatus,
  type QrSessionView,
  type QrTablePayload,
} from "@/lib/publicMenu";

// Both hotel_logo (uat-backend-v2/middleware/upload.js's multer
// destination: "public/images", served by server.js's
// `express.static("public")`) and a menu item's foodImage come back as
// bare filenames, not full URLs - confirmed live (a seed hotel's
// hotel_logo returned literally "placeholder.png"). The old app's own
// convertImage helper (MobileViewMenu.js) did the same
// `${SUPER_URL}/images/${url}` prefix; this is that, pointed at the
// current backend instead. Left as-is if it's already a full URL, in case
// a menu item's foodImage was hand-typed as one (MenuItemPayload.imageUrl
// is free text, not guaranteed to be an uploaded filename the way
// hotel_logo always is).
function resolveImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value;
  return `${API_BASE_URL}/images/${value}`;
}

export const Route = createFileRoute("/qr-menu")({
  head: () => ({
    meta: [
      { title: "Menu" },
      { name: "description", content: "View the restaurant's menu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QrMenuPage,
});

// sub_categories drives which dot color shows next to an item - matches
// the old app's veg/non-veg/jain/vegan/swaminarayan iconography
// (MobileViewMenu.js's subCategoryImage), reduced to a colored dot instead
// of importing those image assets, since this app has no equivalent icon
// set of its own to reuse. Matched by substring, case-insensitive - real
// data confirmed live doesn't stick to the old lowercase-exact convention
// (e.g. "Regular Veg", not "regular"), so an exact-match lookup silently
// misclassified everything to the default.
const DIET_DOT: [needle: string, cls: string][] = [
  ["non-veg", "bg-red-600"],
  ["nonveg", "bg-red-600"],
  ["jain", "bg-amber-600"],
  ["vegan", "bg-emerald-700"],
  ["swaminarayan", "bg-orange-600"],
];
function dietDotClass(subCategory: string) {
  const lower = subCategory.toLowerCase();
  return DIET_DOT.find(([needle]) => lower.includes(needle))?.[1] ?? "bg-green-600";
}

function formatPrice(currency: string | null | undefined, value: number | string) {
  return `${currency || "₹"}${value}`;
}

// The QR encodes just the raw encrypted ciphertext straight after "?" (no
// key=value pair) - matches how DownloadQrCode.js built the URL
// (`${APP_URL}/#/mobileMenu?${encryptId(...)}`) exactly, so this has to
// read the whole query string as one opaque blob too, not parse it as
// normal query params. Also what a per-table order QR encodes (just a
// different payload shape inside the same ciphertext slot - see
// decryptQrPayload).
function encryptedIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.search.replace(/^\?/, "");
}

// A cart line is identified by item + variant + exact addon selection, not
// just the item id - "Paneer Tikka (Large) + Extra Cheese" and plain
// "Paneer Tikka" must be separate lines with separate quantities.
type CartEntry = {
  item: PublicMenuItem;
  qty: number;
  comment: string;
  variant?: PublicMenuVariant;
  addons: PublicMenuAddon[];
};
function cartKey(itemId: number, variantId?: number, addonIds?: number[]) {
  const addonKey = (addonIds ?? [])
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  return `${itemId}:${variantId ?? ""}:${addonKey}`;
}
function unitPrice(entry: Pick<CartEntry, "item" | "variant" | "addons">) {
  const base = entry.variant
    ? Number(entry.variant.hms_menu_variant_mst?.variant_price ?? entry.item.price)
    : Number(entry.item.price);
  return base + entry.addons.reduce((sum, a) => sum + Number(a.price), 0);
}
// A dish the restaurant did not accept is not charged.
function roundTotal(items: QrCartItem[]) {
  return items
    .filter((i) => i.decision !== "rejected")
    .reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * i.qty, 0);
}

// What this phone remembers about its visit at this table. The visit itself
// (every round and its status) lives on the server (uat-backend-v2
// model/qrSession.js), so a refresh, a closed tab or even a different phone
// never loses it: this key brings it straight back, and entering the same
// mobile again finds it too. The cart is kept here so a refresh doesn't
// empty it, and the pending submission's client_key so a retry after a lost
// response is saved once, not twice.
type StoredCartLine = {
  itemId: number;
  variantId?: number;
  addonIds: number[];
  qty: number;
  comment: string;
};
type StoredVisit = {
  sessionKey?: string;
  cart?: StoredCartLine[];
  pendingSubmit?: { clientKey: string; sig: string };
};
function visitStorageKey(payload: QrTablePayload) {
  return `billerpe:qrVisit:${payload.hotelId}:${payload.tableId}`;
}
function loadVisit(payload: QrTablePayload): StoredVisit {
  try {
    const raw = window.localStorage.getItem(visitStorageKey(payload));
    return raw ? (JSON.parse(raw) as StoredVisit) : {};
  } catch {
    return {};
  }
}
function saveVisit(payload: QrTablePayload, patch: Partial<StoredVisit>) {
  try {
    const next = { ...loadVisit(payload), ...patch };
    window.localStorage.setItem(visitStorageKey(payload), JSON.stringify(next));
  } catch {
    // Private mode / storage blocked: the visit still lives on the server
    // and comes back by entering the mobile number again.
  }
}
function newClientKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const MOBILE_PATTERN = /^[0-9]{10}$/;
const POLL_MS = 5000;
// Same cap the cloud enforces per line (uat-backend-v2 controller/qrOrder.js).
const MAX_QTY_PER_LINE = 20;

const STATUS_LABEL: Record<QrRoundStatus, string> = {
  pending: "Waiting for the restaurant to confirm",
  accepted: "Confirmed - being prepared",
  rejected: "Declined by the restaurant",
  expired: "Not confirmed - please ask staff",
};
const STATUS_DOT: Record<QrRoundStatus, string> = {
  pending: "bg-amber-500",
  accepted: "bg-emerald-600",
  rejected: "bg-red-600",
  expired: "bg-muted-foreground",
};
const CLOSED_MESSAGE: Record<string, string> = {
  settled: "Your bill has been settled. Thank you for visiting!",
  cancelled: "This table's order was cancelled by the restaurant.",
  moved: "Staff moved your order to another table. Please scan the QR on your new table.",
  expired: "This order session has ended.",
};

function QrMenuPage() {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState<PublicMenuCategory[]>([]);
  const [restaurant, setRestaurant] = useState<PublicRestaurantDetails | null>(null);
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<PublicMenuItem | null>(null);

  // Table ordering - only when the scanned QR is a per-table order QR
  // (decryptQrPayload succeeded), not the restaurant's menu-only QR.
  // qrParam is the raw ciphertext from the URL, forwarded unchanged.
  const [tablePayload, setTablePayload] = useState<QrTablePayload | null>(null);
  const [qrParam, setQrParam] = useState("");
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [cartRestored, setCartRestored] = useState(false);
  const [drawerStep, setDrawerStep] = useState<"closed" | "cart" | "details">("closed");
  // "order": the details step places the cart right after starting the
  // visit. "find": only looks the visit up ("Ordered already?").
  const [detailsPurpose, setDetailsPurpose] = useState<"order" | "find">("order");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [visit, setVisit] = useState<QrSessionView | null>(null);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const busyRef = useRef(false);
  const lastStatuses = useRef<Map<number, QrRoundStatus>>(new Map());

  // Item-detail dialog's in-progress variant/addon/qty selection - reset
  // whenever a different item is opened.
  const [draftVariantId, setDraftVariantId] = useState<number | null>(null);
  const [draftAddonIds, setDraftAddonIds] = useState<Set<number>>(new Set());
  const [draftQty, setDraftQty] = useState(1);

  useEffect(() => {
    setDraftVariantId(null);
    setDraftAddonIds(new Set());
    setDraftQty(1);
  }, [openItem?.id]);

  // Applies a fresh server view, telling the customer when a round they are
  // waiting on is confirmed or declined.
  const applyVisit = useCallback((view: QrSessionView, announce: boolean) => {
    for (const r of view.rounds) {
      const before = lastStatuses.current.get(r.id);
      if (announce && before === "pending" && r.status !== "pending") {
        const declined = r.items.filter((i) => i.decision === "rejected").length;
        if (r.status === "accepted" && declined)
          toast.warning(
            `Your order was confirmed, but ${declined} item${declined === 1 ? " was" : "s were"} not accepted - see My order for why.`,
          );
        else if (r.status === "accepted")
          toast.success("Your order was confirmed and is being prepared.");
        else if (r.status === "rejected")
          toast.error("The restaurant declined your last order - see My order for why.");
        else toast.error("Your last order was not confirmed in time. Please ask staff.");
      }
      lastStatuses.current.set(r.id, r.status);
    }
    setVisit(view);
  }, []);

  useEffect(() => {
    const raw = encryptedIdFromUrl();
    if (!raw) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const payload = decryptQrPayload(raw);
    if (payload) {
      setTablePayload(payload);
      setQrParam(raw);
      const stored = loadVisit(payload);
      if (stored.sessionKey) {
        getQrSession(stored.sessionKey)
          .then((view) => {
            applyVisit(view, false);
            setCustomerMobile(view.session.customer_mobile || "");
            setCustomerName(view.session.customer_name || "");
          })
          .catch((err) => {
            // Only a definite answer from the server forgets the key; a
            // network blip keeps it for the next try.
            if (err instanceof QrRequestError && err.code !== null)
              saveVisit(payload, { sessionKey: undefined });
          });
      }
    }
    const hotelCiphertext = payload ? encryptHotelId(payload.hotelId) : raw;
    fetchPublicMenu(hotelCiphertext)
      .then(({ menu, restaurantDetails }) => {
        setCategories(menu);
        setRestaurant(restaurantDetails);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [applyVisit]);

  // Rebuilds the saved cart once the menu is here, dropping anything no
  // longer on it.
  useEffect(() => {
    if (!tablePayload || cartRestored || categories.length === 0) return;
    const byId = new Map<number, PublicMenuItem>();
    for (const c of categories) for (const item of c.hms_menu_msts) byId.set(item.id, item);
    const next = new Map<string, CartEntry>();
    for (const line of loadVisit(tablePayload).cart ?? []) {
      const item = byId.get(line.itemId);
      if (!item || !(line.qty > 0)) continue;
      const variant = line.variantId
        ? item.variantData?.find((v) => v.id === line.variantId)
        : undefined;
      if (line.variantId && !variant) continue;
      const allAddons = (item.addonDepartmentData ?? []).flatMap((g) => g.hms_addon_msts ?? []);
      const addons = line.addonIds
        .map((id) => allAddons.find((a) => a.id === id))
        .filter(Boolean) as PublicMenuAddon[];
      if (addons.length !== line.addonIds.length) continue;
      next.set(cartKey(item.id, variant?.id, line.addonIds), {
        item,
        qty: line.qty,
        comment: line.comment,
        variant,
        addons,
      });
    }
    setCart(next);
    setCartRestored(true);
  }, [tablePayload, categories, cartRestored]);

  useEffect(() => {
    if (!tablePayload || !cartRestored) return;
    saveVisit(tablePayload, {
      cart: Array.from(cart.values()).map((c) => ({
        itemId: c.item.id,
        variantId: c.variant?.id,
        addonIds: c.addons.map((a) => a.id),
        qty: c.qty,
        comment: c.comment,
      })),
    });
  }, [cart, tablePayload, cartRestored]);

  const sessionKey = visit?.session.key ?? null;
  const visitOpen = visit?.session.status === "open";

  // Live status of the visit: every round's confirmation, "bill ready" and
  // "settled". Polls only while the visit is open and the page is on
  // screen, and checks at once when the customer comes back to the tab.
  useEffect(() => {
    if (!sessionKey || !visitOpen) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const view = await getQrSession(sessionKey);
        if (!cancelled) applyVisit(view, true);
      } catch {
        // transient - next tick
      }
    };
    const t = setInterval(check, POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionKey, visitOpen, applyVisit]);

  // A second tab of the same table (the customer opened the link twice)
  // follows this one's visit instead of starting its own.
  useEffect(() => {
    if (!tablePayload) return;
    const payload = tablePayload;
    const key = visitStorageKey(payload);
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      const storedKey = loadVisit(payload).sessionKey;
      if (storedKey && storedKey !== sessionKey) {
        getQrSession(storedKey)
          .then((view) => applyVisit(view, false))
          .catch(() => {});
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tablePayload, sessionKey, applyVisit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        hms_menu_msts: cat.hms_menu_msts.filter((item) => item.item_name.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.hms_menu_msts.length > 0);
  }, [categories, search]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const logoUrl = resolveImageUrl(restaurant?.img);

  const cartList = useMemo(() => Array.from(cart.entries()), [cart]);
  const cartCount = cartList.reduce((sum, [, c]) => sum + c.qty, 0);
  const cartTotal = cartList.reduce((sum, [, c]) => sum + unitPrice(c) * c.qty, 0);
  const rounds = visit?.rounds ?? [];
  const roundsTotal = rounds
    .filter((r) => r.status !== "rejected" && r.status !== "expired")
    .reduce((sum, r) => sum + roundTotal(r.items), 0);
  const billReady = !!(visitOpen && visit?.session.bill_ready);
  const visitClosed = visit?.session.status === "closed";
  const pendingRound = visitOpen ? rounds.find((r) => r.status === "pending") : undefined;
  // Items can be picked unless the bill is already printed.
  const canAdd = !!tablePayload && !billReady;
  // Why "Place order" is unavailable right now, if it is.
  const blockReason = billReady
    ? "Your bill is ready. Please ask a staff member to add anything more."
    : pendingRound
      ? "Your previous order is waiting for the restaurant to confirm it. You can send this one right after."
      : null;

  function addSimpleToCart(item: PublicMenuItem) {
    const key = cartKey(item.id);
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(key, {
        item,
        qty: Math.min(MAX_QTY_PER_LINE, (existing?.qty ?? 0) + 1),
        comment: existing?.comment ?? "",
        addons: [],
      });
      return next;
    });
  }
  function decSimpleFromCart(item: PublicMenuItem) {
    decByKey(cartKey(item.id));
  }
  function qtyInCart(item: PublicMenuItem) {
    return cart.get(cartKey(item.id))?.qty ?? 0;
  }
  function incByKey(key: string) {
    setCart((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(key, { ...existing, qty: Math.min(MAX_QTY_PER_LINE, existing.qty + 1) });
      return next;
    });
  }
  function decByKey(key: string) {
    setCart((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      if (existing.qty <= 1) next.delete(key);
      else next.set(key, { ...existing, qty: existing.qty - 1 });
      return next;
    });
  }
  function updateComment(key: string, comment: string) {
    setCart((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(key, { ...existing, comment });
      return next;
    });
  }

  function toggleDraftAddon(id: number) {
    setDraftAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const draftVariant = openItem?.variantData?.find((v) => v.id === draftVariantId);
  const draftAddons = (openItem?.addonDepartmentData ?? [])
    .flatMap((g) => g.hms_addon_msts ?? [])
    .filter((a) => draftAddonIds.has(a.id));
  const draftUnitPrice = openItem
    ? unitPrice({ item: openItem, variant: draftVariant, addons: draftAddons })
    : 0;

  function addDraftToCart() {
    if (!openItem) return;
    const key = cartKey(
      openItem.id,
      draftVariant?.id,
      draftAddons.map((a) => a.id),
    );
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(key, {
        item: openItem,
        qty: Math.min(MAX_QTY_PER_LINE, (existing?.qty ?? 0) + draftQty),
        comment: existing?.comment ?? "",
        variant: draftVariant,
        addons: draftAddons,
      });
      return next;
    });
    setOpenItem(null);
  }

  // Finds this mobile's open visit at the table (history and all) or
  // starts one. Returns null when the number is invalid.
  async function beginVisit(): Promise<QrSessionView | null> {
    if (!tablePayload || !qrParam) return null;
    const mobile = customerMobile.trim();
    if (!MOBILE_PATTERN.test(mobile)) {
      setMobileError("Enter a valid 10-digit mobile number.");
      return null;
    }
    setMobileError(null);
    const view = await startQrSession({
      qr: qrParam,
      customer_mobile: mobile,
      customer_name: customerName.trim(),
    });
    saveVisit(tablePayload, { sessionKey: view.session.key });
    applyVisit(view, false);
    return view;
  }

  async function sendCart(view: QrSessionView) {
    if (!tablePayload) return;
    const items: QrCartItem[] = cartList.map(([, c]) => ({
      menuId: c.item.id,
      qty: c.qty,
      itemName: c.item.item_name,
      comment: c.comment || undefined,
      variantId: c.variant?.id,
      variantName: c.variant?.variants_name,
      addonIds: c.addons.length ? c.addons.map((a) => a.id) : undefined,
      addonNames: c.addons.length ? c.addons.map((a) => a.addon_name) : undefined,
      unitPrice: unitPrice(c),
    }));
    // Same cart + same visit = same client_key, so pressing again after a
    // lost response can never place it twice.
    const sig = JSON.stringify([view.session.key, items]);
    const stored = loadVisit(tablePayload).pendingSubmit;
    const clientKey = stored?.sig === sig ? stored.clientKey : newClientKey();
    saveVisit(tablePayload, { pendingSubmit: { clientKey, sig } });

    const res = await submitQrOrder({
      session_key: view.session.key,
      client_key: clientKey,
      items,
    });
    saveVisit(tablePayload, { pendingSubmit: undefined });
    applyVisit(res, false);
    setCart(new Map());
    setDrawerStep("closed");
    toast.success(
      res.duplicate
        ? "Your order was already received."
        : "Order sent! The restaurant will confirm it shortly.",
    );
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      await task();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong - please try again.",
      );
      // The server's view is the truth: refresh it so a block reason (bill
      // printed, previous order pending, visit closed) shows at once.
      const key = tablePayload ? loadVisit(tablePayload).sessionKey : null;
      if (key)
        getQrSession(key)
          .then((v) => applyVisit(v, false))
          .catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // "Place order" from the cart. The first time (or after a visit ended)
  // it asks for the mobile number first.
  function handlePlaceOrder() {
    if (visit && visitOpen) {
      void run(() => sendCart(visit));
      return;
    }
    setDetailsPurpose("order");
    setDrawerStep("details");
  }

  function openFindVisit() {
    setSubmitError(null);
    setDetailsPurpose("find");
    setDrawerStep("details");
  }

  function handleDetailsSubmit() {
    void run(async () => {
      const view = await beginVisit();
      if (!view) return;
      if (detailsPurpose === "find" || cartList.length === 0) {
        setDrawerStep("closed");
        if (view.rounds.length) {
          toast.success("Welcome back! Here is your order so far.");
          setOrderHistoryOpen(true);
        } else {
          toast.success("You're all set - add items and place your order.");
        }
        return;
      }
      if (view.session.bill_ready || view.rounds.some((r) => r.status === "pending")) {
        // Their earlier visit came back with a round still waiting (or the
        // bill printed): show where things stand; the cart is kept.
        setDrawerStep("closed");
        setOrderHistoryOpen(true);
        return;
      }
      await sendCart(view);
    });
  }

  function startNewVisit() {
    if (tablePayload) saveVisit(tablePayload, { sessionKey: undefined, pendingSubmit: undefined });
    setVisit(null);
    lastStatuses.current = new Map();
    setOrderHistoryOpen(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading menu…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <UtensilsCrossed className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Restaurant not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This menu link looks invalid or the restaurant is unavailable right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg">
        <div className="border-b border-border bg-surface px-4 pb-4 pt-6">
          <div className="flex items-start gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={restaurant?.restaurantName}
                className="size-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <UtensilsCrossed className="size-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{restaurant?.restaurantName}</h1>
              {visit?.session.table_name ? (
                <p className="truncate text-xs font-medium text-primary">
                  Table {visit.session.table_name}
                </p>
              ) : null}
              {restaurant?.address ? (
                <p className="truncate text-xs text-muted-foreground">{restaurant.address}</p>
              ) : null}
            </div>
            {rounds.length > 0 ? (
              <button
                onClick={() => setOrderHistoryOpen(true)}
                className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
                title="My order"
                aria-label="My order"
              >
                <Receipt className="size-4" />
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {rounds.length}
                </span>
              </button>
            ) : null}
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
              title="Share menu"
            >
              <Share2 className="size-4" />
            </a>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a dish"
              className="pl-9"
            />
          </div>
        </div>

        {tablePayload ? (
          <div className="space-y-2 px-4 pt-4">
            {visitClosed ? (
              <div
                data-qr-banner="closed"
                className="rounded-xl border border-border bg-surface p-3 text-sm"
              >
                <p className="font-medium">
                  {CLOSED_MESSAGE[visit?.session.closed_reason ?? ""] ?? CLOSED_MESSAGE["expired"]}
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={startNewVisit}>
                  Start a new order
                </Button>
              </div>
            ) : billReady ? (
              <div
                data-qr-banner="bill-ready"
                className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <p className="font-medium">Your bill is ready</p>
                <p className="text-xs">
                  Staff will bring it to your table. To add anything more, please ask a staff
                  member.
                </p>
              </div>
            ) : pendingRound ? (
              <button
                data-qr-banner="pending"
                onClick={() => setOrderHistoryOpen(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-900"
              >
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                <span className="flex-1">
                  Your order is waiting for the restaurant to confirm it.
                </span>
                <span className="text-xs font-medium underline">View</span>
              </button>
            ) : !visit ? (
              <button
                data-qr-find
                onClick={openFindVisit}
                className="w-full text-left text-xs text-muted-foreground underline"
              >
                Already ordered at this table? Find my order
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-6 px-4 py-5">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search ? "No dishes match your search." : "Menu not available right now."}
            </p>
          ) : (
            filtered.map((cat) => (
              <section key={cat.id}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.menu_categ_nm}
                </h2>
                <div className="space-y-2">
                  {cat.hms_menu_msts.map((item) => {
                    const hasOptions =
                      !!item.variantData?.length || !!item.addonDepartmentData?.length;
                    return (
                      <div
                        key={item.id}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2.5 text-left"
                      >
                        <button
                          onClick={() => setOpenItem(item)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {resolveImageUrl(item.foodImage) ? (
                            <img
                              src={resolveImageUrl(item.foodImage)!}
                              alt={item.item_name}
                              className="size-14 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-surface-muted">
                              <UtensilsCrossed className="size-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`size-2.5 shrink-0 rounded-full ${dietDotClass(item.sub_categories)}`}
                              />
                              <p className="truncate text-sm font-medium">{item.item_name}</p>
                            </div>
                            {item.description ? (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                            {!item.variantData?.length ? (
                              <p className="num mt-1 text-sm font-semibold">
                                {formatPrice(restaurant?.currency, item.price)}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">
                                From {formatPrice(restaurant?.currency, item.price)}
                              </p>
                            )}
                          </div>
                        </button>

                        {canAdd ? (
                          hasOptions ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => setOpenItem(item)}
                            >
                              Select
                            </Button>
                          ) : qtyInCart(item) > 0 ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="size-8"
                                onClick={() => decSimpleFromCart(item)}
                              >
                                <Minus className="size-3.5" />
                              </Button>
                              <span className="num w-4 text-center text-sm font-semibold">
                                {qtyInCart(item)}
                              </span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="size-8"
                                onClick={() => addSimpleToCart(item)}
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => addSimpleToCart(item)}
                            >
                              Add
                            </Button>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {openItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{openItem.item_name}</DialogTitle>
              </DialogHeader>
              {resolveImageUrl(openItem.foodImage) ? (
                <img
                  src={resolveImageUrl(openItem.foodImage)!}
                  alt={openItem.item_name}
                  className="h-40 w-full rounded-lg object-cover"
                />
              ) : null}
              <div className="flex items-center gap-1.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${dietDotClass(openItem.sub_categories)}`}
                />
                <p className="num text-sm font-semibold">
                  {formatPrice(restaurant?.currency, canAdd ? draftUnitPrice : openItem.price)}
                </p>
              </div>
              {openItem.description ? (
                <p className="text-sm text-muted-foreground">{openItem.description}</p>
              ) : null}

              {openItem.variantData?.length ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Choose one
                  </p>
                  {canAdd ? (
                    <div className="space-y-1">
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-2 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="qr-variant"
                            checked={draftVariantId === null}
                            onChange={() => setDraftVariantId(null)}
                          />
                          Regular
                        </span>
                        <span className="num font-medium">
                          {formatPrice(restaurant?.currency, openItem.price)}
                        </span>
                      </label>
                      {openItem.variantData.map((v) => (
                        <label
                          key={v.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-2 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="qr-variant"
                              checked={draftVariantId === v.id}
                              onChange={() => setDraftVariantId(v.id)}
                            />
                            {v.variants_name}
                          </span>
                          <span className="num font-medium">
                            {formatPrice(
                              restaurant?.currency,
                              v.hms_menu_variant_mst?.variant_price ?? 0,
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    openItem.variantData.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-sm">
                        <span>{v.variants_name}</span>
                        <span className="num font-medium">
                          {formatPrice(
                            restaurant?.currency,
                            v.hms_menu_variant_mst?.variant_price ?? 0,
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {openItem.addonDepartmentData?.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.department_name}
                  </p>
                  {group.hms_addon_msts?.map((addon) =>
                    canAdd ? (
                      <label
                        key={addon.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draftAddonIds.has(addon.id)}
                            onChange={() => toggleDraftAddon(addon.id)}
                          />
                          {addon.addon_name}
                        </span>
                        <span className="num font-medium">
                          {formatPrice(restaurant?.currency, addon.price)}
                        </span>
                      </label>
                    ) : (
                      <div key={addon.id} className="flex items-center justify-between text-sm">
                        <span>{addon.addon_name}</span>
                        <span className="num font-medium">
                          {formatPrice(restaurant?.currency, addon.price)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ))}

              {canAdd ? (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={draftQty <= 1}
                    onClick={() => setDraftQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="num text-base font-semibold">{draftQty}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={draftQty >= MAX_QTY_PER_LINE}
                    onClick={() => setDraftQty((q) => Math.min(MAX_QTY_PER_LINE, q + 1))}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button className="ml-2 flex-1" onClick={addDraftToCart}>
                    Add to order — {formatPrice(restaurant?.currency, draftUnitPrice * draftQty)}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {canAdd && cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-lg">
            <Button
              data-qr-cart
              className="w-full justify-between"
              onClick={() => {
                setSubmitError(null);
                setDrawerStep("cart");
              }}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-4" />
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </span>
              <span className="num">{formatPrice(restaurant?.currency, cartTotal)}</span>
            </Button>
          </div>
        </div>
      ) : null}

      <Drawer
        open={drawerStep !== "closed"}
        onOpenChange={(o) => !o && !busy && setDrawerStep("closed")}
      >
        <DrawerContent className="mx-auto max-w-lg">
          {drawerStep === "cart" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  {rounds.length > 0 && visitOpen ? "Add more items" : "Your order"}
                </DrawerTitle>
              </DrawerHeader>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4">
                {cartList.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Your cart is empty.
                  </p>
                ) : (
                  cartList.map(([key, c]) => (
                    <div key={key} className="space-y-1.5 rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.item.item_name}
                            {c.variant ? ` (${c.variant.variants_name})` : ""}
                          </p>
                          {c.addons.length ? (
                            <p className="truncate text-xs text-muted-foreground">
                              + {c.addons.map((a) => a.addon_name).join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <span className="num shrink-0 text-sm font-semibold">
                          {formatPrice(restaurant?.currency, unitPrice(c) * c.qty)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7"
                          onClick={() => decByKey(key)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="num w-4 text-center text-sm">{c.qty}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7"
                          disabled={c.qty >= MAX_QTY_PER_LINE}
                          onClick={() => incByKey(key)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={c.comment}
                        onChange={(e) => updateComment(key, e.target.value)}
                        placeholder="Add a note (optional)"
                        className="h-8 text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
              <DrawerFooter>
                <div className="flex items-center justify-between px-1 text-sm font-semibold">
                  <span>Total</span>
                  <span className="num">{formatPrice(restaurant?.currency, cartTotal)}</span>
                </div>
                {blockReason ? (
                  <p data-qr-block className="px-1 text-xs text-amber-700">
                    {blockReason}
                  </p>
                ) : null}
                {submitError ? (
                  <p data-qr-error className="px-1 text-sm text-destructive">
                    {submitError}
                  </p>
                ) : null}
                <Button
                  data-qr-place
                  disabled={cartList.length === 0 || busy || !!blockReason}
                  onClick={handlePlaceOrder}
                >
                  {busy ? "Placing order…" : visit && visitOpen ? "Place order" : "Continue"}
                </Button>
              </DrawerFooter>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  {detailsPurpose === "find" ? "Find my order" : "Your details"}
                </DrawerTitle>
              </DrawerHeader>
              <div className="space-y-3 px-4">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-mobile" required>
                    Mobile number
                  </Label>
                  <Input
                    id="qr-mobile"
                    inputMode="numeric"
                    autoComplete="tel"
                    autoFocus
                    aria-invalid={!!mobileError || undefined}
                    value={customerMobile}
                    onChange={(e) => {
                      setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setMobileError(null);
                    }}
                    placeholder="10-digit mobile number"
                  />
                  <p className="text-xs text-muted-foreground">
                    {detailsPurpose === "find"
                      ? "Enter the number you ordered with to see your order."
                      : "Your order stays linked to this number until the bill is settled - use it to see your order on any phone."}
                  </p>
                  {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
                </div>
                {detailsPurpose === "order" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="qr-name">Name (optional)</Label>
                    <Input
                      id="qr-name"
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                ) : null}
                {submitError ? (
                  <p data-qr-error className="text-sm text-destructive">
                    {submitError}
                  </p>
                ) : null}
              </div>
              <DrawerFooter>
                {detailsPurpose === "order" ? (
                  <div className="flex items-center justify-between px-1 text-sm font-semibold">
                    <span>Total</span>
                    <span className="num">{formatPrice(restaurant?.currency, cartTotal)}</span>
                  </div>
                ) : null}
                <Button data-qr-details-submit disabled={busy} onClick={handleDetailsSubmit}>
                  {busy
                    ? "Please wait…"
                    : detailsPurpose === "find"
                      ? "Find my order"
                      : "Place order"}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {/* "My order" - every round of this visit with its live status. The
          history lives on the server, so it survives a refresh and comes
          back on any phone with the same mobile number. */}
      <Drawer open={orderHistoryOpen} onOpenChange={setOrderHistoryOpen}>
        <DrawerContent className="mx-auto max-w-lg">
          <DrawerHeader>
            <DrawerTitle>My order</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4">
            {rounds.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing ordered yet.</p>
            ) : (
              [...rounds].reverse().map((r) => (
                <div
                  key={r.id}
                  data-qr-round={r.status}
                  className="space-y-1.5 rounded-lg border border-border p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="num text-xs text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {r.items.map((item, i) => (
                      <li key={i} data-qr-item-decision={item.decision ?? "pending"}>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={
                              item.decision === "rejected"
                                ? "min-w-0 truncate text-muted-foreground line-through"
                                : "min-w-0 truncate"
                            }
                          >
                            {item.qty} × {item.itemName}
                            {item.variantName ? ` (${item.variantName})` : ""}
                          </span>
                          {item.decision === "accepted" && r.status === "accepted" ? (
                            <span className="shrink-0 text-xs text-success">Accepted</span>
                          ) : item.decision === "rejected" ? (
                            <span className="shrink-0 text-xs font-medium text-destructive">
                              Not accepted
                            </span>
                          ) : null}
                        </div>
                        {item.decision === "rejected" && item.rejectReason ? (
                          <p className="text-xs text-destructive">Reason: {item.rejectReason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {roundTotal(r.items) > 0 ? (
                    <p className="num text-right text-sm font-semibold">
                      {formatPrice(restaurant?.currency, roundTotal(r.items))}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <DrawerFooter>
            {roundsTotal > 0 ? (
              <div className="flex items-center justify-between px-1 text-sm font-semibold">
                <span>Total so far</span>
                <span className="num">{formatPrice(restaurant?.currency, roundsTotal)}</span>
              </div>
            ) : null}
            <p className="px-1 text-xs text-muted-foreground">
              {billReady
                ? "Your bill is ready - staff will bring it to your table."
                : "Final amount including taxes is on your bill, settled by staff at the restaurant."}
            </p>
            {visitClosed ? (
              <Button variant="outline" onClick={startNewVisit}>
                Start a new order
              </Button>
            ) : canAdd ? (
              <Button
                variant="outline"
                onClick={() => {
                  setOrderHistoryOpen(false);
                  if (cartCount > 0) setDrawerStep("cart");
                }}
              >
                {cartCount > 0 ? "Go to cart" : "Add more items"}
              </Button>
            ) : null}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
