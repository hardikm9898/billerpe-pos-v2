import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  FileUp,
  Image as ImageIcon,
  Plus,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  BulkActionsBar,
  DataTable,
  EmptyState,
  Money,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { menuApi, type RawProductImage } from "@/lib/api";
import { downloadTextFile, parseCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { MenuDietary, MenuItem, VariantOption } from "@/mock/types";

interface ImportRow {
  idx: number;
  name: string;
  categoryName: string;
  price: number;
  sku?: string;
  veg: boolean;
  active: boolean;
  isNewCategory: boolean;
  error?: string;
}

const CSV_TEMPLATE_HEADERS = ["Name", "Category", "Price", "SKU", "Veg", "Active"];
const CSV_TEMPLATE_SAMPLE = [
  ["Paneer Tikka", "Punjabi Mains", "260", "PT01", "Yes", "Yes"],
  ["Egg Fry", "Starters", "180", "", "No", "Yes"],
];

function parseImportRows(text: string, existingCategories: { name: string }[]): ImportRow[] {
  const table = parseCsv(text);
  const dataRows = table.slice(1); // skip header
  const knownCategoryNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const seenNewCategoryNames = new Set<string>();
  return dataRows.map(
    ([name = "", category = "", price = "", sku = "", veg = "", active = ""], idx) => {
      const priceNum = Number(price.trim());
      const categoryName = category.trim();
      const lower = categoryName.toLowerCase();
      const isNewCategory =
        categoryName.length > 0 &&
        !knownCategoryNames.has(lower) &&
        !seenNewCategoryNames.has(lower);
      if (isNewCategory) seenNewCategoryNames.add(lower);
      let error: string | undefined;
      if (!name.trim()) error = "Missing name";
      else if (!categoryName) error = "Missing category";
      else if (!price.trim() || Number.isNaN(priceNum) || priceNum <= 0) error = "Invalid price";
      return {
        idx,
        name: name.trim(),
        categoryName,
        price: priceNum,
        sku: sku.trim() || undefined,
        veg: veg.trim().toLowerCase() !== "no",
        active: active.trim().toLowerCase() !== "no",
        isNewCategory,
        error,
      };
    },
  );
}

export const Route = createFileRoute("/_shell/menu/items")({
  head: () => ({
    meta: [
      { title: "Menu Items · BillerPe" },
      {
        name: "description",
        content: "Manage dishes, prices, variants and availability.",
      },
      { property: "og:title", content: "Menu Items · BillerPe" },
      {
        property: "og:description",
        content: "Manage dishes, prices and variants in BillerPe.",
      },
    ],
  }),
  component: MenuItemsPage,
});

const dietaryOptions: MenuDietary[] = ["Regular Veg", "Jain", "Non-Veg", "Vegan", "Swaminarayan"];

const newRowId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v-${Date.now()}-${Math.random()}`;

function MenuItemsPage() {
  const access = useAccess("menu");
  const store = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [draft, setDraft] = useState<MenuItem | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const importing = importProgress !== null;
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

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
  const viewMenu = store.menus.find((m) => m.id === viewMenuId);

  const categoriesById = useMemo(
    () => new Map(store.menuCategories.map((c) => [c.id, c])),
    [store.menuCategories],
  );
  const menuCategories = useMemo(
    () => store.menuCategories.filter((c) => c.menuId === viewMenuId),
    [store.menuCategories, viewMenuId],
  );
  const menuAddonGroups = useMemo(
    () => store.addonGroups.filter((g) => g.menuId === viewMenuId),
    [store.addonGroups, viewMenuId],
  );
  const menuVariantMasters = useMemo(
    () => store.variantMasters.filter((v) => v.menuId === viewMenuId),
    [store.variantMasters, viewMenuId],
  );

  const rows = useMemo(
    () =>
      store.menuItems
        .filter((i) => categoriesById.get(i.categoryId)?.menuId === viewMenuId)
        .filter((i) => cat === "all" || i.categoryId === cat)
        .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())),
    [store.menuItems, categoriesById, viewMenuId, cat, q],
  );
  const paged = usePagedRows(rows, 10);

  useEffect(() => setSelected([]), [q, cat]);
  useEffect(() => {
    setCat("all");
    setSelected([]);
  }, [viewMenuId]);

  const pageIds = paged.pageRows.map((i) => i.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggleAllOnPage = () =>
    setSelected((prev) =>
      allPageSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : [...new Set([...prev, ...pageIds])],
    );
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const catName = (id: string) => categoriesById.get(id)?.name ?? "—";

  const newItem = (): MenuItem => ({
    id: "",
    name: "",
    categoryId: menuCategories[0]?.id ?? "",
    price: 0,
    favourite: false,
    active: true,
    veg: true,
    dietary: "Regular Veg",
  });

  const variantRows = draft?.variants ?? [];
  const addonIds = draft?.addonGroupIds ?? [];

  const exportMenuCsv = () => {
    const menuLabel = viewMenu?.name ?? "Menu";
    const csvRows = store.menuItems
      .filter((i) => categoriesById.get(i.categoryId)?.menuId === viewMenuId)
      .filter((i) => i.active)
      .map((i) => [
        i.name,
        catName(i.categoryId),
        i.price,
        i.sku ?? "",
        i.veg ? "Yes" : "No",
        i.active ? "Yes" : "No",
      ]);
    downloadTextFile(
      `${menuLabel.toLowerCase().replace(/\s+/g, "-")}-items.csv`,
      toCsv([CSV_TEMPLATE_HEADERS, ...csvRows]),
    );
  };

  return (
    <Page>
      <PageHeader
        icon={UtensilsCrossed}
        title="Menu Items"
        description="Price, variants and availability for every dish on the biller grid. Kitchen routing is set by category in Operations."
        actions={
          <>
            <Button variant="outline" onClick={exportMenuCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button
              hidden={!access.create}
              variant="outline"
              onClick={() => {
                setImportRows([]);
                setImportOpen(true);
              }}
            >
              <FileUp className="size-4" /> Import CSV
            </Button>
            <Button
              hidden={!access.create}
              disabled={!menuCategories.length}
              title={
                menuCategories.length
                  ? undefined
                  : "Create a category for this menu first (Menu Categories page)"
              }
              onClick={() => setDraft(newItem())}
            >
              <Plus className="size-4" /> New item
            </Button>
          </>
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
          <p className="text-xs text-muted-foreground">
            Each menu owns its own categories, items, addons and variants — nothing shown here is
            shared with other menus.
          </p>
        </div>
      </SectionCard>

      <SectionCard bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items"
              className="pl-9"
            />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {menuCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3">
          <BulkActionsBar count={selected.length} onClear={() => setSelected([])}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                store.setMenuItemsActive(selected, true);
                setSelected([]);
              }}
            >
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                store.setMenuItemsActive(selected, false);
                setSelected([]);
              }}
            >
              Deactivate
            </Button>
            <Button
              hidden={!access.delete}
              size="sm"
              variant="outline"
              className="text-primary"
              onClick={() => {
                store.removeMenuItems(selected);
                setSelected([]);
              }}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </BulkActionsBar>

          <DataTable
            rows={paged.pageRows}
            keyFn={(i) => i.id}
            onRowClick={(i) => setDraft({ ...i })}
            empty={
              <EmptyState
                icon={UtensilsCrossed}
                title={menuCategories.length ? "No items match" : "This menu has no categories yet"}
                compact
              />
            }
            columns={[
              {
                key: "sel",
                header: (
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleAllOnPage}
                    aria-label="Select all on this page"
                  />
                ),
                cell: (i) => (
                  <Checkbox
                    checked={selected.includes(i.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleOne(i.id)}
                  />
                ),
              },
              {
                key: "name",
                header: "Item",
                cell: (i) => (
                  <div className="flex items-center gap-2">
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        alt=""
                        className="size-7 shrink-0 rounded-md object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-[3px] border-2 p-0.5",
                        i.veg ? "border-success" : "border-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "block size-full rounded-full",
                          i.veg ? "bg-success" : "bg-primary",
                        )}
                      />
                    </span>
                    <span className="font-medium">{i.name}</span>
                    {i.favourite ? <Star className="size-3.5 fill-warning text-warning" /> : null}
                  </div>
                ),
              },
              { key: "cat", header: "Category", cell: (i) => catName(i.categoryId) },
              {
                key: "kitchen",
                header: "Kitchen",
                cell: (i) => store.resolveKitchenForCategory(i.categoryId)?.name ?? "—",
              },
              {
                key: "variants",
                header: "Variants",
                cell: (i) => (i.variants?.length ? `${i.variants.length}` : "—"),
              },
              {
                key: "price",
                header: "Price",
                cell: (i) => <Money value={i.price} />,
              },
              {
                key: "status",
                header: "Active",
                cell: (i) => (
                  <Switch
                    checked={i.active}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={(v) => store.upsertMenuItem({ ...i, active: v })}
                  />
                ),
              },
            ]}
            mobileCard={(i) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {catName(i.categoryId)} ·{" "}
                    {store.resolveKitchenForCategory(i.categoryId)?.name ?? "—"}
                  </p>
                </div>
                <div className="text-right">
                  <Money value={i.price} className="font-semibold" />
                  <div className="mt-1">
                    <Switch
                      checked={i.active}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(v) => store.upsertMenuItem({ ...i, active: v })}
                    />
                  </div>
                </div>
              </div>
            )}
          />
          <TablePager {...paged} onPageChange={paged.setPage} />
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Item name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Paneer Tikka"
                />
              </div>
              {/* Kitchen routing follows the category (Operations -> Kitchen
                  Settings), so there is no Kitchen field on the item. */}
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={draft.categoryId}
                    onValueChange={(v) => setDraft({ ...draft, categoryId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {menuCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Base price (₹)</Label>
                  <Input
                    type="number"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dietary type</Label>
                  <Select
                    value={draft.dietary ?? (draft.veg ? "Regular Veg" : "Non-Veg")}
                    onValueChange={(v) => setDraft({ ...draft, dietary: v as MenuDietary })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dietaryOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>SKU (optional)</Label>
                  <Input
                    value={draft.sku ?? ""}
                    onChange={(e) => setDraft({ ...draft, sku: e.target.value.slice(0, 5) })}
                    maxLength={5}
                    placeholder="e.g. PT260"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Barcode (optional)</Label>
                  <Input
                    value={draft.barcode ?? ""}
                    onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Shown on the digital menu and guest-facing screens."
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Image (optional)</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" onClick={() => setImagePickerOpen(true)}>
                    <ImageIcon className="size-4" /> Select image
                  </Button>
                  {draft.imageUrl ? (
                    <div className="relative">
                      <img
                        src={draft.imageUrl}
                        alt=""
                        className="size-11 shrink-0 rounded-lg border border-border object-cover"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Remove image"
                        onClick={() => setDraft({ ...draft, imageUrl: undefined })}
                        className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["Favourite", "favourite"],
                    ["Active", "active"],
                  ] as const
                ).map(([label, key]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <Switch
                      checked={draft[key]}
                      onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Variants for this item</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!menuVariantMasters.length}
                    onClick={() => {
                      const master = menuVariantMasters[0];
                      if (!master) return;
                      setDraft({
                        ...draft,
                        variants: [
                          ...variantRows,
                          {
                            id: newRowId(),
                            name: master.name,
                            price: master.price,
                            menuId: viewMenuId,
                          },
                        ],
                      });
                    }}
                  >
                    <Plus className="size-4" /> Variant
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {variantRows.map((row, i) => (
                    <div key={row.id} className="grid grid-cols-[1fr_100px_auto] gap-2">
                      <Select
                        value={row.name}
                        onValueChange={(v) => {
                          const master = menuVariantMasters.find((m) => m.name === v);
                          const updated: VariantOption[] = variantRows.map((x, j) =>
                            j === i ? { ...x, name: v, price: master?.price ?? x.price } : x,
                          );
                          setDraft({ ...draft, variants: updated });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Variant" />
                        </SelectTrigger>
                        <SelectContent>
                          {menuVariantMasters.map((m) => (
                            <SelectItem key={m.id} value={m.name}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={row.price}
                        onChange={(e) => {
                          const price = Number(e.target.value || 0);
                          const updated = variantRows.map((x, j) =>
                            j === i ? { ...x, price } : x,
                          );
                          setDraft({ ...draft, variants: updated });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({ ...draft, variants: variantRows.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {variantRows.length ? null : (
                    <p className="text-xs text-muted-foreground">
                      No variants attached. Add one from the variant master.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">Addon groups for this item</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {menuAddonGroups.map((g) => {
                    const on = addonIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            addonGroupIds: on
                              ? addonIds.filter((id) => id !== g.id)
                              : [...addonIds, g.id],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                  {menuAddonGroups.length ? null : (
                    <p className="text-xs text-muted-foreground">
                      No addon groups exist yet for this menu.
                    </p>
                  )}
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
                onClick={() => {
                  store.removeMenuItem(draft.id);
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
                disabled={
                  !(draft?.id ? access.edit : access.create) ||
                  !draft?.name.trim() ||
                  !draft?.categoryId
                }
                onClick={() => {
                  if (!draft) return;
                  store.upsertMenuItem({
                    ...draft,
                    veg: draft.dietary ? draft.dietary !== "Non-Veg" : draft.veg,
                  });
                  setDraft(null);
                }}
              >
                Save item
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (importing) return; // block closing while an import is in flight
          setImportOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
          onInteractOutside={(e) => {
            if (importing) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (importing) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Import items into {viewMenu?.name ?? "this menu"}</DialogTitle>
            <DialogDescription>
              Download the template, fill it in Excel or Sheets, save as CSV, then upload it here.
              Items and any new categories are added only to {viewMenu?.name ?? "this menu"}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() =>
                downloadTextFile(
                  "menu-items-template.csv",
                  toCsv([CSV_TEMPLATE_HEADERS, ...CSV_TEMPLATE_SAMPLE]),
                )
              }
            >
              <Download className="size-4" /> Download template
            </Button>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="max-w-xs"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const text = String(reader.result ?? "");
                  setImportRows(parseImportRows(text, menuCategories));
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </div>

          {importProgress ? (
            <div className="space-y-1.5">
              <Progress
                value={
                  importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0
                }
              />
              <p className="text-xs text-muted-foreground">
                Importing {importProgress.done} of {importProgress.total} item(s)… keep this dialog
                open until it finishes.
              </p>
            </div>
          ) : importRows.length ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {importRows.filter((r) => !r.error).length} of {importRows.length} row(s) ready to
                import
                {importRows.some((r) => r.isNewCategory)
                  ? ` · ${new Set(importRows.filter((r) => r.isNewCategory).map((r) => r.categoryName.toLowerCase())).size} new categor${new Set(importRows.filter((r) => r.isNewCategory).map((r) => r.categoryName.toLowerCase())).size === 1 ? "y" : "ies"} will be created`
                  : ""}
              </p>
              <DataTable
                rows={importRows}
                keyFn={(r) => String(r.idx)}
                columns={[
                  { key: "name", header: "Name", cell: (r) => r.name || "—" },
                  {
                    key: "cat",
                    header: "Category",
                    cell: (r) => (
                      <span className="flex items-center gap-1.5">
                        {r.categoryName || "—"}
                        {r.isNewCategory ? (
                          <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            New
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: "price",
                    header: "Price",
                    cell: (r) => (r.price ? <Money value={r.price} /> : "—"),
                  },
                  { key: "sku", header: "SKU", cell: (r) => r.sku ?? "—" },
                  { key: "veg", header: "Veg", cell: (r) => (r.veg ? "Veg" : "Non-Veg") },
                  {
                    key: "status",
                    header: "Status",
                    cell: (r) =>
                      r.error ? (
                        <span className="text-xs font-medium text-primary">{r.error}</span>
                      ) : (
                        <StatusBadge status="Active" />
                      ),
                  },
                ]}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={importing} onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={importing || !importRows.some((r) => !r.error)}
              onClick={async () => {
                const valid = importRows.filter((r) => !r.error);
                setImportProgress({ done: 0, total: valid.length });
                try {
                  await store.bulkImportMenuItems(valid, viewMenuId, (done, total) =>
                    setImportProgress({ done, total }),
                  );
                } finally {
                  setImportProgress(null);
                  setImportOpen(false);
                  setImportRows([]);
                }
              }}
            >
              {importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : `Import ${importRows.filter((r) => !r.error).length || ""} item(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        onSelect={(url) => {
          if (!draft) return;
          setDraft({ ...draft, imageUrl: url });
        }}
      />
    </Page>
  );
}

// Same "search a shared photo library" facility the legacy system's own
// Menu Item form had (uat-frontend's Menu.js) - GET /getProductImages/
// reads a shared, cloud-curated stock-image catalogue (hms_image_mst, no
// hotel_id), not a per-item file upload. There's no upload endpoint or
// large-enough column anywhere in this backend for real device photo
// upload (foodImage is a VARCHAR(255)) - this replicates the working
// legacy facility rather than building a new upload feature.
function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [images, setImages] = useState<RawProductImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setImages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    menuApi
      .getProductImages(debounced)
      .then(({ data }) => {
        if (!cancelled) setImages(data);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select image</DialogTitle>
          <DialogDescription>Search a shared photo library by dish name.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Pizza, Burger, Sushi"
        />
        <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
          {loading ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : images.length ? (
            images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  onSelect(img.url);
                  onOpenChange(false);
                }}
                title={img.name}
                className="aspect-square overflow-hidden rounded-lg border border-border transition hover:border-primary"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            ))
          ) : (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {search ? "No matching images found." : "Type a food name to see image suggestions."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
