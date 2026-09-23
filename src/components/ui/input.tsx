import * as React from "react";

import { cn } from "@/lib/utils";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/30";

type InputProps = React.ComponentProps<"input"> & {
  /** type="number" only: an emptied field stays empty instead of showing 0
   * (for optional filters, where empty means "no limit"). */
  allowEmpty?: boolean | undefined;
};

/**
 * Cleans what was typed into a number field (owner report, 2026-09-22):
 * digits only, never a minus sign, at most one decimal point (and none
 * when `decimals` is false), no leading zeros ("01" -> "1"), and an emptied
 * field reads "0" unless `allowEmpty`.
 */
export function cleanNumberText(
  raw: string,
  { decimals, allowEmpty }: { decimals: boolean; allowEmpty: boolean },
): string {
  let s = raw.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
  if (decimals) {
    const dot = s.indexOf(".");
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    if (s.startsWith(".")) s = `0${s}`;
  }
  s = s.replace(/^0+(?=\d)/, "");
  if (s === "") return allowEmpty ? "" : "0";
  return s;
}

function numberText(value: unknown, allowEmpty: boolean): string {
  if (value === null || value === undefined || value === "") return allowEmpty ? "" : "0";
  return String(value);
}

/**
 * Every type="number" field in the app. Rendered as a text box with a
 * numeric keypad (inputMode), because the browser's own number box is what
 * caused the reported problems: typing after the default 0 showed "01"
 * (React never rewrites a number box whose text equals the value
 * numerically), and its spinner arrows / arrow keys / mouse wheel changed
 * amounts by accident - down to negative values. Callers keep reading
 * e.target.value exactly as before; it now only ever holds a clean number.
 * Focusing selects the whole value, so typing replaces the 0 (or a qty's 1).
 * `step` with a whole number (e.g. step={1}) means whole numbers only.
 */
const NumberInput = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      value,
      defaultValue,
      onChange,
      onFocus,
      step,
      min,
      max,
      allowEmpty = false,
      ...props
    },
    ref,
  ) => {
    void min;
    void max;
    const decimals = step === undefined || step === "any" || !Number.isInteger(Number(step));
    const controlled = value !== undefined;
    const [text, setText] = React.useState(() => numberText(value, allowEmpty));

    // Show what was typed while it is the same NUMBER as the value ("12." is
    // 12 - a half-typed decimal survives); otherwise show the value itself -
    // a reset, a clamp (qty can't go below 1) or a change the parent refused.
    // Worked out during render, so the corrected number shows at once.
    const valueText = numberText(value, allowEmpty);
    const shown =
      text === valueText || (text !== "" && valueText !== "" && Number(text) === Number(valueText))
        ? text
        : valueText;

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        className={cn(inputClass, className)}
        {...(controlled
          ? { value: shown }
          : defaultValue !== undefined
            ? { defaultValue: numberText(defaultValue, allowEmpty) }
            : {})}
        onFocus={(e) => {
          if (!e.currentTarget.readOnly) e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const clean = cleanNumberText(e.target.value, { decimals, allowEmpty });
          if (e.target.value !== clean) e.target.value = clean;
          if (controlled) setText(clean);
          onChange?.(e);
        }}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, allowEmpty, ...props }, ref) => {
    if (type === "number") {
      return <NumberInput ref={ref} className={className} allowEmpty={allowEmpty} {...props} />;
    }
    return <input type={type} className={cn(inputClass, className)} ref={ref} {...props} />;
  },
);
Input.displayName = "Input";

export { Input };
