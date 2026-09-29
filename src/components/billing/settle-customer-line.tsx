import { User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStore } from "@/mock/store";
import type { Order } from "@/mock/types";

/** The customer on a bill being settled, with "Remove" (owner list
 * 2026-09-29 #4). Removing is blocked while part of the payment is Due -
 * a due amount needs the customer's mobile. */
export function SettleCustomerLine({ order, hasDue }: { order: Order; hasDue: boolean }) {
  const store = useStore();
  if (!order.customerName && !order.customerPhone) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"
      data-settle-customer
    >
      <User className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {order.customerName || "Customer"}
        {order.customerPhone ? (
          <span className="num text-muted-foreground"> · {order.customerPhone}</span>
        ) : null}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={hasDue}
        title={hasDue ? "Due needs the customer - remove the Due payment first" : undefined}
        onClick={() => void store.setCustomer(order.id, "", "")}
      >
        <X className="size-3.5" /> Remove
      </Button>
    </div>
  );
}
