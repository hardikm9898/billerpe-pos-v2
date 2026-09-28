import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PickableTable = { id: string; name: string; categoryId: string; seats?: number };

// The table list inside every move / transfer / merge / move-KOT dialog.
// With 100+ tables the old grid grew past the screen and could not be
// scrolled (owner report, 2026-09-28): this one is a fixed-height scrolling
// grid with a search box and one chip per section.
export function TablePicker<T extends PickableTable>({
  tables,
  sectionOf,
  onPick,
  icon,
  detail,
  emptyText = "No tables available.",
}: {
  tables: T[];
  sectionOf: (table: T) => string;
  onPick: (table: T) => void;
  icon?: ReactNode;
  /** second line on each table button; defaults to its section */
  detail?: (table: T) => string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const sections = useMemo(
    () => [...new Set(tables.map(sectionOf))].sort((a, b) => a.localeCompare(b)),
    [tables, sectionOf],
  );
  const q = query.trim().toLowerCase();
  const shown = tables.filter(
    (t) =>
      (section === "all" || sectionOf(t) === section) &&
      (!q || t.name.toLowerCase().includes(q) || sectionOf(t).toLowerCase().includes(q)),
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {tables.length > 6 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-8"
            placeholder="Search table or section…"
            aria-label="Search tables"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}
      {sections.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-slim">
          {["all", ...sections].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                section === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {s === "all" ? `All (${tables.length})` : s}
            </button>
          ))}
        </div>
      ) : null}
      <div
        data-table-picker-list
        className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto pr-1 scrollbar-slim sm:grid-cols-4"
      >
        {shown.map((t) => (
          <Button
            key={t.id}
            variant="outline"
            className="h-auto min-h-14 flex-col gap-0.5 py-2"
            onClick={() => onPick(t)}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {icon} {t.name}
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {detail ? detail(t) : sectionOf(t)}
            </span>
          </Button>
        ))}
        {shown.length === 0 ? (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
            {tables.length ? "No table matches." : emptyText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
