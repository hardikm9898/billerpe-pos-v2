import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STOCK_GROUPS, STOCK_SECTIONS } from "@/mock/stock-sections";
import type { RawMaterial } from "@/mock/types";

/* ------------- module switcher ------------- */

export function StockNav({ active }: { active?: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 space-y-3">
      <div className="lg:hidden">
        <Select
          value={active ?? "dashboard"}
          onValueChange={(v) =>
            v === "dashboard"
              ? navigate({ to: "/stock" })
              : navigate({ to: "/stock/$section", params: { section: v } })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a stock screen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dashboard">Stock Dashboard</SelectItem>
            {STOCK_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {STOCK_SECTIONS.filter((s) => s.group === g.key).map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden gap-2 overflow-x-auto pb-1 lg:flex scrollbar-slim">
        <Link
          to="/stock"
          className={cn(
            "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
            !active
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-surface hover:bg-surface-muted",
          )}
        >
          Dashboard
        </Link>
        {STOCK_GROUPS.map((g) => (
          <div
            key={g.key}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-surface-muted/70 p-1"
          >
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </span>
            {STOCK_SECTIONS.filter((s) => s.group === g.key).map((s) => (
              <Link
                key={s.slug}
                to="/stock/$section"
                params={{ section: s.slug }}
                className={cn(
                  "relative rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active === s.slug
                    ? "bg-surface text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active === s.slug ? (
                  <motion.span
                    layoutId="stock-nav-pill"
                    className="absolute inset-0 rounded-lg bg-surface shadow-card"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
                <span className="relative">{s.short}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------- toolbar ------------- */

export function Toolbar({
  value,
  onChange,
  placeholder = "Search…",
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/* ------------- stock health ------------- */

export type Health = "Out of stock" | "Critical" | "Low" | "Healthy";

export function healthOf(stock: number, reorder: number): Health {
  if (stock <= 0) return "Out of stock";
  if (reorder <= 0) return "Healthy";
  if (stock <= reorder * 0.5) return "Critical";
  if (stock <= reorder) return "Low";
  return "Healthy";
}

const healthTone: Record<Health, string> = {
  "Out of stock": "bg-primary-soft text-primary-soft-foreground",
  Critical: "bg-primary-soft text-primary-soft-foreground",
  Low: "bg-warning-soft text-warning",
  Healthy: "bg-success-soft text-success",
};

const healthBar: Record<Health, string> = {
  "Out of stock": "bg-primary",
  Critical: "bg-primary",
  Low: "bg-warning",
  Healthy: "bg-success",
};

export function HealthPill({ health }: { health: Health }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        healthTone[health],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {health}
    </span>
  );
}

export function HealthBar({ stock, reorder }: { stock: number; reorder: number }) {
  const health = healthOf(stock, reorder);
  const target = Math.max(reorder * 2, stock, 1);
  const pct = Math.min(100, Math.round((stock / target) * 100));
  const minPct = Math.min(100, Math.round((reorder / target) * 100));
  return (
    <div className="relative h-1.5 w-full min-w-[70px] overflow-hidden rounded-full bg-surface-muted">
      <div className={cn("h-full rounded-full", healthBar[health])} style={{ width: `${pct}%` }} />
      <span
        className="absolute top-0 h-full w-px bg-foreground/40"
        style={{ left: `${minPct}%` }}
        aria-hidden
      />
    </div>
  );
}

/* ------------- dual unit qty ------------- */

export function fmtQty(n: number) {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** Shows consumption stock plus its purchase-unit equivalent, e.g. "12 box · 120 kg". */
export function DualQty({ m, qty }: { m: RawMaterial; qty?: number }) {
  const value = qty ?? m.stock;
  const sameUnit = m.unit === m.purchaseUnit || m.conversion === 1;
  return (
    <div className="leading-tight">
      <p className="num text-sm font-semibold">
        {fmtQty(value)} <span className="text-xs font-medium text-muted-foreground">{m.unit}</span>
      </p>
      {sameUnit ? null : (
        <p className="num text-[11px] text-muted-foreground">
          {fmtQty(value / m.conversion)} {m.purchaseUnit}
        </p>
      )}
    </div>
  );
}

export function ConversionChip({ m }: { m: RawMaterial }) {
  if (m.unit === m.purchaseUnit || m.conversion === 1) {
    return <span className="text-xs text-muted-foreground">Single unit</span>;
  }
  return (
    <span className="num inline-flex items-center rounded-md bg-surface-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
      1 {m.purchaseUnit} = {fmtQty(m.conversion)} {m.unit}
    </span>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
