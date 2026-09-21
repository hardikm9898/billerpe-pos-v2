import type React from "react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { Customer } from "@/mock/types";

export type CustomerDetails = { phone: string; name: string; address: string; gstin: string };

// Indian GSTIN: 2-digit state code, PAN (5 letters, 4 digits, 1 letter),
// entity number, "Z", checksum.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The one customer form used everywhere a bill takes customer details
 * (table order screen, keyboard billing). Mobile comes first and suggests
 * saved customers as you type; picking one fills name, address and GSTIN. */
export function CustomerDetailsDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  onClear,
  title = "Customer details",
  onPhoneChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<CustomerDetails>;
  onSave: (details: CustomerDetails) => void;
  /** Shown only when the order already has a customer. */
  onClear?: () => void;
  title?: string;
  /** Told the digits typed so far, for look-ups the caller shows below. */
  onPhoneChange?: (digits: string) => void;
  /** Extra content under the mobile field (e.g. outstanding due, last
   * order), given the digits typed so far. */
  children?: (digits: string) => ReactNode;
}) {
  const store = useStore();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const gstinRef = useRef<HTMLInputElement>(null);
  // Enter moves to the next field, for keyboard billing.
  const enterTo = (next: React.RefObject<HTMLInputElement | null>) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    setPhone((initial.phone ?? "").replace(/\D/g, "").slice(-10));
    setName(initial.name ?? "");
    setAddress(initial.address ?? "");
    setGstin(initial.gstin ?? "");
    setHighlight(0);
    setListOpen(false);
    setShowErrors(false);
    // Only when the dialog opens - not while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) onPhoneChange?.(phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, open]);

  // Asks the exe too once a few digits are in, so customers beyond the
  // list held in memory are found as well.
  const [remote, setRemote] = useState<Customer[]>([]);
  useEffect(() => {
    if (!open || phone.length < 4) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      customerApi
        .searchByMobile(phone)
        .then(({ numbers }) => {
          if (cancelled) return;
          setRemote(
            numbers
              .filter((c) => c.number)
              .map((c) => ({
                id: `remote-${c.id}`,
                name: c.name ?? "",
                phone: String(c.number),
                address: c.address ?? "",
                gstin: c.gstin ?? "",
                orders: 0,
                lastVisit: "",
              })),
          );
        })
        .catch(() => {
          // Suggestions only - the in-memory list still works.
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phone, open]);

  const activeCustomers = useMemo(() => {
    const byPhone = new Map<string, Customer>();
    for (const c of store.customers) if (c.active !== false && c.phone) byPhone.set(c.phone, c);
    for (const c of remote) if (!byPhone.has(c.phone)) byPhone.set(c.phone, c);
    return [...byPhone.values()];
  }, [store.customers, remote]);

  // Numbers containing what was typed, those starting with it first.
  const suggestions = useMemo(() => {
    if (phone.length < 3) return [];
    return activeCustomers
      .filter((c) => c.phone.includes(phone) && c.phone !== phone)
      .sort((a, b) => Number(b.phone.startsWith(phone)) - Number(a.phone.startsWith(phone)))
      .slice(0, 6);
  }, [activeCustomers, phone]);

  const choose = (c: Customer) => {
    setPhone(c.phone.replace(/\D/g, "").slice(-10));
    setName(c.name ?? "");
    setAddress(c.address ?? "");
    setGstin((c.gstin ?? "").toUpperCase());
    setListOpen(false);
    // Straight on to the next field, ready to confirm or edit.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const handlePhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    setHighlight(0);
    setListOpen(true);
    // A full number that is a saved customer fills in by itself - but never
    // over details already typed for someone else.
    if (digits.length === 10 && !name && !address && !gstin) {
      const exact = activeCustomers.find((c) => c.phone.replace(/\D/g, "").slice(-10) === digits);
      if (exact) {
        setName(exact.name ?? "");
        setAddress(exact.address ?? "");
        setGstin((exact.gstin ?? "").toUpperCase());
        setListOpen(false);
      }
    }
  };

  const phoneError = phone.length !== 10 ? "Enter a 10-digit mobile number" : null;
  const gstinError =
    gstin && !GSTIN_PATTERN.test(gstin) ? "Enter a valid 15-character GSTIN" : null;

  const save = () => {
    if (phoneError || gstinError) {
      setShowErrors(true);
      return;
    }
    onSave({ phone, name: name.trim(), address: address.trim(), gstin });
    onOpenChange(false);
  };

  const showList = listOpen && suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Start with the mobile number - saved customers appear as you type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cust-mobile">Mobile</Label>
            <div className="relative">
              <Input
                id="cust-mobile"
                autoFocus
                autoComplete="off"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => handlePhoneInput(e.target.value)}
                onFocus={() => setListOpen(true)}
                onBlur={() => setTimeout(() => setListOpen(false), 150)}
                onKeyDown={(e) => {
                  if (!showList) {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      nameRef.current?.focus();
                    }
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight((h) => (h + 1) % suggestions.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const c = suggestions[highlight];
                    if (c) choose(c);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setListOpen(false);
                  }
                }}
                className="num"
                role="combobox"
                aria-expanded={showList}
                aria-controls="cust-suggestions"
              />
              {showList ? (
                <ul
                  id="cust-suggestions"
                  role="listbox"
                  data-customer-suggestions
                  className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
                >
                  {suggestions.map((c, i) => (
                    <li key={c.id} role="option" aria-selected={i === highlight}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => choose(c)}
                        className={cn(
                          "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left",
                          i === highlight
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-surface-muted",
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2 text-sm">
                          <span className="num font-medium">{c.phone}</span>
                          <span className="truncate">{c.name || "—"}</span>
                        </span>
                        {c.address || c.gstin ? (
                          <span
                            className={cn(
                              "truncate text-xs",
                              i === highlight
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {[c.address, c.gstin].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {showErrors && phoneError ? (
              <p className="text-xs text-destructive">{phoneError}</p>
            ) : null}
            {children?.(phone)}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              ref={nameRef}
              onKeyDown={enterTo(addressRef)}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-address">Address</Label>
            <Input
              id="cust-address"
              ref={addressRef}
              onKeyDown={enterTo(gstinRef)}
              autoComplete="off"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-gstin">GSTIN</Label>
            <Input
              id="cust-gstin"
              ref={gstinRef}
              autoComplete="off"
              value={gstin}
              maxLength={15}
              onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="Optional - for a GST bill"
              className="num uppercase"
            />
            {showErrors && gstinError ? (
              <p className="text-xs text-destructive">{gstinError}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {onClear && initial.phone ? (
            <Button
              variant="outline"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              Remove customer
            </Button>
          ) : null}
          <Button data-customer-save onClick={save}>
            Save customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
