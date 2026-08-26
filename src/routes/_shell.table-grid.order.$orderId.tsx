import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgePercent,
  ChefHat,
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
import { EmptyState, Money, StatusBadge } from "@/components/kit";
import { PaymentSplitEditor } from "@/components/operations/payment-split-editor";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { lineTotal, orderTotals, useStore } from "@/mock/store";
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

function OrderCartPage() {
  const { orderId } = Route.useParams();
  const store = useStore();
  const navigate = useNavigate();
  const order = store.orderById(orderId);

  // Opening a table starts it "Held" with zero items (see startOrder's own
  // comment). removeLine/changeQty already free the table the moment the
  // LAST item is removed, but a table that never had any item added at all
  // never fires that path - it just sits Held forever. Fixed at every
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

  // Barcode wedge - a scanner types fast (<60ms between keystrokes) and
  // ends with Enter, a human doesn't. Matches keyboard-display.tsx's
  // identical listener (that screen had it, this one didn't).
  useEffect(() => {
    let buffer = "";
    let last = 0;
    let fast = 0;
    const onKey = (e: KeyboardEvent) => {
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
  const [addons, setAddons] = useState<SelectedAddon[]>([]);
  const [note, setNote] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "flat">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(0);
  const [noteLineFor, setNoteLineFor] = useState<OrderLine | null>(null);
  const [addonLineFor, setAddonLineFor] = useState<OrderLine | null>(null);
  const [moveKotRound, setMoveKotRound] = useState<number | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [deliveryOverride, setDeliveryOverride] = useState(0);
  const [packagingOverride, setPackagingOverride] = useState(0);

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
  const items = useMemo(
    () =>
      store.menuItems.filter(
        (i) =>
          i.active &&
          categoriesById.get(i.categoryId)?.menuId === activeMenuId &&
          (categoryId === "all" ||
            (categoryId === "fav" ? i.favourite : i.categoryId === categoryId)) &&
          (!q || i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q)),
      ),
    [store.menuItems, categoriesById, categoryId, activeMenuId, q],
  );

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

  const addToCart = (item: MenuItem) => {
    if (item.variants?.length || item.addonGroupIds?.length) {
      setConfigItem(item);
      setVariant(item.variants?.[0]?.name ?? "");
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    disabled={settled}
                    onClick={() => store.setGuestCount(order.id, order.guests - 1)}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="num">{order.guests} guests</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    disabled={settled}
                    onClick={() => store.setGuestCount(order.id, order.guests + 1)}
                  >
                    <Plus className="size-3" />
                  </Button>
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
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            onClick={() => void store.printKot(order.id, round)}
                            aria-label={`Reprint KOT round ${round}`}
                          >
                            <Printer className="size-3.5" />
                          </Button>
                          {order.type === "Dine In" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={() => setMoveKotRound(round)}
                              aria-label={`Move KOT round ${round}`}
                            >
                              <ArrowLeftRight className="size-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <ul className="space-y-2">
                      {lines.map((l) => (
                        <li key={l.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
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
                                <p className="mt-1 text-[11px] italic text-warning">“{l.note}”</p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Money value={lineTotal(l)} className="text-sm font-semibold" />
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="size-7"
                                  disabled={settled}
                                  onClick={() => store.changeQty(order.id, l.id, -1, "biller")}
                                >
                                  <Minus className="size-3.5" />
                                </Button>
                                <span className="num w-6 text-center text-sm font-semibold">
                                  {l.qty}
                                </span>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="size-7"
                                  disabled={settled}
                                  onClick={() => store.changeQty(order.id, l.id, 1, "biller")}
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                                {editable &&
                                store.menuItems.find((m) => m.id === l.itemId)?.addonGroupIds
                                  ?.length ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    onClick={() => setAddonLineFor(l)}
                                    aria-label="Edit addons"
                                  >
                                    <Tags className="size-3.5" />
                                  </Button>
                                ) : null}
                                {editable ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    onClick={() => setNoteLineFor(l)}
                                    aria-label="Add note"
                                  >
                                    <StickyNote className="size-3.5" />
                                  </Button>
                                ) : null}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-primary"
                                  disabled={settled}
                                  onClick={() => store.removeLine(order.id, l.id, "biller")}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
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
                Delivery &amp; packaging
                <button
                  disabled={settled}
                  onClick={() => {
                    setDeliveryOverride(totals.delivery);
                    setPackagingOverride(totals.packaging);
                    setChargesOpen(true);
                  }}
                  className="text-muted-foreground hover:text-primary disabled:opacity-40"
                >
                  <Pencil className="size-3" />
                </button>
              </dt>
              <dd>
                <Money value={totals.delivery + totals.packaging} />
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

          {order.discount?.approvalFlagged ? (
            <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              Discount above threshold — manager approval recorded in audit log.
            </p>
          ) : null}

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
                store.generateKot(order.id);
                goToTables();
              }}
              className={cn(pendingRound && "border-primary text-primary")}
            >
              <ChefHat className="size-4" /> Send KOT
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
                setSplits([{ mode: "Cash", amount: balance }]);
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
              <Label htmlFor="customName">Item name</Label>
              <Input
                id="customName"
                className="mt-1.5"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Special request"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="customPrice">Price (₹)</Label>
                <Input
                  id="customPrice"
                  type="number"
                  className="num mt-1.5"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="customQty">Qty</Label>
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
              disabled={!customName.trim() || customPrice <= 0}
              onClick={() => {
                store.addCustomLine(order.id, customName, customPrice, customQty);
                setCustomItemOpen(false);
              }}
            >
              <Plus className="size-4" /> Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delivery / packaging charge override */}
      <Dialog open={chargesOpen} onOpenChange={setChargesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delivery &amp; packaging charge</DialogTitle>
            <DialogDescription>
              Overrides the outlet's default rule for this order only.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deliveryOverride">Delivery (₹)</Label>
              <Input
                id="deliveryOverride"
                type="number"
                className="num mt-1.5"
                value={deliveryOverride}
                onChange={(e) => setDeliveryOverride(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="packagingOverride">Packaging (₹)</Label>
              <Input
                id="packagingOverride"
                type="number"
                className="num mt-1.5"
                value={packagingOverride}
                onChange={(e) => setPackagingOverride(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                store.setCharges(order.id, deliveryOverride, packagingOverride);
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
              <div className="mt-1.5 flex flex-wrap gap-2">
                {configItem.variants.map((v) => (
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
          <Input
            type="number"
            className="num"
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
          />
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
                        const amount =
                          p.type === "percent"
                            ? Math.round(totals.subtotal * (p.value / 100))
                            : p.value;
                        store.applyDiscount(order.id, p.code, amount);
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
                store.applyDiscount(order.id, "None", 0);
                setDiscountOpen(false);
              }}
            >
              Remove discount
            </Button>
            <Button
              onClick={() => {
                const amount =
                  discountType === "percent"
                    ? Math.round(totals.subtotal * (discountValue / 100))
                    : discountValue;
                store.applyDiscount(
                  order.id,
                  discountType === "percent" ? `${discountValue}%` : `Flat ₹${discountValue}`,
                  amount,
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
      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach customer</DialogTitle>
            <DialogDescription>Used for bill delivery and repeat-visit reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cname">Name</Label>
              <Input
                id="cname"
                className="mt-1.5"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cphone">Mobile</Label>
              <Input
                id="cphone"
                className="num mt-1.5"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
              />
              {digits.length === 10 && dueForPhone.length ? (
                <p className="mt-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                  Outstanding due: <Money value={dueTotalForPhone} className="font-semibold" /> ·{" "}
                  {dueForPhone.length} bill{dueForPhone.length > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {store.customers.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCustName(c.name);
                    setCustPhone(c.phone);
                  }}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                store.setCustomer(order.id, custName, custPhone);
                setCustomerOpen(false);
              }}
            >
              Save customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* settle */}
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

          <PaymentSplitEditor splits={splits} onChange={setSplits} total={balance} />

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
                store.settleOrder(order.id, splits);
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
