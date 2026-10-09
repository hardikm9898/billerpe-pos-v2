import { useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Ban, ChefHat, Clock, History, LayoutGrid, Timer } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/operations/shared";
import { KdsHistory } from "@/components/kds/KdsHistory";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        content: "Station-wise KOT queue: accept into preparing, ready, served - with the history of served tickets.",
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

/** Quick reasons, same idea as rejecting a QR order's items. */
const REJECT_REASONS = ["Out of stock", "Not available right now", "Kitchen closed", "Other"];

/** A ticket's items still with the kitchen - rejected ones leave the board. */
const liveItems = (k: Kot) => k.items.filter((i) => i.stage !== "rejected");

// Accept takes a ticket straight to Preparing (owner request 2026-10-03:
// no separate Accepted lane). "Accepted" is only seen on a ticket accepted
// before that; it sits in Preparing.
const flow: Record<string, KotStatus> = {
  Pending: "Preparing",
  Printed: "Preparing",
  Accepted: "Ready",
  Preparing: "Ready",
  Ready: "Served",
};
const flowLabel: Record<string, string> = {
  Pending: "Accept",
  Printed: "Accept",
  Accepted: "Mark Ready",
  Preparing: "Mark Ready",
  Ready: "Mark Served",
};

function KdsPage() {
  const store = useStore();
  const [station, setStation] = useState<string>("All");
  // Board: the live lanes. History: served tickets not settled yet.
  const [view, setView] = useState<"board" | "history">("board");
  const stations = ["All", ...store.kitchens.map((k) => k.name)];
  const [rejectTarget, setRejectTarget] = useState<Kot | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOther, setRejectOther] = useState("");
  // Which of the ticket's items are being rejected (exe line ids) - one,
  // several or all of them (owner list 2026-09-30 #18).
  const [rejectIds, setRejectIds] = useState<number[]>([]);
  const [rejectBusy, setRejectBusy] = useState(false);
  const openReject = (k: Kot) => {
    setRejectReason("");
    setRejectOther("");
    setRejectIds(liveItems(k).map((i) => i.detailId).filter((id): id is number => !!id));
    setRejectTarget(k);
  };
  const reason = rejectReason === "Other" ? rejectOther.trim() : rejectReason;
  // null = not determined yet. 0 means this hotel has no kitchen configured,
  // in which case the exe has no room to broadcast a KOT into and this board
  // can never receive anything - worth saying outright instead of letting it
  // look like a quiet service.
  const [kitchenCount, setKitchenCount] = useState<number | null>(null);

  // Tickets, and where each item is (Accepted / Preparing / Ready / Served),
  // come from the exe and are kept there per item (billerpe-local-exe
  // controller/kds.js): every kitchen screen and a refresh show the same
  // board, and a stage set on one screen moves on all of them.
  useEffect(() => {
    if (!store.authed) return;
    const disconnect = connectKdsSocket({
      onTicket: (ticket) => store.receiveKdsTicket(ticket),
      onOrderComplete: (orderId) => store.receiveKdsOrderComplete(orderId),
      onItemStatus: (payload) => store.receiveKdsItemStatus(payload),
      onSnapshot: (ids) => store.receiveKdsSnapshot(ids),
      onKitchensResolved: setKitchenCount,
    });
    return disconnect;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  const kots = store.kots
    .filter((k) => k.status !== "Served" && k.status !== "Cancelled")
    // "Only KOT" rounds are on the bill but never go to the kitchen screen.
    .filter((k) => !k.kdsHidden)
    .filter((k) => station === "All" || k.station === station);

  const lanes: { title: string; match: KotStatus[]; tone: string }[] = [
    { title: "New", match: ["Pending", "Printed"], tone: "bg-info" },
    { title: "Preparing", match: ["Accepted", "Preparing"], tone: "bg-warning" },
    { title: "Ready", match: ["Ready"], tone: "bg-success" },
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

      <Tabs value={view} onValueChange={(v) => setView(v as "board" | "history")} className="mb-3">
        <TabsList>
          <TabsTrigger value="board">
            <LayoutGrid className="size-3.5" /> Board
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-3.5" /> History
          </TabsTrigger>
        </TabsList>
      </Tabs>

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

      {view === "history" ? <KdsHistory station={station} /> : null}

      <div className={cn("grid gap-4 md:grid-cols-3", view !== "board" && "hidden")}>
        {lanes.map((lane) => {
          const items = kots.filter((k) => lane.match.includes(k.status));
          return (
            <section key={lane.title} className="rounded-2xl bg-surface-muted/70 p-3">
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("size-2 rounded-full", lane.tone)} aria-hidden />
                  {lane.title}
                </h2>
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
                    onItemStage={(detailId, stage) => store.setKdsItemStage(k.id, detailId, stage)}
                    onReject={() => openReject(k)}
                  />
                ))}
                {!items.length ? <EmptyState compact icon={ChefHat} title="Nothing here" /> : null}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && !rejectBusy && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject from KOT #{rejectTarget?.kotNo}</DialogTitle>
            <DialogDescription>
              {rejectTarget?.tableLabel} · tick what the kitchen cannot make. The staff who punched it
              and the cashier are alerted; they remove it from the bill.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5" data-reject-items>
            {rejectTarget
              ? liveItems(rejectTarget).map((i, idx) => {
                  const id = i.detailId;
                  const on = id != null && rejectIds.includes(id);
                  return (
                    <label
                      key={id ?? idx}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                        on ? "border-primary bg-primary-soft" : "border-border",
                        id == null && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={on}
                        disabled={id == null}
                        onCheckedChange={(v) =>
                          id != null &&
                          setRejectIds((cur) => (v ? [...cur, id] : cur.filter((x) => x !== id)))
                        }
                      />
                      <span className="num font-semibold">{i.qty}×</span>
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    </label>
                  );
                })
              : null}
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRejectReason(r)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    rejectReason === r ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            {rejectReason === "Other" ? (
              <Input
                autoFocus
                placeholder="Type the reason"
                value={rejectOther}
                onChange={(e) => setRejectOther(e.target.value)}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={rejectBusy || !rejectIds.length || !reason}
              onClick={async () => {
                if (!rejectTarget) return;
                setRejectBusy(true);
                const ok = await store.rejectKot(rejectTarget.id, reason, rejectIds);
                setRejectBusy(false);
                if (ok) setRejectTarget(null);
              }}
            >
              <Ban className="size-4" />{" "}
              {rejectIds.length && rejectTarget && rejectIds.length === liveItems(rejectTarget).length
                ? "Reject whole KOT"
                : `Reject ${rejectIds.length} item${rejectIds.length === 1 ? "" : "s"}`}
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
  onItemStage,
  onReject,
}: {
  kot: Kot;
  onAdvance: () => void;
  onItemStage: (detailId: number, stage: "ready" | "served") => void;
  onReject: () => void;
}) {
  const access = useAccess("kds");
  const mins = elapsedMinutes(kot.createdAt);
  const urgency = mins > 20 ? "border-primary" : mins > 10 ? "border-warning" : "border-border";
  // Once the kitchen has accepted a ticket it can't be rejected any more,
  // and its items can be marked Ready / Served one by one (owner decision,
  // 2026-09-28).
  const accepted = !["Pending", "Printed"].includes(kot.status);

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
        {liveItems(kot).map((i, idx) => (
          <li
            key={i.detailId ?? idx}
            data-kds-item={i.detailId}
            data-stage={i.stage ?? "new"}
            className="flex items-start justify-between gap-2 text-sm"
          >
            <span className={cn("min-w-0", i.stage === "served" && "text-muted-foreground line-through")}>
              <span className="num font-semibold">{i.qty}×</span> {i.name}
              {i.note ? (
                <span className="block whitespace-pre-wrap break-words text-[11px] italic text-warning">
                  {i.note}
                </span>
              ) : null}
            </span>
            {access.edit && accepted && i.detailId ? (
              i.stage === "served" ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">Served</span>
              ) : i.stage === "ready" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  onClick={() => onItemStage(i.detailId!, "served")}
                >
                  Served
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  onClick={() => onItemStage(i.detailId!, "ready")}
                >
                  Ready
                </Button>
              )
            ) : null}
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
          <Button
            hidden={!access.edit || accepted}
            size="sm"
            variant="outline"
            className="text-primary"
            onClick={onReject}
          >
            <Ban className="size-3.5" /> Reject
          </Button>
          <Button hidden={!access.edit} size="sm" onClick={onAdvance}>
            {flowLabel[kot.status] ?? `Mark ${flow[kot.status]}`}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
