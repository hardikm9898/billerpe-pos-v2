import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftRight,
  BadgePercent,
  ChefHat,
  Clock,
  CornerDownLeft,
  Keyboard as KeyboardIcon,
  LayoutList,
  Minus,
  Pause,
  Plus,
  PlusSquare,
  Printer,
  Receipt,
  Save,
  ScanLine,
  Search,
  Send,
  ShoppingBag,
  StickyNote,
  Tags,
  Timer,
  Trash2,
  User,
  Utensils,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/kit";
import { UpiQrPanel } from "@/components/operations/payment-split-editor";
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
import { cn } from "@/lib/utils";
import { RESTAURANT } from "@/mock/data";
import { elapsedFrom, elapsedMinutes } from "@/mock/format";
import { lineTotal, orderTotals, useStore } from "@/mock/store";
import type { AddonGroup, MenuItem, Order, OrderLine, PaymentSplit } from "@/mock/types";

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

export function Keycap({
  children,
  tone = "default",
}: {
  children: string;
  tone?: "default" | "invert";
}) {
  return (
    <kbd
      className={cn(
        "num inline-grid h-5 min-w-[1.6rem] place-items-center rounded-[5px] border px-1 text-[10px] font-semibold leading-none tracking-wide shadow-[0_1px_0_var(--border-strong)]",
        tone === "invert"
          ? "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground"
          : "border-border-strong bg-surface text-muted-foreground",
      )}
    >
      {children}
    </kbd>
  );
}

function PanelTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 border-b border-border bg-surface-muted/60 px-3">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="size-3.5" />
        {children}
      </span>
      {right}
    </div>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface focus-visible:border-primary";

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num tabular-nums", className)}>
      ₹{value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* totals — mirrors the outlet billing rules configured in Operations   */
/* ------------------------------------------------------------------ */

function useBillTotals(order: Order | undefined) {
  const store = useStore();
  return useMemo(() => orderTotals(order, store), [order, store]);
}

/* ------------------------------------------------------------------ */
/* main screen                                                         */
/* ------------------------------------------------------------------ */

type LineState = "H" | "K" | "D";

export function KeyboardDisplay({ orderId }: { orderId: string }) {
  const store = useStore();
  const navigate = useNavigate();
  const order = store.orderById(orderId);
  const totals = useBillTotals(order);

  /* search + entry */
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pending, setPending] = useState<MenuItem | null>(null);
  const [pendingVariant, setPendingVariant] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantIdx, setVariantIdx] = useState(0);

  /* dialogs */
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveKotRound, setMoveKotRound] = useState<number | null>(null);
  const [noteLine, setNoteLine] = useState<OrderLine | null>(null);
  const [addonLine, setAddonLine] = useState<OrderLine | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(0);
  const [customQty, setCustomQty] = useState(1);

  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);

  const anyModalOpen =
    discountOpen ||
    customerOpen ||
    moveOpen ||
    settleOpen ||
    newOrderOpen ||
    variantOpen ||
    customItemOpen ||
    !!noteLine ||
    !!addonLine;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return store.menuItems
      .filter((i) => i.active && (i.name.toLowerCase().includes(q) || i.id.toLowerCase() === q))
      .slice(0, 8);
  }, [store.menuItems, query]);

  useEffect(() => setHighlight(0), [query]);

  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  /* ---------------- item entry flow ---------------- */

  const pickItem = (item: MenuItem) => {
    setPending(item);
    setQuery(item.name);
    setQty("1");
    if (item.variants?.length) {
      setVariantIdx(0);
      setPendingVariant(item.variants[0]?.name ?? "");
      setVariantOpen(true);
      return;
    }
    setPendingVariant("");
    window.setTimeout(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 10);
  };

  const commitPending = (variant?: string) => {
    if (!order || !pending) return;
    const n = Math.max(1, Number(qty) || 0);
    store.addLine(order.id, {
      itemId: pending.id,
      qty: n,
      ...((variant ?? pendingVariant) ? { variant: variant ?? pendingVariant } : {}),
    });
    setPending(null);
    setPendingVariant("");
    setQuery("");
    setQty("1");
    window.setTimeout(focusSearch, 60);
  };

  /* ---------------- barcode wedge (focus-safe) ---------------- */

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
        // a human never types 4+ chars at <60ms apart — that is the scanner
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
        setQuery("");
        window.setTimeout(focusSearch, 30);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [order, store]);

  /* ---------------- function keys (always live) ---------------- */

  const sentLines = order?.lines.filter((l) => l.kotRound <= (order?.kotRounds ?? 0)) ?? [];
  const newLines = order?.lines.filter((l) => l.kotRound > (order?.kotRounds ?? 0)) ?? [];
  const settled = order?.status === "Settled" || order?.status === "Cancelled";

  // Opening a table/pickup order starts it "Held" with zero items (see
  // startOrder's own comment). removeLine/changeQty already free it the
  // moment the LAST item is removed, but a draft that never had anything
  // added never fires that path. Fixed here (the one place every "leave
  // this order" action funnels through) rather than an unmount effect - an
  // unmount can fire from framework-internal remounts with no real user
  // action behind it, which free'd tables that were still genuinely being
  // opened for the first time (confirmed live as an immediate "Order not
  // found" right after clicking a table).
  const moveToNewOrder = () => {
    if (order && order.lines.length === 0) store.freeIfEmpty(order.id);
    const nextId = store.startDefaultOrder();
    navigate({ to: "/keyboard-billing/$orderId", params: { orderId: nextId }, replace: true });
  };
  const doKot = () => {
    if (!order || settled) return;
    if (!newLines.length) {
      toast.error("Nothing new to send", { description: "Add items before printing a KOT." });
      return;
    }
    store.generateKot(order.id);
    moveToNewOrder();
  };
  const doHold = () => {
    if (!order || settled) return;
    store.holdOrder(order.id);
    moveToNewOrder();
  };
  const doSave = () => {
    if (!order || settled) return;
    if (!order.lines.length) {
      toast.error("Cart is empty");
      return;
    }
    void store.generateBill(order.id).then(() => moveToNewOrder());
  };
  const doBillPrint = () => {
    if (!order || settled) return;
    if (!order.lines.length) {
      toast.error("Cart is empty");
      return;
    }
    void store.generateBill(order.id, { print: true }).then(() => moveToNewOrder());
  };
  const doReprint = () => {
    if (!order) return;
    void store.printBill(order.id);
  };
  const openCustomItem = () => {
    if (!order || settled) return;
    setCustomName("");
    setCustomPrice(0);
    setCustomQty(1);
    setCustomItemOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k !== "F2" && k !== "F3" && k !== "F4" && k !== "F5" && k !== "F6") return;
      e.preventDefault();
      if (k === "F4") {
        focusSearch();
        return;
      }
      if (anyModalOpen) return;
      if (k === "F2") doBillPrint();
      if (k === "F3") doKot();
      if (k === "F5") doHold();
      if (k === "F6") openCustomItem();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!order) {
    return (
      <div className="grid h-[calc(100vh-4rem)] place-items-center p-8 text-center">
        <div>
          <Receipt className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Order not found</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/keyboard-billing" })}>
            Back to Keyboard Billing
          </Button>
        </div>
      </div>
    );
  }

  const lineState = (l: OrderLine): LineState => {
    if (l.kotRound > order.kotRounds) return "H";
    const kot = store.kots.find((k) => k.orderId === order.id && k.round === l.kotRound);
    return kot && (kot.status === "Served" || kot.status === "Ready") ? "D" : "K";
  };

  const grouped: Record<LineState, OrderLine[]> = { H: [], K: [], D: [] };
  order.lines.forEach((l) => grouped[lineState(l)].push(l));

  const openOrders = store.orders.filter(
    (o) =>
      o.id !== order.id &&
      (o.status === "Running" || o.status === "Held" || o.status === "Bill Generated"),
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      {/* ================= header ================= */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            KB
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">Keyboard Billing</p>
            <p className="num text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {RESTAURANT.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2 py-1">
          <Utensils className="size-3.5 text-muted-foreground" />
          <button
            type="button"
            disabled={settled}
            title="Change order type"
            onClick={() => {
              if (order.type === "Dine In") {
                store.setOrderType(order.id, "Pickup");
              } else {
                store.setOrderType(order.id, "Dine In");
                setMoveOpen(true);
              }
            }}
            className={cn(
              "rounded text-xs font-semibold underline decoration-dashed underline-offset-2",
              focusRing,
              settled && "no-underline",
            )}
          >
            {order.type}
          </button>
          <span className="text-border-strong">·</span>
          <span className="num text-xs font-semibold text-primary">{order.tableLabel}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            disabled={settled}
            onClick={() => setMoveOpen(true)}
          >
            <ArrowLeftRight className="size-3" /> {order.tableId ? "Move" : "Assign table"}
          </Button>
        </div>

        <button
          onClick={() => setCustomerOpen(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary/50",
            focusRing,
          )}
        >
          <User className="size-3.5 text-muted-foreground" />
          {order.customerName ? (
            <span className="font-medium">
              {order.customerName} · <span className="num">{order.customerPhone}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Add customer</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {store.connection === "online" ? (
              <Wifi className="size-3.5 text-success" />
            ) : (
              <WifiOff className="size-3.5 text-warning" />
            )}
            {store.connection}
          </span>
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <Clock className="size-3.5" /> #{order.orderNo} · {order.status}
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setNewOrderOpen(true)}>
            <PlusSquare className="size-3.5" /> New order
          </Button>
        </div>
      </header>

      {/* ================= body ================= */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_320px] xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* ---- left: context ---- */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-border bg-surface scrollbar-slim lg:flex">
          <PanelTitle
            icon={LayoutList}
            right={
              <span className="num rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {openOrders.length}
              </span>
            }
          >
            Running orders
          </PanelTitle>
          <ul className="divide-y divide-border border-b border-border">
            {openOrders.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => {
                    if (order && order.id !== o.id && order.lines.length === 0) {
                      store.freeIfEmpty(order.id);
                    }
                    if (o.status === "Held") store.saveOrder(o.id);
                    navigate({
                      to: "/keyboard-billing/$orderId",
                      params: { orderId: o.id },
                    });
                  }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-muted"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      #{o.orderNo} · {o.tableLabel}
                    </span>
                    <StatusBadge status={o.status} className="shrink-0" />
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{o.type}</span>
                    <Amount
                      value={orderTotals(o, store).grand}
                      className="font-medium text-foreground"
                    />
                  </span>
                </button>
              </li>
            ))}
            {openOrders.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                No other open orders.
              </li>
            ) : null}
          </ul>

          <PanelTitle icon={Receipt}>Order context</PanelTitle>
          <div className="space-y-3 p-3">
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Order</p>
              <p className="num text-lg font-bold">#{order.orderNo}</p>
              <p className="text-[11px] text-muted-foreground">
                {order.type} · {order.guests} guests · KOT {order.kotRounds}
              </p>
            </div>

            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Table</p>
              <p className="num text-base font-semibold">{order.tableLabel}</p>
              {!order.tableId ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No table assigned — pick one below to seat this order.
                </p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 w-full text-[11px]"
                disabled={settled}
                onClick={() => setMoveOpen(true)}
              >
                <ArrowLeftRight className="size-3" />{" "}
                {order.tableId ? "Move table" : "Assign table"}
              </Button>
            </div>

            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Customer
              </p>
              {order.customerName ? (
                <>
                  <p className="text-sm font-semibold">{order.customerName}</p>
                  <p className="num text-[11px] text-muted-foreground">{order.customerPhone}</p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">Not attached</p>
              )}
              <div className="mt-2 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-[11px]"
                  onClick={() => setCustomerOpen(true)}
                >
                  {order.customerName ? "Edit" : "Search"}
                </Button>
                {order.customerName ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={() => store.setCustomer(order.id, "", "")}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-muted/60 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <KeyboardIcon className="size-3.5" /> Shortcuts
              </p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {[
                  ["F2", "Bill & Print"],
                  ["F3", "KOT & Print"],
                  ["F4", "Focus search"],
                  ["F5", "Hold order"],
                  ["F6", "Custom item"],
                  ["↑↓", "Move in list"],
                  ["Enter", "Confirm / next qty"],
                  ["Esc", "Close popup"],
                ].map(([k, label]) => (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <Keycap>{k as string}</Keycap>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* ---- center: entry + cart ---- */}
        <section className="flex min-h-0 flex-col border-r border-border">
          {/* entry bar */}
          <div className="border-b border-border bg-surface p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  disabled={settled}
                  autoFocus
                  placeholder="Search item or scan barcode…"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPending(null);
                  }}
                  onKeyDown={(e) => {
                    if (!matches.length) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlight((h) => (h + 1) % matches.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlight((h) => (h - 1 + matches.length) % matches.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const item = matches[highlight];
                      if (item) pickItem(item);
                    } else if (e.key === "Escape") {
                      setQuery("");
                    }
                  }}
                  className={cn("h-11 pl-9 pr-20 text-sm font-medium", focusRing)}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  <ScanLine className="size-3.5 text-muted-foreground" />
                  <Keycap>F4</Keycap>
                </span>

                <AnimatePresence>
                  {matches.length && !pending ? (
                    <motion.ul
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg scrollbar-slim"
                    >
                      {matches.map((m, i) => (
                        <li key={m.id}>
                          <button
                            onMouseEnter={() => setHighlight(i)}
                            onClick={() => pickItem(m)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                              i === highlight
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-surface-muted",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  "num rounded px-1 text-[10px] font-semibold",
                                  i === highlight
                                    ? "bg-primary-foreground/20"
                                    : "bg-surface-muted text-muted-foreground",
                                )}
                              >
                                {m.id.toUpperCase()}
                              </span>
                              <span className="truncate font-medium">{m.name}</span>
                            </span>
                            <span className="num text-xs font-semibold">₹{m.price}</span>
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    ref={qtyRef}
                    value={qty}
                    disabled={settled}
                    inputMode="numeric"
                    onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (pending) commitPending();
                        else focusSearch();
                      }
                    }}
                    className={cn(
                      "h-11 w-24 pl-3 pr-9 text-center text-sm font-semibold",
                      focusRing,
                    )}
                    aria-label="Quantity"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground">
                    qty
                  </span>
                </div>
                <Button
                  className="h-11"
                  disabled={!pending || settled}
                  onClick={() => commitPending()}
                >
                  <CornerDownLeft className="size-4" /> Add
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={settled}
                  onClick={openCustomItem}
                >
                  <Keycap>F6</Keycap> <Plus className="size-4" /> Custom
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Type to filter · <Keycap>↑↓</Keycap> highlight · <Keycap>Enter</Keycap> select, then
              type qty and press <Keycap>Enter</Keycap> to add. Scanner input is added instantly.
            </p>
          </div>

          {/* cart */}
          <div ref={cartRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
            {order.lines.length === 0 ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div>
                  <Receipt className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">Cart is empty</p>
                  <p className="text-xs text-muted-foreground">
                    Press <Keycap>F4</Keycap> and start typing an item name or code.
                  </p>
                </div>
              </div>
            ) : (
              (["H", "K", "D"] as LineState[]).map((state) =>
                grouped[state].length ? (
                  <CartGroup
                    key={state}
                    state={state}
                    lines={grouped[state]}
                    order={order}
                    onNote={setNoteLine}
                    onAddon={setAddonLine}
                    onMoveKot={setMoveKotRound}
                  />
                ) : null,
              )
            )}
          </div>
        </section>

        {/* ---- right: bill summary ---- */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-t border-border bg-surface scrollbar-slim lg:border-t-0">
          <PanelTitle icon={Wallet}>Bill summary</PanelTitle>
          <div className="space-y-1.5 p-3 text-sm">
            <Row label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 ? (
              <Row
                label={`Discount${order.discount?.label ? ` · ${order.discount.label}` : ""}`}
                value={-totals.discount}
                tone="success"
              />
            ) : null}
            {totals.service > 0 ? <Row label="Service charge" value={totals.service} /> : null}
            {totals.taxLines.map((t) => (
              <Row key={t.id} label={t.name} value={t.amount} muted />
            ))}
            {totals.delivery > 0 ? <Row label="Delivery charge" value={totals.delivery} /> : null}
            {totals.packaging > 0 ? (
              <Row label="Packaging charge" value={totals.packaging} />
            ) : null}
          </div>

          <div className="mx-3 rounded-xl border border-primary/25 bg-primary-soft px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-soft-foreground/80">
              Grand total
            </p>
            <Amount
              value={totals.grand}
              className="text-3xl font-bold text-primary-soft-foreground"
            />
          </div>

          <div className="p-3">
            <Button
              variant="outline"
              className="h-9 w-full justify-start"
              disabled={settled}
              onClick={() => setDiscountOpen(true)}
            >
              <BadgePercent className="size-4" />
              {order.discount ? "Edit discount" : "Apply discount"}
            </Button>
          </div>

          <PanelTitle icon={Wallet}>Payment</PanelTitle>
          <PaymentPanel order={order} grand={totals.grand} onSettle={() => setSettleOpen(true)} />
        </aside>
      </div>

      {/* ================= action bar ================= */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-2">
        <Button variant="outline" className="h-10" disabled={settled} onClick={doHold}>
          <Keycap>F5</Keycap> <Pause className="size-4" /> Hold
        </Button>
        <Button variant="outline" className="h-10" disabled={settled} onClick={doKot}>
          <Keycap>F3</Keycap> <ChefHat className="size-4" /> KOT & Print
        </Button>
        <Button
          variant="outline"
          className="h-10"
          disabled={settled || !order.lines.length}
          onClick={doSave}
        >
          <Save className="size-4" /> Save
        </Button>
        <Button
          variant="outline"
          className="h-10"
          disabled={settled || !order.customerPhone}
          title={order.customerPhone ? undefined : "Attach a customer phone number first"}
          onClick={() => void store.sendEBill(order.id)}
        >
          <Send className="size-4" /> E-Bill
        </Button>
        <Button variant="outline" className="h-10" onClick={doReprint}>
          <Printer className="size-4" /> Reprint
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:block">
            {newLines.length
              ? `${newLines.length} new line(s) not sent`
              : `${sentLines.length} line(s) sent`}
          </span>
          <Button className="h-10 px-5" disabled={settled} onClick={doBillPrint}>
            <Keycap tone="invert">F2</Keycap> <Printer className="size-4" /> Bill & Print
          </Button>
        </div>
      </footer>

      {/* ================= popups ================= */}
      <VariantPopup
        open={variantOpen}
        item={pending}
        index={variantIdx}
        setIndex={setVariantIdx}
        onCancel={() => {
          setVariantOpen(false);
          setPending(null);
          setQuery("");
          window.setTimeout(focusSearch, 30);
        }}
        onConfirm={(name) => {
          setVariantOpen(false);
          setPendingVariant(name);
          window.setTimeout(() => {
            qtyRef.current?.focus();
            qtyRef.current?.select();
          }, 30);
        }}
      />

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        order={order}
        subtotal={totals.subtotal}
      />
      <CustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} order={order} />
      <MoveTableDialog open={moveOpen} onOpenChange={setMoveOpen} order={order} />
      <MoveKotDialog round={moveKotRound} order={order} onClose={() => setMoveKotRound(null)} />
      <NoteDialog line={noteLine} order={order} onClose={() => setNoteLine(null)} />
      <AddonDialog line={addonLine} order={order} onClose={() => setAddonLine(null)} />
      <NewOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        currentOrderId={order?.id}
      />
      <CustomItemDialog
        open={customItemOpen}
        onOpenChange={setCustomItemOpen}
        order={order}
        name={customName}
        setName={setCustomName}
        price={customPrice}
        setPrice={setCustomPrice}
        qty={customQty}
        setQty={setCustomQty}
        onAdded={() => window.setTimeout(focusSearch, 30)}
      />
      <SettleDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        order={order}
        grand={totals.grand}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* summary row                                                         */
/* ------------------------------------------------------------------ */

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: number;
  tone?: "success";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-xs", muted ? "text-muted-foreground" : "text-foreground")}>
        {label}
      </span>
      <Amount
        value={value}
        className={cn(
          "text-sm font-semibold",
          tone === "success" && "text-success",
          muted && "font-medium text-muted-foreground",
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* cart                                                                */
/* ------------------------------------------------------------------ */

const stateMeta: Record<LineState, { label: string; badge: string; ring: string }> = {
  H: {
    label: "Current — not sent",
    badge: "bg-warning-soft text-warning-foreground",
    ring: "border-warning/40",
  },
  K: {
    label: "Sent to kitchen",
    badge: "bg-info-soft text-info-foreground",
    ring: "border-border",
  },
  D: {
    label: "Delivered",
    badge: "bg-success-soft text-success-foreground",
    ring: "border-border",
  },
};

function CartGroup({
  state,
  lines,
  order,
  onNote,
  onAddon,
  onMoveKot,
}: {
  state: LineState;
  lines: OrderLine[];
  order: Order;
  onNote: (l: OrderLine) => void;
  onAddon: (l: OrderLine) => void;
  onMoveKot: (round: number) => void;
}) {
  const store = useStore();
  const meta = stateMeta[state];
  const editable = state === "H";

  const kotsInGroup =
    state === "K"
      ? store.kots
          .filter((k) => k.orderId === order.id && lines.some((l) => l.kotRound === k.round))
          .sort((a, b) => elapsedMinutes(b.createdAt) - elapsedMinutes(a.createdAt))
      : [];
  const oldestKot = kotsInGroup[0];
  // One row can span multiple KOT rounds (round 1 sent, then more items
  // added and sent as round 2, both still "K" until served) - reprint/move
  // are per-round, so list each round actually present, newest first.
  const roundsInGroup = [...new Set(kotsInGroup.map((k) => k.round))].sort((a, b) => b - a);

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border bg-surface-muted px-3 py-1.5">
        <span
          className={cn(
            "num grid size-5 place-items-center rounded text-[11px] font-bold",
            meta.badge,
          )}
        >
          {state}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {meta.label}
        </span>
        {oldestKot ? (
          <span
            className={cn(
              "num flex items-center gap-1 text-[11px] font-semibold",
              elapsedMinutes(oldestKot.createdAt) > 20
                ? "text-primary"
                : elapsedMinutes(oldestKot.createdAt) > 10
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            <Timer className="size-3.5" /> {elapsedFrom(oldestKot.createdAt)}
          </span>
        ) : null}
        <span className="num ml-auto text-[11px] text-muted-foreground">
          {lines.length} item(s)
        </span>
      </div>

      {roundsInGroup.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          {roundsInGroup.map((round) => (
            <span
              key={round}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              Round {round}
              <button
                type="button"
                className="ml-1 rounded p-0.5 hover:bg-surface-muted hover:text-foreground"
                onClick={() => void store.printKot(order.id, round)}
                aria-label={`Reprint KOT round ${round}`}
              >
                <Printer className="size-3" />
              </button>
              {order.type === "Dine In" ? (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-surface-muted hover:text-foreground"
                  onClick={() => onMoveKot(round)}
                  aria-label={`Move KOT round ${round}`}
                >
                  <ArrowLeftRight className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {lines.map((l, i) => (
          <li
            key={l.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-muted/50",
              !editable && "opacity-90",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {l.name}
                {l.variant ? (
                  <span className="ml-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {l.variant}
                  </span>
                ) : null}
              </p>
              <p className="num flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                {editable ? (
                  <span className="inline-flex items-center gap-0.5">
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
                      className={cn(
                        "num h-5 w-14 rounded border border-border bg-surface px-1 text-[11px]",
                        focusRing,
                      )}
                    />
                  </span>
                ) : (
                  `₹${l.price}`
                )}
                {l.addons?.length ? ` · + ${l.addons.map((a) => a.name).join(", ")}` : ""}
                {l.originTable ? ` · from ${l.originTable}` : ""}
              </p>
              {l.note ? <p className="text-[11px] italic text-warning">“{l.note}”</p> : null}
            </div>

            <div className="flex items-center gap-2">
              {editable ? (
                <input
                  data-qty-row={i}
                  defaultValue={l.qty}
                  key={`${l.id}-${l.qty}`}
                  inputMode="numeric"
                  aria-label={`Quantity for ${l.name}`}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    const v = Number(e.currentTarget.value);
                    if (Number.isFinite(v) && v !== l.qty)
                      store.setLineQty(order.id, l.id, v, "keyboard-billing");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const v = Number(e.currentTarget.value);
                      if (Number.isFinite(v) && v !== l.qty)
                        store.setLineQty(order.id, l.id, v, "keyboard-billing");
                      const next = e.key === "ArrowUp" ? i - 1 : i + 1;
                      const el = document.querySelector<HTMLInputElement>(
                        `[data-qty-row="${next}"]`,
                      );
                      el?.focus();
                      el?.select();
                    }
                  }}
                  className={cn(
                    "num h-8 w-14 rounded-md border border-border bg-surface text-center text-sm font-semibold",
                    focusRing,
                  )}
                />
              ) : (
                <span className="num grid h-8 w-14 place-items-center rounded-md border border-dashed border-border bg-surface-muted text-sm font-semibold text-muted-foreground">
                  {l.qty}
                </span>
              )}

              <Amount value={lineTotal(l)} className="w-24 text-right text-sm font-semibold" />

              {editable ? (
                <div className="flex items-center gap-1">
                  {store.menuItems.find((m) => m.id === l.itemId)?.addonGroupIds?.length ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => onAddon(l)}
                      aria-label="Edit addons"
                    >
                      <Tags className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => onNote(l)}
                    aria-label="Add note"
                  >
                    <StickyNote className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    onClick={() => store.removeLine(order.id, l.id, "keyboard-billing")}
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="w-[4.25rem] text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  KOT {l.kotRound}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* variant popup                                                       */
/* ------------------------------------------------------------------ */

function VariantPopup({
  open,
  item,
  index,
  setIndex,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  item: MenuItem | null;
  index: number;
  setIndex: (i: number) => void;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const variants = item?.variants ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((index + 1) % variants.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((index - 1 + variants.length) % variants.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const v = variants[index];
        if (v) onConfirm(v.name);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, index, variants, setIndex, onConfirm, onCancel]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl"
      >
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="text-xs text-muted-foreground">Choose a portion</p>
        <div className="mt-3 flex items-center gap-2">
          <Keycap>←</Keycap>
          <div className="flex flex-1 flex-wrap justify-center gap-2">
            {variants.map((v, i) => (
              <button
                key={v.id}
                onClick={() => onConfirm(v.name)}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  "min-w-24 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  i === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-muted",
                )}
              >
                {v.name}
                <span className="num ml-1.5 text-[11px] opacity-80">₹{v.price}</span>
              </button>
            ))}
          </div>
          <Keycap>→</Keycap>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          <Keycap>Enter</Keycap> Select · <Keycap>Esc</Keycap> Cancel
        </p>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* dialogs                                                             */
/* ------------------------------------------------------------------ */

function DiscountDialog({
  open,
  onOpenChange,
  order,
  subtotal,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  subtotal: number;
}) {
  const store = useStore();
  const [mode, setMode] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState(10);

  const apply = (label: string, amount: number) => {
    store.applyDiscount(order.id, label, Math.round(amount * 100) / 100);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply discount</DialogTitle>
          <DialogDescription>
            Percentage, flat amount, or an active promo code. Totals update instantly.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {(["percent", "flat"] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode(m)}
            >
              {m === "percent" ? "Percentage" : "Flat ₹"}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>{mode === "percent" ? "Percent off" : "Amount off"}</Label>
          <Input
            autoFocus
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply(
                  mode === "percent" ? `${value}% off` : "Flat discount",
                  mode === "percent" ? (subtotal * value) / 100 : value,
                );
              }
            }}
            className={focusRing}
          />
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
                    onClick={() =>
                      apply(p.code, p.type === "percent" ? (subtotal * p.value) / 100 : p.value)
                    }
                  >
                    {p.code}
                  </Button>
                ))}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {order.discount ? (
            <Button variant="ghost" onClick={() => apply("", 0)}>
              Remove discount
            </Button>
          ) : null}
          <Button
            onClick={() =>
              apply(
                mode === "percent" ? `${value}% off` : "Flat discount",
                mode === "percent" ? (subtotal * value) / 100 : value,
              )
            }
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
}) {
  const store = useStore();
  const [phone, setPhone] = useState(order.customerPhone ?? "");
  const [name, setName] = useState(order.customerName ?? "");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [hi, setHi] = useState(0);

  useEffect(() => {
    if (open) {
      setPhone(order.customerPhone ?? "");
      setName(order.customerName ?? "");
    }
  }, [open, order.customerPhone, order.customerName]);

  const suggestions = useMemo(() => {
    const q = phone.trim();
    if (q.length < 2) return [];
    return store.customers
      .filter((c) => c.phone.includes(q) || c.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5);
  }, [store.customers, phone]);

  const choose = (id: string) => {
    const c = store.customers.find((x) => x.id === id);
    if (!c) return;
    setPhone(c.phone);
    setName(c.name);
    setGstin(c.gstin ?? "");
    setAddress(c.address ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer</DialogTitle>
          <DialogDescription>
            Search by mobile to autofill, or type a new customer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Mobile</Label>
          <Input
            autoFocus
            value={phone}
            inputMode="tel"
            placeholder="Search mobile or name…"
            onChange={(e) => {
              setPhone(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (!suggestions.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => (h + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const s = suggestions[hi];
                if (s) choose(s.id);
              }
            }}
            className={cn("num", focusRing)}
          />
          {suggestions.length ? (
            <ul className="rounded-lg border border-border p-1">
              {suggestions.map((c, i) => (
                <li key={c.id}>
                  <button
                    onMouseEnter={() => setHi(i)}
                    onClick={() => choose(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      i === hi ? "bg-primary text-primary-foreground" : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="num text-xs">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className={focusRing} />
          </div>
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className={cn("num", focusRing)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={focusRing}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              store.setCustomer(order.id, "", "");
              onOpenChange(false);
            }}
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              store.setCustomer(order.id, name.trim(), phone.trim());
              if (
                name.trim() &&
                phone.trim() &&
                !store.customers.some((c) => c.phone === phone.trim())
              ) {
                store.upsertCustomer({
                  id: `c-${Date.now()}`,
                  name: name.trim(),
                  phone: phone.trim(),
                  orders: 0,
                  lastVisit: "Today",
                  gstin,
                  address,
                  active: true,
                });
              }
              onOpenChange(false);
            }}
          >
            Attach customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveTableDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
}) {
  const store = useStore();
  const free = store.tables.filter((t) => t.status === "Free");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{order.tableId ? "Move table" : "Assign table"}</DialogTitle>
          <DialogDescription>
            {order.tableId
              ? `Order #${order.orderNo} is on ${order.tableLabel}. Pick a free table to move it.`
              : `Order #${order.orderNo} has no table yet. Pick a free table to seat it.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto scrollbar-slim">
          {free.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              className="h-14 flex-col"
              onClick={() => {
                store.transferTable(order.id, t.id);
                onOpenChange(false);
              }}
            >
              <span className="num text-sm font-semibold">{t.name}</span>
              <span className="text-[10px] text-muted-foreground">{t.seats} seats</span>
            </Button>
          ))}
          {free.length === 0 ? (
            <p className="col-span-3 text-sm text-muted-foreground">No free tables right now.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MoveKotDialog({
  round,
  order,
  onClose,
}: {
  round: number | null;
  order: Order;
  onClose: () => void;
}) {
  const store = useStore();
  const free = store.tables.filter((t) => t.status === "Free" && t.id !== order.tableId);
  return (
    <Dialog open={round !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move KOT round {round}</DialogTitle>
          <DialogDescription>
            Pick a free table to move round {round}&apos;s items to. The rest of order #
            {order.orderNo} stays on {order.tableLabel}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto scrollbar-slim">
          {free.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              className="h-14 flex-col"
              onClick={() => {
                if (round !== null) void store.moveKot(order.id, round, t.id);
                onClose();
              }}
            >
              <span className="num text-sm font-semibold">{t.name}</span>
              <span className="text-[10px] text-muted-foreground">{t.seats} seats</span>
            </Button>
          ))}
          {free.length === 0 ? (
            <p className="col-span-3 text-sm text-muted-foreground">No free tables right now.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NoteDialog({
  line,
  order,
  onClose,
}: {
  line: OrderLine | null;
  order: Order;
  onClose: () => void;
}) {
  const store = useStore();
  const [text, setText] = useState("");
  useEffect(() => setText(line?.note ?? ""), [line]);
  return (
    <Dialog open={!!line} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Kitchen note</DialogTitle>
          <DialogDescription>{line?.name}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Less spicy, no onion…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && line) {
              store.setLineNote(order.id, line.id, text.trim());
              onClose();
            }
          }}
          className={focusRing}
        />
        <DialogFooter>
          <Button
            onClick={() => {
              if (line) store.setLineNote(order.id, line.id, text.trim());
              onClose();
            }}
          >
            Save note <Keycap tone="invert">Enter</Keycap>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type SelectedAddon = NonNullable<OrderLine["addons"]>[number];

// Shared addon-selection UI for both "add a new item" (variant/addon config
// dialogs) and "edit an existing cart line's addons" (AddonDialog below) -
// lets each selected option carry its own qty (matching the old BillerPe
// app, which let you pick e.g. 2x Extra Cheese on one line) rather than a
// plain on/off toggle.
export function AddonPicker({
  groups,
  value,
  onChange,
}: {
  groups: AddonGroup[];
  value: SelectedAddon[];
  onChange: (next: SelectedAddon[]) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id}>
          <Label>
            {group.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({group.selection}, max {group.max})
            </span>
          </Label>
          <div className="mt-1.5 space-y-1.5">
            {group.options.map((o) => {
              const selected = value.find((a) => a.groupId === group.id && a.addonId === o.id);
              return (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm",
                    selected ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => {
                      if (selected) {
                        onChange(value.filter((a) => a !== selected));
                        return;
                      }
                      const next: SelectedAddon = {
                        name: o.name,
                        price: o.price,
                        qty: 1,
                        groupId: group.id,
                        addonId: o.id,
                      };
                      onChange(
                        group.selection === "Single"
                          ? [...value.filter((a) => a.groupId !== group.id), next]
                          : [...value, next],
                      );
                    }}
                  >
                    {o.name}
                    {o.price ? <span className="num"> +₹{o.price}</span> : null}
                  </button>
                  {selected ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Fewer ${o.name}`}
                        className="grid size-6 place-items-center rounded border border-border"
                        onClick={() =>
                          onChange(
                            selected.qty <= 1
                              ? value.filter((a) => a !== selected)
                              : value.map((a) => (a === selected ? { ...a, qty: a.qty - 1 } : a)),
                          )
                        }
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="num w-4 text-center">{selected.qty}</span>
                      <button
                        type="button"
                        aria-label={`More ${o.name}`}
                        className="grid size-6 place-items-center rounded border border-border"
                        onClick={() =>
                          onChange(
                            value.map((a) => (a === selected ? { ...a, qty: a.qty + 1 } : a)),
                          )
                        }
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function AddonDialog({
  line,
  order,
  onClose,
}: {
  line: OrderLine | null;
  order: Order;
  onClose: () => void;
}) {
  const store = useStore();
  const [addons, setAddons] = useState<SelectedAddon[]>([]);
  useEffect(() => setAddons(line?.addons ?? []), [line]);
  const item = line ? store.menuItems.find((m) => m.id === line.itemId) : undefined;
  const groups = (item?.addonGroupIds ?? [])
    .map((gid) => store.addonGroups.find((g) => g.id === gid))
    .filter((g): g is AddonGroup => !!g);

  return (
    <Dialog open={!!line} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Addons</DialogTitle>
          <DialogDescription>{line?.name}</DialogDescription>
        </DialogHeader>
        {groups.length ? (
          <AddonPicker groups={groups} value={addons} onChange={setAddons} />
        ) : (
          <p className="text-sm text-muted-foreground">This item has no addon options.</p>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              if (line) store.setLineAddons(order.id, line.id, addons);
              onClose();
            }}
          >
            Save addons
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewOrderDialog({
  open,
  onOpenChange,
  currentOrderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentOrderId?: string;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [type, setType] = useState<"Dine In" | "Pickup" | null>(null);
  const freeTables = store.tables.filter((t) => t.status === "Free");

  useEffect(() => {
    if (!open) setType(null);
  }, [open]);

  const openOrder = (id: string) => {
    if (currentOrderId && currentOrderId !== id) {
      const current = store.orderById(currentOrderId);
      if (current && current.lines.length === 0) store.freeIfEmpty(current.id);
    }
    onOpenChange(false);
    navigate({ to: "/keyboard-billing/$orderId", params: { orderId: id } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
          <DialogDescription>
            Your current order stays open in the background — this starts a separate one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            variant={type === "Dine In" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setType("Dine In")}
          >
            <Utensils className="size-4" /> Dine In
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => openOrder(store.startTakeAway())}
          >
            <ShoppingBag className="size-4" /> Pickup
          </Button>
        </div>
        {type === "Dine In" ? (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto scrollbar-slim">
            {freeTables.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="h-14 flex-col"
                onClick={() => openOrder(store.startOrder(t.id, 1))}
              >
                <span className="num text-sm font-semibold">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">{t.seats} seats</span>
              </Button>
            ))}
            {freeTables.length === 0 ? (
              <p className="col-span-3 text-sm text-muted-foreground">No free tables right now.</p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CustomItemDialog({
  open,
  onOpenChange,
  order,
  name,
  setName,
  price,
  setPrice,
  qty,
  setQty,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  name: string;
  setName: (v: string) => void;
  price: number;
  setPrice: (v: number) => void;
  qty: number;
  setQty: (v: number) => void;
  onAdded: () => void;
}) {
  const store = useStore();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Custom item</DialogTitle>
          <DialogDescription>For one-off charges that aren't on the menu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Special request"
              className={focusRing}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (₹)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className={cn("num", focusRing)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className={cn("num", focusRing)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || price <= 0}
            onClick={() => {
              store.addCustomLine(order.id, name, price, qty);
              onOpenChange(false);
              onAdded();
            }}
          >
            <Plus className="size-4" /> Add to order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* payment                                                             */
/* ------------------------------------------------------------------ */

function PaymentPanel({
  order,
  grand,
  onSettle,
}: {
  order: Order;
  grand: number;
  onSettle: () => void;
}) {
  const [paid, setPaid] = useState("");
  const paidNum = Number(paid) || 0;
  const ret = Math.max(0, Math.round((paidNum - grand) * 100) / 100);
  const settled = order.status === "Settled";

  return (
    <div className="space-y-2 p-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Customer paid
        </Label>
        <Input
          value={paid}
          inputMode="decimal"
          placeholder="0.00"
          disabled={settled}
          onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
          className={cn("num h-10 text-right text-lg font-semibold", focusRing)}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[grand, Math.ceil(grand / 100) * 100, Math.ceil(grand / 500) * 500].map((v, i) => (
          <Button
            key={i}
            size="sm"
            variant="outline"
            className="num h-7 flex-1 text-[11px]"
            disabled={settled}
            onClick={() => setPaid(String(v))}
          >
            ₹{v}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Return</span>
        <Amount value={ret} className="text-base font-bold" />
      </div>
      <Button className="h-10 w-full" disabled={settled} onClick={onSettle}>
        <Wallet className="size-4" /> Settle bill
      </Button>
      {settled ? (
        <p className="text-center text-[11px] font-semibold text-success">
          Settled · {order.paymentMode}
        </p>
      ) : null}
    </div>
  );
}

function SettleDialog({
  open,
  onOpenChange,
  order,
  grand,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order;
  grand: number;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const paid = splits.reduce((s, p) => s + p.amount, 0);
  const due = Math.round((grand - paid) * 100) / 100;
  const upiAmount = splits.filter((p) => p.mode === "UPI").reduce((s, p) => s + p.amount, 0);

  useEffect(() => {
    if (open) setSplits([]);
  }, [open]);

  const add = (mode: PaymentSplit["mode"]) =>
    setSplits((s) => [...s, { mode, amount: Math.max(0, due) }]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle bill · #{order.orderNo}</DialogTitle>
          <DialogDescription>
            Grand total <Amount value={grand} className="font-semibold" />. Add one or more payment
            modes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            {store.paymentModes
              .filter((m) => m.active)
              .map((m) => (
                <Button
                  key={m.id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => add(m.name)}
                >
                  {m.name}
                </Button>
              ))}
          </div>
          {store.qrOnSettle && store.invoiceFormat.upiId && upiAmount > 0 ? (
            <UpiQrPanel upiId={store.invoiceFormat.upiId} amount={upiAmount} />
          ) : null}
        </div>

        <ul className="space-y-2">
          {splits.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-16 text-sm font-medium">{p.mode}</span>
              <Input
                type="number"
                value={p.amount}
                onChange={(e) =>
                  setSplits((s) =>
                    s.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)),
                  )
                }
                className={cn("num h-9 text-right", focusRing)}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-9"
                onClick={() => setSplits((s) => s.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Balance due</span>
          <Amount
            value={due}
            className={cn("font-bold", due > 0 ? "text-warning" : "text-success")}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={splits.length === 0 || due > 0.5}
            onClick={() => {
              store.settleOrder(order.id, splits);
              onOpenChange(false);
              const nextId = store.startDefaultOrder();
              navigate({
                to: "/keyboard-billing/$orderId",
                params: { orderId: nextId },
                replace: true,
              });
            }}
          >
            <Printer className="size-4" /> Settle & print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
