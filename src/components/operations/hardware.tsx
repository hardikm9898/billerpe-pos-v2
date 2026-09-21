import { FieldError, useFormCheck } from "@/lib/formCheck";
import { Link } from "@tanstack/react-router";
import { ChefHat, Plus, Printer as PrinterIcon, TestTube2, Trash2, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, localPrinterApi, localPrintApi, type RawLocalPrinter } from "@/lib/api";

import { DataTable, EmptyState, SectionCard, StatCard, StatusBadge } from "@/components/kit";
import { AssignmentSummary, ChipSelect, Notice, Toolbar } from "@/components/operations/shared";
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
import type { Kitchen, OpsOrderType, Printer } from "@/mock/types";

const ORDER_TYPES: OpsOrderType[] = ["Dine-in", "Pickup"];

// Mirrors store.tsx's own (unexported) PRINTER_SIZE_TO_BACKEND - same three
// values, kept local here rather than exported/shared since this is the
// only other place that needs to send a paper size code to the EXE.
const PRINTER_SIZE_TO_BACKEND: Record<NonNullable<Printer["size"]>, "2" | "3" | "4"> = {
  "58mm": "2",
  "80mm": "3",
  A4: "4",
};

/* =============== Kitchens =============== */

const emptyKitchen = (): Kitchen => ({
  id: "",
  name: "",
  menuCategoryIds: [],
  tableIds: [],
  orderTypes: ["Dine-in", "Pickup"],
});

export function KitchenSection() {
  const store = useStore();
  const [draft, setDraft] = useState<Kitchen | null>(null);
  const kForm = useFormCheck();
  const kFormOpen = !!draft;
  const kFormReset = kForm.reset;
  useEffect(() => {
    if (!kFormOpen) kFormReset();
  }, [kFormOpen, kFormReset]);

  const mcName = (id: string) => store.menuCategories.find((c) => c.id === id)?.name ?? id;
  const tblName = (id: string) => {
    const t = store.tables.find((x) => x.id === id);
    if (!t) return id;
    const cat = store.tableCategories.find((c) => c.id === t.categoryId)?.name ?? "";
    return `${cat} ${t.name}`.trim();
  };

  const unassigned = store.menuCategories.filter(
    (c) => !store.kitchens.some((k) => k.menuCategoryIds.includes(c.id)),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <div>
          <p className="text-sm font-semibold">Kitchen Display (KDS)</p>
          <p className="text-xs text-muted-foreground">
            The live KOT queue kitchen staff work from - not a regular POS screen, so it's reached
            from here rather than the main sidebar.
          </p>
        </div>
        {store.can("kds", "view") ? (
          <Button asChild>
            <Link to="/kds">
              <ChefHat className="size-4" /> Open Kitchen Display
            </Link>
          </Button>
        ) : null}
      </div>

      <Notice tone="info" title="A kitchen is a destination, not a device">
        When a KOT is generated, the item's menu category is matched against these kitchens to
        decide which KDS screen it appears on. A category with no match routes to the default
        kitchen —{" "}
        <span className="font-semibold">
          {store.kitchens.find((k) => k.isDefault)?.name ?? store.kitchens[0]?.name ?? "none set"}
        </span>
        .
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Kitchens" value={String(store.kitchens.length)} tone="primary" />
        <StatCard
          label="Categories routed"
          value={String(store.menuCategories.length - unassigned.length)}
        />
        <StatCard
          label="Unrouted categories"
          value={String(unassigned.length)}
          tone={unassigned.length ? "warning" : "default"}
          hint={
            unassigned.length
              ? unassigned.map((c) => c.name).join(", ")
              : "Every category has a kitchen"
          }
        />
      </div>

      {unassigned.length ? (
        <Notice
          tone="warning"
          title={`${unassigned.length} menu categories are not assigned to any kitchen`}
        >
          KOTs for {unassigned.map((c) => c.name).join(", ")} will automatically route to the
          default kitchen — no manual step needed.
        </Notice>
      ) : null}

      <SectionCard title="Kitchens" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyKitchen())}>
              <Plus className="size-4" /> Add kitchen
            </Button>
          }
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {store.kitchens.map((k) => (
            <div key={k.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-lg bg-warning-soft text-warning">
                    <Utensils className="size-4" />
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {k.name}
                      {k.isDefault ? (
                        <span className="rounded-lg bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{k.orderTypes.join(" · ")}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {!k.isDefault ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => store.setDefaultKitchen(k.id)}
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setDraft(k)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => store.removeKitchen(k.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                    Menu categories
                  </p>
                  <AssignmentSummary
                    items={k.menuCategoryIds.map(mcName)}
                    fallback="All categories"
                  />
                </div>
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                    Tables
                  </p>
                  <AssignmentSummary items={k.tableIds.map(tblName)} fallback="All tables" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit kitchen" : "Add kitchen"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Kitchen name</Label>
                <Input
                  {...kForm.fieldProps("name")}
                  value={draft.name}
                  placeholder="Tandoor Section"
                  disabled={!!draft.id}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <FieldError message={kForm.error("name")} />
                {draft.id ? (
                  <p className="text-xs text-muted-foreground">
                    Can't be renamed after creation — the backend has no endpoint for it.
                  </p>
                ) : null}
              </div>
              <ChipSelect
                label="Order types"
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
              />
              <ChipSelect
                label="Menu categories"
                hint="Items in these categories print to this kitchen."
                options={store.menuCategories.map((c) => ({ id: c.id, name: c.name }))}
                selected={draft.menuCategoryIds}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    menuCategoryIds: draft.menuCategoryIds.includes(id)
                      ? draft.menuCategoryIds.filter((x) => x !== id)
                      : [...draft.menuCategoryIds, id],
                  })
                }
                allLabel="All categories"
              />
              <ChipSelect
                label="Tables"
                hint="Leave empty to serve every table."
                options={store.tables.map((t) => ({ id: t.id, name: tblName(t.id) }))}
                selected={draft.tableIds}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    tableIds: draft.tableIds.includes(id)
                      ? draft.tableIds.filter((x) => x !== id)
                      : [...draft.tableIds, id],
                  })
                }
                allLabel="All tables"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft) return;
                const taken =
                  !draft.id &&
                  store.kitchens.some(
                    (k) => k.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
                  );
                const valid = kForm.check([
                  {
                    key: "name",
                    label: "Kitchen name",
                    value: draft.name,
                    valid: (v) => !!String(v ?? "").trim() && !taken,
                    message: taken
                      ? "A kitchen with this name already exists"
                      : "Kitchen name is required",
                  },
                ]);
                if (!valid) return;
                if (await store.upsertKitchen(draft)) setDraft(null);
              }}
            >
              Save kitchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =============== Printers =============== */

const emptyPrinter = (): Printer => ({
  id: "",
  name: "",
  type: "Thermal 80mm",
  connection: "LAN",
  role: "KOT",
  categories: [],
  status: "Ready",
  size: "80mm",
  copies: 1,
  printType: "KOT",
  orderTypes: ["Dine-in", "Pickup"],
  tableIds: [],
});

export function PrinterSection() {
  const store = useStore();
  const [draft, setDraft] = useState<Printer | null>(null);
  const pForm = useFormCheck();
  const pFormOpen = !!draft;
  const pFormReset = pForm.reset;
  useEffect(() => {
    if (!pFormOpen) pFormReset();
  }, [pFormOpen, pFormReset]);

  // Real Windows printers installed on this PC, fetched from the EXE only
  // while the dialog is actually open - this is ephemeral "what's plugged
  // in right now" data, not something worth holding in the global store.
  // Empty/failed fetch (EXE unreachable, or no printers found) just falls
  // back to the free-text input below rather than blocking the dialog.
  const [localPrinters, setLocalPrinters] = useState<RawLocalPrinter[]>([]);
  useEffect(() => {
    if (!draft) return;
    void localPrinterApi
      .getAll()
      .then(({ printers }) => setLocalPrinters(printers))
      .catch(() => setLocalPrinters([]));
  }, [draft !== null]);

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Printers resolve the KOT that kitchens routed">
        Kitchen settings decide which station owns an item; printer settings decide which physical
        device the ticket comes out of. A category not assigned to any KOT printer routes to the
        default printer —{" "}
        <span className="font-semibold">
          {store.printers.find((p) => p.isDefault)?.name ?? "none set"}
        </span>
        .
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Printers" value={String(store.printers.length)} tone="primary" />
        <StatCard
          label="Ready"
          value={String(store.printers.filter((p) => p.status === "Ready").length)}
        />
        <StatCard
          label="Needs attention"
          value={String(store.printers.filter((p) => p.status !== "Ready").length)}
          tone={store.printers.some((p) => p.status !== "Ready") ? "warning" : "default"}
        />
      </div>

      <SectionCard title="Configured printers" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyPrinter())}>
              <Plus className="size-4" /> Add printer
            </Button>
          }
        />
        <DataTable
          rows={store.printers}
          keyFn={(p) => p.id}
          empty={
            <EmptyState
              icon={PrinterIcon}
              title="No printers"
              description="Add a printer to route KOTs and bills."
            />
          }
          columns={[
            {
              key: "name",
              header: "Printer",
              cell: (p) => (
                <div>
                  <p className="flex items-center gap-1.5 font-medium">
                    {p.name}
                    {p.isDefault ? (
                      <span className="rounded-lg bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.type} · {p.connection} · {p.size ?? "80mm"}
                  </p>
                </div>
              ),
            },
            { key: "role", header: "Prints", cell: (p) => p.printType ?? p.role },
            { key: "copies", header: "Copies", cell: (p) => p.copies ?? 1 },
            {
              key: "cats",
              header: "Categories",
              cell: (p) => <AssignmentSummary items={p.categories} />,
            },
            {
              key: "orders",
              header: "Order types",
              cell: (p) =>
                !p.orderTypes || p.orderTypes.length === 2 ? "All" : p.orderTypes.join(", "),
            },
            { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
            {
              key: "act",
              header: "",
              cell: (p) => (
                <div className="flex gap-1.5">
                  {p.role !== "Bill" && !p.isDefault ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => store.setDefaultKotPrinter(p.id)}
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (p.status !== "Ready") {
                        toast.error("Printer not ready", {
                          description: `${p.name} · ${p.status}`,
                        });
                        return;
                      }
                      void localPrintApi
                        .testPrint({
                          printerName: p.name,
                          printerSize: PRINTER_SIZE_TO_BACKEND[p.size ?? "80mm"],
                        })
                        .then(() => toast.success("Test print sent", { description: p.name }))
                        .catch((err) =>
                          toast.error(
                            err instanceof ApiError ? err.message : "Could not send test print",
                            { description: p.name },
                          ),
                        );
                    }}
                  >
                    <TestTube2 className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => store.removePrinter(p.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            },
          ]}
          mobileCard={(p) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.type} · {p.connection} · {p.printType ?? p.role}
                </p>
              </div>
              <StatusBadge status={p.status} />
            </div>
          )}
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit printer" : "Add printer"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label required>Printer name</Label>
                  {localPrinters.length > 0 ? (
                    <Select
                      value={
                        localPrinters.some((p) => p.name === draft.name) ? draft.name : "__custom__"
                      }
                      onValueChange={(v) => {
                        if (v !== "__custom__") setDraft({ ...draft, name: v });
                        pForm.clearError("name");
                      }}
                    >
                      <SelectTrigger
                        data-field={
                          localPrinters.some((p) => p.name === draft.name) ? "name" : undefined
                        }
                        aria-invalid={!!pForm.error("name") || undefined}
                      >
                        <SelectValue placeholder="Select an installed printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {localPrinters.map((p) => (
                          <SelectItem key={p.deviceId} value={p.name}>
                            {p.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Other (type manually)…</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {localPrinters.length === 0 ||
                  !localPrinters.some((p) => p.name === draft.name) ? (
                    <Input
                      {...pForm.fieldProps("name")}
                      className="mt-1.5"
                      value={draft.name}
                      placeholder="Tandoor KOT"
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  ) : null}
                  <FieldError message={pForm.error("name")} />
                  {localPrinters.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Couldn't load installed printers from the Local Server - the name must match
                      exactly what Windows shows for this printer.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label>Paper size</Label>
                  <Select
                    value={draft.size ?? "80mm"}
                    onValueChange={(v) => setDraft({ ...draft, size: v as Printer["size"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80mm">80 mm</SelectItem>
                      <SelectItem value="58mm">58 mm</SelectItem>
                      <SelectItem value="A4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label required>Copies</Label>
                  <Input
                    {...pForm.fieldProps("copies")}
                    type="number"
                    min={1}
                    value={draft.copies ?? 1}
                    onChange={(e) => setDraft({ ...draft, copies: Number(e.target.value) })}
                  />
                  <FieldError message={pForm.error("copies")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prints</Label>
                  <Select
                    value={draft.printType ?? "KOT"}
                    onValueChange={(v) =>
                      setDraft({
                        ...draft,
                        printType: v as Printer["printType"],
                        role: v === "Invoice" ? "Bill" : "KOT",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KOT">Kitchen ticket</SelectItem>
                      <SelectItem value="Invoice">Customer invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Connection</Label>
                  <Select
                    value={draft.connection}
                    onValueChange={(v) =>
                      setDraft({ ...draft, connection: v as Printer["connection"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LAN">LAN</SelectItem>
                      <SelectItem value="USB">USB</SelectItem>
                      <SelectItem value="Bluetooth">Bluetooth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <ChipSelect
                label="Order types"
                options={ORDER_TYPES.map((o) => ({ id: o, name: o }))}
                selected={draft.orderTypes ?? []}
                onToggle={(id) => {
                  const cur = draft.orderTypes ?? [];
                  setDraft({
                    ...draft,
                    orderTypes: cur.includes(id as OpsOrderType)
                      ? cur.filter((x) => x !== id)
                      : [...cur, id as OpsOrderType],
                  });
                }}
              />
              <ChipSelect
                label="Menu categories"
                hint="Only relevant for kitchen tickets. Leave empty for all."
                options={store.menuCategories.map((c) => ({ id: c.name, name: c.name }))}
                selected={draft.categories}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    categories: draft.categories.includes(id)
                      ? draft.categories.filter((x) => x !== id)
                      : [...draft.categories, id],
                  })
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Pass draft.id through as-is (empty string for a new
                // printer, from emptyPrinter()) - upsertPrinter's own
                // `if (!pr.id)` check decides create vs. edit from that.
                // Pre-filling a placeholder id here (as this used to do)
                // made every new printer look like an edit to that check,
                // so it always took the update path with Number("pr-...")
                // -> NaN -> a null id sent to the backend, which correctly
                // reported "Printer Not Found" for every single add.
                if (!draft) return;
                const valid = pForm.check([
                  {
                    key: "name",
                    label: "Printer name",
                    value: draft.name,
                    message: "Choose or type the printer name",
                  },
                  {
                    key: "copies",
                    label: "Copies",
                    value: draft.copies ?? 1,
                    valid: (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 10,
                    message: "Copies must be a whole number from 1 to 10",
                  },
                ]);
                if (!valid) return;
                void store.upsertPrinter(draft).then((ok) => {
                  if (ok) setDraft(null);
                });
              }}
            >
              Save printer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
