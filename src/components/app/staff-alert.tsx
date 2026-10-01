import { BellRing, ChefHat, QrCode, ReceiptText, X } from "lucide-react";
import { toast } from "sonner";

import { playStaffAlertSound } from "@/lib/alertSound";
import { cn } from "@/lib/utils";

// The one pop-up for things a cashier or manager must act on (owner list
// 2026-09-30 #6): a captain asked for a bill, a QR order came in, the
// kitchen rejected an item. Rings, and stays on screen until someone opens
// or closes it - a plain toast vanished in seconds and was easy to miss.
export type StaffAlertKind = "bill-request" | "qr-order" | "kitchen-reject";

const META: Record<StaffAlertKind, { icon: typeof BellRing; tone: string; label: string }> = {
  "bill-request": { icon: ReceiptText, tone: "border-l-primary", label: "Bill request" },
  "qr-order": { icon: QrCode, tone: "border-l-info", label: "QR order" },
  "kitchen-reject": { icon: ChefHat, tone: "border-l-destructive", label: "Kitchen rejected" },
};

const shown = new Set<string>();

export function showStaffAlert(alert: {
  id: string;
  kind: StaffAlertKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  // One pop-up per event, even if it arrives twice (socket reconnect, poll).
  if (shown.has(alert.id)) return;
  shown.add(alert.id);
  playStaffAlertSound(alert.kind === "qr-order" ? "double" : "triple");
  const meta = META[alert.kind];
  const Icon = meta.icon;
  toast.custom(
    (t) => (
      <div
        role="alert"
        data-staff-alert={alert.kind}
        className={cn(
          "flex w-[min(92vw,380px)] items-start gap-3 rounded-xl border border-border border-l-4 bg-surface p-3 shadow-lg",
          meta.tone,
        )}
      >
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </p>
          <p className="text-sm font-semibold leading-snug">{alert.title}</p>
          {alert.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
          ) : null}
          {alert.onAction ? (
            <button
              type="button"
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              onClick={() => {
                toast.dismiss(t);
                alert.onAction?.();
              }}
            >
              {alert.actionLabel ?? "Open"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
          onClick={() => toast.dismiss(t)}
        >
          <X className="size-4" />
        </button>
      </div>
    ),
    { id: alert.id, duration: Infinity },
  );
}
