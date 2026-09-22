import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { ApiError, tokenApi, type TokenBoardEntry } from "@/lib/api";
import { connectChangeFeed } from "@/lib/changeFeedSocket";

// Token display (owner-approved, 2026-09-22): open it on a TV or second
// monitor facing the customers - "Preparing" and "Ready to collect" token
// numbers, for cafes, quick service and food trucks. Full screen, outside
// the app shell, in the same logged-in browser (Settings > Invoice format >
// "Open token display").
//
// A token moves to Ready by itself when the KDS marks the order's last KOT
// ready (billerpe-local-exe/controller/tokenBoard.js). On a counter touch
// screen, tapping a token lets staff mark it ready or collected by hand -
// the only way for an outlet without a KDS.
export const Route = createFileRoute("/token-display")({
  head: () => ({ meta: [{ title: "Token display · BillerPe" }] }),
  component: TokenDisplayPage,
});

type Board = { hotelName: string; tokensOn: boolean; preparing: TokenBoardEntry[]; ready: TokenBoardEntry[] };

function TokenDisplayPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<TokenBoardEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await tokenApi.getBoard());
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Cannot reach the BillerPe server");
    }
  }, []);

  // Live updates arrive over the exe's change feed (a KOT fired, marked
  // ready, collected); the poll is the safety net for a dropped socket and
  // for ready tokens timing out.
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 5000);
    const disconnect = connectChangeFeed({ onChange: () => void load(), onConnect: () => void load() });
    return () => {
      clearInterval(poll);
      disconnect();
    };
  }, [load]);

  const act = async (status: "ready" | "preparing" | "collected") => {
    if (!picked) return;
    const orderId = picked.orderId;
    setPicked(null);
    try {
      await tokenApi.setStatus(orderId, status);
    } catch {
      // The next refresh shows the real state either way.
    }
    void load();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-2xl font-semibold">{board?.hotelName ?? "Token display"}</h1>
        {problem ? <span className="text-sm text-destructive">{problem}</span> : null}
      </header>

      {board && !board.tokensOn ? (
        <p className="p-8 text-center text-lg text-muted-foreground">
          Tokens are switched off. Turn them on in Settings, Invoice format, Tokens & bill printing.
        </p>
      ) : (
        <main className="grid flex-1 grid-cols-1 md:grid-cols-2">
          <TokenColumn
            title="Preparing"
            entries={board?.preparing ?? []}
            tone="border-border text-foreground"
            onPick={setPicked}
          />
          <TokenColumn
            title="Ready to collect"
            entries={board?.ready ?? []}
            tone="border-status-free-foreground/40 bg-status-free/40 text-status-free-foreground"
            onPick={setPicked}
          />
        </main>
      )}

      {picked ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setPicked(null)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-lg font-semibold">Token {picked.token}</p>
            {picked.readyAt ? (
              <>
                <button className="w-full rounded-xl bg-primary py-3 text-primary-foreground" onClick={() => void act("collected")}>
                  Collected
                </button>
                <button className="w-full rounded-xl border border-border py-3" onClick={() => void act("preparing")}>
                  Back to preparing
                </button>
              </>
            ) : (
              <>
                <button className="w-full rounded-xl bg-primary py-3 text-primary-foreground" onClick={() => void act("ready")}>
                  Mark ready
                </button>
                <button className="w-full rounded-xl border border-border py-3" onClick={() => void act("collected")}>
                  Collected
                </button>
              </>
            )}
            <button className="w-full py-2 text-sm text-muted-foreground" onClick={() => setPicked(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TokenColumn({
  title,
  entries,
  tone,
  onPick,
}: {
  title: string;
  entries: TokenBoardEntry[];
  tone: string;
  onPick: (e: TokenBoardEntry) => void;
}) {
  return (
    <section className="flex flex-col border-border p-6 md:border-r last:md:border-r-0">
      <h2 className="mb-4 text-center text-xl font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {entries.length ? (
        <div className="flex flex-wrap content-start justify-center gap-4">
          {entries.map((e) => (
            <button
              key={e.orderId}
              onClick={() => onPick(e)}
              className={`grid min-w-28 place-items-center rounded-2xl border-2 px-5 py-4 ${tone}`}
            >
              <span className="text-5xl font-bold tabular-nums">{e.token}</span>
              {e.table ? <span className="mt-1 text-sm opacity-80">{e.table}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">—</p>
      )}
    </section>
  );
}
