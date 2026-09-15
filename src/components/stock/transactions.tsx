import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  History,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  IconButton,
  Money,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { DualQty, FieldRow, HealthBar, Toolbar, fmtQty, healthOf } from "@/components/stock/shared";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { todayLabel } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { PurchaseOrder, PurchaseLine } from "@/mock/types";

/* ==================== Purchase Orders ==================== */

export function PurchaseOrdersScreen() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  const supplierName = (id: string) => store.suppliers.find((s) => s.id === id)?.name ?? "—";
  const rows = store.purchaseOrders.filter((p) =>
    `${p.poNo} ${p.invoiceNo ?? ""} ${supplierName(p.supplierId)}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  const view = store.purchaseOrders.find((p) => p.id === viewId);
  const paged = usePagedRows(rows, 10);

  const kpis = useMemo(() => {
    const live = store.purchaseOrders.filter((p) => p.status !== "Cancelled");
    const value = live.reduce((s, p) => s + store.poTotals(p).grand, 0);
    const unpaid = live.reduce(
      (s, p) => s + Math.max(0, store.poTotals(p).grand - (p.paidAmount ?? 0)),
      0,
    );
    return { value, unpaid, open: live.filter((p) => p.status !== "Received").length };
  }, [store]);

  const nextPoNo = () =>
    `PO-2026-${String(
      Math.max(
        ...store.purchaseOrders
          .map((x) => Number(x.poNo.split("-").pop()))
          .filter((n) => !Number.isNaN(n)),
        0,
      ) + 1,
    ).padStart(3, "0")}`;

  const newDraft = (): PurchaseOrder => ({
    id: "",
    poNo: nextPoNo(),
    supplierId: store.suppliers[0]?.id ?? "",
    date: todayLabel,
    status: "Ordered",
    invoiceNo: "",
    gstin: store.suppliers[0]?.gstin ?? "",
    paymentStatus: "Unpaid",
    paidAmount: 0,
    discountType: "flat",
    discountValue: 0,
    lines: [],
  });

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Purchase value"
          value={<Money value={Math.round(kpis.value)} />}
          tone="primary"
        />
        <StatCard
          label="Unpaid to suppliers"
          value={<Money value={Math.round(kpis.unpaid)} />}
          tone="warning"
        />
        <StatCard label="Awaiting receipt" value={kpis.open} icon={PackageCheck} tone="info" />
        <StatCard label="Orders recorded" value={store.purchaseOrders.length} icon={ReceiptText} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Receiving a purchase updates</span>
        <span className="inline-flex items-center gap-1">
          Raw material stock <ArrowRight className="size-3" /> Average cost{" "}
          <ArrowRight className="size-3" /> Supplier outstanding <ArrowRight className="size-3" />{" "}
          Purchase report <ArrowRight className="size-3" /> Dashboard
        </span>
      </div>

      <SectionCard
        title="Purchase orders"
        actions={
          <Button size="sm" onClick={() => setDraft(newDraft())}>
            <Plus className="size-4" /> Create order
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <Toolbar value={q} onChange={setQ} placeholder="Search PO, invoice or supplier…" />
        <DataTable
          rows={paged.pageRows}
          keyFn={(p) => p.id}
          onRowClick={(p) => setViewId(p.id)}
          empty={<EmptyState icon={ReceiptText} title="No purchase orders" compact />}
          columns={[
            {
              key: "po",
              header: "Order",
              cell: (p) => (
                <div>
                  <p className="num font-medium">{p.poNo}</p>
                  <p className="num text-xs text-muted-foreground">
                    {p.date}
                    {p.invoiceNo ? ` · ${p.invoiceNo}` : ""}
                  </p>
                </div>
              ),
            },
            { key: "supplier", header: "Supplier", cell: (p) => supplierName(p.supplierId) },
            {
              key: "items",
              header: "Items",
              cell: (p) => <span className="num text-sm">{p.lines.length}</span>,
            },
            {
              key: "value",
              header: "Grand total",
              cell: (p) => <Money value={store.poTotals(p).grand} className="font-semibold" />,
            },
            {
              key: "due",
              header: "Due",
              cell: (p) => {
                const due = Math.max(0, store.poTotals(p).grand - (p.paidAmount ?? 0));
                return due ? (
                  <Money value={due} className="font-medium text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground">Settled</span>
                );
              },
            },
            { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
            {
              key: "action",
              header: "",
              cell: (p) =>
                p.status === "Received" || p.status === "Cancelled" ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.savePurchase(p, { receive: true });
                    }}
                  >
                    <PackageCheck className="size-4" /> Receive
                  </Button>
                ),
            },
          ]}
          mobileCard={(p) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="num font-medium">{p.poNo}</p>
                  <p className="text-xs text-muted-foreground">{supplierName(p.supplierId)}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="num text-xs text-muted-foreground">{p.date}</span>
                <Money value={store.poTotals(p).grand} className="font-semibold" />
              </div>
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>

      {/* invoice view */}
      <Sheet open={!!view} onOpenChange={(o) => !o && setViewId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {view ? (
            <>
              <SheetHeader>
                <SheetTitle className="num">{view.poNo}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-muted/50 p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p className="font-medium">{supplierName(view.supplierId)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice</p>
                    <p className="num font-medium">{view.invoiceNo || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="num font-medium">{view.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GSTIN</p>
                    <p className="num font-medium">{view.gstin || "—"}</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.lines.map((l) => {
                        const m = store.rawMaterials.find((x) => x.id === l.materialId);
                        return (
                          <tr key={l.materialId} className="border-t border-border/70">
                            <td className="px-3 py-2">
                              <p className="font-medium">{m?.name}</p>
                              <p className="num text-[11px] text-muted-foreground">
                                {fmtQty(l.qty * (m?.conversion ?? 1))} {m?.unit} received
                              </p>
                            </td>
                            <td className="num px-3 py-2">
                              {l.qty} {m?.purchaseUnit}
                            </td>
                            <td className="num px-3 py-2">₹{l.rate}</td>
                            <td className="num px-3 py-2 text-right">
                              ₹{(l.qty * l.rate).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <TotalsPanel po={view} />

                <div className="flex flex-wrap gap-2">
                  {view.status !== "Received" && view.status !== "Cancelled" ? (
                    <Button onClick={() => store.savePurchase(view, { receive: true })}>
                      <PackageCheck className="size-4" /> Receive into stock
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDraft({ ...view })}>
                    Edit order
                  </Button>
                  {Math.max(0, store.poTotals(view).grand - (view.paidAmount ?? 0)) > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPayFor(view);
                        setPayAmount(
                          Math.round(store.poTotals(view).grand - (view.paidAmount ?? 0)),
                        );
                      }}
                    >
                      Record payment
                    </Button>
                  ) : null}
                  {view.status !== "Cancelled" ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        store.cancelPurchaseOrder(view.id);
                        setViewId(null);
                      }}
                    >
                      Cancel order
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <PurchaseEditor draft={draft} setDraft={setDraft} />

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <FieldRow label="Amount">
            <Input
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value || 0))}
            />
          </FieldRow>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (payFor && payAmount > 0) store.payPurchaseOrder(payFor.id, payAmount);
                setPayFor(null);
              }}
            >
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TotalsPanel({ po }: { po: PurchaseOrder }) {
  const store = useStore();
  const t = store.poTotals(po);
  const due = Math.max(0, t.grand - (po.paidAmount ?? 0));
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <Row label="Subtotal" value={t.subtotal} />
      <Row label="Tax (CGST + SGST)" value={t.tax} />
      <Row label="Discount" value={-t.discount} />
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
        <span>Grand total</span>
        <Money value={t.grand} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Paid ₹{(po.paidAmount ?? 0).toLocaleString("en-IN")}
        </span>
        <span className={due ? "font-semibold text-primary" : "text-success"}>
          {due ? `Due ₹${due.toLocaleString("en-IN")}` : "Fully paid"}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <Money value={value} />
    </div>
  );
}

function PurchaseEditor({
  draft,
  setDraft,
}: {
  draft: PurchaseOrder | null;
  setDraft: (v: PurchaseOrder | null) => void;
}) {
  const store = useStore();
  if (!draft) return null;

  const setLine = (i: number, patch: Partial<PurchaseLine>) =>
    setDraft({
      ...draft,
      lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    });

  const addLine = () => {
    const m = store.rawMaterials[0];
    if (!m) return;
    setDraft({
      ...draft,
      lines: [
        ...draft.lines,
        {
          materialId: m.id,
          qty: 1,
          rate: Math.round(m.rate * m.conversion * 100) / 100,
          taxPct: 5,
        },
      ],
    });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && setDraft(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {draft.id ? `Edit ${draft.poNo}` : `New purchase · ${draft.poNo}`}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-24">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Supplier">
              <Select
                value={draft.supplierId}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    supplierId: v,
                    gstin: store.suppliers.find((s) => s.id === v)?.gstin ?? "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent>
                  {store.suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Invoice number">
              <Input
                value={draft.invoiceNo ?? ""}
                onChange={(e) => setDraft({ ...draft, invoiceNo: e.target.value })}
              />
            </FieldRow>
            <FieldRow label="Invoice date">
              <Input
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </FieldRow>
            <FieldRow label="Supplier GSTIN">
              <Input
                value={draft.gstin ?? ""}
                onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
              />
            </FieldRow>
          </div>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Invoice lines</p>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="size-4" /> Add line
              </Button>
            </div>
            <div className="space-y-2 p-3">
              {draft.lines.map((l, i) => {
                const m = store.rawMaterials.find((x) => x.id === l.materialId);
                return (
                  <div key={i} className="rounded-xl border border-border bg-surface-muted/40 p-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_90px_100px_80px_auto]">
                      <Select
                        value={l.materialId}
                        onValueChange={(v) => {
                          const nm = store.rawMaterials.find((x) => x.id === v);
                          setLine(i, {
                            materialId: v,
                            rate: nm ? Math.round(nm.rate * nm.conversion * 100) / 100 : l.rate,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
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
                          value={l.qty}
                          onChange={(e) => setLine(i, { qty: Number(e.target.value || 0) })}
                        />
                        <span className="w-8 text-[11px] text-muted-foreground">
                          {m?.purchaseUnit}
                        </span>
                      </div>
                      <Input
                        type="number"
                        value={l.rate}
                        onChange={(e) => setLine(i, { rate: Number(e.target.value || 0) })}
                      />
                      <Select
                        value={String(l.taxPct ?? 0)}
                        onValueChange={(v) => setLine(i, { taxPct: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 5, 12, 18].map((t) => (
                            <SelectItem key={t} value={String(t)}>
                              {t}% GST
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {m ? (
                      <p className="num mt-1 px-1 text-[11px] text-muted-foreground">
                        Adds {fmtQty(l.qty * m.conversion)} {m.unit} to stock · line ₹
                        {(l.qty * l.rate).toLocaleString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {draft.lines.length ? null : (
                <EmptyState
                  icon={FileText}
                  title="No lines yet"
                  description="Add the materials received on this invoice."
                  compact
                />
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Discount">
              <div className="flex gap-2">
                <Select
                  value={draft.discountType ?? "flat"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, discountType: v as "flat" | "percent" })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat ₹</SelectItem>
                    <SelectItem value="percent">Percent</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={draft.discountValue ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, discountValue: Number(e.target.value || 0) })
                  }
                />
              </div>
            </FieldRow>
            <FieldRow label="Amount paid now">
              <Input
                type="number"
                value={draft.paidAmount ?? 0}
                onChange={(e) => {
                  const paid = Number(e.target.value || 0);
                  const grand = store.poTotals(draft).grand;
                  setDraft({
                    ...draft,
                    paidAmount: paid,
                    paymentStatus: paid <= 0 ? "Unpaid" : paid >= grand ? "Paid" : "Partial",
                  });
                }}
              />
            </FieldRow>
          </div>

          <TotalsPanel po={draft} />
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-3">
          <Button variant="outline" className="flex-1" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              store.savePurchase({ ...draft, status: "Ordered" });
              setDraft(null);
            }}
          >
            Save as ordered
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              store.savePurchase(draft, { receive: true });
              setDraft(null);
            }}
          >
            Save & receive
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ==================== Stock In-Hand ==================== */

export function StockInHandScreen() {
  const store = useStore();
  const [tab, setTab] = useState("count");
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const rows = store.rawMaterials.filter((m) =>
    m.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const changed = Object.entries(counts).filter(([id, v]) => {
    const m = store.rawMaterials.find((x) => x.id === id);
    return m && v !== "" && Math.abs(Number(v) - m.stock) > 0.0001;
  });
  const varianceValue = changed.reduce((s, [id, v]) => {
    const m = store.rawMaterials.find((x) => x.id === id)!;
    return s + (Number(v) - m.stock) * m.rate;
  }, 0);
  const adjPaged = usePagedRows(store.stockAdjustments, 10);

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="count">
            <ClipboardCheck className="size-4" /> Physical count
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" /> Adjustment history
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "count" ? (
        <SectionCard
          title="Reconcile system stock against physical count"
          description="Enter counted quantities for the rows that are off — everything is saved as one batch"
          bodyClassName="p-3 sm:p-4"
        >
          <Toolbar value={q} onChange={setQ} placeholder="Search material…" />
          <DataTable
            rows={rows}
            keyFn={(m) => m.id}
            columns={[
              {
                key: "name",
                header: "Material",
                cell: (m) => (
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="num text-[11px] text-muted-foreground">
                      1 {m.purchaseUnit} = {fmtQty(m.conversion)} {m.unit}
                    </p>
                  </div>
                ),
              },
              { key: "sys", header: "System stock", cell: (m) => <DualQty m={m} /> },
              {
                key: "count",
                header: "Physical count",
                cell: (m) => (
                  <div className="flex items-center gap-1">
                    <Input
                      inputMode="decimal"
                      className="h-9 w-28"
                      placeholder={fmtQty(m.stock)}
                      value={counts[m.id] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [m.id]: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">{m.unit}</span>
                  </div>
                ),
              },
              {
                key: "var",
                header: "Variance",
                cell: (m) => {
                  const raw = counts[m.id];
                  if (raw === undefined || raw === "") {
                    return <span className="text-xs text-muted-foreground">—</span>;
                  }
                  const diff = Number(raw) - m.stock;
                  if (Math.abs(diff) < 0.0001)
                    return <span className="text-xs text-success">Matches</span>;
                  return (
                    <div className="leading-tight">
                      <p
                        className={`num text-sm font-semibold ${diff < 0 ? "text-primary" : "text-success"}`}
                      >
                        {diff > 0 ? "+" : ""}
                        {fmtQty(diff)} {m.unit}
                      </p>
                      <Money
                        value={Math.round(diff * m.rate * 100) / 100}
                        className="text-[11px] text-muted-foreground"
                      />
                    </div>
                  );
                },
              },
            ]}
            mobileCard={(m) => (
              <div className="space-y-2">
                <p className="font-medium">{m.name}</p>
                <div className="flex items-center justify-between gap-3">
                  <DualQty m={m} />
                  <Input
                    inputMode="decimal"
                    className="h-9 w-28"
                    placeholder={fmtQty(m.stock)}
                    value={counts[m.id] ?? ""}
                    onChange={(e) => setCounts({ ...counts, [m.id]: e.target.value })}
                  />
                </div>
              </div>
            )}
          />
        </SectionCard>
      ) : (
        <SectionCard title="Manual adjustment history" bodyClassName="p-3 sm:p-4">
          <DataTable
            rows={adjPaged.pageRows}
            keyFn={(a) => a.id}
            empty={<EmptyState icon={History} title="No adjustments yet" compact />}
            columns={[
              {
                key: "mat",
                header: "Material",
                cell: (a) => (
                  <span className="font-medium">
                    {store.rawMaterials.find((m) => m.id === a.materialId)?.name ?? "—"}
                  </span>
                ),
              },
              { key: "date", header: "Date", cell: (a) => <span className="num">{a.date}</span> },
              {
                key: "sys",
                header: "System",
                cell: (a) => <span className="num">{fmtQty(a.systemQty)}</span>,
              },
              {
                key: "count",
                header: "Counted",
                cell: (a) => <span className="num">{fmtQty(a.countedQty)}</span>,
              },
              {
                key: "var",
                header: "Variance",
                cell: (a) => (
                  <span
                    className={`num font-semibold ${a.variance < 0 ? "text-primary" : "text-success"}`}
                  >
                    {a.variance > 0 ? "+" : ""}
                    {fmtQty(a.variance)}
                  </span>
                ),
              },
              { key: "value", header: "Value", cell: (a) => <Money value={a.value} /> },
              { key: "by", header: "By", cell: (a) => a.by },
              {
                key: "note",
                header: "Note",
                cell: (a) => <span className="text-xs text-muted-foreground">{a.note ?? "—"}</span>,
              },
            ]}
          />
          <TablePager {...adjPaged} onPageChange={adjPaged.setPage} />
        </SectionCard>
      )}

      <AnimatePresence>
        {tab === "count" && changed.length ? (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-overlay"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {changed.length} row{changed.length > 1 ? "s" : ""} ready to reconcile
              </p>
              <p className="text-xs text-muted-foreground">
                Net stock value change{" "}
                <span className={varianceValue < 0 ? "text-primary" : "text-success"}>
                  ₹{Math.round(varianceValue).toLocaleString("en-IN")}
                </span>
              </p>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason / note"
              className="h-9 w-full sm:w-56"
            />
            <Button variant="outline" onClick={() => setCounts({})}>
              Discard
            </Button>
            <Button
              onClick={() => {
                store.saveStockCount(
                  changed.map(([id, v]) => ({ materialId: id, countedQty: Number(v) })),
                  note,
                );
                setCounts({});
                setNote("");
              }}
            >
              Save batch
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ==================== Wastage ==================== */

interface WastageRow {
  materialId: string;
  qty: number;
  reason: string;
  notes: string;
}

export function WastageScreen() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WastageRow[]>([]);

  const monthCost = store.wastages.reduce((s, w) => {
    const m = store.rawMaterials.find((x) => x.id === w.materialId);
    return s + (w.cost ?? (m ? w.qty * m.rate : 0));
  }, 0);

  const batchCost = rows.reduce((s, r) => {
    const m = store.rawMaterials.find((x) => x.id === r.materialId);
    return s + (m ? r.qty * m.rate : 0);
  }, 0);

  const addRow = () =>
    setRows([
      ...rows,
      { materialId: store.rawMaterials[0]?.id ?? "", qty: 0, reason: "", notes: "" },
    ]);
  const wastagePaged = usePagedRows(store.wastages, 10);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Wastage cost recorded"
          value={<Money value={Math.round(monthCost)} />}
          tone="warning"
        />
        <StatCard label="Entries" value={store.wastages.length} icon={TriangleAlert} />
        <StatCard
          label="Most wasted"
          value={
            store.wastages[0]
              ? (store.rawMaterials.find((m) => m.id === store.wastages[0]!.materialId)?.name ??
                "—")
              : "—"
          }
        />
      </div>

      <SectionCard
        title="Wastage register"
        description="Batch stock-out — every row deducts stock and captures its cost"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setRows([
                { materialId: store.rawMaterials[0]?.id ?? "", qty: 0, reason: "", notes: "" },
              ]);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Record wastage
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <DataTable
          rows={wastagePaged.pageRows}
          keyFn={(w) => w.id}
          empty={<EmptyState icon={TriangleAlert} title="No wastage recorded" compact />}
          columns={[
            {
              key: "mat",
              header: "Material",
              cell: (w) => (
                <span className="font-medium">
                  {store.rawMaterials.find((m) => m.id === w.materialId)?.name ?? "—"}
                </span>
              ),
            },
            {
              key: "qty",
              header: "Quantity",
              cell: (w) => (
                <span className="num">
                  {fmtQty(w.qty)}{" "}
                  {store.rawMaterials.find((m) => m.id === w.materialId)?.unit ?? ""}
                </span>
              ),
            },
            {
              key: "cost",
              header: "Cost",
              cell: (w) => {
                const m = store.rawMaterials.find((x) => x.id === w.materialId);
                return (
                  <Money value={Math.round((w.cost ?? (m ? w.qty * m.rate : 0)) * 100) / 100} />
                );
              },
            },
            { key: "reason", header: "Reason", cell: (w) => w.reason },
            {
              key: "notes",
              header: "Notes",
              cell: (w) => <span className="text-xs text-muted-foreground">{w.notes ?? "—"}</span>,
            },
            { key: "date", header: "Date", cell: (w) => <span className="num">{w.date}</span> },
            { key: "by", header: "By", cell: (w) => w.recordedBy },
          ]}
        />
        <TablePager {...wastagePaged} onPageChange={wastagePaged.setPage} />
      </SectionCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Record wastage batch</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-24">
            {rows.map((r, i) => {
              const m = store.rawMaterials.find((x) => x.id === r.materialId);
              return (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_110px_auto]">
                    <Select
                      value={r.materialId}
                      onValueChange={(v) =>
                        setRows(rows.map((x, j) => (j === i ? { ...x, materialId: v } : x)))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
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
                        value={r.qty}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) =>
                              j === i ? { ...x, qty: Number(e.target.value || 0) } : x,
                            ),
                          )
                        }
                      />
                      <span className="w-8 text-xs text-muted-foreground">{m?.unit}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Reason"
                      value={r.reason}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      placeholder="Notes (optional)"
                      value={r.notes}
                      onChange={(e) =>
                        setRows(rows.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))
                      }
                    />
                  </div>
                  {m ? (
                    <p className="num mt-2 text-[11px] text-muted-foreground">
                      Stock after posting: {fmtQty(Math.max(0, m.stock - r.qty))} {m.unit} · cost ₹
                      {Math.round(r.qty * m.rate)}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button variant="outline" onClick={addRow} className="w-full">
              <Plus className="size-4" /> Add another item
            </Button>
          </div>
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface p-3">
            <div className="flex-1 text-sm">
              <p className="text-xs text-muted-foreground">Batch cost</p>
              <Money value={Math.round(batchCost)} className="font-semibold" />
            </div>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                store.addWastageBatch(rows);
                setRows([]);
                setOpen(false);
              }}
            >
              Post wastage
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ==================== Franchise Requisitions ==================== */

export function RequisitionsScreen() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [q, setQ] = useState("");

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartValue = cartItems.reduce((s, [id, qty]) => {
    const m = store.rawMaterials.find((x) => x.id === id);
    return s + (m ? m.rate * m.conversion * qty : 0);
  }, 0);

  const reqTotal = (id: string) => {
    const r = store.requisitions.find((x) => x.id === id);
    return (r?.items ?? []).reduce((s, i) => s + (i.approvedQty ?? i.orderedQty) * i.unitPrice, 0);
  };
  const reqPaged = usePagedRows(store.requisitions, 10);

  return (
    <>
      <div className="mb-4 rounded-xl border border-border bg-surface-muted/50 p-3 text-xs text-muted-foreground">
        A requisition is a{" "}
        <span className="font-medium text-foreground">
          procurement request to the parent merchant
        </span>
        , not a warehouse transfer. Once accepted and fulfilled it creates a purchase order, which
        is what actually moves stock.
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Pending approval"
          value={store.requisitions.filter((r) => r.status === "Pending").length}
          tone="warning"
        />
        <StatCard
          label="In progress"
          value={
            store.requisitions.filter((r) => ["Accepted", "Out for delivery"].includes(r.status))
              .length
          }
          tone="info"
        />
        <StatCard
          label="Delivered"
          value={store.requisitions.filter((r) => r.status === "Delivered").length}
        />
        <StatCard
          label="Requested value"
          value={
            <Money value={Math.round(store.requisitions.reduce((s, r) => s + reqTotal(r.id), 0))} />
          }
        />
      </div>

      <SectionCard
        title="Franchise requisitions"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setCart({});
              setRemarks("");
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> New requisition
          </Button>
        }
        bodyClassName="p-3 sm:p-4"
      >
        <div className="space-y-3">
          {reqPaged.pageRows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="num font-semibold">{r.reqNo}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.date} · {r.raisedBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RequisitionBadge status={r.status} />
                  <Money value={Math.round(reqTotal(r.id))} className="font-semibold" />
                </div>
              </div>
              <ul className="mt-3 grid gap-1.5 border-t border-border pt-3 sm:grid-cols-2">
                {r.items.map((i) => {
                  const m = store.rawMaterials.find((x) => x.id === i.materialId);
                  return (
                    <li key={i.materialId} className="flex items-center justify-between text-xs">
                      <span>{m?.name ?? "—"}</span>
                      <span className="num text-muted-foreground">
                        {i.orderedQty} {m?.purchaseUnit}
                        {i.approvedQty !== undefined && i.approvedQty !== i.orderedQty
                          ? ` → approved ${i.approvedQty}`
                          : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {r.remarks ? (
                <p className="mt-2 text-xs text-muted-foreground">Remarks: {r.remarks}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === "Pending" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => store.setRequisitionStatus(r.id, "Accepted")}
                    >
                      Mark accepted
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => store.removeRequisition(r.id)}>
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </>
                ) : null}
                {r.status === "Accepted" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => store.setRequisitionStatus(r.id, "Out for delivery")}
                  >
                    Out for delivery
                  </Button>
                ) : null}
                {r.status === "Out for delivery" ? (
                  <Button size="sm" onClick={() => store.fulfilRequisition(r.id)}>
                    Receive & create PO
                  </Button>
                ) : null}
                {r.purchaseOrderId ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                    Fulfilled by{" "}
                    {store.purchaseOrders.find((p) => p.id === r.purchaseOrderId)?.poNo ?? "PO"}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {store.requisitions.length ? null : (
            <EmptyState icon={FileText} title="No requisitions raised" compact />
          )}
        </div>
        <TablePager {...reqPaged} onPageChange={reqPaged.setPage} />
      </SectionCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New requisition</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-24">
            <Toolbar value={q} onChange={setQ} placeholder="Search materials…" />
            <div className="space-y-2">
              {store.rawMaterials
                .filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
                .map((m) => {
                  const qty = cart[m.id] ?? 0;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="num text-[11px] text-muted-foreground">
                          ₹{Math.round(m.rate * m.conversion)} / {m.purchaseUnit} · on hand{" "}
                          {fmtQty(m.stock)} {m.unit}
                        </p>
                        <HealthBar stock={m.stock} reorder={m.reorderLevel} />
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                          label="Decrease quantity"
                          variant="outline"
                          className="size-8"
                          onClick={() => setCart({ ...cart, [m.id]: Math.max(0, qty - 1) })}
                        >
                          <Minus className="size-3.5" />
                        </IconButton>
                        <span className="num w-8 text-center text-sm">{qty}</span>
                        <IconButton
                          label="Increase quantity"
                          variant="outline"
                          className="size-8"
                          onClick={() => setCart({ ...cart, [m.id]: qty + 1 })}
                        >
                          <Plus className="size-3.5" />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
            </div>
            <FieldRow label="Remarks">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </FieldRow>
          </div>
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface p-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{cartItems.length} items</p>
              <Money value={Math.round(cartValue)} className="font-semibold" />
            </div>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                store.createRequisition(
                  cartItems.map(([id, qty]) => {
                    const m = store.rawMaterials.find((x) => x.id === id)!;
                    return {
                      materialId: id,
                      orderedQty: qty,
                      unitPrice: Math.round(m.rate * m.conversion * 100) / 100,
                    };
                  }),
                  remarks,
                );
                setOpen(false);
              }}
            >
              Place request
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RequisitionBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    Pending: "bg-warning-soft text-warning",
    Accepted: "bg-info-soft text-info",
    "Out for delivery": "bg-info-soft text-info",
    Delivered: "bg-success-soft text-success",
    Rejected: "bg-primary-soft text-primary-soft-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone[status] ?? "bg-muted text-muted-foreground"}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export const stockHealthOf = healthOf;
