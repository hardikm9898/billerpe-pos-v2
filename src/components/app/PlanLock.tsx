import { CalendarPlus, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { hasSession, onPlanLocked, planApi, type PlanState } from "@/lib/api";

// The outlet's BillerPe plan (owner 2026-10-08). When it ends the whole
// software locks - this screen covers every page, the kitchen display
// included - with the renewal payment link and ONE "Extend 1 day" (it works
// without internet too; the PC tells BillerPe later). While the extra day
// runs, a banner says so. The exe decides (billerpe-local-exe
// helpers/planLock.js); any call it refuses with "plan-expired" opens this.

const CHECK_MS = 5 * 60 * 1000;

export function PlanLock() {
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    onPlanLocked((p) => setPlan(p));
    const tick = () => {
      if (!hasSession()) return;
      planApi
        .status()
        .then(setPlan)
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, CHECK_MS);
    return () => {
      clearInterval(id);
      onPlanLocked(null);
    };
  }, []);

  if (!plan || (!plan.locked && !plan.inGrace)) return null;

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };
  const pay = () =>
    run("pay", async () => {
      const r = await planApi.pay();
      window.open(r.url, "_blank", "noopener");
      setNote("The payment page opened in a new tab. Once paid, press \"I have paid\".");
    });

  if (!plan.locked) {
    return (
      <div role="status" className="fixed bottom-4 left-4 z-[90] flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg">
        <span>{error || plan.message || "Extended by 1 day. Renew now to keep using BillerPe."}</span>
        <button type="button" onClick={() => void pay()} disabled={!!busy} className="rounded-full bg-background px-3 py-1 text-xs font-bold text-primary">
          {busy === "pay" ? "Opening…" : "Renew now"}
        </button>
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-label="BillerPe plan ended" className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold">Your BillerPe plan has ended</h1>
        <p className="mt-2 text-sm text-muted-foreground">{plan.message || "The software is locked until the plan is renewed."}</p>
        {plan.outlet ? <p className="mt-1 text-sm font-semibold">{plan.outlet}</p> : null}
        <div className="mt-6 flex flex-col gap-3">
          <Button size="lg" disabled={!!busy} onClick={() => void pay()}>
            {busy === "pay" ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />} Renew now (pay online)
          </Button>
          {plan.canExtend ? (
            <Button
              size="lg"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("extend", async () => {
                  const p = await planApi.extend();
                  setPlan(p);
                  if (!p.locked) window.location.reload();
                })
              }
            >
              {busy === "extend" ? <Loader2 className="size-5 animate-spin" /> : <CalendarPlus className="size-5" />} Extend 1 day (once)
            </Button>
          ) : (
            <p className="text-xs font-semibold text-muted-foreground">The 1-day extension is already used.</p>
          )}
          <Button
            size="lg"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void run("check", async () => {
                const p = await planApi.check();
                setPlan(p);
                if (!p.locked) window.location.reload();
                else setNote("Not renewed yet. After paying online it unlocks within a minute.");
              })
            }
          >
            {busy === "check" ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} I have paid: check again
          </Button>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}
        {note ? <p className="mt-4 text-sm text-muted-foreground">{note}</p> : null}
        <p className="mt-6 text-xs text-muted-foreground">Bills already made are safe. Call BillerPe support if you need help renewing.</p>
      </div>
    </div>
  );
}
