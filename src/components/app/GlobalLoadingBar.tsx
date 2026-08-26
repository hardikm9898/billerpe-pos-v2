import { useEffect, useState, useSyncExternalStore } from "react";

import { getPendingRequestCount, subscribePendingRequests } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * True whenever at least one real API call (see api.ts's trackPending) is
 * in flight - also used by individual pages to show a skeleton instead of
 * a premature "no results" empty state while their own first load is
 * still in progress (e.g. `<DataTable loading={rows.length === 0 &&
 * useHasPendingRequests()} .../>`).
 */
export function useHasPendingRequests() {
  return useSyncExternalStore(
    subscribePendingRequests,
    () => getPendingRequestCount() > 0,
    () => false,
  );
}

/**
 * Slim top-of-page progress bar, shown for every real API call app-wide -
 * a single mount point (see __root.tsx) covers every request without each
 * page/dialog needing its own loading state. Delayed ~150ms before showing
 * so instant/cached responses don't just flicker it on and off.
 */
export function GlobalLoadingBar() {
  const pending = useHasPendingRequests();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
      role="progressbar"
      aria-hidden={!visible}
    >
      <div className="global-loading-bar-fill h-full w-1/3 bg-primary" />
    </div>
  );
}
