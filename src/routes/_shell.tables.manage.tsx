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
  const store = useStore();
  const [draft, setDraft] = useState<RestaurantTable | null>(null);
  const [cat, setCat] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkSeats, setBulkSeats] = useState(4);
  const [bulkPrefix, setBulkPrefix] = useState("T");
  const [bulkStart, setBulkStart] = useState(1);

  const rows = store.tables.filter((t) => cat === "all" || t.categoryId === cat);
  const paged = usePagedRows(rows, 10);
  const catName = (id: string) => store.tableCategories.find((c) => c.id === id)?.name ?? "—";

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
    const initialCat = cat !== "all" ? cat : (store.tableCategories[0]?.id ?? "");
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
              onClick={() =>
                setDraft({
                  id: "",
                  name: "",
                  categoryId: store.tableCategories[0]?.id ?? "",
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
            {store.tableCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-3">
          <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
            <Button
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
                <Label>Table name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. OutDoor T5"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Section</Label>
                  <Select
                    value={draft.categoryId}
                    onValueChange={(v) => setDraft({ ...draft, categoryId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {store.tableCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Seats</Label>
                  <Input
                    type="number"
                    value={draft.seats}
                    onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button
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
                disabled={!draft?.name.trim()}
                onClick={() => {
                  if (!draft) return;
                  store.upsertTable(draft);
                  setDraft(null);
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
              <Label>Section</Label>
              <Select
                value={bulkCat}
                onValueChange={(v) => {
                  setBulkCat(v);
                  setBulkStart(nextStartFor(v));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {store.tableCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Number of tables</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Seats (each)</Label>
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
              disabled={!bulkCat || bulkCount < 1}
              onClick={() => {
                const tables: RestaurantTable[] = Array.from({ length: bulkCount }, (_, i) => ({
                  id: "",
                  name: `${bulkPrefix}${bulkStart + i}`,
                  categoryId: bulkCat,
                  seats: bulkSeats,
                  status: "Free" as const,
                }));
                store.addTables(tables);
                setBulkOpen(false);
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
