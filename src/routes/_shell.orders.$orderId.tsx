import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, ChefHat, Printer, Receipt, Send } from "lucide-react";

import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { RESTAURANT } from "@/mock/data";
import { lineTotal, orderTotals, useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order Detail · BillerPe" },
      {
        name: "description",
        content: "Full order trail: items, KOT rounds, charges, taxes, payments and reprints.",
      },
      { property: "og:title", content: "Order Detail · BillerPe" },
      {
        property: "og:description",
        content: "Items, KOT rounds, taxes and payments for one order.",
      },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const store = useStore();
  const navigate = useNavigate();
  const order = store.orderById(orderId);

  if (!order) {
    return (
      <Page>
        <EmptyState
          icon={Receipt}
          title="Order not found"
          action={<Button onClick={() => navigate({ to: "/orders" })}>Back to orders</Button>}
        />
      </Page>
    );
  }

  // Synced history carries real backendTotals - preferring those over a
  // fresh recompute avoids drift from today's tax/service-charge config
  // (see Order.backendTotals's own comment in mock/types.ts).
  const t = order.backendTotals
    ? {
        ...orderTotals(order, store),
        grand: order.backendTotals.grand,
        discount: order.backendTotals.discount,
        service: order.backendTotals.serviceCharge,
      }
    : orderTotals(order, store);
  const kots = store.kots.filter((k) => k.orderId === order.id);
  // Historical entries (id "oh-...") are always "Settled" (see
  // mapRawOrderHistoryEntry), so this already excludes them from Cancel -
  // that's now a real, irreversible soft-delete against the live backend
  // (see store.cancelOrder's own comment), not something to expose
  // casually on old records anyway.
  const editable = !["Settled", "Cancelled"].includes(order.status);

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        title={`Order #${order.orderNo}`}
        description={`${order.tableLabel} · ${order.type} · ${order.guests} guests · created ${order.createdAt} by ${order.createdBy}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate({ to: "/orders" })}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => void store.printBill(order.id)}>
              <Printer className="size-4" /> Reprint bill
            </Button>
            <Button
              variant="outline"
              disabled={!order.customerPhone}
              title={order.customerPhone ? undefined : "No customer phone number attached"}
              onClick={() => void store.sendEBill(order.id)}
            >
              <Send className="size-4" /> Share
            </Button>
            {editable ? (
              <Button
                onClick={() =>
                  navigate({ to: "/table-grid/order/$orderId", params: { orderId: order.id } })
                }
              >
                Continue order
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SectionCard
            title="Items"
            description={`${order.lines.length} lines · ${order.kotRounds} KOT rounds`}
          >
            {order.itemised ? (
              <DataTable
                rows={order.lines}
                keyFn={(l) => l.id}
                columns={[
                  {
                    key: "item",
                    header: "Item",
                    cell: (l) => (
                      <div>
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[l.variant, ...(l.addons ?? []).map((a) => a.name)]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: "kot",
                    header: "KOT",
                    cell: (l) => <span className="num">{l.kotRound}</span>,
                  },
                  {
                    key: "origin",
                    header: "Origin",
                    cell: (l) => l.originTable ?? order.tableLabel,
                  },
                  { key: "qty", header: "Qty", cell: (l) => <span className="num">{l.qty}</span> },
                  { key: "rate", header: "Rate", cell: (l) => <Money value={l.price} /> },
                  {
                    key: "amt",
                    header: "Amount",
                    className: "text-right",
                    cell: (l) => <Money value={lineTotal(l)} className="font-semibold" />,
                  },
                ]}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Non-itemised offline fallback bill. Captured total:{" "}
                <Money value={order.fallbackTotal ?? 0} className="font-semibold text-foreground" />
              </div>
            )}
          </SectionCard>

          <SectionCard title="KOT trail" description="Every ticket printed for this order">
            {kots.length ? (
              <ul className="space-y-2">
                {kots.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        KOT #{k.kotNo} · Round {k.round} · {k.station}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {k.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num text-xs text-muted-foreground">{k.createdAt}</span>
                      <StatusBadge status={k.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={ChefHat} title="No KOT printed yet" />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Bill summary"
            description={`${RESTAURANT.name} · GSTIN ${RESTAURANT.gstin}`}
          >
            <dl className="space-y-1.5 text-sm">
              <Line label="Subtotal" value={t.subtotal} />
              {t.discount ? (
                <Line label={`Discount (${order.discount?.label})`} value={-t.discount} />
              ) : null}
              {t.service ? <Line label="Service charge" value={t.service} /> : null}
              {t.delivery ? <Line label="Delivery charge" value={t.delivery} /> : null}
              {t.packaging ? <Line label="Packaging charge" value={t.packaging} /> : null}
              {t.taxLines.map((tx) => (
                <Line key={tx.id} label={tx.name} value={tx.amount} />
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Grand total</dt>
                <dd>
                  <Money value={t.grand} />
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Payments">
            {order.payments?.length ? (
              <ul className="space-y-2 text-sm">
                {order.payments.map((p, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{p.mode}</span>
                    <Money value={p.amount} className="font-medium" />
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>Settled at</span>
                  <span className="num">{order.settledAt ?? "—"}</span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Not settled yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Status">
            <div className="flex items-center justify-between">
              <StatusBadge status={order.status} />
              {editable ? (
                <Button variant="outline" size="sm" onClick={() => store.cancelOrder(order.id)}>
                  <Ban className="size-4" /> Cancel order
                </Button>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </Page>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}
