import { FieldError, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
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
import { toast } from "sonner";
import { useMemo, useState, useEffect } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { dmyToIso, isoToDMY, realToday } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { PurchaseOrder, PurchaseLine, PurchasePayment } from "@/mock/types";
import { purchaseOrderApi } from "@/lib/api";

/* ==================== Purchase Orders ==================== */

// A supplier is paid with one of the outlet's own payment modes (not "Due")
// or by cheque / bank transfer.
function useSupplierPayModes(): string[] {
  const store = useStore();
  const own = store.paymentModes
    .filter((m) => m.active && m.name.trim().toLowerCase() !== "due")
    .map((m) => m.name);
  const base = own.length ? own : ["Cash", "UPI", "Card"];
  return [
    ...base,
    ...["Cheque", "Bank transfer"].filter(
      (x) => !base.some((b) => b.toLowerCase() === x.toLowerCase()),
    ),
  ];
}
const todayIso = () => dmyToIso(realToday());
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
const isCashMode = (m: string) => m.trim().toLowerCase() === "cash";

type PayDraft = { mode: string; date: string; ref: string; fromDrawer: boolean };

/** Mode, date, reference no. and "from the drawer" of one supplier payment. */
function PaymentFields({
  value,
  onChange,
  asExpense,
  dateError,
}: {
  value: PayDraft;
  onChange: (v: PayDraft) => void;
  asExpense: boolean | null;
  dateError?: string;
}) {
  const modes = useSupplierPayModes();
  const refLabel =
    value.mode === "Cheque"
      ? "Cheque no."
      : value.mode === "Bank transfer"
        ? "UTR / transaction no."
        : "Reference no.";
  return (
    <div className="space-y-3" data-pay-fields>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldRow label="Paid by" required>
          <Select value={value.mode} onValueChange={(v) => onChange({ ...value, mode: v })}>
            <SelectTrigger aria-label="Payment mode">
              <SelectValue placeholder="Choose mode" />
            </SelectTrigger>
            <SelectContent>
              {modes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Payment date" required error={dateError}>
          <Input
            type="date"
            aria-label="Payment date"
            max={todayIso()}
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </FieldRow>
      </div>
      <FieldRow label={refLabel} hint="Optional">
        <Input
          aria-label="Reference no."
          placeholder={value.mode === "Cheque" ? "e.g. 004512" : "e.g. UTR / transaction id"}
          value={value.ref}
          maxLength={100}
          onChange={(e) => onChange({ ...value, ref: e.target.value })}
        />
      </FieldRow>
      {isCashMode(value.mode) ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            aria-label="Take from cash drawer"
            checked={value.fromDrawer}
            onCheckedChange={(c) => onChange({ ...value, fromDrawer: c === true })}
          />
          <span>
            Take from cash drawer
            <span className="block text-xs text-muted-foreground">
              When a cash session is open the cash comes out of it. Untick if you paid from
              somewhere else.
            </span>
          </span>
        </label>
      ) : null}
      {asExpense !== null ? (
        <p className="text-xs text-muted-foreground" data-pay-expense-note>
          {asExpense
            ? "Also recorded in Expenses under “Supplier payment”."
            : "Not added to Expenses (turned off in Purchase settings)."}
        </p>
      ) : null}
    </div>
  );
}

/** "Record supplier payments as expenses", read from and saved to the exe. */
function usePurchaseSettings() {
  const [asExpense, setAsExpense] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    purchaseOrderApi
      .settings()
      .then((r) => !cancelled && setAsExpense(r.supplier_payment_expense))
      .catch(() => !cancelled && setAsExpense(null));
    return () => {
      cancelled = true;
    };
  }, []);
  const save = async (v: boolean) => {
    const before = asExpense;
    setAsExpense(v);
    try {
      await purchaseOrderApi.saveSettings(v);
      toast.success(
        v
          ? "Supplier payments will be added to Expenses"
          : "Supplier payments won't be added to Expenses",
      );
    } catch {
      setAsExpense(before);
      toast.error("Could not save the purchase setting");
    }
  };
  return { asExpense, save };
}

/** Payments of one PO, oldest first, each deletable. */
function PaymentHistory({ po, canDelete }: { po: PurchaseOrder; canDelete: boolean }) {
  const store = useStore();
  const [confirm, setConfirm] = useState<PurchasePayment | null>(null);
  const [busy, setBusy] = useState(false);
  const list = po.payments ?? [];
  return (
    <div className="rounded-xl border border-border" data-po-payments>
      <p className="border-b border-border px-3 py-2 text-sm font-semibold">Payments</p>
      {list.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No payment recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
              data-po-payment={p.id}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {p.mode}
                  {p.ref ? <span className="text-muted-foreground"> · {p.ref}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {p.date}
                  {p.by ? ` · ${p.by}` : ""}
                  {p.asExpense ? " · in Expenses" : ""}
                </p>
              </div>
              <Money value={p.amount} className="font-semibold" />
              {canDelete ? (
                <IconButton label="Delete payment" onClick={() => setConfirm(p)}>
                  <Trash2 className="size-4" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this payment?</DialogTitle>
          </DialogHeader>
          {confirm ? (
            <p className="text-sm text-muted-foreground">
              {inr(confirm.amount)} by {confirm.mode} on {confirm.date} will be removed from{" "}
              {po.poNo}
              {confirm.asExpense ? " and from Expenses" : ""}. A cash payment from a cash session
              that is still open goes back into the drawer.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirm) return;
                setBusy(true);
                const ok = await store.deletePurchasePayment(po.id, confirm.id);
                setBusy(false);
                if (ok) setConfirm(null);
              }}
            >
              Delete payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Materials whose stock would drop below zero if these quantities (purchase units) came out. */
function stockShortfalls(
  store: ReturnType<typeof useStore>,
  out: { materialId: string; qty: number }[],
): string[] {
  const byMaterial = new Map<string, number>();
  for (const o of out) byMaterial.set(o.materialId, (byMaterial.get(o.materialId) ?? 0) + o.qty);
  const lines: string[] = [];
  for (const [id, qty] of byMaterial) {
    const m = store.rawMaterials.find((x) => x.id === id);
    if (!m || qty <= 0) continue;
    const after = m.stock - qty * m.conversion;
    if (after < -1e-9)
      lines.push(`${m.name}: ${fmtQty(m.stock)} ${m.unit} in stock → ${fmtQty(after)} ${m.unit}`);
  }
  return lines;
}

export function PurchaseOrdersScreen() {
  const access = useAccess("stock-transactions");
  const store = useStore();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<PurchaseOrder | null>(null);
  const [cancelFor, setCancelFor] = useState<PurchaseOrder | null>(null);
  const settings = usePurchaseSettings();

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
    date: realToday(),
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

      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
        <div>
          <p className="text-sm font-medium">Record supplier payments as expenses</p>
          <p className="text-xs text-muted-foreground">
            Every payment to a supplier also appears in Expenses under “Supplier payment”, with the
            PO no. and mode.
          </p>
        </div>
        <Switch
          aria-label="Record supplier payments as expenses"
          data-setting="supplier-payment-expense"
          checked={settings.asExpense ?? true}
          disabled={settings.asExpense === null || !access.edit}
          onCheckedChange={(v) => void settings.save(v)}
        />
      </div>

      <SectionCard
        title="Purchase orders"
        actions={
          <Button hidden={!access.create} size="sm" onClick={() => setDraft(newDraft())}>
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

                {view.backendId ? <PaymentHistory po={view} canDelete={access.delete} /> : null}

                <div className="flex flex-wrap gap-2">
                  {view.status !== "Received" && view.status !== "Cancelled" ? (
                    <Button onClick={() => store.savePurchase(view, { receive: true })}>
                      <PackageCheck className="size-4" /> Receive into stock
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setDraft({ ...view })}>
                    Edit order
                  </Button>
                  {view.backendId &&
                  view.status !== "Cancelled" &&
                  store.poTotals(view).grand - (view.paidAmount ?? 0) > 0.004 ? (
                    <Button
                      variant="outline"
                      hidden={!access.create}
                      onClick={() => setPayFor(view)}
                    >
                      Record payment
                    </Button>
                  ) : null}
                  {view.status !== "Cancelled" ? (
                    <Button
                      variant="ghost"
                      hidden={!access.delete}
                      onClick={() => setCancelFor(view)}
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

      <RecordPaymentDialog
        po={payFor}
        asExpense={settings.asExpense}
        onClose={() => setPayFor(null)}
      />
      <CancelPurchaseDialog
        po={cancelFor}
        onClose={() => setCancelFor(null)}
        onCancelled={() => {
          setCancelFor(null);
          setViewId(null);
        }}
      />
    </>
  );
}

function RecordPaymentDialog({
  po,
  asExpense,
  onClose,
}: {
  po: PurchaseOrder | null;
  asExpense: boolean | null;
  onClose: () => void;
}) {
  const store = useStore();
  const form = useFormCheck();
  const [amount, setAmount] = useState(0);
  const [pay, setPay] = useState<PayDraft>({
    mode: "Cash",
    date: todayIso(),
    ref: "",
    fromDrawer: true,
  });
  const [busy, setBusy] = useState(false);
  const due = po
    ? Math.round(Math.max(0, store.poTotals(po).grand - (po.paidAmount ?? 0)) * 100) / 100
    : 0;
  const poId = po?.id;
  const formReset = form.reset;
  useEffect(() => {
    if (!poId) return;
    formReset();
    setAmount(due);
    setPay({ mode: "Cash", date: todayIso(), ref: "", fromDrawer: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-pay-dialog>
        <DialogHeader>
          <DialogTitle>Record payment{po ? ` · ${po.poNo}` : ""}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Due <span className="font-semibold text-foreground">{inr(due)}</span>
          {po?.paidAmount ? ` · ${inr(po.paidAmount)} paid so far` : ""}
        </p>
        <FieldRow label="Amount (₹)" required error={form.error("payAmount")}>
          <Input
            {...form.fieldProps("payAmount")}
            type="number"
            min={0}
            step="0.01"
            aria-label="Payment amount"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value || 0))}
          />
        </FieldRow>
        <PaymentFields
          value={pay}
          onChange={setPay}
          asExpense={asExpense}
          dateError={form.error("payDate")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!po) return;
              const valid = form.check([
                {
                  key: "payAmount",
                  label: "Amount",
                  value: amount,
                  valid: (v) => typeof v === "number" && v > 0 && v <= due + 0.004,
                  message:
                    amount > due
                      ? `Amount can't be more than the ${inr(due)} due`
                      : "Enter an amount more than ₹0",
                },
                {
                  key: "payDate",
                  label: "Payment date",
                  value: pay.date,
                  valid: (v) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) && String(v) <= todayIso(),
                  message: "Pick a payment date (not in the future)",
                },
              ]);
              if (!valid) return;
              setBusy(true);
              const ok = await store.payPurchaseOrder(po.id, {
                amount: Math.round(amount * 100) / 100,
                mode: pay.mode,
                date: pay.date,
                ref: pay.ref.trim(),
                fromDrawer: pay.fromDrawer,
              });
              setBusy(false);
              if (ok) onClose();
            }}
          >
            Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelPurchaseDialog({
  po,
  onClose,
  onCancelled,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const received = po?.status === "Received" && !!po.backendId;
  // Stock this PO added comes back out; some of it may already be used.
  const short = po && received ? stockShortfalls(store, po.lines) : [];
  const paid = po?.payments?.length ?? 0;
  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-cancel-po-dialog>
        <DialogHeader>
          <DialogTitle>Cancel {po?.poNo}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          {received ? <p>The stock this purchase added is taken back out.</p> : null}
          {paid ? (
            <p>
              Its {paid} payment{paid > 1 ? "s are" : " is"} deleted too, with{" "}
              {paid > 1 ? "their" : "its"} expense entries; cash from a cash session that is still
              open goes back into the drawer.
            </p>
          ) : null}
          {short.length ? (
            <div
              className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-foreground"
              data-stock-warning
            >
              <p className="flex items-center gap-1 font-medium">
                <TriangleAlert className="size-4" /> Some of this stock is already used
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {short.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">
                Stock goes negative until you correct it with a stock count.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!po) return;
              setBusy(true);
              const ok = await store.cancelPurchaseOrder(po.id);
              setBusy(false);
              if (ok) onCancelled();
            }}
          >
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const access = useAccess("stock-transactions");
  const store = useStore();
  const poForm = useFormCheck();
  const poOpen = !!draft;
  const poReset = poForm.reset;
  const [warn, setWarn] = useState<{ lines: string[]; receive: boolean } | null>(null);
  const [asExpense, setAsExpense] = useState<boolean | null>(null);
  useEffect(() => {
    if (!poOpen) {
      poReset();
      setWarn(null);
      return;
    }
    purchaseOrderApi
      .settings()
      .then((r) => setAsExpense(r.supplier_payment_expense))
      .catch(() => setAsExpense(null));
  }, [poOpen, poReset]);
  if (!draft) return null;
  const isSaved = !!draft.backendId;
  const first: PayDraft = {
    mode: draft.firstPayment?.mode ?? "Cash",
    date: draft.firstPayment?.date ?? todayIso(),
    ref: draft.firstPayment?.ref ?? "",
    fromDrawer: draft.firstPayment?.fromDrawer ?? true,
  };

  // Lowering a received PO takes stock back out - warn when some of it is
  // already used (stock would go negative), then save anyway if confirmed.
  const shortfallsOfEdit = () => {
    const before = store.purchaseOrders.find((p) => p.id === draft.id);
    if (!before || before.status !== "Received" || !before.backendId) return [];
    const qtyOf = (lines: PurchaseLine[], id: string) =>
      lines.filter((l) => l.materialId === id).reduce((s, l) => s + l.qty, 0);
    const ids = new Set([...before.lines, ...draft.lines].map((l) => l.materialId));
    return stockShortfalls(
      store,
      [...ids].map((id) => ({
        materialId: id,
        qty: qtyOf(before.lines, id) - qtyOf(draft.lines, id),
      })),
    );
  };

  const commit = async (receive: boolean) => {
    const ok = receive
      ? await store.savePurchase(draft, { receive: true })
      : await store.savePurchase({ ...draft, status: "Ordered" });
    if (ok) setDraft(null);
  };

  const save = async (receive: boolean) => {
    const grand = store.poTotals(draft).grand;
    const valid = poForm.check([
      {
        key: "supplierId",
        label: "Supplier",
        value: draft.supplierId,
        message: "Choose the supplier",
      },
      {
        key: "date",
        label: "Invoice date",
        value: draft.date,
        valid: (v) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(v ?? "")),
        message: "Pick the invoice date",
      },
      {
        key: "gstin",
        label: "Supplier GSTIN",
        value: draft.gstin,
        valid: (v) => !String(v ?? "").trim() || /^[0-9A-Z]{15}$/i.test(String(v).trim()),
        message: "GSTIN must be 15 letters/digits, or leave it blank",
      },
      {
        key: "lines",
        label: "Invoice lines",
        value: draft.lines,
        message: "Add at least one material line",
      },
      ...draft.lines.flatMap((l, i) => [
        {
          key: `material-${i}`,
          label: `Line ${i + 1} material`,
          value: store.rawMaterials.some((m) => m.id === l.materialId),
          valid: (v: unknown) => v === true,
          message: `Line ${i + 1}: choose a material`,
        },
        {
          key: `qty-${i}`,
          label: `Line ${i + 1} quantity`,
          value: l.qty,
          valid: (v: unknown) => typeof v === "number" && v > 0,
          message: `Line ${i + 1}: quantity must be more than 0`,
        },
        {
          key: `rate-${i}`,
          label: `Line ${i + 1} rate`,
          value: l.rate,
          valid: (v: unknown) => typeof v === "number" && v >= 0,
          message: `Line ${i + 1}: rate can't be negative`,
        },
      ]),
      {
        key: "discount",
        label: "Discount",
        value: draft.discountValue ?? 0,
        valid: (v) =>
          typeof v === "number" && v >= 0 && (draft.discountType !== "percent" || v <= 100),
        message:
          draft.discountType === "percent"
            ? "Discount must be between 0 and 100%"
            : "Discount can't be negative",
      },
      {
        key: "paid",
        label: "Amount paid",
        value: draft.paidAmount ?? 0,
        valid: (v) => isSaved || (typeof v === "number" && v >= 0 && v <= grand + 0.004),
        message: `Amount paid must be between ₹0 and the ${inr(grand)} total`,
      },
      {
        key: "payDate",
        label: "Payment date",
        value: first.date,
        valid: (v) =>
          isSaved ||
          !(draft.paidAmount ?? 0) ||
          (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) && String(v) <= todayIso()),
        message: "Pick a payment date (not in the future)",
      },
      {
        key: "grandVsPaid",
        label: "Grand total",
        value: grand,
        valid: () => !isSaved || grand + 0.004 >= (draft.paidAmount ?? 0),
        message: `${inr(draft.paidAmount ?? 0)} is already paid - more than the new ${inr(grand)} total. Delete a payment first.`,
      },
    ]);
    if (!valid) return;
    const short = receive && isSaved ? shortfallsOfEdit() : [];
    if (short.length) {
      setWarn({ lines: short, receive });
      return;
    }
    await commit(receive);
  };

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
            <FieldRow
              label="Supplier"
              required
              hint="Who you bought from"
              error={poForm.error("supplierId")}
            >
              <Select
                value={draft.supplierId}
                onValueChange={(v) => {
                  setDraft({
                    ...draft,
                    supplierId: v,
                    gstin: store.suppliers.find((s) => s.id === v)?.gstin ?? "",
                  });
                  poForm.clearError("supplierId");
                }}
              >
                <SelectTrigger
                  data-field="supplierId"
                  aria-invalid={!!poForm.error("supplierId") || undefined}
                >
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
            <FieldRow label="Invoice number" hint="As printed on the supplier's bill">
              <Input
                placeholder="e.g. INV-2045"
                value={draft.invoiceNo ?? ""}
                onChange={(e) => setDraft({ ...draft, invoiceNo: e.target.value })}
              />
            </FieldRow>
            <FieldRow label="Invoice date" required error={poForm.error("date")}>
              {/* A real date picker - this was a plain text box. The draft
                  keeps DD/MM/YYYY like every other date in the app. */}
              <Input
                {...poForm.fieldProps("date")}
                type="date"
                value={/^\d{2}\/\d{2}\/\d{4}$/.test(draft.date) ? dmyToIso(draft.date) : ""}
                onChange={(e) =>
                  setDraft({ ...draft, date: e.target.value ? isoToDMY(e.target.value) : "" })
                }
              />
            </FieldRow>
            <FieldRow
              label="Supplier GSTIN"
              hint="Filled from the supplier; optional"
              error={poForm.error("gstin")}
            >
              <Input
                {...poForm.fieldProps("gstin")}
                placeholder="15-character GSTIN"
                value={draft.gstin ?? ""}
                onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
              />
            </FieldRow>
          </div>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">
                Invoice lines <span className="text-destructive">*</span>
              </p>
              <Button
                size="sm"
                variant="outline"
                data-field="lines"
                onClick={() => {
                  addLine();
                  poForm.clearError("lines");
                }}
              >
                <Plus className="size-4" /> Add line
              </Button>
            </div>
            <div className="space-y-2 p-3">
              {draft.lines.map((l, i) => {
                const m = store.rawMaterials.find((x) => x.id === l.materialId);
                return (
                  <div key={i} className="rounded-xl border border-border bg-surface-muted/40 p-2">
                    <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_110px_120px_100px_auto]">
                      <FieldRow label="Material" required error={poForm.error(`material-${i}`)}>
                        <Select
                          value={l.materialId}
                          onValueChange={(v) => {
                            poForm.clearError(`material-${i}`);
                            const nm = store.rawMaterials.find((x) => x.id === v);
                            setLine(i, {
                              materialId: v,
                              rate: nm ? Math.round(nm.rate * nm.conversion * 100) / 100 : l.rate,
                            });
                          }}
                        >
                          <SelectTrigger
                            data-field={`material-${i}`}
                            aria-invalid={!!poForm.error(`material-${i}`) || undefined}
                          >
                            <SelectValue placeholder="Choose material" />
                          </SelectTrigger>
                          <SelectContent>
                            {store.rawMaterials.map((x) => (
                              <SelectItem key={x.id} value={x.id}>
                                {x.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldRow>
                      <FieldRow
                        label={`Quantity${m?.purchaseUnit ? ` (${m.purchaseUnit})` : ""}`}
                        required
                        error={poForm.error(`qty-${i}`)}
                      >
                        <Input
                          {...poForm.fieldProps(`qty-${i}`)}
                          type="number"
                          min={0}
                          aria-label="Quantity"
                          value={l.qty}
                          onChange={(e) => setLine(i, { qty: Number(e.target.value || 0) })}
                        />
                      </FieldRow>
                      <FieldRow
                        label={`Rate ₹${m?.purchaseUnit ? ` / ${m.purchaseUnit}` : ""}`}
                        required
                        error={poForm.error(`rate-${i}`)}
                      >
                        <Input
                          {...poForm.fieldProps(`rate-${i}`)}
                          type="number"
                          min={0}
                          aria-label="Rate"
                          value={l.rate}
                          onChange={(e) => setLine(i, { rate: Number(e.target.value || 0) })}
                        />
                      </FieldRow>
                      <FieldRow label="GST">
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
                      </FieldRow>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Remove this line"
                        title="Remove this line"
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
              {poForm.error("lines") ? (
                <p className="text-xs text-destructive">{poForm.error("lines")}</p>
              ) : null}
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
            <FieldRow
              label="Discount on the bill"
              hint="Flat ₹ or a percent of the subtotal"
              error={poForm.error("discount")}
            >
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
                  {...poForm.fieldProps("discount")}
                  type="number"
                  min={0}
                  aria-label="Discount value"
                  placeholder="0"
                  value={draft.discountValue ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, discountValue: Number(e.target.value || 0) })
                  }
                />
              </div>
            </FieldRow>
            {isSaved ? (
              // A saved PO's payments are recorded / deleted one by one from
              // the order view - this box used to re-send the whole paid
              // amount as a new payment on every edit.
              <FieldRow label="Paid so far" error={poForm.error("grandVsPaid")}>
                <p className="num py-2 text-sm" data-paid-so-far>
                  {inr(draft.paidAmount ?? 0)}
                  <span className="block text-xs text-muted-foreground">
                    Record or delete payments from the order view.
                  </span>
                </p>
              </FieldRow>
            ) : (
              <FieldRow
                label="Amount paid now (₹)"
                hint="Leave 0 if the bill is unpaid; the rest is owed to the supplier"
                error={poForm.error("paid")}
              >
                <Input
                  {...poForm.fieldProps("paid")}
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Amount paid now"
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
            )}
          </div>
          {!isSaved && (draft.paidAmount ?? 0) > 0 ? (
            <div className="rounded-xl border border-border p-3">
              <PaymentFields
                value={first}
                onChange={(v) => setDraft({ ...draft, firstPayment: v })}
                asExpense={asExpense}
                dateError={poForm.error("payDate")}
              />
            </div>
          ) : null}

          <TotalsPanel po={draft} />
        </div>

        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-surface p-3 [&>button]:min-w-[7.5rem]">
          <Button variant="outline" className="flex-1" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            disabled={!(draft?.id ? access.edit : access.create)}
            title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
            variant="outline"
            className="flex-1"
            onClick={() => void save(false)}
          >
            Save as ordered
          </Button>
          <Button
            className="flex-1"
            disabled={!(draft?.id ? access.edit : access.create)}
            title={!(draft?.id ? access.edit : access.create) ? READ_ONLY_NOTE : undefined}
            onClick={() => void save(true)}
          >
            Save & receive
          </Button>
        </div>
        <Dialog open={!!warn} onOpenChange={(o) => !o && setWarn(null)}>
          <DialogContent className="max-w-md" data-edit-stock-warning>
            <DialogHeader>
              <DialogTitle>Some of this stock is already used</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Lowering this purchase takes stock back out. These go below zero:
            </p>
            <ul className="list-disc pl-5 text-sm">
              {warn?.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Correct it later with a stock count.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWarn(null)}>
                Go back
              </Button>
              <Button
                onClick={async () => {
                  const w = warn;
                  setWarn(null);
                  if (w) await commit(w.receive);
                }}
              >
                Save anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

/* ==================== Stock In-Hand ==================== */

export function StockInHandScreen() {
  const access = useAccess("stock-transactions");
  const store = useStore();
  const [tab, setTab] = useState("count");
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const countForm = useFormCheck();

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
                      {...countForm.fieldProps(`count-${m.id}`)}
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
                    {...countForm.fieldProps(`count-${m.id}`)}
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
              {...countForm.fieldProps("note")}
              aria-label="Reason for the adjustment (required)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason / note *"
              className="h-9 w-full sm:w-56"
            />
            <Button
              variant="outline"
              onClick={() => {
                setCounts({});
                countForm.reset();
              }}
            >
              Discard
            </Button>
            <Button
              hidden={!access.edit}
              onClick={async () => {
                const valid = countForm.check([
                  ...changed.map(([id, v]) => ({
                    key: `count-${id}`,
                    label: store.rawMaterials.find((m) => m.id === id)?.name ?? "Count",
                    value: v,
                    valid: (x: unknown) => Number.isFinite(Number(x)) && Number(x) >= 0,
                    message: `${store.rawMaterials.find((m) => m.id === id)?.name ?? "Count"}: enter a count of 0 or more`,
                  })),
                  {
                    key: "note",
                    label: "Reason",
                    value: note,
                    message: "Write why the stock is being adjusted",
                  },
                ]);
                if (!valid) return;
                const ok = await store.saveStockCount(
                  changed.map(([id, v]) => ({ materialId: id, countedQty: Number(v) })),
                  note.trim(),
                );
                if (!ok) return;
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
  const access = useAccess("stock-transactions");
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WastageRow[]>([]);
  const wForm = useFormCheck();
  const wReset = wForm.reset;
  useEffect(() => {
    if (!open) wReset();
  }, [open, wReset]);

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
            hidden={!access.create}
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
                  <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_130px_auto]">
                    <FieldRow label="Material" required error={wForm.error(`material-${i}`)}>
                      <Select
                        value={r.materialId}
                        onValueChange={(v) => {
                          setRows(rows.map((x, j) => (j === i ? { ...x, materialId: v } : x)));
                          wForm.clearError(`material-${i}`);
                        }}
                      >
                        <SelectTrigger
                          data-field={`material-${i}`}
                          aria-invalid={!!wForm.error(`material-${i}`) || undefined}
                        >
                          <SelectValue placeholder="Choose material" />
                        </SelectTrigger>
                        <SelectContent>
                          {store.rawMaterials.map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldRow>
                    <FieldRow
                      label={`Quantity${m?.unit ? ` (${m.unit})` : ""}`}
                      required
                      error={wForm.error(`qty-${i}`)}
                    >
                      <Input
                        {...wForm.fieldProps(`qty-${i}`)}
                        type="number"
                        min={0}
                        value={r.qty}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) =>
                              j === i ? { ...x, qty: Number(e.target.value || 0) } : x,
                            ),
                          )
                        }
                      />
                    </FieldRow>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove this row"
                      title="Remove this row"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <FieldRow label="Reason" required error={wForm.error(`reason-${i}`)}>
                      <Input
                        {...wForm.fieldProps(`reason-${i}`)}
                        placeholder="e.g. Spoiled, Spilled, Expired"
                        value={r.reason}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)),
                          )
                        }
                      />
                    </FieldRow>
                    <FieldRow label="Notes">
                      <Input
                        placeholder="Optional"
                        value={r.notes}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)),
                          )
                        }
                      />
                    </FieldRow>
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
            {wForm.error("rows") ? (
              <p className="text-xs text-destructive">{wForm.error("rows")}</p>
            ) : null}
            <Button
              variant="outline"
              data-field="rows"
              onClick={() => {
                addRow();
                wForm.clearError("rows");
              }}
              className="w-full"
            >
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
              onClick={async () => {
                const valid = wForm.check([
                  {
                    key: "rows",
                    label: "Items",
                    value: rows,
                    message: "Add at least one wasted item",
                  },
                  ...rows.flatMap((r, i) => {
                    const m = store.rawMaterials.find((x) => x.id === r.materialId);
                    return [
                      {
                        key: `material-${i}`,
                        label: `Row ${i + 1} material`,
                        value: !!m,
                        valid: (v: unknown) => v === true,
                        message: `Row ${i + 1}: choose a material`,
                      },
                      {
                        key: `qty-${i}`,
                        label: `Row ${i + 1} quantity`,
                        value: r.qty,
                        valid: (v: unknown) =>
                          typeof v === "number" && v > 0 && (!m || v <= m.stock),
                        message:
                          m && r.qty > m.stock
                            ? `Row ${i + 1}: only ${fmtQty(m.stock)} ${m.unit} of ${m.name} is in stock`
                            : `Row ${i + 1}: quantity must be more than 0`,
                      },
                      {
                        key: `reason-${i}`,
                        label: `Row ${i + 1} reason`,
                        value: r.reason,
                        message: `Row ${i + 1}: write why it was wasted`,
                      },
                    ];
                  }),
                ]);
                if (!valid) return;
                if (!(await store.addWastageBatch(rows))) return;
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
  const access = useAccess("stock-transactions");
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [q, setQ] = useState("");
  const reqForm = useFormCheck();
  const reqReset = reqForm.reset;
  useEffect(() => {
    if (!open) reqReset();
  }, [open, reqReset]);

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
            hidden={!access.create}
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
                      hidden={!access.edit}
                      size="sm"
                      variant="outline"
                      onClick={() => store.setRequisitionStatus(r.id, "Accepted")}
                    >
                      Mark accepted
                    </Button>
                    <Button
                      hidden={!access.delete}
                      size="sm"
                      variant="ghost"
                      onClick={() => store.removeRequisition(r.id)}
                    >
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
            <p className="text-xs text-muted-foreground">
              Materials <span className="text-destructive">*</span> — set a quantity for at least
              one
            </p>
            {reqForm.error("items") ? (
              <p className="text-xs text-destructive">{reqForm.error("items")}</p>
            ) : null}
            <div className="space-y-2" data-field="items" tabIndex={-1}>
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
                          onClick={() => {
                            setCart({ ...cart, [m.id]: qty + 1 });
                            reqForm.clearError("items");
                          }}
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
              onClick={async () => {
                const valid = reqForm.check([
                  {
                    key: "items",
                    label: "Materials",
                    value: cartItems,
                    message: "Add at least one material with a quantity",
                  },
                ]);
                if (!valid) return;
                const ok = await store.createRequisition(
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
                if (ok) setOpen(false);
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
