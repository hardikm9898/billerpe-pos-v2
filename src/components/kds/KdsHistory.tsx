import {
  Ban,
  Bell,
  CheckCircle2,
  ChefHat,
  Clock,
  History,
  RefreshCw,
  Undo2,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import {
  ApiError,
  orderApi,
  type KdsHistoryStep,
  type KdsHistoryTicket,
  type KdsItemStage,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";

// KDS History (owner request 2026-10-03): tickets the kitchen marked Served
// whose bill is not settled yet, with every step - when it was accepted,
// ready, served or moved back, and by whom - so a ticket marked Ready or
// Served by mistake can be seen and put back on the board.

const STEP: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  accepted: { label: "Accepted", icon: ChefHat, tone: "bg-info-soft text-info" },
  preparing: { label: "Accepted · preparing", icon: ChefHat, tone: "bg-info-soft text-info" },
  ready: { label: "Ready", icon: Bell, tone: "bg-warning-soft text-warning" },
  served: { label: "Served", icon: CheckCircle2, tone: "bg-success-soft text-success" },
  rejected: { label: "Rejected", icon: Ban, tone: "bg-primary-soft text-primary" },
};
const BACK = { icon: Undo2, tone: "bg-primary-soft text-primary" };
const STAGE_NAME: Partial<Record<KdsItemStage, string>> = {
  new: "New",
  accepted: "Preparing",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

const time = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
/** "4 min" between two steps. */
const gap = (from: string | null, to: string | null) => {
  if (!from || !to) return "";
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return "";
  return mins < 1
    ? "under a minute"
    : mins < 60
      ? `${mins} min`
      : `${Math.floor(mins / 60)} h ${mins % 60} min`;
};
const ago = (iso: string | null) => {
  if (!iso) return "";
  const g = gap(iso, new Date().toISOString());
  return g ? `${g} ago` : "";
};

function stepLabel(s: KdsHistoryStep) {
  if (s.kind === "back")
    return `Moved back · ${STAGE_NAME[s.from ?? "new"] ?? s.from} → ${STAGE_NAME[s.to] ?? s.to}`;
  return STEP[s.to]?.label ?? s.to;
}

export function KdsHistory({ station }: { station: string }) {
  const store = useStore();
  const access = useAccess("kds");
  const [tickets, setTickets] = useState<KdsHistoryTicket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    ticket: KdsHistoryTicket;
    to: "ready" | "preparing";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTickets((await orderApi.kdsHistory()).tickets);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load the kitchen history");
      setTickets((cur) => cur ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  // A served ticket arrives as the kitchen works: refresh every 20 s and
  // whenever the board's tickets change.
  const boardSignature = store.kots.map((k) => `${k.id}:${k.status}`).join(",");
  useEffect(() => {
    void load();
  }, [load, boardSignature]);
  useEffect(() => {
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [load]);

  const shown = (tickets ?? []).filter(
    (t) => station === "All" || !t.kitchenName || t.kitchenName === station,
  );

  const moveBack = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { items } = await orderApi.kdsMoveBack({
        orderId: confirm.ticket.orderId,
        kotNumber: confirm.ticket.kotNumber,
        to: confirm.to,
        detailIds: confirm.ticket.items.map((i) => i.detailId).filter((id): id is number => !!id),
      });
      store.receiveKdsItemStatus({
        orderId: confirm.ticket.orderId,
        kotNumber: confirm.ticket.kotNumber,
        items,
      });
      toast.success(
        `KOT #${confirm.ticket.kotNumber} is back in ${confirm.to === "ready" ? "Ready" : "Preparing"}`,
        {
          description: "It is on every kitchen board again.",
        },
      );
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not move it back");
    } finally {
      setBusy(false);
    }
  };

  if (tickets === null) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">Loading kitchen history…</p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tickets served from the kitchen whose bill is not settled yet. Marked by mistake? Move it
          back.
        </p>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {!shown.length ? (
        <EmptyState icon={History} title="No served tickets waiting for their bill" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <article
              key={`${t.orderId}-${t.kotNumber}-${t.kitchenId ?? ""}`}
              className="flex flex-col rounded-xl border border-border bg-surface p-3 shadow-card"
              data-kds-history={`${t.orderId}-${t.kotNumber}`}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    KOT #{t.kotNumber} ·{" "}
                    {t.table || (t.orderType === "dinin" ? "Dine in" : "Take Away")}
                    {t.token ? ` · Token ${t.token}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.billNo ? `Bill #${t.billNo}` : "Not billed yet"}
                    {t.kitchenName ? ` · ${t.kitchenName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                  Served {time(t.servedAt).slice(0, 5)}
                </span>
              </header>

              <ul className="mt-2 space-y-0.5 text-sm">
                {t.items.map((i, idx) => (
                  <li key={i.detailId ?? idx}>
                    {i.qty != null ? <span className="num font-semibold">{i.qty}× </span> : null}
                    {i.name}
                    {i.comment ? (
                      <span className="block text-[11px] italic text-warning">{i.comment}</span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <ol className="mt-3 border-t border-border pt-3">
                {t.steps.length ? (
                  t.steps.map((s, idx) => {
                    const look =
                      s.kind === "back"
                        ? BACK
                        : (STEP[s.to] ?? {
                            icon: Clock,
                            tone: "bg-surface-muted text-muted-foreground",
                          });
                    const Icon = look.icon;
                    const prev = idx ? t.steps[idx - 1].at : t.firedAt;
                    const took = gap(prev, s.at);
                    return (
                      <li key={idx} className="relative flex gap-2.5 pb-3 last:pb-0">
                        {idx < t.steps.length - 1 ? (
                          <span
                            className="absolute bottom-0 left-3 top-7 w-px bg-border"
                            aria-hidden
                          />
                        ) : null}
                        <span
                          className={cn(
                            "relative z-10 grid size-6 shrink-0 place-items-center rounded-full",
                            look.tone,
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                            <span className="text-xs font-semibold">{stepLabel(s)}</span>
                            <span className="num text-[11px] text-muted-foreground">
                              {time(s.at)}
                            </span>
                          </div>
                          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <UserRound className="size-3" /> {s.user || "Staff"}
                            </span>
                            {took ? <span>after {took}</span> : null}
                          </p>
                          {s.items.length && s.items.length < t.items.length ? (
                            <p className="text-[11px] text-muted-foreground">
                              {s.items.join(", ")}
                            </p>
                          ) : null}
                          {s.reason ? (
                            <p className="text-[11px] italic text-muted-foreground">"{s.reason}"</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="text-xs text-muted-foreground">
                    No steps recorded - this ticket was handled before the kitchen history started.
                  </li>
                )}
              </ol>

              <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[11px] text-muted-foreground">
                <span>{t.servedAt ? `Served ${ago(t.servedAt)}` : ""}</span>
                {t.billGenerated ? (
                  <span>Bill generated - can no longer go back to the kitchen</span>
                ) : access.edit ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirm({ ticket: t, to: "ready" })}
                    >
                      <Undo2 className="size-3.5" /> Back to Ready
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirm({ ticket: t, to: "preparing" })}
                    >
                      <Undo2 className="size-3.5" /> Back to Preparing
                    </Button>
                  </div>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move KOT #{confirm?.ticket.kotNumber} back to{" "}
              {confirm?.to === "ready" ? "Ready" : "Preparing"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.ticket.table || "This order"} · it goes back on every kitchen board
              {confirm?.to === "preparing" ? " and its token shows Preparing again" : ""}. This is
              recorded with your name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void moveBack();
              }}
            >
              Move back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
