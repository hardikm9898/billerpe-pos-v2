import { createFileRoute } from "@tanstack/react-router";
import { LayoutList, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, Page, PageHeader, SectionCard, StatusBadge } from "@/components/kit";
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
  const store = useStore();
  const [draft, setDraft] = useState<MenuCategory | null>(null);

  const defaultMenuId = store.menus.find((m) => m.isDefault)?.id ?? store.menus[0]?.id ?? "";
  const [viewMenuId, setViewMenuId] = useState(defaultMenuId);

  const menuCategories = useMemo(
    () => store.menuCategories.filter((c) => c.menuId === viewMenuId),
    [store.menuCategories, viewMenuId],
  );
  const rows = [...menuCategories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const itemCount = (id: string) => store.menuItems.filter((i) => i.categoryId === id).length;

  return (
    <Page>
      <PageHeader
        icon={LayoutList}
        title="Menu Categories"
        description="Categories drive the biller item grid, KOT routing and category-wise reports."
        actions={
          <Button
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
          <DataTable
            rows={rows}
            keyFn={(c) => c.id}
            onRowClick={(c) => setDraft({ ...c })}
            columns={[
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
                <Label>Category name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Gujarati Thali"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
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
                variant="ghost"
                className="text-primary"
                disabled={itemCount(draft.id) > 0}
                title={
                  itemCount(draft.id) > 0
                    ? `In use by ${itemCount(draft.id)} item(s) — move or delete them first`
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
                disabled={!draft?.name.trim()}
                onClick={() => {
                  if (!draft) return;
                  store.upsertMenuCategory(draft);
                  setDraft(null);
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
