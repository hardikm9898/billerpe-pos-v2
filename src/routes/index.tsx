import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { landingRoute } from "@/components/app/AppShell";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BillerPe — Offline-first Restaurant POS" },
      {
        name: "description",
        content:
          "BillerPe V2 restaurant POS: table management, orders, KOT, billing, settlement, inventory and offline sync.",
      },
      { property: "og:title", content: "BillerPe — Offline-first Restaurant POS" },
      {
        property: "og:description",
        content: "Table management, orders, KOT, billing, inventory and offline sync in one POS.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const store = useStore();
  const navigate = useNavigate();

  // Each user lands on the first screen their role can open (kitchen staff
  // on KDS, billing staff on the floor) - which needs their permissions, so
  // the session loads first.
  useEffect(() => {
    if (!store.authed) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!store.sessionReady) {
      void store.loadSession().then((ok) => {
        if (!ok) store.logout();
      });
      return;
    }
    navigate({ to: landingRoute(store.can), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed, store.sessionReady]);

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-tight">BillerPe</p>
        <p className="mt-1 text-xs text-muted-foreground">Loading your outlet…</p>
      </div>
    </div>
  );
}
