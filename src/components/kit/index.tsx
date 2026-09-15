import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from "lucide-react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { forwardRef, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ---------------- page primitives ---------------- */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  tabs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  tabs?: ReactNode;
}) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {description ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      {title ? (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------- stats ---------------- */

/**
 * Compact inline sparkline — historical points in a muted line, the latest
 * point picked out with a small accent dot. Hand-rolled SVG, no chart lib.
 */
function Sparkline({
  values,
  hero,
  className,
}: {
  values: number[];
  hero?: boolean;
  className?: string;
}) {
  const w = 100;
  const h = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => [i * stepX, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1] ?? [0, 0];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full overflow-visible", className)}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={hero ? "stroke-primary-foreground/40" : "stroke-border-strong"}
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.5}
        className={hero ? "fill-primary-foreground" : "fill-primary"}
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  delta,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning" | "info";
  delta?: string;
  /** Optional recent-history values (chronological) rendered as a small trend line. */
  trend?: number[];
}) {
  const isHero = tone === "primary";
  const iconTones: Record<string, string> = {
    default: "text-muted-foreground",
    primary: "text-primary-foreground/80",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };
  const accentBorder: Record<string, string> = {
    default: "border-l-border",
    primary: "border-l-transparent",
    success: "border-l-success",
    warning: "border-l-warning",
    info: "border-l-info",
  };
  const deltaDown = delta?.trim().startsWith("-");
  const deltaTone = isHero
    ? "text-primary-foreground"
    : deltaDown
      ? "text-primary"
      : "text-success";
  const mutedTone = isHero ? "text-primary-foreground/70" : "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-l-4 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-md",
        accentBorder[tone],
        isHero &&
          "border-transparent bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[13px] font-medium leading-tight", mutedTone)}>{label}</p>
        {Icon ? <Icon className={cn("size-4 shrink-0", iconTones[tone])} /> : null}
      </div>

      <p className="mt-1.5 text-[1.85rem] font-semibold leading-none tracking-tight">{value}</p>

      {delta || hint ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {delta ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold",
                deltaTone,
              )}
            >
              {deltaDown ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
              {delta}
            </span>
          ) : null}
          {hint ? <span className={cn("min-w-0 truncate text-xs", mutedTone)}>{hint}</span> : null}
        </div>
      ) : null}

      {trend && trend.length > 1 ? (
        <Sparkline values={trend} hero={isHero} className="mt-2.5" />
      ) : null}
    </motion.div>
  );
}

/* ---------------- status ---------------- */

const statusTone: Record<string, string> = {
  Free: "bg-status-free text-status-free-foreground",
  Held: "bg-status-held text-status-held-foreground",
  Running: "bg-status-running text-status-running-foreground",
  "Bill Generated": "bg-status-billed text-status-billed-foreground",
  Reserved: "bg-status-reserved text-status-reserved-foreground",
  Settled: "bg-success-soft text-success",
  Cancelled: "bg-muted text-muted-foreground",
  Pending: "bg-status-held text-status-held-foreground",
  Printed: "bg-info-soft text-info",
  Accepted: "bg-info-soft text-info",
  Preparing: "bg-warning-soft text-warning",
  Ready: "bg-success-soft text-success",
  Served: "bg-muted text-muted-foreground",
  Booked: "bg-status-held text-status-held-foreground",
  Waiting: "bg-status-held text-status-held-foreground",
  Confirmed: "bg-status-reserved text-status-reserved-foreground",
  Seated: "bg-status-running text-status-running-foreground",
  Completed: "bg-success-soft text-success",
  "No Show": "bg-primary-soft text-primary-soft-foreground",
  Online: "bg-success-soft text-success",
  Offline: "bg-muted text-muted-foreground",
  Blocked: "bg-primary-soft text-primary-soft-foreground",
  Synced: "bg-success-soft text-success",
  Failed: "bg-primary-soft text-primary-soft-foreground",
  Conflict: "bg-warning-soft text-warning",
  Active: "bg-success-soft text-success",
  Inactive: "bg-muted text-muted-foreground",
  Ready_: "bg-success-soft text-success",
  Received: "bg-success-soft text-success",
  Ordered: "bg-info-soft text-info",
  Draft: "bg-muted text-muted-foreground",
  Open: "bg-success-soft text-success",
  Closed: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        statusTone[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {status}
    </span>
  );
}

/* ---------------- states ---------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted/60 text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface text-muted-foreground shadow-card">
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  );
}

export function PendingDecision({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/60 p-4">
      <p className="text-sm font-semibold text-warning">{title}</p>
      <p className="mt-1 text-xs text-warning/90">{note}</p>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-warning/80">
        Implementation decision required — no business rule confirmed
      </p>
    </div>
  );
}

/* ---------------- tables ---------------- */

export function DataTable<T>({
  rows,
  columns,
  keyFn,
  onRowClick,
  empty,
  mobileCard,
  loading,
  skeletonRows = 6,
}: {
  rows: T[];
  columns: { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  mobileCard?: (row: T) => ReactNode;
  /** Renders skeleton placeholder rows instead of `rows`/`empty` - for a page's initial data load. */
  loading?: boolean;
  skeletonRows?: number;
}) {
  if (loading) {
    return (
      <>
        <div className="hidden overflow-x-auto md:block scrollbar-slim">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                      c.className,
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-border/70 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-3 align-middle", c.className)}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-border bg-surface p-3 shadow-card"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </>
    );
  }
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block scrollbar-slim">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={keyFn(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/70 last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-surface-muted",
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-3 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div
            key={keyFn(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className="rounded-xl border border-border bg-surface p-3 shadow-card"
          >
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <dl className="space-y-1.5">
                {columns.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {c.header}
                    </dt>
                    <dd className="min-w-0 text-right">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num", className)}>
      ₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
    </span>
  );
}

/* ---------------- pagination ---------------- */

/** Slices `rows` into pages, resetting to page 1 whenever the row count changes (e.g. a search/filter). */
export function usePagedRows<T>(rows: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const end = Math.min(start + pageSize, rows.length);

  return {
    pageRows: rows.slice(start, end),
    page: current,
    setPage,
    pageCount,
    total: rows.length,
    start,
    end,
  };
}

export function TablePager({
  page,
  pageCount,
  total,
  start,
  end,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing {total ? start + 1 : 0}–{end} of {total}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <span className="num px-2 text-xs text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- bulk selection ---------------- */

/** Appears once one or more rows are checked; `children` are the bulk action buttons. */
export function BulkActionsBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary-soft/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">{count} selected</p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="size-4" /> Clear
        </Button>
      </div>
    </div>
  );
}

/* ---------------- icon button ---------------- */

/**
 * An icon-only Button with a real hover tooltip. Icon-only buttons across
 * the app used to rely on the plain HTML `title` attribute (slow to
 * appear, unstyled, and this is a touch/tablet-first POS where hover
 * barely applies) - or had no label at all. Wraps AppShell's app-wide
 * `TooltipProvider` (see AppShell.tsx), so this only needs using inside
 * the shell, not its own provider per instance.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size"> & { label: string }
>(({ label, variant = "ghost", ...props }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button ref={ref} size="icon" variant={variant} aria-label={label} {...props} />
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
));
IconButton.displayName = "IconButton";
