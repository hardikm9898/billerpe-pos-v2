import { FieldError, useFormCheck } from "@/lib/formCheck";
import { ChefHat, ImageUp, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { ApiError, tokenApi } from "@/lib/api";

import {
  DataTable,
  Money,
  PendingDecision,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import { ChipSelect, GstDependencyNotice, Notice, Toolbar } from "@/components/operations/shared";
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
import { orderTotals, useStore, type BillSettings } from "@/mock/store";
import type {
  InvoiceFormat,
  InvoiceLine,
  KotLine,
  OpsOrderType,
  Order,
  PaymentModeConfig,
  PromoCode,
  TaxRule,
  TokenScope,
} from "@/mock/types";

// Same shape orderTotals expects for a real order - two sample lines is
// enough to exercise every part of the calculation (subtotal, discount-free
// service-charge base, tax base) without this preview needing its own
// separate re-implementation of that math. Fixed values, not derived from
// anything live, so the preview stays stable while settings are edited.
const INVOICE_PREVIEW_ORDER: Order = {
  id: "invoice-preview",
  orderNo: 0,
  type: "Dine In",
  tableLabel: "Preview",
  guests: 2,
  status: "Running",
  lines: [
    { id: "preview-1", itemId: "preview-1", name: "Paneer Tikka", qty: 1, price: 320, kotRound: 1 },
    { id: "preview-2", itemId: "preview-2", name: "Butter Naan", qty: 2, price: 60, kotRound: 1 },
  ],
  kotRounds: 1,
  businessDate: "",
  createdAt: "",
  createdBy: "",
  itemised: true,
};

const ORDER_TYPES: OpsOrderType[] = ["Dine-in", "Pickup"];

/* =============== Calculation (service charge) =============== */

const SAMPLE_SUBTOTAL = 1200;
const SAMPLE_DISCOUNT = 100;

export function CalculationSection() {
  const store = useStore();
  const [rule, setRule] = useState(store.serviceCharge);
  const scForm = useFormCheck();

  const base = rule.calculationOn === "core" ? SAMPLE_SUBTOTAL : SAMPLE_SUBTOTAL - SAMPLE_DISCOUNT;
  const qualifies =
    rule.condition === "always" ||
    (rule.condition === "greater" ? base > rule.threshold : base < rule.threshold);
  const charge =
    !rule.active || !qualifies
      ? 0
      : rule.type === "percent"
        ? (base * rule.value) / 100
        : rule.value;
  const gstOn = store.invoiceFormat.gstCalculation;
  const taxBase = SAMPLE_SUBTOTAL - SAMPLE_DISCOUNT + (rule.taxOnCharge ? charge : 0);
  const tax = gstOn
    ? store.taxRules
        .filter((t) => t.active)
        .reduce((s, t) => s + (t.type === "percent" ? (taxBase * t.value) / 100 : t.value), 0)
    : 0;
  const grand = Math.round(
    SAMPLE_SUBTOTAL -
      SAMPLE_DISCOUNT +
      (rule.taxOnCharge ? 0 : charge) +
      (rule.taxOnCharge ? charge : 0) +
      tax,
  );

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Service charge is added before tax">
        A single outlet-wide rule. Where it sits in the bill depends on the calculation base, and
        whether GST applies on top of it is a separate switch.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="Service charge rule" bodyClassName="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted p-3">
            <div>
              <p className="text-sm font-medium">Apply a service charge</p>
              <p className="text-xs text-muted-foreground">
                Turn off to remove the line from every bill.
              </p>
            </div>
            <Switch
              checked={rule.active}
              onCheckedChange={(v) => setRule((r) => ({ ...r, active: v }))}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Charge type</Label>
              <Select
                value={rule.type}
                onValueChange={(v) => setRule((r) => ({ ...r, type: v as "percent" | "fixed" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage of the bill</SelectItem>
                  <SelectItem value="fixed">Flat amount per bill</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required={rule.active}>
                {rule.type === "percent" ? "Percentage (%)" : "Amount (₹)"}
              </Label>
              <Input
                {...scForm.fieldProps("value")}
                type="number"
                min={0}
                value={rule.value}
                onChange={(e) => setRule((r) => ({ ...r, value: Number(e.target.value) }))}
              />
              <FieldError message={scForm.error("value")} />
            </div>
            <div className="space-y-1.5">
              <Label>Calculate on</Label>
              <Select
                value={rule.calculationOn}
                onValueChange={(v) =>
                  setRule((r) => ({ ...r, calculationOn: v as "core" | "total" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Item subtotal (before discount)</SelectItem>
                  <SelectItem value="total">Bill total (after discount)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Apply when</Label>
              <Select
                value={rule.condition}
                onValueChange={(v) =>
                  setRule((r) => ({ ...r, condition: v as typeof r.condition }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="greater">Bill is above a threshold</SelectItem>
                  <SelectItem value="less">Bill is below a threshold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rule.condition !== "always" ? (
              <div className="space-y-1.5">
                <Label required>Threshold (₹)</Label>
                <Input
                  {...scForm.fieldProps("threshold")}
                  type="number"
                  min={0}
                  value={rule.threshold}
                  onChange={(e) => setRule((r) => ({ ...r, threshold: Number(e.target.value) }))}
                />
                <FieldError message={scForm.error("threshold")} />
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            <ChipSelect
              label="Auto-apply to order types"
              options={ORDER_TYPES.map((o) => ({ id: o, name: o }))}
              selected={rule.autoApply}
              onToggle={(id) =>
                setRule((r) => ({
                  ...r,
                  autoApply: r.autoApply.includes(id as OpsOrderType)
                    ? r.autoApply.filter((x) => x !== id)
                    : [...r.autoApply, id as OpsOrderType],
                }))
              }
              allLabel="None — cashier adds it manually"
            />
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Charge GST on the service charge</p>
                <p className="text-xs text-muted-foreground">
                  Adds the charge into the taxable value instead of after tax.
                </p>
              </div>
              <Switch
                checked={rule.taxOnCharge}
                onCheckedChange={(v) => setRule((r) => ({ ...r, taxOnCharge: v }))}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                const valid = scForm.check([
                  {
                    key: "value",
                    label: "Charge",
                    value: rule.value,
                    valid: (v) =>
                      typeof v === "number" &&
                      (rule.active ? v > 0 : v >= 0) &&
                      (rule.type !== "percent" || v <= 100),
                    message:
                      rule.type === "percent"
                        ? "Enter a percentage between 0 and 100"
                        : "Enter an amount more than ₹0",
                  },
                  ...(rule.condition !== "always"
                    ? [
                        {
                          key: "threshold",
                          label: "Threshold",
                          value: rule.threshold,
                          valid: (v: unknown) => typeof v === "number" && v > 0,
                          message: "Enter the bill amount the rule depends on",
                        },
                      ]
                    : []),
                ]);
                if (valid) store.setServiceCharge(rule);
              }}
            >
              Save rule
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Live bill preview"
          description="Sample ₹1,200 dine-in bill"
          bodyClassName="p-3 sm:p-4"
        >
          <dl className="space-y-2 text-sm">
            <Row label="Item subtotal" value={SAMPLE_SUBTOTAL} />
            <Row label="Discount" value={-SAMPLE_DISCOUNT} />
            <Row
              label={`Service charge${rule.type === "percent" ? ` (${rule.value}%)` : ""}`}
              value={charge}
              muted={!charge}
            />
            <Row label={gstOn ? "Tax" : "Tax (GST disabled)"} value={tax} muted={!gstOn} />
            <div className="border-t border-border pt-2">
              <Row label="Grand total (rounded)" value={grand} bold />
            </div>
          </dl>
          {!qualifies && rule.active ? (
            <p className="mt-3 text-xs text-warning">
              This sample bill does not meet the threshold, so no charge is added.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Bill rounding to the nearest rupee is handled by the billing engine and is not
            configurable here.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${muted ? "text-muted-foreground" : ""}`}
    >
      <dt className={bold ? "font-semibold" : ""}>{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>
        <Money value={value} />
      </dd>
    </div>
  );
}

/* =============== Tax configuration =============== */

const emptyTax = (): TaxRule => ({
  id: "",
  name: "",
  value: 0,
  type: "percent",
  orderTypes: ["Dine-in", "Pickup"],
  tableCategoryIds: [],
  menuCategoryIds: [],
  active: true,
});

export function TaxSection() {
  const store = useStore();
  const [draft, setDraft] = useState<TaxRule | null>(null);
  const taxForm = useFormCheck();
  const taxFormOpen = !!draft;
  const taxFormReset = taxForm.reset;
  useEffect(() => {
    if (!taxFormOpen) taxFormReset();
  }, [taxFormOpen, taxFormReset]);
  const gstOn = store.invoiceFormat.gstCalculation;

  const activeTotal = store.taxRules
    .filter((t) => t.active && t.type === "percent")
    .reduce((s, t) => s + t.value, 0);

  const tcName = (id: string) => store.tableCategories.find((c) => c.id === id)?.name ?? id;
  const mcName = (id: string) => store.menuCategories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <GstDependencyNotice />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Tax rules" value={String(store.taxRules.length)} />
        <StatCard
          label="Active rules"
          value={String(store.taxRules.filter((t) => t.active).length)}
          tone="primary"
        />
        <StatCard
          label="Effective percentage"
          value={gstOn ? `${activeTotal}%` : "0%"}
          hint={gstOn ? "Applied to taxable value" : "GST disabled in Invoice Format"}
        />
      </div>

      <SectionCard title="Tax rules" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyTax())}>
              <Plus className="size-4" /> Add tax
            </Button>
          }
        />
        <DataTable
          rows={store.taxRules}
          keyFn={(t) => t.id}
          columns={[
            {
              key: "name",
              header: "Tax",
              cell: (t) => <span className="font-medium">{t.name}</span>,
            },
            {
              key: "value",
              header: "Value",
              cell: (t) => (t.type === "percent" ? `${t.value}%` : <Money value={t.value} />),
            },
            {
              key: "orders",
              header: "Order types",
              cell: (t) => (t.orderTypes.length === 2 ? "All" : t.orderTypes.join(", ")),
            },
            {
              key: "scope",
              header: "Applies to",
              cell: (t) => {
                const bits = [...t.tableCategoryIds.map(tcName), ...t.menuCategoryIds.map(mcName)];
                return bits.length ? (
                  bits.join(" · ")
                ) : (
                  <span className="text-muted-foreground">Whole bill</span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              cell: (t) => (
                <div className="flex items-center gap-2">
                  <Switch checked={t.active} onCheckedChange={() => store.toggleTaxRule(t.id)} />
                  {t.active && !gstOn ? (
                    <span className="text-xs text-warning">not calculating</span>
                  ) : null}
                </div>
              ),
            },
            {
              key: "act",
              header: "",
              cell: (t) => (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => store.removeTaxRule(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            },
          ]}
          mobileCard={(t) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.type === "percent" ? `${t.value}%` : `₹${t.value}`} · {t.orderTypes.join(", ")}
                </p>
              </div>
              <StatusBadge status={t.active ? "Active" : "Inactive"} />
            </div>
          )}
        />
      </SectionCard>

      <PendingDecision
        title="Tax deletion needs a backend fix"
        note="In the current system the delete action for a tax rule calls the printer delete endpoint. This screen removes the rule locally so the flow can be reviewed, but the API must be corrected before release."
      />

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit tax rule" : "Add tax rule"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label required>Tax name</Label>
                  <Input
                    {...taxForm.fieldProps("name")}
                    value={draft.name}
                    placeholder="CGST"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <FieldError message={taxForm.error("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label required>{draft.type === "percent" ? "Value (%)" : "Value (₹)"}</Label>
                  <Input
                    {...taxForm.fieldProps("value")}
                    type="number"
                    min={0}
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
                  />
                  <FieldError message={taxForm.error("value")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label required>Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => setDraft({ ...draft, type: v as "percent" | "fixed" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
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
                label="Table categories"
                hint="Leave empty to apply to every table."
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
              />
              <ChipSelect
                label="Menu categories"
                hint="Leave empty to tax the whole bill."
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
                const valid = taxForm.check([
                  { key: "name", label: "Tax name", value: draft.name },
                  {
                    key: "value",
                    label: "Value",
                    value: draft.value,
                    valid: (v) =>
                      typeof v === "number" && v > 0 && (draft.type !== "percent" || v <= 100),
                    message:
                      draft.type === "percent"
                        ? "Enter a percentage between 0 and 100"
                        : "Enter an amount more than ₹0",
                  },
                ]);
                if (!valid) return;
                if (await store.upsertTaxRule(draft)) setDraft(null);
              }}
            >
              Save tax
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =============== Invoice format =============== */

const CONTENT_LABEL: Record<string, string> = {
  logo: "Outlet logo",
  "outlet-name": "Outlet name",
  address: "Address",
  gstin: "GSTIN",
  fssai: "FSSAI number",
  "upi-qr": "UPI QR code",
  marketing: "Marketing message",
  text: "Custom text",
};

export function InvoiceFormatSection() {
  const store = useStore();
  const [fmt, setFmtState] = useState(store.invoiceFormat);
  // The editor used to copy the saved format ONCE, when it opened. Opened
  // before the saved format had loaded (straight after login, or a refresh
  // on this page) it started from the built-in default lines instead - and
  // saving then overwrote the real format with those defaults plus the
  // edit: default lines twice, and the format that had been set gone
  // (owner report, 2026-09-22). Until the first edit it now follows the
  // saved format; after an edit, the edit is never overwritten.
  const [dirty, setDirty] = useState(false);
  const setFmt: typeof setFmtState = (next) => {
    setDirty(true);
    setFmtState(next);
  };
  useEffect(() => {
    if (!dirty) setFmtState(store.invoiceFormat);
  }, [store.invoiceFormat, dirty]);
  const fmtForm = useFormCheck();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Runs the exact same calculation a real bill would (service charge,
  // every active tax rule, delivery/packaging) against a fixed two-item
  // sample order, instead of this preview hand-maintaining its own
  // approximate copy of that math - `fmt` (this form's own live draft),
  // not store.invoiceFormat, so toggling GST above updates the preview
  // immediately, before "Save invoice format" is even clicked.
  const billSettings: BillSettings = {
    serviceCharge: store.serviceCharge,
    deliveryChargeRule: store.deliveryChargeRule,
    packagingChargeRule: store.packagingChargeRule,
    taxRules: store.taxRules,
    invoiceFormat: fmt,
  };
  const totals = orderTotals(INVOICE_PREVIEW_ORDER, billSettings);

  // Mirrors uat-backend's own QR construction exactly (controller/kto.js's
  // getHearderAndFooterData: pa left unencoded, pn/tn encoded, cu fixed to
  // INR) - generated client-side rather than round-tripped through the
  // backend since it's a pure function of (upiId, outlet name, amount),
  // and this is just a settings preview, not a real order's bill. Encodes
  // totals.grand (the same real calculation the preview below renders),
  // not a hand-typed number that could drift from it.
  useEffect(() => {
    if (!fmt.upiId) {
      setQrDataUrl(null);
      return;
    }
    const merchantName = encodeURIComponent(store.restaurant?.name ?? store.serverHotelName ?? "");
    const transactionNote = encodeURIComponent(`Bill Payment - ${totals.grand}`);
    const upiUrl = `upi://pay?pa=${fmt.upiId}&pn=${merchantName}&tn=${transactionNote}&am=${totals.grand}&cu=INR`;
    let cancelled = false;
    QRCode.toDataURL(upiUrl, { width: 150, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fmt.upiId, totals.grand]);

  const update = (patch: Partial<typeof fmt>) => setFmt((f) => ({ ...f, ...patch }));
  const [resetOpen, setResetOpen] = useState(false);
  const updateLine = (slot: "header" | "footer", id: string, patch: Partial<InvoiceLine>) =>
    setFmt((f) => ({
      ...f,
      [slot]: f[slot].map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  // hms_invoice_formate_mst has exactly 10 fixed slots per side
  // (model/invoiceFormate.js) - an 11th line here would just be silently
  // dropped on save (mock/store.tsx's toRawInvoiceFormatePayload only ever
  // writes slots 1-10), so this stops it from being addable at all rather
  // than accepting it and losing it later with no warning.
  const addLine = (slot: "header" | "footer") =>
    setFmt((f) =>
      f[slot].length >= 10
        ? f
        : {
            ...f,
            [slot]: [
              ...f[slot],
              { id: `${slot}-${Date.now()}`, content: "text", text: "", fontSize: 11 },
            ],
          },
    );
  const removeLine = (slot: "header" | "footer", id: string) =>
    setFmt((f) => ({ ...f, [slot]: f[slot].filter((l) => l.id !== id) }));

  const lineText = (l: InvoiceLine) => {
    switch (l.content) {
      case "outlet-name":
        return store.restaurant?.name ?? store.serverHotelName ?? "";
      case "address":
        return store.restaurant?.address ?? "";
      case "gstin":
        return `GSTIN: ${fmt.gstNo}`;
      case "fssai":
        return `FSSAI: ${fmt.fssaiNo}`;
      default:
        return l.text || "…";
    }
  };

  const renderLine = (l: InvoiceLine) => {
    if (l.content === "logo") {
      if (!fmt.logoUrl) {
        return (
          <p style={{ fontSize: l.fontSize }} className="leading-snug text-warning">
            Upload a logo above to show it here
          </p>
        );
      }
      return (
        <img src={fmt.logoUrl} alt="Outlet logo" className="mx-auto max-h-[80px] max-w-[150px]" />
      );
    }
    if (l.content === "upi-qr") {
      if (!fmt.upiId) {
        return (
          <p style={{ fontSize: l.fontSize }} className="leading-snug text-warning">
            Set a UPI ID above to show a QR
          </p>
        );
      }
      if (!qrDataUrl) {
        return (
          <p style={{ fontSize: l.fontSize }} className="leading-snug text-muted-foreground">
            Generating QR…
          </p>
        );
      }
      return (
        <img
          src={qrDataUrl}
          alt="UPI payment QR code"
          className="mx-auto"
          width={120}
          height={120}
        />
      );
    }
    return (
      <p style={{ fontSize: l.fontSize }} className="leading-snug">
        {lineText(l)}
      </p>
    );
  };

  return (
    <div className="space-y-4">
      <Notice
        tone={fmt.gstCalculation ? "success" : "warning"}
        title="This screen owns the GST master switch"
      >
        Turning GST off here stops every configured tax rule from calculating anywhere in the POS —
        it is not just a print setting.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard title="Business & tax identity" bodyClassName="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted p-3">
              <div>
                <p className="text-sm font-medium">GST calculation</p>
                <p className="text-xs text-muted-foreground">
                  Master switch for tax across billing, reports and printed invoices.
                </p>
              </div>
              <Switch
                checked={fmt.gstCalculation}
                onCheckedChange={(v) => {
                  update({ gstCalculation: v });
                  store.setGstCalculation(v);
                }}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Outlet logo</Label>
                <div className="flex items-center gap-3">
                  {fmt.logoUrl ? (
                    <img
                      src={fmt.logoUrl}
                      alt="Current outlet logo"
                      className="h-12 w-12 rounded-lg border border-border object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                      None
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploadingLogo(true);
                      // store.uploadHotelLogo's own patch() lands on
                      // store.invoiceFormat, not this screen's local `fmt`
                      // draft (this form only ever writes fmt back to the
                      // store on an explicit Save) - applying the
                      // returned URL to `fmt` directly here is what
                      // actually makes the thumbnail/preview below update
                      // right after a successful upload, confirmed live
                      // as the cause of "uploaded but not showing".
                      void store
                        .uploadHotelLogo(file)
                        .then((logoUrl) => {
                          if (logoUrl) update({ logoUrl });
                        })
                        .finally(() => setUploadingLogo(false));
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <ImageUp className="size-4" />
                    {uploadingLogo ? "Uploading…" : fmt.logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shows wherever a header or footer line below is set to "Outlet logo".
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>GST number</Label>
                <Input
                  {...fmtForm.fieldProps("gstNo")}
                  placeholder="Optional, 15 characters"
                  value={fmt.gstNo}
                  onChange={(e) => update({ gstNo: e.target.value.toUpperCase() })}
                />
                <FieldError message={fmtForm.error("gstNo")} />
              </div>
              <div className="space-y-1.5">
                <Label>FSSAI number</Label>
                <Input
                  {...fmtForm.fieldProps("fssaiNo")}
                  inputMode="numeric"
                  placeholder="Optional, 14 digits"
                  value={fmt.fssaiNo}
                  onChange={(e) => update({ fssaiNo: e.target.value })}
                />
                <FieldError message={fmtForm.error("fssaiNo")} />
              </div>
              <div className="space-y-1.5">
                <Label>UPI ID for the bill QR</Label>
                <Input
                  {...fmtForm.fieldProps("upiId")}
                  placeholder="e.g. outlet@okbank"
                  value={fmt.upiId}
                  onChange={(e) => update({ upiId: e.target.value })}
                />
                <FieldError message={fmtForm.error("upiId")} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Multi-language bill</p>
                  <p className="text-xs text-muted-foreground">Print item names bilingually.</p>
                </div>
                <Switch
                  checked={fmt.multiLanguage}
                  onCheckedChange={(v) => update({ multiLanguage: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Show QR on UPI settle</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-open a scannable UPI QR when UPI is selected while settling a bill.
                  </p>
                </div>
                <Switch
                  checked={store.qrOnSettle}
                  onCheckedChange={(v) => store.setQrOnSettle(v)}
                />
              </div>
            </div>
          </SectionCard>

          {(["header", "footer"] as const).map((slot) => (
            <SectionCard
              key={slot}
              title={`${slot === "header" ? "Header" : "Footer"} lines`}
              description="Each line prints in order, top to bottom."
              bodyClassName="p-3 sm:p-4"
            >
              <div className="space-y-2">
                {fmt[slot].map((l) => (
                  <div
                    key={l.id}
                    className="grid gap-2 rounded-xl border border-border p-2.5 sm:grid-cols-[180px_minmax(0,1fr)_110px_auto] sm:items-center"
                  >
                    <Select
                      value={l.content}
                      onValueChange={(v) =>
                        updateLine(slot, l.id, { content: v as InvoiceLine["content"] })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTENT_LABEL).map(([k, v]) => (
                          <SelectItem
                            key={k}
                            value={k}
                            // One marketing message per side: it prints the
                            // outlet's single header/footer marketing text.
                            disabled={
                              k === "marketing" &&
                              fmt[slot].some((o) => o.id !== l.id && o.content === "marketing")
                            }
                          >
                            {v}
                            {k === "marketing" &&
                            fmt[slot].some((o) => o.id !== l.id && o.content === "marketing")
                              ? " (already used - add Custom text)"
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-9"
                      placeholder={
                        l.content === "text" || l.content === "marketing"
                          ? "Text to print"
                          : "Filled automatically"
                      }
                      disabled={l.content !== "text" && l.content !== "marketing"}
                      value={l.text ?? ""}
                      onChange={(e) => updateLine(slot, l.id, { text: e.target.value })}
                    />
                    <Select
                      value={String(l.fontSize)}
                      onValueChange={(v) => updateLine(slot, l.id, { fontSize: Number(v) })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 11, 12, 14, 16, 18].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => removeLine(slot, l.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={fmt[slot].length >= 10}
                  onClick={() => addLine(slot)}
                >
                  <Plus className="size-4" />
                  {fmt[slot].length >= 10 ? "10 line max reached" : `Add ${slot} line`}
                </Button>
              </div>
            </SectionCard>
          ))}

          <SectionCard
            title="Tokens & bill printing"
            description="Tokens start from 1 every business day. Saved with the invoice format below."
            bodyClassName="p-3 sm:p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["tokenFor", "Token number", "Which orders get a token."],
                  [
                    "billWithKot",
                    "Bill with KOT",
                    "Generate Bill also prints the items not yet sent to the kitchen as a KOT on the bill printer. Not sent to the KDS.",
                  ],
                  [
                    "billWithToken",
                    "Bill with token slip",
                    "Generate Bill also prints a token slip for the customer.",
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Select
                    value={fmt.tokens[key]}
                    onValueChange={(v) =>
                      update({ tokens: { ...fmt.tokens, [key]: v as TokenScope } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="dinein">Dine-in only</SelectItem>
                      <SelectItem value="pickup">Pickup only</SelectItem>
                      <SelectItem value="both">Dine-in & pickup</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Save button</Label>
                <Select
                  value={fmt.saveBehave}
                  onValueChange={(v) => update({ saveBehave: v as InvoiceFormat["saveBehave"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="save">Only save</SelectItem>
                    <SelectItem value="pdf">Save and open bill PDF</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  PDF is handy for outlets without a printer, like food trucks.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/token-display", "_blank")}
              >
                Open token display
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
                Reset tokens now
              </Button>
            </div>
          </SectionCard>

          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset tokens?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                The next order gets token 1. Tokens already given keep their numbers. Tokens also
                restart on their own at the start of every business day.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setResetOpen(false);
                    void tokenApi
                      .reset()
                      .then(() => toast.success("Tokens reset - the next order gets token 1"))
                      .catch((err) =>
                        toast.error(err instanceof ApiError ? err.message : "Could not reset tokens"),
                      );
                  }}
                >
                  Reset tokens
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                const blankOr = (re: RegExp) => (v: unknown) =>
                  !String(v ?? "").trim() || re.test(String(v).trim());
                const valid = fmtForm.check([
                  {
                    key: "gstNo",
                    label: "GST number",
                    value: fmt.gstNo,
                    valid: blankOr(/^[0-9A-Z]{15}$/i),
                    message: "GST number must be 15 letters/digits, or leave it blank",
                  },
                  {
                    key: "fssaiNo",
                    label: "FSSAI number",
                    value: fmt.fssaiNo,
                    valid: (v) => blankOr(/^\d{14}$/)(String(v ?? "").replace(/\s/g, "")),
                    message: "FSSAI number must be 14 digits, or leave it blank",
                  },
                  {
                    key: "upiId",
                    label: "UPI ID",
                    value: fmt.upiId,
                    valid: blankOr(/^[\w.-]{2,}@[a-z][\w.-]*$/i),
                    message: "Enter a UPI ID like name@bank, or leave it blank",
                  },
                ]);
                // A blank custom-text line has nothing to print and was
                // dropped on reload, shifting every line under it.
                const blankLine = (["header", "footer"] as const)
                  .flatMap((slot) =>
                    fmt[slot].map((l, i) => ({ slot, n: i + 1, blank: l.content === "text" && !l.text?.trim() })),
                  )
                  .find((x) => x.blank);
                if (blankLine) {
                  toast.error(
                    `${blankLine.slot === "header" ? "Header" : "Footer"} line ${blankLine.n}: type the text to print, or remove the line`,
                  );
                  return;
                }
                if (valid) {
                  store.setInvoiceFormat(fmt);
                  setDirty(false);
                }
              }}
            >
              <Receipt className="size-4" /> Save invoice format
            </Button>
          </div>
        </div>

        <SectionCard title="Print preview" bodyClassName="p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[280px] rounded-lg border border-border bg-surface p-4 font-mono text-center">
            {fmt.header.map((l) => (
              <div key={l.id}>{renderLine(l)}</div>
            ))}
            <div className="my-3 border-t border-dashed border-border" />
            <div className="text-left text-[11px]">
              {INVOICE_PREVIEW_ORDER.lines.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>
                    {l.name} x{l.qty}
                  </span>
                  <span>{(l.price * l.qty).toFixed(2)}</span>
                </div>
              ))}
              {totals.discount ? (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{totals.discount.toFixed(2)}</span>
                </div>
              ) : null}
              {totals.service ? (
                <div className="flex justify-between">
                  <span>Service charge</span>
                  <span>{totals.service.toFixed(2)}</span>
                </div>
              ) : null}
              {totals.delivery ? (
                <div className="flex justify-between">
                  <span>Delivery charge</span>
                  <span>{totals.delivery.toFixed(2)}</span>
                </div>
              ) : null}
              {totals.packaging ? (
                <div className="flex justify-between">
                  <span>Packaging charge</span>
                  <span>{totals.packaging.toFixed(2)}</span>
                </div>
              ) : null}
              {totals.taxLines.map((t) => (
                <div key={t.id} className="flex justify-between">
                  <span>{t.name}</span>
                  <span>{t.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-dashed border-border pt-1 font-semibold">
                <span>Total</span>
                <span>{totals.grand.toFixed(2)}</span>
              </div>
            </div>
            <div className="my-3 border-t border-dashed border-border" />
            {fmt.footer.map((l) => (
              <div key={l.id}>{renderLine(l)}</div>
            ))}
          </div>
          {!fmt.gstCalculation ? (
            <p className="mt-3 text-xs text-warning">
              GST is off, so no tax line prints and no tax is charged.
            </p>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

/* =============== Dynamic KOT format (Task 1) =============== */

const KOT_CONTENT_LABEL: Record<string, string> = {
  "outlet-name": "Outlet name",
  address: "Address",
  "order-type": "Order type",
  "customer-details": "Customer / table details",
  "bill-no": "Bill no.",
  "token-number": "Token number",
  "kot-number": "KOT number",
  "billerpe-branding": "BillerPe branding",
  text: "Custom text",
};

// Same fixed sample items as INVOICE_PREVIEW_ORDER (no pricing shown on a
// KOT, so only name/qty are used) plus static dummy context values for the
// content types a KOT can show that a bill never does (order type, token/
// KOT number, customer/table).
const KOT_PREVIEW_CTX = {
  orderType: "Dine In",
  customerDetails: "Table 5",
  billNo: "1024",
  tokenNumber: 12,
  kotNumber: 1,
  firedAt: "24/09/26, 6:09 pm",
};

export function KotFormatSection() {
  const store = useStore();
  const [fmt, setFmtState] = useState(store.kotFormat);
  // Same as InvoiceFormatSection: the editor used to copy the saved format ONCE, when it opened. Opened
  // before the saved format had loaded (straight after login, or a refresh
  // on this page) it started from the built-in default lines instead - and
  // saving then overwrote the real format with those defaults plus the
  // edit: default lines twice, and the format that had been set gone
  // (owner report, 2026-09-22). Until the first edit it now follows the
  // saved format; after an edit, the edit is never overwritten.
  const [dirty, setDirty] = useState(false);
  const setFmt: typeof setFmtState = (next) => {
    setDirty(true);
    setFmtState(next);
  };
  useEffect(() => {
    if (!dirty) setFmtState(store.kotFormat);
  }, [store.kotFormat, dirty]);

  const updateLine = (slot: "header" | "footer", id: string, patch: Partial<KotLine>) =>
    setFmt((f) => ({
      ...f,
      [slot]: f[slot].map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  // hms_kot_formate_mst has exactly 10 fixed slots per side
  // (uat-backend-v2/model/kotFormate.js), same cap as the invoice format
  // editor's own addLine for the same reason - see its own comment.
  const addLine = (slot: "header" | "footer") =>
    setFmt((f) =>
      f[slot].length >= 10
        ? f
        : {
            ...f,
            [slot]: [
              ...f[slot],
              { id: `${slot}-${Date.now()}`, content: "text", text: "", fontSize: 11 },
            ],
          },
    );
  const removeLine = (slot: "header" | "footer", id: string) =>
    setFmt((f) => ({ ...f, [slot]: f[slot].filter((l) => l.id !== id) }));

  const lineText = (l: KotLine) => {
    switch (l.content) {
      case "outlet-name":
        return store.restaurant?.name ?? store.serverHotelName ?? "";
      case "address":
        return store.restaurant?.address ?? "";
      case "order-type":
        return KOT_PREVIEW_CTX.orderType;
      case "customer-details":
        return KOT_PREVIEW_CTX.customerDetails;
      case "bill-no":
        return `KOT - ${KOT_PREVIEW_CTX.billNo}`;
      case "token-number":
        return `Token No.: ${KOT_PREVIEW_CTX.tokenNumber}`;
      case "kot-number":
        return `KOT #${KOT_PREVIEW_CTX.kotNumber}`;
      case "billerpe-branding":
        return "Powered by BillerPe";
      default:
        return l.text || "…";
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        {(["header", "footer"] as const).map((slot) => (
          <SectionCard
            key={slot}
            title={`${slot === "header" ? "Header" : "Footer"} lines`}
            description="Each line prints in order, top to bottom on every KOT ticket."
            bodyClassName="p-3 sm:p-4"
          >
            <div className="space-y-2">
              {fmt[slot].map((l) => (
                <div
                  key={l.id}
                  className="grid gap-2 rounded-xl border border-border p-2.5 sm:grid-cols-[180px_minmax(0,1fr)_110px_auto] sm:items-center"
                >
                  <Select
                    value={l.content}
                    onValueChange={(v) =>
                      updateLine(slot, l.id, { content: v as KotLine["content"] })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(KOT_CONTENT_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9"
                    placeholder={l.content === "text" ? "Text to print" : "Filled automatically"}
                    disabled={l.content !== "text"}
                    value={l.text ?? ""}
                    onChange={(e) => updateLine(slot, l.id, { text: e.target.value })}
                  />
                  <Select
                    value={String(l.fontSize)}
                    onValueChange={(v) => updateLine(slot, l.id, { fontSize: Number(v) })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 11, 12, 14, 16, 18].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} px
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => removeLine(slot, l.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={fmt[slot].length >= 10}
                onClick={() => addLine(slot)}
              >
                <Plus className="size-4" />
                {fmt[slot].length >= 10 ? "10 line max reached" : `Add ${slot} line`}
              </Button>
            </div>
          </SectionCard>
        ))}

        <div className="flex justify-end">
          <Button
            onClick={() => {
              store.setKotFormat(fmt);
              setDirty(false);
            }}
          >
            <ChefHat className="size-4" /> Save KOT format
          </Button>
        </div>
      </div>

      <SectionCard title="Print preview" bodyClassName="p-3 sm:p-4">
        <div className="mx-auto w-full max-w-[280px] rounded-lg border border-border bg-surface p-4 font-mono text-center">
          {fmt.header.map((l) => (
            <p key={l.id} style={{ fontSize: l.fontSize }} className="leading-snug">
              {lineText(l)}
            </p>
          ))}
          {/* Every printed KOT carries the time it was fired, under the header. */}
          <p className="text-[11px] leading-snug">{KOT_PREVIEW_CTX.firedAt}</p>
          <div className="my-3 border-t border-dashed border-border" />
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-dashed border-border">
                <th className="pb-1 font-medium">Item</th>
                <th className="pb-1 text-right font-medium">Qty.</th>
              </tr>
            </thead>
            <tbody>
              {INVOICE_PREVIEW_ORDER.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-0.5">{l.name}</td>
                  <td className="py-0.5 text-right">{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-3 border-t border-dashed border-border" />
          {fmt.footer.map((l) => (
            <p key={l.id} style={{ fontSize: l.fontSize }} className="leading-snug">
              {lineText(l)}
            </p>
          ))}
        </div>
        {fmt.header.length &&
        ![...fmt.header, ...fmt.footer].some((l) => l.content === "customer-details") ? (
          <p className="mt-3 text-xs text-warning">
            No "Customer / table details" line - the kitchen will not see which table or customer a
            KOT is for.
          </p>
        ) : null}
        {!fmt.header.length ? (
          <p className="mt-3 text-xs text-warning">
            No header lines configured yet - real tickets print the plain default layout (outlet
            name, order type, table/customer, token) until a format is saved here.
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}

/* =============== Promo codes =============== */

const emptyPromo = (): PromoCode => ({
  id: "",
  name: "",
  code: "",
  type: "percent",
  value: 0,
  active: true,
});

export function PromoSection() {
  const store = useStore();
  const [draft, setDraft] = useState<PromoCode | null>(null);
  const promoForm = useFormCheck();
  const promoFormOpen = !!draft;
  const promoFormReset = promoForm.reset;
  useEffect(() => {
    if (!promoFormOpen) promoFormReset();
  }, [promoFormOpen, promoFormReset]);
  const active = useMemo(() => store.promoCodes.filter((p) => p.active), [store.promoCodes]);

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Cashiers pick these cards, they do not type free-form discounts">
        Anything inactive here simply disappears from the discount popup on the billing screen.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Promo codes" value={String(store.promoCodes.length)} />
        <StatCard label="Available at billing" value={String(active.length)} tone="primary" />
        <StatCard
          label="Deepest discount"
          value={
            active.length
              ? `${Math.max(...active.filter((p) => p.type === "percent").map((p) => p.value), 0)}%`
              : "—"
          }
        />
      </div>

      <SectionCard title="Promo codes" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyPromo())}>
              <Plus className="size-4" /> Add promo
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {store.promoCodes.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-4 transition-colors ${
                p.active
                  ? "border-border bg-surface"
                  : "border-dashed border-border bg-surface-muted"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="mt-1 font-mono text-xs uppercase text-muted-foreground">{p.code}</p>
                </div>
                <span className="rounded-lg bg-primary-soft px-2 py-1 text-sm font-semibold text-primary">
                  {p.type === "percent" ? `${p.value}%` : `₹${p.value}`}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={p.active} onCheckedChange={() => store.togglePromo(p.id)} />
                  <span className="text-xs text-muted-foreground">
                    {p.active ? "Shown at billing" : "Hidden"}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDraft(p)}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit promo" : "Add promo"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label required>Display name</Label>
                <Input
                  {...promoForm.fieldProps("name")}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <FieldError message={promoForm.error("name")} />
              </div>
              <div className="space-y-1.5">
                <Label required>Code</Label>
                <Input
                  {...promoForm.fieldProps("code")}
                  placeholder="e.g. WELCOME10"
                  value={draft.code}
                  className="font-mono uppercase"
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                />
                <FieldError message={promoForm.error("code")} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label required>Type</Label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) => setDraft({ ...draft, type: v as "percent" | "fixed" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage</SelectItem>
                      <SelectItem value="fixed">Flat ₹</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label required>{draft.type === "percent" ? "Value (%)" : "Value (₹)"}</Label>
                  <Input
                    {...promoForm.fieldProps("value")}
                    type="number"
                    min={0}
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
                  />
                  <FieldError message={promoForm.error("value")} />
                </div>
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
                const valid = promoForm.check([
                  { key: "name", label: "Display name", value: draft.name },
                  {
                    key: "code",
                    label: "Code",
                    value: draft.code,
                    valid: (v) => /^[A-Z0-9_-]{3,20}$/.test(String(v ?? "").trim()),
                    message: "Code needs 3-20 letters or digits (no spaces)",
                  },
                  {
                    key: "value",
                    label: "Value",
                    value: draft.value,
                    valid: (v) =>
                      typeof v === "number" && v > 0 && (draft.type !== "percent" || v <= 100),
                    message:
                      draft.type === "percent"
                        ? "Enter a percentage between 0 and 100"
                        : "Enter an amount more than ₹0",
                  },
                ]);
                if (!valid) return;
                if (await store.upsertPromo({ ...draft, code: draft.code.trim() })) setDraft(null);
              }}
            >
              Save promo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =============== Payment modes =============== */

const emptyPaymentMode = (): PaymentModeConfig => ({
  id: "",
  name: "",
  active: true,
  deletable: true,
});

/** One base default per order type, plus optional per-table-category
 * overrides for Dine-in (Pickup has no table). Read by
 * PaymentSplitEditor's "Add payment mode" button via
 * store.resolveDefaultPaymentMode - purely a pre-selected starting point,
 * never a restriction on what can actually be picked at billing. */
function DefaultPaymentModeCard() {
  const store = useStore();
  const [overrideCategoryId, setOverrideCategoryId] = useState("");
  const [overrideModeId, setOverrideModeId] = useState("");
  const activeModes = store.paymentModes.filter((m) => m.active);
  const dineInOverrides = store.paymentModeDefaults.filter(
    (d) => d.orderType === "Dine-in" && d.tableCategoryId,
  );
  const availableCategories = store.tableCategories.filter(
    (c) => !dineInOverrides.some((d) => d.tableCategoryId === c.id),
  );

  if (!activeModes.length) return null;

  return (
    <SectionCard title="Default payment mode" bodyClassName="p-3 sm:p-4 space-y-4">
      <p className="text-xs text-muted-foreground">
        Pre-selects a payment mode when billing starts — staff can still pick any other active mode
        at settle time.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER_TYPES.map((ot) => {
          const current = store.paymentModeDefaults.find(
            (d) => d.orderType === ot && !d.tableCategoryId,
          );
          return (
            <div key={ot} className="space-y-1.5">
              <Label>{ot}</Label>
              <Select
                value={current?.paymentModeId ?? ""}
                onValueChange={(v) => store.saveDefaultPaymentMode(ot, undefined, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="First active mode" />
                </SelectTrigger>
                <SelectContent>
                  {activeModes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Table category overrides (Dine-in)</p>
        {dineInOverrides.length ? (
          <div className="space-y-1.5">
            {dineInOverrides.map((d) => {
              const category = store.tableCategories.find((c) => c.id === d.tableCategoryId);
              const mode = store.paymentModes.find((m) => m.id === d.paymentModeId);
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {category?.name ?? "Unknown category"} →{" "}
                    <span className="font-medium">{mode?.name ?? "Unknown mode"}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => store.removeDefaultPaymentMode(d.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No category overrides yet.</p>
        )}

        {availableCategories.length ? (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="space-y-1.5">
              <Label>Table category</Label>
              <Select value={overrideCategoryId} onValueChange={setOverrideCategoryId}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment mode</Label>
              <Select value={overrideModeId} onValueChange={setOverrideModeId}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {activeModes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!overrideCategoryId || !overrideModeId}
              onClick={() => {
                store.saveDefaultPaymentMode("Dine-in", overrideCategoryId, overrideModeId);
                setOverrideCategoryId("");
                setOverrideModeId("");
              }}
            >
              <Plus className="size-4" /> Add override
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function PaymentModesSection() {
  const store = useStore();
  const [draft, setDraft] = useState<PaymentModeConfig | null>(null);
  const modeForm = useFormCheck();
  const modeFormOpen = !!draft;
  const modeFormReset = modeForm.reset;
  useEffect(() => {
    if (!modeFormOpen) modeFormReset();
  }, [modeFormOpen, modeFormReset]);

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Cash and Due are protected — every outlet needs them">
        Everything else here is yours to add, rename, retire or remove.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Payment modes" value={String(store.paymentModes.length)} />
        <StatCard
          label="Selectable at billing"
          value={String(store.paymentModes.filter((m) => m.active).length)}
          tone="primary"
        />
      </div>

      <SectionCard title="Payment modes" bodyClassName="p-3 sm:p-4">
        <Toolbar
          right={
            <Button size="sm" onClick={() => setDraft(emptyPaymentMode())}>
              <Plus className="size-4" /> Add mode
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {store.paymentModes.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-4 transition-colors ${
                m.active
                  ? "border-border bg-surface"
                  : "border-dashed border-border bg-surface-muted"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{m.name}</p>
                {!m.deletable ? (
                  <span className="rounded-lg bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                    Mandatory
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Cash and Due are mandatory - always on (owner rule). */}
                  <Switch
                    checked={m.active || !m.deletable}
                    disabled={!m.deletable}
                    aria-label={`${m.name} selectable at billing`}
                    onCheckedChange={(v) => store.setPaymentModeActive(m.id, v)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {!m.deletable ? "Always on" : m.active ? "Selectable" : "Hidden"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setDraft(m)}>
                    Edit
                  </Button>
                  {m.deletable ? (
                    <Button size="sm" variant="ghost" onClick={() => store.removePaymentMode(m.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <DefaultPaymentModeCard />

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit payment mode" : "Add payment mode"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-1.5">
              <Label required>Name</Label>
              <Input
                {...modeForm.fieldProps("name")}
                value={draft.name}
                disabled={!draft.deletable}
                placeholder="e.g. Paytm Wallet"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <FieldError message={modeForm.error("name")} />
              {!draft.deletable ? (
                <p className="text-xs text-muted-foreground">
                  Cash and Due are mandatory payment modes — they can't be renamed, turned off
                  or removed.
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft) return;
                const taken = store.paymentModes.some(
                  (m) =>
                    m.id !== draft.id &&
                    m.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
                );
                const valid = modeForm.check([
                  {
                    key: "name",
                    label: "Name",
                    value: draft.name,
                    valid: (v) => !!String(v ?? "").trim() && !taken,
                    message: taken
                      ? "A payment mode with this name already exists"
                      : "Name is required",
                  },
                ]);
                if (!valid) return;
                if (await store.upsertPaymentMode(draft)) setDraft(null);
              }}
            >
              Save mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
