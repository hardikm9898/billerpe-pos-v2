import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Ban, ChefHat, Clock, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState, Page, PageHeader, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/operations/shared";
import { connectKdsSocket } from "@/lib/kdsSocket";
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
  const [rejectTarget, setRejectTarget] = useState<Kot | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // null = not determined yet. 0 means this hotel has no kitchen configured,
  // in which case the exe has no room to broadcast a KOT into and this board
  // can never receive anything - worth saying outright instead of letting it
  // look like a quiet service.
  const [kitchenCount, setKitchenCount] = useState<number | null>(null);

  // Real-time visibility across devices only - see the KDS wiring
  // decision: the backend has just one ready/not-ready flag per item, no
  // equivalent of this board's Accepted/Preparing/Ready/Served stages, so
  // those stay purely local (setKotStatus, unchanged). This only makes a
  // KOT fired on one screen show up live on other screens, and clears it
  // here once settled elsewhere.
  useEffect(() => {
    if (!store.authed) return;
    const disconnect = connectKdsSocket({
      onTicket: (ticket) => store.receiveKdsTicket(ticket),
      onOrderComplete: (orderId) => store.receiveKdsOrderComplete(orderId),
      onKitchensResolved: setKitchenCount,
    });
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

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

      {kitchenCount === 0 ? (
        <div className="mb-4">
          <Notice tone="warning" title="No kitchen is configured for this outlet">
            A KOT is delivered to a kitchen, so with none set up this board cannot receive anything.
            Add one under Operations, Kitchens.
          </Notice>
        </div>
      ) : null}

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
                    onReject={() => {
                      setRejectReason("");
                      setRejectTarget(k);
                    }}
                  />
                ))}
                {!items.length ? <EmptyState compact icon={ChefHat} title="Nothing here" /> : null}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KOT #{rejectTarget?.kotNo}</DialogTitle>
            <DialogDescription>
              {rejectTarget?.tableLabel} · {rejectTarget?.items.map((i) => i.name).join(", ")}.
              Front-of-house is notified - they still need to remove it from the bill themselves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rejectReason">Reason</Label>
            <Input
              id="rejectReason"
              placeholder="Out of stock"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectTarget) return;
                store.rejectKot(rejectTarget.id, rejectReason.trim() || "Out of stock");
                setRejectTarget(null);
              }}
            >
              <Ban className="size-4" /> Reject KOT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function KotCard({
  kot,
  onAdvance,
  onReject,
}: {
  kot: Kot;
  onAdvance: () => void;
  onReject: () => void;
}) {
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
                <span className="block whitespace-pre-wrap break-words text-[11px] italic text-warning">
                  {i.note}
                </span>
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
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="text-primary" onClick={onReject}>
            <Ban className="size-3.5" /> Reject
          </Button>
          <Button size="sm" onClick={onAdvance}>
            Mark {flow[kot.status]}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
