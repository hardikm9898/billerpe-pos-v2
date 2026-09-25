import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Download, Search } from "lucide-react";

import { DataTable, EmptyState, Money, SectionCard, StatCard } from "@/components/kit";
import { fmtQty } from "@/components/stock/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, stockLedgerApi, type RawStockLedger, type RawStockLedgerMove } from "@/lib/api";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";

// Stock Ledger (owner request, 2026-09-25): for any period, per raw
// material - what was on hand at the start, what came in, what orders
// used, what was wasted, manual corrections, and what is left - in
// quantity and value. Tapping a material lists every movement day by day
// with a running balance and who did it. Everything comes from the exe's
// stock journal (billerpe-local-exe services/stockLedger.js), the one
// place every stock change is written.

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;

function rangeOf(p: Preset, from: string, to: string): [string, string] {
  const now = new Date();
  const today = iso(now);
  switch (p) {
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return [iso(y), iso(y)];
    }
    case "week": {
      // Monday to today
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return [iso(start), today];
    }
    case "month":
      return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case "lastMonth":
      return [
        iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      ];
    case "custom":
      return [from || today, to || from || today];
    default:
      return [today, today];
  }
}

const MOVE_LABEL: Record<string, string> = {
  opening: "Opening balance",
  purchase: "Purchase",
  purchase_edit: "Purchase edited",
  purchase_delete: "Purchase deleted",
  requisition: "Requisition received",
  consumption: "Used in order",
  consumption_reversal: "Order changed - returned",
  production_use: "Used in production",
  wastage: "Wastage",
  wastage_reversal: "Wastage deleted",
  stock_in: "Stock in",
  stock_out: "Stock out",
  adjustment: "Stock count / correction",
};

const dmy = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
};

/** Formats a stock qty (kept in the purchase unit) for reading. */
type QtyFmt = (qty: number) => string;
/** Less than one purchase unit reads better in the usage unit: "20 g", not "0.02 kg". */
function qtyFormatter(m?: { unit: string; purchaseUnit: string; conversion: number }): QtyFmt {
  return (qty) => {
    const a = Math.abs(qty);
    const text =
      m && m.conversion > 1 && a > 0 && a < 1
        ? `${fmtQty(Math.round(a * m.conversion * 1000) / 1000)} ${m.unit}`
        : `${fmtQty(a)} ${m?.purchaseUnit ?? ""}`;
    return qty < 0 ? `−${text}` : text;
  };
}

function Signed({ qty, fmt }: { qty: number; fmt: QtyFmt }) {
  if (!qty) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={cn("num", qty < 0 ? "text-destructive" : "text-success")}>
      {qty > 0 ? "+" : ""}
      {fmt(qty)}
    </span>
  );
}

/** Period picker shared by the stock reports: presets + custom range. */
export function usePeriod(initial: Preset = "today") {
  const [preset, setPreset] = useState<Preset>(initial);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [start, end] = rangeOf(preset, customFrom, customTo);
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, start, end };
}

export function PeriodBar({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, start, end } =
    period;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            onClick={() => setPreset(p.key)}
            data-ledger-preset={p.key}
          >
            {p.label}
          </Button>
        ))}
        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              className="h-9 w-40"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To"
              className="h-9 w-40"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground" data-ledger-range>
          {start === end ? dmy(start) : `${dmy(start)} – ${dmy(end)}`}
        </span>
      </div>
      {start > end ? (
        <p className="mb-3 text-xs text-destructive">The start date is after the end date.</p>
      ) : null}
    </>
  );
}

/** The ledger for the chosen period, reloaded when it changes. */
export function useLedger(start: string, end: string) {
  const [data, setData] = useState<RawStockLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (start > end) return;
    let cancelled = false;
    setLoading(true);
    setFailed(null);
    stockLedgerApi
      .summary(start, end)
      .then((d) => !cancelled && setData(d))
      .catch(
        (err) =>
          !cancelled &&
          setFailed(err instanceof ApiError ? err.message : "Could not load the stock ledger"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [start, end]);
  return { data, loading, failed };
}

export function StockLedgerReport() {
  const store = useStore();
  const period = usePeriod();
  const { start, end } = period;
  const { data, loading, failed } = useLedger(start, end);
  const [query, setQuery] = useState("");
  const [movedOnly, setMovedOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const unitOf = (id: number) =>
    store.rawMaterials.find((m) => m.id === String(id))?.purchaseUnit ?? "";
  const fmtOf = (id: number) => qtyFormatter(store.rawMaterials.find((m) => m.id === String(id)));
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (q && !r.raw_material_name.toLowerCase().includes(q)) return false;
      if (movedOnly && !r.purchased_qty && !r.used_qty && !r.wastage_qty && !r.manual_qty)
        return false;
      return true;
    });
  }, [data, query, movedOnly]);
  const negative = (data?.rows ?? []).filter((r) => r.closing_qty < -1e-9);

  const exportCsv = () => {
    const header = [
      "Material",
      "Unit",
      "Opening qty",
      "Opening value",
      "Purchased qty",
      "Purchased value",
      "Used qty",
      "Used value",
      "Wastage qty",
      "Wastage value",
      "Manual qty",
      "Manual value",
      "Closing qty",
      "Closing value",
    ];
    const body = rows.map((r) => [
      r.raw_material_name,
      unitOf(r.raw_material_id),
      r.opening_qty,
      r.opening_value,
      r.purchased_qty,
      r.purchased_value,
      r.used_qty,
      r.used_value,
      r.wastage_qty,
      r.wastage_value,
      r.manual_qty,
      r.manual_value,
      r.closing_qty,
      r.closing_value,
    ]);
    downloadTextFile(`stock-ledger-${start}-to-${end}.csv`, toCsv([header, ...body]));
  };

  return (
    <>
      <PeriodBar period={period} />

      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        <StatCard
          label="Opening value"
          value={<Money value={Math.round(data?.totals.opening_value ?? 0)} />}
        />
        <StatCard
          label="Purchased"
          value={<Money value={Math.round(data?.totals.purchased_value ?? 0)} />}
        />
        <StatCard
          label="Used in orders"
          value={<Money value={Math.round(Math.abs(data?.totals.used_value ?? 0))} />}
        />
        <StatCard
          label="Wastage"
          value={<Money value={Math.round(Math.abs(data?.totals.wastage_value ?? 0))} />}
        />
        <StatCard
          label="Closing value"
          value={<Money value={Math.round(data?.totals.closing_value ?? 0)} />}
          tone="primary"
        />
      </div>

      {negative.length ? (
        <div
          className="mb-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          data-ledger-negative
        >
          <span className="font-medium text-destructive">Negative stock: </span>
          {negative
            .map(
              (r) =>
                `${r.raw_material_name} (${fmtQty(r.closing_qty)} ${unitOf(r.raw_material_id)})`,
            )
            .join(", ")}
          <span className="text-muted-foreground">
            {" "}
            - orders used more than was recorded. Count it in Stock In-Hand or record the purchase.
          </span>
        </div>
      ) : null}

      <SectionCard
        title="Stock ledger"
        bodyClassName="p-3 sm:p-4"
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Search material"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={movedOnly}
              onChange={(e) => setMovedOnly(e.target.checked)}
            />
            Only materials that moved
          </label>
          {loading ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
        </div>
        {failed ? <p className="py-6 text-center text-sm text-destructive">{failed}</p> : null}
        <DataTable
          rows={rows}
          keyFn={(r) => String(r.raw_material_id)}
          empty={
            <EmptyState icon={BookOpenText} title="No stock movements in this period" compact />
          }
          onRowClick={(r) => setOpenId(r.raw_material_id)}
          columns={[
            {
              key: "name",
              header: "Material",
              cell: (r) => (
                <span className="font-medium" data-ledger-material>
                  {r.raw_material_name}
                </span>
              ),
            },
            ...(["opening", "purchased", "used", "wastage", "manual"] as const).map((k) => ({
              key: k,
              header: {
                opening: "Opening",
                purchased: "+ Purchased",
                used: "− Used",
                wastage: "− Wastage",
                manual: "± Manual",
              }[k],
              cell: (r: RawStockLedger["rows"][number]) => (
                <div className="leading-tight" data-ledger-col={k}>
                  {k === "opening" ? (
                    <span className="num">{fmtOf(r.raw_material_id)(r.opening_qty)}</span>
                  ) : (
                    <Signed qty={r[`${k}_qty`]} fmt={fmtOf(r.raw_material_id)} />
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    <Money value={Math.round(Math.abs(r[`${k}_value`]))} />
                  </div>
                </div>
              ),
            })),
            {
              key: "closing",
              header: "= Closing",
              cell: (r) => (
                <div className="leading-tight" data-ledger-col="closing">
                  <span
                    className={cn("num font-semibold", r.closing_qty < -1e-9 && "text-destructive")}
                  >
                    {fmtOf(r.raw_material_id)(r.closing_qty)}
                  </span>
                  <div className="text-[11px] text-muted-foreground">
                    <Money value={Math.round(r.closing_value)} />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      <LedgerDetail
        rawMaterialId={openId}
        start={start}
        end={end}
        fmt={fmtOf(openId ?? 0)}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function LedgerDetail({
  rawMaterialId,
  start,
  end,
  fmt,
  onClose,
}: {
  rawMaterialId: number | null;
  start: string;
  end: string;
  fmt: QtyFmt;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{
    raw_material_name: string;
    opening_qty: number;
    closing_qty: number;
    rows: RawStockLedgerMove[];
  } | null>(null);
  useEffect(() => {
    if (!rawMaterialId) return setDetail(null);
    let cancelled = false;
    stockLedgerApi
      .detail(rawMaterialId, start, end)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [rawMaterialId, start, end]);

  // Grouped by business date, oldest first, as the balance runs.
  const days = useMemo(() => {
    const map = new Map<string, RawStockLedgerMove[]>();
    for (const r of detail?.rows ?? []) {
      if (!map.has(r.business_date)) map.set(r.business_date, []);
      map.get(r.business_date)!.push(r);
    }
    return [...map.entries()];
  }, [detail]);

  return (
    <Sheet open={!!rawMaterialId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-ledger-detail>
        <SheetHeader>
          <SheetTitle>{detail?.raw_material_name ?? "Stock movements"}</SheetTitle>
        </SheetHeader>
        {detail ? (
          <div className="space-y-4 p-4">
            <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
              <span>Opening {dmy(start)}</span>
              <span className="num font-semibold">{fmt(detail.opening_qty)}</span>
            </div>
            {days.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                No movements in this period.
              </p>
            ) : null}
            {days.map(([day, moves]) => (
              <div key={day}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{dmy(day)}</p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {moves.map((m) => (
                    <li
                      key={m.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm"
                      data-ledger-move={m.type}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{MOVE_LABEL[m.type] ?? m.type}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {m.ref_label ? ` · ${m.ref_label}` : ""}
                          {m.user ? ` · ${m.user}` : ""}
                          {m.note ? ` · ${m.note}` : ""}
                        </p>
                      </div>
                      <Signed qty={m.qty} fmt={fmt} />
                      <span
                        className={cn(
                          "num w-24 text-right text-xs",
                          m.balance < -1e-9 && "text-destructive",
                        )}
                      >
                        = {fmt(m.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
              <span>Closing {dmy(end)}</span>
              <span
                className={cn(
                  "num font-semibold",
                  detail.closing_qty < -1e-9 && "text-destructive",
                )}
              >
                {fmt(detail.closing_qty)}
              </span>
            </div>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
