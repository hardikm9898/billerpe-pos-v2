import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Tags, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  BulkActionsBar,
  DataTable,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/mock/store";
import type { ExpenseHead } from "@/mock/types";

export const Route = createFileRoute("/_shell/expense/heads")({
  head: () => ({
    meta: [
      { title: "Expense Heads · BillerPe" },
      {
        name: "description",
        content: "Fixed and variable expense heads used for every expense entry.",
      },
      { property: "og:title", content: "Expense Heads · BillerPe" },
      { property: "og:description", content: "Fixed and variable expense heads in BillerPe." },
    ],
  }),
  component: ExpenseHeadsPage,
});

function ExpenseHeadsPage() {
  const access = useAccess("expense");
  const store = useStore();
  const [draft, setDraft] = useState<ExpenseHead | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // Expense Heads is confirmed out of scope for the Local EXE (no local
  // model) - loaded here on this screen's own mount, not globally on
  // every login (see AppShell.tsx's own comment on why that moved).
  useEffect(() => {
    void store.loadExpenseHeadsFromServer();
    void store.loadExpensesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spent = (id: string) =>
    store.expenses.filter((e) => e.headId === id).reduce((s, e) => s + e.amount, 0);

  const rows = useMemo(
    () =>
      store.expenseHeads
        // Deleted heads stay in store.expenseHeads (see ExpenseHead's own
        // `deleted` comment) purely so past expense entries can still show
        // their head's name - this management list isn't that lookup, so
        // they're filtered out here instead.
        .filter((h) => !h.deleted)
        .filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase())),
    [store.expenseHeads, q],
  );

  useEffect(() => setSelected([]), [q]);

  const rowIds = rows.map((h) => h.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.includes(id));
  const toggleAll = () => setSelected(allSelected ? [] : rowIds);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Page>
      <PageHeader
        icon={Tags}
        title="Expense Head"
        description="Heads group expenses for the expense report and cash session deductions."
        actions={
          <Button
            hidden={!access.create}
            onClick={() => setDraft({ id: "", name: "", type: "Variable", active: true })}
          >
            <Plus className="size-4" /> New head
          </Button>
        }
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expense heads"
            className="pl-9"
          />
        </div>

        <div className="mt-3">
          <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
            <Button
              hidden={!access.delete}
              size="sm"
              variant="outline"
              className="text-primary"
              disabled={deleting}
              onClick={() => {
                const ids = selected;
                setSelected([]);
                setDeleting(true);
                void store.removeExpenseHeads(ids).finally(() => setDeleting(false));
              }}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </BulkActionsBar>

          <DataTable
            rows={rows}
            keyFn={(h) => h.id}
            onRowClick={(h) => setDraft({ ...h })}
            columns={[
              {
                key: "sel",
                header: (
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all expense heads"
                  />
                ),
                cell: (h) => (
                  <Checkbox
                    checked={selected.includes(h.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleOne(h.id)}
                  />
                ),
              },
              {
                key: "name",
                header: "Head",
                cell: (h) => <span className="font-medium">{h.name}</span>,
              },
              { key: "type", header: "Type", cell: (h) => h.type },
              { key: "spent", header: "Recorded", cell: (h) => <Money value={spent(h.id)} /> },
              {
                key: "status",
                header: "Status",
                cell: (h) => <StatusBadge status={h.active ? "Active" : "Inactive"} />,
              },
            ]}
            mobileCard={(h) => (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.type}</p>
                </div>
                <Money value={spent(h.id)} className="font-semibold" />
              </div>
            )}
          />
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit head" : "New expense head"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Head name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => setDraft({ ...draft, type: v as ExpenseHead["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Fixed: recurring cost that stays roughly the same every month regardless of sales
                  (e.g. rent, staff salary). Variable: fluctuates with business activity (e.g. raw
                  material, gas, repairs). This label is for your own reporting only — it doesn't
                  change any calculation.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                <span className="text-sm font-medium">Active</span>
                <Switch
                  checked={draft.active}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button
                hidden={!access.delete}
                variant="ghost"
                className="text-primary sm:mr-auto"
                disabled={saving || deleting}
                onClick={() => {
                  if (!draft) return;
                  const id = draft.id;
                  setDeleting(true);
                  void store.removeExpenseHead(id).finally(() => setDeleting(false));
                  setDraft(null);
                }}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
                disabled={
                  !(draft?.id ? access.edit : access.create) || !draft?.name.trim() || saving
                }
                onClick={() => {
                  if (!draft) return;
                  setSaving(true);
                  void store
                    .upsertExpenseHead(draft)
                    .then((ok) => {
                      if (ok) setDraft(null);
                    })
                    .finally(() => setSaving(false));
                }}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
