import { FieldError, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutList, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  BulkActionsBar,
  DataTable,
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
import type { MenuCategory } from "@/mock/types";

export const Route = createFileRoute("/_shell/menu/categories")({
  head: () => ({
    meta: [
      { title: "Menu Categories · BillerPe" },
      {
        name: "description",
        content: "Create and organise the menu categories shown on the biller screen.",
      },
      { property: "og:title", content: "Menu Categories · BillerPe" },
      {
        property: "og:description",
        content: "Organise menu categories for the BillerPe biller screen.",
      },
    ],
  }),
  component: MenuCategoriesPage,
});

function MenuCategoriesPage() {
  const access = useAccess("menu");
  const store = useStore();
  const [draft, setDraft] = useState<MenuCategory | null>(null);
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);

  const defaultMenuId = store.menus.find((m) => m.isDefault)?.id ?? store.menus[0]?.id ?? "";
  const [viewMenuId, setViewMenuId] = useState(defaultMenuId);
  // The menus may still be loading when this page opens (a refresh, a
  // direct link): pick the default one as soon as they arrive, instead of
  // staying on "no menu" with every action disabled.
  useEffect(() => {
    if (defaultMenuId && !store.menus.some((m) => m.id === viewMenuId)) {
      setViewMenuId(defaultMenuId);
    }
  }, [store.menus, defaultMenuId, viewMenuId]);

  const menuCategories = useMemo(
    () => store.menuCategories.filter((c) => c.menuId === viewMenuId),
    [store.menuCategories, viewMenuId],
  );
  const rows = [...menuCategories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const itemCount = (id: string) => store.menuItems.filter((i) => i.categoryId === id).length;
  // Deletion is gated on ACTIVE items only — a category whose items are all
  // inactive is safe to remove (the backend cascades the same soft-delete to
  // them), it's only categories still serving live items that must be
  // emptied first.
  const activeItemCount = (id: string) =>
    store.menuItems.filter((i) => i.categoryId === id && i.active).length;

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [viewMenuId]);

  const rowIds = rows.map((c) => c.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.includes(id));
  const toggleAll = () => setSelected(allSelected ? [] : rowIds);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedWithItems = selected.filter((id) => activeItemCount(id) > 0);

  return (
    <Page>
      <PageHeader
        icon={LayoutList}
        title="Menu Categories"
        description="Categories drive the biller item grid, KOT routing and category-wise reports."
        actions={
          <Button
            hidden={!access.create}
            onClick={() =>
              setDraft({
                id: "",
                name: "",
                active: true,
                sortOrder: menuCategories.length + 1,
                menuId: viewMenuId,
              })
            }
          >
            <Plus className="size-4" /> New category
          </Button>
        }
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Viewing menu
          </Label>
          <Select value={viewMenuId} onValueChange={setViewMenuId}>
            <SelectTrigger className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {store.menus.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                  {m.isDefault ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title={`${menuCategories.length} categories`} bodyClassName="p-0 sm:p-0">
        <div className="p-2 sm:p-3">
          <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
            <Button
              hidden={!access.delete}
              size="sm"
              variant="outline"
              className="text-primary"
              disabled={!selected.length}
              title={
                selectedWithItems.length
                  ? `${selectedWithItems.length} of the selected categor${selectedWithItems.length === 1 ? "y has" : "ies have"} active item(s) — those will be skipped`
                  : "Delete selected"
              }
              onClick={() => {
                store.removeMenuCategories(selected);
                setSelected([]);
              }}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </BulkActionsBar>

          <DataTable
            rows={rows}
            keyFn={(c) => c.id}
            onRowClick={(c) => setDraft({ ...c })}
            columns={[
              {
                key: "sel",
                header: (
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all categories"
                  />
                ),
                cell: (c) => (
                  <Checkbox
                    checked={selected.includes(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleOne(c.id)}
                  />
                ),
              },
              {
                key: "order",
                header: "#",
                cell: (c) => <span className="num">{c.sortOrder ?? "—"}</span>,
              },
              {
                key: "name",
                header: "Category",
                cell: (c) => <span className="font-medium">{c.name}</span>,
              },
              {
                key: "items",
                header: "Items",
                cell: (c) => (
                  <span className="num">
                    {store.menuItems.filter((i) => i.categoryId === c.id).length}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (c) => <StatusBadge status={c.active ? "Active" : "Inactive"} />,
              },
            ]}
            mobileCard={(c) => (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {store.menuItems.filter((i) => i.categoryId === c.id).length} items
                  </p>
                </div>
                <StatusBadge status={c.active ? "Active" : "Inactive"} />
              </div>
            )}
          />
        </div>
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
                  placeholder="e.g. Gujarati Thali"
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  step={1}
                  type="number"
                  value={draft.sortOrder ?? 0}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive categories are hidden from billing.
                  </p>
                </div>
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
                className="text-primary"
                disabled={activeItemCount(draft.id) > 0}
                title={
                  activeItemCount(draft.id) > 0
                    ? `In use by ${activeItemCount(draft.id)} active item(s) — deactivate or move them first`
                    : "Delete category"
                }
                onClick={() => {
                  store.removeMenuCategory(draft.id);
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
                  if (await store.upsertMenuCategory(draft)) setDraft(null);
                }}
              >
                Save category
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
