import { Link, createFileRoute } from "@tanstack/react-router";
import { BarChart3, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { Money, Page, PageHeader, SectionCard, StatCard } from "@/components/kit";
import { REPORT_TYPES } from "@/mock/data";
import { orderTotals, useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/reports/")({
  head: () => ({
    meta: [
      { title: "Reports · BillerPe" },
      {
        name: "description",
        content: "Thirteen sales, finance, operations and inventory reports.",
      },
      { property: "og:title", content: "Reports · BillerPe" },
      {
        property: "og:description",
        content: "Sales, finance, operations and inventory reporting hub.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const store = useStore();

  const settled = useMemo(() => store.orders.filter((o) => o.status === "Settled"), [store.orders]);
  const revenue = settled.reduce((s, o) => s + orderTotals(o, store).grand, 0);
  const groups = useMemo(() => {
    const map = new Map<string, typeof REPORT_TYPES>();
    REPORT_TYPES.forEach((r) => map.set(r.group, [...(map.get(r.group) ?? []), r]));
    return [...map.entries()];
  }, []);

  return (
    <Page>
      <PageHeader
        icon={BarChart3}
        title="Reports"
        description="All reports are derived live from the same prototype dataset."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Settled orders" value={settled.length} tone="primary" />
        <StatCard
          label="Revenue captured"
          value={<Money value={Math.round(revenue)} />}
          tone="success"
        />
        <StatCard label="Available reports" value={REPORT_TYPES.length} />
      </div>

      {groups.map(([group, reports]) => (
        <SectionCard key={group} title={group} bodyClassName="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((r) => (
              <Link
                key={r.id}
                to="/reports/$reportId"
                params={{ reportId: r.id }}
                className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}
    </Page>
  );
}
