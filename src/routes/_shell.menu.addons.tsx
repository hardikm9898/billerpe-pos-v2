import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, PlusCircle, Trash2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

import { Money, Page, PageHeader, SectionCard } from "@/components/kit";
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
import type { AddonGroup } from "@/mock/types";

export const Route = createFileRoute("/_shell/menu/addons")({
  head: () => ({
    meta: [
      { title: "Addons · BillerPe" },
      {
        name: "description",
        content: "Addon groups, selection rules and the items that use them.",
      },
      { property: "og:title", content: "Addons · BillerPe" },
      { property: "og:description", content: "Addon groups and selection rules in BillerPe." },
    ],
  }),
  component: MenuAddonsPage,
});

const blankGroup = (menuId: string): AddonGroup => ({
  id: "",
  name: "",
  min: 0,
  max: 1,
  selection: "Single",
  options: [],
  menuId,
});

const newOptionId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `opt-${Date.now()}-${Math.random()}`;

function MenuAddonsPage() {
  const access = useAccess("menu");
  const store = useStore();
  const [draft, setDraft] = useState<AddonGroup | null>(null);

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

  const menuAddonGroups = useMemo(
    () => store.addonGroups.filter((g) => g.menuId === viewMenuId),
    [store.addonGroups, viewMenuId],
  );

  return (
    <Page>
      <PageHeader
        icon={PlusCircle}
        title="Addons"
        description="Addon groups attach to items and add their price on top of the line total."
        actions={
          <Button hidden={!access.create} onClick={() => setDraft(blankGroup(viewMenuId))}>
            <Plus className="size-4" /> New addon group
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

      <div className="grid gap-4 lg:grid-cols-2">
        {menuAddonGroups.map((g) => {
          const items = store.menuItems.filter((i) => (i.addonGroupIds ?? []).includes(g.id));
          return (
            <SectionCard
              key={g.id}
              title={g.name}
              description={`${g.selection} select · min ${g.min}, max ${g.max}`}
              bodyClassName="p-3 sm:p-4"
              actions={
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setDraft({ ...g })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    hidden={!access.delete}
                    size="sm"
                    variant="ghost"
                    disabled={items.length > 0}
                    title={
                      items.length > 0
                        ? `Attached to ${items.length} item(s) — remove it from those items first`
                        : "Delete addon group"
                    }
                    onClick={() => store.removeAddonGroup(g.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              }
            >
              <ul className="divide-y divide-border">
                {g.options.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{o.name}</span>
                    <Money value={o.price} className="font-medium" />
                  </li>
                ))}
                {g.options.length ? null : (
                  <li className="py-2 text-sm text-muted-foreground">No options yet.</li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {items.length ? (
                  items.map((i) => (
                    <span
                      key={i.id}
                      className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium"
                    >
                      {i.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not attached to any item yet.
                  </span>
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit addon group" : "New addon group"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Group name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Extra Toppings"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Selection</Label>
                  <Select
                    value={draft.selection}
                    onValueChange={(v) =>
                      setDraft({ ...draft, selection: v as AddonGroup["selection"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single">Single</SelectItem>
                      <SelectItem value="Multiple">Multiple</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Min</Label>
                  <Input
                    type="number"
                    value={draft.min}
                    onChange={(e) => setDraft({ ...draft, min: Number(e.target.value || 0) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max</Label>
                  <Input
                    type="number"
                    value={draft.max}
                    onChange={(e) => setDraft({ ...draft, max: Number(e.target.value || 0) })}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Options</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        options: [...draft.options, { id: newOptionId(), name: "", price: 0 }],
                      })
                    }
                  >
                    <Plus className="size-4" /> Option
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {draft.options.map((o, i) => (
                    <div key={o.id} className="grid grid-cols-[1fr_100px_auto] gap-2">
                      <Input
                        value={o.name}
                        placeholder="Option name"
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            options: draft.options.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Input
                        type="number"
                        value={o.price}
                        placeholder="₹"
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            options: draft.options.map((x, j) =>
                              j === i ? { ...x, price: Number(e.target.value || 0) } : x,
                            ),
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {draft.options.length ? null : (
                    <p className="text-xs text-muted-foreground">Add at least one option.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
              disabled={
                !(draft?.id ? access.edit : access.create) ||
                !draft?.name.trim() ||
                !draft.options.length
              }
              onClick={() => {
                if (!draft) return;
                store.upsertAddonGroup(draft);
                setDraft(null);
              }}
            >
              Save group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
