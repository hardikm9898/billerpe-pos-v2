import { ChevronDown, Package, Pencil, Plus, Ruler, Truck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { DataTable, EmptyState, Money, SectionCard, StatCard } from "@/components/kit";
import {
  ConversionChip,
  DualQty,
  FieldRow,
  HealthBar,
  HealthPill,
  Toolbar,
  fmtQty,
  healthOf,
} from "@/components/stock/shared";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/mock/store";
import type { RawMaterial, SemiFinished, StockUnit, Supplier } from "@/mock/types";

const blankMaterial = (): RawMaterial => ({
  id: "",
  name: "",
  unit: "gm",
  purchaseUnit: "kg",
  conversion: 1000,
  stock: 0,
  reorderLevel: 0,
  rate: 0,
  category: "Grocery",
  minStockEnabled: true,
});

export function RawMaterialsScreen() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<RawMaterial | null>(null);

  const rows = useMemo(
    () =>
      store.rawMaterials.filter((m) =>
        `${m.name} ${m.category}`.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [store.rawMaterials, q],
  );

  const unitOptions = store.units.map((u) => u.shortName);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Materials" value={store.rawMaterials.length} icon={Package} />
        <StatCard
          label="Stock value"
          value={
            <Money
              value={Math.round(store.rawMaterials.reduce((s, m) => s + m.stock * m.rate, 0))}
            />
          }
          tone="primary"
        />
        <StatCard
          label="Below minimum"
          value={store.rawMaterials.filter((m) => m.stock <= m.reorderLevel).length}
          tone="warning"
        />
        <StatCard
          label="Dual-unit items"
          value={store.rawMaterials.filter((m) => m.unit !== m.purchaseUnit).length}
          hint="Purchase unit differs from consumption unit"
        />
      </div>

      <SectionCard
        title="Raw material master"
        description="Purchase unit, consumption unit and conversion drive every downstream screen"
        actions={
          <Button size="sm" onClick={() => setDraft(blankMaterial())}>
            <Plus className="size-4" /> Add material
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <Toolbar value={q} onChange={setQ} placeholder="Search material or category…" />
        <DataTable
          rows={rows}
          keyFn={(m) => m.id}
          empty={
            <EmptyState
              icon={Package}
              title="No material matches"
              description="Try a different search, or add the material to the master."
              compact
            />
          }
          columns={[
            {
              key: "name",
              header: "Material",
              cell: (m) => (
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.category}</p>
                </div>
              ),
            },
            { key: "conv", header: "Conversion", cell: (m) => <ConversionChip m={m} /> },
            {
              key: "stock",
              header: "In stock",
              cell: (m) => (
                <div className="min-w-[120px] space-y-1.5">
                  <DualQty m={m} />
                  <HealthBar stock={m.stock} reorder={m.reorderLevel} />
                </div>
              ),
            },
            {
              key: "min",
              header: "Minimum",
              cell: (m) => (
                <span className="num text-sm">
                  {fmtQty(m.reorderLevel)} {m.unit}
                </span>
              ),
            },
            {
              key: "cost",
              header: "Avg cost",
              cell: (m) => (
                <div className="leading-tight">
                  <Money value={Math.round(m.rate * m.conversion * 100) / 100} />
                  <p className="text-[11px] text-muted-foreground">per {m.purchaseUnit}</p>
                </div>
              ),
            },
            {
              key: "value",
              header: "Value",
              cell: (m) => <Money value={Math.round(m.stock * m.rate)} className="font-semibold" />,
            },
            {
              key: "health",
              header: "Health",
              cell: (m) => <HealthPill health={healthOf(m.stock, m.reorderLevel)} />,
            },
            {
              key: "edit",
              header: "",
              cell: (m) => (
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...m })}>
                  <Pencil className="size-4" />
                </Button>
              ),
            },
          ]}
          mobileCard={(m) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.category}</p>
                </div>
                <HealthPill health={healthOf(m.stock, m.reorderLevel)} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <DualQty m={m} />
                <Money value={Math.round(m.stock * m.rate)} className="font-semibold" />
              </div>
              <HealthBar stock={m.stock} reorder={m.reorderLevel} />
              <div className="flex items-center justify-between">
                <ConversionChip m={m} />
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...m })}>
                  <Pencil className="size-4" /> Edit
                </Button>
              </div>
            </div>
          )}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit material" : "Add raw material"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3">
              <FieldRow label="Material name">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Paneer"
                />
              </FieldRow>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Category">
                  <Input
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="Purchase price (per purchase unit)">
                  <Input
                    type="number"
                    value={Math.round(draft.rate * draft.conversion * 100) / 100}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rate: Number(e.target.value || 0) / (draft.conversion || 1),
                      })
                    }
                  />
                </FieldRow>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Purchase unit">
                  <Select
                    value={draft.purchaseUnit}
                    onValueChange={(v) => setDraft({ ...draft, purchaseUnit: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Consumption unit">
                  <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>
              <AnimatePresence initial={false}>
                {draft.unit !== draft.purchaseUnit ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <FieldRow label={`Conversion — 1 ${draft.purchaseUnit} equals`}>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={draft.conversion}
                          onChange={(e) =>
                            setDraft({ ...draft, conversion: Number(e.target.value || 1) })
                          }
                        />
                        <span className="text-sm text-muted-foreground">{draft.unit}</span>
                      </div>
                    </FieldRow>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="rounded-xl border border-border bg-surface-muted/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Minimum stock level</p>
                    <p className="text-xs text-muted-foreground">
                      Drives low-stock alerts on the dashboard
                    </p>
                  </div>
                  <Switch
                    checked={draft.minStockEnabled ?? draft.reorderLevel > 0}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, minStockEnabled: v, reorderLevel: v ? draft.reorderLevel : 0 })
                    }
                  />
                </div>
                {(draft.minStockEnabled ?? draft.reorderLevel > 0) ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      value={draft.reorderLevel}
                      onChange={(e) =>
                        setDraft({ ...draft, reorderLevel: Number(e.target.value || 0) })
                      }
                    />
                    <span className="text-sm text-muted-foreground">{draft.unit}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft?.name.trim()) return;
                store.upsertRawMaterial(draft);
                setDraft(null);
              }}
            >
              Save material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UnitsScreen() {
  const store = useStore();
  const [draft, setDraft] = useState<StockUnit | null>(null);
  const usage = (short: string) =>
    store.rawMaterials.filter((m) => m.unit === short || m.purchaseUnit === short).length;

  return (
    <>
      <SectionCard
        title="Unit master"
        description="Units of measure referenced by materials, purchases, recipes and wastage"
        actions={
          <Button size="sm" onClick={() => setDraft({ id: "", unitName: "", shortName: "" })}>
            <Plus className="size-4" /> Add unit
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <DataTable
          rows={store.units}
          keyFn={(u) => u.id}
          columns={[
            {
              key: "name",
              header: "Unit",
              cell: (u) => <span className="font-medium">{u.unitName}</span>,
            },
            {
              key: "short",
              header: "Short name",
              cell: (u) => (
                <span className="num rounded-md bg-surface-muted px-2 py-1 text-xs font-medium">
                  {u.shortName}
                </span>
              ),
            },
            {
              key: "use",
              header: "Used by",
              cell: (u) => (
                <span className="text-sm text-muted-foreground">
                  {usage(u.shortName)} material{usage(u.shortName) === 1 ? "" : "s"}
                </span>
              ),
            },
            {
              key: "edit",
              header: "",
              cell: (u) => (
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...u })}>
                  <Pencil className="size-4" />
                </Button>
              ),
            },
          ]}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit unit" : "Add unit"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3">
              <FieldRow label="Unit name">
                <Input
                  value={draft.unitName}
                  onChange={(e) => setDraft({ ...draft, unitName: e.target.value })}
                  placeholder="Kilogram"
                />
              </FieldRow>
              <FieldRow label="Short name">
                <Input
                  value={draft.shortName}
                  onChange={(e) => setDraft({ ...draft, shortName: e.target.value })}
                  placeholder="kg"
                />
              </FieldRow>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft?.unitName.trim() || !draft.shortName.trim()) return;
                store.upsertUnit(draft);
                setDraft(null);
              }}
            >
              Save unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SuppliersScreen() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Supplier | null>(null);

  const rows = store.suppliers.filter((s) =>
    `${s.name} ${s.contact} ${s.gstin}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const poCount = (id: string) =>
    store.purchaseOrders.filter((p) => p.supplierId === id && p.status !== "Cancelled").length;
  const purchased = (id: string) =>
    store.purchaseOrders
      .filter((p) => p.supplierId === id && p.status !== "Cancelled")
      .reduce((s, p) => s + store.poTotals(p).grand, 0);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Suppliers" value={store.suppliers.length} icon={Truck} />
        <StatCard
          label="Total outstanding"
          value={<Money value={store.suppliers.reduce((s, x) => s + x.outstanding, 0)} />}
          tone="warning"
        />
        <StatCard
          label="Purchases recorded"
          value={<Money value={Math.round(store.suppliers.reduce((s, x) => s + purchased(x.id), 0))} />}
        />
      </div>

      <SectionCard
        title="Supplier master"
        actions={
          <Button
            size="sm"
            onClick={() =>
              setDraft({ id: "", name: "", contact: "", phone: "", gstin: "", outstanding: 0 })
            }
          >
            <Plus className="size-4" /> Add supplier
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <Toolbar value={q} onChange={setQ} placeholder="Search supplier, contact or GSTIN…" />
        <DataTable
          rows={rows}
          keyFn={(s) => s.id}
          columns={[
            {
              key: "name",
              header: "Supplier",
              cell: (s) => (
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="num text-xs text-muted-foreground">{s.gstin}</p>
                </div>
              ),
            },
            {
              key: "contact",
              header: "Contact",
              cell: (s) => (
                <div className="leading-tight">
                  <p className="text-sm">{s.contact}</p>
                  <p className="num text-xs text-muted-foreground">{s.phone}</p>
                </div>
              ),
            },
            { key: "pos", header: "Orders", cell: (s) => <span className="num">{poCount(s.id)}</span> },
            {
              key: "purchased",
              header: "Purchased",
              cell: (s) => <Money value={Math.round(purchased(s.id))} />,
            },
            {
              key: "out",
              header: "Outstanding",
              cell: (s) => (
                <Money
                  value={s.outstanding}
                  className={s.outstanding ? "font-semibold text-primary" : "text-muted-foreground"}
                />
              ),
            },
            {
              key: "edit",
              header: "",
              cell: (s) => (
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...s })}>
                  <Pencil className="size-4" />
                </Button>
              ),
            },
          ]}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit supplier" : "Add supplier"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3">
              <FieldRow label="Supplier name">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FieldRow>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Contact person">
                  <Input
                    value={draft.contact}
                    onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="Phone">
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                </FieldRow>
              </div>
              <FieldRow label="GSTIN">
                <Input
                  value={draft.gstin}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
                />
              </FieldRow>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft?.name.trim()) return;
                store.upsertSupplier(draft);
                setDraft(null);
              }}
            >
              Save supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const blankSemi = (): SemiFinished => ({
  id: "",
  name: "",
  unit: "kg",
  batchQty: 1,
  stock: 0,
  components: [],
  minStock: 0,
});

export function SemiFinishedScreen() {
  const store = useStore();
  const [draft, setDraft] = useState<SemiFinished | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <SectionCard
        title="Semi-finished items"
        description="Each item has its own BOM in raw materials and its own tracked stock"
        actions={
          <Button size="sm" onClick={() => setDraft(blankSemi())}>
            <Plus className="size-4" /> Add item
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        {store.semiFinished.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {store.semiFinished.map((sf) => {
              const cost = store.semiUnitCost(sf.id);
              const open = expanded === sf.id;
              return (
                <div key={sf.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{sf.name}</p>
                      <p className="num mt-0.5 text-xs text-muted-foreground">
                        {fmtQty(sf.stock)} {sf.unit} in stock · cost ₹
                        {(Math.round(cost * 100) / 100).toLocaleString("en-IN")} / {sf.unit}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ ...sf })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(open ? null : sf.id)}
                        aria-label="Toggle BOM"
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                          {sf.components.map((c) => {
                            const m = store.rawMaterials.find((x) => x.id === c.materialId);
                            return (
                              <li
                                key={c.materialId}
                                className="flex items-center justify-between text-xs"
                              >
                                <span>{m?.name ?? "—"}</span>
                                <span className="num text-muted-foreground">
                                  {fmtQty(c.qty)} {m?.unit} / {sf.unit}
                                </span>
                              </li>
                            );
                          })}
                          {sf.components.length ? null : (
                            <li className="text-xs text-muted-foreground">No BOM defined yet.</li>
                          )}
                        </ul>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Ruler}
            title="No semi-finished items"
            description="Define a prep item to unlock the two-level bill of materials."
            compact
          />
        )}
      </SectionCard>

      <SemiEditor draft={draft} setDraft={setDraft} />
    </>
  );
}

export function SemiEditor({
  draft,
  setDraft,
}: {
  draft: SemiFinished | null;
  setDraft: (v: SemiFinished | null) => void;
}) {
  const store = useStore();
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit semi-finished item" : "Add semi-finished item"}</DialogTitle>
        </DialogHeader>
        {draft ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <FieldRow label="Item name">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Onion-Tomato Masala Base"
                  />
                </FieldRow>
              </div>
              <FieldRow label="Unit">
                <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {store.units.map((u) => (
                      <SelectItem key={u.id} value={u.shortName}>
                        {u.shortName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="Suggested batch size">
                <Input
                  type="number"
                  value={draft.batchQty}
                  onChange={(e) => setDraft({ ...draft, batchQty: Number(e.target.value || 1) })}
                />
              </FieldRow>
              <FieldRow label="Minimum stock">
                <Input
                  type="number"
                  value={draft.minStock ?? 0}
                  onChange={(e) => setDraft({ ...draft, minStock: Number(e.target.value || 0) })}
                />
              </FieldRow>
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">BOM — to produce 1 {draft.unit}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      components: [
                        ...draft.components,
                        { materialId: store.rawMaterials[0]?.id ?? "", qty: 0 },
                      ],
                    })
                  }
                >
                  <Plus className="size-4" /> Ingredient
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {draft.components.map((c, i) => {
                  const m = store.rawMaterials.find((x) => x.id === c.materialId);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_130px_auto]">
                      <Select
                        value={c.materialId}
                        onValueChange={(v) =>
                          setDraft({
                            ...draft,
                            components: draft.components.map((x, j) =>
                              j === i ? { ...x, materialId: v } : x,
                            ),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Raw material" />
                        </SelectTrigger>
                        <SelectContent>
                          {store.rawMaterials.map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={c.qty}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              components: draft.components.map((x, j) =>
                                j === i ? { ...x, qty: Number(e.target.value || 0) } : x,
                              ),
                            })
                          }
                        />
                        <span className="w-8 text-xs text-muted-foreground">{m?.unit}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            components: draft.components.filter((_, j) => j !== i),
                          })
                        }
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
                {draft.components.length ? null : (
                  <p className="text-xs text-muted-foreground">
                    Add the raw materials consumed to produce one unit.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          {draft?.id ? (
            <Button
              variant="outline"
              onClick={() => {
                store.removeSemiFinished(draft.id);
                setDraft(null);
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!draft?.name.trim()) return;
              store.upsertSemiFinished(draft);
              setDraft(null);
            }}
          >
            Save item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SemiNotes() {
  return <Textarea className="hidden" readOnly value="" />;
}
