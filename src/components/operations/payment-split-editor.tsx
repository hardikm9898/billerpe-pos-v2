import { Plus, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { IconButton, Money } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { OpsOrderType, PaymentSplit } from "@/mock/types";

// The bill-splitting rules live in lib/payments.ts so the store can use them
// too (this component imports the store, so it cannot be their home).
export { splitCheck, splitPaid } from "@/lib/payments";
import { splitCheck, splitPaid } from "@/lib/payments";

// Mirrors uat-backend's own QR construction (controller/kto.js's
// getHearderAndFooterData: pa left unencoded, pn/tn encoded, cu fixed to
// INR) and InvoiceFormatSection's settings-preview QR - generated
// client-side since it's a pure function of (upiId, amount), gated by the
// RestaurantSetting.qr_code_open_on_settle toggle (store.qrOnSettle).
export function UpiQrPanel({ upiId, amount }: { upiId: string; amount: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const store = useStore();
  // The name a customer's UPI app shows as the payee - must be the real
  // restaurant, never a placeholder.
  const payeeName = store.restaurant?.name ?? store.serverHotelName ?? "";

  useEffect(() => {
    if (!upiId || amount <= 0) {
      setDataUrl(null);
      return;
    }
    const merchantName = encodeURIComponent(payeeName);
    const transactionNote = encodeURIComponent(`Bill Payment - ${amount}`);
    const upiUrl = `upi://pay?pa=${upiId}&pn=${merchantName}&tn=${transactionNote}&am=${amount}&cu=INR`;
    let cancelled = false;
    QRCode.toDataURL(upiUrl, { width: 160, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [upiId, amount]);

  if (!dataUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3">
      <img src={dataUrl} alt="UPI payment QR code" className="size-40" />
      <p className="num text-xs text-muted-foreground">Scan to pay ₹{amount} via UPI</p>
    </div>
  );
}

/** Multi-row payment split editor — one or more modes that must add up to `total`. */
export function PaymentSplitEditor({
  splits,
  onChange,
  total,
  excludeModes,
  orderType,
  tableCategoryId,
}: {
  splits: PaymentSplit[];
  onChange: (splits: PaymentSplit[]) => void;
  total: number;
  /** Modes to hide from the picker - e.g. "Due" on the Due Bills settle
   * dialog: collecting against an existing due can't itself be "more due"
   * (settleDueBills refuses it; every other mode, the outlet's own too, is
   * accepted). */
  excludeModes?: string[];
  /** Order Type Settings -> Default payment mode context - which default
   * to resolve when a new split row is added. Omit either (e.g. Due Bills'
   * settle dialog, which isn't scoped to one order) to just fall back to
   * the first active mode, same as before this existed. */
  orderType?: OpsOrderType;
  tableCategoryId?: string;
}) {
  const store = useStore();
  const activeModes = store.paymentModes.filter((m) => m.active && !excludeModes?.includes(m.name));
  const paid = splitPaid(splits);
  const due = Math.round((total - paid) * 100) / 100;
  const check = splitCheck(splits, total);
  const upiAmount = splits.filter((p) => p.mode === "UPI").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-2">
      {store.qrOnSettle && store.invoiceFormat.upiId && upiAmount > 0 ? (
        <UpiQrPanel upiId={store.invoiceFormat.upiId} amount={upiAmount} />
      ) : null}
      <div className="rounded-xl bg-surface-muted p-3">
        <div className="flex items-center justify-between text-sm">
          <span>Total</span>
          <Money value={total} className="font-semibold" />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span>{check.change > 0 ? "Return to customer" : "Balance"}</span>
          <Money
            value={check.change > 0 ? check.change : due}
            className={cn(
              "font-semibold",
              check.change > 0 ? "text-success" : due !== 0 && "text-primary",
            )}
          />
        </div>
        {check.problem ? (
          <p className="mt-1.5 text-xs font-medium text-destructive">{check.problem}</p>
        ) : null}
      </div>

      {splits.map((p, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={p.mode}
            onChange={(e) =>
              onChange(splits.map((x, i) => (i === idx ? { ...x, mode: e.target.value } : x)))
            }
            className="h-10 rounded-lg border border-input bg-surface px-2 text-sm"
          >
            {activeModes.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            className="num"
            value={p.amount}
            onChange={(e) =>
              onChange(
                splits.map((x, i) =>
                  i === idx ? { ...x, amount: Number(e.target.value) || 0 } : x,
                ),
              )
            }
          />
          <IconButton
            label="Remove split"
            onClick={() => onChange(splits.filter((_, i) => i !== idx))}
          >
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...splits,
            {
              mode: orderType
                ? store.resolveDefaultPaymentMode(orderType, tableCategoryId)
                : (activeModes[0]?.name ?? "Cash"),
              amount: Math.max(0, due),
            },
          ])
        }
      >
        <Plus className="size-4" /> Add payment mode
      </Button>
    </div>
  );
}
