import type { PaymentSplit } from "@/mock/types";

export function splitPaid(splits: PaymentSplit[]) {
  return splits.reduce((s, p) => s + p.amount, 0);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const isCash = (mode: string) => mode.trim().toLowerCase() === "cash";

/**
 * Checks a split payment against the bill (owner rule, 2026-09-22):
 *   - only CASH may be more than the bill - the extra is change to return;
 *   - every other mode (UPI, card, due, the outlet's own) can never add up
 *     to more than the bill;
 *   - the bill must be covered in full.
 * The keyboard screen used to accept any overpayment at all, so picking two
 * modes and typing the bill total into both settled it for twice the amount.
 */
export function splitCheck(splits: PaymentSplit[], total: number) {
  const bill = r2(total);
  const collected = r2(splitPaid(splits));
  const nonCash = r2(splits.filter((p) => !isCash(p.mode)).reduce((sum, p) => sum + p.amount, 0));
  const cash = r2(collected - nonCash);
  const balance = r2(bill - collected);
  const change = r2(Math.max(0, collected - bill));
  let problem: string | undefined;
  // A refund (a negative bill) is the mirror image and has its own screen -
  // the "only cash may exceed" rule does not apply there.
  if (bill < 0) return { bill, collected, nonCash, cash, balance, change: 0, problem: undefined };
  if (splits.some((p) => p.amount < 0)) problem = "A payment can't be negative.";
  else if (nonCash > bill + 0.009) {
    problem = `Only cash can be more than the bill. The other modes add up to more than ₹${bill}.`;
  } else if (cash > 0.009 && nonCash >= bill - 0.009) {
    // The bill is already paid by the other modes, so this cash is a typo -
    // exactly the reported case: the bill total typed into two modes at once.
    problem = `The other modes already cover ₹${bill}. Remove the cash amount.`;
  } else if (balance > 0.009) problem = `₹${balance} still to pay.`;
  return { bill, collected, nonCash, cash, balance, change, problem };
}
