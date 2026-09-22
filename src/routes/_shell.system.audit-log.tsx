import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { DataTable, EmptyState, Page, PageHeader, SectionCard, TablePager } from "@/components/kit";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditLogApi, type RawAuditLogEntry } from "@/lib/api";
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

function formatWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-IN");
}

function AuditLogPage() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [user, setUser] = useState("all");
  const [action, setAction] = useState("all");
  const [orderNo, setOrderNo] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  // What the list is actually fetched with - the typed text is debounced
  // into this, so a search does not fire on every keystroke.
  const [filters, setFilters] = useState({ q: "", orderNo: "" });
  const [rows, setRows] = useState<RawAuditLogEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void auditLogApi
      .getActions()
      .then((r) => setActions(r.actions))
      .catch(() => setActions([]));
  }, []);

  // Real, persisted (billerpe-local-exe's GET /auditLog), paginated
  // (10/page) and server-searched/filtered. Any filter change goes back to
  // page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters({ q, orderNo });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q, orderNo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const res = await auditLogApi.getAll(page, 10, {
          q: filters.q,
          userId: user,
          action,
          orderNo: filters.orderNo,
        });
        if (cancelled) return;
        setRows(res.entries);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotalPages(1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Every filter is a dependency. This used to depend on `page` alone and
    // reset page to 1 on a filter change - which, when the list was already
    // on page 1, changed nothing, so the search box and the user filter
    // never refetched at all.
  }, [page, filters, user, action]);

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
              placeholder="Search action, order, item, user or reason"
              className="pl-9"
            />
          </div>
          <Input
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value.replace(/[^0-9a-zA-Z]/g, ""))}
            placeholder="Order / bill no."
            inputMode="numeric"
            className="sm:w-40"
          />
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={user}
            onValueChange={(v) => {
              setUser(v);
              setPage(1);
            }}
          >
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
            rows={rows}
            loading={loading}
            keyFn={(a) => String(a.id)}
            empty={<EmptyState icon={ScrollText} title="No matching entries" compact />}
            columns={[
              {
                key: "at",
                header: "When",
                cell: (a) => <span className="num">{formatWhen(a.createdAt)}</span>,
              },
              {
                key: "user",
                header: "User",
                cell: (a) => <span className="font-medium">{a.user_name}</span>,
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
                  <span
                    className="max-w-[16rem] truncate text-xs num text-muted-foreground"
                    title={a.device ?? ""}
                  >
                    {a.device ?? "—"} · {a.ip ?? "—"}
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
                  {a.user_name} · {formatWhen(a.createdAt)}
                </p>
                <p className="text-xs">
                  <span className="text-muted-foreground line-through">{a.before}</span> →{" "}
                  <span className="font-medium">{a.after}</span>
                </p>
                {a.reason ? <p className="text-xs text-muted-foreground">{a.reason}</p> : null}
              </div>
            )}
          />
          <TablePager
            page={page}
            pageCount={totalPages}
            total={total}
            start={(page - 1) * 10}
            end={Math.min(page * 10, total)}
            onPageChange={setPage}
          />
        </div>
      </SectionCard>
    </Page>
  );
}
