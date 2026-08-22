import { createFileRoute } from "@tanstack/react-router";
import { Plus, Tags } from "lucide-react";
import { useState } from "react";

import { DataTable, Money, Page, PageHeader, SectionCard, StatusBadge } from "@/components/kit";
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
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/mock/store";
import type { ExpenseHead } from "@/mock/types";

export const Route = createFileRoute("/_shell/expense/heads")({
  head: () => ({
    meta: [
      { title: "Expense Heads · BillerPe" },
      { name: "description", content: "Fixed and variable expense heads used for every expense entry." },
      { property: "og:title", content: "Expense Heads · BillerPe" },
      { property: "og:description", content: "Fixed and variable expense heads in BillerPe." },
    ],
  }),
  component: ExpenseHeadsPage,
});

function ExpenseHeadsPage() {
  const store = useStore();
  const [draft, setDraft] = useState<ExpenseHead | null>(null);

  const spent = (id: string) =>
    store.expenses.filter((e) => e.headId === id).reduce((s, e) => s + e.amount, 0);

  return (
    <Page>
      <PageHeader
        icon={Tags}
        title="Expense Head"
        description="Heads group expenses for the expense report and cash session deductions."
        actions={
          <Button onClick={() => setDraft({ id: "", name: "", type: "Variable", active: true })}>
            <Plus className="size-4" /> New head
          </Button>
        }
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={store.expenseHeads}
          keyFn={(h) => h.id}
          onRowClick={(h) => setDraft({ ...h })}
          columns={[
            { key: "name", header: "Head", cell: (h) => <span className="font-medium">{h.name}</span> },
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
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!draft?.name.trim()}
              onClick={() => {
                if (!draft) return;
                store.upsertExpenseHead(draft);
                setDraft(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
