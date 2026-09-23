import { FieldError, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

import { DataTable, Page, PageHeader, SectionCard } from "@/components/kit";
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
import type { TableCategory } from "@/mock/types";

export const Route = createFileRoute("/_shell/tables/categories")({
  head: () => ({
    meta: [
      { title: "Table Categories · BillerPe" },
      { name: "description", content: "Floor sections that group tables on the live table grid." },
      { property: "og:title", content: "Table Categories · BillerPe" },
      { property: "og:description", content: "Floor sections used by the BillerPe table grid." },
    ],
  }),
  component: TableCategoriesPage,
});

function TableCategoriesPage() {
  const access = useAccess("tables");
  const store = useStore();
  const [draft, setDraft] = useState<TableCategory | null>(null);
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);
  const tableCount = (id: string) => store.tables.filter((t) => t.categoryId === id).length;

  return (
    <Page>
      <PageHeader
        icon={LayoutGrid}
        title="Table Category"
        description="Categories become the section tabs on the table grid."
        actions={
          <Button
            hidden={!access.create}
            onClick={() =>
              setDraft({ id: "", name: "", sortOrder: store.tableCategories.length + 1 })
            }
          >
            <Plus className="size-4" /> New category
          </Button>
        }
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={[...store.tableCategories].sort((a, b) => a.sortOrder - b.sortOrder)}
          keyFn={(c) => c.id}
          onRowClick={(c) => setDraft({ ...c })}
          columns={[
            { key: "order", header: "#", cell: (c) => <span className="num">{c.sortOrder}</span> },
            {
              key: "name",
              header: "Category",
              cell: (c) => <span className="font-medium">{c.name}</span>,
            },
            {
              key: "tables",
              header: "Tables",
              cell: (c) => (
                <span className="num">
                  {store.tables.filter((t) => t.categoryId === c.id).length}
                </span>
              ),
            },
            {
              key: "seats",
              header: "Seats",
              cell: (c) => (
                <span className="num">
                  {store.tables
                    .filter((t) => t.categoryId === c.id)
                    .reduce((s, t) => s + t.seats, 0)}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Category name</Label>
                <Input
                  {...form.fieldProps("name")}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Garden Seating"
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  step={1}
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button
                hidden={!access.delete}
                variant="ghost"
                className="text-primary"
                disabled={tableCount(draft.id) > 0}
                title={
                  tableCount(draft.id) > 0
                    ? `In use by ${tableCount(draft.id)} table(s) — move or delete them first`
                    : "Delete section"
                }
                onClick={() => {
                  store.removeTableCategory(draft.id);
                  setDraft(null);
                }}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
                disabled={!(draft?.id ? access.edit : access.create)}
                onClick={async () => {
                  if (!draft) return;
                  if (!form.check([{ key: "name", label: "Category name", value: draft.name }]))
                    return;
                  if (await store.upsertTableCategory(draft)) setDraft(null);
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
