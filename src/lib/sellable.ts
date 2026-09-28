import type { AddonGroup, MenuCategory, MenuItem } from "@/mock/types";

// What billing may offer. The store holds the Menu screens' full list -
// inactive items, categories, variants and addon groups included (owner
// decision 2026-09-28: inactive = listed there, never sold) - so every
// billing screen narrows it through these.

/** An active item in an active category. */
export function isSellable(item: MenuItem, categoriesById: Map<string, MenuCategory>): boolean {
  return item.active && categoriesById.get(item.categoryId)?.active !== false;
}

/** The item as billing should see it: only its active variants and addon groups. */
export function sellableItem(item: MenuItem, addonGroups: AddonGroup[]): MenuItem {
  const activeGroup = new Set(addonGroups.filter((g) => g.active !== false).map((g) => g.id));
  return {
    ...item,
    variants: item.variants?.filter((v) => v.active !== false),
    addonGroupIds: item.addonGroupIds?.filter((id) => activeGroup.has(id)),
  };
}

/** Menu > Categories order (sort order, then id) - the order every billing
 * screen lists categories in, and the Captain App's too. */
export function byCategoryOrder(a: MenuCategory, b: MenuCategory): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(a.id) - Number(b.id);
}
