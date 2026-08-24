import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock, Printer, Receipt, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  BulkActionsBar,
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { orderTotals, useStore } from "@/mock/store";
import type { Order, OrderStatus } from "@/mock/types";

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

  const rows = useMemo(
    () =>
      store
        .allOrders()
        .sort((a, b) => b.orderNo - a.orderNo)
        .filter((o) => status === "All" || o.status === status)
        .filter((o) => {
          if (!q) return true;
          const t = q.toLowerCase();
          return (
            String(o.orderNo).includes(q) ||
            o.tableLabel.toLowerCase().includes(t) ||
            (o.customerName ?? "").toLowerCase().includes(t) ||
            (o.customerPhone ?? "").includes(q)
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.orders, store.orderHistory, status, q],
  );
  const paged = usePagedRows(rows, 10);

  useEffect(() => setSelected([]), [status, q]);

  // "Delete selected" is still a local-only action (see the actions
  // column's own comment) - history rows are excluded from bulk selection
  // entirely so it can't be used against real settled orders.
  const pageIds = paged.pageRows.filter((o) => !o.id.startsWith("oh-")).map((o) => o.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggleAllOnPage = () =>
    setSelected((prev) =>
      allPageSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : [...new Set([...prev, ...pageIds])],
    );
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const timelineEntries = timelineOrder
    ? store.auditLogs.filter((a) => a.entity === `Order #${timelineOrder.orderNo}`)
    : [];

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        title="Orders"
        description="Live orders from this session, plus real settled history from the last 90 days."
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
          <Button
            size="sm"
            variant="outline"
            className="text-primary"
            onClick={() => {
              store.removeOrders(selected);
              setSelected([]);
            }}
          >
            <Trash2 className="size-4" /> Delete selected
          </Button>
        </BulkActionsBar>

        <DataTable
          rows={paged.pageRows}
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
              cell: (o) =>
                o.id.startsWith("oh-") ? null : (
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleOne(o.id)}
                  />
                ),
            },
            {
              key: "no",
              header: "Order",
              cell: (o) => <span className="num font-medium">#{o.orderNo}</span>,
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
                // Synced history (id "oh-...") is a read-only snapshot of
                // real backend state - delete is a real, irreversible
                // soft-delete against the live backend now (see
                // store.removeOrder's own comment), so it's hidden for
                // history rows rather than exposed casually on old
                // records.
                const isHistorical = o.id.startsWith("oh-");
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Reprint bill"
                      onClick={(e) => {
                        e.stopPropagation();
                        void store.printBill(o.id);
                      }}
                    >
                      <Printer className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Timeline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimelineOrder(o);
                      }}
                    >
                      <Clock className="size-4" />
                    </Button>
                    {editable ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Continue order"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/table-grid/order/$orderId", params: { orderId: o.id } });
                        }}
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    ) : null}
                    {!isHistorical ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-primary"
                        title="Delete order"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.removeOrder(o.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              },
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <Dialog open={!!timelineOrder} onOpenChange={(o) => !o && setTimelineOrder(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Timeline · Order #{timelineOrder?.orderNo}</DialogTitle>
            <DialogDescription>
              Every recorded change to this order, newest first.
            </DialogDescription>
          </DialogHeader>
          {timelineEntries.length ? (
            <ul className="space-y-2">
              {timelineEntries.map((a) => (
                <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.action}</span>
                    <span className="num text-xs text-muted-foreground">{a.at}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.before ? `${a.before} → ` : ""}
                    {a.after}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">by {a.userName}</p>
                  {a.reason ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">"{a.reason}"</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Clock} title="No recorded changes yet" />
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
