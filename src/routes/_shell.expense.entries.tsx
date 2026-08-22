import { createFileRoute } from "@tanstack/react-router";
import { Plus, Wallet2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DataTable,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
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
import { todayLabel } from "@/mock/format";
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

function ExpenseEntriesPage() {
  const store = useStore();
  const [draft, setDraft] = useState<Expense | null>(null);

  const headName = (id: string) => store.expenseHeads.find((h) => h.id === id)?.name ?? "—";
  const total = useMemo(() => store.expenses.reduce((s, e) => s + e.amount, 0), [store.expenses]);
  const todayTotal = useMemo(
    () => store.expenses.filter((e) => e.date === todayLabel).reduce((s, e) => s + e.amount, 0),
    [store.expenses],
  );
  const cashTotal = useMemo(
    () => store.expenses.filter((e) => e.mode === "Cash").reduce((s, e) => s + e.amount, 0),
    [store.expenses],
  );
  const paged = usePagedRows(store.expenses, 10);

  return (
    <Page>
      <PageHeader
        icon={Wallet2}
        title="Expense Entry"
        description="Cash expenses are deducted from the open cash session automatically."
        actions={
          <Button
            onClick={() =>
              setDraft({
                id: "",
                headId: store.expenseHeads[0]?.id ?? "",
                amount: 0,
                date: todayLabel,
                mode: "Cash",
                note: "",
                createdBy: store.currentUser.name,
              })
            }
          >
            <Plus className="size-4" /> Add expense
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Today" value={<Money value={todayTotal} />} tone="primary" />
        <StatCard label="Cash expenses" value={<Money value={cashTotal} />} tone="warning" />
        <StatCard label="All recorded" value={<Money value={total} />} />
      </div>

      <SectionCard title="Expense entries" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(e) => e.id}
          columns={[
            { key: "date", header: "Date", cell: (e) => <span className="num">{e.date}</span> },
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
                  <span className="num">{e.date}</span> · {e.mode} · {e.createdBy}
                </p>
              </div>
              <Money value={e.amount} className="font-semibold" />
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
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
                      .filter((h) => h.active)
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
                <Label>Note</Label>
                <Input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="What was this for?"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!draft || draft.amount <= 0}
              onClick={() => {
                if (!draft) return;
                if (draft.mode === "Cash") {
                  store.attachExpense(draft.headId, draft.amount, draft.note);
                } else {
                  store.upsertExpense(draft);
                }
                setDraft(null);
              }}
            >
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
