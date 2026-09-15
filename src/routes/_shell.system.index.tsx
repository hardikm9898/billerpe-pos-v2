import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ListOrdered, RefreshCw, ServerCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Page, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/kit";
import { Notice } from "@/components/operations/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authApi, ApiError, getBrowserDeviceId } from "@/lib/api";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/system/")({
  head: () => ({
    meta: [
      { title: "Local Server & Sync · BillerPe" },
      {
        name: "description",
        content: "This device's local server status and cloud sync health.",
      },
      { property: "og:title", content: "Local Server & Sync · BillerPe" },
      { property: "og:description", content: "Local server status and cloud sync health." },
    ],
  }),
  component: SystemPage,
});

// Same recency window the exe's own device heartbeat uses (see
// billerpe-local-exe services/syncScheduler.js's withOnlineStatus) - a
// tick that's merely running slightly behind schedule shouldn't flip the
// card to "Offline", only a tick that's actually stopped happening should.
function isServerOnline(lastSuccessfulSyncAt: string | null, intervalSeconds: number): boolean {
  if (!lastSuccessfulSyncAt) return false;
  const thresholdMs = intervalSeconds * 1000 * 2.5;
  return Date.now() - new Date(lastSuccessfulSyncAt).getTime() < thresholdMs;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "Just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function SystemPage() {
  const store = useStore();
  const status = store.localServerStatus;
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    store.loadServerStatusFromServer();
    const id = setInterval(() => store.loadServerStatusFromServer(), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sequenceOpen, setSequenceOpen] = useState(false);

  // Real recovery path for a real production failure: the exe's own cloud
  // session (used only for the background config/roles pull, entirely
  // separate from staff login) can die and never self-heal - the cloud
  // only ever honors the MOST RECENT login's refresh token per account
  // (middleware/adminAuth.js's own comment), so a login elsewhere on the
  // same owner account silently kills this exe's stored session for good.
  // Confirmed live: services/syncScheduler.js then logs "cloud session
  // refresh failed - device may need re-registration" every tick,
  // forever, and the periodic pull can never reach later steps (like
  // pulling corrected Role rows) because it bails at the session-refresh
  // step first, every single time. registerDevice is safe to call again
  // here - controller/deviceRegistration.js's bootstrap is resumable and
  // upserts rather than wiping local data.
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthMobile, setReauthMobile] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);
  const orderNos = store.orders.map((o) => o.orderNo);
  const lowestOrderNo = orderNos.length ? Math.min(...orderNos) : 1;
  const highestOrderNo = orderNos.length ? Math.max(...orderNos) : 1;

  const maxOfflineDays =
    status?.registered && status.sync ? status.sync.maxOfflineDays : store.maxOfflineDays;

  // hasCloudSession (dashboard.js) only checks that a session cookie STRING
  // is stored - it says nothing about whether the cloud still honors it.
  // lastError.phase === "session-refresh" is the real signal that it's
  // actually dead, not merely due for its next scheduled refresh.
  const cloudSessionBroken =
    status?.registered && status.sync?.lastError?.phase === "session-refresh";

  async function handleReauth() {
    setReauthLoading(true);
    try {
      await authApi.registerDevice(reauthMobile, reauthPassword, getBrowserDeviceId());
      toast.success("Re-authenticated with the cloud", {
        description: "Background sync will pick up correct data on its next tick.",
      });
      setReauthOpen(false);
      setReauthMobile("");
      setReauthPassword("");
      void store.loadServerStatusFromServer();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reach the cloud");
    } finally {
      setReauthLoading(false);
    }
  }

  async function handleForceSync() {
    setSyncing(true);
    try {
      await store.forceSyncServer();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Page>
      <PageHeader
        icon={ServerCog}
        title="Local Server & Sync"
        description={`Billing continues against the local server while offline. New transactions block after ${maxOfflineDays} days.`}
        actions={
          <Button onClick={handleForceSync} disabled={syncing || !status?.registered}>
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} /> Force sync now
          </Button>
        }
      />

      {!status ? (
        <Notice tone="info" title="Loading local server status...">
          Fetching status from this device's local server.
        </Notice>
      ) : !status.registered ? (
        <Notice tone="warning" title="This device is not registered yet">
          Register this terminal against a hotel before local server and sync status is available.
        </Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Server status"
              value={
                isServerOnline(status.sync.lastSuccessfulSyncAt, status.sync.intervalSeconds) ? (
                  <StatusBadge status="Online" />
                ) : (
                  <StatusBadge status="Offline" />
                )
              }
              tone={
                isServerOnline(status.sync.lastSuccessfulSyncAt, status.sync.intervalSeconds)
                  ? "success"
                  : "warning"
              }
            />
            <StatCard
              label="Last synced"
              value={formatRelative(status.sync.lastSuccessfulSyncAt)}
              tone="info"
            />
            <StatCard
              label="Pending orders"
              value={status.sync.pendingOrderCount}
              tone={status.sync.pendingOrderCount > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Offline days remaining"
              value={Math.max(0, status.sync.maxOfflineDays - status.sync.daysSinceSync)}
              tone={status.sync.transactionsBlocked ? "primary" : "default"}
              hint={status.sync.transactionsBlocked ? "Billing is currently blocked" : undefined}
            />
          </div>

          {status.sync.lastError ? (
            <Notice
              tone="warning"
              title={
                cloudSessionBroken
                  ? "This server's cloud login has stopped working"
                  : `Last sync error - ${status.sync.lastError.phase}`
              }
              action={
                cloudSessionBroken ? (
                  <Button size="sm" onClick={() => setReauthOpen(true)}>
                    <KeyRound className="size-4" /> Re-authenticate with cloud
                  </Button>
                ) : undefined
              }
            >
              {cloudSessionBroken
                ? "Usually because the owner/admin account signed in somewhere else since. Local billing keeps working; menu/role/config updates from the cloud won't reach this device until you re-authenticate."
                : `${status.sync.lastError.message} (${formatRelative(status.sync.lastError.at)})`}
            </Notice>
          ) : null}

          <SectionCard title="This server" bodyClassName="p-3 sm:p-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Hotel</dt>
                <dd className="text-sm font-medium">{status.hotelName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Device</dt>
                <dd className="text-sm font-medium">{status.hostname}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">App version</dt>
                <dd className="text-sm font-medium num">{status.app_version}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Device ID</dt>
                <dd className="truncate text-sm font-medium num">{status.deviceId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">LAN address</dt>
                <dd className="text-sm font-medium num">
                  {status.lanAddresses.length ? status.lanAddresses.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cloud session</dt>
                <dd className="text-sm font-medium">
                  <StatusBadge
                    status={
                      cloudSessionBroken ? "Failed" : status.hasCloudSession ? "Active" : "Inactive"
                    }
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Server started</dt>
                <dd className="text-sm font-medium num">
                  {new Date(status.serverStartedAt).toLocaleString("en-IN")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tables</dt>
                <dd className="text-sm font-medium num">
                  {status.tables.running} running · {status.tables.free} free ·{" "}
                  {status.tables.total} total
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Orders</dt>
                <dd className="text-sm font-medium num">
                  {status.orders.today} today · {status.orders.offlineTotal} offline (all-time)
                </dd>
              </div>
            </dl>
          </SectionCard>
        </>
      )}

      {store.canSpecial("system.remakeOrderSequence") ? (
        <SectionCard title="Make Order No. Sequence" bodyClassName="p-3 sm:p-4">
          <Notice
            tone="warning"
            title="Requires the 'Renumber the order number sequence' permission"
          >
            In the earlier app this lived under the super-admin console, not the outlet's own
            settings. Deleting orders leaves gaps in the bill sequence; this renumbers every order
            back into one continuous run.
          </Notice>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Currently <span className="num font-medium text-foreground">#{lowestOrderNo}</span>{" "}
              through <span className="num font-medium text-foreground">#{highestOrderNo}</span> ·{" "}
              {store.orders.length} order(s)
            </p>
            <Button variant="outline" onClick={() => setSequenceOpen(true)}>
              <ListOrdered className="size-4" /> Renumber sequence
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <Dialog open={sequenceOpen} onOpenChange={setSequenceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renumber order sequence</DialogTitle>
            <DialogDescription>
              Every order closes back into one continuous run starting at #1 (or from the start of
              the financial year, if bill reset is set to yearly). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSequenceOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                store.remakeOrderSequence();
                setSequenceOpen(false);
              }}
            >
              Confirm renumber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reauthOpen} onOpenChange={setReauthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-authenticate with the cloud</DialogTitle>
            <DialogDescription>
              Enter the outlet owner/admin's BillerPe cloud login again - this only refreshes the
              background sync session, it does not affect any staff logins on this terminal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reauthMobile">Owner/admin mobile number</Label>
              <Input
                id="reauthMobile"
                className="mt-1.5"
                value={reauthMobile}
                maxLength={10}
                onChange={(e) => setReauthMobile(e.target.value.replace(/\D/g, ""))}
                placeholder="10-digit mobile number"
              />
            </div>
            <div>
              <Label htmlFor="reauthPassword">Owner/admin password</Label>
              <PasswordInput
                id="reauthPassword"
                className="mt-1.5"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReauthOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reauthLoading || !reauthMobile || !reauthPassword}
              onClick={handleReauth}
            >
              {reauthLoading ? "Re-authenticating…" : "Re-authenticate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
