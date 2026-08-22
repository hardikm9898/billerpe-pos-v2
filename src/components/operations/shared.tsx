import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { OPS_GROUPS, OPS_SECTIONS } from "@/mock/ops-sections";
import { useStore } from "@/mock/store";

/* ---------------- module switcher ---------------- */

export function OpsNav({ active }: { active?: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 space-y-3">
      <div className="lg:hidden">
        <Select
          value={active ?? "overview"}
          onValueChange={(v) =>
            v === "overview"
              ? navigate({ to: "/operations" })
              : navigate({ to: "/operations/$section", params: { section: v } })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overview">Operations overview</SelectItem>
            {OPS_SECTIONS.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden gap-4 lg:flex lg:flex-wrap">
        <Link
          to="/operations"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          Overview
        </Link>
        {OPS_GROUPS.map((g) => (
          <div key={g.key} className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {g.label}
            </span>
            <div className="flex gap-1">
              {OPS_SECTIONS.filter((s) => s.group === g.key).map((s) => (
                <Link
                  key={s.slug}
                  to="/operations/$section"
                  params={{ section: s.slug }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active === s.slug
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {s.short}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- notices ---------------- */

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "success";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const map = {
    info: { cls: "bg-info-soft text-info", Icon: Info },
    warning: { cls: "bg-warning-soft text-warning", Icon: AlertTriangle },
    success: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  } as const;
  const { cls, Icon } = map[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-transparent p-3.5 sm:flex-row sm:items-center sm:justify-between",
        cls,
      )}
    >
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {children ? <div className="mt-0.5 text-xs opacity-90">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </motion.div>
  );
}

/** The single most important cross-module dependency in Operations. */
export function GstDependencyNotice({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const on = store.invoiceFormat.gstCalculation;
  return (
    <Notice
      tone={on ? "success" : "warning"}
      title={on ? "GST calculation is active" : "GST calculation is currently disabled"}
      action={
        <Button
          size="sm"
          variant={on ? "outline" : "default"}
          onClick={() => (on ? undefined : store.setGstCalculation(true))}
          asChild={on}
        >
          {on ? (
            <Link to="/operations/$section" params={{ section: "invoice-format" }}>
              View invoice GST settings <ArrowRight className="size-4" />
            </Link>
          ) : (
            <span>Enable GST</span>
          )}
        </Button>
      }
    >
      {compact ? null : on ? (
        <>Tax rules are active because GST is enabled in Invoice Format.</>
      ) : (
        <>Configured tax rules will not calculate on bills until GST is enabled in Invoice Format.</>
      )}
    </Notice>
  );
}

/* ---------------- toolbar ---------------- */

export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

/* ---------------- assignment selector ---------------- */

export function ChipSelect({
  label,
  hint,
  options,
  selected,
  onToggle,
  allLabel = "All",
}: {
  label: string;
  hint?: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  allLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className="text-xs text-muted-foreground">
          {selected.length ? `${selected.length} selected` : allLabel}
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AssignmentSummary({
  items,
  fallback = "All",
}: {
  items: string[];
  fallback?: string;
}) {
  if (!items.length) return <span className="text-muted-foreground">{fallback}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 4).map((i) => (
        <span key={i} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">
          {i}
        </span>
      ))}
      {items.length > 4 ? (
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
          +{items.length - 4}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------- flow strip ---------------- */

export function FlowStrip({ steps, active }: { steps: string[]; active?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-medium",
              s === active
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground",
            )}
          >
            {s}
          </span>
          {i < steps.length - 1 ? (
            <ArrowRight className="size-3 text-muted-foreground/60" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

export const BILL_FLOW = [
  "Order",
  "Display",
  "Menu",
  "Customer",
  "KOT",
  "Kitchen",
  "Printer",
  "Calculation",
  "Tax",
  "Invoice",
  "Promo",
  "Settle",
];
