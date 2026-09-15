import { createFileRoute, redirect } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";

import { Page, PageHeader } from "@/components/kit";
import {
  CalculationSection,
  InvoiceFormatSection,
  KotFormatSection,
  PaymentModesSection,
  PromoSection,
  TaxSection,
} from "@/components/operations/billing";
import {
  CustomerSection,
  DisplaySection,
  MenuSettingSection,
  QrSection,
} from "@/components/operations/experience";
import { KitchenSection, PrinterSection } from "@/components/operations/hardware";
import { DuePaymentSection } from "@/components/operations/ledger";
import { OpsNav } from "@/components/operations/shared";
import { OPS_ALIASES, OPS_GROUPS, OPS_SECTIONS } from "@/mock/ops-sections";

export const Route = createFileRoute("/_shell/operations/$section")({
  beforeLoad: ({ params }) => {
    const alias = OPS_ALIASES[params.section];
    if (alias) {
      throw redirect({ to: "/operations/$section", params: { section: alias } });
    }
    if (!OPS_SECTIONS.some((s) => s.slug === params.section)) {
      throw redirect({ to: "/operations" });
    }
  },
  head: ({ params }) => {
    const s = OPS_SECTIONS.find((x) => x.slug === params.section);
    const title = `${s?.name ?? "Operations"} · BillerPe`;
    const description = s?.desc ?? "Outlet operations configuration.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: OperationsSectionPage,
});

function OperationsSectionPage() {
  const { section } = Route.useParams();
  const meta = OPS_SECTIONS.find((s) => s.slug === section);
  const group = OPS_GROUPS.find((g) => g.key === meta?.group);

  return (
    <Page>
      <PageHeader
        icon={Settings2}
        title={meta?.name ?? "Operations"}
        description={`${group?.label ?? "Operations"} · ${meta?.affects ?? ""}`}
      />
      <OpsNav active={section} />
      {renderSection(section)}
    </Page>
  );
}

function renderSection(slug: string) {
  switch (slug) {
    case "calculation":
      return <CalculationSection />;
    case "tax":
      return <TaxSection />;
    case "invoice-format":
      return <InvoiceFormatSection />;
    case "promo-codes":
      return <PromoSection />;
    case "payment-modes":
      return <PaymentModesSection />;
    case "kitchens":
      return <KitchenSection />;
    case "printers":
      return <PrinterSection />;
    case "kot-format":
      return <KotFormatSection />;
    case "display":
      return <DisplaySection />;
    case "menu-setting":
      return <MenuSettingSection />;
    case "qr-code":
      return <QrSection />;
    case "customer-data":
      return <CustomerSection />;
    case "due-payment":
      return <DuePaymentSection />;
    default:
      return null;
  }
}
