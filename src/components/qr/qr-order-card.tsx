import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RawPendingQrOrder } from "@/lib/api";

// One pending QR round in the staff inbox. Staff accept or reject each item
// (owner rule, 2026-09-24): a rejected item needs a reason, which the
// customer sees on their phone next to that dish. Accepted items go to the
// order and the kitchen; rejected ones never do.
export const QR_REJECT_REASONS = ["Out of stock", "Not available right now", "Kitchen closed"];

export type QrItemDecision = { accepted: boolean; reason?: string };

function ReasonPicker({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (reason: string) => void;
  testId: string;
}) {
  const isQuick = QR_REJECT_REASONS.includes(value);
  const [other, setOther] = useState(!isQuick && value !== "");
  return (
    <div className="mt-1.5 space-y-1.5" data-qr-reasons={testId}>
      <div className="flex flex-wrap gap-1.5">
        {QR_REJECT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setOther(false);
              onChange(r);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              value === r && !other
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground",
            )}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setOther(true);
            if (isQuick) onChange("");
          }}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            other
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground",
          )}
        >
          Other
        </button>
      </div>
      {other ? (
        <Input
          autoFocus
          className="h-8 text-xs"
          maxLength={120}
          placeholder="Reason the customer will see"
          value={isQuick ? "" : value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}

export function QrOrderCard({
  order,
  busy,
  onAccept,
  onRejectAll,
  header,
  footer,
}: {
  order: RawPendingQrOrder;
  busy: boolean;
  onAccept: (decisions: QrItemDecision[]) => void;
  onRejectAll: (reason: string) => void;
  header: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [decisions, setDecisions] = useState<QrItemDecision[]>(() =>
    order.items.map(() => ({ accepted: true })),
  );
  const [rejectAllOpen, setRejectAllOpen] = useState(false);
  const [rejectAllReason, setRejectAllReason] = useState("");

  const setOne = (i: number, d: QrItemDecision) =>
    setDecisions((all) => all.map((x, j) => (j === i ? d : x)));
  const acceptedCount = decisions.filter((d) => d.accepted).length;
  const missingReason = decisions.some((d) => !d.accepted && !d.reason?.trim());

  return (
    <div className="rounded-lg border border-border p-3" data-qr-order={order.id}>
      {header}
      <ul className="mt-2 space-y-2 text-sm">
        {order.items.map((item, i) => {
          const d = decisions[i]!;
          return (
            <li key={i} data-qr-item={i}>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate",
                    !d.accepted && "text-muted-foreground line-through",
                  )}
                >
                  {item.qty} × {item.itemName}
                  {item.variantName ? ` (${item.variantName})` : ""}
                  {item.addonNames?.length ? ` + ${item.addonNames.join(", ")}` : ""}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Accept ${item.itemName}`}
                    aria-pressed={d.accepted}
                    disabled={busy}
                    onClick={() => setOne(i, { accepted: true })}
                    className={cn(
                      "grid size-7 place-items-center rounded-md border",
                      d.accepted
                        ? "border-success bg-success/15 text-success"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Reject ${item.itemName}`}
                    aria-pressed={!d.accepted}
                    disabled={busy}
                    onClick={() => setOne(i, { accepted: false, reason: d.reason ?? "" })}
                    className={cn(
                      "grid size-7 place-items-center rounded-md border",
                      !d.accepted
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
              {item.comment ? (
                <p className="text-xs text-muted-foreground">{item.comment}</p>
              ) : null}
              {!d.accepted ? (
                <ReasonPicker
                  testId={String(i)}
                  value={d.reason ?? ""}
                  onChange={(reason) => setOne(i, { accepted: false, reason })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {footer}
      {rejectAllOpen ? (
        <div className="mt-3 rounded-md border border-dashed border-destructive/40 p-2">
          <p className="text-xs font-medium">Why is this whole order rejected?</p>
          <ReasonPicker testId="all" value={rejectAllReason} onChange={setRejectAllReason} />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => setRejectAllOpen(false)}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={busy || !rejectAllReason.trim()}
              onClick={() => onRejectAll(rejectAllReason.trim())}
            >
              Reject order
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={busy || missingReason}
            variant={acceptedCount === 0 ? "destructive" : "default"}
            onClick={() => onAccept(decisions)}
          >
            {acceptedCount === 0
              ? "Reject order"
              : acceptedCount === order.items.length
                ? "Accept"
                : `Accept ${acceptedCount} of ${order.items.length}`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => setRejectAllOpen(true)}
          >
            Reject all
          </Button>
        </div>
      )}
      {missingReason ? (
        <p className="mt-1.5 text-xs text-destructive">Pick a reason for each rejected item.</p>
      ) : null}
    </div>
  );
}
