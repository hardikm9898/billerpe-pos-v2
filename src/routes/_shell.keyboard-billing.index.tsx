import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/keyboard-billing/")({
  head: () => ({
    meta: [
      { title: "Keyboard Billing · BillerPe" },
      {
        name: "description",
        content: "Open the keyboard-first cashier billing workstation for the active order.",
      },
      { property: "og:title", content: "Keyboard Billing · BillerPe" },
      {
        property: "og:description",
        content: "Open the keyboard billing workstation for the active order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KeyboardBillingIndex,
});

function KeyboardBillingIndex() {
  const store = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const live = store.orders.find((o) => o.status === "Running" || o.status === "Hold");
    if (live) {
      navigate({ to: "/keyboard-billing/$orderId", params: { orderId: live.id }, replace: true });
      return;
    }
    const id = store.startDefaultOrder();
    navigate({ to: "/keyboard-billing/$orderId", params: { orderId: id }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid h-[60vh] place-items-center text-sm text-muted-foreground">
      Opening keyboard billing…
    </div>
  );
}
