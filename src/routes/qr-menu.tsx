import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, Receipt, Search, Share2, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  getQrOrderStatus,
  getTableSessionStatus,
  submitQrOrder,
  type PublicMenuAddon,
  type PublicMenuCategory,
  type PublicMenuItem,
  type PublicMenuVariant,
  type PublicRestaurantDetails,
  type QrCartItem,
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

type RoundStatus = "pending" | "accepted" | "rejected" | "expired";
// One customer submission (one POST /qrOrder call). A single ordering
// session at a table is potentially many of these - see the plan's own
// "add more items on the same order" requirement: each round becomes its
// own KOT round on the SAME backend Order (billerpe-local-exe's
// addKotRoundToOrder), not a separate order.
type OrderRound = {
  id: number;
  items: QrCartItem[];
  total: number;
  status: RoundStatus;
  submittedAt: number;
};
type StoredSession = { rounds: OrderRound[]; customerName: string; customerMobile: string };

function sessionStorageKey(payload: QrTablePayload) {
  return `billerpe:qrSession:${payload.hotelId}:${payload.tableId}`;
}
function loadSession(payload: QrTablePayload): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey(payload));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
function persistSession(payload: QrTablePayload, session: StoredSession) {
  try {
    window.localStorage.setItem(sessionStorageKey(payload), JSON.stringify(session));
  } catch {
    // non-fatal - session just won't survive a reload
  }
}
function clearSession(payload: QrTablePayload) {
  try {
    window.localStorage.removeItem(sessionStorageKey(payload));
  } catch {
    // ignore
  }
}

const MOBILE_PATTERN = /^[0-9]{10}$/;

const STATUS_LABEL: Record<RoundStatus, string> = {
  pending: "Waiting for confirmation",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
};
const STATUS_DOT: Record<RoundStatus, string> = {
  pending: "bg-amber-500",
  accepted: "bg-emerald-600",
  rejected: "bg-red-600",
  expired: "bg-muted-foreground",
};

function QrMenuPage() {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState<PublicMenuCategory[]>([]);
  const [restaurant, setRestaurant] = useState<PublicRestaurantDetails | null>(null);
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<PublicMenuItem | null>(null);

  // Table ordering - only present when the scanned QR is a per-table
  // order QR (decryptQrPayload succeeded), not the restaurant-level
  // menu-only QR. qrParam is the raw ciphertext from the URL, kept as-is
  // to forward unchanged to submitQrOrder/getTableSessionStatus - the
  // backend re-derives hotelId/tableId/qrVersion from it itself.
  const [tablePayload, setTablePayload] = useState<QrTablePayload | null>(null);
  const [qrParam, setQrParam] = useState("");
  const [cart, setCart] = useState<Map<string, CartEntry>>(new Map());
  const [drawerStep, setDrawerStep] = useState<"closed" | "cart" | "details">("closed");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The ongoing session at this table - every accepted/pending/declined
  // round so far, visible any time via the "My Order" panel, and still
  // open to new rounds until the table's bill is actually settled (see
  // the table-status poll below), not just after the first accept.
  const [rounds, setRounds] = useState<OrderRound[]>([]);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);

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
      const stored = loadSession(payload);
      if (stored) {
        setRounds(stored.rounds);
        setCustomerName(stored.customerName || "");
        setCustomerMobile(stored.customerMobile || "");
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
  }, []);

  // Polls status for whichever rounds are still pending - re-arms only
  // when the SET of pending round ids actually changes (a round newly
  // submitted, or one leaving pending), not on every tick, so this isn't
  // tearing down/recreating its interval every 5s for no reason.
  const pendingIdsKey = rounds
    .filter((r) => r.status === "pending")
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    const ids = pendingIdsKey ? pendingIdsKey.split(",").map(Number) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    const check = async () => {
      const updates = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await getQrOrderStatus(id);
            return { id, status: res.status };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setRounds((prev) => {
        const next = prev.map((r) => {
          const u = updates.find((x) => x && x.id === r.id);
          return u && u.status !== r.status ? { ...r, status: u.status } : r;
        });
        if (tablePayload)
          persistSession(tablePayload, { rounds: next, customerName, customerMobile });
        return next;
      });
    };
    void check();
    const t = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdsKey, tablePayload]);

  // The session only truly ends when the table's bill is settled (or the
  // table is otherwise cleared) - not after any single round is accepted.
  // Detected via the table's own status flipping back to Free/Reserved;
  // only polls while there's an actual session to watch.
  useEffect(() => {
    if (!tablePayload || !qrParam || rounds.length === 0) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await getTableSessionStatus(qrParam);
        if (cancelled) return;
        if (res.table_status === "F" || res.table_status === "B") {
          setRounds([]);
          setCustomerName("");
          setCustomerMobile("");
          clearSession(tablePayload);
        }
      } catch {
        // transient - try again next tick
      }
    };
    const t = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tablePayload, qrParam, rounds.length]);

  // Cross-tab sync: two tabs/windows against the same table (e.g. a
  // customer switches phones mid-visit, or reopens the QR link in a new
  // tab) each hold their own in-memory `rounds` copy - if both submit a
  // round independently, whichever writes localStorage LAST would
  // otherwise silently overwrite the other's round in every OTHER tab
  // (only visible again after that tab reloads - the exact "2 orders
  // separated, then merge on reload" report). The native `storage` event
  // fires in every OTHER same-origin tab whenever one tab writes, so this
  // pulls those writes in live instead of waiting for a reload to notice.
  useEffect(() => {
    if (!tablePayload) return;
    const payload = tablePayload;
    const key = sessionStorageKey(payload);
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      const stored = loadSession(payload);
      if (stored) {
        setRounds(stored.rounds);
        if (stored.customerName) setCustomerName(stored.customerName);
        if (stored.customerMobile) setCustomerMobile(stored.customerMobile);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tablePayload]);

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
  const hasContact = MOBILE_PATTERN.test(customerMobile.trim());
  const roundsTotal = rounds
    .filter((r) => r.status !== "rejected" && r.status !== "expired")
    .reduce((sum, r) => sum + r.total, 0);

  function addSimpleToCart(item: PublicMenuItem) {
    const key = cartKey(item.id);
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(key, {
        item,
        qty: (existing?.qty ?? 0) + 1,
        comment: existing?.comment ?? "",
        addons: [],
      });
      return next;
    });
  }
  function decSimpleFromCart(item: PublicMenuItem) {
    const key = cartKey(item.id);
    setCart((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      if (existing.qty <= 1) next.delete(key);
      else next.set(key, { ...existing, qty: existing.qty - 1 });
      return next;
    });
  }
  function qtyInCart(item: PublicMenuItem) {
    return cart.get(cartKey(item.id))?.qty ?? 0;
  }
  function incByKey(key: string) {
    setCart((prev) => {
      const existing = prev.get(key);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(key, { ...existing, qty: existing.qty + 1 });
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
        qty: (existing?.qty ?? 0) + draftQty,
        comment: existing?.comment ?? "",
        variant: draftVariant,
        addons: draftAddons,
      });
      return next;
    });
    setOpenItem(null);
  }

  async function handleSubmitRound() {
    if (!tablePayload || !qrParam) return;
    if (!hasContact) {
      setMobileError("Enter a valid 10-digit mobile number.");
      setDrawerStep("details");
      return;
    }
    setMobileError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const items: QrCartItem[] = cartList.map(([, c]) => ({
        menuId: c.item.id,
        qty: c.qty,
        itemName: c.item.item_name,
        comment: c.comment || undefined,
        variantId: c.variant?.id,
        variantName: c.variant?.variants_name,
        addonIds: c.addons.length ? c.addons.map((a) => a.id) : undefined,
        addonNames: c.addons.length ? c.addons.map((a) => a.addon_name) : undefined,
      }));
      const total = cartList.reduce((sum, [, c]) => sum + unitPrice(c) * c.qty, 0);
      const res = await submitQrOrder({
        qr: qrParam,
        customer_name: customerName.trim(),
        customer_mobile: customerMobile.trim(),
        items,
      });
      const round: OrderRound = {
        id: res.id,
        items,
        total,
        status: "pending",
        submittedAt: Date.now(),
      };
      setRounds((prev) => {
        const next = [...prev, round];
        persistSession(tablePayload, {
          rounds: next,
          customerName: customerName.trim(),
          customerMobile: customerMobile.trim(),
        });
        return next;
      });
      setCart(new Map());
      setDrawerStep("closed");
      toast.success("Order sent to the kitchen for confirmation");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not place your order.");
      setDrawerStep("details");
    } finally {
      setSubmitting(false);
    }
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
              {restaurant?.address ? (
                <p className="truncate text-xs text-muted-foreground">{restaurant.address}</p>
              ) : null}
            </div>
            {rounds.length > 0 ? (
              <button
                onClick={() => setOrderHistoryOpen(true)}
                className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
                title="My order"
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
                          className="flex min-w-0 flex-1 items-center gap-3"
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

                        {tablePayload ? (
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

      {tablePayload && cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-lg">
            <Button className="w-full justify-between" onClick={() => setDrawerStep("cart")}>
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-4" />
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </span>
              <span className="num">{formatPrice(restaurant?.currency, cartTotal)}</span>
            </Button>
          </div>
        </div>
      ) : null}

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
                  {formatPrice(
                    restaurant?.currency,
                    tablePayload ? draftUnitPrice : openItem.price,
                  )}
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
                  {tablePayload ? (
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
                    tablePayload ? (
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

              {tablePayload ? (
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
                  <Button size="icon" variant="outline" onClick={() => setDraftQty((q) => q + 1)}>
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

      {/* Cart / checkout - a single Drawer, stepping between the cart
          review and the required-mobile-number details form rather than
          two separate drawers, since only one is ever open at a time. The
          details step is skipped once a mobile number is already known
          from an earlier round this session - a returning "add more
          items" submit shouldn't have to re-enter contact info. */}
      <Drawer open={drawerStep !== "closed"} onOpenChange={(o) => !o && setDrawerStep("closed")}>
        <DrawerContent className="mx-auto max-w-lg">
          {drawerStep === "cart" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{rounds.length > 0 ? "Add more items" : "Your order"}</DrawerTitle>
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
                <Button
                  disabled={cartList.length === 0 || submitting}
                  onClick={() => (hasContact ? void handleSubmitRound() : setDrawerStep("details"))}
                >
                  {hasContact ? (submitting ? "Placing order…" : "Place order") : "Continue"}
                </Button>
              </DrawerFooter>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>Your details</DrawerTitle>
              </DrawerHeader>
              <div className="space-y-3 px-4">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-name">Name (optional)</Label>
                  <Input
                    id="qr-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-mobile">Mobile number</Label>
                  <Input
                    id="qr-mobile"
                    inputMode="numeric"
                    value={customerMobile}
                    onChange={(e) => {
                      setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setMobileError(null);
                    }}
                    placeholder="10-digit mobile number"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required so staff can reach you about your order.
                  </p>
                  {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
                </div>
                {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
              </div>
              <DrawerFooter>
                <div className="flex items-center justify-between px-1 text-sm font-semibold">
                  <span>Total</span>
                  <span className="num">{formatPrice(restaurant?.currency, cartTotal)}</span>
                </div>
                <Button disabled={submitting} onClick={() => void handleSubmitRound()}>
                  {submitting ? "Placing order…" : "Place order"}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {/* "My Order" - a running receipt across every round this session,
          visible any time (not just right after submitting) and never a
          full-page takeover - the customer can keep browsing/ordering
          while this stays open in the background. Only clears when the
          table-status poll above detects the bill was actually settled. */}
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
                <div key={r.id} className="space-y-1.5 rounded-lg border border-border p-2.5">
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
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {item.qty} × {item.itemName}
                          {item.variantName ? ` (${item.variantName})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="num text-right text-sm font-semibold">
                    {formatPrice(restaurant?.currency, r.total)}
                  </p>
                </div>
              ))
            )}
          </div>
          {rounds.length > 0 ? (
            <DrawerFooter>
              <div className="flex items-center justify-between px-1 text-sm font-semibold">
                <span>Total so far</span>
                <span className="num">{formatPrice(restaurant?.currency, roundsTotal)}</span>
              </div>
              <p className="px-1 text-xs text-muted-foreground">
                Your final bill will be settled by staff at the restaurant.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setOrderHistoryOpen(false);
                  setDrawerStep("cart");
                }}
              >
                Add more items
              </Button>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
