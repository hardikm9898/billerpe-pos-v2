import { Link, createFileRoute } from "@tanstack/react-router";
import { CircleHelp, LifeBuoy, Mail, Phone } from "lucide-react";

import { Page, PageHeader, SectionCard } from "@/components/kit";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { RESTAURANT, faqs } from "@/mock/data";

export const Route = createFileRoute("/_shell/support/help")({
  head: () => ({
    meta: [
      { title: "Help & Support · BillerPe" },
      { name: "description", content: "Answers to the questions billers ask most, plus support contacts." },
      { property: "og:title", content: "Help & Support · BillerPe" },
      { property: "og:description", content: "Common BillerPe questions and support contacts." },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <Page>
      <PageHeader
        icon={CircleHelp}
        title="Help & Support"
        description={`Support for ${RESTAURANT.name} — available during service hours, every day.`}
        actions={
          <Button asChild>
            <Link to="/support/raise-ticket">
              <LifeBuoy className="size-4" /> Raise a ticket
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
            <Phone className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold num">1800 200 4455</p>
            <p className="text-xs text-muted-foreground">Priority POS helpline · 9 AM – 1 AM</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
          <span className="grid size-9 place-items-center rounded-lg bg-info-soft text-info">
            <Mail className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">support@billerpe.in</p>
            <p className="text-xs text-muted-foreground">Response within one business day</p>
          </div>
        </div>
      </div>

      <SectionCard title="Frequently asked" bodyClassName="p-3 sm:p-4">
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>
    </Page>
  );
}
