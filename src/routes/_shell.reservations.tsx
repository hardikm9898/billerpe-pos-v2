import { FieldError, isEmailOrEmpty, isMobile10, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  IconButton,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Reservation } from "@/mock/types";

export const Route = createFileRoute("/_shell/reservations")({
  head: () => ({
    meta: [
      { title: "Reservations · BillerPe" },
      {
        name: "description",
        content: "Book one or more tables ahead of time and see who's coming in.",
      },
      { property: "og:title", content: "Reservations · BillerPe" },
      { property: "og:description", content: "Table reservations." },
    ],
  }),
  component: ReservationsPage,
});

type Draft = {
  id?: string; // present only when editing an existing reservation
  customerName: string;
  mobile: string;
  email: string;
  party: number;
  tableIds: string[];
  date: string; // yyyy-mm-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  totalAmount: number;
  advance: number;
  gstNo: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newDraft(): Draft {
  return {
    customerName: "",
    mobile: "",
    email: "",
    party: 2,
    tableIds: [],
    date: todayIso(),
    startTime: "20:00",
    endTime: "21:00",
    totalAmount: 0,
    advance: 0,
    gstNo: "",
  };
}

// Reservation.startTime/endTime are stored as "yyyy-mm-ddTHH:mm:ss" (built
// from exactly this shape on create/update - see submit() below), so
// splitting on "T" and trimming to HH:mm round-trips cleanly back into the
// separate date/time inputs this form actually edits.
function draftFromReservation(r: Reservation): Draft {
  return {
    id: r.id,
    customerName: r.customerName,
    mobile: r.mobile,
    email: r.email ?? "",
    party: r.party,
    tableIds: r.tables.map((t) => t.id),
    date: r.date.slice(0, 10),
    startTime: r.startTime.split("T")[1]?.slice(0, 5) ?? "20:00",
    endTime: r.endTime.split("T")[1]?.slice(0, 5) ?? "21:00",
    totalAmount: r.totalAmount,
    advance: r.advance,
    gstNo: r.gstNo ?? "",
  };
}

function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function ReservationsPage() {
  const access = useAccess("reservations");
  const store = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);

  useEffect(() => {
    void store.loadReservationsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const today = todayIso();
    return {
      today: store.reservations.filter((r) => r.date.slice(0, 10) === today).length,
      total: store.reservations.length,
    };
  }, [store.reservations]);

  const sorted = useMemo(
    () =>
      [...store.reservations].sort(
        (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
      ),
    [store.reservations],
  );
  const paged = usePagedRows(sorted, 10);

  // When editing, a table already on this reservation must stay selectable
  // even if its live status is neither Free nor Reserved (e.g. currently
  // Running from an unrelated walk-in order) - otherwise editing an
  // existing booking would silently drop it from the visible list with no
  // way to keep it checked.
  const bookableTables = store.tables.filter(
    (t) => t.status === "Free" || t.status === "Reserved" || draft?.tableIds.includes(t.id),
  );

  // Only name/mobile/table(s)/date/start/end are required - every other
  // field (email, party size, amounts, GST) stays optional, matched by the
  // disabled check below. Date+start time must be in the future (can't
  // book a slot that's already passed) and end must be after start -
  // neither was enforced before, so picking a past time or an inverted
  // start/end range silently created a nonsensical reservation.
  const scheduleError = useMemo(() => {
    if (!draft) return null;
    const start = combineDateTime(draft.date, draft.startTime);
    const end = combineDateTime(draft.date, draft.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Enter a valid date and time.";
    }
    if (start.getTime() <= Date.now()) return "Start time must be in the future.";
    if (end.getTime() <= start.getTime()) return "End time must be after start time.";
    return null;
  }, [draft]);

  // A table already booked for an overlapping time, among the bookings
  // loaded here - shown before saving. The cloud checks again on save
  // (uat-backend-v2 controller/tableBooking.js), so this is a convenience.
  const clash = useMemo(() => {
    if (!draft || scheduleError) return null;
    const toMs = (iso: string) => {
      const d = new Date(iso.length <= 5 ? `${draft.date}T${iso}` : iso.slice(0, 19));
      return d.getTime();
    };
    const start = combineDateTime(draft.date, draft.startTime).getTime();
    const end = combineDateTime(draft.date, draft.endTime).getTime();
    for (const r of store.reservations) {
      if (r.id === draft.id) continue;
      const rs = toMs(r.startTime);
      let re = toMs(r.endTime);
      if (Number.isNaN(rs) || Number.isNaN(re)) continue;
      if (re <= rs) re += 24 * 60 * 60 * 1000;
      if (!(start < re && end > rs)) continue;
      const table = r.tables.find((t) => draft.tableIds.includes(t.id));
      if (table) {
        const hhmm = (iso: string) => (iso.includes("T") ? iso.split("T")[1] : iso).slice(0, 5);
        return `${table.label} is already booked ${hhmm(r.startTime)}–${hhmm(r.endTime)} for ${r.customerName}. Choose another time or table.`;
      }
    }
    return null;
  }, [draft, scheduleError, store.reservations]);

  const toggleTable = (id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      tableIds: draft.tableIds.includes(id)
        ? draft.tableIds.filter((x) => x !== id)
        : [...draft.tableIds, id],
    });
  };

  const submit = async () => {
    if (!draft) return;
    const valid = form.check([
      { key: "customerName", label: "Guest name", value: draft.customerName },
      {
        key: "mobile",
        label: "Mobile",
        value: draft.mobile,
        valid: isMobile10,
        message: "Enter a 10-digit mobile number",
      },
      {
        key: "email",
        label: "Email",
        value: draft.email,
        valid: isEmailOrEmpty,
        message: "Enter a valid email or leave it blank",
      },
      {
        key: "party",
        label: "Party size",
        value: draft.party,
        valid: (v) => typeof v === "number" && v >= 1,
        message: "Party size must be at least 1",
      },
      {
        key: "tableIds",
        label: "Table(s)",
        value: draft.tableIds,
        message: "Choose at least one table",
      },
      {
        key: "advance",
        label: "Advance",
        value: draft.advance,
        valid: (v) => typeof v === "number" && v >= 0 && v <= (draft.totalAmount || 0),
        message: "Advance can't be negative or more than the total amount",
      },
    ]);
    if (!valid) return;
    const payload = {
      customerName: draft.customerName,
      mobile: draft.mobile,
      email: draft.email,
      party: draft.party,
      tableIds: draft.tableIds,
      date: draft.date,
      startTime: `${draft.date}T${draft.startTime}:00`,
      endTime: `${draft.date}T${draft.endTime}:00`,
      totalAmount: draft.totalAmount,
      advance: draft.advance,
      gstNo: draft.gstNo,
    };
    // Keep the form open when the booking is refused (e.g. the table is
    // already booked then), so nothing typed is lost.
    const ok = draft.id
      ? await store.updateReservation(draft.id, payload)
      : await store.createReservation(payload);
    if (ok) setDraft(null);
  };

  return (
    <Page>
      <PageHeader
        icon={CalendarDays}
        title="Reservations"
        description="Book one or more tables ahead of time for a guest."
        actions={
          <Button hidden={!access.create} onClick={() => setDraft(newDraft())}>
            New reservation
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Today" value={stats.today} tone="primary" />
        <StatCard label="Total upcoming" value={stats.total} tone="info" />
      </div>

      <SectionCard title="All reservations" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.id}
          onRowClick={(r) => setDraft(draftFromReservation(r))}
          empty={<EmptyState icon={CalendarDays} title="No reservations yet" compact />}
          columns={[
            {
              key: "guest",
              header: "Guest",
              cell: (r) => (
                <div>
                  <p className="font-medium">{r.customerName}</p>
                  <p className="text-xs text-muted-foreground num">{r.mobile}</p>
                </div>
              ),
            },
            {
              key: "tables",
              header: "Table(s)",
              cell: (r) => r.tables.map((t) => t.label).join(", ") || "—",
            },
            { key: "party", header: "Guests", cell: (r) => <span className="num">{r.party}</span> },
            {
              key: "when",
              header: "When",
              cell: (r) => (
                <span className="num">
                  {formatDate(r.date)} · {formatTime(r.startTime)}–{formatTime(r.endTime)}
                </span>
              ),
            },
            {
              key: "amount",
              header: "Amount",
              className: "text-right",
              cell: (r) => (
                <span className="num">
                  ₹{r.totalAmount.toLocaleString("en-IN")}
                  {r.advance ? (
                    <span className="text-muted-foreground"> ({r.advance} adv.)</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              cell: (r) => (
                <IconButton
                  hidden={!access.delete}
                  label="Cancel reservation"
                  className="text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    store.cancelReservation(r.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              ),
            },
          ]}
          mobileCard={(r) => (
            <div className="space-y-1">
              <p className="font-medium">{r.customerName}</p>
              <p className="text-xs text-muted-foreground num">
                {r.tables.map((t) => t.label).join(", ") || "—"} · {r.party} guests
              </p>
              <p className="text-xs text-muted-foreground num">
                {formatDate(r.date)} · {formatTime(r.startTime)}–{formatTime(r.endTime)}
              </p>
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit reservation" : "New reservation"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label required>Guest name</Label>
                  <Input
                    {...form.fieldProps("customerName")}
                    value={draft.customerName}
                    onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                  />
                  <FieldError message={form.error("customerName")} />
                </div>
                <div className="space-y-1.5">
                  <Label required>Mobile</Label>
                  <Input
                    {...form.fieldProps("mobile")}
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    value={draft.mobile}
                    onChange={(e) =>
                      setDraft({ ...draft, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
                    }
                  />
                  <FieldError message={form.error("mobile")} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    {...form.fieldProps("email")}
                    type="email"
                    placeholder="Optional"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                  <FieldError message={form.error("email")} />
                </div>
                <div className="space-y-1.5">
                  <Label required>Party size</Label>
                  <Input
                    step={1}
                    {...form.fieldProps("party")}
                    type="number"
                    min={1}
                    value={draft.party}
                    onChange={(e) => setDraft({ ...draft, party: Number(e.target.value) })}
                  />
                  <FieldError message={form.error("party")} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label required>Date</Label>
                  <Input
                    type="date"
                    min={todayIso()}
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>Start time</Label>
                  <Input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label required>End time</Label>
                  <Input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                  />
                </div>
              </div>
              {scheduleError ? <p className="text-xs text-destructive">{scheduleError}</p> : null}
              <div className="space-y-1.5">
                <Label required>Table(s)</Label>
                <FieldError message={form.error("tableIds")} />
                <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-3">
                  {bookableTables.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.tableIds.includes(t.id)}
                        onCheckedChange={() => toggleTable(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
                {clash ? (
                  <p data-booking-clash className="text-xs text-destructive">
                    {clash}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Total amount</Label>
                  <Input
                    type="number"
                    value={draft.totalAmount}
                    onChange={(e) => setDraft({ ...draft, totalAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Advance</Label>
                  <Input
                    {...form.fieldProps("advance")}
                    type="number"
                    min={0}
                    value={draft.advance}
                    onChange={(e) => setDraft({ ...draft, advance: Number(e.target.value) })}
                  />
                  <FieldError message={form.error("advance")} />
                </div>
                <div className="space-y-1.5">
                  <Label>GST no. (optional)</Label>
                  <Input
                    value={draft.gstNo}
                    onChange={(e) => setDraft({ ...draft, gstNo: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
              disabled={!(draft?.id ? access.edit : access.create) || !!scheduleError || !!clash}
              onClick={() => void submit()}
            >
              {draft?.id ? "Save changes" : "Book table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
