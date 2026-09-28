import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, HandCoins } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, dueReceiptApi, type RawDueReceipt } from "@/lib/api";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { cs } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, addDays, dmyToIso, type RangeKey, realToday, resolveRange } from "@/mock/format";

export const Route = createFileRoute("/_shell/reports/due-received")({
  head: () => ({
    meta: [
      { title: "Due Received · BillerPe" },
      { name: "description", content: "Payments received against due bills." },
    ],
  }),
  component: DueReceivedReport,
});

// "YYYY-MM-DD" -> "DD/MM/YYYY"
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Every payment taken against a bill kept as Due (billerpe-local-exe
// controller/dueReceipts.js): when it came in, for which bill, from whom, how
// much, in which mode, who took it and what is still due on that bill (owner
// decision, 2026-09-28). Records start with this update - there is no history
// of payments received before it.
function DueReceivedReport() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(dmyToIso(addDays(realToday(), -6)));
  const [customTo, setCustomTo] = useState(dmyToIso(realToday()));
  const [mode, setMode] = useState("all");
  const { from, to } = useMemo(
    () => resolveRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const isoFrom = dmyToIso(from);
  const isoTo = dmyToIso(to);
  const [data, setData] = useState<{
    receipts: RawDueReceipt[];
    byMode: Record<string, number>;
    total: number;
    modes: string[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    dueReceiptApi
      .get(isoFrom, isoTo, mode)
      .then((d) => alive && setData(d))
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not load the report");
        setData({ receipts: [], byMode: {}, total: 0, modes: [] });
      });
    return () => {
      alive = false;
    };
  }, [isoFrom, isoTo, mode]);

  const rows = data?.receipts ?? [];
  const paged = usePagedRows(rows, 15);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    downloadTextFile(
      `due-received-${isoFrom}-to-${isoTo}.csv`,
      toCsv([
        ["Received at", "Bill no", "Bill date", "Customer", "Mobile", "Amount", "Mode", "Received by", "Still due"],
        ...rows.map((r) => [
          when(r.received_at),
          r.bill_no ?? "",
          dmy(r.bill_date),
          r.customer_name ?? "",
          r.customer_number ?? "",
          r.amount,
          r.mode,
          r.received_by_name ?? "",
          r.still_due,
        ]),
      ]),
    );
  };

  return (
    <Page>
      <PageHeader
        icon={HandCoins}
        title="Due Received"
        description="Payments received against due bills - when, how much, in which mode and by whom."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/reports">
                <ArrowLeft className="size-4" /> Reports
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </div>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  rangeKey === r.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                )}
              >
                {r.label}
              </button>
            ))}
            {rangeKey === "custom" ? (
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                />
              </span>
            ) : null}
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger aria-label="Payment mode" className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                {(data?.modes ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Payments" value={rows.length} />
        <StatCard label="Received" value={<Money value={data?.total ?? 0} />} tone="primary" />
        {Object.entries(data?.byMode ?? {})
          .slice(0, 2)
          .map(([m, v]) => (
            <StatCard key={m} label={m} value={<Money value={v} />} />
          ))}
      </div>

      <SectionCard title="Payments received" bodyClassName="p-3 sm:p-4">
        {data === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading report…</p>
        ) : (
          <>
            <DataTable
              rows={paged.pageRows}
              keyFn={(r) => String(r.id)}
              empty={
                <EmptyState
                  icon={HandCoins}
                  title="No due payments received in this range"
                  description="Payments are recorded from this update onwards."
                  compact
                />
              }
              columns={[
                { key: "at", header: "Received at", cell: (r) => <span className="num">{when(r.received_at)}</span> },
                { key: "bill", header: "Bill no", cell: (r) => <span className="num">#{r.bill_no ?? r.order_id}</span> },
                { key: "billDate", header: "Bill date", cell: (r) => <span className="num">{dmy(r.bill_date)}</span> },
                {
                  key: "customer",
                  header: "Customer",
                  cell: (r) => (
                    <div>
                      <p className="font-medium">{r.customer_name || "—"}</p>
                      <p className="num text-xs text-muted-foreground">{r.customer_number ?? ""}</p>
                    </div>
                  ),
                },
                { key: "amount", header: `Amount (${cs()})`, cell: (r) => <Money value={r.amount} className="font-semibold" /> },
                { key: "mode", header: "Mode", cell: (r) => r.mode },
                { key: "by", header: "Received by", cell: (r) => r.received_by_name ?? "—" },
                { key: "still", header: "Still due", cell: (r) => <Money value={r.still_due} /> },
              ]}
              mobileCard={(r) => (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      #{r.bill_no ?? r.order_id} · {r.customer_name || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when(r.received_at)} · {r.mode} · {r.received_by_name ?? "—"}
                    </p>
                  </div>
                  <Money value={r.amount} className="font-semibold" />
                </div>
              )}
            />
            <TablePager {...paged} onPageChange={paged.setPage} />
          </>
        )}
      </SectionCard>
    </Page>
  );
}
