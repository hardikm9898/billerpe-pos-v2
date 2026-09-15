import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Lock, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  Money,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
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
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/cash-session")({
  head: () => ({
    meta: [
      { title: "Opening & Closing · BillerPe" },
      {
        name: "description",
        content: "Open the drawer, record cash movements and close the day with variance.",
      },
      { property: "og:title", content: "Opening & Closing · BillerPe" },
      { property: "og:description", content: "Cash drawer session management in BillerPe." },
    ],
  }),
  component: CashSessionPage,
});

type Mode = "open" | "add" | "withdraw" | "close" | null;

function CashSessionPage() {
  const store = useStore();
  const session = store.openSessionRecord();
  const balance = store.sessionBalance();

  // Confirmed out of scope for the Local EXE - loaded here on this
  // screen's own mount instead of globally (see AppShell.tsx's comment).
  useEffect(() => {
    void store.loadCashSessionsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const close = () => {
    setMode(null);
    setAmount("");
    setReason("");
  };

  const counted = Number(amount || 0);
  const variance = counted - balance;

  const totals = useMemo(() => {
    const m = session?.movements ?? [];
    return {
      settlements: m.filter((x) => x.type === "Settlement").reduce((s, x) => s + x.amount, 0),
      added: m.filter((x) => x.type === "Add").reduce((s, x) => s + x.amount, 0),
      out: m
        .filter((x) => x.type === "Withdraw" || x.type === "Expense")
        .reduce((s, x) => s + x.amount, 0),
    };
  }, [session]);

  const closedSessions = useMemo(
    () => store.cashSessions.filter((c) => c.status === "Closed"),
    [store.cashSessions],
  );
  const pastPaged = usePagedRows(closedSessions, 10);

  return (
    <Page>
      <PageHeader
        icon={Wallet}
        title="Opening & Closing"
        description="One cash session per outlet. Every add, withdrawal and expense needs a written reason."
        actions={
          session ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode("add")}>
                <ArrowDownCircle className="size-4" /> Add cash
              </Button>
              <Button variant="outline" onClick={() => setMode("withdraw")}>
                <ArrowUpCircle className="size-4" /> Withdraw
              </Button>
              <Button onClick={() => setMode("close")}>
                <Lock className="size-4" /> Close session
              </Button>
            </div>
          ) : (
            <Button onClick={() => setMode("open")}>Open session</Button>
          )
        }
      />

      {session ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Drawer balance" value={<Money value={balance} />} tone="primary" />
            <StatCard
              label="Cash settlements"
              value={<Money value={totals.settlements} />}
              tone="success"
            />
            <StatCard label="Cash added" value={<Money value={totals.added} />} />
            <StatCard
              label="Withdrawn / expenses"
              value={<Money value={Math.abs(totals.out)} />}
              tone="warning"
            />
          </div>

          <SectionCard
            title="Current session"
            description={`Opened ${session.openedAt} by ${session.openedBy}`}
            actions={<StatusBadge status="Open" />}
            bodyClassName="p-3 sm:p-4"
          >
            <DataTable
              rows={[...session.movements].reverse()}
              keyFn={(m) => m.id}
              columns={[
                { key: "at", header: "Time", cell: (m) => <span className="num">{m.at}</span> },
                {
                  key: "type",
                  header: "Type",
                  cell: (m) => <span className="font-medium">{m.type}</span>,
                },
                { key: "reason", header: "Reason", cell: (m) => m.reason },
                { key: "by", header: "By", cell: (m) => m.by },
                {
                  key: "amount",
                  header: "Amount",
                  cell: (m) => (
                    <Money
                      value={m.amount}
                      className={
                        m.amount < 0 ? "font-semibold text-primary" : "font-semibold text-success"
                      }
                    />
                  ),
                },
              ]}
              mobileCard={(m) => (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.type}</p>
                    <p className="text-xs text-muted-foreground">{m.reason}</p>
                  </div>
                  <Money value={m.amount} className="font-semibold" />
                </div>
              )}
            />
          </SectionCard>
        </>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No open cash session"
          description="Open today's session with a starting float before billing in cash."
          action={<Button onClick={() => setMode("open")}>Open session</Button>}
        />
      )}

      <SectionCard title="Past sessions" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={pastPaged.pageRows}
          keyFn={(c) => c.id}
          empty={<EmptyState icon={Wallet} title="No closed sessions yet" compact />}
          columns={[
            {
              key: "opened",
              header: "Opened",
              cell: (c) => <span className="num">{c.openedAt}</span>,
            },
            {
              key: "closed",
              header: "Closed",
              cell: (c) => <span className="num">{c.closedAt ?? "—"}</span>,
            },
            { key: "float", header: "Float", cell: (c) => <Money value={c.openingFloat} /> },
            {
              key: "counted",
              header: "Counted",
              cell: (c) => <Money value={c.countedCash ?? 0} />,
            },
            {
              key: "variance",
              header: "Variance",
              cell: (c) => (
                <div>
                  <Money
                    value={c.variance ?? 0}
                    className={
                      c.variance ? "font-semibold text-primary" : "font-semibold text-success"
                    }
                  />
                  {c.varianceReason ? (
                    <p className="text-xs text-muted-foreground">{c.varianceReason}</p>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
        <TablePager {...pastPaged} onPageChange={pastPaged.setPage} />
      </SectionCard>

      <Dialog open={!!mode} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "open"
                ? "Open cash session"
                : mode === "add"
                  ? "Add cash to drawer"
                  : mode === "withdraw"
                    ? "Withdraw cash"
                    : "Close cash session"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                {mode === "open"
                  ? "Opening float (₹)"
                  : mode === "close"
                    ? "Counted cash (₹)"
                    : "Amount (₹)"}
              </Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            {mode === "withdraw" ? (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
                Drawer balance <Money value={balance} className="font-semibold" />. Withdrawals
                above the balance are blocked with no override.
              </p>
            ) : null}

            {mode === "close" ? (
              <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected</span>
                  <Money value={balance} className="font-semibold" />
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Variance</span>
                  <Money
                    value={variance}
                    className={
                      variance === 0 ? "font-semibold text-success" : "font-semibold text-primary"
                    }
                  />
                </div>
              </div>
            ) : null}

            {mode !== "open" ? (
              <div className="space-y-1.5">
                <Label>
                  {mode === "close" ? "Variance explanation" : "Reason"}
                  {mode === "close" && variance === 0 ? " (optional)" : ""}
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    mode === "close"
                      ? "Explain why counted cash differs from expected"
                      : "Why is this movement happening?"
                  }
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={
                Number(amount) < 0 ||
                amount === "" ||
                (mode === "add" && (!reason.trim() || Number(amount) <= 0)) ||
                (mode === "withdraw" && (!reason.trim() || Number(amount) <= 0)) ||
                (mode === "close" && variance !== 0 && !reason.trim())
              }
              onClick={() => {
                const value = Number(amount);
                if (mode === "open") store.openSession(value);
                if (mode === "add") store.addCash(value, reason.trim());
                if (mode === "withdraw") {
                  const ok = store.withdrawCash(value, reason.trim());
                  if (!ok) return;
                }
                if (mode === "close") store.closeSession(value, reason.trim());
                close();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
