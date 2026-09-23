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
import {
  ApiError,
  reportApi,
  type RawDayWisePeriod,
  type RawItemWiseRow,
  type RawPosCollection,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RANGE_OPTIONS,
  addDays,
  dmyToIso,
  inRange,
  isoToDMY,
  parseDMY,
  type RangeKey,
  realToday,
  resolveRange,
} from "@/mock/format";
import { orderTotals, useStore } from "@/mock/store";
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

const tableStatuses: TableStatus[] = ["Running", "Hold", "Bill Generated", "Reserved", "Free"];
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

  // Cash Sessions, Expenses, and E-Bill Credit are confirmed out of scope
  // for the Local EXE - loaded here on Dashboard's own mount (it shows
  // summaries of all three) instead of globally on every login (see
  // AppShell.tsx's own comment on why that moved).
  useEffect(() => {
    void store.loadCashSessionsFromServer();
    void store.loadExpensesFromServer();
    void store.loadEBillCreditFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { from, to, rangeLabel } = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  const spanDays = Math.round((parseDMY(to).getTime() - parseDMY(from).getTime()) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(spanDays - 1));

  // Synced order history always carries real historical totals (see
  // Order.backendTotals) - reading those instead of calling orderTotals()
  // avoids drift from whatever the *current* tax/service-charge config
  // happens to be, which is all orderTotals() has to work with. Still
  // used below for covers/type-split/hourly-distribution - the money
  // totals (sales, avg bill, payment mix, discount) moved to the real
  // backend aggregate below instead (task 45: those drifted from what
  // the Reports pages show for the identical range, since orderHistory is
  // a paginated local cache, not a guaranteed-complete dataset, and this
  // page was summing already-rounded per-order totals while the backend
  // sums first and rounds once).
  const grandOf = useCallback(
    (o: (typeof store.orderHistory)[number]) =>
      o.backendTotals?.grand ?? orderTotals(o, store).grand,
    [store],
  );

  const expensesInRange = useMemo(
    () => store.expenses.filter((e) => inRange(e.date, from, to)),
    [store.expenses, from, to],
  );

  // Same real aggregate (controller/reports/orderRelated.js's
  // dayWiseGrowthReport) the "Day-wise Sales" report itself reads - both
  // screens now derive from the identical backend computation for the
  // identical range, so they can't drift apart.
  const [dayWise, setDayWise] = useState<RawDayWisePeriod[] | null>(null);
  const [prevDayWise, setPrevDayWise] = useState<RawDayWisePeriod[] | null>(null);
  const isoFrom = dmyToIso(from);
  const isoTo = dmyToIso(to);
  useEffect(() => {
    let cancelled = false;
    reportApi
      .dayWiseSales(isoFrom, isoTo)
      .then(({ periodData }) => !cancelled && setDayWise(periodData))
      .catch((err) => {
        if (cancelled) return;
        setDayWise([]);
        console.error(
          "[dashboard] Could not load day-wise sales:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isoFrom, isoTo]);
  useEffect(() => {
    let cancelled = false;
    reportApi
      .dayWiseSales(dmyToIso(prevFrom), dmyToIso(prevTo))
      .then(({ periodData }) => !cancelled && setPrevDayWise(periodData))
      .catch((err) => {
        if (cancelled) return;
        setPrevDayWise([]);
        console.error(
          "[dashboard] Could not load previous-period sales:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [prevFrom, prevTo]);

  // How many KOTs were punched in the selected range, and how many of
  // those are "not in use" - the order they belong to was later deleted,
  // or is still sitting unsettled (no bill generated yet). Same backend
  // computation the KOT Tickets report itself reads (controller/
  // reports.js's kotReport), so this card and that report can't drift.
  const [kotSummary, setKotSummary] = useState<{
    totalTickets: number;
    deletedTickets: number;
    unbilledTickets: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    reportApi
      .kotReport(isoFrom, isoTo)
      .then(({ totalTickets, deletedTickets, unbilledTickets }) => {
        if (!cancelled) setKotSummary({ totalTickets, deletedTickets, unbilledTickets });
      })
      .catch((err) => {
        if (cancelled) return;
        setKotSummary(null);
        console.error(
          "[dashboard] Could not load KOT punch summary:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isoFrom, isoTo]);

  // "Top ordered items" reads the SAME call the Item-wise Sales report reads
  // (controller/reports.js#itemAndCategoryWiseSales), which aggregates every
  // order line in the range in SQL. It used to be summed here from
  // store.orderHistory, which is ONE SERVER-PAGINATED PAGE of ten orders - so the Dashboard's top items and
  // the Item-wise report disagreed for any range with more than ten bills,
  // exactly as reported. Nothing on this card is derived locally now.
  const [itemWise, setItemWise] = useState<RawItemWiseRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    reportApi
      .itemAndCategoryWiseSales(isoFrom, isoTo)
      .then(({ itemWise: rows }) => !cancelled && setItemWise(rows))
      .catch((err) => {
        if (cancelled) return;
        setItemWise([]);
        console.error(
          "[dashboard] Could not load item-wise sales:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isoFrom, isoTo]);

  // Order-type split and the discounted-order count come from the POS
  // Collection aggregate for the same reason - both were computed from that
  // same ten-row page of history.
  const [collection, setCollection] = useState<RawPosCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    reportApi
      .posCollection(isoFrom, isoTo)
      .then(({ posCollections }) => !cancelled && setCollection(posCollections))
      .catch((err) => {
        if (cancelled) return;
        setCollection(null);
        console.error(
          "[dashboard] Could not load POS collection:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isoFrom, isoTo]);

  const dayRows = useMemo(() => (dayWise ?? []).filter((p) => p.period !== "Total"), [dayWise]);
  const totalRow = useMemo(() => dayWise?.find((p) => p.period === "Total"), [dayWise]);
  const prevTotalRow = useMemo(() => prevDayWise?.find((p) => p.period === "Total"), [prevDayWise]);

  const sales = totalRow?.grandAmount ?? 0;
  const prevSales = prevTotalRow?.grandAmount ?? 0;
  const salesDelta =
    dayWise && prevDayWise && prevSales ? ((sales - prevSales) / prevSales) * 100 : null;
  const settledCount = totalRow?.totalOrders ?? 0;

  // Guest count is not a column on the order at all - not locally and not on
  // the server - so every settled order reads back guests:0 (see
  // mapRawOrderHistoryEntry). Summing it produced a "0 covers" hint that
  // looked like a real measurement of an empty restaurant. The only place a
  // guest count genuinely exists is on a table while it is occupied, so that
  // is what is shown, labelled as such; a covers figure per settled bill
  // needs the column to be added first.
  const seatedGuests = store.tables.reduce((n, t) => n + (t.guests ?? 0), 0);
  const avgBill = settledCount ? Math.round(sales / settledCount) : 0;

  const running = store.orders.filter((o) =>
    ["Running", "Hold", "Bill Generated"].includes(o.status),
  );
  const occupiedTables = store.tables.filter((t) => t.status !== "Free").length;
  const lowStock = store.rawMaterials.filter((m) => m.stock <= m.reorderLevel);
  const openKots = store.kots.filter((k) => !["Served", "Cancelled"].includes(k.status));

  const paymentMix = useMemo(() => {
    if (!totalRow) return [] as [string, number][];
    return (
      [
        ["Cash", totalRow.cash],
        ["UPI", totalRow.upi],
        ["Card", totalRow.card],
        ["Due", totalRow.due],
        // The outlet's own payment modes (Paytm, ...), one line each.
        ...(totalRow.otherModes ?? []).map((m) => [m.name, m.total]),
      ] as [string, number][]
    )
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [totalRow]);
  const paymentTotal = paymentMix.reduce((s, [, v]) => s + v, 0);

  // Straight from the aggregate's own GROUP BY order_type, so the two halves
  // always add up to the sales figure above them.
  const typeSplit = useMemo(() => {
    const amountFor = (...types: string[]) =>
      (collection?.orderTypeSplit ?? [])
        .filter((r) => types.includes((r.orderType ?? "").toLowerCase()))
        .reduce((sum, r) => sum + r.amount, 0);
    // The column stores "dinin" - the backend's own spelling, confirmed
    // against the live data - so that is what is matched; the other spellings
    // are accepted too rather than silently reporting zero dine-in sales if
    // it is ever normalised.
    return {
      dineIn: amountFor("dinin", "dinein", "dine in", "dine_in"),
      pickup: amountFor("pickup"),
    };
  }, [collection]);
  const typeTotal = typeSplit.dineIn + typeSplit.pickup;

  const expenseTotal = expensesInRange.reduce((s, e) => s + e.amount, 0);
  const net = sales - expenseTotal;

  const discountGiven = totalRow?.totalDiscount ?? 0;

  const openSession = store.openSessionRecord();
  const closedToday = store.cashSessions.find(
    (c) => c.status === "Closed" && c.closedAt?.startsWith(REAL_TODAY),
  );
  const drawerBalance = openSession ? store.sessionBalance() : null;

  const trendDays = useMemo(
    () =>
      dayRows.map((p) => {
        // p.period comes back "YYYY-MM-DD" (controller/reports/orderRelated.js
        // formats it with moment().format('YYYY-MM-DD')) - the old `.slice(0,
        // 5)` display assumed a "DD/MM/YYYY" string instead and rendered the
        // same "2026-" prefix under every single bar. Reformatted to this
        // app's own DD/MM convention (matches realToday()/rangeLabel).
        const [, m, dd] = p.period.split("-");
        return { day: p.period, label: dd && m ? `${dd}/${m}` : p.period, sales: p.grandAmount };
      }),
    [dayRows],
  );
  const maxTrend = Math.max(1, ...trendDays.map((d) => d.sales));

  // Reads order history rather than the live `orders` array so this stays
  // consistent with the rest of the page's real-dated range - `orders`
  // only ever carries this app's frozen local "today", which would never
  // match `hourlyDay` once that's anchored to the real current date.
  // trendDays' own `day` is the API's raw "YYYY-MM-DD" (see its own
  // comment); orderHistory's businessDate is "DD/MM/YYYY" - converted here
  // so the filter below can actually match rather than silently finding
  // nothing every single day regardless of the real order history.
  const hourlyDay = trendDays.length ? isoToDMY(trendDays[trendDays.length - 1].day) : to;
  const hourly = useMemo(() => {
    const buckets = new Map<number, { orders: number; amount: number }>();
    store.orderHistory
      .filter((o) => o.businessDate === hourlyDay)
      .forEach((o) => {
        const m = o.createdAt.match(/(\d{1,2}):\d{2}\s?(am|pm)/i);
        if (!m) return;
        let h = Number(m[1]) % 12;
        if ((m[2] ?? "").toLowerCase() === "pm") h += 12;
        const bucket = buckets.get(h) ?? { orders: 0, amount: 0 };
        bucket.orders += 1;
        bucket.amount += grandOf(o);
        buckets.set(h, bucket);
      });
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, v]) => ({
        hour: `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`,
        orders: v.orders,
        amount: v.amount,
      }));
  }, [store.orderHistory, hourlyDay, grandOf]);
  const maxHour = Math.max(1, ...hourly.map((h) => h.orders));

  // The report returns one row per item AND variant; the card shows items, so
  // a variant's quantity is folded back into its item (the report's own
  // Item-wise table is where the per-variant breakdown belongs).
  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; value: number }>();
    (itemWise ?? []).forEach((r) => {
      const cur = map.get(r.item_name) ?? { qty: 0, value: 0 };
      cur.qty += Number(r.totalQty) || 0;
      cur.value += Number(r.totalSale) || 0;
      map.set(r.item_name, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [itemWise]);
  const maxItemQty = Math.max(1, ...topItems.map((i) => i.qty));

  const tableCounts = useMemo(() => {
    const base: Record<TableStatus, number> = {
      Free: 0,
      Hold: 0,
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
        description={`Business date ${REAL_TODAY} · ${store.currentUser.name} (${store.currentUser.role})`}
        actions={
          <Button
            hidden={!store.can("biller", "view")}
            onClick={() => navigate({ to: "/table-grid" })}
          >
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
          value={<AnimatedNumber value={settledCount} />}
          icon={Receipt}
          hint={`${seatedGuests} guest(s) seated now`}
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
          hint={`${collection?.discounted?.orders ?? 0} order(s) discounted · ${rangeLabel}`}
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
                <div
                  key={d.day}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  title={`${d.label} · ₹${d.sales.toLocaleString("en-IN")}`}
                >
                  <Money
                    value={d.sales}
                    className="block w-full truncate text-center text-[11px] text-muted-foreground"
                  />
                  <div className="relative w-full flex-1">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-lg bg-primary/85 transition-all"
                      style={{ height: `${(d.sales / maxTrend) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{d.label}</span>
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
            hidden={!store.can("kds", "view")}
            variant="outline"
            className="mt-4 w-full"
            onClick={() => navigate({ to: "/kds" })}
          >
            <ChefHat className="size-4" /> Open kitchen display
          </Button>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="KOT punches"
          description={rangeLabel}
          bodyClassName="p-3 sm:p-4"
          className="lg:col-span-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total KOTs punched"
              value={kotSummary?.totalTickets ?? "—"}
              tone="primary"
            />
            <StatCard label="Deleted" value={kotSummary?.deletedTickets ?? "—"} tone="warning" />
            <StatCard
              label="Not billed"
              value={kotSummary?.unbilledTickets ?? "—"}
              tone="warning"
            />
          </div>
          <Button
            hidden={!store.can("reports", "view")}
            variant="outline"
            className="mt-4 w-full"
            onClick={() =>
              navigate({ to: "/reports/$reportId", params: { reportId: "kot-report" } })
            }
          >
            <Receipt className="size-4" /> View full KOT report
          </Button>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Hourly order flow" description={hourlyDay} className="lg:col-span-2">
          {hourly.length ? (
            <div className="flex h-44 gap-2">
              {hourly.map((h) => (
                <div
                  key={h.hour}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                  title={`${h.hour} · ${h.orders} order${h.orders === 1 ? "" : "s"} · ₹${h.amount.toLocaleString("en-IN")}`}
                >
                  <Money
                    value={h.amount}
                    className="block w-full truncate text-center text-[11px] text-muted-foreground"
                  />
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
            <Button
              hidden={
                !["stock-masters", "stock-transactions", "stock-recipes", "stock-reports"].some(
                  (m) => store.can(m as "stock-masters", "view"),
                )
              }
              size="sm"
              variant="ghost"
              onClick={() => navigate({ to: "/stock" })}
            >
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
