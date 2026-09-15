import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Circle,
  Clock,
  LayoutGrid,
  ListOrdered,
  MinusCircle,
  PauseCircle,
  Pencil,
  Printer,
  Receipt,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useHasPendingRequests } from "@/components/app/GlobalLoadingBar";
import {
  BulkActionsBar,
  DataTable,
  EmptyState,
  IconButton,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
  TablePager,
} from "@/components/kit";
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
import { ApiError, orderApi, type RawTimelineEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { displayBillNo, orderTotals, useStore } from "@/mock/store";
import type { AuditLog, Order, OrderStatus } from "@/mock/types";

// constant/const.js's ACTION enum (controller/kto.js) - real values this
// backend actually writes to hms_timeline_mst.action. "remove_kot" is a
// member of the enum but its one call site in kto.js is commented out,
// so it never fires in practice - not included here since it would never
// match.
const ACTION_LABELS: Record<string, string> = {
  place_order: "Order created",
  kot: "KOT fired",
  hold: "Order held",
  settle: "Bill settled",
  update_order: "Order updated",
  update_order_item: "Item updated",
  decrease_kot_qty: "Item quantity decreased",
  free_table: "Table freed",
  delete_order: "Order deleted",
};

// Icon + tone per raw action key, for the timeline's visual markers -
// intentionally keyed off the same domain as ACTION_LABELS above, not the
// display label, so it stays correct if a label's wording ever changes.
const ACTION_VISUALS: Record<string, { icon: LucideIcon; tone: string }> = {
  place_order: { icon: Receipt, tone: "bg-info-soft text-info" },
  kot: { icon: ChefHat, tone: "bg-warning-soft text-warning" },
  hold: { icon: PauseCircle, tone: "bg-surface-muted text-muted-foreground" },
  settle: { icon: CheckCircle2, tone: "bg-success-soft text-success" },
  update_order: { icon: Pencil, tone: "bg-info-soft text-info" },
  update_order_item: { icon: Pencil, tone: "bg-info-soft text-info" },
  decrease_kot_qty: { icon: MinusCircle, tone: "bg-warning-soft text-warning" },
  free_table: { icon: LayoutGrid, tone: "bg-surface-muted text-muted-foreground" },
  delete_order: { icon: Trash2, tone: "bg-primary-soft text-primary" },
};
const DEFAULT_ACTION_VISUAL = { icon: Circle, tone: "bg-surface-muted text-muted-foreground" };

function mapRawTimelineEntry(t: RawTimelineEntry): AuditLog & { rawAction: string } {
  const at = new Date(t.created_Date);
  return {
    id: `tl-${t.id}`,
    userId: String(t.hotelUserId ?? ""),
    userName: t.hms_hotelUser_master?.name || t.creator || "Staff",
    action: ACTION_LABELS[t.action] ?? t.action,
    rawAction: t.action,
    entity: `Order #${t.bill_no}`,
    before: "",
    after: `${t.order_status} · ₹${t.grandAmount}`,
    device: t.device_name || t.from || "",
    ip: "",
    at: Number.isNaN(at.getTime()) ? t.created_Date : at.toLocaleString("en-IN"),
  };
}

// Historical orders (synced via loadOrderHistoryFromServer, id prefixed
// "oh-") carry real backendTotals - preferring those over a fresh
// orderTotals() recompute avoids drift from today's tax/service-charge
// config for the grand/discount/service figures shown in this list.
function totalsOf(o: Order, store: ReturnType<typeof useStore>) {
  const t = orderTotals(o, store);
  if (!o.backendTotals) return t;
  return {
    ...t,
    grand: o.backendTotals.grand,
    discount: o.backendTotals.discount,
    service: o.backendTotals.serviceCharge,
  };
}

export const Route = createFileRoute("/_shell/orders/")({
  head: () => ({
    meta: [
      { title: "Orders · BillerPe" },
      {
        name: "description",
        content: "Search, filter and reprint every dine-in and pickup order for the business date.",
      },
      { property: "og:title", content: "Orders · BillerPe" },
      { property: "og:description", content: "All dine-in and pickup orders with filters." },
    ],
  }),
  component: OrdersPage,
});

const filters: ("All" | OrderStatus)[] = [
  "All",
  "Running",
  "Held",
  "Bill Generated",
  "Settled",
  "Cancelled",
];

function paymentSummary(order: Order) {
  if (order.payments?.length) {
    return order.payments.map((p) => `${p.mode} ₹${p.amount.toLocaleString("en-IN")}`).join(" + ");
  }
  return order.paymentMode ?? "—";
}

function OrdersPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"All" | OrderStatus>("All");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  // History is server-paginated (10/page) and server-searched now - see
  // loadOrderHistoryFromServer's own comment. Debounced so every keystroke
  // doesn't fire a request; resets to page 1 whenever the search text
  // changes, since a stale page number from a previous search wouldn't
  // mean anything under the new filter.
  useEffect(() => {
    const t = setTimeout(() => {
      void store.loadOrderHistoryFromServer(1, q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const goToHistoryPage = (page: number) => {
    void store.loadOrderHistoryFromServer(page, q);
  };

  // Live orders (small, always fully in memory) stay filtered/searched
  // client-side and shown unpaginated, ahead of the current history page -
  // store.allOrders() already dedupes any live order that's also present
  // in the loaded history page (see its own comment), so this merge just
  // needs the status tab + search text applied to the live slice; the
  // history slice arrives from the server already filtered/paginated.
  const rows = useMemo(
    () =>
      store
        .allOrders()
        .sort((a, b) => b.orderNo - a.orderNo)
        .filter((o) => status === "All" || o.status === status)
        .filter((o) => {
          if (!q) return true;
          if (store.orderHistory.some((h) => h.id === o.id)) return true; // already server-filtered
          const t = q.toLowerCase();
          return (
            String(o.orderNo).includes(q) ||
            (o.billNo ?? "").toLowerCase().includes(t) ||
            o.tableLabel.toLowerCase().includes(t) ||
            (o.customerName ?? "").toLowerCase().includes(t) ||
            (o.customerPhone ?? "").includes(q)
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.orders, store.orderHistory, status, q],
  );
  // Only while genuinely empty AND a request is still in flight - once
  // real rows show up, an unrelated in-flight request elsewhere shouldn't
  // ever replace them with a skeleton again.
  const hasPending = useHasPendingRequests();
  const loading = rows.length === 0 && hasPending;

  useEffect(() => setSelected([]), [status, q]);

  // store.removeOrders hits the real backend for both live and synced-
  // history rows alike (same as the single-row delete button), so
  // selection isn't restricted by row type - just by the
  // orders.deleteOrder permission gating the bulk action itself below.
  const pageIds = rows.map((o) => o.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggleAllOnPage = () =>
    setSelected((prev) =>
      allPageSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : [...new Set([...prev, ...pageIds])],
    );
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [timelineEntries, setTimelineEntries] = useState<(AuditLog & { rawAction: string })[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!timelineOrder) {
      setTimelineEntries([]);
      return;
    }
    if (!timelineOrder.backendId) {
      setTimelineEntries([]);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    const run = async () => {
      try {
        const { timesLines } = await orderApi.getTimeline(timelineOrder.backendId!);
        const sorted = [...timesLines].sort(
          (a, b) => new Date(b.created_Date).getTime() - new Date(a.created_Date).getTime(),
        );
        if (!cancelled) setTimelineEntries(sorted.map(mapRawTimelineEntry));
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : "Could not load the order timeline");
          setTimelineEntries([]);
        }
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [timelineOrder]);

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        title="Orders"
        description="Live orders from this session, plus real settled history from the last 90 days."
        actions={
          store.canSpecial("system.remakeOrderSequence") ? (
            <Button variant="outline" onClick={() => setSequenceOpen(true)}>
              <ListOrdered className="size-4" /> Renumber sequence
            </Button>
          ) : null
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setStatus(f)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  status === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-muted text-muted-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Order no, table, customer, phone"
              className="pl-9"
            />
          </div>
        </div>

        <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
          {store.canSpecial("orders.deleteOrder") ? (
            <Button
              size="sm"
              variant="outline"
              className="text-primary"
              onClick={() =>
                setDeleteTarget({
                  ids: selected,
                  label: `${selected.length} order${selected.length === 1 ? "" : "s"}`,
                })
              }
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          ) : null}
        </BulkActionsBar>

        <DataTable
          rows={rows}
          loading={loading}
          keyFn={(o) => o.id}
          onRowClick={(o) => navigate({ to: "/orders/$orderId", params: { orderId: o.id } })}
          empty={
            <EmptyState icon={Receipt} title="No orders match" description="Try another filter." />
          }
          columns={[
            {
              key: "sel",
              header: (
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={toggleAllOnPage}
                  aria-label="Select all on this page"
                />
              ),
              cell: (o) => (
                <Checkbox
                  checked={selected.includes(o.id)}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggleOne(o.id)}
                />
              ),
            },
            {
              key: "no",
              header: "Bill No",
              // The real bill_no string, "OFF#" placeholder included -
              // showing the parsed-numeric orderNo here instead (as this
              // used to) could show the same number for two genuinely
              // different orders (an unsynced local order and an unrelated
              // already-real-numbered one both strip down to the same
              // digits), and never matched what a printed bill showed for
              // the same order.
              cell: (o) => <span className="num font-medium">#{displayBillNo(o)}</span>,
            },
            { key: "table", header: "Table", cell: (o) => o.tableLabel },
            { key: "type", header: "Type", cell: (o) => o.type },
            {
              key: "cust",
              header: "Customer",
              cell: (o) => o.customerName ?? <span className="text-muted-foreground">—</span>,
            },
            {
              key: "phone",
              header: "Phone",
              cell: (o) => (
                <span className="num">
                  {o.customerPhone ?? <span className="text-muted-foreground">—</span>}
                </span>
              ),
            },
            {
              key: "date",
              header: "Business Date",
              cell: (o) => <span className="num">{o.businessDate}</span>,
            },
            {
              key: "time",
              header: "Created",
              cell: (o) => <span className="num">{o.createdAt}</span>,
            },
            {
              key: "pay",
              header: "Payment",
              cell: (o) => <span className="text-xs">{paymentSummary(o)}</span>,
            },
            {
              key: "service",
              header: "Service Charge",
              className: "text-right",
              cell: (o) => {
                const t = totalsOf(o, store);
                return t.service ? (
                  <Money value={t.service} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                );
              },
            },
            {
              key: "discount",
              header: "Discount",
              className: "text-right",
              cell: (o) => {
                const t = totalsOf(o, store);
                return t.discount ? (
                  <Money value={t.discount} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                );
              },
            },
            { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
            {
              key: "total",
              header: "Total",
              className: "text-right",
              cell: (o) => <Money value={totalsOf(o, store).grand} className="font-semibold" />,
            },
            {
              key: "actions",
              header: "",
              cell: (o) => {
                const editable = !["Settled", "Cancelled"].includes(o.status);
                // Delete is a real, irreversible soft-delete against the
                // live backend (see store.removeOrder's own comment) for
                // both live and synced-history rows alike - gated by the
                // orders.deleteOrder special permission (Owner by default)
                // rather than hidden outright for settled/historical rows.
                const canDelete = store.canSpecial("orders.deleteOrder");
                const canEditSettled =
                  o.status === "Settled" && store.canSpecial("orders.reopenSettled");
                return (
                  <div className="flex items-center gap-1">
                    {canEditSettled ? (
                      <IconButton
                        label="Edit order"
                        onClick={(e) => {
                          e.stopPropagation();
                          const draftId = store.startEditSettledOrder(o.id);
                          if (draftId) {
                            navigate({
                              to: "/table-grid/order/$orderId",
                              params: { orderId: draftId },
                            });
                          }
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                    ) : null}
                    <div className="relative">
                      <IconButton
                        label="Reprint bill"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.printBill(o.id);
                        }}
                      >
                        <Printer className="size-4" />
                      </IconButton>
                      {store.currentUser.role === "Owner" && o.billPrintCount ? (
                        <span
                          className="pointer-events-none absolute -right-1 -top-1 min-w-4 rounded-full bg-warning-soft px-1 text-center text-[10px] font-bold leading-4 text-warning"
                          title={`Reprinted ${o.billPrintCount} time${o.billPrintCount === 1 ? "" : "s"}`}
                        >
                          {o.billPrintCount}
                        </span>
                      ) : null}
                    </div>
                    <IconButton
                      label="Timeline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimelineOrder(o);
                      }}
                    >
                      <Clock className="size-4" />
                    </IconButton>
                    {editable ? (
                      <IconButton
                        label="Continue order"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/table-grid/order/$orderId", params: { orderId: o.id } });
                        }}
                      >
                        <ArrowRight className="size-4" />
                      </IconButton>
                    ) : null}
                    {canDelete ? (
                      <IconButton
                        label="Delete order"
                        className="text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ ids: [o.id], label: `Order #${o.orderNo}` });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    ) : null}
                  </div>
                );
              },
            },
          ]}
        />
        <TablePager
          page={store.orderHistoryPage}
          pageCount={store.orderHistoryTotalPages}
          total={store.orderHistoryTotal}
          start={(store.orderHistoryPage - 1) * 10}
          end={Math.min(store.orderHistoryPage * 10, store.orderHistoryTotal)}
          onPageChange={goToHistoryPage}
        />
      </SectionCard>

      <Dialog open={!!timelineOrder} onOpenChange={(o) => !o && setTimelineOrder(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>Timeline · Order #{timelineOrder?.orderNo}</DialogTitle>
              {timelineOrder ? <StatusBadge status={timelineOrder.status} /> : null}
            </div>
            <DialogDescription>
              {timelineEntries.length
                ? `${timelineEntries.length} recorded change${timelineEntries.length === 1 ? "" : "s"}, newest first.`
                : "Every recorded change to this order, newest first."}
            </DialogDescription>
          </DialogHeader>
          {timelineLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading timeline…</p>
          ) : timelineEntries.length ? (
            <div className="mt-1">
              {timelineEntries.map((a, i) => {
                const visual = ACTION_VISUALS[a.rawAction] ?? DEFAULT_ACTION_VISUAL;
                const Icon = visual.icon;
                const isLast = i === timelineEntries.length - 1;
                return (
                  <div key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {!isLast ? (
                      <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full",
                        visual.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-3 shadow-card">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold">{a.action}</span>
                        <span className="num text-xs text-muted-foreground">{a.at}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.before ? `${a.before} → ` : ""}
                        {a.after}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <UserRound className="size-3" /> {a.userName}
                      </p>
                      {a.reason ? (
                        <p className="mt-1.5 rounded-lg bg-surface-muted px-2 py-1 text-xs italic text-muted-foreground">
                          "{a.reason}"
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : timelineOrder && !timelineOrder.backendId ? (
            <EmptyState compact icon={Clock} title="Not synced with the server yet" />
          ) : (
            <EmptyState compact icon={Clock} title="No recorded changes yet" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sequenceOpen} onOpenChange={setSequenceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renumber order sequence</DialogTitle>
            <DialogDescription>
              Every order closes back into one continuous run starting at #1 (or from the start of
              the financial year, if bill reset is set to yearly). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSequenceOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                store.remakeOrderSequence();
                setSequenceOpen(false);
              }}
            >
              Confirm renumber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a real deletion and cannot be undone. The order will be removed from Orders
              and its table (if any) freed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.ids.length > 1) {
                  store.removeOrders(deleteTarget.ids);
                  setSelected([]);
                } else {
                  store.removeOrder(deleteTarget.ids[0]);
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
