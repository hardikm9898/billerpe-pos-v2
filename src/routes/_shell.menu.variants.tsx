import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { Layers, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/mock/store";
import type { VariantOption } from "@/mock/types";

export const Route = createFileRoute("/_shell/menu/variants")({
  head: () => ({
    meta: [
      { title: "Variants · BillerPe" },
      { name: "description", content: "Portion and size variants shared across menu items." },
      { property: "og:title", content: "Variants · BillerPe" },
      {
        property: "og:description",
        content: "Portion and size variants used by BillerPe menu items.",
      },
    ],
  }),
  component: MenuVariantsPage,
});

function MenuVariantsPage() {
  const access = useAccess("menu");
  const store = useStore();
  const [draft, setDraft] = useState<VariantOption | null>(null);

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

  const categoriesById = useMemo(
    () => new Map(store.menuCategories.map((c) => [c.id, c])),
    [store.menuCategories],
  );
  const menuItems = useMemo(
    () => store.menuItems.filter((i) => categoriesById.get(i.categoryId)?.menuId === viewMenuId),
    [store.menuItems, categoriesById, viewMenuId],
  );
  const menuVariantMasters = useMemo(
    () => store.variantMasters.filter((v) => v.menuId === viewMenuId),
    [store.variantMasters, viewMenuId],
  );

  const usage = useMemo(
    () =>
      menuVariantMasters.map((v) => ({
        ...v,
        items: menuItems.filter((i) => (i.variants ?? []).some((x) => x.name === v.name)),
      })),
    [menuVariantMasters, menuItems],
  );

  return (
    <Page>
      <PageHeader
        icon={Layers}
        title="Variants"
        description="Variants change the base price of an item at the point of billing."
        actions={
          <Button
            hidden={!access.create}
            onClick={() => setDraft({ id: "", name: "", price: 0, menuId: viewMenuId })}
          >
            <Plus className="size-4" /> New variant
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

      <SectionCard title="Variant master" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={usage}
          keyFn={(v) => v.id}
          onRowClick={(v) => setDraft({ id: v.id, name: v.name, price: v.price, menuId: v.menuId })}
          columns={[
            {
              key: "name",
              header: "Variant",
              cell: (v) => <span className="font-medium">{v.name}</span>,
            },
            { key: "count", header: "Used by", cell: (v) => `${v.items.length} items` },
            {
              key: "delete",
              header: "",
              className: "text-right",
              cell: (v) => (
                <Button
                  hidden={!access.delete}
                  size="sm"
                  variant="ghost"
                  disabled={v.items.length > 0}
                  title={
                    v.items.length > 0
                      ? `In use by ${v.items.length} item(s) — remove it from those items first`
                      : "Delete variant"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    store.removeVariant(v.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Items with variants" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={menuItems.filter((i) => i.variants?.length)}
          keyFn={(i) => i.id}
          columns={[
            {
              key: "item",
              header: "Item",
              cell: (i) => <span className="font-medium">{i.name}</span>,
            },
            {
              key: "variants",
              header: "Variants",
              cell: (i) => (
                <div className="flex flex-wrap gap-1.5">
                  {(i.variants ?? []).map((v) => (
                    <span
                      key={v.id}
                      className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium"
                    >
                      {v.name} · <span className="num">₹{v.price}</span>
                    </span>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit variant" : "New variant"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Variant name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Half"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Price is set per menu item when this variant is attached to it, on that item's own
                edit form — every item can price the same variant differently.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
              disabled={!(draft?.id ? access.edit : access.create) || !draft?.name.trim()}
              onClick={() => {
                if (!draft) return;
                store.upsertVariant(draft);
                setDraft(null);
              }}
            >
              Save variant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
