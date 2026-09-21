import { FieldError, isMobile10, useFormCheck } from "@/lib/formCheck";
import {
  Download,
  Grid2X2,
  Keyboard,
  LayoutGrid,
  List,
  Plus,
  QrCode,
  Rows3,
  Search,
  UserRound,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Notice, Toolbar } from "@/components/operations/shared";
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
import { ApiError, hotelApi, qrOrderApi } from "@/lib/api";
import { encryptHotelId, encryptQrPayload, qrBaseUrl } from "@/lib/publicMenu";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { Customer, OrderType } from "@/mock/types";

/* =============== Display =============== */

export function DisplaySection() {
  const store = useStore();
  const mode = store.displayMode;

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Display decides the whole shape of the billing screen">
        Keyboard mode is built for fast typists using item codes. Touch mode shows a tappable item
        grid — and only touch mode is affected by the Menu Setting screen.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            key: "Keyboard" as const,
            icon: Keyboard,
            title: "Keyboard billing",
            desc: "Search-and-type entry. Fastest for high-volume counters with trained cashiers.",
            bullets: [
              "Item code search bar",
              "Keyboard shortcuts for qty and discount",
              "Menu Setting has no effect",
            ],
          },
          {
            key: "Touch" as const,
            icon: Grid2X2,
            title: "Touch billing",
            desc: "Category tabs with a tappable item grid. Better for tablets and new staff.",
            bullets: [
              "Category tabs and item tiles",
              "Tap to add, long-press for variants",
              "Menu Setting controls images",
            ],
          },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => store.setDisplayMode(opt.key)}
            className={cn(
              "rounded-2xl border p-5 text-left transition-all",
              mode === opt.key
                ? "border-primary bg-primary-soft/40 shadow-card"
                : "border-border bg-surface hover:border-primary/40",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl",
                  mode === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-muted text-muted-foreground",
                )}
              >
                <opt.icon className="size-5" />
              </span>
              {mode === opt.key ? <StatusBadge status="Active" /> : null}
            </div>
            <p className="mt-3 text-base font-semibold">{opt.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{opt.desc}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {opt.bullets.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <SectionCard title="Preview" bodyClassName="p-3 sm:p-4">
        {mode === "Keyboard" ? (
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
              <Search className="size-4" /> Type item code or name…
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <div className="rounded-lg bg-surface px-3 py-2">101 · Gujarati Thali — ₹280</div>
              <div className="rounded-lg bg-surface px-3 py-2">204 · Paneer Tikka — ₹320</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Gujarati Thali", "Paneer Tikka", "Butter Naan", "Masala Chai"].map((n) => (
              <div key={n} className="rounded-xl border border-border bg-surface p-2 text-center">
                {store.menuImages ? (
                  <div className="mb-2 h-16 rounded-lg bg-surface-muted" />
                ) : null}
                <p className="truncate text-xs font-medium">{n}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Keyboard-only billing"
        description="For counters that never use a floor plan — pickup-only or delivery-only setups."
        bodyClassName="p-3 sm:p-4"
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Only use Keyboard Billing</p>
            <p className="text-xs text-muted-foreground">
              Hides Biller (Table Grid) from the sidebar. Keyboard Billing gets its own table picker
              and a "New order" action, so staff never need the floor plan.
            </p>
          </div>
          <Switch checked={store.keyboardOnly} onCheckedChange={store.setKeyboardOnly} />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Default order type for new orders
          </Label>
          <Select
            value={store.defaultOrderType}
            onValueChange={(v) => store.setDefaultOrderType(v as OrderType)}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dine In">Dine In</SelectItem>
              <SelectItem value="Pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used by Keyboard Billing's "New order" action and by any counter that doesn't pick a
            type explicitly.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Table Grid Layout"
        description="Clients settle on different floor-view habits — pick the one your staff already knows"
        bodyClassName="p-3 sm:p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: "Tabs" as const,
              icon: LayoutGrid,
              title: "Tabs",
              desc: "Section tabs at the top switch a single table grid below.",
            },
            {
              key: "Sections" as const,
              icon: Rows3,
              title: "Sections",
              desc: "Every section's name and tables are stacked and visible at once.",
            },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => store.setTableGridView(opt.key)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                store.tableGridView === opt.key
                  ? "border-primary bg-primary-soft/40 shadow-card"
                  : "border-border bg-surface hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-lg",
                    store.tableGridView === opt.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  <opt.icon className="size-4" />
                </span>
                {store.tableGridView === opt.key ? <StatusBadge status="Active" /> : null}
              </div>
              <p className="mt-2.5 text-sm font-semibold">{opt.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* =============== Menu setting =============== */

export function MenuSettingSection() {
  const store = useStore();
  const touch = store.displayMode === "Touch";

  return (
    <div className="space-y-4">
      {touch ? (
        <Notice tone="success" title="Touch billing is active, so this setting applies" />
      ) : (
        <Notice tone="warning" title="This terminal is in Keyboard billing mode">
          Menu presentation only changes the touch item grid. Switch Display to Touch for this
          setting to have any effect.
        </Notice>
      )}

      <SectionCard title="Item grid presentation" bodyClassName="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Show item images</p>
            <p className="text-xs text-muted-foreground">
              Images help new staff; the text list fits far more items per screen.
            </p>
          </div>
          <Switch checked={store.menuImages} onCheckedChange={store.setMenuImages} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            className={cn(
              "rounded-xl border p-3",
              store.menuImages ? "border-primary" : "border-border",
            )}
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Grid2X2 className="size-3.5" /> Image grid
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-lg border border-border p-1.5">
                  <div className="mb-1 h-10 rounded bg-surface-muted" />
                  <div className="h-2 w-3/4 rounded bg-surface-muted" />
                </div>
              ))}
            </div>
          </div>
          <div
            className={cn(
              "rounded-xl border p-3",
              !store.menuImages ? "border-primary" : "border-border",
            )}
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <List className="size-3.5" /> Compact list
            </p>
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="h-5 rounded bg-surface-muted" />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* =============== QR code =============== */

// Real, working QR menu link/code - ported from the old BillerPe
// (POS/uat-frontend's DownloadQrCode.js). This used to be a pure mock
// (a fabricated menu.billerpe.app URL, a static QrCode glyph, a "Download"
// that only toasted success with no real file) - confirmed live there was
// no actual QR-menu page behind it at all. src/routes/qr-menu.tsx is that
// real page now; this section just points a real QR at it. `id` (the raw
// numeric hotel_id) has to come from a fresh hotelApi.getSettings() call,
// not RESTAURANT (mock/data.ts's seed) - the encrypted id has to match the
// real backend's Hotel row or menuByCategory 404s on scan.
export function QrSection() {
  const store = useStore();
  const [hotelId, setHotelId] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableQrDataUrl, setTableQrDataUrl] = useState<string | null>(null);
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);

  useEffect(() => {
    void hotelApi
      .getSettings()
      .then((s) => setHotelId(s.id))
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : "Could not load this outlet's QR link");
      });
  }, []);

  // Null when there is no safe public address to print (see qrBaseUrl) -
  // the UI below shows how to configure one instead of rendering a QR that
  // would resolve to the scanner's own phone.
  const qrBase = qrBaseUrl();
  const url = hotelId != null && qrBase ? `${qrBase}/qr-menu?${encryptHotelId(hotelId)}` : null;

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setQrDataUrl);
  }, [url]);

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${((store.restaurant?.name ?? store.serverHotelName ?? "") || "menu").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-menu-qr.png`;
    link.click();
    toast.success("QR downloaded as PNG");
  };

  // Per-table ordering QR - distinct from the restaurant-level menu-only
  // QR above. Encodes {hotelId, tableId, qrVersion} (encryptQrPayload)
  // rather than just the hotel id, so src/routes/qr-menu.tsx can tell the
  // two apart and only show cart/checkout when a real table is known.
  const selectedTable = selectedTableId ? store.tableById(selectedTableId) : undefined;
  const tableUrl =
    hotelId != null && selectedTable && qrBase
      ? `${qrBase}/qr-menu?${encryptQrPayload({
          hotelId,
          tableId: Number(selectedTable.id),
          qrVersion: selectedTable.qrVersion ?? 1,
        })}`
      : null;

  useEffect(() => {
    if (!tableUrl) {
      setTableQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(tableUrl, { width: 480, margin: 2 }).then(setTableQrDataUrl);
  }, [tableUrl]);

  const downloadTableQr = () => {
    if (!tableQrDataUrl || !selectedTable) return;
    const link = document.createElement("a");
    link.href = tableQrDataUrl;
    link.download = `${selectedTable.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-order-qr.png`;
    link.click();
    toast.success("QR downloaded as PNG");
  };

  // Bumps qr_version cloud-side (qrOrderApi.regenerateTableQr ->
  // billerpe-local-exe's cloudRelay -> uat-backend-v2), invalidating
  // every previously-printed/shared link for just this table - a leaked
  // QR photo can be neutralized without touching any other table.
  // loadTablesFromServer picks the new version back up on the next
  // config-sync pull; called directly here too so the dialog (if open on
  // this table) reflects it without waiting up to ~15s.
  const regenerateTableQr = async (tableId: string) => {
    setRegenBusyId(tableId);
    try {
      await qrOrderApi.regenerateTableQr(Number(tableId));
      await store.loadTablesFromServer();
      toast.success("This table's QR has been regenerated — the old one no longer works");
    } catch (err) {
      toast.error("Could not regenerate this table's QR", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setRegenBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Notice tone="info" title="This QR opens the digital menu, not a payment page">
        Guests scan it to browse the live menu. Payment QR codes are configured on the invoice
        footer in Invoice Format.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Digital menu link" bodyClassName="p-3 sm:p-4">
          <div className="space-y-1.5">
            <Label>Public menu URL</Label>
            <Input readOnly value={url ?? "Loading…"} className="font-mono text-xs" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The menu reflects whatever is active in the Menu module — categories, items, variants
            and addons — with no separate publishing step.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={downloadQr} disabled={!qrDataUrl}>
              <Download className="size-4" /> Download QR
            </Button>
            <Button
              variant="outline"
              disabled={!url}
              onClick={() => {
                if (!url) return;
                void navigator.clipboard?.writeText(url);
                toast.success("Menu link copied");
              }}
            >
              Copy link
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {store.menuCategories.filter((c) => c.active).length} active categories ·{" "}
            {store.menuItems.length} items published.
          </p>
        </SectionCard>

        <SectionCard title="Preview" bodyClassName="p-3 sm:p-4">
          <div className="mx-auto grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl border border-border bg-surface">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Menu QR code" className="size-full rounded-2xl p-3" />
            ) : (
              <QrCode className="size-32 text-muted-foreground" />
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {qrBase
              ? `Scan for ${store.restaurant?.name ?? store.serverHotelName ?? ""}`
              : "QR codes unavailable"}
          </p>
          {!qrBase ? (
            <p className="mt-2 text-center text-xs text-status-held-foreground">
              This POS is open on a local address (
              {typeof window !== "undefined" ? window.location.origin : ""}), which a
              customer&apos;s phone cannot reach. Set VITE_PUBLIC_QR_BASE_URL to your public site
              before printing QR codes.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Per-table ordering QR codes"
        description="Each table has its own QR - scanning it lets a guest order straight from their seat, subject to staff acceptance."
        bodyClassName="p-3 sm:p-4"
      >
        {store.tables.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No tables yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {store.tables.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">v{t.qrVersion ?? 1}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setSelectedTableId(t.id)}>
                    <QrCode className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={regenBusyId === t.id}
                    onClick={() => void regenerateTableQr(t.id)}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selectedTableId} onOpenChange={(o) => !o && setSelectedTableId(null)}>
        <DialogContent>
          {selectedTable ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTable.name} · ordering QR</DialogTitle>
              </DialogHeader>
              <div className="mx-auto grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl border border-border bg-surface">
                {tableQrDataUrl ? (
                  <img
                    src={tableQrDataUrl}
                    alt={`${selectedTable.name} QR code`}
                    className="size-full rounded-2xl p-3"
                  />
                ) : (
                  <QrCode className="size-32 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Order URL</Label>
                <Input readOnly value={tableUrl ?? "Loading…"} className="font-mono text-xs" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => void regenerateTableQr(selectedTable.id)}>
                  Regenerate
                </Button>
                <Button onClick={downloadTableQr} disabled={!tableQrDataUrl}>
                  <Download className="size-4" /> Download QR
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =============== Customer data =============== */

const emptyCustomer = (): Customer => ({
  id: "",
  name: "",
  phone: "",
  orders: 0,
  lastVisit: "—",
  active: true,
});

export function CustomerSection() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Customer | null>(null);
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return store.customers;
    return store.customers.filter((c) => c.name.toLowerCase().includes(t) || c.phone.includes(t));
  }, [q, store.customers]);
  const paged = usePagedRows(rows, 10);

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Typing a mobile number at billing autofills from this list">
        Name, GSTIN and address flow straight onto the invoice, so keeping GSTIN accurate matters
        for corporate guests.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Customers" value={String(store.customers.length)} tone="primary" />
        <StatCard
          label="With GSTIN"
          value={String(store.customers.filter((c) => c.gstin).length)}
        />
        <StatCard
          label="Repeat guests"
          value={String(store.customers.filter((c) => c.orders > 1).length)}
        />
      </div>

      <SectionCard title="Customer master" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyCustomer())}>
              <Plus className="size-4" /> Add customer
            </Button>
          }
        >
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name or mobile"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </Toolbar>

        <DataTable
          rows={paged.pageRows}
          keyFn={(c) => c.id}
          empty={
            <EmptyState
              icon={UserRound}
              title="No customers"
              description="No guest matches this search."
            />
          }
          columns={[
            {
              key: "name",
              header: "Customer",
              cell: (c) => <span className="font-medium">{c.name}</span>,
            },
            {
              key: "phone",
              header: "Mobile",
              cell: (c) => <span className="font-mono text-xs">{c.phone}</span>,
            },
            {
              key: "gstin",
              header: "GSTIN",
              cell: (c) => c.gstin ?? <span className="text-muted-foreground">—</span>,
            },
            {
              key: "address",
              header: "Address",
              cell: (c) => (
                <span className="line-clamp-1 text-muted-foreground">{c.address ?? "—"}</span>
              ),
            },
            { key: "orders", header: "Orders", cell: (c) => c.orders },
            { key: "last", header: "Last visit", cell: (c) => c.lastVisit },
            {
              key: "active",
              header: "Autofill",
              cell: (c) => (
                <Switch
                  checked={c.active !== false}
                  onCheckedChange={() => store.toggleCustomer(c.id)}
                />
              ),
            },
            {
              key: "act",
              header: "",
              cell: (c) => (
                <Button size="sm" variant="outline" onClick={() => setDraft(c)}>
                  Edit
                </Button>
              ),
            },
          ]}
          mobileCard={(c) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.phone}</p>
              </div>
              <StatusBadge status={c.active === false ? "Inactive" : "Active"} />
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit customer" : "Add customer"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label required>Name</Label>
                <Input
                  {...form.fieldProps("name")}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="space-y-1.5">
                <Label required>Mobile</Label>
                <Input
                  {...form.fieldProps("phone")}
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft({ ...draft, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                />
                <FieldError message={form.error("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN (optional)</Label>
                <Input
                  {...form.fieldProps("gstin")}
                  value={draft.gstin ?? ""}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
                />
                <FieldError message={form.error("gstin")} />
              </div>
              <div className="space-y-1.5">
                <Label>Address (optional)</Label>
                <Input
                  value={draft.address ?? ""}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft) return;
                const valid = form.check([
                  { key: "name", label: "Name", value: draft.name },
                  {
                    key: "phone",
                    label: "Mobile",
                    value: draft.phone,
                    valid: isMobile10,
                    message: "Enter a 10-digit mobile number",
                  },
                  {
                    key: "gstin",
                    label: "GSTIN",
                    value: draft.gstin,
                    valid: (v) =>
                      !String(v ?? "").trim() || /^[0-9A-Z]{15}$/i.test(String(v).trim()),
                    message: "GSTIN must be 15 letters/digits, or leave it blank",
                  },
                ]);
                if (!valid) return;
                if (await store.upsertCustomer(draft)) setDraft(null);
              }}
            >
              Save customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
