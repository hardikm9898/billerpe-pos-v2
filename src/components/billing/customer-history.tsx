import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Money } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiError, customerApi, type RawOrderDetail } from "@/lib/api";
import { parseOrderAddons, useStore } from "@/mock/store";

/**
 * What this customer owes and what they ordered last time, shown under the
 * mobile field of the customer dialog as soon as a full 10-digit number is
 * typed. The touch table screen had this; the keyboard screen did not, so a
 * cashier billing by keyboard could not see a customer's dues or repeat their
 * usual order (owner report, 2026-09-22). One component now, used by both.
 */
export function CustomerHistoryPanel({
  digits,
  orderId,
  backendId,
}: {
  /** Digits typed so far - nothing is looked up until there are 10. */
  digits: string;
  /** The order being billed, for "Repeat this order". */
  orderId: string;
  /** Kept out of the look-up, so a returning customer's brand-new order
   * cannot suggest itself. */
  backendId?: number;
}) {
  const store = useStore();
  const [lastOrder, setLastOrder] = useState<RawOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const complete = digits.length === 10;

  const dueBills = complete
    ? store.dueBills.filter((b) => b.mobile === digits && b.status === "Due")
    : [];
  const dueTotal = dueBills.reduce((sum, b) => sum + b.amount, 0);

  useEffect(() => {
    if (!complete) {
      setLastOrder(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    customerApi
      .getLastOrder(digits, backendId)
      .then(({ order: found }) => {
        if (!cancelled) setLastOrder(found);
      })
      .catch((err) => {
        if (cancelled) return;
        setLastOrder(null);
        console.error(
          "[customer] Could not load last order:",
          err instanceof ApiError ? err.message : err,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [digits, complete, backendId]);

  // Re-added as fresh lines priced from today's menu (never the old order's
  // possibly-stale price); an item since removed or turned off is skipped.
  const repeat = () => {
    if (!lastOrder) return;
    let added = 0;
    for (const line of lastOrder.hms_orderDetails) {
      const itemId = String(line.MenuId);
      if (!store.menuItems.some((m) => m.id === itemId && m.active)) continue;
      store.addLine(orderId, {
        itemId,
        qty: line.qty,
        variant: line.variant_name ?? undefined,
        addons: parseOrderAddons(line.addons),
        note: line.comment || undefined,
      });
      added += 1;
    }
    if (added === 0) toast.error("None of those items are on the menu anymore");
    else toast.success(`Added ${added} item${added === 1 ? "" : "s"} from their last order`);
  };

  if (!complete) return null;

  return (
    <>
      {dueBills.length ? (
        <p className="mt-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
          Outstanding due: <Money value={dueTotal} className="font-semibold" /> · {dueBills.length}{" "}
          bill{dueBills.length > 1 ? "s" : ""}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Checking their last order…</p>
      ) : null}
      {!loading && lastOrder ? (
        <div className="mt-1.5 space-y-1.5 rounded-lg bg-surface-muted px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="size-3.5" /> Last order · Bill #{lastOrder.bill_no}
          </p>
          <p className="text-xs">
            {lastOrder.hms_orderDetails
              .map((l) => `${l.qty}× ${l.hms_menu_mst?.item_name ?? "Item"}`)
              .join(", ")}
          </p>
          <Button size="sm" variant="outline" className="w-full" onClick={repeat}>
            <History className="size-3.5" /> Repeat this order
          </Button>
        </div>
      ) : null}
    </>
  );
}
