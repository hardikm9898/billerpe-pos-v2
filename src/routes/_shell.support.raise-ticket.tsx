import { FieldError, useFormCheck } from "@/lib/formCheck";
import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  Page,
  PageHeader,
  SectionCard,
  StatusBadge,
  TablePager,
  usePagedRows,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, supportApi, type RawSupportTicket } from "@/lib/api";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/support/raise-ticket")({
  head: () => ({
    meta: [
      { title: "Raise a Ticket · BillerPe" },
      {
        name: "description",
        content: "Report a POS issue with priority, category and device context attached.",
      },
      { property: "og:title", content: "Raise a Ticket · BillerPe" },
      { property: "og:description", content: "Report a POS issue to BillerPe support." },
    ],
  }),
  component: RaiseTicketPage,
});

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  raisedAt: string;
  status: "Pending" | "Accepted" | "Completed";
}

const categories = ["Billing", "Printer", "Sync / Offline", "Stock", "Reports", "Other"];
const priorities = ["Low", "Normal", "High", "Service blocking"];

const STATUS: Record<RawSupportTicket["status"], Ticket["status"]> = {
  new: "Pending",
  open: "Accepted",
  close: "Completed",
};
const PRIORITY: Record<RawSupportTicket["priority"], string> = {
  low: "Low",
  medium: "Normal",
  high: "High",
};

function toTicket(t: RawSupportTicket): Ticket {
  const d = new Date(t.createdAt);
  return {
    id: `TKT-${t.id}`,
    subject: (t.issue ?? "").split("\n")[0] || "—",
    category: t.ticket_type || "Other",
    priority: PRIORITY[t.priority] ?? "Low",
    raisedAt: Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    status: STATUS[t.status] ?? "Pending",
  };
}

function RaiseTicketPage() {
  const store = useStore();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Billing");
  const [priority, setPriority] = useState("Normal");
  const [details, setDetails] = useState("");
  const form = useFormCheck();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tickets: rows } = await supportApi.list();
      setTickets(rows.map(toTicket));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load your tickets");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const paged = usePagedRows(tickets, 10);

  const submit = async () => {
    const valid = form.check([
      { key: "subject", label: "Subject", value: subject },
      {
        key: "details",
        label: "What happened?",
        value: details,
        message: "Describe what happened so support can help",
      },
    ]);
    if (!valid) return;
    setSending(true);
    try {
      const res = await supportApi.raise({
        subject: subject.trim(),
        details: details.trim(),
        category,
        priority,
      });
      setSubject("");
      setDetails("");
      toast.success("Ticket raised", {
        description: `${res.ticket ? `TKT-${res.ticket.id}` : "Your ticket"} · the BillerPe team will call you back.`,
      });
      void load();
    } catch (err) {
      // The form keeps what was typed so it can be sent again.
      toast.error("Ticket not sent", {
        description:
          err instanceof ApiError ? err.message : "Check the internet connection and try again.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Page>
      <PageHeader
        icon={LifeBuoy}
        title="Raise a Ticket"
        description="Device, outlet and user details are attached automatically to every ticket."
      />

      <SectionCard title="New ticket" bodyClassName="p-3 sm:p-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Subject</Label>
            <Input
              {...form.fieldProps("subject")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
            />
            <FieldError message={form.error("subject")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>What happened?</Label>
            <Textarea
              {...form.fieldProps("details")}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Steps you took, what you expected and what happened instead"
            />
            <FieldError message={form.error("details")} />
          </div>
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            Sent to the BillerPe support team with your outlet, your name ({store.currentUser.name}
            ), mobile and role attached. Needs an internet connection.
          </p>
          <div className="flex justify-end">
            <Button disabled={sending} onClick={() => void submit()}>
              <Send className="size-4" /> {sending ? "Sending…" : "Submit ticket"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Your tickets" bodyClassName="p-3 sm:p-4">
        {loadError ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : null}
        <DataTable
          rows={paged.pageRows}
          keyFn={(t) => t.id}
          empty={
            <p className="py-6 text-center text-sm text-muted-foreground">
              {loading
                ? "Loading your tickets…"
                : loadError
                  ? "Tickets can't be shown right now."
                  : "No tickets raised yet."}
            </p>
          }
          columns={[
            {
              key: "id",
              header: "Ticket",
              cell: (t) => <span className="num font-medium">{t.id}</span>,
            },
            { key: "subject", header: "Subject", cell: (t) => t.subject },
            { key: "cat", header: "Category", cell: (t) => t.category },
            { key: "pri", header: "Priority", cell: (t) => t.priority },
            { key: "at", header: "Raised", cell: (t) => <span className="num">{t.raisedAt}</span> },
            { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
          ]}
          mobileCard={(t) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{t.subject}</p>
                <p className="text-xs text-muted-foreground num">
                  {t.id} · {t.raisedAt}
                </p>
              </div>
              <StatusBadge status={t.status} />
            </div>
          )}
        />
        <TablePager {...paged} onPageChange={paged.setPage} />
      </SectionCard>
    </Page>
  );
}
