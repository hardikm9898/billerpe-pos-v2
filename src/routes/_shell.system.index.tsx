import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered, RefreshCw, ServerCog } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  Page,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { connectionStateLabels } from "@/mock/data";
import { useStore } from "@/mock/store";
import type { ConnectionState } from "@/mock/types";

export const Route = createFileRoute("/_shell/system/")({
  head: () => ({
    meta: [
      { title: "Local Server & Sync · BillerPe" },
      {
        name: "description",
        content: "Registered devices, connection state and the offline sync queue.",
      },
      { property: "og:title", content: "Local Server & Sync · BillerPe" },
      { property: "og:description", content: "Devices, connection state and offline sync queue." },
    ],
  }),
  component: SystemPage,
});

function SystemPage() {
  const store = useStore();
  const pending = store.syncItems.filter((s) => s.status === "Pending").length;
  const failed = store.syncItems.filter((s) => s.status === "Failed").length;
  const conflicts = store.syncItems.filter((s) => s.status === "Conflict").length;
  const syncPaged = usePagedRows(store.syncItems, 10);

  const [sequenceOpen, setSequenceOpen] = useState(false);
  const orderNos = store.orders.map((o) => o.orderNo);
  const lowestOrderNo = orderNos.length ? Math.min(...orderNos) : 1;
  const highestOrderNo = orderNos.length ? Math.max(...orderNos) : 1;

  return (
    <Page>
      <PageHeader
        icon={ServerCog}
        title="Local Server, Devices & Sync"
        description={`Billing continues against the local server while offline. New transactions block after ${store.maxOfflineDays} days.`}
        actions={
          <div className="flex gap-2">
            <Select
              value={store.connection}
              onValueChange={(v) => store.setConnection(v as ConnectionState)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(connectionStateLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {String(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={store.syncNow}>
              <RefreshCw className="size-4" /> Sync now
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Devices online"
          value={store.devices.filter((d) => d.status === "Online").length}
          tone="success"
        />
        <StatCard label="Queued" value={pending} tone="warning" />
        <StatCard label="Failed" value={failed} tone="primary" />
        <StatCard label="Conflicts" value={conflicts} tone="info" />
      </div>

      <SectionCard title="Registered devices" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={store.devices}
          keyFn={(d) => d.id}
          columns={[
            {
              key: "name",
              header: "Device",
              cell: (d) => <span className="font-medium">{d.name}</span>,
            },
            { key: "type", header: "Type", cell: (d) => d.type },
            { key: "ip", header: "IP", cell: (d) => <span className="num">{d.ip}</span> },
            {
              key: "seen",
              header: "Last seen",
              cell: (d) => <span className="num">{d.lastSeen}</span>,
            },
            { key: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
            {
              key: "actions",
              header: "",
              cell: (d) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      store.setDeviceStatus(d.id, d.status === "Blocked" ? "Online" : "Blocked")
                    }
                  >
                    {d.status === "Blocked" ? "Unblock" : "Block"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => store.deregisterDevice(d.id)}>
                    Deregister
                  </Button>
                </div>
              ),
            },
          ]}
          mobileCard={(d) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground num">
                  {d.type} · {d.ip}
                </p>
              </div>
              <StatusBadge status={d.status} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Sync center" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={syncPaged.pageRows}
          keyFn={(s) => s.id}
          columns={[
            {
              key: "entity",
              header: "Entity",
              cell: (s) => <span className="font-medium">{s.entity}</span>,
            },
            {
              key: "ref",
              header: "Reference",
              cell: (s) => <span className="num">{s.reference}</span>,
            },
            { key: "action", header: "Action", cell: (s) => s.action },
            {
              key: "queued",
              header: "Queued",
              cell: (s) => <span className="num">{s.queuedAt}</span>,
            },
            { key: "device", header: "Device", cell: (s) => s.device },
            {
              key: "status",
              header: "Status",
              cell: (s) => (
                <div className="space-y-1">
                  <StatusBadge status={s.status} />
                  {s.conflictTier ? (
                    <p className="text-xs text-muted-foreground">{s.conflictTier}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "actions",
              header: "",
              cell: (s) =>
                s.status === "Failed" ? (
                  <Button size="sm" variant="outline" onClick={() => store.retrySync(s.id)}>
                    Retry
                  </Button>
                ) : s.status === "Conflict" && s.conflictTier === "Needs Review" ? (
                  <Button size="sm" variant="outline" onClick={() => store.resolveConflict(s.id)}>
                    Resolve
                  </Button>
                ) : null,
            },
          ]}
          mobileCard={(s) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {s.entity} · <span className="num">{s.reference}</span>
                </p>
                <p className="text-xs text-muted-foreground num">
                  {s.action} · {s.queuedAt}
                </p>
              </div>
              <StatusBadge status={s.status} />
            </div>
          )}
        />
        <TablePager {...syncPaged} onPageChange={syncPaged.setPage} />
      </SectionCard>

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
    </Page>
  );
}
