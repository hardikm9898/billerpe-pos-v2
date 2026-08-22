import { BarChart3, Download, ChevronDown, ReceiptText, Truck } from "lucide-react";
import { useMemo, useState } from "react";

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

function ExportBar({ label }: { label: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {label} · read-only report, nothing here writes stock
      </p>
      <Button size="sm" variant="outline">
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
      <ExportBar label="Point-in-time valuation" />
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

export function ConsumptionReport() {
  const store = useStore();

  const rows = useMemo(() => {
    const map = new Map<string, { qty: number; value: number; kinds: Record<string, number> }>();
    store.stockMovements
      .filter((mv) => mv.qty < 0)
      .forEach((mv) => {
        const cur = map.get(mv.refId) ?? { qty: 0, value: 0, kinds: {} };
        cur.qty += Math.abs(mv.qty);
        cur.value += Math.abs(mv.value);
        cur.kinds[mv.kind] = (cur.kinds[mv.kind] ?? 0) + Math.abs(mv.qty);
        map.set(mv.refId, cur);
      });
    return [...map.entries()]
      .map(([id, v]) => {
        const m = store.rawMaterials.find((x) => x.id === id);
        const sf = store.semiFinished.find((x) => x.id === id);
        return {
          id,
          name: m?.name ?? sf?.name ?? "—",
          unit: m?.unit ?? sf?.unit ?? "",
          ...v,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [store.stockMovements, store.rawMaterials, store.semiFinished]);
  const paged = usePagedRows(rows, 10);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Consumption value"
          value={<Money value={Math.round(rows.reduce((s, r) => s + r.value, 0))} />}
          tone="primary"
        />
        <StatCard label="Materials moved" value={rows.length} icon={BarChart3} />
        <StatCard label="Top consumed" value={rows[0]?.name ?? "—"} />
      </div>
      <ExportBar label="Consumption by material" />
      <SectionCard title="Consumption" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.id}
          empty={<EmptyState icon={BarChart3} title="No consumption recorded" compact />}
          columns={[
            {
              key: "name",
              header: "Material",
              cell: (r) => <span className="font-medium">{r.name}</span>,
            },
            {
              key: "qty",
              header: "Quantity out",
              cell: (r) => (
                <span className="num">
                  {fmtQty(r.qty)} {r.unit}
                </span>
              ),
            },
            {
              key: "split",
              header: "Breakdown",
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(r.kinds).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {k} {fmtQty(v)}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: "value",
              header: "Cost",
              cell: (r) => <Money value={Math.round(r.value)} className="font-semibold" />,
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
      <ExportBar label="Material-wise purchase summary" />
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
      <ExportBar label="Supplier ledger summary" />
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

export function OrderConsumptionReport() {
  const store = useStore();

  const rows = useMemo(() => {
    const recipeFor = (name: string) =>
      store.recipes.find((r) => r.itemName === name) ??
      store.recipes.find(
        (r) => r.menuItemId && store.menuItems.find((m) => m.id === r.menuItemId)?.name === name,
      );
    return store.orders
      .filter((o) => o.status === "Settled" && o.itemised)
      .slice(0, 30)
      .map((o) => {
        let cost = 0;
        let costed = 0;
        o.lines.forEach((l) => {
          const r = recipeFor(l.name);
          if (!r) return;
          costed += 1;
          const base = (r.groups ?? []).filter((g) => g.kind === "base");
          const unit = base.length
            ? base.reduce((s, g) => s + store.recipeGroupCost(g), 0)
            : r.components.reduce((s, c) => {
                const m = store.rawMaterials.find((x) => x.id === c.materialId);
                return s + (m ? m.rate * c.qty : 0);
              }, 0);
          cost += unit * l.qty;
        });
        const revenue = o.lines.reduce((s, l) => s + l.price * l.qty, 0);
        return {
          id: o.id,
          orderNo: o.orderNo,
          table: o.tableLabel,
          date: o.businessDate,
          items: o.lines.length,
          costed,
          revenue,
          cost,
          margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
        };
      });
  }, [store.orders, store.recipes, store.rawMaterials, store.menuItems]);
  const paged = usePagedRows(rows, 10);

  return (
    <>
      <ExportBar label="Per-bill ingredient cost" />
      <SectionCard
        title="Order-wise consumption"
        description="Cost is derived from the base recipe of each sold item"
        bodyClassName="p-3 sm:p-4"
      >
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.id}
          empty={<EmptyState icon={BarChart3} title="No settled itemised orders" compact />}
          columns={[
            {
              key: "order",
              header: "Bill",
              cell: (r) => (
                <div>
                  <p className="num font-medium">#{r.orderNo}</p>
                  <p className="num text-[11px] text-muted-foreground">
                    {r.table} · {r.date}
                  </p>
                </div>
              ),
            },
            {
              key: "items",
              header: "Items",
              cell: (r) => (
                <span className="num text-xs text-muted-foreground">
                  {r.costed}/{r.items} costed
                </span>
              ),
            },
            { key: "rev", header: "Revenue", cell: (r) => <Money value={Math.round(r.revenue)} /> },
            {
              key: "cost",
              header: "Ingredient cost",
              cell: (r) => <Money value={Math.round(r.cost)} />,
            },
            {
              key: "margin",
              header: "Margin",
              cell: (r) => (
                <span
                  className={`num font-semibold ${r.margin < 50 ? "text-warning" : "text-success"}`}
                >
                  {r.margin}%
                </span>
              ),
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </>
  );
}
