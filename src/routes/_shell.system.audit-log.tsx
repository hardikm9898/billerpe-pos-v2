import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  SectionCard,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/system/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log · BillerPe" },
      {
        name: "description",
        content: "Who changed what, when, from which device and with what reason.",
      },
      { property: "og:title", content: "Audit Log · BillerPe" },
      { property: "og:description", content: "Full change trail across the BillerPe outlet." },
    ],
  }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [user, setUser] = useState("all");

  const rows = useMemo(
    () =>
      store.auditLogs
        .filter((a) => user === "all" || a.userId === user)
        .filter(
          (a) =>
            !q ||
            `${a.action} ${a.entity} ${a.userName} ${a.reason ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        ),
    [store.auditLogs, q, user],
  );
  const paged = usePagedRows(rows, 10);

  return (
    <Page>
      <PageHeader
        icon={ScrollText}
        title="Audit Log"
        description="Every sensitive action records the before value, after value, device and IP."
      />

      <SectionCard bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action, entity or reason"
              className="pl-9"
            />
          </div>
          <Select value={user} onValueChange={setUser}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {store.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3">
          <DataTable
            rows={paged.pageRows}
            keyFn={(a) => a.id}
            empty={<EmptyState icon={ScrollText} title="No matching entries" compact />}
            columns={[
              { key: "at", header: "When", cell: (a) => <span className="num">{a.at}</span> },
              {
                key: "user",
                header: "User",
                cell: (a) => <span className="font-medium">{a.userName}</span>,
              },
              { key: "action", header: "Action", cell: (a) => a.action },
              { key: "entity", header: "Entity", cell: (a) => a.entity },
              {
                key: "change",
                header: "Change",
                cell: (a) => (
                  <span className="text-xs">
                    <span className="text-muted-foreground line-through">{a.before}</span>
                    {" → "}
                    <span className="font-medium">{a.after}</span>
                  </span>
                ),
              },
              { key: "reason", header: "Reason", cell: (a) => a.reason ?? "—" },
              {
                key: "device",
                header: "Device",
                cell: (a) => (
                  <span className="text-xs num text-muted-foreground">
                    {a.device} · {a.ip}
                  </span>
                ),
              },
            ]}
            mobileCard={(a) => (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {a.action} · {a.entity}
                </p>
                <p className="text-xs text-muted-foreground num">
                  {a.userName} · {a.at}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground line-through">{a.before}</span> →{" "}
                  <span className="font-medium">{a.after}</span>
                </p>
                {a.reason ? <p className="text-xs text-muted-foreground">{a.reason}</p> : null}
              </div>
            )}
          />
          <TablePager {...paged} onPageChange={paged.setPage} />
        </div>
      </SectionCard>
    </Page>
  );
}
