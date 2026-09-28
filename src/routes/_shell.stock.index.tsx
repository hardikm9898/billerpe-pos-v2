import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { useEffect } from "react";

import { Page, PageHeader } from "@/components/kit";
import { StockDashboard } from "@/components/stock/dashboard";
import { StockNav } from "@/components/stock/shared";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/stock/")({
  head: () => ({
    meta: [
      { title: "Stock Control · BillerPe" },
      {
        name: "description",
        content:
          "Stock valuation, reorder watchlist, purchases, recipes and production for the outlet.",
      },
      { property: "og:title", content: "Stock Control · BillerPe" },
      {
        property: "og:description",
        content: "Inventory command centre for the BillerPe restaurant POS.",
      },
    ],
  }),
  component: StockPage,
});

function StockPage() {
  const store = useStore();
  // The dashboard's value, reorder watchlist and movements - fresh on every
  // visit, not the figures read at login (owner report, 2026-09-28).
  useEffect(() => {
    void store.loadRawMaterialsFromServer();
    void store.loadSemiFinishedFromServer();
    void store.loadPurchaseOrdersFromServer();
    void store.loadWastageFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Page>
      <PageHeader
        icon={Boxes}
        title="Stock Control"
        description="One inventory truth: purchases bring stock in, recipes and wastage take it out, reports only read."
      />
      <StockNav />
      <StockDashboard />
    </Page>
  );
}
