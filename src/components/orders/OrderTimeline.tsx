import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Circle,
  Clock,
  Combine,
  HandCoins,
  LayoutGrid,
  MinusCircle,
  PauseCircle,
  Pencil,
  Printer,
  QrCode,
  Receipt,
  Save,
  Trash2,
  Undo2,
  UserRound,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, StatusBadge } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  orderApi,
  type RawTimelineEntry,
  type TimelineBill,
  type TimelineLine,
} from "@/lib/api";
import { money, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Order } from "@/mock/types";

// Order timeline (owner request 2026-10-03): every step of an order - items
// added and removed with their amounts, how the GST, service, packaging and
// delivery charges, discount and grand total changed, kitchen steps, table
// moves, prints, payments, cancel - newest first. The exe stores the whole
// order at each step (billerpe-local-exe helpers/timeline.js); each step is
// compared here with the one before it.

type Look = { label: string; icon: LucideIcon; tone: string };
const LOOKS: Record<string, Look> = {
  place_order: { label: "Order placed", icon: Receipt, tone: "bg-info-soft text-info" },
  save_order: { label: "Order saved · bill generated", icon: Save, tone: "bg-info-soft text-info" },
  kot: { label: "KOT sent to kitchen", icon: ChefHat, tone: "bg-warning-soft text-warning" },
  hold: { label: "Order held", icon: PauseCircle, tone: "bg-surface-muted text-muted-foreground" },
  settle: { label: "Bill settled", icon: CheckCircle2, tone: "bg-success-soft text-success" },
  update_order: { label: "Settled bill edited", icon: Pencil, tone: "bg-info-soft text-info" },
  update_order_item: { label: "Item updated", icon: Pencil, tone: "bg-info-soft text-info" },
  remove_kot: {
    label: "Item removed from KOT",
    icon: Trash2,
    tone: "bg-primary-soft text-primary",
  },
  decrease_kot_qty: {
    label: "Item quantity reduced",
    icon: MinusCircle,
    tone: "bg-warning-soft text-warning",
  },
  free_table: {
    label: "Table freed",
    icon: LayoutGrid,
    tone: "bg-surface-muted text-muted-foreground",
  },
  delete_order: { label: "Order cancelled", icon: Ban, tone: "bg-primary-soft text-primary" },
  move_table: { label: "Table moved", icon: ArrowRightLeft, tone: "bg-info-soft text-info" },
  merge_table: { label: "Tables merged", icon: Combine, tone: "bg-info-soft text-info" },
  merged_into: {
    label: "Merged into another table",
    icon: Combine,
    tone: "bg-surface-muted text-muted-foreground",
  },
  move_kot: { label: "KOT moved", icon: ArrowRightLeft, tone: "bg-info-soft text-info" },
  kds_stage: { label: "Kitchen", icon: ChefHat, tone: "bg-warning-soft text-warning" },
  kds_reject: { label: "Kitchen rejected", icon: Ban, tone: "bg-primary-soft text-primary" },
  kds_back: { label: "Kitchen moved back", icon: Undo2, tone: "bg-primary-soft text-primary" },
  bill_print: { label: "Bill printed", icon: Printer, tone: "bg-surface-muted text-foreground" },
  bill_reprint: { label: "Bill reprinted", icon: Printer, tone: "bg-warning-soft text-warning" },
  due_collected: { label: "Due collected", icon: HandCoins, tone: "bg-success-soft text-success" },
  qr_accept: { label: "QR order accepted", icon: QrCode, tone: "bg-info-soft text-info" },
  customer_removed: {
    label: "Customer removed",
    icon: UserX,
    tone: "bg-surface-muted text-muted-foreground",
  },
};
const DEFAULT_LOOK: Look = {
  label: "",
  icon: Circle,
  tone: "bg-surface-muted text-muted-foreground",
};
const KITCHEN_STAGE: Record<string, string> = {
  accepted: "accepted",
  preparing: "accepted · preparing",
  ready: "ready",
  served: "served",
};

// ---- reading a row ----------------------------------------------------------
const parse = <T,>(v: unknown, fallback: T): T => {
  let x = v;
  for (let i = 0; i < 2 && typeof x === "string"; i++) {
    try {
      x = JSON.parse(x);
    } catch {
      return fallback;
    }
  }
  return (x ?? fallback) as T;
};
const num = (v: unknown) => Number(v) || 0;

/** What an event was about (helpers/timeline.js `detail`). */
type Detail = {
  reason?: string;
  fromTable?: string;
  toTable?: string;
  fromBill?: string | null;
  intoBill?: string | null;
  kotNumber?: number;
  stage?: string;
  from?: string | null;
  items?: string[];
  copy?: number;
  amount?: number;
  mode?: string;
  stillDue?: number;
  accepted?: string[];
  rejected?: { item: string; reason: string }[];
};

/** A version-1 row's raw order line. */
type LegacyLine = {
  id?: number;
  MenuId?: number | null;
  hms_menu_mst?: { item_name?: string } | null;
  variant_name?: string;
  comment?: string;
  qty?: number;
  price?: number;
  kotNumber?: number | null;
  status?: string;
  kds_status?: string | null;
};

type Step = {
  id: number;
  action: string;
  at: Date;
  user: string;
  lines: TimelineLine[] | null;
  bill: TimelineBill | null;
  detail: Detail;
  /** Version 1 rows: only these totals were kept. */
  legacy: { grand: number; tax: number; service: number; discount: number } | null;
};

function toStep(t: RawTimelineEntry): Step {
  const v2 = Number(t.version) === 2;
  const rawItems = parse<unknown[]>(t.items, []);
  const lines: TimelineLine[] | null = v2
    ? (rawItems as TimelineLine[])
    : Array.isArray(rawItems) && rawItems.length
      ? (rawItems as LegacyLine[]).map((r) => {
          const qty = num(r.qty);
          const price = num(r.price);
          return {
            id: num(r.id),
            menuId: r.MenuId ?? null,
            name: r.hms_menu_mst?.item_name || "Item",
            variant: r.variant_name || "",
            addons: "",
            note: r.comment || "",
            qty,
            price,
            amount: Math.round(qty * price * 100) / 100,
            kot: r.kotNumber ?? null,
            status: r.status || "",
            kds: r.kds_status || "",
          };
        })
      : null;
  return {
    id: t.id,
    action: t.action,
    at: new Date(t.created_Date),
    user: t.hms_hotelUser_master?.name || t.creator || "Staff",
    lines,
    bill: v2 ? parse<TimelineBill | null>(t.bill, null) : null,
    detail: parse<Detail>(t.detail, {}) || {},
    legacy: v2
      ? null
      : {
          grand: num(t.grandAmount),
          tax: num(t.gst),
          service: num(t.service_charge),
          discount: num(t.discount),
        },
  };
}

// ---- what changed since the step before -------------------------------------
type ItemChange = { key: string; label: string; qty: number; amount: number };

// Lines are matched by what they are (dish, variant, add-ons), not by their
// row id: saving an order re-creates its lines with new ids. Not by the
// kitchen note either - a changed note is not an item removed and added.
const lineKey = (l: TimelineLine) => [l.menuId ?? l.name, l.variant, l.addons].join("|");
const lineLabel = (l: TimelineLine) =>
  [l.name, l.variant ? `(${l.variant})` : "", l.addons ? `+ ${l.addons}` : ""]
    .filter(Boolean)
    .join(" ");

function itemChanges(prev: TimelineLine[] | null, cur: TimelineLine[] | null) {
  if (!cur || !prev) return { added: [] as ItemChange[], removed: [] as ItemChange[] };
  const sum = (lines: TimelineLine[]) => {
    const m = new Map<string, { label: string; qty: number; amount: number }>();
    for (const l of lines) {
      const k = lineKey(l);
      const e = m.get(k) ?? { label: lineLabel(l), qty: 0, amount: 0 };
      e.qty += num(l.qty);
      e.amount += num(l.amount);
      m.set(k, e);
    }
    return m;
  };
  const a = sum(prev);
  const b = sum(cur);
  const added: ItemChange[] = [];
  const removed: ItemChange[] = [];
  for (const [k, now] of b) {
    const was = a.get(k);
    const dq = now.qty - (was?.qty ?? 0);
    if (dq > 0)
      added.push({
        key: k,
        label: now.label,
        qty: dq,
        amount: Math.round((now.amount - (was?.amount ?? 0)) * 100) / 100,
      });
    if (dq < 0)
      removed.push({
        key: k,
        label: now.label,
        qty: -dq,
        amount: Math.round(((was?.amount ?? 0) - now.amount) * 100) / 100,
      });
  }
  for (const [k, was] of a) {
    if (!b.has(k))
      removed.push({
        key: k,
        label: was.label,
        qty: was.qty,
        amount: Math.round(was.amount * 100) / 100,
      });
  }
  return { added, removed };
}

type Change = { label: string; from: string; to: string };

function billChanges(prev: TimelineBill | null, cur: TimelineBill | null): Change[] {
  if (!prev || !cur) return [];
  const out: Change[] = [];
  const amount = (label: string, a: number, b: number) => {
    if (Math.abs(num(a) - num(b)) >= 0.005)
      out.push({ label, from: money(a, { decimals: true }), to: money(b, { decimals: true }) });
  };
  amount("Item total", prev.subtotal, cur.subtotal);
  amount("Discount", prev.discount, cur.discount);
  const taxNames = new Set([...prev.taxes, ...cur.taxes].map((t) => t.name));
  for (const name of taxNames) {
    const p = prev.taxes.filter((t) => t.name === name).reduce((s, t) => s + num(t.amount), 0);
    const c = cur.taxes.filter((t) => t.name === name).reduce((s, t) => s + num(t.amount), 0);
    amount(name, p, c);
  }
  if (!taxNames.size) amount("Tax", prev.tax, cur.tax);
  amount("Service charge", prev.service, cur.service);
  amount("Packaging charge", prev.packaging, cur.packaging);
  amount("Delivery charge", prev.delivery, cur.delivery);
  amount("Round off", prev.roundOff, cur.roundOff);
  amount("Tip", prev.tip, cur.tip);
  amount("Grand total", prev.grand, cur.grand);
  if ((prev.discountReason || "") !== (cur.discountReason || "") && cur.discountReason) {
    out.push({
      label: "Discount reason",
      from: prev.discountReason || "—",
      to: cur.discountReason,
    });
  }
  const who = (c: TimelineBill["customer"]) =>
    c ? [c.name, c.number].filter(Boolean).join(" · ") : "—";
  if (who(prev.customer) !== who(cur.customer))
    out.push({ label: "Customer", from: who(prev.customer), to: who(cur.customer) });
  if ((prev.table || "") !== (cur.table || "") && prev.table && cur.table)
    out.push({ label: "Table", from: prev.table, to: cur.table });
  return out;
}

/** One line under the title: what the event itself was about. */
function detailText(s: Step): string | null {
  const d = s.detail;
  const str = (k: keyof Detail) => (d[k] == null ? "" : String(d[k]));
  const list = (k: "items" | "accepted") => (Array.isArray(d[k]) ? (d[k] ?? []).map(String) : []);
  switch (s.action) {
    case "delete_order":
      return str("reason") ? `Reason: ${str("reason")}` : null;
    case "move_table":
      return `${str("fromTable") || "—"} → ${str("toTable") || "—"}`;
    case "merge_table":
      return `${str("fromTable")} merged into this table (${str("toTable")})${str("fromBill") ? ` · bill #${str("fromBill")}` : ""}`;
    case "merged_into":
      return `Moved into ${str("toTable")}${str("intoBill") ? ` · bill #${str("intoBill")}` : ""}`;
    case "move_kot":
      return `KOT #${str("kotNumber")} · ${str("fromTable")} → ${str("toTable")}`;
    case "kds_stage":
    case "kds_back":
    case "kds_reject": {
      const items = list("items");
      return [
        str("kotNumber") ? `KOT #${str("kotNumber")}` : "",
        items.join(", "),
        str("reason") ? `"${str("reason")}"` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "bill_reprint":
      return str("copy") ? `Copy ${str("copy")}` : null;
    case "due_collected":
      return `${money(num(d.amount), { decimals: true })} by ${str("mode") || "—"}${num(d.stillDue) > 0 ? ` · still due ${money(num(d.stillDue), { decimals: true })}` : " · fully paid"}`;
    case "qr_accept": {
      const rejected = Array.isArray(d.rejected) ? d.rejected : [];
      return [
        list("accepted").length ? `Accepted: ${list("accepted").join(", ")}` : "",
        rejected.length
          ? `Refused: ${rejected.map((r) => `${r.item}${r.reason ? ` (${r.reason})` : ""}`).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    default:
      return null;
  }
}

function title(s: Step) {
  const look = LOOKS[s.action] ?? DEFAULT_LOOK;
  if (s.action === "kds_stage")
    return `Kitchen: ${KITCHEN_STAGE[String(s.detail.stage)] ?? s.detail.stage ?? "updated"}`;
  if (s.action === "kds_back")
    return `Kitchen moved back to ${KITCHEN_STAGE[String(s.detail.stage)] ?? s.detail.stage}`;
  if (s.action === "kot") {
    const kots = (s.lines ?? []).map((l) => num(l.kot)).filter(Boolean);
    return kots.length ? `KOT #${Math.max(...kots)} sent to kitchen` : look.label;
  }
  return look.label || s.action;
}

// ---- the full bill at one step -------------------------------------------------
function BillAt({ step }: { step: Step }) {
  const b = step.bill;
  const row = (
    label: string,
    value: number,
    opts: { strong?: boolean; negative?: boolean } = {},
  ) =>
    Math.abs(value) >= 0.005 || opts.strong ? (
      <div
        className={cn(
          "flex justify-between gap-3",
          opts.strong && "border-t border-border pt-1 font-semibold",
        )}
      >
        <span>{label}</span>
        <span className="num">
          {opts.negative ? "− " : ""}
          {money(value, { decimals: true })}
        </span>
      </div>
    ) : null;
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-muted/60 p-2.5 text-xs">
      {step.lines?.length ? (
        <table className="w-full">
          <tbody>
            {step.lines.map((l, i) => (
              <tr key={`${l.id}-${i}`} className="align-top">
                <td className="py-0.5 pr-2">
                  <span className="num font-medium">{l.qty}×</span> {lineLabel(l)}
                </td>
                <td className="num py-0.5 text-right">{money(l.amount, { decimals: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">No items</p>
      )}
      {b ? (
        <div className="space-y-0.5 border-t border-border pt-1.5">
          {row("Item total", b.subtotal)}
          {row(`Discount${b.discountReason ? ` (${b.discountReason})` : ""}`, b.discount, {
            negative: true,
          })}
          {b.taxes
            .filter((t) => Math.abs(num(t.amount)) >= 0.005)
            .map((t, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span>
                  {t.name}
                  {t.type === "pr" ? ` @ ${t.rate}%` : ""}
                </span>
                <span className="num">{money(t.amount, { decimals: true })}</span>
              </div>
            ))}
          {!b.taxes.length ? row("Tax", b.tax) : null}
          {row("Service charge", b.service)}
          {row("Packaging charge", b.packaging)}
          {row("Delivery charge", b.delivery)}
          {row("Round off", b.roundOff)}
          {row("Tip", b.tip)}
          {row("Grand total", b.grand, { strong: true })}
          {b.paid === "success" ? (
            <p className="pt-1 text-muted-foreground">
              Paid ·{" "}
              {[
                ["Cash", b.payment.cash],
                ["UPI", b.payment.upi],
                ["Card", b.payment.card],
                ...b.payment.other.map((o) => [o.name, o.amount] as [string, number]),
                ["Due", b.payment.due],
              ]
                .filter(([, v]) => num(v) > 0)
                .map(([k, v]) => `${k} ${money(num(v), { decimals: true })}`)
                .join(" · ") || "—"}
            </p>
          ) : null}
        </div>
      ) : step.legacy ? (
        <div className="space-y-0.5 border-t border-border pt-1.5">
          {row("Discount", step.legacy.discount, { negative: true })}
          {row("Tax", step.legacy.tax)}
          {row("Service charge", step.legacy.service)}
          {row("Grand total", step.legacy.grand, { strong: true })}
          <p className="pt-1 text-muted-foreground">Recorded before full bill details were kept.</p>
        </div>
      ) : null}
    </div>
  );
}

function StepCard({ step, prev, last }: { step: Step; prev: Step | null; last: boolean }) {
  const [open, setOpen] = useState(false);
  const look = LOOKS[step.action] ?? DEFAULT_LOOK;
  const Icon = look.icon;
  const { added, removed } = itemChanges(prev?.lines ?? null, step.lines);
  // A move already says which tables, in its detail line.
  const moved = ["move_table", "merge_table", "merged_into", "move_kot"].includes(step.action);
  const changes = billChanges(prev?.bill ?? null, step.bill).filter(
    (c) => !(moved && c.label === "Table"),
  );
  const firstStep = !prev;
  const info = detailText(step);
  const grand = step.bill?.grand ?? step.legacy?.grand ?? null;
  const kitchenOnly = step.action.startsWith("kds_");

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0" data-timeline-action={step.action}>
      {!last ? (
        <span className="absolute bottom-0 left-4 top-9 w-px bg-border" aria-hidden />
      ) : null}
      <span
        className={cn(
          "relative z-10 grid size-8 shrink-0 place-items-center rounded-full",
          look.tone,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">{title(step)}</span>
          <span className="num text-xs text-muted-foreground">
            {Number.isNaN(step.at.getTime())
              ? ""
              : step.at.toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <UserRound className="size-3" /> {step.user}
        </p>
        {info ? <p className="mt-1.5 text-xs">{info}</p> : null}

        {!kitchenOnly && (added.length || removed.length || (firstStep && step.lines?.length)) ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(firstStep ? itemChanges([], step.lines).added : added).map((c) => (
              <li
                key={`a-${c.key}`}
                className="rounded-md bg-success-soft px-2 py-0.5 text-xs text-success"
              >
                + {c.qty} × {c.label}{" "}
                <span className="num font-medium">{money(c.amount, { decimals: true })}</span>
              </li>
            ))}
            {removed.map((c) => (
              <li
                key={`r-${c.key}`}
                className="rounded-md bg-primary-soft px-2 py-0.5 text-xs text-primary line-through decoration-primary/40"
              >
                − {c.qty} × {c.label}{" "}
                <span className="num font-medium">{money(c.amount, { decimals: true })}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {!kitchenOnly && changes.length ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {changes.map((c) => (
              <div key={c.label} className="contents">
                <dt className="text-muted-foreground">{c.label}</dt>
                <dd className="num">
                  <span className="text-muted-foreground">{c.from}</span> →{" "}
                  <span className="font-medium">{c.to}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          {grand != null ? (
            <span className="text-xs text-muted-foreground">
              Total at this step{" "}
              <span className="num font-semibold text-foreground">
                {money(grand, { decimals: true })}
              </span>
            </span>
          ) : (
            <span />
          )}
          {step.lines || step.bill || step.legacy ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1 text-xs font-medium text-info"
            >
              {open ? "Hide bill" : "Full bill"}
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          ) : null}
        </div>
        {open ? <BillAt step={step} /> : null}
      </div>
    </li>
  );
}

export function OrderTimelineDialog({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  useCurrency();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [showKitchen, setShowKitchen] = useState(true);

  useEffect(() => {
    setSteps([]);
    if (!order?.backendId) return;
    let cancelled = false;
    setLoading(true);
    orderApi
      .getTimeline(order.backendId)
      .then(({ timesLines }) => {
        if (cancelled) return;
        // Oldest first, to compare each step with the one before it.
        setSteps(
          timesLines.map(toStep).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id),
        );
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(err instanceof ApiError ? err.message : "Could not load the order timeline");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.backendId]);

  // Newest first on screen; each card still diffs against the step before.
  const rows = useMemo(() => {
    const withPrev = steps.map((s, i) => {
      // The previous step that described the order (kitchen steps change nothing on the bill).
      let j = i - 1;
      while (j >= 0 && !steps[j].lines && !steps[j].bill) j--;
      return { step: s, prev: j >= 0 ? steps[j] : null };
    });
    return withPrev.filter((r) => showKitchen || !r.step.action.startsWith("kds_")).reverse();
  }, [steps, showKitchen]);

  const latest = [...steps].reverse().find((s) => s.bill || s.legacy) ?? null;
  const first = steps[0] ?? null;
  const kitchenCount = steps.filter((s) => s.action.startsWith("kds_")).length;
  const itemCount = latest?.lines?.reduce((n, l) => n + num(l.qty), 0) ?? 0;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Timeline · Order #{order?.orderNo}</DialogTitle>
            {order ? <StatusBadge status={order.status} /> : null}
          </div>
          <DialogDescription>
            Every change to this order, newest first. Open "Full bill" to see the bill at that
            moment.
          </DialogDescription>
        </DialogHeader>

        {steps.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [
                "Total now",
                latest
                  ? money(latest.bill?.grand ?? latest.legacy?.grand ?? 0, { decimals: true })
                  : "—",
              ],
              ["Items", String(itemCount)],
              ["Changes", String(steps.length)],
              [
                "Opened",
                first && !Number.isNaN(first.at.getTime())
                  ? first.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                  : "—",
              ],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-muted/70 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className="num text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
        ) : null}

        {kitchenCount ? (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showKitchen}
              onChange={(e) => setShowKitchen(e.target.checked)}
            />
            Show kitchen steps ({kitchenCount})
          </label>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading timeline…</p>
        ) : rows.length ? (
          <ol className="mt-1">
            {rows.map((r, i) => (
              <StepCard key={r.step.id} step={r.step} prev={r.prev} last={i === rows.length - 1} />
            ))}
          </ol>
        ) : order && !order.backendId ? (
          <EmptyState compact icon={Clock} title="Not synced with the server yet" />
        ) : (
          <EmptyState compact icon={Clock} title="No recorded changes yet" />
        )}
      </DialogContent>
    </Dialog>
  );
}
