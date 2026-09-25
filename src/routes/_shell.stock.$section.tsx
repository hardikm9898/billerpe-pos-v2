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
import { StockLedgerReport } from "@/components/stock/ledger";
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

// Owner rule (2026-09-25): a sale is never blocked or shortened by stock -
// stock may go below zero, and those materials are listed here so someone
// counts them or records the missing purchase.
function NegativeStockNote() {
  const store = useStore();
  const negative = store.rawMaterials.filter((m) => m.stock < -1e-9);
  return (
    <div
      className={
        negative.length
          ? "mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          : "mb-4 rounded-xl border border-border bg-surface-muted/50 px-4 py-3 text-sm"
      }
      data-negative-stock={negative.length}
    >
      <p className="font-medium">
        {negative.length
          ? `${negative.length} material${negative.length === 1 ? "" : "s"} below zero`
          : "Sales never stop for stock"}
      </p>
      <p className="text-xs text-muted-foreground">
        {negative.length
          ? `${negative.map((m) => `${m.name} (${Math.round(m.stock * 100) / 100} ${m.unit})`).join(", ")} - orders used more than was recorded. Enter the physical count below, or record the purchase.`
          : "When orders use more than is in stock, stock goes below zero and the material shows here in red until it is counted or purchased."}
      </p>
    </div>
  );
}

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
  "report-stock-ledger": StockLedgerReport,
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
// A section can need more than one list: supplier outstanding comes from
// the purchase orders and their payments (it used to be a number kept only
// in this browser tab, back to ₹0 after every refresh).
type Loader = keyof ReturnType<typeof useStore>;
const SECTION_LOADERS: Record<string, Loader[]> = {
  suppliers: ["loadSuppliersFromServer", "loadPurchaseOrdersFromServer"],
  "semi-finished": ["loadSemiFinishedFromServer"],
  production: ["loadSemiFinishedFromServer"],
  "purchase-orders": ["loadPurchaseOrdersFromServer", "loadSuppliersFromServer"],
  "franchise-requisitions": ["loadRequisitionsFromServer"],
  wastage: ["loadWastageFromServer"],
  recipes: ["loadRecipesFromServer"],
  "report-purchase": ["loadPurchaseOrdersFromServer"],
  "report-supplier": ["loadPurchaseOrdersFromServer", "loadSuppliersFromServer"],
};

function StockSectionPage() {
  const { section } = useParams({ from: "/_shell/stock/$section" });
  const meta = resolveSection(section);
  const store = useStore();

  useEffect(() => {
    for (const loaderKey of meta ? (SECTION_LOADERS[meta.slug] ?? []) : []) {
      const loader = store[loaderKey];
      if (typeof loader === "function") void (loader as () => Promise<void>)();
    }
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
    meta.slug === "franchise-requisitions"
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
      {meta.slug === "stock-in-hand" ? <NegativeStockNote /> : null}
      {Screen ? <Screen /> : null}
    </Page>
  );
}
