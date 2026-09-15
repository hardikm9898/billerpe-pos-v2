import { Link, createFileRoute } from "@tanstack/react-router";
import { BarChart3, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Money, Page, PageHeader, SectionCard, StatCard } from "@/components/kit";
import { ApiError, reportApi } from "@/lib/api";
import { REPORT_TYPES } from "@/mock/data";

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
  // Was computed from store.orders.filter(status === "Settled") - that
  // array only ever holds live (Held/Running/Bill Generated) orders plus
  // whatever hasn't synced into order history yet, so these two stat
  // cards showed near-empty numbers instead of the real all-time totals
  // (task 43). posCollection is the same real backend aggregate the
  // Payment Mode/Tax reports already use, called with the same fixed
  // "all time" wide range this app's report screens already establish as
  // the convention (see reportApi's own comment in lib/api.ts) - not a
  // new date-range control.
  const [totals, setTotals] = useState<{ bills: number; revenue: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    reportApi
      .posCollection("2000-01-01", "2100-01-01")
      .then(({ posCollections: pc }) => {
        if (cancelled) return;
        const revenue =
          Number(pc.cashTotal) + Number(pc.upiTotal) + Number(pc.cardTotal) + Number(pc.dueTotal);
        setTotals({ bills: pc.totalBills, revenue });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          "[reports] Could not load POS collection totals:",
          err instanceof ApiError ? err.message : err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <StatCard label="Settled orders" value={totals ? totals.bills : "—"} tone="primary" />
        <StatCard
          label="Revenue captured"
          value={totals ? <Money value={Math.round(totals.revenue)} /> : "—"}
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
