import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addonLabel } from "@/mock/format";
import { ArrowLeft, Ban, ChefHat, Printer, Receipt, Send } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { roundQty } from "@/lib/qty";
import { displayBillNo, lineTotal, orderTotals, useStore } from "@/mock/store";

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
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

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
  // Live KDS status, when this device has it (memory only - used as a badge).
  const kots = store.kots.filter((k) => k.orderId === order.id);
  // KOT trail: built from the order's own saved lines, so it is complete on
  // any device and after a refresh (it used to list only the tickets this
  // browser happened to have seen - usually none).
  const byRound = new Map<number, typeof order.lines>();
  for (const l of order.lines) {
    if (!Number.isFinite(l.kotRound)) continue;
    byRound.set(l.kotRound, [...(byRound.get(l.kotRound) ?? []), l]);
  }
  const kotRounds = [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, lines]) => {
      const first = lines
        .map((l) => l.kotAt)
        .filter(Boolean)
        .sort()[0];
      const at = first
        ? new Date(first).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
        : undefined;
      return { round, lines, at };
    });
  const unsent = order.lines.filter((l) => !Number.isFinite(l.kotRound));
  // Items: each dish once (owner decision, 2026-09-28) - Jems x1 in round 1
  // and Jems x1 in round 2 is Jems x2. Lines stay apart when anything that
  // shows differs: variant, addons (and their qty), price, note, origin table.
  const mergedLines = (() => {
    const out = new Map<string, (typeof order.lines)[number]>();
    for (const l of order.lines) {
      const key = [
        l.itemId,
        l.name,
        l.variant ?? "",
        l.price,
        l.note ?? "",
        l.originTable ?? "",
        (l.addons ?? [])
          .map((a) => `${a.addonId ?? a.name}:${a.qty}:${a.price}`)
          .sort()
          .join("|"),
      ].join("~");
      const seen = out.get(key);
      out.set(
        key,
        seen
          ? {
              ...seen,
              qty: roundQty(seen.qty + l.qty),
              addons: seen.addons?.map((a, i) => ({ ...a, qty: a.qty + (l.addons?.[i]?.qty ?? 0) })),
            }
          : { ...l },
      );
    }
    return [...out.values()];
  })();
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
        title={`Order #${displayBillNo(order)}`}
        description={`${order.tableLabel} · ${order.type} · ${order.guests} guests · opened ${order.openedAt ?? order.createdAt} by ${order.createdBy}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate({ to: "/orders" })}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => void store.printBill(order.id)}>
              <Printer className="size-4" /> Reprint bill
              {store.currentUser.role === "Owner" && order.billPrintCount ? (
                <span
                  className="ml-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning"
                  title="How many times this bill has been reprinted"
                >
                  {order.billPrintCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              disabled={!order.customerPhone}
              title={order.customerPhone ? undefined : "No customer phone number attached"}
              onClick={() => void store.sendEBill(order.id)}
            >
              <Send className="size-4" /> Send E-bill
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
            description={`${mergedLines.length} items · ${kotRounds.length} KOT round${kotRounds.length === 1 ? "" : "s"}`}
          >
            {order.itemised ? (
              <DataTable
                rows={mergedLines}
                keyFn={(l) => l.id}
                columns={[
                  {
                    key: "item",
                    header: "Item",
                    cell: (l) => (
                      <div>
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[l.variant, ...(l.addons ?? []).map(addonLabel)]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        {l.note ? (
                          <p className="text-xs italic text-warning">“{l.note}”</p>
                        ) : null}
                      </div>
                    ),
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

          <SectionCard
            title="KOT trail"
            description="Each KOT sent to the kitchen, round by round, with what was on it"
          >
            {kotRounds.length || unsent.length ? (
              <ul className="space-y-2">
                {kotRounds.map(({ round, lines, at }) => {
                  const kds = kots.find((k) => k.round === round);
                  return (
                    <li key={round} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">KOT {round}</p>
                        <div className="flex items-center gap-2">
                          {at ? (
                            <span className="num text-xs text-muted-foreground">{at}</span>
                          ) : null}
                          {kds ? <StatusBadge status={kds.status} /> : null}
                        </div>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {lines.map((l) => (
                          <li key={l.id}>
                            <span className="num font-medium text-foreground">{l.qty}×</span>{" "}
                            {l.name}
                            {l.variant ? ` (${l.variant})` : ""}
                            {l.addons?.length ? ` + ${l.addons.map(addonLabel).join(", ")}` : ""}
                            {l.originTable ? ` · from ${l.originTable}` : ""}
                            {l.note ? ` · “${l.note}”` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
                {unsent.length ? (
                  <li className="rounded-xl border border-dashed border-border p-3">
                    <p className="text-sm font-medium">Not sent to the kitchen yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {unsent.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                    </p>
                  </li>
                ) : null}
              </ul>
            ) : (
              <EmptyState compact icon={ChefHat} title="No KOT sent yet" />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Bill summary"
            description={[
              store.restaurant?.name ?? store.serverHotelName ?? "",
              store.restaurant?.gstin ? `GSTIN ${store.restaurant.gstin}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
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
                {order.openedAt ? (
                  <li
                    data-opened-at
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span>Opened at</span>
                    <span className="num">{order.openedAt}</span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Not settled yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Status">
            <div className="flex items-center justify-between">
              <StatusBadge status={order.status} />
              {editable ? (
                <Button variant="outline" size="sm" onClick={() => setCancelConfirmOpen(true)}>
                  <Ban className="size-4" /> Cancel order
                </Button>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>

      <AlertDialog
        open={cancelConfirmOpen}
        onOpenChange={(o) => {
          setCancelConfirmOpen(o);
          if (!o) setCancelReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order #{order.orderNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a real, irreversible cancellation against the backend - the table is freed and
              this order will not reappear anywhere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (optional, kept in the audit log)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. duplicate order, guest walked out…"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (store.cancelOrder(order.id, cancelReason.trim() || undefined)) {
                  setCancelConfirmOpen(false);
                  setCancelReason("");
                }
              }}
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
