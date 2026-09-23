import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Bell,
  Grid2X2,
  LayoutGrid,
  Merge,
  Printer,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Money, Page, PageHeader, SectionCard, StatusBadge } from "@/components/kit";
import {
  PaymentSplitEditor,
  splitCheck,
  splitPaid,
} from "@/components/operations/payment-split-editor";
import { Badge } from "@/components/ui/badge";
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
import { ApiError, qrOrderApi, type RawPendingQrOrder } from "@/lib/api";
import { getQrInbox, removeFromQrInbox, subscribeQrInbox } from "@/lib/qrInbox";
import { connectChangeFeed } from "@/lib/changeFeedSocket";
import { cn } from "@/lib/utils";
import { elapsedFrom } from "@/mock/format";
import { orderTotals, useStore } from "@/mock/store";
import type { Order, PaymentSplit, RestaurantTable, TableStatus } from "@/mock/types";

export const Route = createFileRoute("/_shell/table-grid/")({
  head: () => ({
    meta: [
      { title: "Table Grid · BillerPe" },
      {
        name: "description",
        content:
          "Live floor view of every table with status, guests, running totals, merge and transfer actions.",
      },
      { property: "og:title", content: "Table Grid · BillerPe" },
      {
        property: "og:description",
        content: "Live restaurant floor view with table status, merge and transfer.",
      },
    ],
  }),
  component: TableGridPage,
});

const statusStyles: Record<TableStatus, string> = {
  Free: "border-border bg-surface hover:border-primary/40",
  Hold: "border-transparent bg-status-held text-status-held-foreground",
  Running: "border-transparent bg-status-running text-status-running-foreground",
  "Bill Generated": "border-transparent bg-status-billed text-status-billed-foreground",
  Reserved: "border-transparent bg-status-reserved text-status-reserved-foreground",
};

function TableGridPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TableStatus>("all");
  const [mergeFrom, setMergeFrom] = useState<RestaurantTable | null>(null);
  const [transferFrom, setTransferFrom] = useState<RestaurantTable | null>(null);
  const [settleTable, setSettleTable] = useState<RestaurantTable | null>(null);
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [tip, setTip] = useState(0);
  // Shared app-wide inbox (lib/qrInbox.ts, started by AppShell).
  const qrOrders = useSyncExternalStore(subscribeQrInbox, getQrInbox, getQrInbox);
  const [qrInboxOpen, setQrInboxOpen] = useState(false);
  const [qrActionBusyId, setQrActionBusyId] = useState<number | null>(null);

  // AppShell's own load only ever fires once per login, not on every visit
  // to this page - a table status change that happens elsewhere (another
  // terminal, or a reservation being booked/cancelled/edited - see
  // billerpe-local-exe/services/reservationTableSync.js) never reached
  // this screen without a manual reload, confirmed live. Scoped to this
  // page rather than AppShell so idle screens elsewhere don't poll table
  // data they aren't showing.
  useEffect(() => {
    // Immediate refresh on every visit (not only on login), then the poll.
    void store.loadTablesFromServer();
    const id = setInterval(() => void store.loadTablesFromServer(), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast path on top of the 20s poll above - the exe already broadcasts a
  // webChange event the instant ANY terminal (another POS tab, the Captain
  // App, the Kitchen Display) mutates an order, but this app never listened
  // for it, so a captain firing a KOT or requesting a bill took up to 20s
  // to show up here. The poll stays as the self-healing fallback for a
  // dropped/reconnecting socket, so this is additive, not a replacement.
  useEffect(() => {
    const disconnect = connectChangeFeed({
      onChange: () => void store.loadTablesFromServer(),
      onTableChange: () => void store.loadTablesFromServer(),
      onConnect: () => void store.loadTablesFromServer(),
      onConfigChange: (entities) => {
        if (entities.some((e) => e.startsWith("menu") || e === "variants" || e === "addons")) {
          void store.loadMenuFromServer();
        }
        if (entities.some((e) => e.startsWith("table"))) void store.loadTablesFromServer();
      },
    });
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () =>
      store.tables.filter(
        (t) =>
          (categoryId === "all" || t.categoryId === categoryId) &&
          (statusFilter === "all" || t.status === statusFilter),
      ),
    [store.tables, categoryId, statusFilter],
  );

  const sortedCategories = useMemo(
    () => [...store.tableCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.tableCategories],
  );

  const bySection = useMemo(
    () =>
      sortedCategories
        .map((cat) => ({
          cat,
          tables: store.tables.filter(
            (t) => t.categoryId === cat.id && (statusFilter === "all" || t.status === statusFilter),
          ),
        }))
        .filter((s) => s.tables.length > 0),
    [store.tables, sortedCategories, statusFilter],
  );

  const runningOrders = useMemo(
    () =>
      store.orders
        .filter(
          (o) => o.type === "Pickup" && ["Running", "Hold", "Bill Generated"].includes(o.status),
        )
        .sort((a, b) => b.orderNo - a.orderNo),
    [store.orders],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = {
      Free: 0,
      Hold: 0,
      Running: 0,
      "Bill Generated": 0,
      Reserved: 0,
    };
    store.tables.forEach((t) => (base[t.status] = (base[t.status] ?? 0) + 1));
    return base;
  }, [store.tables]);

  const freeTables = store.tables.filter((t) => t.status === "Free");
  // Which section a table sits in - shown in the merge/transfer pickers so
  // the right table is chosen (owner report, 2026-09-22).
  const categoryName = (categoryId: string) =>
    store.tableCategories.find((c) => c.id === categoryId)?.name ?? "—";

  const openBiller = (orderId: string) => {
    if (store.displayMode === "Keyboard") {
      navigate({ to: "/keyboard-billing/$orderId", params: { orderId } });
      return;
    }
    navigate({ to: "/table-grid/order/$orderId", params: { orderId } });
  };

  const openOrder = async (table: RestaurantTable) => {
    if (store.transactionsBlocked) {
      toast.error("Transactions blocked", {
        description: "Reconnect to the local server or resolve the offline limit first.",
      });
      return;
    }
    if (table.orderId) {
      openBiller(table.orderId);
      return;
    }
    // "Reserved" means a table has a future/held booking against it
    // (services/reservationTableSync.js on the exe) - it never has an
    // order of its own (the reservation itself creates one only later, at
    // its own start time, on the cloud). Treated the same as "Free" here:
    // clicking it starts a normal walk-in order, same as any other empty
    // table - it must NOT fall into the "must already have an order"
    // resync-and-error path below, confirmed live as an immediate
    // "Could not open this table's order" toast on every single click.
    if (table.status !== "Free" && table.status !== "Reserved") {
      // The table's own status can come back "occupied" from the server
      // a beat before the order that occupies it shows up in the active-
      // orders sync (e.g. a KOT just fired on another terminal) - resync
      // once and retry before giving up, rather than silently starting a
      // brand-new empty order on top of whatever's really running there.
      await store.loadTablesFromServer();
      const refreshed = store.tableById(table.id);
      if (refreshed?.orderId) {
        openBiller(refreshed.orderId);
      } else {
        toast.error("Could not open this table's order", {
          description: "It shows occupied but its order couldn't be found — try again shortly.",
        });
      }
      return;
    }
    openBiller(store.startOrder(table.id));
  };

  const acceptQrOrder = async (qrOrder: RawPendingQrOrder) => {
    setQrActionBusyId(qrOrder.id);
    try {
      const { orderId } = await qrOrderApi.accept(qrOrder.id);
      removeFromQrInbox(qrOrder.id);
      toast.success(`Order accepted for ${qrOrder.table_name ?? "table"}`);
      // loadTablesFromServer alone was NOT enough here - confirmed live,
      // reported repeatedly: it only ever discovers an order this session
      // didn't know about yet (see its own comment), so accepting a 2nd+
      // round onto a table whose order was ALREADY open silently did
      // nothing to that order's lines/total until a full page reload.
      // refreshOrderFromServer is the one that actually re-fetches THIS
      // order's current lines/kotRounds regardless of whether it was
      // already known - run both: loadTablesFromServer for the
      // brand-new-order/table-status case, refreshOrderFromServer for the
      // already-open-order case this was actually missing.
      await store.loadTablesFromServer();
      const localOrder = store.orders.find((o) => o.backendId === orderId);
      if (localOrder) await store.refreshOrderFromServer(localOrder.id);
    } catch (err) {
      toast.error("Could not accept this order", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setQrActionBusyId(null);
    }
  };

  const rejectQrOrder = async (qrOrder: RawPendingQrOrder) => {
    setQrActionBusyId(qrOrder.id);
    try {
      await qrOrderApi.reject(qrOrder.id);
      removeFromQrInbox(qrOrder.id);
      toast.success("Order declined");
    } catch (err) {
      toast.error("Could not decline this order", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setQrActionBusyId(null);
    }
  };

  const itemCountOf = (order: Order | undefined) =>
    order ? order.lines.reduce((s, l) => s + l.qty, 0) : 0;

  const handlePrintBill = (t: RestaurantTable) => {
    if (t.orderId) void store.printBill(t.orderId);
  };

  const actionIconCls =
    "grid size-6 shrink-0 place-items-center rounded-md bg-black/10 hover:bg-black/20";

  const renderTableCard = (t: RestaurantTable) => {
    const order = t.orderId ? store.orderById(t.orderId) : undefined;
    const totals = orderTotals(order, store);
    const itemCount = itemCountOf(order);
    return (
      <motion.button
        key={t.id}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => void openOrder(t)}
        className={cn(
          "flex min-h-[5.5rem] flex-col justify-between rounded-xl border p-2 text-left shadow-card transition-colors",
          statusStyles[t.status],
        )}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-sm font-semibold">{t.name}</span>
          <span className="flex flex-col items-end gap-0.5 text-[10px] opacity-80">
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              <span className="num">{t.guests ?? t.seats}</span>
            </span>
            {itemCount ? (
              <span className="flex items-center gap-1">
                <UtensilsCrossed className="size-3" />
                <span className="num">{itemCount}</span>
              </span>
            ) : null}
          </span>
        </div>
        <div className="mt-1 space-y-0.5">
          <p className="text-[11px] font-medium opacity-90">{t.status}</p>
          {order ? (
            <p className="num text-xs font-semibold">₹{totals.grand.toLocaleString("en-IN")}</p>
          ) : null}
          {t.occupiedSince ? (
            <p className="text-[10px] opacity-75">{elapsedFrom(t.occupiedSince)}</p>
          ) : null}
          {t.status === "Reserved" && t.reservedGuestName ? (
            <p className="truncate text-[10px] opacity-75">
              {t.reservedGuestName}
              {t.reservedGuestPhone ? ` · ${t.reservedGuestPhone}` : ""}
            </p>
          ) : null}
          {order?.mergedFrom?.length ? (
            <p className="text-[10px] opacity-75">Merged · {order.mergedFrom.join(", ")}</p>
          ) : null}
        </div>
        {t.orderId ? (
          <div className="mt-1.5 flex gap-1">
            {t.status === "Bill Generated" ? (
              <>
                <span
                  role="button"
                  tabIndex={-1}
                  title="Print bill"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrintBill(t);
                  }}
                  className={actionIconCls}
                >
                  <Printer className="size-3.5" />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  title="Settle bill"
                  onClick={(e) => {
                    e.stopPropagation();
                    const paid = (order?.payments ?? []).reduce((s, p) => s + p.amount, 0);
                    const balance = Math.round((totals.grand - paid) * 100) / 100;
                    // This quick-settle icon seeds the first split row itself,
                    // unlike PaymentSplitEditor's own "Add payment mode"
                    // button (which the settle dialog below still uses for
                    // any row after this one) - same default-resolution as
                    // that button, just called directly here instead of
                    // relying on the editor's own orderType/tableCategoryId
                    // props for row zero.
                    const defaultMode =
                      order?.type === "Pickup"
                        ? store.resolveDefaultPaymentMode("Pickup")
                        : store.resolveDefaultPaymentMode("Dine-in", t.categoryId);
                    setSplits([{ mode: defaultMode, amount: Math.max(0, balance) }]);
                    setTip(0);
                    setSettleTable(t);
                  }}
                  className={cn(actionIconCls, "bg-black/20 hover:bg-black/30")}
                >
                  <Wallet className="size-3.5" />
                </span>
              </>
            ) : null}
            {t.status !== "Bill Generated" ? (
              <>
                {/* A held table is never merged - only transferred. */}
                {t.status !== "Hold" ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    title="Merge into another table"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMergeFrom(t);
                    }}
                    className={actionIconCls}
                  >
                    <Merge className="size-3.5" />
                  </span>
                ) : null}
                <span
                  role="button"
                  tabIndex={-1}
                  title="Transfer to another table"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransferFrom(t);
                  }}
                  className={actionIconCls}
                >
                  <ArrowLeftRight className="size-3.5" />
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </motion.button>
    );
  };

  return (
    <Page>
      <PageHeader
        icon={LayoutGrid}
        title="Table Grid"
        description="Tap a free table to start an order, or an occupied table to continue it."
        actions={
          <>
            <Button variant="outline" className="relative" onClick={() => setQrInboxOpen(true)}>
              <Bell className="size-4" /> QR Orders
              {qrOrders.length > 0 ? (
                <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full px-1">
                  {qrOrders.length}
                </Badge>
              ) : null}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = store.startTakeAway();
                openBiller(id);
              }}
            >
              <ShoppingBag className="size-4" /> New Pickup
            </Button>
            <Button onClick={() => navigate({ to: "/orders" })}>
              <Grid2X2 className="size-4" /> All Orders
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <SectionCard
          title="Running pickup orders"
          bodyClassName="p-2 sm:p-2"
          className="h-fit lg:sticky lg:top-20"
        >
          {runningOrders.length ? (
            <ul className="space-y-1.5">
              {runningOrders.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => openBiller(o.id)}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-muted"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{o.tableLabel}</span>
                      <StatusBadge status={o.status} className="shrink-0" />
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        #{o.orderNo}
                        {o.token ? ` · Token ${o.token}` : ""}
                      </span>
                      <Money value={orderTotals(o, store).grand} className="font-medium" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No running pickup orders right now.
            </p>
          )}
        </SectionCard>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "Free", "Hold", "Running", "Bill Generated", "Reserved"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {s === "all" ? `All (${store.tables.length})` : `${s} (${counts[s] ?? 0})`}
                </button>
              ),
            )}
          </div>

          {store.tableGridView === "Sections" ? (
            <div className="space-y-5">
              {bySection.map(({ cat, tables }) => (
                <SectionCard
                  key={cat.id}
                  title={cat.name}
                  description={`${tables.length} table${tables.length === 1 ? "" : "s"}`}
                  bodyClassName="p-3 sm:p-4"
                >
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                    {tables.map(renderTableCard)}
                  </div>
                </SectionCard>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCategoryId("all")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    categoryId === "all" ? "bg-surface-muted" : "text-muted-foreground",
                  )}
                >
                  All sections
                </button>
                {sortedCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      categoryId === c.id ? "bg-surface-muted" : "text-muted-foreground",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                {filtered.map(renderTableCard)}
              </div>
            </>
          )}

          <SectionCard title="Legend" className="mt-6">
            <div className="flex flex-wrap gap-2">
              {(["Free", "Hold", "Running", "Bill Generated", "Reserved"] as TableStatus[]).map(
                (s) => (
                  <StatusBadge key={s} status={s} />
                ),
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <Dialog open={!!mergeFrom} onOpenChange={(o) => !o && setMergeFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Merge {mergeFrom ? `${categoryName(mergeFrom.categoryId)} · ${mergeFrom.name}` : ""}{" "}
              into…
            </DialogTitle>
            <DialogDescription>
              Items keep their origin table tag on the KOT and bill.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {store.tables
              .filter((t) => t.id !== mergeFrom?.id && t.status === "Running")
              .map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="h-auto flex-col gap-0.5 py-2"
                  onClick={() => {
                    if (!mergeFrom) return;
                    store.mergeTables(mergeFrom.id, t.id);
                    setMergeFrom(null);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <Merge className="size-4" /> {t.name}
                  </span>
                  {/* which section the table is in - two tables can share a
                      name across sections (owner report, 2026-09-22) */}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {categoryName(t.categoryId)}
                  </span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferFrom} onOpenChange={(o) => !o && setTransferFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Transfer{" "}
              {transferFrom ? `${categoryName(transferFrom.categoryId)} · ${transferFrom.name}` : ""}{" "}
              to…
            </DialogTitle>
            <DialogDescription>Only free tables can receive a transfer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {freeTables.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="h-auto flex-col gap-0.5 py-2"
                onClick={() => {
                  if (!transferFrom?.orderId) return;
                  store.transferTable(transferFrom.orderId, t.id);
                  setTransferFrom(null);
                }}
              >
                <span className="flex items-center gap-1.5">
                  <ArrowLeftRight className="size-4" /> {t.name}
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {categoryName(t.categoryId)}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settleTable} onOpenChange={(o) => !o && setSettleTable(null)}>
        <DialogContent>
          {settleTable
            ? (() => {
                const order = settleTable.orderId
                  ? store.orderById(settleTable.orderId)
                  : undefined;
                const totals = orderTotals(order, store);
                const paid = (order?.payments ?? []).reduce((s, p) => s + p.amount, 0);
                const balance = Math.round((totals.grand - paid) * 100) / 100;
                const collected = splitPaid(splits);
                const due = Math.round((balance - collected) * 100) / 100;
                void collected;
                void due;
                // Only cash may exceed the bill (owner rule) - see splitCheck.
                const check = splitCheck(splits, balance);
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>Settle bill · {settleTable.name}</DialogTitle>
                      <DialogDescription>
                        Single or split payment. Only cash may be more than the bill - the
                        extra is shown as change to return.
                      </DialogDescription>
                    </DialogHeader>
                    <PaymentSplitEditor
                      splits={splits}
                      onChange={setSplits}
                      total={balance}
                      orderType={order?.type === "Pickup" ? "Pickup" : "Dine-in"}
                      tableCategoryId={settleTable.categoryId}
                    />
                    {order?.type === "Dine In" ? (
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
                        disabled={!order || !splits.length || !!check.problem}
                        onClick={() => {
                          if (!order) return;
                          store.settleOrder(order.id, splits, tip || undefined);
                          setSettleTable(null);
                        }}
                      >
                        <Wallet className="size-4" /> Confirm settlement
                      </Button>
                    </DialogFooter>
                  </>
                );
              })()
            : null}
        </DialogContent>
      </Dialog>

      <Dialog open={qrInboxOpen} onOpenChange={setQrInboxOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pending QR Orders</DialogTitle>
            <DialogDescription>
              Submitted from a table's own QR code. Nothing reaches the kitchen until you accept.
            </DialogDescription>
          </DialogHeader>
          {qrOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending QR orders right now.
            </p>
          ) : (
            <div className="space-y-3">
              {qrOrders.map((o) => {
                // Warn (never block) when the table this order targets
                // doesn't currently look occupied - staff can always
                // accept anyway (e.g. the guest just sat down), per the
                // plan's own "warn but allow" call, since a leaked/
                // reused link can otherwise submit a pending order for a
                // table nobody is actually sitting at.
                const suspicious = o.table_status !== null && o.table_status !== "R";
                const busy = qrActionBusyId === o.id;
                return (
                  <div key={o.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {o.table_name ?? `Table ${o.table_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.customer_name || "Guest"} · {o.customer_mobile}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {qrElapsed(o.submitted_at)} ago
                      </span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {o.items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {item.qty} × {item.itemName}
                            {item.variantName ? ` (${item.variantName})` : ""}
                            {item.addonNames?.length ? ` + ${item.addonNames.join(", ")}` : ""}
                          </span>
                          {item.comment ? (
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {item.comment}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {suspicious ? (
                      <p className="mt-2 text-xs text-amber-600">
                        This table currently shows{" "}
                        {o.table_status === "F"
                          ? "Free"
                          : o.table_status === "B"
                            ? "Reserved"
                            : o.table_status === "P"
                              ? "Bill Generated"
                              : o.table_status === "H"
                                ? "Hold"
                                : "occupied"}{" "}
                        — double-check before accepting.
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void acceptQrOrder(o)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void rejectQrOrder(o)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function qrElapsed(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
