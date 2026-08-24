import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  ChefHat,
  IndianRupee,
  LayoutDashboard,
  Package,
  Receipt,
  Send,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DataTable,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, inRange, parseDMY, todayLabel } from "@/mock/format";
import { lineTotal, orderTotals, useStore } from "@/mock/store";
import type { TableStatus } from "@/mock/types";

export const Route = createFileRoute("/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · BillerPe" },
      {
        name: "description",
        content:
          "Live sales, covers, average bill value, kitchen load and low-stock alerts for today's service.",
      },
      { property: "og:title", content: "Dashboard · BillerPe" },
      {
        property: "og:description",
        content: "Live sales, covers, kitchen load and stock alerts at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

function isoToDMY(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

function dmyToIso(dmy: string) {
  const [d, m, y] = dmy.split("/");
  return `${y}-${m}-${d}`;
}

const tableStatuses: TableStatus[] = ["Running", "Held", "Bill Generated", "Reserved", "Free"];

// Synced order history (store.orderHistory) carries real business dates
// (e.g. 2026-08-24), not this app's frozen mock "today" (`todayLabel`,
// pinned to 18/08/2026 for all local-only seed/demo data - see
// mock/format.ts). Every stat on this page derived from order history
// needs a range anchored to the real current date instead, or synced data
// would never fall inside "Today"/"Yesterday"/etc. This is scoped to just
// this file - the rest of the app's frozen-date seed/demo system is
// untouched.
function realToday(): string {
  const d = new Date();
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
const REAL_TODAY = realToday();

/** Smoothly tweens the displayed number to `value` whenever it changes. */
function useCountUp(value: number, duration = 0.6) {
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return display;
}

function AnimatedMoney({ value }: { value: number }) {
  return <Money value={Math.round(useCountUp(value))} />;
}

function AnimatedNumber({ value }: { value: number }) {
  return <span className="num">{Math.round(useCountUp(value))}</span>;
}

function DashboardPage() {
  const store = useStore();
  const navigate = useNavigate();

  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState(dmyToIso(addDays(REAL_TODAY, -6)));
  const [customTo, setCustomTo] = useState(dmyToIso(REAL_TODAY));

  const { from, to, rangeLabel } = useMemo(() => {
    switch (rangeKey) {
      case "today":
        return { from: REAL_TODAY, to: REAL_TODAY, rangeLabel: "today" };
      case "yesterday": {
        const d = addDays(REAL_TODAY, -1);
        return { from: d, to: d, rangeLabel: "yesterday" };
      }
      case "30d":
        return { from: addDays(REAL_TODAY, -29), to: REAL_TODAY, rangeLabel: "the last 30 days" };
      case "custom":
        return {
          from: isoToDMY(customFrom) || REAL_TODAY,
          to: isoToDMY(customTo) || REAL_TODAY,
          rangeLabel: "the selected range",
        };
      case "7d":
      default:
        return { from: addDays(REAL_TODAY, -6), to: REAL_TODAY, rangeLabel: "the last 7 days" };
    }
  }, [rangeKey, customFrom, customTo]);

  const spanDays = Math.round((parseDMY(to).getTime() - parseDMY(from).getTime()) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(spanDays - 1));

  // Synced order history always carries real historical totals (see
  // Order.backendTotals) - reading those instead of calling orderTotals()
  // avoids drift from whatever the *current* tax/service-charge config
  // happens to be, which is all orderTotals() has to work with.
  const grandOf = useCallback(
    (o: (typeof store.orderHistory)[number]) =>
      o.backendTotals?.grand ?? orderTotals(o, store).grand,
    [store],
  );

  const settledInRange = useMemo(
    () => store.orderHistory.filter((o) => inRange(o.businessDate, from, to)),
    [store.orderHistory, from, to],
  );
  const prevSettled = useMemo(
    () => store.orderHistory.filter((o) => inRange(o.businessDate, prevFrom, prevTo)),
    [store.orderHistory, prevFrom, prevTo],
  );
  const expensesInRange = useMemo(
    () => store.expenses.filter((e) => inRange(e.date, from, to)),
    [store.expenses, from, to],
  );

  const sales = settledInRange.reduce((s, o) => s + grandOf(o), 0);
  const prevSales = prevSettled.reduce((s, o) => s + grandOf(o), 0);
  const salesDelta = prevSales ? ((sales - prevSales) / prevSales) * 100 : null;

  // Guest count isn't tracked on the backend Order model at all - every
  // synced history entry has guests:0 (see mapRawOrderHistoryEntry), so
  // this undercounts for any range that includes synced data rather than
  // only today's locally-created orders.
  const covers = settledInRange.reduce((s, o) => s + o.guests, 0);
  const avgBill = settledInRange.length ? Math.round(sales / settledInRange.length) : 0;

  const running = store.orders.filter((o) =>
    ["Running", "Held", "Bill Generated"].includes(o.status),
  );
  const occupiedTables = store.tables.filter((t) => t.status !== "Free").length;
  const lowStock = store.rawMaterials.filter((m) => m.stock <= m.reorderLevel);
  const openKots = store.kots.filter((k) => !["Served", "Cancelled"].includes(k.status));

  const paymentMix = useMemo(() => {
    const map = new Map<string, number>();
    settledInRange.forEach((o) => {
      const payments = o.payments ?? [];
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      // Scale each mode's share to the order's actual grand total (tax included) so
      // this panel always reconciles with the Net Sales stat above it.
      const factor = paid ? grandOf(o) / paid : 1;
      payments.forEach((p) => map.set(p.mode, (map.get(p.mode) ?? 0) + p.amount * factor));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [settledInRange, grandOf]);
  const paymentTotal = paymentMix.reduce((s, [, v]) => s + v, 0);

  const typeSplit = useMemo(() => {
    const dineIn = settledInRange
      .filter((o) => o.type === "Dine In")
      .reduce((s, o) => s + grandOf(o), 0);
    const pickup = settledInRange
      .filter((o) => o.type === "Pickup")
      .reduce((s, o) => s + grandOf(o), 0);
    return { dineIn, pickup };
  }, [settledInRange, grandOf]);
  const typeTotal = typeSplit.dineIn + typeSplit.pickup;

  const expenseTotal = expensesInRange.reduce((s, e) => s + e.amount, 0);
  const net = sales - expenseTotal;

  const discountGiven = settledInRange.reduce((s, o) => s + (o.discount?.amount ?? 0), 0);

  const openSession = store.openSessionRecord();
  const closedToday = store.cashSessions.find(
    (c) => c.status === "Closed" && c.closedAt?.startsWith(todayLabel),
  );
  const drawerBalance = openSession ? store.sessionBalance() : null;

  const trendDays = useMemo(() => {
    const days: { day: string; sales: number }[] = [];
    for (let i = 0; i < spanDays; i++) {
      const day = addDays(from, i);
      days.push({
        day,
        sales: store.orderHistory
          .filter((o) => o.businessDate === day)
          .reduce((s, o) => s + grandOf(o), 0),
      });
    }
    return days;
  }, [store, from, spanDays, grandOf]);
  const maxTrend = Math.max(1, ...trendDays.map((d) => d.sales));

  // Reads order history rather than the live `orders` array so this stays
  // consistent with the rest of the page's real-dated range - `orders`
  // only ever carries this app's frozen local "today", which would never
  // match `hourlyDay` once that's anchored to the real current date.
  const hourlyDay = trendDays.length ? trendDays[trendDays.length - 1].day : to;
  const hourly = useMemo(() => {
    const buckets = new Map<number, number>();
    store.orderHistory
      .filter((o) => o.businessDate === hourlyDay)
      .forEach((o) => {
        const m = o.createdAt.match(/(\d{1,2}):\d{2}\s?(am|pm)/i);
        if (!m) return;
        let h = Number(m[1]) % 12;
        if ((m[2] ?? "").toLowerCase() === "pm") h += 12;
        buckets.set(h, (buckets.get(h) ?? 0) + 1);
      });
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, orders]) => ({ hour: `${h % 12 || 12}${h >= 12 ? "p" : "a"}`, orders }));
  }, [store.orderHistory, hourlyDay]);
  const maxHour = Math.max(1, ...hourly.map((h) => h.orders));

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; value: number }>();
    settledInRange.forEach((o) =>
      o.lines.forEach((l) => {
        const cur = map.get(l.name) ?? { qty: 0, value: 0 };
        cur.qty += l.qty;
        cur.value += lineTotal(l);
        map.set(l.name, cur);
      }),
    );
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [settledInRange]);
  const maxItemQty = Math.max(1, ...topItems.map((i) => i.qty));

  const tableCounts = useMemo(() => {
    const base: Record<TableStatus, number> = {
      Free: 0,
      Held: 0,
      Running: 0,
      "Bill Generated": 0,
      Reserved: 0,
    };
    store.tables.forEach((t) => (base[t.status] += 1));
    return base;
  }, [store.tables]);

  return (
    <Page>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={`Business date ${todayLabel} · ${store.currentUser.name} (${store.currentUser.role})`}
        actions={
          <Button onClick={() => navigate({ to: "/table-grid" })}>
            Go to floor <ArrowRight className="size-4" />
          </Button>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  rangeKey === r.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                )}
              >
                {r.label}
              </button>
            ))}
            {rangeKey === "custom" ? (
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                />
              </span>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="primary"
          label="Net sales"
          value={<AnimatedMoney value={sales} />}
          icon={IndianRupee}
          delta={
            salesDelta === null
              ? undefined
              : `${salesDelta >= 0 ? "+" : ""}${salesDelta.toFixed(1)}%`
          }
          hint="vs previous period"
          trend={trendDays.length > 1 ? trendDays.map((d) => d.sales) : undefined}
        />
        <StatCard
          label="Bills settled"
          value={<AnimatedNumber value={settledInRange.length} />}
          icon={Receipt}
          hint={`${covers} covers`}
        />
        <StatCard
          label="Avg. bill value"
          value={<AnimatedMoney value={avgBill} />}
          icon={TrendingUp}
          hint="Dine-in + pickup"
        />
        <StatCard
          label="Running orders"
          value={<AnimatedNumber value={running.length} />}
          icon={Users}
          tone={running.length ? "info" : "default"}
          hint={`${openKots.length} KOTs in kitchen · ${occupiedTables}/${store.tables.length} tables occupied`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Cash drawer"
          value={
            openSession ? (
              <Money value={drawerBalance ?? 0} />
            ) : closedToday ? (
              "Closed"
            ) : (
              "Not opened"
            )
          }
          icon={Wallet}
          tone={openSession ? "primary" : closedToday ? "default" : "warning"}
          hint={
            openSession
              ? `Opening float ₹${openSession.openingFloat.toLocaleString("en-IN")} · opened ${openSession.openedAt}`
              : closedToday
                ? `Counted ₹${(closedToday.countedCash ?? 0).toLocaleString("en-IN")} · variance ₹${(closedToday.variance ?? 0).toLocaleString("en-IN")}`
                : "Open today's session before billing in cash"
          }
        />
        <StatCard
          label="Discount given"
          value={<Money value={Math.round(discountGiven)} />}
          icon={BadgePercent}
          tone={discountGiven ? "warning" : "default"}
          hint={`${settledInRange.filter((o) => o.discount).length} order(s) discounted · ${rangeLabel}`}
        />
        <StatCard
          label="E-bill credits"
          value={store.eBillCredit}
          icon={Send}
          tone={store.eBillCredit <= 5 ? "warning" : "default"}
          hint={
            store.eBillCredit <= 0
              ? "Exhausted — top up to resume sending"
              : "Digital bill sends remaining"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Payment mix" description={`Settled orders · ${rangeLabel}`}>
          <ul className="space-y-3">
            {paymentMix.length ? (
              paymentMix.map(([mode, amount]) => (
                <li key={mode}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{mode}</span>
                    <Money value={Math.round(amount)} className="font-semibold" />
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${paymentTotal ? (amount / paymentTotal) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No settled orders in this range.</li>
            )}
          </ul>
        </SectionCard>

        <SectionCard title="Dine-in vs Pickup" description={`Revenue share · ${rangeLabel}`}>
          {typeTotal ? (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(typeSplit.dineIn / typeTotal) * 100}%` }}
                />
                <div
                  className="h-full bg-info"
                  style={{ width: `${(typeSplit.pickup / typeTotal) * 100}%` }}
                />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" /> Dine In
                  </span>
                  <Money value={Math.round(typeSplit.dineIn)} className="font-semibold" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-info" /> Pickup
                  </span>
                  <Money value={Math.round(typeSplit.pickup)} className="font-semibold" />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No settled orders in this range.</p>
          )}
        </SectionCard>

        <SectionCard title="Expense & net" description={rangeLabel}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sales</span>
              <Money value={Math.round(sales)} className="font-semibold" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expenses</span>
              <Money value={Math.round(expenseTotal)} className="font-semibold" />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium">Net</span>
              <Money
                value={Math.round(net)}
                className={cn("font-semibold", net >= 0 ? "text-success" : "text-warning")}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title={`Sales — ${rangeLabel}`} className="lg:col-span-2">
          {trendDays.length > 1 ? (
            <div className="flex h-52 gap-3">
              {trendDays.map((d) => (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="num text-[11px] text-muted-foreground">
                    {Math.round(d.sales / 1000)}k
                  </span>
                  <div className="relative w-full flex-1">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-lg bg-primary/85 transition-all"
                      style={{ height: `${(d.sales / maxTrend) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{d.day.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex h-52 items-center justify-center text-center text-sm text-muted-foreground">
              A single day is selected — see the hourly flow below instead.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Kitchen load" description="Open KOTs by kitchen">
          <ul className="space-y-3">
            {store.kitchens
              .map((k) => k.name)
              .map((station) => {
                const n = openKots.filter((k) => k.station === station).length;
                const busy = n >= 2;
                return (
                  <li key={station}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{station}</span>
                      <span className={cn("num font-semibold", busy && "text-warning")}>{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-muted">
                      <div
                        className={cn(
                          "h-1.5 rounded-full transition-colors",
                          busy ? "animate-pulse bg-warning" : "bg-info",
                        )}
                        style={{ width: `${Math.min(100, n * 25)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => navigate({ to: "/kds" })}
          >
            <ChefHat className="size-4" /> Open kitchen display
          </Button>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Hourly order flow" description={hourlyDay} className="lg:col-span-2">
          {hourly.length ? (
            <div className="flex h-40 gap-2">
              {hourly.map((h) => (
                <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="relative w-full flex-1">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-md bg-info/80"
                      style={{ height: `${(h.orders / maxHour) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{h.hour}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
              No orders recorded on {hourlyDay}.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Low stock alerts"
          description={`${lowStock.length} items at or below reorder level`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/stock" })}>
              View
            </Button>
          }
        >
          <ul className="space-y-2">
            {lowStock.slice(0, 5).map((m) => {
              const critical = m.stock <= m.reorderLevel * 0.5;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <AlertTriangle
                      className={cn(
                        "size-4 shrink-0",
                        critical ? "animate-pulse text-destructive" : "text-warning",
                      )}
                    />
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span
                    className={cn(
                      "num shrink-0 text-xs",
                      critical ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {m.stock} / {m.reorderLevel} {m.unit}
                  </span>
                </li>
              );
            })}
            {!lowStock.length ? (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="size-4" /> All materials healthy
              </li>
            ) : null}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Top ordered items" description={rangeLabel} className="lg:col-span-2">
          <ul className="space-y-2.5">
            {topItems.length ? (
              topItems.map((i) => (
                <li key={i.name} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm sm:w-40">{i.name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${(i.qty / maxItemQty) * 100}%` }}
                    />
                  </div>
                  <span className="num w-8 shrink-0 text-right text-xs text-muted-foreground">
                    {i.qty}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No item-level sales in this range.</li>
            )}
          </ul>
        </SectionCard>

        <SectionCard title="Tables" description="Current status, all sections">
          <ul className="space-y-3">
            {tableStatuses.map((status) => (
              <li key={status}>
                <div className="flex items-center justify-between text-sm">
                  <span>{status}</span>
                  <span className="num font-semibold">{tableCounts[status]}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${(tableCounts[status] / store.tables.length) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Live orders"
        description="Tap a row to continue the order"
        className="mt-4"
        bodyClassName="p-0 sm:p-0"
      >
        <div className="p-4 sm:p-5">
          <DataTable
            rows={running}
            keyFn={(o) => o.id}
            onRowClick={(o) =>
              navigate({ to: "/table-grid/order/$orderId", params: { orderId: o.id } })
            }
            columns={[
              {
                key: "no",
                header: "Order",
                cell: (o) => <span className="num">#{o.orderNo}</span>,
              },
              { key: "table", header: "Table", cell: (o) => o.tableLabel },
              { key: "type", header: "Type", cell: (o) => o.type },
              {
                key: "guests",
                header: "Guests",
                cell: (o) => <span className="num">{o.guests}</span>,
              },
              {
                key: "kot",
                header: "KOTs",
                cell: (o) => <span className="num">{o.kotRounds}</span>,
              },
              { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
              {
                key: "total",
                header: "Total",
                className: "text-right",
                cell: (o) => (
                  <Money value={orderTotals(o, store).grand} className="font-semibold" />
                ),
              },
            ]}
          />
        </div>
      </SectionCard>
    </Page>
  );
}
