import type { MenuItem } from "@/mock/types";

// One item search for every billing screen (touch table screen, keyboard
// billing), so typing a SKU finds the same item everywhere.
//
// Ranked, best first:
//   1. SKU or barcode exactly equal to what was typed
//   2. SKU starting with it
//   3. item name starting with it, or any word in the name starting with it
//   4. item name containing it
// The SKU is never matched "anywhere inside" (typing 1 used to bring up
// every SKU containing a 1), and the internal database id is never matched
// at all (keyboard billing used to pick whichever item was record #12 when
// someone typed the SKU 12).
export function searchMenuItems<T extends Pick<MenuItem, "name" | "sku" | "barcode">>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const ranked: { item: T; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const sku = (item.sku ?? "").trim().toLowerCase();
    const barcode = (item.barcode ?? "").trim().toLowerCase();
    const name = item.name.toLowerCase();
    let rank = 0;
    if ((sku && sku === q) || (barcode && barcode === q)) rank = 1;
    else if (sku && sku.startsWith(q)) rank = 2;
    else if (name.startsWith(q) || name.split(/[\s\-/(]+/).some((w) => w.startsWith(q))) rank = 3;
    else if (name.includes(q)) rank = 4;
    if (rank) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((r) => r.item);
}
