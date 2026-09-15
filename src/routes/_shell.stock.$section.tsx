import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { ArrowLeft, Boxes } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect } from "react";

import { EmptyState, Page, PageHeader, PendingDecision } from "@/components/kit";
import {
  RawMaterialsScreen,
  SemiFinishedScreen,
  SuppliersScreen,
  UnitsScreen,
} from "@/components/stock/masters";
import { ProductionScreen, RecipesScreen } from "@/components/stock/recipes";
import {
  ConsumptionReport,
  CurrentStockReport,
  OrderConsumptionReport,
  PurchaseReport,
  SupplierReport,
} from "@/components/stock/reports";
import { StockNav } from "@/components/stock/shared";
import { useStore } from "@/mock/store";
import {
  PurchaseOrdersScreen,
  RequisitionsScreen,
  StockInHandScreen,
  WastageScreen,
} from "@/components/stock/transactions";
import { Button } from "@/components/ui/button";
import { PENDING_DECISIONS, resolveSection } from "@/mock/stock-sections";

export const Route = createFileRoute("/_shell/stock/$section")({
  head: () => ({
    meta: [
      { title: "Stock Module · BillerPe" },
      {
        name: "description",
        content: "Materials, purchases, reconciliation, recipes, production and stock reports.",
      },
      { property: "og:title", content: "Stock Module · BillerPe" },
      {
        property: "og:description",
        content: "Inventory module detail in the BillerPe restaurant POS.",
      },
    ],
  }),
  component: StockSectionPage,
});

const SCREENS: Record<string, ComponentType> = {
  "raw-materials": RawMaterialsScreen,
  units: UnitsScreen,
  suppliers: SuppliersScreen,
  "semi-finished": SemiFinishedScreen,
  "purchase-orders": PurchaseOrdersScreen,
  "stock-in-hand": StockInHandScreen,
  wastage: WastageScreen,
  "franchise-requisitions": RequisitionsScreen,
  recipes: RecipesScreen,
  production: ProductionScreen,
  "report-current-stock": CurrentStockReport,
  "report-consumption": ConsumptionReport,
  "report-purchase": PurchaseReport,
  "report-supplier": SupplierReport,
  "report-order-consumption": OrderConsumptionReport,
};

// These 5 sections are confirmed out of scope for the Local EXE (no local
// model exists for any of them - see billerpe-local-exe/model/index.js's
// own scope comment), so they always 401 against the cloud regardless of
// session validity. Loading them here, only when this specific section is
// actually open, keeps that 401 noise out of every normal login/table-
// grid/billing session - it used to fire unconditionally on every login
// via AppShell's eager effects, confirmed live as visible console/toast
// noise on the core POS flow that never even visits this screen.
const SECTION_LOADERS: Record<string, keyof ReturnType<typeof useStore>> = {
  suppliers: "loadSuppliersFromServer",
  "semi-finished": "loadSemiFinishedFromServer",
  production: "loadSemiFinishedFromServer",
  "purchase-orders": "loadPurchaseOrdersFromServer",
  "franchise-requisitions": "loadRequisitionsFromServer",
  wastage: "loadWastageFromServer",
  recipes: "loadRecipesFromServer",
};

function StockSectionPage() {
  const { section } = useParams({ from: "/_shell/stock/$section" });
  const meta = resolveSection(section);
  const store = useStore();

  useEffect(() => {
    const loaderKey = meta ? SECTION_LOADERS[meta.slug] : undefined;
    if (!loaderKey) return;
    const loader = store[loaderKey];
    if (typeof loader === "function") void (loader as () => Promise<void>)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.slug]);

  if (!meta) {
    return (
      <Page>
        <EmptyState
          icon={Boxes}
          title="Unknown stock module"
          description="This module does not exist in the prototype."
          action={
            <Button asChild variant="outline">
              <Link to="/stock">Back to Stock</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const Screen = SCREENS[meta.slug];
  const pending =
    meta.slug === "stock-in-hand"
      ? PENDING_DECISIONS.find((d) => d.title.startsWith("Negative"))
      : meta.slug === "franchise-requisitions"
        ? PENDING_DECISIONS.find((d) => d.title.startsWith("Warehouse"))
        : undefined;

  return (
    <Page>
      <PageHeader
        icon={Boxes}
        title={meta.name}
        description={meta.desc}
        actions={
          <Button asChild variant="outline">
            <Link to="/stock">
              <ArrowLeft className="size-4" /> Stock overview
            </Link>
          </Button>
        }
      />
      <StockNav active={meta.slug} />
      {pending ? <PendingDecision title={pending.title} note={pending.note} /> : null}
      {Screen ? <Screen /> : null}
    </Page>
  );
}
