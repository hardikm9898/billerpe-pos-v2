import { Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

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
import { RESTAURANT } from "@/mock/data";
import { useStore } from "@/mock/store";
import type {
  InvoiceLine,
  OpsOrderType,
  PaymentModeConfig,
  PromoCode,
  TaxRule,
} from "@/mock/types";

const ORDER_TYPES: OpsOrderType[] = ["Dine-in", "Pickup"];

/* =============== Calculation (service charge) =============== */

const SAMPLE_SUBTOTAL = 1200;
const SAMPLE_DISCOUNT = 100;

export function CalculationSection() {
  const store = useStore();
  const [rule, setRule] = useState(store.serviceCharge);

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
              <Label>{rule.type === "percent" ? "Percentage (%)" : "Amount (₹)"}</Label>
              <Input
                type="number"
                value={rule.value}
                onChange={(e) => setRule((r) => ({ ...r, value: Number(e.target.value) }))}
              />
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
                <Label>Threshold (₹)</Label>
                <Input
                  type="number"
                  value={rule.threshold}
                  onChange={(e) => setRule((r) => ({ ...r, threshold: Number(e.target.value) }))}
                />
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
            <Button onClick={() => store.setServiceCharge(rule)}>Save rule</Button>
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
                  <Label>Tax name</Label>
                  <Input
                    value={draft.name}
                    placeholder="CGST"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
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
              onClick={() => {
                if (draft) store.upsertTaxRule(draft);
                setDraft(null);
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
  const [fmt, setFmt] = useState(store.invoiceFormat);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Same sample totals already shown in the "Total" line below (485 with
  // GST, 462 without) - reused here so the QR's encoded amount matches
  // what the preview displays instead of drifting from it independently.
  const previewAmount = fmt.gstCalculation ? 485 : 462;

  // Mirrors uat-backend's own QR construction exactly (controller/kto.js's
  // getHearderAndFooterData: pa left unencoded, pn/tn encoded, cu fixed to
  // INR) - generated client-side rather than round-tripped through the
  // backend since it's a pure function of (upiId, outlet name, amount),
  // and this is just a settings preview, not a real order's bill.
  useEffect(() => {
    if (!fmt.upiId) {
      setQrDataUrl(null);
      return;
    }
    const merchantName = encodeURIComponent(RESTAURANT.name);
    const transactionNote = encodeURIComponent(`Bill Payment - ${previewAmount}`);
    const upiUrl = `upi://pay?pa=${fmt.upiId}&pn=${merchantName}&tn=${transactionNote}&am=${previewAmount}&cu=INR`;
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
  }, [fmt.upiId, previewAmount]);

  const update = (patch: Partial<typeof fmt>) => setFmt((f) => ({ ...f, ...patch }));
  const updateLine = (slot: "header" | "footer", id: string, patch: Partial<InvoiceLine>) =>
    setFmt((f) => ({
      ...f,
      [slot]: f[slot].map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  const addLine = (slot: "header" | "footer") =>
    setFmt((f) => ({
      ...f,
      [slot]: [
        ...f[slot],
        { id: `${slot}-${Date.now()}`, content: "text", text: "", fontSize: 11 },
      ],
    }));
  const removeLine = (slot: "header" | "footer", id: string) =>
    setFmt((f) => ({ ...f, [slot]: f[slot].filter((l) => l.id !== id) }));

  const lineText = (l: InvoiceLine) => {
    switch (l.content) {
      case "logo":
        return "[ LOGO ]";
      case "outlet-name":
        return RESTAURANT.name;
      case "address":
        return RESTAURANT.outlet;
      case "gstin":
        return `GSTIN: ${fmt.gstNo}`;
      case "fssai":
        return `FSSAI: ${fmt.fssaiNo}`;
      default:
        return l.text || "…";
    }
  };

  const renderLine = (l: InvoiceLine) => {
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
              <div className="space-y-1.5">
                <Label>GST number</Label>
                <Input value={fmt.gstNo} onChange={(e) => update({ gstNo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>FSSAI number</Label>
                <Input value={fmt.fssaiNo} onChange={(e) => update({ fssaiNo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>UPI ID for the bill QR</Label>
                <Input value={fmt.upiId} onChange={(e) => update({ upiId: e.target.value })} />
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
                          <SelectItem key={k} value={k}>
                            {v}
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
                <Button size="sm" variant="outline" onClick={() => addLine(slot)}>
                  <Plus className="size-4" /> Add {slot} line
                </Button>
              </div>
            </SectionCard>
          ))}

          <SectionCard
            title="Awaiting confirmation"
            description="Present in the current system with no confirmed effect on the bill."
            bodyClassName="p-3 sm:p-4"
          >
            <div className="space-y-2">
              {(
                [
                  ["isTokenOn", "Token display"],
                  ["billWithKot", "Bill with KOT"],
                  ["billWithToken", "Bill with token"],
                  ["saveBehaviour", "Save behaviour"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-3"
                >
                  <p className="text-sm font-medium">{label}</p>
                  <Switch
                    checked={fmt.unconfirmed[key]}
                    onCheckedChange={(v) =>
                      update({ unconfirmed: { ...fmt.unconfirmed, [key]: v } })
                    }
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-warning">
              No frontend consumer found — behaviour to be confirmed before release
            </p>
          </SectionCard>

          <div className="flex justify-end">
            <Button onClick={() => store.setInvoiceFormat(fmt)}>
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
              <div className="flex justify-between">
                <span>Paneer Tikka x1</span>
                <span>320.00</span>
              </div>
              <div className="flex justify-between">
                <span>Butter Naan x2</span>
                <span>120.00</span>
              </div>
              {store.serviceCharge.active ? (
                <div className="flex justify-between">
                  <span>Service charge</span>
                  <span>22.00</span>
                </div>
              ) : null}
              {fmt.gstCalculation ? (
                <div className="flex justify-between">
                  <span>GST</span>
                  <span>23.10</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t border-dashed border-border pt-1 font-semibold">
                <span>Total</span>
                <span>{fmt.gstCalculation ? "485.00" : "462.00"}</span>
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
                <Label>Display name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={draft.code}
                  className="font-mono uppercase"
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
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
                  <Label>Value</Label>
                  <Input
                    type="number"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (draft) store.upsertPromo(draft);
                setDraft(null);
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

export function PaymentModesSection() {
  const store = useStore();
  const [draft, setDraft] = useState<PaymentModeConfig | null>(null);

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
                    Protected
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={m.active}
                    onCheckedChange={(v) => store.setPaymentModeActive(m.id, v)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {m.active ? "Selectable" : "Hidden"}
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

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit payment mode" : "Add payment mode"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={draft.name}
                disabled={!draft.deletable}
                placeholder="e.g. Paytm Wallet"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              {!draft.deletable ? (
                <p className="text-xs text-muted-foreground">
                  Protected default modes can't be renamed.
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!draft?.name.trim()}
              onClick={() => {
                if (draft) store.upsertPaymentMode(draft);
                setDraft(null);
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
