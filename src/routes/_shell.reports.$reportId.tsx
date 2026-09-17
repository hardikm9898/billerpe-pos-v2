import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiError, reportApi } from "@/lib/api";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { REPORT_TYPES } from "@/mock/data";
import {
  RANGE_OPTIONS,
  addDays,
  dmyToIso,
  inRange,
  type RangeKey,
  realToday,
  resolveRange,
} from "@/mock/format";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/reports/$reportId")({
  head: () => ({
    meta: [
      { title: "Report Detail · BillerPe" },
      {
        name: "description",
        content: "Drill into a single BillerPe report derived from live prototype data.",
      },
      { property: "og:title", content: "Report Detail · BillerPe" },
      { property: "og:description", content: "Drill into a single BillerPe report." },
    ],
  }),
  component: ReportDetailPage,
});

interface Row {
  label: string;
  a?: string | number;
  b?: string | number;
  value: number;
}

// Reports computed by a real backend aggregate over the whole selected
// range: controller/reports.js's dayWiseSales / posCollection /
// itemAndCategoryWiseSales (which covers both item-wise and category-wise in
// one call) / discountedReports / kotReport / tableAndStaffWiseSales.
//
// table-performance and staff-performance were in the list below this one
// until they were moved up here, because "reads a fully backend-synced store
// slice" was not true of them: they read the SETTLED orders in the store, and
// settled orders live in store.orderHistory, which is one server-paginated
// page of ten. Both reports therefore showed the last ten bills whatever
// range was selected. Everything still left below is either point-in-time
// (closing-stock), has no real date to filter on (purchase-report), or reads
// a slice that genuinely is loaded in full (expense-report, cash-session).
const REMOTE_REPORT_IDS = new Set([
  "day-wise-sales",
  "item-wise-sales",
  "category-wise-sales",
  "payment-mode",
  "tax-report",
  "discount-report",
  "kot-report",
  "table-performance",
  "staff-performance",
]);

function ReportDetailPage() {
  const { reportId } = useParams({ from: "/_shell/reports/$reportId" });
  const meta = REPORT_TYPES.find((r) => r.id === reportId);
  const store = useStore();
  const isRemote = REMOTE_REPORT_IDS.has(reportId);

  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(dmyToIso(addDays(realToday(), -6)));
  const [customTo, setCustomTo] = useState(dmyToIso(realToday()));
  const { from, to } = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const isoFrom = dmyToIso(from);
  const isoTo = dmyToIso(to);

  const [remote, setRemote] = useState<{
    headers: string[];
    rows: Row[];
    total: number;
    // kot-report only - the range-wide deleted/unbilled totals, shown as
    // their own StatCards above the per-date table below.
    kotExtra?: { deletedTickets: number; unbilledTickets: number };
  } | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);

  // Suppliers/Purchase Orders/Expense Heads/Expenses/Cash Sessions are
  // confirmed out of scope for the Local EXE - loaded here on Reports'
  // own mount (several report types read from them) instead of globally
  // on every login (see AppShell.tsx's own comment on why that moved).
  useEffect(() => {
    void store.loadSuppliersFromServer();
    void store.loadPurchaseOrdersFromServer();
    void store.loadExpenseHeadsFromServer();
    void store.loadExpensesFromServer();
    void store.loadCashSessionsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRemote) return;
    let cancelled = false;
    setRemoteLoading(true);
    setRemote(null);
    const run = async () => {
      try {
        let result: {
          headers: string[];
          rows: Row[];
          total: number;
          kotExtra?: { deletedTickets: number; unbilledTickets: number };
        };
        switch (reportId) {
          case "day-wise-sales": {
            const { periodData } = await reportApi.dayWiseSales(isoFrom, isoTo);
            const days = periodData.filter((p) => p.period !== "Total");
            const totalRow = periodData.find((p) => p.period === "Total");
            result = {
              headers: ["Business date", "Orders", "Sales"],
              rows: days.map((p) => ({
                label: p.period,
                a: p.totalOrders,
                value: Math.round(p.grandAmount),
              })),
              total: Math.round(
                totalRow?.grandAmount ?? days.reduce((s, p) => s + p.grandAmount, 0),
              ),
            };
            break;
          }
          case "item-wise-sales": {
            const { itemWise } = await reportApi.itemAndCategoryWiseSales(isoFrom, isoTo);
            const r = itemWise
              .map((i) => ({
                label: i.variant_name ? `${i.item_name} (${i.variant_name})` : i.item_name,
                a: i.totalQty,
                value: Math.round(i.totalSale),
              }))
              .sort((x, y) => y.value - x.value);
            result = {
              headers: ["Item", "Qty sold", "Revenue"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "category-wise-sales": {
            const { categoryWise } = await reportApi.itemAndCategoryWiseSales(isoFrom, isoTo);
            const r = categoryWise.map((c) => ({
              label: c.categoryName,
              a: c.totalQty,
              value: Math.round(c.totalSale),
            }));
            result = {
              headers: ["Category", "Qty", "Revenue"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "payment-mode": {
            const { posCollections: pc } = await reportApi.posCollection(isoFrom, isoTo);
            // No per-mode transaction count comes back from this endpoint
            // (only totals) - unlike the old client-side version, which
            // counted payments directly off each order.
            const r = [
              { label: "Cash", value: Math.round(Number(pc.cashTotal)) },
              { label: "UPI", value: Math.round(Number(pc.upiTotal)) },
              { label: "Card", value: Math.round(Number(pc.cardTotal)) },
              { label: "Due", value: Math.round(Number(pc.dueTotal)) },
            ];
            result = {
              headers: ["Payment mode", "Amount"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "tax-report": {
            const { posCollections: pc } = await reportApi.posCollection(isoFrom, isoTo);
            const r = [
              { label: "GST", a: pc.totalBills, value: Math.round(Number(pc.totalGst)) },
              ...pc.taxBreakdown.map((t) => ({
                label: t.taxName,
                a: t.applicableOrders,
                value: Math.round(Number(t.totalAmount)),
              })),
            ];
            result = {
              headers: ["Tax", "Applicable orders", "Total tax"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "discount-report": {
            const orders = await reportApi.getAllDiscountedOrders(isoFrom, isoTo);
            const r = orders.map((o) => ({
              label: `Bill #${o.bill_no}`,
              a: o.order_type,
              b: o.hms_hotelUser_master?.name ?? "—",
              value: Math.round(Number(o.totalDiscount)),
            }));
            result = {
              headers: ["Order", "Type", "Given by", "Discount"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "table-performance": {
            const { tableWise } = await reportApi.tableAndStaffWise(isoFrom, isoTo);
            const r = tableWise.map((t) => ({
              label: t.label,
              a: t.orders,
              value: Math.round(t.amount),
            }));
            result = {
              // "Covers" is gone rather than shown as zero: a guest count is
              // not a column on the order anywhere in this system, so the old
              // column could only ever read 0 and looked like a measurement.
              headers: ["Table", "Bills", "Revenue"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "staff-performance": {
            const { staffWise } = await reportApi.tableAndStaffWise(isoFrom, isoTo);
            const r = staffWise.map((t) => ({
              label: t.label,
              a: t.orders,
              b: Math.round(t.tips ?? 0),
              value: Math.round(t.amount),
            }));
            result = {
              headers: ["Staff", "Orders", "Tips", "Revenue"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
            };
            break;
          }
          case "kot-report": {
            const { periodData, deletedTickets, unbilledTickets } = await reportApi.kotReport(
              isoFrom,
              isoTo,
            );
            const r = periodData.map((p) => ({
              label: p.period,
              a: p.deletedTickets,
              b: p.unbilledTickets,
              value: p.totalTickets,
            }));
            result = {
              headers: ["Business date", "Deleted", "Not billed", "KOT tickets"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
              kotExtra: { deletedTickets, unbilledTickets },
            };
            break;
          }
          default:
            result = { headers: [], rows: [], total: 0 };
        }
        if (!cancelled) setRemote(result);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : "Could not load this report");
          setRemote({ headers: [], rows: [], total: 0 });
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reportId, isRemote, isoFrom, isoTo]);

  const local = useMemo(() => {
    switch (reportId) {
      case "expense-report": {
        const inWindow = store.expenses.filter((e) => inRange(e.date, from, to));
        const map = new Map<string, number>();
        inWindow.forEach((e) => {
          const head = store.expenseHeads.find((h) => h.id === e.headId)?.name ?? "Other";
          map.set(head, (map.get(head) ?? 0) + e.amount);
        });
        const r = [...map.entries()].map(([label, value]) => ({
          label,
          a: inWindow.filter(
            (e) => store.expenseHeads.find((h) => h.id === e.headId)?.name === label,
          ).length,
          value,
        }));
        return {
          headers: ["Expense head", "Entries", "Amount"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "cash-session": {
        const r = store.cashSessions.map((c) => ({
          label: c.openedAt,
          a: c.status,
          b: `₹${c.countedCash ?? c.movements.reduce((s, m) => s + m.amount, 0)}`,
          value: c.variance ?? 0,
        }));
        return {
          headers: ["Session opened", "Status", "Counted", "Variance"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "purchase-report": {
        // Not range-filtered: PurchaseOrder.date isn't real backend data -
        // the create endpoint has no date column to sync (mapRawPurchaseOrder
        // falls back to the frozen mock todayLabel) - so filtering by a real
        // date range would just make genuinely-existing POs vanish from
        // "Today"/"Yesterday"/"7d" rather than reflect anything real.
        const r = store.purchaseOrders.map((p) => ({
          label: p.poNo,
          a: store.suppliers.find((s) => s.id === p.supplierId)?.name ?? "—",
          b: p.status,
          value: p.lines.reduce((s, l) => s + l.qty * l.rate, 0),
        }));
        return {
          headers: ["PO No", "Supplier", "Status", "Value"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "closing-stock": {
        // Not range-filtered by design - this is current on-hand stock, a
        // point-in-time snapshot with no "as of a past date" concept.
        const r = store.rawMaterials.map((m) => ({
          label: m.name,
          a: `${m.stock} ${m.unit}`,
          b: `₹${m.rate}`,
          value: Math.round(m.stock * m.rate),
        }));
        return {
          headers: ["Material", "Closing qty", "Rate", "Value"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      default:
        return { headers: [], rows: [] as Row[], total: 0 };
    }
  }, [reportId, store, from, to]);

  const { headers, rows, total, kotExtra } = isRemote
    ? (remote ?? { headers: [], rows: [], total: 0, kotExtra: undefined })
    : { ...local, kotExtra: undefined };
  const paged = usePagedRows(rows, 10);

  // Only the 6 remote reports and expense-report actually respond to the
  // range - the rest are either point-in-time (closing-stock), have no real
  // date to filter by (purchase-report - see its own comment), or are dead
  // ends already reading whatever's in local state. No point showing a
  // control that visibly does nothing.
  const rangeApplies = isRemote || reportId === "expense-report";
  const rangeControl = rangeApplies ? (
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
  ) : null;

  if (!meta) {
    return (
      <Page>
        <EmptyState
          icon={BarChart3}
          title="Report not found"
          description="This report is not part of the prototype."
          action={
            <Button asChild variant="outline">
              <Link to="/reports">Back to reports</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  if (isRemote && remoteLoading && !remote) {
    return (
      <Page>
        <PageHeader
          icon={BarChart3}
          title={meta.name}
          description={meta.desc}
          actions={
            <Button asChild variant="outline">
              <Link to="/reports">
                <ArrowLeft className="size-4" /> Reports
              </Link>
            </Button>
          }
          tabs={rangeControl}
        />
        <SectionCard title="Report data" bodyClassName="p-3 sm:p-4">
          <p className="py-8 text-center text-sm text-muted-foreground">Loading report…</p>
        </SectionCard>
      </Page>
    );
  }

  const hasB = headers.length === 4;

  // Was a decorative button with no onClick at all (task 42) - exports
  // every row (not just the current page) using the exact same column set
  // the table itself renders (headers[0] is always "label", "a"/"b" only
  // appear when this report actually has them, "value" is always last).
  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export", { description: "This report has no rows yet." });
      return;
    }
    const csvRows: (string | number)[][] = [headers];
    for (const r of rows) {
      const line: (string | number)[] = [r.label];
      if (headers.length > 2) line.push(r.a ?? "");
      if (hasB) line.push(r.b ?? "");
      line.push(r.value);
      csvRows.push(line);
    }
    downloadTextFile(`${reportId}-${isoFrom}-to-${isoTo}.csv`, toCsv(csvRows));
    toast.success("Report exported", { description: `${rows.length} rows` });
  };

  return (
    <Page>
      <PageHeader
        icon={BarChart3}
        title={meta.name}
        description={meta.desc}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/reports">
                <ArrowLeft className="size-4" /> Reports
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </div>
        }
        tabs={rangeControl}
      />

      <div className={cn("grid gap-3", kotExtra ? "sm:grid-cols-5" : "sm:grid-cols-3")}>
        <StatCard label="Rows" value={rows.length} />
        <StatCard label="Group" value={meta.group} />
        <StatCard
          label={reportId === "kot-report" ? "Total tickets" : "Total"}
          value={reportId === "kot-report" ? total : <Money value={Math.round(total)} />}
          tone="primary"
        />
        {kotExtra ? (
          <>
            <StatCard label="Deleted" value={kotExtra.deletedTickets} tone="warning" />
            <StatCard label="Not billed" value={kotExtra.unbilledTickets} tone="warning" />
          </>
        ) : null}
      </div>

      <SectionCard title="Report data" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.label}
          empty={<EmptyState icon={BarChart3} title="No data for this report yet" compact />}
          columns={[
            {
              key: "label",
              header: headers[0] ?? "Label",
              cell: (r) => <span className="font-medium">{r.label}</span>,
            },
            ...(headers.length > 2
              ? [
                  {
                    key: "a",
                    header: headers[1] ?? "",
                    cell: (r: Row) => <span className="num">{r.a ?? "—"}</span>,
                  },
                ]
              : []),
            ...(hasB
              ? [
                  {
                    key: "b",
                    header: headers[2] ?? "",
                    cell: (r: Row) => <span className="num">{r.b ?? "—"}</span>,
                  },
                ]
              : []),
            {
              key: "value",
              header: headers[headers.length - 1] ?? "Value",
              cell: (r) =>
                reportId === "kot-report" ? (
                  <span className="num font-semibold">{r.value}</span>
                ) : (
                  <Money value={r.value} className="font-semibold" />
                ),
            },
          ]}
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground num">
                  {[r.a, r.b].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {reportId === "kot-report" ? (
                <StatusBadge status={r.label} />
              ) : (
                <Money value={r.value} className="font-semibold" />
              )}
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </Page>
  );
}
