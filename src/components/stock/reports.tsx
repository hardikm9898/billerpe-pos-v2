import { BarChart3, Download, ChevronDown, ReceiptText, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  Money,
  SectionCard,
  StatCard,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { DualQty, HealthPill, Toolbar, fmtQty, healthOf } from "@/components/stock/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/mock/store";
import { PeriodBar, useLedger, usePeriod } from "@/components/stock/ledger";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { stockLedgerApi, type RawOrderConsumption } from "@/lib/api";

// The Export button used to do nothing at all (no handler) on every
// stock report.
function ExportBar({
  label,
  file,
  rows,
}: {
  label: string;
  file: string;
  rows: () => (string | number)[][];
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {label} · read-only report, nothing here writes stock
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadTextFile(`${file}.csv`, toCsv(rows()))}
      >
        <Download className="size-4" /> Export CSV
      </Button>
    </div>
  );
}

/* ---------- Current stock ---------- */

export function CurrentStockReport() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});

  const rows = store.rawMaterials.filter((m) =>
    m.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const value = rows.reduce((s, m) => s + m.stock * m.rate, 0);
  const semiValue = store.semiFinished.reduce((s, x) => s + x.stock * store.semiUnitCost(x.id), 0);
  const paged = usePagedRows(rows, 10);
  const semiPaged = usePagedRows(store.semiFinished, 10);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Raw material value"
          value={<Money value={Math.round(value)} />}
          tone="primary"
        />
        <StatCard
          label="Semi-finished value"
          value={<Money value={Math.round(semiValue)} />}
          tone="info"
        />
        <StatCard
          label="Below minimum"
          value={rows.filter((m) => healthOf(m.stock, m.reorderLevel) !== "Healthy").length}
          tone="warning"
        />
      </div>
      <ExportBar
        label="Point-in-time valuation"
        file="current-stock"
        rows={() => [
          ["Material", "Stock", "Unit", "Rate", "Value", "Status"],
          ...rows.map((m) => [
            m.name,
            fmtQty(m.stock),
            m.unit,
            Math.round(m.rate * 100) / 100,
            Math.round(m.stock * m.rate),
            healthOf(m.stock, m.reorderLevel),
          ]),
        ]}
      />
      <SectionCard title="Raw materials" bodyClassName="p-3 sm:p-4">
        <Toolbar value={q} onChange={setQ} placeholder="Search material…" />
        <DataTable
          rows={paged.pageRows}
          keyFn={(m) => m.id}
          columns={[
            {
              key: "name",
              header: "Material",
              cell: (m) => <span className="font-medium">{m.name}</span>,
            },
            { key: "cat", header: "Category", cell: (m) => m.category },
            { key: "stock", header: "In stock", cell: (m) => <DualQty m={m} /> },
            {
              key: "health",
              header: "Health",
              cell: (m) => <HealthPill health={healthOf(m.stock, m.reorderLevel)} />,
            },
            {
              key: "rate",
              header: "Avg cost",
              cell: (m) => (
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 w-24"
                    value={editing[m.id] ?? String(m.rate)}
                    onChange={(e) => setEditing({ ...editing, [m.id]: e.target.value })}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== m.rate)
                        store.upsertRawMaterial({ ...m, rate: v });
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground">/{m.unit}</span>
                </div>
              ),
            },
            {
              key: "value",
              header: "Value",
              cell: (m) => <Money value={Math.round(m.stock * m.rate)} className="font-semibold" />,
            },
          ]}
          mobileCard={(m) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{m.name}</p>
                <DualQty m={m} />
              </div>
              <Money value={Math.round(m.stock * m.rate)} className="font-semibold" />
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <SectionCard title="Semi-finished items" bodyClassName="p-3 sm:p-4" className="mt-4">
        <DataTable
          rows={semiPaged.pageRows}
          keyFn={(s) => s.id}
          columns={[
            {
              key: "name",
              header: "Item",
              cell: (s) => <span className="font-medium">{s.name}</span>,
            },
            {
              key: "stock",
              header: "In stock",
              cell: (s) => (
                <span className="num">
                  {fmtQty(s.stock)} {s.unit}
                </span>
              ),
            },
            {
              key: "cost",
              header: "Unit cost",
              cell: (s) => <Money value={Math.round(store.semiUnitCost(s.id) * 100) / 100} />,
            },
            {
              key: "value",
              header: "Value",
              cell: (s) => (
                <Money
                  value={Math.round(s.stock * store.semiUnitCost(s.id))}
                  className="font-semibold"
                />
              ),
            },
          ]}
        />
        <TablePager {...semiPaged} onPageChange={semiPaged.setPage} />
      </SectionCard>
    </>
  );
}

/* ---------- Consumption ---------- */

// What orders, production and wastage actually used in the period, from
// the exe's stock journal. It used to add up a list kept in this browser
// tab only - empty after every refresh, and it never held any sale.
export function ConsumptionReport() {
  const store = useStore();
  const period = usePeriod("month");
  const { data, loading, failed } = useLedger(period.start, period.end);
  const unitOf = (id: number) =>
    store.rawMaterials.find((m) => m.id === String(id))?.purchaseUnit ?? "";
  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .map((r) => ({
          id: r.raw_material_id,
          name: r.raw_material_name,
          unit: unitOf(r.raw_material_id),
          usedQty: Math.max(0, -r.used_qty),
          usedValue: Math.max(0, -r.used_value),
          wastageQty: Math.max(0, -r.wastage_qty),
          wastageValue: Math.max(0, -r.wastage_value),
        }))
        .filter((r) => r.usedQty || r.wastageQty)
        .sort((a, b) => b.usedValue + b.wastageValue - (a.usedValue + a.wastageValue)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, store.rawMaterials],
  );
  const paged = usePagedRows(rows, 10);
  const used = rows.reduce((s, r) => s + r.usedValue, 0);
  const wasted = rows.reduce((s, r) => s + r.wastageValue, 0);

  return (
    <>
      <PeriodBar period={period} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Used in orders & production"
          value={<Money value={Math.round(used)} />}
          tone="primary"
        />
        <StatCard label="Wastage" value={<Money value={Math.round(wasted)} />} icon={BarChart3} />
        <StatCard label="Top consumed" value={rows[0]?.name ?? "—"} />
      </div>
      <ExportBar
        label="Consumption by material"
        file={`consumption-${period.start}-to-${period.end}`}
        rows={() => [
          ["Material", "Unit", "Used qty", "Used cost", "Wastage qty", "Wastage cost"],
          ...rows.map((r) => [
            r.name,
            r.unit,
            r.usedQty,
            Math.round(r.usedValue * 100) / 100,
            r.wastageQty,
            Math.round(r.wastageValue * 100) / 100,
          ]),
        ]}
      />
      <SectionCard title="Consumption" bodyClassName="p-3 sm:p-4">
        {loading ? <p className="mb-2 text-xs text-muted-foreground">Loading…</p> : null}
        {failed ? <p className="mb-2 text-sm text-destructive">{failed}</p> : null}
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => String(r.id)}
          empty={<EmptyState icon={BarChart3} title="Nothing used in this period" compact />}
          columns={[
            {
              key: "name",
              header: "Material",
              cell: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "used",
              header: "Used",
              cell: (r) => (
                <span className="num">
                  {fmtQty(r.usedQty)} {r.unit}
                </span>
              ),
            },
            {
              key: "usedValue",
              header: "Used cost",
              cell: (r) => <Money value={Math.round(r.usedValue)} className="font-semibold" />,
            },
            {
              key: "wastage",
              header: "Wastage",
              cell: (r) => (
                <span className="num">
                  {r.wastageQty ? `${fmtQty(r.wastageQty)} ${r.unit}` : "–"}
                </span>
              ),
            },
            {
              key: "wastageValue",
              header: "Wastage cost",
              cell: (r) => (r.wastageValue ? <Money value={Math.round(r.wastageValue)} /> : "–"),
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </>
  );
}

/* ---------- Purchase ---------- */

export function PurchaseReport() {
  const store = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        qty: number;
        value: number;
        lines: { po: string; date: string; qty: number; rate: number }[];
      }
    >();
    store.purchaseOrders
      .filter((p) => p.status !== "Cancelled")
      .forEach((p) =>
        p.lines.forEach((l) => {
          const cur = map.get(l.materialId) ?? { qty: 0, value: 0, lines: [] };
          cur.qty += l.qty;
          cur.value += l.qty * l.rate;
          cur.lines.push({ po: p.poNo, date: p.date, qty: l.qty, rate: l.rate });
          map.set(l.materialId, cur);
        }),
      );
    return [...map.entries()]
      .map(([id, v]) => {
        const m = store.rawMaterials.find((x) => x.id === id);
        return { id, name: m?.name ?? "—", unit: m?.purchaseUnit ?? "", ...v };
      })
      .sort((a, b) => b.value - a.value);
  }, [store.purchaseOrders, store.rawMaterials]);
  const paged = usePagedRows(rows, 10);

  return (
    <>
      <ExportBar
        label="Material-wise purchase summary"
        file="purchases-by-material"
        rows={() => [
          ["Material", "Qty", "Unit", "Value", "PO", "Date", "Line qty", "Rate"],
          ...rows.flatMap((r) =>
            r.lines.map((l) => [
              r.name,
              r.qty,
              r.unit,
              Math.round(r.value),
              l.po,
              l.date,
              l.qty,
              l.rate,
            ]),
          ),
        ]}
      />
      <SectionCard title="Purchases by material" bodyClassName="p-3 sm:p-4">
        <div className="space-y-2">
          {paged.pageRows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="num text-xs text-muted-foreground">
                    {fmtQty(r.qty)} {r.unit} across {r.lines.length} invoice
                    {r.lines.length > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Money value={Math.round(r.value)} className="font-semibold" />
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${open === r.id ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {open === r.id ? (
                <ul className="border-t border-border px-3 py-2 text-xs">
                  {r.lines.map((l, i) => (
                    <li key={i} className="flex items-center justify-between py-1">
                      <span className="num">
                        {l.po} · {l.date}
                      </span>
                      <span className="num text-muted-foreground">
                        {fmtQty(l.qty)} {r.unit} @ ₹{l.rate} = ₹
                        {Math.round(l.qty * l.rate).toLocaleString("en-IN")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {rows.length ? null : <EmptyState icon={ReceiptText} title="No purchases yet" compact />}
        </div>
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </>
  );
}

/* ---------- Supplier-wise ---------- */

export function SupplierReport() {
  const store = useStore();
  const rows = store.suppliers.map((s) => {
    const pos = store.purchaseOrders.filter(
      (p) => p.supplierId === s.id && p.status !== "Cancelled",
    );
    const purchased = pos.reduce((sum, p) => sum + store.poTotals(p).grand, 0);
    const paid = pos.reduce((sum, p) => sum + (p.paidAmount ?? 0), 0);
    return { ...s, orders: pos.length, purchased, paid, due: Math.max(0, purchased - paid) };
  });
  const paged = usePagedRows(rows, 10);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Purchased"
          value={<Money value={Math.round(rows.reduce((s, r) => s + r.purchased, 0))} />}
          tone="primary"
        />
        <StatCard
          label="Paid"
          value={<Money value={Math.round(rows.reduce((s, r) => s + r.paid, 0))} />}
          tone="success"
        />
        <StatCard
          label="Outstanding"
          value={<Money value={Math.round(rows.reduce((s, r) => s + r.due, 0))} />}
          tone="warning"
        />
      </div>
      <ExportBar
        label="Supplier ledger summary"
        file="supplier-summary"
        rows={() => [
          ["Supplier", "Orders", "Purchased", "Paid", "Outstanding"],
          ...rows.map((r) => [
            r.name,
            r.orders,
            Math.round(r.purchased),
            Math.round(r.paid),
            Math.round(r.due),
          ]),
        ]}
      />
      <SectionCard title="Supplier-wise purchase" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.id}
          empty={<EmptyState icon={Truck} title="No suppliers" compact />}
          columns={[
            {
              key: "name",
              header: "Supplier",
              cell: (r) => <span className="font-medium">{r.name}</span>,
            },
            { key: "gstin", header: "GSTIN", cell: (r) => <span className="num">{r.gstin}</span> },
            {
              key: "orders",
              header: "Orders",
              cell: (r) => <span className="num">{r.orders}</span>,
            },
            {
              key: "purchased",
              header: "Purchased",
              cell: (r) => <Money value={Math.round(r.purchased)} />,
            },
            { key: "paid", header: "Paid", cell: (r) => <Money value={Math.round(r.paid)} /> },
            {
              key: "due",
              header: "Outstanding",
              cell: (r) =>
                r.due ? (
                  <Money value={Math.round(r.due)} className="font-semibold text-primary" />
                ) : (
                  <span className="text-xs text-success">Settled</span>
                ),
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </>
  );
}

/* ---------- Order-wise consumption ---------- */

// Every settled bill of the period with what its ingredients really cost
// when it was sold (exe: GET /stock/orderConsumption). It used to estimate
// this by matching recipe names for the last 30 bills this tab had loaded.
export function OrderConsumptionReport() {
  const period = usePeriod("today");
  const [rows, setRows] = useState<RawOrderConsumption[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (period.start > period.end) return;
    let cancelled = false;
    stockLedgerApi
      .orderConsumption(period.start, period.end)
      .then((d) => !cancelled && (setRows(d.rows), setFailed(null)))
      .catch(() => !cancelled && setFailed("Could not load order-wise consumption"));
    return () => {
      cancelled = true;
    };
  }, [period.start, period.end]);
  const paged = usePagedRows(rows, 10);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <>
      <PeriodBar period={period} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sales (before tax)" value={<Money value={Math.round(revenue)} />} />
        <StatCard
          label="Ingredient cost"
          value={<Money value={Math.round(cost)} />}
          tone="primary"
        />
        <StatCard
          label="Food cost %"
          value={revenue ? `${Math.round((cost / revenue) * 1000) / 10}%` : "—"}
        />
      </div>
      <ExportBar
        label="Per-bill ingredient cost"
        file={`order-consumption-${period.start}-to-${period.end}`}
        rows={() => [
          ["Bill", "Date", "Table", "Sales", "Ingredient cost", "Margin %"],
          ...rows.map((r) => [
            r.bill_no ?? r.order_id,
            r.business_date,
            r.table ?? r.order_type,
            r.revenue,
            r.cost,
            r.margin ?? "",
          ]),
        ]}
      />
      <SectionCard
        title="Order-wise consumption"
        description="Actual ingredient cost of each settled bill, from its recipes at the time of sale"
        bodyClassName="p-3 sm:p-4"
      >
        {failed ? <p className="mb-2 text-sm text-destructive">{failed}</p> : null}
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => String(r.order_id)}
          empty={<EmptyState icon={BarChart3} title="No settled bills in this period" compact />}
          columns={[
            {
              key: "bill",
              header: "Bill",
              cell: (r) => <span className="font-medium">#{r.bill_no ?? r.order_id}</span>,
            },
            {
              key: "table",
              header: "Table",
              cell: (r) => r.table ?? (r.order_type === "pickup" ? "Pickup" : "—"),
            },
            {
              key: "revenue",
              header: "Sales",
              cell: (r) => <Money value={Math.round(r.revenue)} />,
            },
            {
              key: "cost",
              header: "Ingredient cost",
              cell: (r) =>
                r.costed ? (
                  <Money value={Math.round(r.cost)} />
                ) : (
                  <span className="text-xs text-muted-foreground">No recipes</span>
                ),
            },
            {
              key: "margin",
              header: "Margin",
              cell: (r) =>
                r.costed && r.margin != null ? (
                  <span className="num font-semibold">{r.margin}%</span>
                ) : (
                  "–"
                ),
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </>
  );
}
