import { ImageOff, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { menuApi, photoApi, type PhotoSuggestion, type RawProductImage } from "@/lib/api";
import { initialTone, photoSrc, setBillingPhotos, useBillingPhotos } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/mock/types";

// Menu photos in the Web POS (owner 2026-10-09). Photos come only from
// BillerPe's library: search and pick (typos and other spellings are
// fine; related photos when nothing matches), "Match photos" for the whole
// menu (clear matches ticked, nothing saved until confirmed), or ask
// BillerPe for a photo it does not have yet. Nobody uploads from here.

/** An item's picture on a billing tile: its small photo, else a coloured initial. */
export function ItemPhoto({ item, className }: { item: Pick<MenuItem, "name" | "imageUrl">; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = photoSrc(item.imageUrl, true);
  if (src && !broken) return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={cn("object-cover", className)} />;
  return (
    <span aria-hidden className={cn("grid place-items-center font-semibold text-foreground/60", className)} style={{ background: initialTone(item.name) }}>
      {item.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Search the library and pick one photo for an item. */
export function PhotoSearchDialog({ open, onOpenChange, itemName, onSelect }: { open: boolean; onOpenChange: (o: boolean) => void; itemName: string; onSelect: (url: string) => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [images, setImages] = useState<RawProductImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (open) {
      setSearch(itemName);
      setDebounced(itemName);
      setAsked(false);
    }
  }, [open, itemName]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    menuApi
      .getProductImages(debounced.trim())
      .then(({ data }) => !cancelled && setImages(data))
      .catch(() => !cancelled && setImages([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);
  const matches = images.filter((i) => i.match);
  const related = images.filter((i) => !i.match);
  const ask = async () => {
    const name = (itemName || search).trim();
    if (!name) return;
    try {
      const r = await photoApi.request(name);
      setAsked(true);
      toast.success(r.already ? "Already asked: BillerPe will add it." : "Asked BillerPe for this photo. It appears on the item when added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not ask now.");
    }
  };
  const grid = (list: RawProductImage[]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map((img) => (
        <button
          key={img.id}
          type="button"
          onClick={() => {
            onSelect(img.url);
            onOpenChange(false);
          }}
          title={img.name}
          className="overflow-hidden rounded-lg border border-border text-left transition hover:border-primary"
        >
          <img src={photoSrc(img.thumb || img.url) || img.url} alt={img.name} loading="lazy" className="aspect-square w-full object-cover" />
          <span className="line-clamp-2 px-1.5 py-1 text-[11px] font-medium leading-tight">{img.name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose a photo</DialogTitle>
          <DialogDescription>From BillerPe's photo library. Spelling mistakes are fine.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 rounded-md border border-input px-2">
          <Search className="size-4 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dish name" className="border-0 px-0 shadow-none focus-visible:ring-0" aria-label="Search photos" />
        </label>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {loading && !images.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
          ) : (
            <>
              {matches.length > 0 && grid(matches)}
              {related.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground">{matches.length ? "Related photos" : "No exact photo yet. Related ones:"}</p>
                  {grid(related)}
                </>
              )}
              {!images.length && <p className="py-6 text-center text-sm text-muted-foreground">No photos found.</p>}
            </>
          )}
        </div>
        {!loading && !matches.length && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
            <span>Not the right dish? BillerPe can add it to the library.</span>
            <Button size="sm" variant="outline" disabled={asked} onClick={() => void ask()}>
              <Send className="size-3.5" /> {asked ? "Asked" : "Ask BillerPe for this photo"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Match photos": the library's best photo for every item without one; the owner confirms. */
export function MatchPhotosDialog({ open, onOpenChange, items, save }: { open: boolean; onOpenChange: (o: boolean) => void; items: MenuItem[]; save: (item: MenuItem, url: string) => Promise<boolean> }) {
  const missing = useMemo(() => items.filter((i) => !i.imageUrl), [items]);
  const [rows, setRows] = useState<PhotoSuggestion[] | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const billing = useBillingPhotos();
  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    setChosen({});
    if (!missing.length) return setRows([]);
    photoApi
      .suggest(missing.map((i) => ({ key: i.id, name: i.name, veg: i.veg ? "veg" : "nonveg" })))
      .then((r) => {
        setRows(r.items);
        setTicked(Object.fromEntries(r.items.map((x) => [x.key, x.sure && !!x.best])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load suggestions."));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const urlOf = (r: PhotoSuggestion) => chosen[r.key] || r.best?.url || "";
  const toSave = (rows || []).filter((r) => ticked[r.key] && urlOf(r));
  const run = async () => {
    setProgress({ done: 0, total: toSave.length });
    let ok = 0;
    for (const r of toSave) {
      const item = missing.find((i) => i.id === r.key);
      if (item && (await save(item, urlOf(r)))) ok += 1;
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    toast.success(`${ok} photo${ok === 1 ? "" : "s"} saved`);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !progress && onOpenChange(o)}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match photos</DialogTitle>
          <DialogDescription>
            {missing.length} of {items.length} items have no photo. Clear matches are ticked: check them, change any, then save.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <span>
            <b>Show photos while billing</b>
            <span className="block text-xs text-muted-foreground">Off: the billing screen shows names only.</span>
          </span>
          <Switch
            checked={billing}
            onCheckedChange={(v) => void setBillingPhotos(v).catch((e) => toast.error(e instanceof Error ? e.message : "Could not change it."))}
            aria-label="Show photos while billing"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!rows && !error && <p className="py-8 text-center text-sm text-muted-foreground">Finding photos…</p>}
        {rows && !rows.length && <p className="py-8 text-center text-sm text-muted-foreground">Every item has a photo.</p>}
        <ul className="space-y-1.5">
          {(rows || []).map((r) => {
            const url = urlOf(r);
            const item = missing.find((i) => i.id === r.key);
            const label = chosen[r.key] ? "your choice" : r.best ? `${r.best.name}${r.best.score ? ` · ${r.best.score}%` : ""}` : "no match";
            return (
              <li key={r.key} className={cn("flex items-center gap-3 rounded-lg border px-2.5 py-2", ticked[r.key] && url ? "border-success/50 bg-success/5" : "border-border")}>
                <Checkbox checked={!!ticked[r.key] && !!url} disabled={!url} onCheckedChange={(v) => setTicked((t) => ({ ...t, [r.key]: !!v }))} aria-label={`Use the photo for ${r.name}`} />
                <button type="button" onClick={() => item && setPicking(item)} className="shrink-0" aria-label={`Choose a photo for ${r.name}`}>
                  {url ? (
                    <img src={photoSrc(url, true)} alt="" className="size-12 rounded-md object-cover" />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-md bg-surface-muted text-muted-foreground">
                      <ImageOff className="size-4" />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => item && setPicking(item)}>
                  Choose
                </Button>
              </li>
            );
          })}
        </ul>
        {progress && <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />}
        <DialogFooter>
          <Button disabled={!toSave.length || !!progress} onClick={() => void run()}>
            {progress ? `Saving ${progress.done}/${progress.total}…` : `Save ${toSave.length || ""} photo${toSave.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
        <PhotoSearchDialog
          open={!!picking}
          onOpenChange={(o) => !o && setPicking(null)}
          itemName={picking?.name || ""}
          onSelect={(u) => {
            if (!picking) return;
            setChosen((c) => ({ ...c, [picking.id]: u }));
            setTicked((t) => ({ ...t, [picking.id]: true }));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
