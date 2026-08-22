import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Download } from "lucide-react";
import { useMemo } from "react";

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
import { REPORT_TYPES } from "@/mock/data";
import { lineTotal, orderTotals, useStore } from "@/mock/store";

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

function ReportDetailPage() {
  const { reportId } = useParams({ from: "/_shell/reports/$reportId" });
  const meta = REPORT_TYPES.find((r) => r.id === reportId);
  const store = useStore();

  const settled = useMemo(() => store.orders.filter((o) => o.status === "Settled"), [store.orders]);

  const { headers, rows, total } = useMemo(() => {
    const bucket = (
      keyFn: (o: (typeof settled)[number]) => string,
      valueFn: (o: (typeof settled)[number]) => number,
    ) => {
      const map = new Map<string, { value: number; count: number }>();
      settled.forEach((o) => {
        const k = keyFn(o);
        const cur = map.get(k) ?? { value: 0, count: 0 };
        cur.value += valueFn(o);
        cur.count += 1;
        map.set(k, cur);
      });
      return [...map.entries()].map(([label, v]) => ({
        label,
        a: v.count,
        value: Math.round(v.value),
      }));
    };

    switch (reportId) {
      case "day-wise-sales":
        return {
          headers: ["Business date", "Orders", "Sales"],
          rows: bucket(
            (o) => o.businessDate,
            (o) => orderTotals(o, store).grand,
          ) as Row[],
          total: settled.reduce((s, o) => s + orderTotals(o, store).grand, 0),
        };
      case "item-wise-sales": {
        const map = new Map<string, { qty: number; value: number }>();
        settled.forEach((o) =>
          o.lines.forEach((l) => {
            const cur = map.get(l.name) ?? { qty: 0, value: 0 };
            cur.qty += l.qty;
            cur.value += lineTotal(l);
            map.set(l.name, cur);
          }),
        );
        const r = [...map.entries()]
          .map(([label, v]) => ({ label, a: v.qty, value: Math.round(v.value) }))
          .sort((x, y) => y.value - x.value);
        return {
          headers: ["Item", "Qty sold", "Revenue"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "category-wise-sales": {
        const map = new Map<string, { qty: number; value: number }>();
        settled.forEach((o) =>
          o.lines.forEach((l) => {
            const item = store.menuItems.find((i) => i.id === l.itemId);
            const cat =
              store.menuCategories.find((c) => c.id === item?.categoryId)?.name ?? "Uncategorised";
            const cur = map.get(cat) ?? { qty: 0, value: 0 };
            cur.qty += l.qty;
            cur.value += lineTotal(l);
            map.set(cat, cur);
          }),
        );
        const r = [...map.entries()].map(([label, v]) => ({
          label,
          a: v.qty,
          value: Math.round(v.value),
        }));
        return {
          headers: ["Category", "Qty", "Revenue"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "payment-mode": {
        const map = new Map<string, { count: number; value: number }>();
        settled.forEach((o) => {
          const splits = o.payments?.length
            ? o.payments
            : [{ mode: o.paymentMode ?? "Cash", amount: orderTotals(o, store).grand }];
          splits.forEach((p) => {
            const cur = map.get(p.mode) ?? { count: 0, value: 0 };
            cur.count += 1;
            cur.value += p.amount;
            map.set(p.mode, cur);
          });
        });
        const r = [...map.entries()].map(([label, v]) => ({
          label,
          a: v.count,
          value: Math.round(v.value),
        }));
        return {
          headers: ["Payment mode", "Transactions", "Amount"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "tax-report": {
        const map = new Map<string, { tax: number; taxLines: Map<string, number> }>();
        settled.forEach((o) => {
          const t = orderTotals(o, store);
          const cur = map.get(o.businessDate) ?? { tax: 0, taxLines: new Map<string, number>() };
          cur.tax += t.tax;
          t.taxLines.forEach((line) =>
            cur.taxLines.set(line.name, (cur.taxLines.get(line.name) ?? 0) + line.amount),
          );
          map.set(o.businessDate, cur);
        });
        const r = [...map.entries()].map(([label, v]) => ({
          label,
          a:
            [...v.taxLines.entries()]
              .map(([name, amt]) => `${name} ₹${Math.round(amt)}`)
              .join(", ") || "—",
          value: Math.round(v.tax),
        }));
        return {
          headers: ["Business date", "Tax lines", "Total tax"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
      case "discount-report": {
        const r = settled
          .filter((o) => o.discount)
          .map((o) => ({
            label: `#${o.orderNo} · ${o.tableLabel}`,
            a: o.discount?.label ?? "—",
            b: o.discount?.approvalFlagged ? "Approval required" : "Within limit",
            value: o.discount?.amount ?? 0,
          }));
        return {
          headers: ["Order", "Reason", "Approval", "Discount"],
          rows: r as Row[],
          total: r.reduce((s, x) => s + x.value, 0),
        };
      }
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
