import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";

import { Money, SectionCard, StatCard } from "@/components/kit";
import { BILL_FLOW, FlowStrip, Notice } from "@/components/operations/shared";
import { OPS_GROUPS, OPS_SECTIONS, OPS_UNCONFIRMED } from "@/mock/ops-sections";
import { useStore } from "@/mock/store";

export function OperationsLanding() {
  const store = useStore();
  const gstOn = store.invoiceFormat.gstCalculation;
  const outstanding = store.dueBills
    .filter((b) => b.status === "Due")
    .reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-5">
      <SectionCard
        title="How a bill is assembled"
        description="Every setting below changes one link in this chain."
        bodyClassName="p-3 sm:p-4"
      >
        <FlowStrip steps={BILL_FLOW} />
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GST calculation"
          value={gstOn ? "On" : "Off"}
          tone={gstOn ? "primary" : "warning"}
          hint={gstOn ? `${store.taxRules.filter((t) => t.active).length} active tax rules` : "Tax rules are not calculating"}
        />
        <StatCard
          label="Service charge"
          value={
            store.serviceCharge.active
              ? store.serviceCharge.type === "percent"
                ? `${store.serviceCharge.value}%`
                : `₹${store.serviceCharge.value}`
              : "Off"
          }
          hint={store.serviceCharge.autoApply.join(", ") || "Manual only"}
        />
        <StatCard
          label="Kitchens / printers"
          value={`${store.kitchens.length} / ${store.printers.length}`}
          hint={`${store.printers.filter((p) => p.status !== "Ready").length} printers need attention`}
        />
        <StatCard label="Outstanding dues" value={<Money value={outstanding} />} tone="warning" />
      </div>

      {!gstOn ? (
        <Notice tone="warning" title="GST is disabled, so no bill is charging tax">
          Enable it in Invoice Format to bring every configured tax rule back into effect.
        </Notice>
      ) : null}

      {OPS_GROUPS.map((g) => (
        <SectionCard
          key={g.key}
          title={g.label}
          description={`${g.blurb} — ${g.hint}.`}
          bodyClassName="p-3 sm:p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {OPS_SECTIONS.filter((s) => s.group === g.key).map((s) => (
              <Link
                key={s.slug}
                to="/operations/$section"
                params={{ section: s.slug }}
                className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                    <ArrowRight className="size-3" /> {s.affects}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}

      <SectionCard
        title="Known gaps carried over from the current system"
        description="Surfaced honestly instead of hidden behind invented behaviour."
        bodyClassName="p-3 sm:p-4"
      >
        <ul className="space-y-2">
          {OPS_UNCONFIRMED.map((u) => (
            <li
              key={u.title}
              className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-3"
            >
              <p className="text-sm font-semibold text-warning">{u.title}</p>
              <p className="mt-1 text-xs text-warning/90">{u.note}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
