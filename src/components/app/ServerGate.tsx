import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  consumeOutageNeedsReload,
  getServerState,
  refreshServerState,
  subscribeServerState,
} from "@/lib/api";
import { useStore } from "@/mock/store";

// Customer-facing pages (e-bill link, QR menu) talk to the cloud and never
// need the restaurant's exe.
const PUBLIC_PREFIXES = ["/billview", "/qr-menu"];

const LAN_URLS_KEY = "billerpe.lanUrls";
const CHECK_EVERY_MS = 10_000;
const RETRY_WHILE_DOWN_MS = 4_000;

function rememberedLanUrls(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAN_URLS_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * The exe is the only authority for "can this device use BillerPe right
 * now". Asked on every page load and every few seconds after:
 *  - unreachable  -> one blocking screen (with the address to open on this
 *                    device), never a toast per failed request; when the exe
 *                    comes back the page reloads so nothing stale remains
 *  - not registered -> signed out, back to the registration form
 *  - registered   -> the app, exactly as before
 */
export function ServerGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const state = useSyncExternalStore(subscribeServerState, getServerState, getServerState);
  const store = useStore();
  const navigate = useNavigate();
  const everReachable = useRef(false);
  const lostWhileInApp = useRef(false);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await refreshServerState();
      if (cancelled) return;
      timer = setTimeout(
        tick,
        next.status === "unreachable" ? RETRY_WHILE_DOWN_MS : CHECK_EVERY_MS,
      );
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPublic]);

  useEffect(() => {
    if (state.status === "unreachable") {
      if (everReachable.current) lostWhileInApp.current = true;
      return;
    }
    if (state.status !== "reachable") return;
    if (lostWhileInApp.current) {
      lostWhileInApp.current = false;
      // A long outage, or one that left requests waiting, may have left
      // the screen stale or half-loaded - start clean. A short blip with
      // nothing pending just carries on, keeping what is on screen.
      if (consumeOutageNeedsReload()) {
        window.location.reload();
        return;
      }
    }
    everReachable.current = true;
    try {
      window.localStorage.setItem(LAN_URLS_KEY, JSON.stringify(state.lanUrls));
    } catch {
      // not important - only used to show the address while the exe is down
    }
    store.applyServerIdentity(state.registered, state.hotelName);
    if (!state.registered && store.authed) {
      store.resetDeviceRegistration();
      navigate({ to: "/login", replace: true });
    }
    // store's identity changes every render; only the server state matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (isPublic) return <>{children}</>;

  if (state.status === "checking" && !everReachable.current) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Connecting to the BillerPe server…
        </p>
      </div>
    );
  }

  if (state.status === "unreachable") {
    return <ServerUnreachable lanUrls={rememberedLanUrls()} />;
  }

  return <>{children}</>;
}

function ServerUnreachable({ lanUrls }: { lanUrls: string[] }) {
  // An https page is the public BillerPe website: Chrome will not let it
  // reach a plain-http server on the restaurant's network, so on any device
  // other than the server PC the fix is to open the server's own address.
  const onPublicSite = window.location.protocol === "https:";
  const addresses = lanUrls.length ? lanUrls : ["http://billerpe-local-server.local:4100"];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-raised">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ServerCrash className="size-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Can't reach the BillerPe server
        </h1>

        {onPublicSite ? (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              This is the online BillerPe website. It can only connect to your restaurant's server
              on the PC where that server is installed.
            </p>
            <p className="font-medium text-foreground">
              On a kitchen display or any other device, open this address instead:
            </p>
            <AddressList addresses={addresses} />
            <p>
              On the server PC itself, make sure <b>BillerPe Local Server</b> is running (look for
              its icon near the clock, or start it from the Start menu).
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              BillerPe Local Server isn't responding. Billing, KOTs and settlement are paused until
              it is back.
            </p>
            <p>
              On the server PC, make sure <b>BillerPe Local Server</b> is running (look for its icon
              near the clock, or start it from the Start menu). If this device is not the server PC,
              check it is on the same Wi-Fi/network.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Checking again automatically…
          </p>
          <Button onClick={() => void refreshServerState()}>
            <RefreshCw className="size-4" /> Try now
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddressList({ addresses }: { addresses: string[] }) {
  return (
    <ul className="space-y-1.5">
      {addresses.map((url) => (
        <li key={url}>
          <a className="num font-mono text-sm font-semibold text-primary underline" href={url}>
            {url}
          </a>
        </li>
      ))}
    </ul>
  );
}
