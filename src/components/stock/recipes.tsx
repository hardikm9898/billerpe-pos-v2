import { FieldError, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { ChefHat, CookingPot, Factory, Plus, Trash2, Utensils } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

import {
  DataTable,
  EmptyState,
  Money,
  SectionCard,
  StatCard,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { FieldRow, Toolbar, fmtQty } from "@/components/stock/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/mock/store";
import type { Recipe, RecipeGroup, RecipeLine } from "@/mock/types";

const emptyGroup = (kind: RecipeGroup["kind"], label: string): RecipeGroup => ({
  key: `${kind}-${Math.random().toString(36).slice(2, 7)}`,
  label,
  kind,
  lines: [],
});

/* ==================== Recipes / Menu BOM ==================== */

export function RecipesScreen() {
  const access = useAccess("stock-recipes");
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Recipe | null>(null);

  const groupsOf = (r: Recipe): RecipeGroup[] =>
    r.groups?.length
      ? r.groups
      : [
          {
            key: "base",
            label: "Base recipe",
            kind: "base",
            lines: r.components.map<RecipeLine>((c) => ({
              type: "raw",
              refId: c.materialId,
              qty: c.qty,
            })),
          },
        ];

  const recipeCost = (r: Recipe) =>
    groupsOf(r)
      .filter((g) => g.kind === "base")
      .reduce((s, g) => s + store.recipeGroupCost(g), 0);

  const priceOf = (r: Recipe) =>
    store.menuItems.find((m) => m.id === r.menuItemId)?.price ??
    store.menuItems.find((m) => m.name === r.itemName)?.price ??
    0;

  const rows = store.recipes.filter((r) =>
    r.itemName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const kpis = useMemo(() => {
    const linked = store.recipes.length;
    const missing = store.menuItems.filter(
      (m) => !store.recipes.some((r) => r.menuItemId === m.id || r.itemName === m.name),
    ).length;
    const margins = store.recipes
      .map((r) => {
        const p = priceOf(r);
        return p ? ((p - recipeCost(r)) / p) * 100 : null;
      })
      .filter((x): x is number => x !== null);
    const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    return { linked, missing, avg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.recipes, store.menuItems, store.rawMaterials, store.semiFinished]);

  const newRecipe = (): Recipe => ({
    id: "",
    itemName: "",
    yieldQty: 1,
    yieldUnit: "plate",
    components: [],
    groups: [emptyGroup("base", "Base recipe")],
  });

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Menu items costed" value={kpis.linked} icon={ChefHat} tone="primary" />
        <StatCard label="Menu items without a recipe" value={kpis.missing} tone="warning" />
        <StatCard label="Average gross margin" value={`${Math.round(kpis.avg)}%`} tone="success" />
      </div>

      <div className="mb-4 rounded-xl border border-dashed border-border bg-surface-muted/50 p-3 text-xs text-muted-foreground">
        A recipe can consume <span className="font-medium text-foreground">raw materials</span> and{" "}
        <span className="font-medium text-foreground">semi-finished items</span>. Variant and addon
        groups add their own ingredients on top of the base recipe, so a Full plate with extra gravy
        deducts more than a Half plate.
      </div>

      <SectionCard
        title="Recipes"
        actions={
          <Button hidden={!access.create} size="sm" onClick={() => setDraft(newRecipe())}>
            <Plus className="size-4" /> New recipe
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <Toolbar value={q} onChange={setQ} placeholder="Search dish…" />
        <DataTable
          rows={rows}
          keyFn={(r) => r.id}
          onRowClick={(r) => setDraft({ ...r, groups: groupsOf(r) })}
          empty={<EmptyState icon={ChefHat} title="No recipes yet" compact />}
          columns={[
            {
              key: "item",
              header: "Dish",
              cell: (r) => (
                <div>
                  <p className="font-medium">{r.itemName}</p>
                  <p className="num text-[11px] text-muted-foreground">
                    yields {fmtQty(r.yieldQty)} {r.yieldUnit}
                  </p>
                </div>
              ),
            },
            {
              key: "ing",
              header: "Ingredients",
              cell: (r) => (
                <span className="num text-sm">
                  {groupsOf(r).reduce((s, g) => s + g.lines.length, 0)}
                </span>
              ),
            },
            {
              key: "groups",
              header: "Groups",
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {groupsOf(r).map((g) => (
                    <span
                      key={g.key}
                      className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {g.kind}
                    </span>
                  ))}
                </div>
              ),
            },
            { key: "cost", header: "Base cost", cell: (r) => <Money value={recipeCost(r)} /> },
            {
              key: "price",
              header: "Menu price",
              cell: (r) => (priceOf(r) ? <Money value={priceOf(r)} /> : "—"),
            },
            {
              key: "margin",
              header: "Margin",
              cell: (r) => {
                const p = priceOf(r);
                if (!p) return <span className="text-xs text-muted-foreground">—</span>;
                const pct = Math.round(((p - recipeCost(r)) / p) * 100);
                return (
                  <span
                    className={`num text-sm font-semibold ${pct < 50 ? "text-warning" : "text-success"}`}
                  >
                    {pct}%
                  </span>
                );
              },
            },
          ]}
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.itemName}</p>
                <p className="text-xs text-muted-foreground">
                  {groupsOf(r).reduce((s, g) => s + g.lines.length, 0)} ingredients
                </p>
              </div>
              <Money value={recipeCost(r)} className="font-semibold" />
            </div>
          )}
        />
      </SectionCard>

      {draft ? <RecipeEditor draft={draft} setDraft={setDraft} /> : null}
    </>
  );
}

function RecipeEditor({
  draft,
  setDraft,
}: {
  draft: Recipe;
  setDraft: (r: Recipe | null) => void;
}) {
  const access = useAccess("stock-recipes");
  const store = useStore();
  const form = useFormCheck();
  const groups = draft.groups ?? [];
  // The dish's own variants and addons - a group is saved against one of them.
  const dish = store.menuItems.find((m) => m.id === draft?.menuItemId);
  const groupOptions = (kind: RecipeGroup["kind"]) =>
    kind === "variant"
      ? (dish?.variants ?? []).map((v) => ({ id: String(v.id), name: v.name }))
      : store.addonGroups
          .filter((ag) => (dish?.addonGroupIds ?? []).includes(ag.id))
          .flatMap((ag) => ag.options.map((o) => ({ id: String(o.id), name: o.name })));

  const setGroup = (key: string, patch: Partial<RecipeGroup>) =>
    setDraft({
      ...draft,
      groups: groups.map((g) => (g.key === key ? { ...g, ...patch } : g)),
    });

  const addLine = (key: string) => {
    const m = store.rawMaterials[0];
    if (!m) return;
    const g = groups.find((x) => x.key === key);
    if (!g) return;
    setGroup(key, { lines: [...g.lines, { type: "raw", refId: m.id, qty: 0.05 }] });
  };

  const lineUnit = (l: RecipeLine) =>
    l.type === "raw"
      ? (store.rawMaterials.find((m) => m.id === l.refId)?.unit ?? "")
      : (store.semiFinished.find((s) => s.id === l.refId)?.unit ?? "");

  const total = groups
    .filter((g) => g.kind === "base")
    .reduce((s, g) => s + store.recipeGroupCost(g), 0);

  const price =
    store.menuItems.find((m) => m.id === draft.menuItemId)?.price ??
    store.menuItems.find((m) => m.name === draft.itemName)?.price ??
    0;

  return (
    <Sheet open onOpenChange={(o) => !o && setDraft(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{draft.id ? draft.itemName : "New recipe"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-24">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Menu item" required error={form.error("menuItemId")}>
              <Select
                value={draft.menuItemId ?? ""}
                onValueChange={(v) => {
                  const mi = store.menuItems.find((m) => m.id === v);
                  setDraft({ ...draft, menuItemId: v, itemName: mi?.name ?? draft.itemName });
                  form.clearError("menuItemId");
                }}
              >
                <SelectTrigger
                  data-field="menuItemId"
                  aria-invalid={!!form.error("menuItemId") || undefined}
                >
                  <SelectValue placeholder="Link a dish" />
                </SelectTrigger>
                <SelectContent>
                  {store.menuItems.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Yield" required error={form.error("yieldQty")}>
              <div className="flex gap-2">
                <Input
                  {...form.fieldProps("yieldQty")}
                  aria-label="Yield quantity"
                  type="number"
                  min={0}
                  value={draft.yieldQty}
                  onChange={(e) => setDraft({ ...draft, yieldQty: Number(e.target.value || 1) })}
                />
                <Input
                  aria-label="Yield unit"
                  placeholder="e.g. plate"
                  value={draft.yieldUnit}
                  onChange={(e) => setDraft({ ...draft, yieldUnit: e.target.value })}
                />
              </div>
            </FieldRow>
          </div>

          {groups.map((g) => (
            <div key={g.key} className="rounded-xl border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.kind}
                  </span>
                  {g.kind === "base" ? (
                    <Input
                      aria-label="Group name"
                      value={g.label}
                      onChange={(e) => setGroup(g.key, { label: e.target.value })}
                      className="h-8 w-48"
                    />
                  ) : (
                    // Which variant / addon of this dish the group is for: its
                    // ingredients deduct when that variant or addon is sold.
                    <Select
                      value={g.refId ?? ""}
                      onValueChange={(v) => {
                        const opt = groupOptions(g.kind).find((o) => o.id === v);
                        setGroup(g.key, { refId: v, label: opt?.name ?? g.label });
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-48"
                        aria-label={g.kind === "variant" ? "Variant" : "Addon"}
                      >
                        <SelectValue
                          placeholder={g.kind === "variant" ? "Choose variant" : "Choose addon"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {groupOptions(g.kind).length ? (
                          groupOptions(g.kind).map((o) => (
                            <SelectItem
                              key={o.id}
                              value={o.id}
                              disabled={groups.some(
                                (x) => x.key !== g.key && x.kind === g.kind && x.refId === o.id,
                              )}
                            >
                              {o.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            {g.kind === "variant"
                              ? "This dish has no variants"
                              : "This dish has no addons"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Money value={store.recipeGroupCost(g)} className="text-sm font-semibold" />
                  <Button
                    size="sm"
                    variant="outline"
                    data-field={g.kind === "base" ? "base" : undefined}
                    onClick={() => {
                      addLine(g.key);
                      if (g.kind === "base") form.clearError("base");
                    }}
                  >
                    <Plus className="size-4" /> Ingredient
                  </Button>
                  {g.kind === "base" ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({ ...draft, groups: groups.filter((x) => x.key !== g.key) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2 p-3">
                {g.lines.map((l, i) => (
                  <div
                    key={i}
                    className="grid gap-2 sm:grid-cols-[110px_minmax(0,1.4fr)_120px_auto]"
                  >
                    <Select
                      value={l.type}
                      onValueChange={(v) => {
                        const type = v as RecipeLine["type"];
                        const refId =
                          type === "raw"
                            ? (store.rawMaterials[0]?.id ?? "")
                            : (store.semiFinished[0]?.id ?? "");
                        setGroup(g.key, {
                          lines: g.lines.map((x, j) => (j === i ? { ...x, type, refId } : x)),
                        });
                      }}
                    >
                      <SelectTrigger aria-label="Ingredient type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raw">Raw</SelectItem>
                        <SelectItem value="semi">Semi</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={l.refId}
                      onValueChange={(v) => {
                        setGroup(g.key, {
                          lines: g.lines.map((x, j) => (j === i ? { ...x, refId: v } : x)),
                        });
                        form.clearError(`ref-${g.key}-${i}`);
                      }}
                    >
                      <SelectTrigger
                        aria-label="Ingredient"
                        data-field={`ref-${g.key}-${i}`}
                        aria-invalid={!!form.error(`ref-${g.key}-${i}`) || undefined}
                      >
                        <SelectValue placeholder="Choose ingredient" />
                      </SelectTrigger>
                      <SelectContent>
                        {(l.type === "raw" ? store.rawMaterials : store.semiFinished).map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <Input
                        {...form.fieldProps(`qty-${g.key}-${i}`)}
                        aria-label="Quantity used"
                        type="number"
                        min={0}
                        step="0.001"
                        value={l.qty}
                        onChange={(e) =>
                          setGroup(g.key, {
                            lines: g.lines.map((x, j) =>
                              j === i ? { ...x, qty: Number(e.target.value || 0) } : x,
                            ),
                          })
                        }
                      />
                      <span className="w-10 text-[11px] text-muted-foreground">{lineUnit(l)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove ingredient"
                      title="Remove ingredient"
                      onClick={() => setGroup(g.key, { lines: g.lines.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    {form.error(`ref-${g.key}-${i}`) || form.error(`qty-${g.key}-${i}`) ? (
                      <p className="text-xs text-destructive sm:col-span-4">
                        {form.error(`ref-${g.key}-${i}`) ?? form.error(`qty-${g.key}-${i}`)}
                      </p>
                    ) : null}
                  </div>
                ))}
                {g.kind === "base" && form.error("base") ? (
                  <p className="text-xs text-destructive">{form.error("base")}</p>
                ) : null}
                {g.lines.length ? null : (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    No ingredients in this group yet.
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, groups: [...groups, emptyGroup("variant", "Variant")] })
              }
            >
              <Plus className="size-4" /> Variant group
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, groups: [...groups, emptyGroup("addon", "Addon")] })
              }
            >
              <Plus className="size-4" /> Addon group
            </Button>
          </div>

          <div className="rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Base plate cost</span>
              <Money value={total} className="font-semibold" />
            </div>
            {price ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Menu price</span>
                  <Money value={price} />
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-semibold">
                  <span>Gross margin</span>
                  <span
                    className={
                      ((price - total) / price) * 100 < 50 ? "text-warning" : "text-success"
                    }
                  >
                    {Math.round(((price - total) / price) * 100)}%
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-3">
          {draft.id ? (
            <Button
              hidden={!access.delete}
              variant="ghost"
              onClick={() => {
                store.removeRecipe(draft.id);
                setDraft(null);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : null}
          <Button variant="outline" className="flex-1" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            disabled={!(draft?.id ? access.edit : access.create)}
            title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
            className="flex-1"
            onClick={async () => {
              const base = (draft.groups ?? []).find((g) => g.kind === "base");
              const valid = form.check([
                {
                  key: "menuItemId",
                  label: "Menu item",
                  value: draft.menuItemId,
                  message: "Choose the dish this recipe is for",
                },
                {
                  key: "yieldQty",
                  label: "Yield",
                  value: draft.yieldQty,
                  valid: (v) => typeof v === "number" && v > 0,
                  message: "Yield must be more than 0",
                },
                {
                  key: "base",
                  label: "Ingredients",
                  value: base?.lines ?? [],
                  message: "Add at least one ingredient to the base recipe",
                },
                ...groups.flatMap((g) =>
                  g.lines.flatMap((l, i) => {
                    const known = (l.type === "raw" ? store.rawMaterials : store.semiFinished).some(
                      (o) => o.id === l.refId,
                    );
                    return [
                      {
                        key: `ref-${g.key}-${i}`,
                        label: `${g.label} ingredient ${i + 1}`,
                        value: known,
                        valid: (v: unknown) => v === true,
                        message: `${g.label}, line ${i + 1}: choose an ingredient`,
                      },
                      {
                        key: `qty-${g.key}-${i}`,
                        label: `${g.label} quantity ${i + 1}`,
                        value: l.qty,
                        valid: (v: unknown) => typeof v === "number" && v > 0,
                        message: `${g.label}, line ${i + 1}: quantity must be more than 0`,
                      },
                    ];
                  }),
                ),
              ]);
              if (!valid) return;
              const ok = await store.upsertRecipe({
                ...draft,
                components: (base?.lines ?? [])
                  .filter((l) => l.type === "raw")
                  .map((l) => ({ materialId: l.refId, qty: l.qty })),
              });
              if (ok) setDraft(null);
            }}
          >
            Save recipe
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ==================== Production ==================== */

export function ProductionScreen() {
  const access = useAccess("stock-transactions");
  const store = useStore();
  const [runFor, setRunFor] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState("");
  const prodForm = useFormCheck();
  const prodFormOpen = !!runFor;
  const prodFormReset = prodForm.reset;
  useEffect(() => {
    if (!prodFormOpen) prodFormReset();
  }, [prodFormOpen, prodFormReset]);

  const sf = store.semiFinished.find((s) => s.id === runFor);
  const unitCost = sf ? store.semiUnitCost(sf.id) : 0;

  const feasible = (id: string, wanted: number) => {
    const item = store.semiFinished.find((s) => s.id === id);
    if (!item) return [] as { name: string; need: number; have: number; unit: string }[];
    return item.components.map((c) => {
      const m = store.rawMaterials.find((x) => x.id === c.materialId);
      return {
        name: m?.name ?? "—",
        need: c.qty * wanted,
        have: m?.stock ?? 0,
        unit: m?.unit ?? "",
      };
    });
  };

  const shortages = sf ? feasible(sf.id, qty).filter((r) => r.need > r.have) : [];
  const paged = usePagedRows(store.productionRuns, 10);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Prep items tracked" value={store.semiFinished.length} icon={CookingPot} />
        <StatCard
          label="Production runs"
          value={store.productionRuns.length}
          icon={Factory}
          tone="info"
        />
        <StatCard
          label="Prep stock value"
          value={
            <Money
              value={Math.round(
                store.semiFinished.reduce((s, x) => s + x.stock * store.semiUnitCost(x.id), 0),
              )}
            />
          }
          tone="primary"
        />
      </div>

      <SectionCard title="Produce a batch" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {store.semiFinished.map((s) => {
            const low = s.minStock !== undefined && s.stock <= s.minStock;
            return (
              <div key={s.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="num text-xs text-muted-foreground">
                      {fmtQty(s.stock)} {s.unit} in stock · ₹{Math.round(store.semiUnitCost(s.id))}/
                      {s.unit}
                    </p>
                  </div>
                  {low ? (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                      Low
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  {s.components.slice(0, 4).map((c) => {
                    const m = store.rawMaterials.find((x) => x.id === c.materialId);
                    return (
                      <li key={c.materialId} className="flex justify-between">
                        <span>{m?.name}</span>
                        <span className="num">
                          {fmtQty(c.qty)} {m?.unit} / {s.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  hidden={!access.create}
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    setRunFor(s.id);
                    setQty(s.batchQty);
                    setNotes("");
                  }}
                >
                  <Factory className="size-4" /> Record production
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Production history" bodyClassName="p-3 sm:p-4" className="mt-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(r) => r.id}
          empty={<EmptyState icon={Factory} title="No production recorded" compact />}
          columns={[
            {
              key: "item",
              header: "Item",
              cell: (r) => (
                <span className="font-medium">
                  {store.semiFinished.find((s) => s.id === r.semiId)?.name ?? "—"}
                </span>
              ),
            },
            {
              key: "qty",
              header: "Produced",
              cell: (r) => (
                <span className="num">
                  {fmtQty(r.qty)} {store.semiFinished.find((s) => s.id === r.semiId)?.unit ?? ""}
                </span>
              ),
            },
            { key: "cost", header: "Cost", cell: (r) => <Money value={Math.round(r.cost)} /> },
            { key: "at", header: "When", cell: (r) => <span className="num">{r.at}</span> },
            { key: "by", header: "By", cell: (r) => r.by },
            {
              key: "notes",
              header: "Notes",
              cell: (r) => <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span>,
            },
          ]}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <Dialog open={!!sf} onOpenChange={(o) => !o && setRunFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Utensils className="size-4" /> {sf?.name}
            </DialogTitle>
          </DialogHeader>
          {sf ? (
            <div className="space-y-3">
              <FieldRow
                label={`Quantity produced (${sf.unit})`}
                required
                error={prodForm.error("qty")}
              >
                <Input
                  {...prodForm.fieldProps("qty")}
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value || 0))}
                />
              </FieldRow>
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Raw materials consumed
                </p>
                <ul className="space-y-1 text-sm">
                  {feasible(sf.id, qty).map((r) => (
                    <li key={r.name} className="flex items-center justify-between">
                      <span>{r.name}</span>
                      <span
                        className={`num text-xs ${r.need > r.have ? "font-semibold text-primary" : "text-muted-foreground"}`}
                      >
                        {fmtQty(r.need)} {r.unit} of {fmtQty(r.have)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Batch cost</span>
                  <Money value={Math.round(unitCost * qty)} />
                </div>
              </div>
              {shortages.length ? (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                  {shortages.length} material{shortages.length > 1 ? "s" : ""} short of the required
                  quantity. Stock will clamp at zero and the shortfall is flagged — negative stock
                  policy is still an open decision.
                </p>
              ) : null}
              <FieldRow label="Notes">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FieldRow>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunFor(null)}>
              Cancel
            </Button>
            <Button
              hidden={!access.create}
              onClick={async () => {
                if (!sf) return;
                const valid = prodForm.check([
                  {
                    key: "qty",
                    label: "Quantity produced",
                    value: qty,
                    valid: (v) => typeof v === "number" && v > 0,
                    message: "Quantity produced must be more than 0",
                  },
                ]);
                if (!valid) return;
                if (await store.recordProduction(sf.id, qty, notes)) setRunFor(null);
              }}
            >
              Record production
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
