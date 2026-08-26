import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Grid2X2,
  LayoutGrid,
  Merge,
  Printer,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Money, Page, PageHeader, SectionCard, StatusBadge } from "@/components/kit";
import { PaymentSplitEditor, splitPaid } from "@/components/operations/payment-split-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Held: "border-transparent bg-status-held text-status-held-foreground",
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

  const filtered = useMemo(
    () =>
      store.tables.filter(
        (t) =>
          (categoryId === "all" || t.categoryId === categoryId) &&
          (statusFilter === "all" || t.status === statusFilter),
      ),
    [store.tables, categoryId, statusFilter],
  );

  const bySection = useMemo(
    () =>
      [...store.tableCategories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          cat,
          tables: store.tables.filter(
            (t) => t.categoryId === cat.id && (statusFilter === "all" || t.status === statusFilter),
          ),
        }))
        .filter((s) => s.tables.length > 0),
    [store.tables, store.tableCategories, statusFilter],
  );

  const runningOrders = useMemo(
    () =>
      store.orders
        .filter((o) => ["Running", "Held", "Bill Generated"].includes(o.status))
        .sort((a, b) => b.orderNo - a.orderNo),
    [store.orders],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = {
      Free: 0,
      Held: 0,
      Running: 0,
      "Bill Generated": 0,
      Reserved: 0,
    };
    store.tables.forEach((t) => (base[t.status] = (base[t.status] ?? 0) + 1));
    return base;
  }, [store.tables]);

  const freeTables = store.tables.filter((t) => t.status === "Free");

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
    if (table.status !== "Free") {
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
          {order?.mergedFrom?.length ? (
            <p className="text-[10px] opacity-75">Merged · {order.mergedFrom.join(", ")}</p>
          ) : null}
        </div>
        {t.status !== "Free" ? (
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
                    setSplits([{ mode: "Cash", amount: Math.max(0, balance) }]);
                    setSettleTable(t);
                  }}
                  className={cn(actionIconCls, "bg-black/20 hover:bg-black/30")}
                >
                  <Wallet className="size-3.5" />
                </span>
              </>
            ) : null}
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
          title="Running orders"
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
                      <span>#{o.orderNo}</span>
                      <Money value={orderTotals(o, store).grand} className="font-medium" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">No running orders right now.</p>
          )}
        </SectionCard>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "Free", "Held", "Running", "Bill Generated", "Reserved"] as const).map(
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
                {store.tableCategories.map((c) => (
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
              {(["Free", "Held", "Running", "Bill Generated", "Reserved"] as TableStatus[]).map(
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
            <DialogTitle>Merge {mergeFrom?.name} into…</DialogTitle>
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
                  onClick={() => {
                    if (!mergeFrom) return;
                    store.mergeTables(mergeFrom.id, t.id);
                    setMergeFrom(null);
                  }}
                >
                  <Merge className="size-4" /> {t.name}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferFrom} onOpenChange={(o) => !o && setTransferFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {transferFrom?.name} to…</DialogTitle>
            <DialogDescription>Only free tables can receive a transfer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {freeTables.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                onClick={() => {
                  if (!transferFrom?.orderId) return;
                  store.transferTable(transferFrom.orderId, t.id);
                  setTransferFrom(null);
                }}
              >
                <ArrowLeftRight className="size-4" /> {t.name}
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
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>Settle bill · {settleTable.name}</DialogTitle>
                      <DialogDescription>
                        Single or split payment. Amounts must add up to the bill total.
                      </DialogDescription>
                    </DialogHeader>
                    <PaymentSplitEditor splits={splits} onChange={setSplits} total={balance} />
                    <DialogFooter>
                      <Button
                        disabled={!order || Math.abs(due) > 0.5}
                        onClick={() => {
                          if (!order) return;
                          store.settleOrder(order.id, splits);
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
    </Page>
  );
}
