import { FieldError, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { Grid2x2, ListPlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  BulkActionsBar,
  DataTable,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/mock/store";
import type { RestaurantTable } from "@/mock/types";

export const Route = createFileRoute("/_shell/tables/manage")({
  head: () => ({
    meta: [
      { title: "Manage Tables · BillerPe" },
      {
        name: "description",
        content: "Add, rename and re-seat every table across the floor sections.",
      },
      { property: "og:title", content: "Manage Tables · BillerPe" },
      {
        property: "og:description",
        content: "Add, rename and re-seat BillerPe restaurant tables.",
      },
    ],
  }),
  component: ManageTablesPage,
});

function ManageTablesPage() {
  const access = useAccess("tables");
  const store = useStore();
  const [draft, setDraft] = useState<RestaurantTable | null>(null);
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkSeats, setBulkSeats] = useState(4);
  const [bulkPrefix, setBulkPrefix] = useState("T");
  const [bulkStart, setBulkStart] = useState(1);
  const bulkForm = useFormCheck();
  const bulkFormOpen = bulkOpen;
  const bulkFormReset = bulkForm.reset;
  useEffect(() => {
    if (!bulkFormOpen) bulkFormReset();
  }, [bulkFormOpen, bulkFormReset]);

  const rows = store.tables.filter((t) => cat === "all" || t.categoryId === cat);
  const paged = usePagedRows(rows, 10);
  const catName = (id: string) => store.tableCategories.find((c) => c.id === id)?.name ?? "—";
  const sortedCategories = [...store.tableCategories].sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => setSelected([]), [cat]);

  const freePageIds = paged.pageRows.filter((t) => t.status === "Free").map((t) => t.id);
  const allFreeOnPageSelected =
    freePageIds.length > 0 && freePageIds.every((id) => selected.includes(id));
  const toggleAllOnPage = () =>
    setSelected((prev) =>
      allFreeOnPageSelected
        ? prev.filter((id) => !freePageIds.includes(id))
        : [...new Set([...prev, ...freePageIds])],
    );
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const nextStartFor = (categoryId: string) =>
    store.tables.filter((t) => t.categoryId === categoryId).length + 1;

  const openBulkAdd = () => {
    const initialCat = cat !== "all" ? cat : (sortedCategories[0]?.id ?? "");
    setBulkCat(initialCat);
    setBulkStart(initialCat ? nextStartFor(initialCat) : 1);
    setBulkCount(5);
    setBulkSeats(4);
    setBulkPrefix("T");
    setBulkOpen(true);
  };

  return (
    <Page>
      <PageHeader
        icon={Grid2x2}
        title="Manage Tables"
        description="Tables occupied by a running order cannot be deleted."
        actions={
          <>
            <Button variant="outline" onClick={openBulkAdd}>
              <ListPlus className="size-4" /> Bulk add
            </Button>
            <Button
              hidden={!access.create}
              onClick={() =>
                setDraft({
                  id: "",
                  name: "",
                  categoryId: sortedCategories[0]?.id ?? "",
                  seats: 4,
                  status: "Free",
                })
              }
            >
              <Plus className="size-4" /> New table
            </Button>
          </>
        }
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sortedCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-3">
          <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
            <Button
              hidden={!access.delete}
              size="sm"
              variant="outline"
              className="text-primary"
              onClick={() => {
                store.removeTables(selected);
                setSelected([]);
              }}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </BulkActionsBar>

          <DataTable
            rows={paged.pageRows}
            keyFn={(t) => t.id}
            onRowClick={(t) => setDraft({ ...t })}
            columns={[
              {
                key: "sel",
                header: (
                  <Checkbox
                    checked={allFreeOnPageSelected}
                    onCheckedChange={toggleAllOnPage}
                    aria-label="Select all free tables on this page"
                  />
                ),
                cell: (t) =>
                  t.status === "Free" ? (
                    <Checkbox
                      checked={selected.includes(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleOne(t.id)}
                    />
                  ) : null,
              },
              {
                key: "name",
                header: "Table",
                cell: (t) => <span className="font-medium">{t.name}</span>,
              },
              { key: "cat", header: "Section", cell: (t) => catName(t.categoryId) },
              {
                key: "seats",
                header: "Seats",
                cell: (t) => <span className="num">{t.seats}</span>,
              },
              { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
            ]}
            mobileCard={(t) => (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {catName(t.categoryId)} · <span className="num">{t.seats}</span> seats
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            )}
          />
          <TablePager {...paged} onPageChange={paged.setPage} />
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit table" : "New table"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Table name</Label>
                <Input
                  {...form.fieldProps("name")}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. OutDoor T5"
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label required>Section</Label>
                  <Select
                    value={draft.categoryId}
                    onValueChange={(v) => {
                      setDraft({ ...draft, categoryId: v });
                      form.clearError("categoryId");
                    }}
                  >
                    <SelectTrigger
                      data-field="categoryId"
                      aria-invalid={!!form.error("categoryId") || undefined}
                    >
                      <SelectValue placeholder="Choose a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={form.error("categoryId")} />
                </div>
                <div className="space-y-1.5">
                  <Label required>Seats</Label>
                  <Input
                    {...form.fieldProps("seats")}
                    type="number"
                    min={1}
                    value={draft.seats}
                    onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
                  />
                  <FieldError message={form.error("seats")} />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button
                hidden={!access.delete}
                variant="ghost"
                className="text-primary"
                disabled={draft.status !== "Free"}
                onClick={() => {
                  store.removeTable(draft.id);
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
                  const ok = form.check([
                    { key: "name", label: "Table name", value: draft.name },
                    {
                      key: "categoryId",
                      label: "Section",
                      value: draft.categoryId,
                      message: "Choose a section",
                    },
                    {
                      key: "seats",
                      label: "Seats",
                      value: draft.seats,
                      valid: (v) => typeof v === "number" && v >= 1,
                      message: "Seats must be at least 1",
                    },
                  ]);
                  if (!ok) return;
                  if (await store.upsertTable(draft)) setDraft(null);
                }}
              >
                Save table
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk add tables</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label required>Section</Label>
              <Select
                value={bulkCat}
                onValueChange={(v) => {
                  setBulkCat(v);
                  setBulkStart(nextStartFor(v));
                  bulkForm.clearError("bulkCat");
                }}
              >
                <SelectTrigger
                  data-field="bulkCat"
                  aria-invalid={!!bulkForm.error("bulkCat") || undefined}
                >
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent>
                  {sortedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={bulkForm.error("bulkCat")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>Number of tables</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label required>Seats (each)</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkSeats}
                  onChange={(e) => setBulkSeats(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name prefix</Label>
                <Input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Starting number</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkStart}
                  onChange={(e) => setBulkStart(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates {bulkPrefix}
              {bulkStart} … {bulkPrefix}
              {bulkStart + bulkCount - 1}, {bulkSeats} seats each, in{" "}
              {store.tableCategories.find((c) => c.id === bulkCat)?.name ?? "the selected section"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const ok = bulkForm.check([
                  { key: "bulkCat", label: "Section", value: bulkCat, message: "Choose a section" },
                  {
                    key: "bulkCount",
                    label: "Number of tables",
                    value: bulkCount,
                    valid: (v) => typeof v === "number" && v >= 1,
                    message: "Add at least 1 table",
                  },
                  {
                    key: "bulkSeats",
                    label: "Seats (each)",
                    value: bulkSeats,
                    valid: (v) => typeof v === "number" && v >= 1,
                    message: "Seats must be at least 1",
                  },
                ]);
                if (!ok) return;
                const tables: RestaurantTable[] = Array.from({ length: bulkCount }, (_, i) => ({
                  id: "",
                  name: `${bulkPrefix}${bulkStart + i}`,
                  categoryId: bulkCat,
                  seats: bulkSeats,
                  status: "Free" as const,
                }));
                if (await store.addTables(tables)) setBulkOpen(false);
              }}
            >
              <ListPlus className="size-4" /> Add {bulkCount} table(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
