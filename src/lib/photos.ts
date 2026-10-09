import { useSyncExternalStore } from "react";
import { API_BASE_URL, EXE_BASE_URL, photoApi } from "@/lib/api";

// Menu photos (owner 2026-10-09). A menu item's photo is a BillerPe library
// photo ("…/menu-photos/<name>.webp" in S3). The outlet PC keeps a copy of
// its menu's photos, so they are loaded from the PC (offline billing shows
// them too); billing tiles use the small copy ("<name>-t.webp").

const FILE = /\/menu-photos\/([a-z0-9-]+?)(-t)?\.webp$/;

/** Where to load a menu photo from: the outlet PC for library photos, as-is for anything older. */
export function photoSrc(url: string | null | undefined, small = false): string | undefined {
  if (!url) return undefined;
  const m = url.match(FILE);
  if (m) return `${EXE_BASE_URL}/menu-photos/${m[1]}${small ? "-t" : ""}.webp`;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
}

/* The outlet's choice "Show photos while billing" (on by default), kept by the PC from BillerPe. */
let billingPhotos = true;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function loadBillingPhotos() {
  if (loaded) return;
  loaded = true;
  photoApi
    .prefs()
    .then((p) => {
      billingPhotos = p.billingPhotos !== false;
      emit();
    })
    .catch(() => {
      loaded = false;
    });
}

export async function setBillingPhotos(on: boolean) {
  const p = await photoApi.setPrefs(on);
  billingPhotos = p.billingPhotos !== false;
  emit();
}

export function useBillingPhotos() {
  loadBillingPhotos();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => billingPhotos,
  );
}

/** The tile colour of an item without a photo, steady per name. */
export function initialTone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 88%)`;
}
