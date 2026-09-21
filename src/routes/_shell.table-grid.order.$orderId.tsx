import { FieldError, discountProblem, useFormCheck } from "@/lib/formCheck";
import { searchMenuItems } from "@/lib/menuSearch";
import { CustomerDetailsDialog } from "@/components/billing/customer-details-dialog";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgePercent,
  ChefHat,
  History,
  Minus,
  Pause,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  Send,
  Star,
  StickyNote,
  Tags,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AddonDialog,
  AddonPicker,
  MoveKotDialog,
  NoteDialog,
  type SelectedAddon,
} from "@/components/billing/keyboard-display";
import { EmptyState, IconButton, Money, StatusBadge } from "@/components/kit";
import { PaymentSplitEditor } from "@/components/operations/payment-split-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, customerApi, type RawOrderDetail } from "@/lib/api";
import { connectChangeFeed } from "@/lib/changeFeedSocket";
import { cn } from "@/lib/utils";
import { lineTotal, orderTotals, parseOrderAddons, useStore } from "@/mock/store";
import type { MenuItem, OrderLine, PaymentSplit } from "@/mock/types";

export const Route = createFileRoute("/_shell/table-grid/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Order & Cart · BillerPe" },
      {
        name: "description",
        content:
          "Take orders, punch KOT rounds, apply discounts and settle bills with split payments.",
      },
      { property: "og:title", content: "Order & Cart · BillerPe" },
      {
        property: "og:description",
        content: "Menu punching, KOT rounds, discounts and split settlement.",
      },
    ],
  }),
  component: OrderCartPage,
});

// Starting point for re-entering an edited settled bill's payment: the
// original split, with a higher total's difference added to the default
// mode, or a lower total taken off Due first and then the other modes.
function prefillEditSplits(
  previous: PaymentSplit[],
  total: number,
  defaultMode: PaymentSplit["mode"],
): PaymentSplit[] {
  const round = (n: number) => Math.round(n * 100) / 100;
  const rows = previous.filter((p) => p.amount > 0).map((p) => ({ ...p }));
  if (!rows.length) return [{ mode: defaultMode, amount: round(total) }];
  let diff = round(total - rows.reduce((sum, p) => sum + p.amount, 0));
  if (diff > 0) {
    const row = rows.find((p) => p.mode === defaultMode);
    if (row) row.amount = round(row.amount + diff);
    else rows.push({ mode: defaultMode, amount: diff });
  } else if (diff < 0) {
    const order = [
      ...rows.filter((p) => p.mode === "Due"),
      ...rows.filter((p) => p.mode !== "Due").reverse(),
    ];
    for (const row of order) {
      if (diff >= 0) break;
      const cut = Math.min(row.amount, -diff);
      row.amount = round(row.amount - cut);
      diff = round(diff + cut);
    }
  }
  return rows.filter((p) => p.amount > 0);
}

function OrderCartPage() {
  const { orderId } = Route.useParams();
  const store = useStore();
  const navigate = useNavigate();
  const order = store.orderById(orderId);

  // A browser refresh on the edit-settled-bill screen loses the in-memory
  // edit copy; rebuild it from the exe instead of showing "not found".
  const editMatch = /^edit-(\d+)$/.exec(orderId);
  const [resumingEdit, setResumingEdit] = useState(!order && !!editMatch);
  useEffect(() => {
    if (order || !editMatch) {
      setResumingEdit(false);
      return;
    }
    // Permissions and the exe session load right after a refresh; wait.
    if (!store.sessionReady) return;
    let cancelled = false;
    setResumingEdit(true);
    void store.resumeEditSettledOrder(Number(editMatch[1])).finally(() => {
      if (!cancelled) setResumingEdit(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, !!order, store.sessionReady]);

  // Opening a table starts it "Hold" with zero items (see startOrder's own
  // comment). removeLine/changeQty already free the table the moment the
  // LAST item is removed, but a table that never had any item added at all
  // never fires that path - it just sits Hold forever. Fixed at every
  // explicit "leave this screen" action below (goToTables) rather than an
  // unmount effect - an unmount can fire from framework-internal remounts
  // (e.g. a route re-render) with no real user action behind it, which
  // free'd tables that were still genuinely being opened for the first
  // time (confirmed live - this showed up as an immediate "Order not
  // found" right after clicking a table).
  const goToTables = () => {
    if (order && order.lines.length === 0) store.freeIfEmpty(order.id);
    navigate({ to: "/table-grid" });
  };

  // Promo Codes is confirmed out of scope for the Local EXE - loaded here
  // on the billing screen's own mount (this is the one place it's shown)
  // instead of globally on every route (see AppShell.tsx's own comment).
  // Same 20s cadence as the table grid's own poll (_shell.table-grid.
  // index.tsx) - this screen has no equivalent of its own, so a KOT round
  // added elsewhere while this exact order is open (another terminal, or
  // a QR order accepted in the background) never showed up here until a
  // full page reload. See store.tsx's refreshOrderFromServer for why this
  // is safe to run unconditionally - it no-ops on its own if there's a
  // local draft round in progress, rather than needing a guard here too.
  useEffect(() => {
    if (!order || order.status === "Settled") return;
    const id = setInterval(() => void store.refreshOrderFromServer(orderId), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.status]);

  // Fast path on top of the poll above - see _shell.table-grid.index.tsx's
  // own comment on connectChangeFeed for why this was missing entirely.
  // Matters most here specifically: a captain firing another KOT round
  // while a cashier already has this exact order open to bill it used to
  // not show up for up to 20s.
  useEffect(() => {
    if (!order || order.status === "Settled") return;
    const disconnect = connectChangeFeed({
      onChange: (changedId) => {
        // Only this order's own backend id matters here - every other
        // change is the table grid's business (it keeps its own feed).
        if (order?.backendId === undefined || changedId === order.backendId) {
          void store.refreshOrderFromServer(orderId);
        }
      },
      onConnect: () => void store.refreshOrderFromServer(orderId),
    });
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.status]);

  useEffect(() => {
    void store.loadPromoCodesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Item-wise KOT checkboxes are a per-visit choice, not per-order state -
  // navigating to a different order (or this one settling out from under
  // us) shouldn't leave a stale selection armed for whatever's here next.
  useEffect(() => {
    setSelectedLineIds(new Set());
  }, [orderId]);

  // Barcode wedge - a scanner types fast (<60ms between keystrokes) and
  // ends with Enter, a human doesn't. Matches keyboard-display.tsx's
  // identical listener (that screen had it, this one didn't).
  useEffect(() => {
    let buffer = "";
    let last = 0;
    let fast = 0;
    const onKey = (e: KeyboardEvent) => {
      // Typing inside a dialog (customer mobile, notes...) is never a scan.
      // A quick run of digits and Enter there used to be taken for a
      // barcode, and the Enter was swallowed ("Barcode not recognised").
      if (e.target instanceof Element && e.target.closest("[role=dialog]")) {
        buffer = "";
        fast = 0;
        return;
      }
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (e.key.length === 1) {
        if (gap > 60) {
          buffer = e.key;
          fast = 0;
        } else {
          buffer += e.key;
          fast += 1;
        }
        return;
      }
      if (e.key === "Enter") {
        const isScan = buffer.length >= 4 && fast >= 3 && gap < 120;
        const code = buffer;
        buffer = "";
        fast = 0;
        if (!isScan || !order) return;
        const item = store.menuItems.find(
          (i) =>
            i.active &&
            (i.id.toLowerCase() === code.toLowerCase() ||
              i.name.toLowerCase() === code.toLowerCase()),
        );
        e.preventDefault();
        e.stopPropagation();
        if (!item) {
          toast.error("Barcode not recognised", { description: code });
          return;
        }
        store.addLine(order.id, { itemId: item.id, qty: 1 });
        toast.success(`Scanned · ${item.name}`);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [order, store]);

  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [configItem, setConfigItem] = useState<MenuItem | null>(null);
  const [variant, setVariant] = useState<string>("");
  const [variantQuery, setVariantQuery] = useState("");
  const [addons, setAddons] = useState<SelectedAddon[]>([]);
  const [note, setNote] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "flat">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [custPhone, setCustPhone] = useState("");
  const [lastOrder, setLastOrder] = useState<RawOrderDetail | null>(null);
  const [lastOrderLoading, setLastOrderLoading] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [tip, setTip] = useState(0);
  // Saving an edit of a settled bill: how the full new total was paid.
  const [editPayOpen, setEditPayOpen] = useState(false);
  const [editSplits, setEditSplits] = useState<PaymentSplit[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  // Checked pending (not-yet-sent) lines to KOT right now, leaving the rest
  // of the "New — not sent" group for a later round - store.generateKot's
  // lineIds option. Empty selection keeps the original "Send KOT fires
  // everything pending" behaviour.
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(0);
  const [noteLineFor, setNoteLineFor] = useState<OrderLine | null>(null);
  const [addonLineFor, setAddonLineFor] = useState<OrderLine | null>(null);
  const [moveKotRound, setMoveKotRound] = useState<number | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [packagingOverride, setPackagingOverride] = useState(0);
  const bForm = useFormCheck();
  const bFormReset = bForm.reset;
  useEffect(() => {
    if (!customItemOpen && !chargesOpen && !discountOpen) bFormReset();
  }, [customItemOpen, chargesOpen, discountOpen, bFormReset]);
  const [removeTarget, setRemoveTarget] = useState<OrderLine | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  // removeLine already frees/cancels a real (backendId-having) order the
  // moment its last line goes away (see this file's own top-of-component
  // comment on that) - but that only updates the order's *id* (the
  // rename-to-o-final-<backendId> trick, so a later order on this same
  // table doesn't collide with it) and frees the table; it doesn't move
  // this screen off the now-stale orderId route param, matching task 37's
  // "remove every item from a printed KOT, then menu items stop adding
  // anything" report. Rather than lean on orderById/ensureRealOrder's own
  // fallback re-synthesis of a fresh draft under the old id on the next
  // interaction (real, but easy to get subtly wrong), just leave the
  // screen immediately - same as every other "this action ends the
  // order" exit point on this page already does via goToTables.
  const removeLastLineAndMaybeLeave = (lineId: string, reason?: string) => {
    if (!order) return;
    const wasLastLine = order.lines.length === 1;
    const hadBackendOrder = !!order.backendId;
    const removed = store.removeLine(order.id, lineId, "biller", reason);
    if (removed && wasLastLine && hadBackendOrder) navigate({ to: "/table-grid" });
  };

  // Same fix as removeLastLineAndMaybeLeave, for the decrease-quantity
  // stepper - dropping the last item's qty to 0 removes it exactly like
  // the trash button does (see store.changeQty's own comment).
  const changeQtyAndMaybeLeave = (line: OrderLine, delta: number) => {
    if (!order) return;
    const willRemoveLast = order.lines.length === 1 && line.qty + delta <= 0;
    const hadBackendOrder = !!order.backendId;
    const applied = store.changeQty(order.id, line.id, delta, "biller");
    if (applied && willRemoveLast && hadBackendOrder) navigate({ to: "/table-grid" });
  };

  const totals = orderTotals(order, store);

  const previouslyPaid = (order?.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((totals.grand - previouslyPaid) * 100) / 100;
  const isRefund = previouslyPaid > 0 && balance < 0;

  const defaultMenuId = store.menus.find((m) => m.isDefault)?.id ?? store.menus[0]?.id ?? "";
  const activeMenuId = order?.menuId ?? defaultMenuId;

  const categoriesById = useMemo(
    () => new Map(store.menuCategories.map((c) => [c.id, c])),
    [store.menuCategories],
  );
  const menuCategories = useMemo(
    () => store.menuCategories.filter((c) => c.menuId === activeMenuId && c.active),
    [store.menuCategories, activeMenuId],
  );

  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    const onMenu = store.menuItems.filter(
      (i) => i.active && categoriesById.get(i.categoryId)?.menuId === activeMenuId,
    );
    // A search looks across the whole menu (a SKU from another category must
    // still be found) and ranks exact SKU matches first - lib/menuSearch.ts.
    if (q) return searchMenuItems(onMenu, q);
    return onMenu.filter(
      (i) =>
        categoryId === "all" || (categoryId === "fav" ? i.favourite : i.categoryId === categoryId),
    );
  }, [store.menuItems, categoriesById, categoryId, activeMenuId, q]);

  const kotGroups = useMemo(() => {
    const map = new Map<number, OrderLine[]>();
    (order?.lines ?? []).forEach((l) => {
      const arr = map.get(l.kotRound) ?? [];
      arr.push(l);
      map.set(l.kotRound, arr);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [order?.lines]);

  const digits = custPhone.replace(/\D/g, "");
  const dueForPhone =
    digits.length === 10
      ? store.dueBills.filter((b) => b.mobile === digits && b.status === "Due")
      : [];
  const dueTotalForPhone = dueForPhone.reduce((s, b) => s + b.amount, 0);

  // "Repeat this order" suggestion - fires the same moment the due-bill
  // check above does (10 real digits entered), same reasoning: only worth
  // a real lookup once the number is actually complete. excludeOrderId
  // (this order's own backendId) keeps a returning customer's brand-new,
  // still-empty order from "suggesting" itself.
  useEffect(() => {
    if (digits.length !== 10 || !order) {
      setLastOrder(null);
      return;
    }
    let cancelled = false;
    setLastOrderLoading(true);
    customerApi
      .getLastOrder(digits, order.backendId)
      .then(({ order: found }) => {
        if (!cancelled) setLastOrder(found);
      })
      .catch((err) => {
        if (cancelled) return;
        setLastOrder(null);
        console.error(
          "[order] Could not load last order for customer:",
          err instanceof ApiError ? err.message : err,
        );
      })
      .finally(() => {
        if (!cancelled) setLastOrderLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, order?.backendId]);

  // Adds every still-available item from the suggested last order to the
  // CURRENT cart at today's live price (store.addLine already re-resolves
  // price/variant from the current local menu, same as any other add -
  // never bills the old order's possibly-stale price). An item deleted or
  // deactivated since that order is silently skipped rather than blocking
  // the rest - matches the same "never trust a stale cart wholesale"
  // stance QR ordering's own accept-time repricing already takes.
  const repeatLastOrder = () => {
    if (!order || !lastOrder) return;
    let addedCount = 0;
    for (const line of lastOrder.hms_orderDetails) {
      const itemId = String(line.MenuId);
      if (!store.menuItems.some((m) => m.id === itemId && m.active)) continue;
      store.addLine(order.id, {
        itemId,
        qty: line.qty,
        variant: line.variant_name ?? undefined,
        addons: parseOrderAddons(line.addons),
        note: line.comment || undefined,
      });
      addedCount += 1;
    }
    if (addedCount === 0) {
      toast.error("None of those items are on the menu anymore");
    } else {
      toast.success(`Added ${addedCount} item${addedCount === 1 ? "" : "s"} from their last order`);
    }
  };

  if (!order && resumingEdit) {
    return <div className="p-6 text-sm text-muted-foreground">Opening the bill for editing…</div>;
  }

  if (!order) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Receipt}
          title="Order not found"
          description="This order may have been settled or cancelled."
          action={<Button onClick={() => navigate({ to: "/table-grid" })}>Back to tables</Button>}
        />
      </div>
    );
  }

  const pendingRound = order.lines.some((l) => l.kotRound > order.kotRounds);
  const settled = order.status === "Settled" || order.status === "Cancelled";
  // A generated bill is meant to be settled as printed, not moved/merged
  // afterward - same rule the table-grid page's own Merge/Transfer icons
  // and store.transferTable/mergeTables/moveKot enforce.
  const billed = order.status === "Bill Generated";

  const addToCart = (item: MenuItem) => {
    if (item.variants?.length || item.addonGroupIds?.length) {
      setConfigItem(item);
      setVariant(item.variants?.[0]?.name ?? "");
      setVariantQuery("");
      setAddons([]);
      setNote("");
      return;
    }
    store.addLine(order.id, { itemId: item.id, qty: 1 });
  };

  const paid = splits.reduce((s, p) => s + p.amount, 0);
  const due = Math.round((balance - paid) * 100) / 100;

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1">
      {/* menu side */}
      <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={goToTables}>
            <ArrowLeft className="size-4" /> Tables
          </Button>
          {store.menus.length > 1 ? (
            <Select
              value={activeMenuId}
              onValueChange={(v) => {
                store.setOrderMenu(order.id, v);
                setCategoryId("all");
              }}
            >
              <SelectTrigger className="w-40 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {store.menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by item name or shortcode…"
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={settled}
            onClick={() => {
              setCustomName("");
              setCustomPrice(0);
              setCustomQty(1);
              setCustomItemOpen(true);
            }}
          >
            <Plus className="size-4" /> Custom item
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2 scrollbar-slim">
            {[
              { id: "all", name: "All" },
              { id: "fav", name: "★ Favourites" },
              ...menuCategories,
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "truncate rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  categoryId === c.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-muted",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-slim">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.97 }}
                  disabled={settled}
                  onClick={() => addToCart(item)}
                  className="flex flex-col justify-between rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-colors hover:border-primary/40 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border",
                        item.veg ? "border-success" : "border-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          item.veg ? "bg-success" : "bg-primary",
                        )}
                      />
                    </span>
                    {item.favourite ? (
                      <Star className="size-3.5 fill-warning text-warning" />
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{item.name}</p>
                  {item.sku ? (
                    <p className="num text-[10px] text-muted-foreground">{item.sku}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <Money value={item.price} className="text-sm font-semibold" />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {store.resolveKitchenForCategory(item.categoryId)?.name ?? ""}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* cart side */}
      <aside className="flex min-h-0 flex-col bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {order.tableLabel} · {order.orderNo ? `#${order.orderNo}` : "New"}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{order.type}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <IconButton
                    label="Decrease guest count"
                    className="size-5"
                    disabled={settled}
                    onClick={() => store.setGuestCount(order.id, order.guests - 1)}
                  >
                    <Minus className="size-3" />
                  </IconButton>
                  <span className="num">{order.guests} guests</span>
                  <IconButton
                    label="Increase guest count"
                    className="size-5"
                    disabled={settled}
                    onClick={() => store.setGuestCount(order.id, order.guests + 1)}
                  >
                    <Plus className="size-3" />
                  </IconButton>
                </span>
                <span>· KOT rounds {order.kotRounds}</span>
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <button
            onClick={() => setCustomerOpen(true)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-left text-xs"
          >
            <User className="size-3.5 text-muted-foreground" />
            {order.customerName ? (
              <span>
                {order.customerName} · <span className="num">{order.customerPhone}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Attach customer (optional)</span>
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-slim">
          {order.lines.length === 0 ? (
            <EmptyState
              compact
              icon={Receipt}
              title="Cart is empty"
              description="Tap menu items on the left to punch them into this order."
            />
          ) : (
            <div className="space-y-4">
              {kotGroups.map(([round, lines]) => {
                // Only a line that hasn't been sent to KOT yet is safe to
                // reprice or drop a kitchen note onto here - once sent,
                // that item already exists as a real OrderDetails row at
                // its original price server-side.
                const editable = round > order.kotRounds && !settled;
                return (
                  <div key={round}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <p className="inline-block rounded bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {round > order.kotRounds ? "New — not sent" : `KOT ${round}`}
                      </p>
                      {round <= order.kotRounds ? (
                        <>
                          <IconButton
                            label={`Reprint KOT round ${round}`}
                            className="size-6"
                            onClick={() => void store.printKot(order.id, round)}
                          >
                            <Printer className="size-3.5" />
                          </IconButton>
                          {order.type === "Dine In" && !billed ? (
                            <IconButton
                              label={`Move KOT round ${round}`}
                              className="size-6"
                              onClick={() => setMoveKotRound(round)}
                            >
                              <ArrowLeftRight className="size-3.5" />
                            </IconButton>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <ul className="space-y-2">
                      {lines.map((l) => (
                        <li key={l.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              {editable ? (
                                <Checkbox
                                  className="mt-0.5 shrink-0"
                                  checked={selectedLineIds.has(l.id)}
                                  onCheckedChange={(checked) =>
                                    setSelectedLineIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(l.id);
                                      else next.delete(l.id);
                                      return next;
                                    })
                                  }
                                  aria-label={`Send ${l.name} to the kitchen now`}
                                />
                              ) : null}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{l.name}</p>
                                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                  {l.variant ? `${l.variant} · ` : ""}
                                  {editable ? (
                                    <span className="num inline-flex items-center gap-0.5">
                                      ₹
                                      <input
                                        defaultValue={l.price}
                                        key={`${l.id}-price-${l.price}`}
                                        inputMode="decimal"
                                        aria-label={`Price for ${l.name}`}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onBlur={(e) => {
                                          const v = Number(e.currentTarget.value);
                                          if (Number.isFinite(v) && v !== l.price)
                                            store.setLinePrice(order.id, l.id, v);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") e.currentTarget.blur();
                                        }}
                                        className="num h-5 w-14 rounded border border-border bg-surface px-1 text-xs"
                                      />
                                    </span>
                                  ) : (
                                    <span className="num">₹{l.price}</span>
                                  )}
                                  {l.originTable ? ` · from ${l.originTable}` : ""}
                                </p>
                                {l.addons?.length ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    + {l.addons.map((a) => a.name).join(", ")}
                                  </p>
                                ) : null}
                                {l.note ? (
                                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] italic text-warning">
                                    “{l.note}”
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Money value={lineTotal(l)} className="text-sm font-semibold" />
                              <div className="flex items-center gap-1">
                                <IconButton
                                  label="Decrease quantity"
                                  variant="outline"
                                  className="size-7"
                                  disabled={settled}
                                  onClick={() => changeQtyAndMaybeLeave(l, -1)}
                                >
                                  <Minus className="size-3.5" />
                                </IconButton>
                                <span className="num w-6 text-center text-sm font-semibold">
                                  {l.qty}
                                </span>
                                <IconButton
                                  label="Increase quantity"
                                  variant="outline"
                                  className="size-7"
                                  disabled={settled}
                                  onClick={() => store.changeQty(order.id, l.id, 1, "biller")}
                                >
                                  <Plus className="size-3.5" />
                                </IconButton>
                                {editable &&
                                store.menuItems.find((m) => m.id === l.itemId)?.addonGroupIds
                                  ?.length ? (
                                  <IconButton
                                    label="Edit addons"
                                    className="size-7"
                                    onClick={() => setAddonLineFor(l)}
                                  >
                                    <Tags className="size-3.5" />
                                  </IconButton>
                                ) : null}
                                {editable ? (
                                  <IconButton
                                    label="Add note"
                                    className="size-7"
                                    onClick={() => setNoteLineFor(l)}
                                  >
                                    <StickyNote className="size-3.5" />
                                  </IconButton>
                                ) : null}
                                <IconButton
                                  label="Remove line"
                                  className="size-7 text-primary"
                                  disabled={settled}
                                  onClick={() => {
                                    // Already sent to the kitchen - confirm
                                    // first (task 37), rather than silently
                                    // pulling an item the kitchen may
                                    // already be preparing or has printed.
                                    if (l.kotRound <= order.kotRounds) {
                                      setRemoveTarget(l);
                                      return;
                                    }
                                    removeLastLineAndMaybeLeave(l.id);
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </IconButton>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <dl className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={totals.subtotal} />
            {totals.discount ? (
              <Row label={`Discount (${order.discount?.label})`} value={-totals.discount} />
            ) : null}
            {totals.service ? <Row label="Service charge" value={totals.service} /> : null}
            <div className="flex items-center justify-between text-muted-foreground">
              <dt className="flex items-center gap-1">
                Packaging
                <button
                  disabled={settled}
                  onClick={() => {
                    setPackagingOverride(totals.packaging);
                    setChargesOpen(true);
                  }}
                  className="text-muted-foreground hover:text-primary disabled:opacity-40"
                >
                  <Pencil className="size-3" />
                </button>
              </dt>
              <dd>
                <Money value={totals.packaging} />
              </dd>
            </div>
            {totals.taxLines.map((tx) => (
              <Row key={tx.id} label={tx.name} value={tx.amount} />
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Money value={totals.grand} />
              </dd>
            </div>
          </dl>

          {order.editingSettledOrderId ? (
            // orders.reopenSettled edit-in-progress draft - none of the
            // normal actions above apply (Hold/Send KOT/E-Bill/Bill Print
            // all assume a live, not-yet-settled order; the normal Settle
            // button would try to settle this a second time). Only save or
            // discard the edit.
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  store.cancelEditSettledOrder(order.id);
                  navigate({ to: "/orders" });
                }}
              >
                <X className="size-4" /> Cancel
              </Button>
              <Button
                disabled={!order.lines.length}
                onClick={() => {
                  const defaultMode =
                    order.type === "Dine In"
                      ? store.resolveDefaultPaymentMode(
                          "Dine-in",
                          store.tables.find((t) => t.id === order.tableId)?.categoryId,
                        )
                      : store.resolveDefaultPaymentMode("Pickup");
                  setEditSplits(prefillEditSplits(order.payments ?? [], totals.grand, defaultMode));
                  setEditPayOpen(true);
                }}
              >
                <Save className="size-4" /> Save changes
              </Button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={settled}
                onClick={() => {
                  store.holdOrder(order.id);
                  goToTables();
                }}
              >
                <Pause className="size-4" /> Hold
              </Button>
              <Button
                variant="outline"
                disabled={settled || !order.lines.length}
                onClick={() => {
                  void store.generateBill(order.id).then(() => goToTables());
                }}
              >
                <Save className="size-4" /> Save
              </Button>
              <Button variant="outline" disabled={settled} onClick={() => setDiscountOpen(true)}>
                <BadgePercent className="size-4" /> Discount
              </Button>
              <Button
                variant="outline"
                disabled={settled}
                onClick={() => {
                  const ids = [...selectedLineIds];
                  store.generateKot(order.id, ids.length ? { lineIds: ids } : undefined);
                  setSelectedLineIds(new Set());
                  // A full send (nothing individually checked) keeps the
                  // original "fire everything, move on" flow. Sending just
                  // the checked items stays on this order instead - the
                  // whole point of checking only some was to keep adding to
                  // or sending the rest of this same order afterward.
                  if (!ids.length) goToTables();
                }}
                className={cn(pendingRound && "border-primary text-primary")}
              >
                <ChefHat className="size-4" />{" "}
                {selectedLineIds.size ? `Send KOT (${selectedLineIds.size})` : "Send KOT"}
              </Button>
              <Button
                variant="outline"
                disabled={!order.customerPhone}
                onClick={() => {
                  void store.sendEBill(order.id);
                  goToTables();
                }}
              >
                <Send className="size-4" /> E-Bill
              </Button>
              <Button
                variant="secondary"
                disabled={settled || !order.lines.length}
                onClick={() => {
                  void store.generateBill(order.id, { print: true }).then(() => goToTables());
                }}
              >
                <Printer className="size-4" /> Bill Print
              </Button>
              <Button
                className="col-span-2"
                disabled={settled || !order.lines.length}
                onClick={() => {
                  // Same "this button seeds row zero itself, bypassing
                  // PaymentSplitEditor's own Add-payment-mode default"
                  // situation as table-grid.index.tsx's quick-settle icon -
                  // see that one's comment.
                  const defaultMode =
                    order.type === "Dine In"
                      ? store.resolveDefaultPaymentMode(
                          "Dine-in",
                          store.tables.find((t) => t.id === order.tableId)?.categoryId,
                        )
                      : store.resolveDefaultPaymentMode("Pickup");
                  setSplits([{ mode: defaultMode, amount: balance }]);
                  setTip(0);
                  setSettleOpen(true);
                }}
              >
                <Wallet className="size-4" />{" "}
                {isRefund ? (
                  <>
                    Refund · <Money value={Math.abs(balance)} />
                  </>
                ) : (
                  <>
                    Settle · <Money value={balance} />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* custom item */}
      <Dialog open={customItemOpen} onOpenChange={setCustomItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add custom item</DialogTitle>
            <DialogDescription>
              For one-off charges that aren't on the menu catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="customName" required>
                Item name
              </Label>
              <Input
                {...bForm.fieldProps("customName")}
                id="customName"
                className="mt-1.5"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Special request"
              />
              <FieldError message={bForm.error("customName")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="customPrice" required>
                  Price (₹)
                </Label>
                <Input
                  {...bForm.fieldProps("customPrice")}
                  id="customPrice"
                  type="number"
                  min={0}
                  className="num mt-1.5"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value) || 0)}
                />
                <FieldError message={bForm.error("customPrice")} />
              </div>
              <div>
                <Label htmlFor="customQty" required>
                  Qty
                </Label>
                <Input
                  id="customQty"
                  type="number"
                  min={1}
                  className="num mt-1.5"
                  value={customQty}
                  onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const valid = bForm.check([
                  { key: "customName", label: "Item name", value: customName },
                  {
                    key: "customPrice",
                    label: "Price",
                    value: customPrice,
                    valid: (v) => typeof v === "number" && v > 0,
                    message: "Price must be more than ₹0",
                  },
                ]);
                if (!valid) return;
                store.addCustomLine(order.id, customName.trim(), customPrice, customQty);
                setCustomItemOpen(false);
              }}
            >
              <Plus className="size-4" /> Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* packaging charge override */}
      <Dialog open={chargesOpen} onOpenChange={setChargesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Packaging charge</DialogTitle>
            <DialogDescription>
              Overrides the outlet's default rule for this order only.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="packagingOverride">Packaging (₹)</Label>
            <Input
              {...bForm.fieldProps("packaging")}
              id="packagingOverride"
              type="number"
              min={0}
              className="num mt-1.5"
              value={packagingOverride}
              onChange={(e) => setPackagingOverride(Number(e.target.value) || 0)}
            />
            <FieldError message={bForm.error("packaging")} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const valid = bForm.check([
                  {
                    key: "packaging",
                    label: "Packaging",
                    value: packagingOverride,
                    valid: (v) => typeof v === "number" && v >= 0,
                    message: "Packaging can't be negative",
                  },
                ]);
                if (!valid) return;
                store.setCharges(order.id, packagingOverride);
                setChargesOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* item config */}
      <Dialog open={!!configItem} onOpenChange={(o) => !o && setConfigItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{configItem?.name}</DialogTitle>
            <DialogDescription>Choose variant, addons and kitchen instructions.</DialogDescription>
          </DialogHeader>

          {configItem?.variants?.length ? (
            <div>
              <Label>Variant</Label>
              {configItem.variants.length > 8 ? (
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="Search variants…"
                    value={variantQuery}
                    onChange={(e) => setVariantQuery(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-2">
                {configItem.variants
                  .filter((v) => v.name.toLowerCase().includes(variantQuery.trim().toLowerCase()))
                  .map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariant(v.name)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm",
                        variant === v.name ? "border-primary bg-primary-soft" : "border-border",
                      )}
                    >
                      {v.name} · <span className="num">₹{v.price}</span>
                    </button>
                  ))}
              </div>
              {variantQuery.trim() &&
              !configItem.variants.some((v) =>
                v.name.toLowerCase().includes(variantQuery.trim().toLowerCase()),
              ) ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No variants match "{variantQuery}"
                </p>
              ) : null}
            </div>
          ) : null}

          {configItem?.addonGroupIds?.length ? (
            <AddonPicker
              groups={configItem.addonGroupIds
                .map((gid) => store.addonGroups.find((g) => g.id === gid))
                .filter((g): g is (typeof store.addonGroups)[number] => !!g)}
              value={addons}
              onChange={setAddons}
            />
          ) : null}

          <div>
            <Label htmlFor="note">Kitchen note</Label>
            <Input
              id="note"
              className="mt-1.5"
              placeholder="e.g. less spicy, no onion"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                if (!configItem) return;
                store.addLine(order.id, {
                  itemId: configItem.id,
                  qty: 1,
                  variant: variant || undefined,
                  addons: addons.length ? addons : undefined,
                  note: note || undefined,
                });
                setConfigItem(null);
              }}
            >
              <Plus className="size-4" /> Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* discount */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply discount</DialogTitle>
            <DialogDescription>
              Discounts above 20% require manager approval and are audit-logged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            {(["percent", "flat"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDiscountType(t)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                  discountType === t ? "border-primary bg-primary-soft" : "border-border",
                )}
              >
                {t === "percent" ? "Percentage" : "Flat amount"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discountValue" required>
              {discountType === "percent" ? "Percent off" : "Amount off (₹)"}
            </Label>
            <Input
              {...bForm.fieldProps("discount")}
              id="discountValue"
              type="number"
              min={0}
              className="num"
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
            />
            <FieldError message={bForm.error("discount")} />
          </div>
          {store.promoCodes.filter((p) => p.active).length ? (
            <div>
              <Label className="text-xs text-muted-foreground">Promo codes</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {store.promoCodes
                  .filter((p) => p.active)
                  .map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        store.applyDiscount(
                          order.id,
                          p.code,
                          p.type === "percent" ? "percent" : "flat",
                          p.value,
                        );
                        setDiscountOpen(false);
                      }}
                    >
                      {p.code}
                    </Button>
                  ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                store.applyDiscount(order.id, "None", "flat", 0);
                setDiscountOpen(false);
              }}
            >
              Remove discount
            </Button>
            <Button
              onClick={() => {
                const subtotal = order.itemised
                  ? order.lines.reduce((sum, l) => sum + lineTotal(l), 0)
                  : (order.fallbackTotal ?? 0);
                const problem = discountProblem(discountType, discountValue, subtotal);
                const valid = bForm.check([
                  {
                    key: "discount",
                    label: "Discount",
                    value: discountValue,
                    valid: () => !problem,
                    message: problem ?? "",
                  },
                ]);
                if (!valid) return;
                store.applyDiscount(
                  order.id,
                  discountType === "percent" ? `${discountValue}%` : `Flat ₹${discountValue}`,
                  discountType,
                  discountValue,
                );
                setDiscountOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* customer */}
      <CustomerDetailsDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        initial={{
          phone: order.customerPhone,
          name: order.customerName,
          address: order.customerAddress,
          gstin: order.customerGstin,
        }}
        onPhoneChange={setCustPhone}
        onSave={(d) =>
          store.setCustomer(order.id, d.name, d.phone, { address: d.address, gstin: d.gstin })
        }
        onClear={() => store.setCustomer(order.id, "", "")}
      >
        {() => (
          <>
            {digits.length === 10 && dueForPhone.length ? (
              <p className="mt-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                Outstanding due: <Money value={dueTotalForPhone} className="font-semibold" /> ·{" "}
                {dueForPhone.length} bill{dueForPhone.length > 1 ? "s" : ""}
              </p>
            ) : null}
            {digits.length === 10 && lastOrderLoading ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Checking their last order…</p>
            ) : null}
            {digits.length === 10 && !lastOrderLoading && lastOrder ? (
              <div className="mt-1.5 space-y-1.5 rounded-lg bg-surface-muted px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="size-3.5" /> Last order · Bill #{lastOrder.bill_no}
                </p>
                <p className="text-xs">
                  {lastOrder.hms_orderDetails
                    .map((l) => `${l.qty}× ${l.hms_menu_mst?.item_name ?? "Item"}`)
                    .join(", ")}
                </p>
                <Button size="sm" variant="outline" className="w-full" onClick={repeatLastOrder}>
                  <History className="size-3.5" /> Repeat this order
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CustomerDetailsDialog>

      {/* settle */}
      {/* edit of a settled bill: the biller decides how the FULL new
          total was paid - cash, UPI, card, due (needs a mobile) or a mix. */}
      <Dialog open={editPayOpen} onOpenChange={(o) => !editSaving && setEditPayOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment for the edited bill · {order.tableLabel}</DialogTitle>
            <DialogDescription>
              Enter how the full bill of <Money value={totals.grand} /> was paid. It started from
              the original payment; change it to what the customer actually paid.
            </DialogDescription>
          </DialogHeader>
          {previouslyPaid > 0 ? (
            <div className="space-y-1 rounded-xl bg-surface-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Originally paid</span>
                <span>
                  {(order.payments ?? [])
                    .filter((p) => p.amount > 0)
                    .map((p) => `${p.mode} ₹${p.amount}`)
                    .join(" + ")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">New bill total</span>
                <Money value={totals.grand} className="font-medium" />
              </div>
            </div>
          ) : null}
          <PaymentSplitEditor
            splits={editSplits}
            onChange={setEditSplits}
            total={totals.grand}
            orderType={order.type === "Dine In" ? "Dine-in" : "Pickup"}
            tableCategoryId={
              order.type === "Dine In"
                ? store.tables.find((t) => t.id === order.tableId)?.categoryId
                : undefined
            }
          />
          <DialogFooter>
            <Button
              data-edit-pay-confirm
              disabled={editSaving}
              onClick={() => {
                const paid = editSplits.reduce((sum, p) => sum + p.amount, 0);
                const gap = Math.round((totals.grand - paid) * 100) / 100;
                if (Math.abs(gap) > 0.009) {
                  toast.error("Payments must add up to the bill total", {
                    description: `${gap > 0 ? "Remaining" : "Over by"} ₹${Math.abs(gap).toLocaleString("en-IN")}`,
                  });
                  return;
                }
                const duePortion = editSplits
                  .filter((p) => p.mode === "Due")
                  .reduce((sum, p) => sum + p.amount, 0);
                if (duePortion > 0 && !order.customerPhone) {
                  setEditPayOpen(false);
                  setCustomerOpen(true);
                  toast.info("Add the customer's mobile number to keep part of this bill as Due");
                  return;
                }
                setEditSaving(true);
                void store
                  .saveSettledOrderEdits(
                    order.id,
                    editSplits.filter((p) => p.amount > 0),
                  )
                  .then((ok) => {
                    if (ok) {
                      setEditPayOpen(false);
                      navigate({ to: "/orders" });
                    }
                  })
                  .finally(() => setEditSaving(false));
              }}
            >
              <Save className="size-4" /> {editSaving ? "Saving…" : "Save bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isRefund ? "Refund" : "Settle bill"} · {order.tableLabel}
            </DialogTitle>
            <DialogDescription>
              {previouslyPaid > 0
                ? isRefund
                  ? "This bill was already paid and now totals less — refund the difference."
                  : "This bill was already partly paid — collect just the remaining balance."
                : "Single or split payment. Amounts must add up to the bill total."}
            </DialogDescription>
          </DialogHeader>

          {previouslyPaid > 0 ? (
            <div className="rounded-xl bg-surface-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Already collected</span>
                <Money value={previouslyPaid} className="font-medium" />
              </div>
            </div>
          ) : null}

          <PaymentSplitEditor
            splits={splits}
            onChange={setSplits}
            total={balance}
            orderType={order.type === "Dine In" ? "Dine-in" : "Pickup"}
            tableCategoryId={
              order.type === "Dine In"
                ? store.tables.find((t) => t.id === order.tableId)?.categoryId
                : undefined
            }
          />

          {order.type === "Dine In" && !isRefund ? (
            <div className="space-y-1.5">
              <Label>Tip (optional)</Label>
              <Input
                type="number"
                className="num"
                value={tip || ""}
                placeholder="0"
                onChange={(e) => setTip(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => {
                if (Math.abs(due) > 0.5) {
                  toast.error(
                    isRefund
                      ? "Split does not match refund total"
                      : "Split does not match bill total",
                    { description: `Balance of ₹${due.toLocaleString("en-IN")} remaining.` },
                  );
                  return;
                }
                // store.settleOrder rejects this same case with a toast
                // only (it has no way to open a route-level dialog) -
                // catching it here first means the biller gets taken
                // straight to "Attach customer" instead of just an error
                // with no obvious next step.
                const duePortion = splits
                  .filter((p) => p.mode === "Due")
                  .reduce((sum, p) => sum + p.amount, 0);
                if (duePortion > 0 && !order.customerPhone) {
                  setSettleOpen(false);
                  setCustomerOpen(true);
                  toast.info("Add a name and mobile number to settle part of this bill as Due");
                  return;
                }
                store.settleOrder(order.id, splits, isRefund ? undefined : tip || undefined);
                setSettleOpen(false);
                goToTables();
              }}
            >
              <Wallet className="size-4" /> {isRefund ? "Confirm refund" : "Confirm settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NoteDialog line={noteLineFor} order={order} onClose={() => setNoteLineFor(null)} />
      <AddonDialog line={addonLineFor} order={order} onClose={() => setAddonLineFor(null)} />
      <MoveKotDialog round={moveKotRound} order={order} onClose={() => setMoveKotRound(null)} />

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRemoveTarget(null);
            setRemoveReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This item was already sent to the kitchen. Removing it now won't undo any preparation
              already started - make sure the kitchen knows before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="remove-reason">Reason (optional, kept in the audit log)</Label>
            <Textarea
              id="remove-reason"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="e.g. guest changed their mind, kitchen out of stock…"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removeTarget) return;
                removeLastLineAndMaybeLeave(removeTarget.id, removeReason.trim() || undefined);
                setRemoveTarget(null);
                setRemoveReason("");
              }}
            >
              Remove item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}
