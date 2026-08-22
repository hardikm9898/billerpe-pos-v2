import { createFileRoute } from "@tanstack/react-router";

import { KeyboardDisplay } from "@/components/billing/keyboard-display";

export const Route = createFileRoute("/_shell/keyboard-billing/$orderId")({
  head: () => ({
    meta: [
      { title: "Keyboard Billing · BillerPe" },
      {
        name: "description",
        content:
          "Keyboard-first cashier billing workstation with fast item entry, barcode scanning, KOT rounds and split settlement.",
      },
      { property: "og:title", content: "Keyboard Billing · BillerPe" },
      {
        property: "og:description",
        content: "High-speed keyboard POS billing screen with F2/F3/F4/F5 shortcuts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KeyboardBillingPage,
});

function KeyboardBillingPage() {
  const { orderId } = Route.useParams();
  return <KeyboardDisplay orderId={orderId} />;
}
