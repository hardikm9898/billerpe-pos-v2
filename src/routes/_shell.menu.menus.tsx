import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader, SectionCard, StatCard } from "@/components/kit";
import { AssignmentSummary, ChipSelect, Notice } from "@/components/operations/shared";
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
import type { Menu, OpsOrderType } from "@/mock/types";

export const Route = createFileRoute("/_shell/menu/menus")({
  head: () => ({
    meta: [
      { title: "Menus · BillerPe" },
      {
        name: "description",
        content: "Secondary menus scoped to a table category and/or order type.",
      },
      { property: "og:title", content: "Menus · BillerPe" },
      { property: "og:description", content: "Manage secondary menus in BillerPe." },
    ],
  }),
  component: MenusPage,
});

const ORDER_TYPES: OpsOrderType[] = ["Dine-in", "Pickup"];

const emptyMenu = (): Menu => ({ id: "", name: "", tableCategoryIds: [], orderTypes: [] });

function MenusPage() {
  const access = useAccess("menu");
  const store = useStore();
  const [draft, setDraft] = useState<Menu | null>(null);

  const tcName = (id: string) => store.tableCategories.find((c) => c.id === id)?.name ?? id;
  const defaultMenu = store.menus.find((m) => m.isDefault) ?? store.menus[0];
  const categoriesById = new Map(store.menuCategories.map((c) => [c.id, c]));
  const menuStats = (menuId: string) => {
    const categories = store.menuCategories.filter((c) => c.menuId === menuId);
    const items = store.menuItems.filter(
      (i) => categoriesById.get(i.categoryId)?.menuId === menuId,
    );
    const addons = store.addonGroups.filter((g) => g.menuId === menuId);
    const variants = store.variantMasters.filter((v) => v.menuId === menuId);
    return {
      categories: categories.length,
      items: items.length,
      addons: addons.length,
      variants: variants.length,
    };
  };

  return (
    <Page>
      <PageHeader
        icon={BookOpen}
        title="Menus"
        description="Each menu owns its own categories, items, addons and variants — nothing is shared between menus."
        actions={
          <Button hidden={!access.create} onClick={() => setDraft(emptyMenu())}>
            <Plus className="size-4" /> Add menu
          </Button>
        }
      />

      <Notice tone="info" title="A secondary menu needs both axes to match">
        Leave table categories or order types empty to not filter on that axis. Build out a menu's
        catalogue from the Menu Categories / Menu Items / Addons / Variants pages — pick the menu
        there first. <span className="font-semibold">{defaultMenu?.name ?? "none set"}</span> is the
        default that every order falls back to. A brand-new menu starts completely empty.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Menus" value={String(store.menus.length)} tone="primary" />
        <StatCard label="Total menu items" value={String(store.menuItems.length)} />
      </div>

      <SectionCard title="Menus" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          {store.menus.map((m) => {
            const stats = menuStats(m.id);
            return (
              <div key={m.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {m.name}
                      {m.isDefault ? (
                        <span className="rounded-lg bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.categories} categor{stats.categories === 1 ? "y" : "ies"} ·{" "}
                      {stats.items} item(s) · {stats.addons} addon group(s) · {stats.variants}{" "}
                      variant(s)
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {!m.isDefault ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => store.setDefaultMenu(m.id)}
                      >
                        Make default
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setDraft(m)}>
                      Edit
                    </Button>
                    <Button
                      hidden={!access.delete}
                      size="sm"
                      variant="ghost"
                      onClick={() => store.removeMenu(m.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                      Table categories
                    </p>
                    <AssignmentSummary
                      items={m.tableCategoryIds.map(tcName)}
                      fallback="All table categories"
                    />
                  </div>
                  <div>
                    <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                      Order types
                    </p>
                    <AssignmentSummary items={m.orderTypes} fallback="All order types" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit menu" : "Add menu"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Menu name</Label>
                <Input
                  value={draft.name}
                  placeholder="e.g. Bar Menu"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <ChipSelect
                label="Table categories"
                hint="Orders opened from these sections use this menu."
                options={store.tableCategories.map((c) => ({ id: c.id, name: c.name }))}
                selected={draft.tableCategoryIds}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    tableCategoryIds: draft.tableCategoryIds.includes(id)
                      ? draft.tableCategoryIds.filter((x) => x !== id)
                      : [...draft.tableCategoryIds, id],
                  })
                }
                allLabel="All table categories"
              />
              <ChipSelect
                label="Order types"
                hint="Only orders of these types use this menu."
                options={ORDER_TYPES.map((o) => ({ id: o, name: o }))}
                selected={draft.orderTypes}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    orderTypes: draft.orderTypes.includes(id as OpsOrderType)
                      ? draft.orderTypes.filter((x) => x !== id)
                      : [...draft.orderTypes, id as OpsOrderType],
                  })
                }
                allLabel="All order types"
              />
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
                store.upsertMenu(draft);
                setDraft(null);
              }}
            >
              Save menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
