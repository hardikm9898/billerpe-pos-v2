import { useCallback, useState } from "react";
import { toast } from "sonner";

// One way every form in the app checks itself before saving:
//  - required fields carry <Label required> (a red *)
//  - on Save, check() marks each missing/invalid field with its own message
//    (shown by <FieldError>), lists them in one toast, and puts the cursor
//    on the first one - the form stays open so nothing typed is lost
//  - a field's message clears as soon as it is edited (clearError)
// Give the input `data-field="<key>"` so check() can focus it, and
// `aria-invalid={!!errors.<key>}` for the red border.

export type FieldRule = {
  key: string;
  /** What the field is called on screen, for the toast. */
  label: string;
  value: unknown;
  /** Custom check; default is "not empty". */
  valid?: (value: unknown) => boolean;
  /** Custom message; default is "<label> is required". */
  message?: string;
};

function filled(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function useFormCheck() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const check = useCallback((rules: FieldRule[]) => {
    const next: Record<string, string> = {};
    for (const r of rules) {
      const ok = r.valid ? r.valid(r.value) : filled(r.value);
      if (!ok) next[r.key] = r.message ?? `${r.label} is required`;
    }
    setErrors(next);
    const missing = rules.filter((r) => next[r.key]);
    if (!missing.length) return true;
    toast.error("Please complete the highlighted fields", {
      description: missing.map((r) => next[r.key]).join(" · "),
    });
    const first = missing[0];
    requestAnimationFrame(() => {
      const el = first ? document.querySelector<HTMLElement>(`[data-field="${first.key}"]`) : null;
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return false;
  }, []);

  const clearError = useCallback((key: string) => {
    setErrors((e) => {
      if (!(key in e)) return e;
      const n = { ...e };
      delete n[key];
      return n;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  /** Props for an input: focus target, red border, and clear-on-edit. */
  const fieldProps = useCallback(
    (key: string) => ({
      "data-field": key,
      "aria-invalid": !!errors[key] || undefined,
      onInput: () => clearError(key),
    }),
    [errors, clearError],
  );

  const error = useCallback((key: string) => errors[key], [errors]);

  return { errors, error, check, clearError, reset, fieldProps };
}

/** A field's own message, under it. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export const isPositive = (v: unknown) => typeof v === "number" && v > 0;
export const isNonNegative = (v: unknown) => typeof v === "number" && v >= 0;
export const isMobile10 = (v: unknown) => typeof v === "string" && /^\d{10}$/.test(v.trim());
export const isEmailOrEmpty = (v: unknown) =>
  typeof v !== "string" || !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Why a manual discount can't be applied, or null when it's fine. */
export function discountProblem(type: "percent" | "flat", value: number, subtotal: number) {
  if (!Number.isFinite(value) || value <= 0) return "Enter a discount more than 0";
  if (type === "percent" && value > 100) return "A percentage discount can't be more than 100%";
  if (type === "flat" && value > subtotal)
    return `A flat discount can't be more than the ₹${subtotal.toLocaleString("en-IN")} bill`;
  return null;
}
