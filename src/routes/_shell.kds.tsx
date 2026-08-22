import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ChefHat, Clock, Timer } from "lucide-react";
import { useState } from "react";

import { EmptyState, Page, PageHeader, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { elapsedFrom, elapsedMinutes } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { Kot, KotStatus } from "@/mock/types";

export const Route = createFileRoute("/_shell/kds")({
  head: () => ({
    meta: [
      { title: "Kitchen Display · BillerPe" },
      {
        name: "description",
        content: "Station-wise KOT queue with accept, preparing, ready and served transitions.",
      },
      { property: "og:title", content: "Kitchen Display · BillerPe" },
      {
        property: "og:description",
        content: "Station-wise KOT queue with live prep timers.",
      },
    ],
  }),
  component: KdsPage,
});

const flow: Record<string, KotStatus> = {
  Pending: "Accepted",
  Printed: "Accepted",
  Accepted: "Preparing",
  Preparing: "Ready",
  Ready: "Served",
};

function KdsPage() {
  const store = useStore();
  const [station, setStation] = useState<string>("All");
  const stations = ["All", ...store.kitchens.map((k) => k.name)];

  const kots = store.kots
    .filter((k) => k.status !== "Served" && k.status !== "Cancelled")
    .filter((k) => station === "All" || k.station === station);

  const lanes: { title: string; match: KotStatus[] }[] = [
    { title: "New", match: ["Pending", "Printed"] },
    { title: "Accepted", match: ["Accepted"] },
    { title: "Preparing", match: ["Preparing"] },
    { title: "Ready", match: ["Ready"] },
  ];

  return (
    <Page>
      <PageHeader
        icon={ChefHat}
        title="Kitchen Display"
        description="Live KOT queue. Cards turn amber after 10 minutes and red after 20."
        actions={
          <span className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {kots.length} open tickets
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {stations.map((s) => (
          <button
            key={s}
            onClick={() => setStation(s)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              station === s
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => {
          const items = kots.filter((k) => lane.match.includes(k.status));
          return (
            <section key={lane.title} className="rounded-2xl bg-surface-muted/70 p-3">
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{lane.title}</h2>
                <span className="num rounded-full bg-surface px-2 py-0.5 text-xs">
                  {items.length}
                </span>
              </header>
              <div className="space-y-3">
                {items.map((k) => (
                  <KotCard
                    key={k.id}
                    kot={k}
                    onAdvance={() => store.setKotStatus(k.id, flow[k.status]!)}
                  />
                ))}
                {!items.length ? <EmptyState compact icon={ChefHat} title="Nothing here" /> : null}
              </div>
            </section>
          );
        })}
      </div>
    </Page>
  );
}

function KotCard({ kot, onAdvance }: { kot: Kot; onAdvance: () => void }) {
  const mins = elapsedMinutes(kot.createdAt);
  const urgency = mins > 20 ? "border-primary" : mins > 10 ? "border-warning" : "border-border";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border-2 bg-surface p-3 shadow-card", urgency)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            KOT #{kot.kotNo} · {kot.tableLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Round {kot.round} · {kot.station}
          </p>
        </div>
        <StatusBadge status={kot.status} />
      </div>

      <ul className="mt-2 space-y-1">
        {kot.items.map((i, idx) => (
          <li key={idx} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="num font-semibold">{i.qty}×</span> {i.name}
              {i.note ? (
                <span className="block text-[11px] italic text-warning">{i.note}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            mins > 20 ? "text-primary" : mins > 10 ? "text-warning" : "text-muted-foreground",
          )}
        >
          <Timer className="size-3.5" /> {elapsedFrom(kot.createdAt)}
        </span>
        <Button size="sm" onClick={onAdvance}>
          Mark {flow[kot.status]}
        </Button>
      </div>
    </motion.article>
  );
}
