import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Trash2, Wallet2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  TablePager,
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
import { Textarea } from "@/components/ui/textarea";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, dmyToIso, realToday, resolveRange, type RangeKey } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { Expense } from "@/mock/types";

export const Route = createFileRoute("/_shell/expense/entries")({
  head: () => ({
    meta: [
      { title: "Expense Entry · BillerPe" },
      {
        name: "description",
        content: "Record daily outlet expenses; cash entries hit the open cash session.",
      },
      { property: "og:title", content: "Expense Entry · BillerPe" },
      { property: "og:description", content: "Record daily outlet expenses in BillerPe." },
    ],
  }),
  component: ExpenseEntriesPage,
});

const PAGE_SIZE = 10;

/** "YYYY-MM-DDTHH:mm" in the viewer's own local time, for a datetime-local
 * input's value/max - the browser renders/parses that control in local time
 * regardless of what timezone offset the underlying Date carries. */
function toDatetimeLocalValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mi = `${d.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/** Reverses mapRawExpenseEntry's "DD/MM/YYYY" + "H:MM am/pm" split back into
 * a real Date, so editing an existing row can prefill the datetime-local
 * picker at the entry's actual recorded time instead of resetting it to now. */
function parseExpenseDateTime(dateDMY: string, timeLabel: string): Date {
  const [d, m, y] = dateDMY.split("/").map(Number);
  const match = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(timeLabel);
  if (!match) return new Date(y || 1970, (m || 1) - 1, d || 1);
  let hh = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hh += 12;
  return new Date(y || 1970, (m || 1) - 1, d || 1, hh, Number(match[2]));
}

function ExpenseEntriesPage() {
  const access = useAccess("expense");
  const store = useStore();
  const [draft, setDraft] = useState<Expense | null>(null);
  const [draftDateTime, setDraftDateTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(dmyToIso(realToday()));
  const [customTo, setCustomTo] = useState(dmyToIso(realToday()));
  const [headFilter, setHeadFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { from, to } = resolveRange(rangeKey, customFrom, customTo);
  const isoFrom = dmyToIso(from);
  const isoTo = dmyToIso(to);

  // Full-range set (Dashboard/expense-report/Expense Heads) is loaded
  // separately by whichever screen needs it - this screen only ever drives
  // the paginated + filtered view via loadExpenseEntriesPage, never
  // loadExpensesFromServer (see store.tsx's own comment on the split).
  useEffect(() => {
    void store.loadExpenseHeadsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A stale page number from a previous filter set means nothing under a
  // new one - reset to page 1 whenever any filter (not the page itself)
  // changes, same pattern as the Audit Log screen's own filter reset.
  useEffect(() => {
    setPage(1);
  }, [isoFrom, isoTo, headFilter, modeFilter, userFilter]);

  // Shared by the filter/page effect below and by save/delete's own
  // post-mutation refresh, so all three ways this list can change stay on
  // exactly the same filters + page instead of drifting apart.
  const reloadCurrentPage = () =>
    store.loadExpenseEntriesPage({
      from: isoFrom,
      to: isoTo,
      page,
      limit: PAGE_SIZE,
      expenseHeadId: headFilter !== "all" ? headFilter : undefined,
      paymentMode: modeFilter !== "all" ? (modeFilter as Expense["mode"]) : undefined,
      userId: userFilter !== "all" ? userFilter : undefined,
    });

  useEffect(() => {
    void reloadCurrentPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoFrom, isoTo, headFilter, modeFilter, userFilter, page]);

  const headName = (id: string) => store.expenseHeads.find((h) => h.id === id)?.name ?? "—";

  const todayTotal = store.expenseEntriesPageRows
    .filter((e) => e.date === realToday())
    .reduce((s, e) => s + e.amount, 0);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await store.loadAllExpensesForExport({
        from: isoFrom,
        to: isoTo,
        expenseHeadId: headFilter !== "all" ? headFilter : undefined,
        paymentMode: modeFilter !== "all" ? (modeFilter as Expense["mode"]) : undefined,
        userId: userFilter !== "all" ? userFilter : undefined,
      });
      if (!rows.length) {
        toast.error("Nothing to export", { description: "No expenses match the current filters." });
        return;
      }
      const csvRows: (string | number)[][] = [
        ["Date", "Time", "Head", "Note", "Mode", "By", "Amount"],
        ...rows.map((e) => [
          e.date,
          e.time,
          headName(e.headId),
          e.note,
          e.mode,
          e.createdBy,
          e.amount,
        ]),
      ];
      downloadTextFile(`expenses-${isoFrom}-to-${isoTo}.csv`, toCsv(csvRows));
      toast.success("Expenses exported", { description: `${rows.length} rows` });
    } finally {
      setExporting(false);
    }
  };

  const openAddDialog = () => {
    const now = new Date();
    setDraftDateTime(toDatetimeLocalValue(now));
    setDraft({
      id: "",
      headId: store.expenseHeads.find((h) => h.active && !h.deleted)?.id ?? "",
      amount: 0,
      date: realToday(),
      time: "",
      mode: "Cash",
      note: "",
      createdBy: store.currentUser.name,
    });
  };

  const openEditDialog = (e: Expense) => {
    setDraftDateTime(toDatetimeLocalValue(parseExpenseDateTime(e.date, e.time)));
    setDraft({ ...e });
  };

  const nowLocal = toDatetimeLocalValue(new Date());

  return (
    <Page>
      <PageHeader
        icon={Wallet2}
        title="Expense Entry"
        description="Cash expenses are deducted from the open cash session automatically."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button hidden={!access.create} onClick={openAddDialog}>
              <Plus className="size-4" /> Add expense
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Today (this page)" value={<Money value={todayTotal} />} tone="primary" />
        <StatCard
          label="Cash expenses (filtered)"
          value={<Money value={store.expenseEntriesTotalExpense} />}
          tone="warning"
        />
        <StatCard label="Matching entries" value={store.expenseEntriesTotal} />
      </div>

      <SectionCard title="Filters" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                rangeKey === r.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40",
              )}
            >
              {r.label}
            </button>
          ))}
          {rangeKey === "custom" ? (
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select value={headFilter} onValueChange={setHeadFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Expense head" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All heads</SelectItem>
              {store.expenseHeads.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Payment mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment modes</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Bank">Bank</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Entered by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Entered by anyone</SelectItem>
              {store.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Expense entries" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={store.expenseEntriesPageRows}
          keyFn={(e) => e.id}
          onRowClick={openEditDialog}
          empty={<EmptyState icon={Wallet2} title="No expenses match these filters" compact />}
          columns={[
            {
              key: "date",
              header: "Date & time",
              cell: (e) => (
                <span className="num">
                  {e.date} {e.time}
                </span>
              ),
            },
            {
              key: "head",
              header: "Head",
              cell: (e) => <span className="font-medium">{headName(e.headId)}</span>,
            },
            { key: "note", header: "Note", cell: (e) => e.note || "—" },
            { key: "mode", header: "Mode", cell: (e) => e.mode },
            { key: "by", header: "By", cell: (e) => e.createdBy },
            {
              key: "amount",
              header: "Amount",
              cell: (e) => <Money value={e.amount} className="font-semibold" />,
            },
          ]}
          mobileCard={(e) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{headName(e.headId)}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="num">
                    {e.date} {e.time}
                  </span>{" "}
                  · {e.mode} · {e.createdBy}
                </p>
              </div>
              <Money value={e.amount} className="font-semibold" />
            </div>
          )}
        />
        <TablePager
          page={store.expenseEntriesPage}
          pageCount={store.expenseEntriesTotalPages}
          total={store.expenseEntriesTotal}
          start={(store.expenseEntriesPage - 1) * PAGE_SIZE}
          end={Math.min(store.expenseEntriesPage * PAGE_SIZE, store.expenseEntriesTotal)}
          onPageChange={setPage}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit expense" : "Add expense"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Expense head</Label>
                <Select
                  value={draft.headId}
                  onValueChange={(v) => setDraft({ ...draft, headId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {store.expenseHeads
                      .filter((h) => h.active && !h.deleted)
                      .map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment mode</Label>
                  <Select
                    value={draft.mode}
                    onValueChange={(v) => setDraft({ ...draft, mode: v as Expense["mode"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Date &amp; time</Label>
                <Input
                  type="datetime-local"
                  value={draftDateTime}
                  max={nowLocal}
                  onChange={(e) => setDraftDateTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Backdate a forgotten entry if needed - a future date isn&apos;t allowed.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Note <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="What was this for?"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {draft?.id ? (
              <Button
                hidden={!access.delete}
                variant="outline"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
              disabled={
                !(draft?.id ? access.edit : access.create) ||
                !draft ||
                draft.amount <= 0 ||
                !draft.note.trim() ||
                saving
              }
              onClick={() => {
                if (!draft) return;
                // Backend rejects a blank reason with one combined "these 5
                // fields are required" message that doesn't say which one -
                // validate the specific field here so the user gets a
                // precise error instead of a dialog that just closes
                // unhelpfully. Confirmed live as the actual bug report.
                if (!draft.note.trim()) {
                  toast.error("Note is required", {
                    description: "Enter what this expense was for before saving.",
                  });
                  return;
                }
                if (!draft.headId) {
                  toast.error("Select an expense head");
                  return;
                }
                if (new Date(draftDateTime).getTime() > Date.now()) {
                  toast.error("Expense date can't be in the future");
                  return;
                }
                const isoDate = new Date(draftDateTime).toISOString();
                const currentDraft = draft;
                const run = async () => {
                  setSaving(true);
                  try {
                    // attachExpense only ever creates a new entry AND a new
                    // cash-session movement - fine for a brand-new Cash
                    // entry, but wrong for editing an existing one (it would
                    // create a duplicate row instead of updating it, plus a
                    // second cash-session deduction). Editing an existing
                    // entry (any mode) always goes through upsertExpense's
                    // update path instead; only a genuinely new Cash entry
                    // takes the attachExpense path.
                    const ok =
                      !currentDraft.id && currentDraft.mode === "Cash"
                        ? await store.attachExpense(
                            currentDraft.headId,
                            currentDraft.amount,
                            currentDraft.note,
                            isoDate,
                          )
                        : await store.upsertExpense(currentDraft, isoDate);
                    // Store's own attachExpense/upsertExpense already toast
                    // the specific backend error on failure - only close
                    // the dialog and refresh the list on an actual success,
                    // so a rejected save (e.g. a validation error we didn't
                    // catch client-side) leaves the form open to fix and
                    // retry instead of silently discarding what was typed.
                    if (!ok) return;
                    setDraft(null);
                    await reloadCurrentPage();
                  } finally {
                    setSaving(false);
                  }
                };
                void run();
              }}
            >
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => {
          setDeleteConfirmOpen(o);
          if (!o) setDeleteReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a real, irreversible delete against the backend - it won&apos;t appear in the
              entries list, expense report or CSV export anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="expense-delete-reason">Reason (optional, kept in the audit log)</Label>
            <Textarea
              id="expense-delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. entered by mistake, duplicate entry…"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep entry</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (!draft) return;
                const id = draft.id;
                const run = async () => {
                  setDeleting(true);
                  try {
                    const ok = await store.deleteExpense(id, deleteReason.trim() || undefined);
                    if (!ok) return;
                    setDeleteConfirmOpen(false);
                    setDeleteReason("");
                    setDraft(null);
                    await reloadCurrentPage();
                  } finally {
                    setDeleting(false);
                  }
                };
                void run();
              }}
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
