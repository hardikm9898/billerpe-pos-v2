import { FieldError, isMobile10, useFormCheck } from "@/lib/formCheck";
import { createFileRoute } from "@tanstack/react-router";
import { Download, KeyRound, ListOrdered, RefreshCw, ServerCog } from "lucide-react";
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
import {
  ApiError,
  exeUpdateApi,
  localServerApi,
  registerThisPc,
  type RawExeUpdateStatus,
  type RawSyncProblem,
} from "@/lib/api";
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

// What this outlet could not get onto the BillerPe server, and why
// (billerpe-local-exe controller/syncProblems.js). Before this a refusal only
// reached the exe's console log, so nobody knew a login or menu row never
// arrived online (owner decision, 2026-09-28).
function SyncProblemsCard({ reloadKey }: { reloadKey: number }) {
  const [problems, setProblems] = useState<RawSyncProblem[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      localServerApi
        .getSyncProblems()
        .then(({ problems }) => alive && setProblems(problems))
        .catch(() => alive && setProblems((p) => p ?? []));
    void load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [reloadKey]);

  return (
    <SectionCard
      title={`Sync problems${problems?.length ? ` (${problems.length})` : ""}`}
      bodyClassName="p-3 sm:p-4"
    >
      {problems === null ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : !problems.length ? (
        <p data-sync-problems="none" className="text-sm text-muted-foreground">
          Everything on this PC has reached the BillerPe server.
        </p>
      ) : (
        <ul data-sync-problems className="space-y-2">
          {problems.map((p) => (
            <li
              key={`${p.entity}-${p.local_id}`}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.label ?? `${p.entity} #${p.local_id}`}</span>
                <span
                  className={
                    p.retryable
                      ? "rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      : "rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                  }
                >
                  {p.retryable
                    ? "Retrying automatically"
                    : "Needs a change - not retried until edited"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.message ?? "Refused by the BillerPe server"} · {p.attempts} attempt
                {p.attempts === 1 ? "" : "s"} · {formatRelative(p.last_failed_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// This server's own software update (billerpe-local-exe services/exeUpdate.js,
// owner decision 2026-09-30): a newer version downloads by itself, installs
// at night when nobody is billing, or now with "Restart & update".
function ServerUpdateCard() {
  const store = useStore();
  const [info, setInfo] = useState<RawExeUpdateStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      exeUpdateApi
        .status()
        .then((s) => alive && setInfo(s))
        .catch(() => {});
    void load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // After "Restart & update": wait for the server to answer with the new
  // version, then reload so this screen runs against it.
  useEffect(() => {
    if (!installing) return;
    const started = Date.now();
    const id = setInterval(async () => {
      const running = await exeUpdateApi.runningVersion();
      if (running === installing) {
        clearInterval(id);
        toast.success(`BillerPe server updated to ${installing}`);
        window.location.reload();
      } else if (Date.now() - started > 4 * 60 * 1000) {
        clearInterval(id);
        setInstalling(null);
        toast.error("The update did not finish", {
          description: "The previous version keeps running. Details are on this page.",
        });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [installing]);

  async function install() {
    setConfirmOpen(false);
    try {
      const { version } = await exeUpdateApi.apply();
      setInstalling(version);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the update");
    }
  }

  if (!info) return null;
  const pct = info.total ? Math.floor((info.bytes / info.total) * 100) : 0;
  const failed = info.lastResult && !info.lastResult.ok ? info.lastResult : null;
  return (
    <SectionCard title="Server software" bodyClassName="p-3 sm:p-4">
      <div data-exe-update className="space-y-3 text-sm">
        <p>
          Running version <span className="num font-semibold">{info.current}</span>
          {info.available ? null : <span className="text-muted-foreground"> · up to date</span>}
        </p>
        {installing ? (
          <p className="font-medium text-primary">
            Installing {installing} - BillerPe restarts and this page reloads by itself…
          </p>
        ) : info.status === "downloading" ? (
          <div>
            <p>
              Downloading version <span className="num">{info.version}</span> in the background -{" "}
              <span className="num">{pct}%</span>
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : info.ready ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p>
              Version <span className="num font-semibold">{info.version}</span> is ready.{" "}
              {info.autoInstall !== false
                ? `It installs by itself tonight (${info.night}) when nobody is billing - or now, in about 20 seconds.`
                : "It did not install on this PC last time, so it will not try again by itself - press Restart & update to retry."}
            </p>
            {store.can("system", "edit") && info.packaged ? (
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                <Download className="size-4" /> Restart & update now
              </Button>
            ) : null}
          </div>
        ) : info.status === "error" ? (
          <p className="text-warning">
            Downloading {info.version} failed ({info.error}). It retries by itself.
          </p>
        ) : null}
        {failed ? (
          <Notice tone="warning" title={`Installing ${failed.version} did not work`}>
            {failed.reason}. Version {info.current} keeps running.
          </Notice>
        ) : null}
        {!info.packaged ? (
          <p className="text-xs text-muted-foreground">
            This is a development copy of the server - updates are never installed on it.
          </p>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart & update now?</DialogTitle>
            <DialogDescription>
              BillerPe stops for about 20 seconds while version {info.version} is installed. Open
              tables and bills are kept; every counter, kitchen screen and captain phone reconnects
              by itself. If the new version does not start, the current one is put back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Not now
            </Button>
            <Button onClick={() => void install()}>Restart & update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function SystemPage() {
  const store = useStore();
  const status = store.localServerStatus;
  const [syncing, setSyncing] = useState(false);
  const [syncRuns, setSyncRuns] = useState(0);

  useEffect(() => {
    store.loadServerStatusFromServer();
    const id = setInterval(() => store.loadServerStatusFromServer(), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sequenceOpen, setSequenceOpen] = useState(false);

  // Recovery path for the one sync failure a human has to resolve: this
  // PC's registration as the outlet's local server is gone, because a
  // SuperAdmin released it or another PC was registered in its place. The
  // exe reports that state outright (status.sync.registrationRequired) -
  // it is no longer inferred from an error message.
  //
  // This used to be a far more common problem for a much worse reason: the
  // exe authenticated its background sync as the OWNER, and the cloud keeps
  // only the newest login per account, so the owner opening the cloud
  // dashboard on their phone silently ended this machine's sync until
  // someone came here and re-entered the password. The exe now holds its own
  // device token instead (uat-backend-v2 middleware/deviceAuth.js), so an
  // owner logging in elsewhere has no effect at all.
  //
  // Registering again is safe to repeat: the bootstrap upserts and is
  // resumable, and it never wipes local data.
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthMobile, setReauthMobile] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);
  const reForm = useFormCheck();
  const reFormOpen = reauthOpen;
  const reFormReset = reForm.reset;
  useEffect(() => {
    if (!reFormOpen) reFormReset();
  }, [reFormOpen, reFormReset]);
  const orderNos = store.orders.map((o) => o.orderNo);
  const lowestOrderNo = orderNos.length ? Math.min(...orderNos) : 1;
  const highestOrderNo = orderNos.length ? Math.max(...orderNos) : 1;

  const maxOfflineDays =
    status?.registered && status.sync ? status.sync.maxOfflineDays : store.maxOfflineDays;

  // hasCloudSession (dashboard.js) only checks that a session cookie STRING
  // is stored - it says nothing about whether the cloud still honors it.
  // lastError.phase === "session-refresh" is the real signal that it's
  // actually dead, not merely due for its next scheduled refresh.
  // The exe now says so outright rather than leaving this to be inferred
  // from an error phase: its sync credential is a device token tied to this
  // PC's registration, so the only unrecoverable state is that registration
  // being released centrally or claimed by another PC.
  const cloudSessionBroken = Boolean(status?.registered && status.sync?.registrationRequired);

  async function handleReauth() {
    const valid = reForm.check([
      {
        key: "reauthMobile",
        label: "Mobile number",
        value: reauthMobile,
        valid: isMobile10,
        message: "Enter the owner's 10-digit mobile number",
      },
      { key: "reauthPassword", label: "Password", value: reauthPassword },
    ]);
    if (!valid) return;
    setReauthLoading(true);
    try {
      await registerThisPc(reauthMobile, reauthPassword);
      toast.success("This PC is registered again", {
        description: "This restaurant's data was downloaded fresh from the server.",
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
      setSyncRuns((n) => n + 1);
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
                isServerOnline(status.sync.lastSuccessfulSyncAt, status.sync.heartbeatSeconds) ? (
                  <StatusBadge status="Online" />
                ) : (
                  <StatusBadge status="Offline" />
                )
              }
              tone={
                isServerOnline(status.sync.lastSuccessfulSyncAt, status.sync.heartbeatSeconds)
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
              value={Math.max(0, status.sync.maxOfflineDays - status.sync.daysSinceSync).toFixed(2)}
              tone={status.sync.transactionsBlocked ? "primary" : "default"}
              hint={status.sync.transactionsBlocked ? "Billing is currently blocked" : undefined}
            />
          </div>

          {status.sync.lastError ? (
            <Notice
              tone="warning"
              title={
                cloudSessionBroken
                  ? "This PC is no longer registered as the outlet's local server"
                  : `Last sync error - ${status.sync.lastError.phase}`
              }
              action={
                cloudSessionBroken ? (
                  <Button size="sm" onClick={() => setReauthOpen(true)}>
                    <KeyRound className="size-4" /> Register this PC again
                  </Button>
                ) : undefined
              }
            >
              {cloudSessionBroken
                ? "Its registration was released centrally, or another PC was registered as this outlet's server. Billing here keeps working, but nothing reaches the cloud - and no central menu or config change reaches this PC - until it is registered again."
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
                <dd className="text-sm font-medium num">{status.orders.today} today</dd>
              </div>
            </dl>
          </SectionCard>

          <ServerUpdateCard />

          <SyncProblemsCard reloadKey={syncRuns} />
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
            <Button
              hidden={
                !store.can("system", "edit") || !store.canSpecial("system.remakeOrderSequence")
              }
              variant="outline"
              onClick={() => setSequenceOpen(true)}
            >
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
            <DialogTitle>Register this PC as the outlet's server</DialogTitle>
            <DialogDescription>
              Enter the outlet owner/admin's BillerPe cloud login. This re-establishes background
              sync for this PC only. Staff logins on this terminal are unaffected, and no local data
              is removed. If another PC is currently registered for this outlet, you will be asked
              to confirm replacing it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reauthMobile" required>
                Owner/admin mobile number
              </Label>
              <Input
                {...reForm.fieldProps("reauthMobile")}
                id="reauthMobile"
                inputMode="numeric"
                className="mt-1.5"
                value={reauthMobile}
                maxLength={10}
                onChange={(e) => setReauthMobile(e.target.value.replace(/\D/g, ""))}
                placeholder="10-digit mobile number"
              />
              <FieldError message={reForm.error("reauthMobile")} />
            </div>
            <div>
              <Label htmlFor="reauthPassword" required>
                Owner/admin password
              </Label>
              <PasswordInput
                {...reForm.fieldProps("reauthPassword")}
                id="reauthPassword"
                className="mt-1.5"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
              />
              <FieldError message={reForm.error("reauthPassword")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReauthOpen(false)}>
              Cancel
            </Button>
            <Button disabled={reauthLoading} onClick={handleReauth}>
              {reauthLoading ? "Re-authenticating…" : "Re-authenticate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
