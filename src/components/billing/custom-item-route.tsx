import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError } from "@/lib/formCheck";
import { useStore } from "@/mock/store";

export type CustomItemRoute = { printerId?: number; kitchenId?: number };

// A custom item has no menu category, which is what KOT printers and KDS
// kitchens route by. Owner rule (2026-09-24): with one printer and one KDS
// it simply goes there; only an outlet with more than one of either is asked
// where this item goes.
export function useCustomItemStations() {
  const store = useStore();
  const kotPrinters = store.printers.filter((p) => p.printType === "KOT");
  const kitchens = store.kitchens;
  return {
    kotPrinters,
    kitchens,
    askPrinter: kotPrinters.length > 1,
    askKitchen: kitchens.length > 1,
  };
}

/** The message to show when a required choice is missing, else null. */
export function customRouteProblem(
  stations: ReturnType<typeof useCustomItemStations>,
  route: CustomItemRoute,
): string | null {
  if (stations.askPrinter && !route.printerId) return "Choose which KOT printer prints this item";
  if (stations.askKitchen && !route.kitchenId)
    return "Choose which kitchen display shows this item";
  return null;
}

export function CustomItemRouteFields({
  route,
  onChange,
  error,
}: {
  route: CustomItemRoute;
  onChange: (route: CustomItemRoute) => void;
  error?: string | null;
}) {
  const stations = useCustomItemStations();
  if (!stations.askPrinter && !stations.askKitchen) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {stations.askPrinter ? (
          <div className="space-y-1.5">
            <Label required>KOT printer</Label>
            <Select
              value={route.printerId ? String(route.printerId) : ""}
              onValueChange={(v) => onChange({ ...route, printerId: Number(v) })}
            >
              <SelectTrigger aria-label="KOT printer">
                <SelectValue placeholder="Choose printer" />
              </SelectTrigger>
              <SelectContent>
                {stations.kotPrinters.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {stations.askKitchen ? (
          <div className="space-y-1.5">
            <Label required>Kitchen display</Label>
            <Select
              value={route.kitchenId ? String(route.kitchenId) : ""}
              onValueChange={(v) => onChange({ ...route, kitchenId: Number(v) })}
            >
              <SelectTrigger aria-label="Kitchen display">
                <SelectValue placeholder="Choose kitchen" />
              </SelectTrigger>
              <SelectContent>
                {stations.kitchens.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
}
