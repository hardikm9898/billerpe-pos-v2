import { FieldError, isMobile10, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, Phone, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  IconButton,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/kit";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/queue")({
  head: () => ({
    meta: [
      { title: "Waitlist Queue · BillerPe" },
      {
        name: "description",
        content:
          "Manage the walk-in waitlist - add guests, track how long they've waited, call them when a table opens up.",
      },
      { property: "og:title", content: "Waitlist Queue · BillerPe" },
      { property: "og:description", content: "Restaurant walk-in waitlist management." },
    ],
  }),
  component: QueuePage,
});

const DEFAULT_THRESHOLD_MINUTES = 15;

function waitedMinutes(joinedAt: string, now: number): number {
  const joined = new Date(joinedAt).getTime();
  if (Number.isNaN(joined)) return 0;
  return Math.max(0, Math.round((now - joined) / 60000));
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// "HH:mm" from an entry's joinedAt, for comparing against the from/to time
// filter inputs below (also "HH:mm") - plain string comparison works since
// both sides are zero-padded 24h.
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type AddDraft = { name: string; mobile: string; partySize: number };

function QueuePage() {
  const access = useAccess("queue");
  const store = useStore();
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const form = useFormCheck();
  const formOpen = !!addDraft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [thresholdMinutes, setThresholdMinutes] = useState(DEFAULT_THRESHOLD_MINUTES);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [minParty, setMinParty] = useState("");
  const [maxParty, setMaxParty] = useState("");
  // Forces a re-render every 30s so "waited N min" and the over-threshold
  // highlight stay live without needing a full server reload.
  const [, setTick] = useState(0);

  useEffect(() => {
    void store.loadQueueFromServer();
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const waiting = store.queue.filter((q) => q.status === "Waiting");
  const overThreshold = waiting.filter((q) => waitedMinutes(q.joinedAt, now) >= thresholdMinutes);

  const filtered = useMemo(() => {
    return store.queue
      .filter((q) => {
        if (fromTime && hhmm(q.joinedAt) < fromTime) return false;
        if (toTime && hhmm(q.joinedAt) > toTime) return false;
        if (minParty && q.partySize < Number(minParty)) return false;
        if (maxParty && q.partySize > Number(maxParty)) return false;
        return true;
      })
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }, [store.queue, fromTime, toTime, minParty, maxParty]);

  const submitAdd = async () => {
    if (!addDraft) return;
    const ok = form.check([
      { key: "name", label: "Guest name", value: addDraft.name },
      {
        key: "mobile",
        label: "Mobile number",
        value: addDraft.mobile,
        valid: isMobile10,
        message: "Enter a 10-digit mobile number",
      },
    ]);
    if (!ok) return;
    if (await store.addToQueue(addDraft.name.trim(), addDraft.mobile.trim(), addDraft.partySize)) {
      setAddDraft(null);
    }
  };

  return (
    <Page>
      <PageHeader
        icon={Users}
        title="Waitlist Queue"
        description="Walk-in guests waiting for a table."
        actions={
          <>
            <Button
              hidden={!access.delete}
              variant="outline"
              disabled={!waiting.length}
              onClick={() => setClearConfirmOpen(true)}
            >
              <Trash2 className="size-4" /> Clear queue
            </Button>
            <Button
              hidden={!access.create}
              onClick={() => setAddDraft({ name: "", mobile: "", partySize: 2 })}
            >
              <Users className="size-4" /> Add to queue
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Currently waiting" value={waiting.length} tone="primary" />
        <StatCard
          label={`Waiting ${thresholdMinutes}+ min`}
          value={overThreshold.length}
          tone={overThreshold.length ? "warning" : "success"}
        />
        <StatCard
          label="Longest wait"
          value={
            waiting.length
              ? `${Math.max(...waiting.map((q) => waitedMinutes(q.joinedAt, now)))} min`
              : "—"
          }
          tone="info"
        />
      </div>

      <SectionCard title="Filters" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Joined from</Label>
            <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Joined to</Label>
            <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Min. group size</Label>
            <Input
              type="number"
              min={1}
              value={minParty}
              onChange={(e) => setMinParty(e.target.value)}
              placeholder="Any"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max. group size</Label>
            <Input
              type="number"
              min={1}
              value={maxParty}
              onChange={(e) => setMaxParty(e.target.value)}
              placeholder="Any"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Alert after (min)</Label>
            <Input
              type="number"
              min={1}
              value={thresholdMinutes}
              onChange={(e) =>
                setThresholdMinutes(Number(e.target.value) || DEFAULT_THRESHOLD_MINUTES)
              }
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Queue" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={filtered}
          keyFn={(q) => q.id}
          empty={<EmptyState icon={Users} title="Nobody's waiting" compact />}
          columns={[
            {
              key: "guest",
              header: "Guest",
              cell: (q) => (
                <div>
                  <p className="font-medium">{q.name}</p>
                  <p className="text-xs text-muted-foreground num">{q.mobile}</p>
                </div>
              ),
            },
            {
              key: "party",
              header: "Party",
              cell: (q) => <span className="num">{q.partySize}</span>,
            },
            {
              key: "joined",
              header: "Joined",
              cell: (q) => <span className="num">{timeOfDay(q.joinedAt)}</span>,
            },
            {
              key: "waited",
              header: "Waited",
              cell: (q) => {
                if (q.status !== "Waiting") {
                  return <span className="text-muted-foreground">—</span>;
                }
                const mins = waitedMinutes(q.joinedAt, now);
                const over = mins >= thresholdMinutes;
                return (
                  <span
                    className={`num flex items-center gap-1 font-medium ${over ? "text-warning" : ""}`}
                  >
                    {over ? <AlarmClock className="size-3.5" /> : null}
                    {mins} min
                  </span>
                );
              },
            },
            { key: "status", header: "Status", cell: (q) => <StatusBadge status={q.status} /> },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (q) => (
                <div className="flex items-center justify-end gap-1">
                  {q.status === "Waiting" && access.edit ? (
                    <>
                      <IconButton
                        label={q.calledAt ? "Call again" : "Call customer"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.callQueueEntry(q.id);
                        }}
                      >
                        <Phone className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Seat this party"
                        className="text-success"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.seatQueueEntry(q.id);
                        }}
                      >
                        <UserCheck className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Mark as no-show"
                        className="text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.markQueueEntryNoShow(q.id);
                        }}
                      >
                        <UserX className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Remove from queue"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.cancelQueueEntry(q.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          mobileCard={(q) => {
            const mins = waitedMinutes(q.joinedAt, now);
            const over = q.status === "Waiting" && mins >= thresholdMinutes;
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{q.name}</p>
                  <StatusBadge status={q.status} />
                </div>
                <p className="text-xs text-muted-foreground num">
                  {q.mobile} · Party of {q.partySize} · Joined {timeOfDay(q.joinedAt)}
                </p>
                {q.status === "Waiting" ? (
                  <p
                    className={`text-xs font-medium num ${over ? "text-warning" : "text-muted-foreground"}`}
                  >
                    Waited {mins} min
                  </p>
                ) : null}
              </div>
            );
          }}
        />
      </SectionCard>

      <Dialog open={!!addDraft} onOpenChange={(o) => !o && setAddDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to waitlist</DialogTitle>
          </DialogHeader>
          {addDraft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Guest name</Label>
                <Input
                  {...form.fieldProps("name")}
                  value={addDraft.name}
                  onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })}
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label required>Mobile number</Label>
                  <Input
                    {...form.fieldProps("mobile")}
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    value={addDraft.mobile}
                    onChange={(e) =>
                      setAddDraft({
                        ...addDraft,
                        mobile: e.target.value.replace(/\D/g, "").slice(0, 10),
                      })
                    }
                  />
                  <FieldError message={form.error("mobile")} />
                </div>
                <div className="space-y-1.5">
                  <Label required>Party size</Label>
                  <Input
                    type="number"
                    min={1}
                    value={addDraft.partySize}
                    onChange={(e) =>
                      setAddDraft({ ...addDraft, partySize: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAdd()}>Add to queue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the waitlist?</AlertDialogTitle>
            <AlertDialogDescription>
              Every guest currently waiting ({waiting.length}) will be removed from the active
              queue. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void store.clearQueue();
                setClearConfirmOpen(false);
              }}
            >
              Clear queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
