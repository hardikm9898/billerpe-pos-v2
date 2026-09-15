import { Link, createFileRoute } from "@tanstack/react-router";
import { Bell, ChevronRight, ScrollText, ServerCog, Settings2 } from "lucide-react";

import { Page, PageHeader, SectionCard } from "@/components/kit";
import { OperationsLanding } from "@/components/operations/landing";
import { OpsNav } from "@/components/operations/shared";

export const Route = createFileRoute("/_shell/operations/")({
  head: () => ({
    meta: [
      { title: "Operations · BillerPe" },
      {
        name: "description",
        content:
          "Billing engine, hardware routing, POS experience and the outstanding-dues ledger for the outlet.",
      },
      { property: "og:title", content: "Operations · BillerPe" },
      {
        property: "og:description",
        content: "Configure how a BillerPe bill is calculated, printed and settled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationsPage,
});

const related = [
  {
    to: "/system",
    name: "Local Server & Sync",
    desc: "Devices, sync queue and connection state",
    icon: ServerCog,
  },
  {
    to: "/system/audit-log",
    name: "Audit Log",
    desc: "Who changed what, when and from where",
    icon: ScrollText,
  },
  {
    to: "/system/notifications",
    name: "Notification Settings",
    desc: "WhatsApp, SMS and in-app triggers",
    icon: Bell,
  },
] as const;

function OperationsPage() {
  return (
    <Page>
      <PageHeader
        icon={Settings2}
        title="Operations"
        description="Four groups: what the bill costs, where the ticket prints, what staff and guests see, and what money is still owed."
      />
      <OpsNav />
      <OperationsLanding />

      <div className="mt-5">
        <SectionCard title="Related outlet tools" bodyClassName="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <t.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}
