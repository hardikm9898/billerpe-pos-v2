import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseQty, sanitizeQtyInput } from "@/lib/qty";

// A typed item quantity (10 instead of ten "+" taps, or 1.5 - up to 2
// decimals; owner rule, 2026-09-24). Holds the text being typed ("1." is a
// fine half-way state) and reports a number when the cashier is done:
// Enter, or leaving the box. `commitOnChange` reports on every keystroke
// instead, for forms that read the number at submit.
export function QtyInput({
  value,
  onCommit,
  commitOnChange,
  disabled,
  className,
  id,
  label,
  allowZero = true,
}: {
  value: number;
  onCommit: (qty: number) => void;
  commitOnChange?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  label?: string;
  /** false where 0 makes no sense (a new custom item) - 0 is refused, not sent. */
  allowZero?: boolean;
}) {
  const [text, setText] = useState(String(value));
  // The last quantity reported for the current value: Enter reports and then
  // the box loses focus, which must not report (and apply) it a second time.
  const sent = useRef<number | null>(null);
  // A click into the box selects the whole number so typing replaces it -
  // the mouseup that follows the focus would otherwise drop the selection
  // and "5" typed after "10" became 105.
  const justFocused = useRef(false);

  useEffect(() => {
    sent.current = null;
    // Follow the value when it changes from outside (+/- buttons), unless
    // it is what is already typed.
    setText((t) => (parseQty(t) === value ? t : String(value)));
  }, [value]);

  const commit = () => {
    const q = parseQty(text);
    if (q === null || (!allowZero && q <= 0)) {
      setText(String(value));
      return;
    }
    setText(String(q));
    if (q === value || q === sent.current) return;
    sent.current = q;
    onCommit(q);
  };

  return (
    <input
      id={id}
      aria-label={label ?? "Quantity"}
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onFocus={(e) => {
        justFocused.current = true;
        sent.current = null;
        e.currentTarget.select();
      }}
      onMouseUp={(e) => {
        if (justFocused.current) e.preventDefault();
        justFocused.current = false;
      }}
      onChange={(e) => {
        justFocused.current = false;
        const next = sanitizeQtyInput(e.target.value);
        setText(next);
        if (commitOnChange) {
          const q = parseQty(next);
          if (q !== null && (allowZero || q > 0)) onCommit(q);
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "num h-7 w-12 rounded-md border border-input bg-background text-center text-sm font-semibold outline-none focus:border-primary disabled:opacity-60",
        className,
      )}
    />
  );
}
