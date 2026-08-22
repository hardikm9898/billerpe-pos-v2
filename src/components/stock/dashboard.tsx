import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Boxes,
  ChefHat,
  ClipboardCheck,
  Factory,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import { useMemo } from "react";

import { EmptyState, Money, SectionCard, StatCard } from "@/components/kit";
import { HealthBar, HealthPill, fmtQty, healthOf } from "@/components/stock/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STOCK_GROUPS, STOCK_SECTIONS } from "@/mock/stock-sections";
import { useStore } from "@/mock/store";

export function StockDashboard() {
  const store = useStore();

  const kpi = useMemo(() => {
    const rawValue = store.rawMaterials.reduce((s, m) => s + m.stock * m.rate, 0);
    const semiValue = store.semiFinished.reduce((s, x) => s + x.stock * store.semiUnitCost(x.id), 0);
    const alerts = store.rawMaterials
      .map((m) => ({ m, health: healthOf(m.stock, m.reorderLevel) }))
      .filter((r) => r.health !== "Healthy")
      .sort((a, b) => a.m.stock / (a.m.reorderLevel || 1) - b.m.stock / (b.m.reorderLevel || 1));
    const unpaid = store.purchaseOrders
      .filter((p) => p.status !== "Cancelled")
      .reduce((s, p) => s + Math.max(0, store.poTotals(p).grand - (p.paidAmount ?? 0)), 0);
    const wastageCost = store.wastages.reduce((s, w) => {
      const m = store.rawMaterials.find((x) => x.id === w.materialId);
      return s + (w.cost ?? (m ? w.qty * m.rate : 0));
    }, 0);
    return { rawValue, semiValue, alerts, unpaid, wastageCost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.rawMaterials, store.semiFinished, store.purchaseOrders, store.wastages]);

  const movements = store.stockMovements.slice(0, 8);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock on hand"
          value={<Money value={Math.round(kpi.rawValue + kpi.semiValue)} />}
          hint={`Raw ₹${Math.round(kpi.rawValue).toLocaleString("en-IN")} · Prep ₹${Math.round(kpi.semiValue).toLocaleString("en-IN")}`}
          tone="primary"
        />
        <StatCard
          label="Needs reordering"
          value={kpi.alerts.length}
          icon={TriangleAlert}
          tone="warning"
          hint="Materials at or below minimum level"
        />
        <StatCard
          label="Payable to suppliers"
          value={<Money value={Math.round(kpi.unpaid)} />}
          icon={ReceiptText}
          tone="info"
        />
        <StatCard
          label="Wastage cost"
          value={<Money value={Math.round(kpi.wastageCost)} />}
          icon={Boxes}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <SectionCard
          title="Reorder watchlist"
          description="Sorted by how far below the minimum level each material has fallen"
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/stock/$section" params={{ section: "franchise-requisitions" }}>
                Raise requisition <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          }
          bodyClassName="p-3 sm:p-4"
        >
          {kpi.alerts.length ? (
            <ul className="space-y-2">
              {kpi.alerts.slice(0, 7).map(({ m, health }) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="num text-xs text-muted-foreground">
                      {fmtQty(m.stock)} {m.unit} of minimum {fmtQty(m.reorderLevel)} {m.unit}
                    </p>
                    <div className="mt-1.5">
                      <HealthBar stock={m.stock} reorder={m.reorderLevel} />
                    </div>
                  </div>
                  <HealthPill health={health} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Every material is above its minimum"
              compact
            />
          )}
        </SectionCard>

        <SectionCard title="Recent stock movement" bodyClassName="p-3 sm:p-4">
          {movements.length ? (
            <ul className="space-y-2">
              {movements.map((mv) => {
                const name =
                  mv.refType === "raw"
                    ? store.rawMaterials.find((m) => m.id === mv.refId)?.name
                    : store.semiFinished.find((s) => s.id === mv.refId)?.name;
                const positive = mv.qty > 0;
                return (
                  <li key={mv.id} className="flex items-start gap-3 rounded-xl px-1 py-1.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                        positive ? "bg-success-soft text-success" : "bg-primary-soft text-primary-soft-foreground",
                      )}
                    >
                      {positive ? "+" : "−"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {mv.kind} · {mv.reference} · {mv.at}
                      </p>
                    </div>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {fmtQty(Math.abs(mv.qty))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Boxes} title="No movement recorded yet" compact />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickAction
          to="purchase-orders"
          icon={ReceiptText}
          title="Record a purchase"
          desc="The only routine way stock comes in"
        />
        <QuickAction
          to="production"
          icon={Factory}
          title="Record production"
          desc="Convert raw materials into prep stock"
        />
        <QuickAction
          to="recipes"
          icon={ChefHat}
          title="Update a recipe"
          desc="Keep dish costing and margins honest"
        />
      </div>

      {STOCK_GROUPS.map((g) => (
        <SectionCard key={g.key} title={g.label} description={g.hint} bodyClassName="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {STOCK_SECTIONS.filter((s) => s.group === g.key).map((s) => (
              <Link
                key={s.slug}
                to="/stock/$section"
                params={{ section: s.slug }}
                className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}
    </>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: typeof Boxes;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to="/stock/$section"
      params={{ section: to }}
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
