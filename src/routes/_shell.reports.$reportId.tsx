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
import { REPORT_TYPES } from "@/mock/data";
import { orderTotals, useStore } from "@/mock/store";

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

// controller/reports/*.js has real backend endpoints for these six -
// orderRelated.js's dayWiseGrowthReport/posCollectionReport/
// DiscountedOrdersReport and itemRelated.js's itemTextReports (which
// covers both item-wise and category-wise sales in one call). The rest
// either have no backend endpoint at all (cash-session, table-performance,
// staff-performance, kot-report - dead ends, same treatment as
// Reservations/Cash Sessions found earlier this migration) or need no new
// wiring because they already read fully backend-synced store slices with
// no report-specific endpoint required (expense-report, purchase-report,
// closing-stock).
const REMOTE_REPORT_IDS = new Set([
  "day-wise-sales",
  "item-wise-sales",
  "category-wise-sales",
  "payment-mode",
  "tax-report",
  "discount-report",
]);

// This screen has never had a date-range picker - it always showed
// all-time data computed client-side from the local store. These
// endpoints require a real range, so a fixed wide one preserves that same
// "show everything" behaviour instead of adding new UI.
const WIDE_START = "2000-01-01";
const WIDE_END = "2100-01-01";

function ReportDetailPage() {
  const { reportId } = useParams({ from: "/_shell/reports/$reportId" });
  const meta = REPORT_TYPES.find((r) => r.id === reportId);
  const store = useStore();
  const isRemote = REMOTE_REPORT_IDS.has(reportId);

  const [remote, setRemote] = useState<{ headers: string[]; rows: Row[]; total: number } | null>(
    null,
  );
  const [remoteLoading, setRemoteLoading] = useState(false);

  useEffect(() => {
    if (!isRemote) return;
    let cancelled = false;
    setRemoteLoading(true);
    setRemote(null);
    const run = async () => {
      try {
        let result: { headers: string[]; rows: Row[]; total: number };
        switch (reportId) {
          case "day-wise-sales": {
            const { periodData } = await reportApi.dayWiseSales(WIDE_START, WIDE_END);
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
            const { itemWise } = await reportApi.itemAndCategoryWiseSales(WIDE_START, WIDE_END);
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
            const { categoryWise } = await reportApi.itemAndCategoryWiseSales(WIDE_START, WIDE_END);
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
            const { posCollections: pc } = await reportApi.posCollection(WIDE_START, WIDE_END);
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
            const { posCollections: pc } = await reportApi.posCollection(WIDE_START, WIDE_END);
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
            const orders = await reportApi.getAllDiscountedOrders(WIDE_START, WIDE_END);
            const r = orders.map((o) => ({
              label: `Bill #${o.bill_no}`,
              a: o.order_type,
              value: Math.round(Number(o.totalDiscount)),
            }));
            result = {
              headers: ["Order", "Type", "Discount"],
              rows: r,
              total: r.reduce((s, x) => s + x.value, 0),
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
  }, [reportId, isRemote]);

  const settled = useMemo(() => store.orders.filter((o) => o.status === "Settled"), [store.orders]);

  const local = useMemo(() => {
    switch (reportId) {
      case "expense-report": {
        const map = new Map<string, number>();
        store.expenses.forEach((e) => {
          const head = store.expenseHeads.find((h) => h.id === e.headId)?.name ?? "Other";
          map.set(head, (map.get(head) ?? 0) + e.amount);
        });
        const r = [...map.entries()].map(([label, value]) => ({
          label,
          a: store.expenses.filter(
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
      case "table-performance": {
        const map = new Map<string, { covers: number; turns: number; value: number }>();
        settled.forEach((o) => {
          const cur = map.get(o.tableLabel) ?? { covers: 0, turns: 0, value: 0 };
          cur.covers += o.guests;
          cur.turns += 1;
          cur.value += orderTotals(o, store).grand;
          map.set(o.tableLabel, cur);
        });
        const r = [...map.entries()].map(([label, v]) => ({
          label,
          a: v.turns,
          b: v.covers,
          value: Math.round(v.value),
        }));
        return {
          headers: ["Table", "Turns", "Covers", "Revenue"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "staff-performance": {
        const map = new Map<string, { orders: number; value: number }>();
        settled.forEach((o) => {
          const cur = map.get(o.createdBy) ?? { orders: 0, value: 0 };
          cur.orders += 1;
          cur.value += orderTotals(o, store).grand;
          map.set(o.createdBy, cur);
        });
        const r = [...map.entries()].map(([label, v]) => ({
          label,
          a: v.orders,
          value: Math.round(v.value),
        }));
        return {
          headers: ["Staff", "Orders", "Revenue"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "kot-report": {
        const map = new Map<string, number>();
        store.kots.forEach((k) => map.set(k.status, (map.get(k.status) ?? 0) + 1));
        const r = [...map.entries()].map(([label, value]) => ({ label, value }));
        return {
          headers: ["KOT status", "Tickets"],
          rows: r as Row[],
          total: store.kots.length,
        };
      }
      case "purchase-report": {
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
  }, [reportId, settled, store]);

  const { headers, rows, total } = isRemote
    ? (remote ?? { headers: [], rows: [], total: 0 })
    : local;
  const paged = usePagedRows(rows, 10);

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
        />
        <SectionCard title="Report data" bodyClassName="p-3 sm:p-4">
          <p className="py-8 text-center text-sm text-muted-foreground">Loading report…</p>
        </SectionCard>
      </Page>
    );
  }

  const hasB = headers.length === 4;

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
            <Button variant="outline">
              <Download className="size-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Rows" value={rows.length} />
        <StatCard label="Group" value={meta.group} />
        <StatCard
          label={reportId === "kot-report" ? "Total tickets" : "Total"}
          value={reportId === "kot-report" ? total : <Money value={Math.round(total)} />}
          tone="primary"
        />
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
