import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
  /** second line under the label (menu, category, code...) */
  hint?: string;
  /** extra words the search matches on, e.g. a short code */
  keywords?: string[];
};

// A Select you can type into: every word typed must appear somewhere in the
// option's label, hint or keywords. Long names wrap instead of being cut off
// (owner report, 2026-09-28: a recipe's dish list could not be searched and
// long item names did not show in full).
//
// Not portaled: inside a Sheet/Dialog a portaled list does not scroll with
// the mouse wheel (the modal's scroll lock swallows it). Radix positions it
// with `position: fixed`, so the Sheet's own overflow does not clip it.
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "Nothing matches",
  className,
  triggerProps,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          {...triggerProps}
          className={cn(
            "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive",
            className,
          )}
        >
          <span className={cn("min-w-0 break-words", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
      >
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = [itemValue, ...(keywords ?? [])].join(" ").toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((word) => hay.includes(word))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  // cmdk matches on this text; the value itself is the id.
                  value={`${o.label} ${o.value}`}
                  keywords={[o.hint ?? "", ...(o.keywords ?? [])]}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mt-0.5 self-start", o.value === value ? "opacity-100" : "opacity-0")}
                  />
                  <div className="min-w-0">
                    <p className="break-words">{o.label}</p>
                    {o.hint ? <p className="text-xs text-muted-foreground">{o.hint}</p> : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
