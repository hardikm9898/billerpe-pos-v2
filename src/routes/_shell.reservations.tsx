import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { todayLabel } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { Reservation } from "@/mock/types";

export const Route = createFileRoute("/_shell/reservations")({
  head: () => ({
    meta: [
      { title: "Reservations · BillerPe" },
      {
        name: "description",
        content: "Book a specific table, capture the guest inline and control release.",
      },
      { property: "og:title", content: "Reservations · BillerPe" },
      { property: "og:description", content: "Table reservations with manual and auto release." },
    ],
  }),
  component: ReservationsPage,
});

const slots = [
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM",
  "8:30 PM",
  "9:00 PM",
];

function ReservationsPage() {
  const store = useStore();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [draft, setDraft] = useState<Omit<Reservation, "id"> | null>(null);

  const stats = useMemo(
    () => ({
      today: store.reservations.filter((r) => r.date === todayLabel).length,
      seated: store.reservations.filter((r) => r.status === "Seated").length,
      upcoming: store.reservations.filter((r) => r.status === "Booked" || r.status === "Confirmed")
        .length,
    }),
    [store.reservations],
  );
  const paged = usePagedRows(store.reservations, 10);

  const newDraft = (): Omit<Reservation, "id"> => {
    const table = store.tables.find((t) => t.status === "Free");
    return {
      customerName: "",
      mobile: "",
      party: 2,
      tableId: table?.id ?? "",
      tableLabel: table?.name ?? "",
      date: todayLabel,
      time: "8:00 PM",
      status: "Booked",
      releaseMode: "Auto",
      graceSeconds: 900,
    };
  };

  return (
    <Page>
      <PageHeader
        icon={CalendarDays}
        title="Reservations"
        description="A reservation always books one specific table. Auto release frees it after the grace period."
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              {(["list", "calendar"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button onClick={() => setDraft(newDraft())}>
              <Plus className="size-4" /> New reservation
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Today" value={stats.today} tone="primary" />
        <StatCard label="Upcoming" value={stats.upcoming} tone="info" />
        <StatCard label="Seated" value={stats.seated} tone="success" />
      </div>

      {view === "list" ? (
        <SectionCard title="All reservations" bodyClassName="p-3 sm:p-4">
          <DataTable
            rows={paged.pageRows}
            keyFn={(r) => r.id}
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
              { key: "table", header: "Table", cell: (r) => r.tableLabel },
              {
                key: "party",
                header: "Guests",
                cell: (r) => <span className="num">{r.party}</span>,
              },
              {
                key: "when",
                header: "When",
                cell: (r) => (
                  <span className="num">
                    {r.date} · {r.time}
                  </span>
                ),
              },
              {
                key: "release",
                header: "Release",
                cell: (r) => (
                  <Select
                    value={r.releaseMode}
                    onValueChange={(v) => store.setReleaseMode(r.id, v as "Manual" | "Auto")}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">Auto</SelectItem>
                      <SelectItem value="Manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                ),
              },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: "actions",
                header: "",
                cell: (r) =>
                  r.status === "Seated" ||
                  r.status === "Completed" ||
                  r.status === "Cancelled" ? null : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => store.setReservationStatus(r.id, "Seated")}
                      >
                        Seat
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => store.setReservationStatus(r.id, "Cancelled")}
                      >
                        Release
                      </Button>
                    </div>
                  ),
              },
            ]}
            mobileCard={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.customerName}</p>
                    <p className="text-xs text-muted-foreground num">
                      {r.tableLabel} · {r.party} guests · {r.time}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {r.releaseMode} release · grace{" "}
                  <span className="num">{Math.round(r.graceSeconds / 60)} min</span>
                </div>
              </div>
            )}
          />
          <TablePager {...paged} onPageChange={paged.setPage} />
        </SectionCard>
      ) : (
        <SectionCard title="Time slots" description={todayLabel} bodyClassName="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {slots.map((slot) => {
              const list = store.reservations.filter((r) => r.time === slot);
              return (
                <div key={slot} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-sm font-semibold num">{slot}</p>
                  <div className="mt-2 space-y-2">
                    {list.length ? (
                      list.map((r) => (
                        <div key={r.id} className="rounded-lg bg-surface-muted px-2.5 py-2">
                          <p className="text-xs font-medium">{r.customerName}</p>
                          <p className="text-[11px] text-muted-foreground num">
                            {r.tableLabel} · {r.party} guests
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Open</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New reservation</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Guest name</Label>
                  <Input
                    value={draft.customerName}
                    onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input
                    value={draft.mobile}
                    onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Table</Label>
                  <Select
                    value={draft.tableId}
                    onValueChange={(v) => {
                      const t = store.tables.find((x) => x.id === v);
                      setDraft({ ...draft, tableId: v, tableLabel: t?.name ?? "" });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {store.tables
                        .filter((t) => t.status === "Free" || t.status === "Reserved")
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} · {t.seats} seats
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Party size</Label>
                  <Input
                    type="number"
                    value={draft.party}
                    onChange={(e) => setDraft({ ...draft, party: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Time</Label>
                  <Select value={draft.time} onValueChange={(v) => setDraft({ ...draft, time: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {slots.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Release mode</Label>
                <Select
                  value={draft.releaseMode}
                  onValueChange={(v) => setDraft({ ...draft, releaseMode: v as "Manual" | "Auto" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Auto">Auto — release after grace period</SelectItem>
                    <SelectItem value="Manual">Manual — staff releases the table</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!draft?.customerName.trim() || !draft?.tableId}
              onClick={() => {
                if (!draft) return;
                store.addReservation(draft);
                setDraft(null);
              }}
            >
              Book table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
