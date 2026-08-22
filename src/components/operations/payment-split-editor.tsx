import { Plus, X } from "lucide-react";

import { Money } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { PaymentSplit } from "@/mock/types";

export function splitPaid(splits: PaymentSplit[]) {
  return splits.reduce((s, p) => s + p.amount, 0);
}

/** Multi-row payment split editor — one or more modes that must add up to `total`. */
export function PaymentSplitEditor({
  splits,
  onChange,
  total,
}: {
  splits: PaymentSplit[];
  onChange: (splits: PaymentSplit[]) => void;
  total: number;
}) {
  const store = useStore();
  const activeModes = store.paymentModes.filter((m) => m.active);
  const paid = splitPaid(splits);
  const due = Math.round((total - paid) * 100) / 100;

  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-surface-muted p-3">
        <div className="flex items-center justify-between text-sm">
          <span>Total</span>
          <Money value={total} className="font-semibold" />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span>Balance</span>
          <Money value={due} className={cn("font-semibold", due !== 0 && "text-primary")} />
        </div>
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
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(splits.filter((_, i) => i !== idx))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...splits, { mode: activeModes[0]?.name ?? "Cash", amount: Math.max(0, due) }])
        }
      >
        <Plus className="size-4" /> Add payment mode
      </Button>
    </div>
  );
}
