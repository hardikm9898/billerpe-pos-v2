import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Send } from "lucide-react";
import { useState } from "react";
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
import { nowStamp } from "@/mock/format";
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

function RaiseTicketPage() {
  const store = useStore();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Billing");
  const [priority, setPriority] = useState("Normal");
  const [details, setDetails] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([
    {
      id: "TKT-2041",
      subject: "Beverage counter printer keeps showing paper out",
      category: "Printer",
      priority: "High",
      raisedAt: "17/08/2026 06:40 pm",
      status: "Accepted",
    },
    {
      id: "TKT-2038",
      subject: "Two settlements stuck in the sync queue",
      category: "Sync / Offline",
      priority: "Normal",
      raisedAt: "16/08/2026 11:12 am",
      status: "Completed",
    },
  ]);

  const paged = usePagedRows(tickets, 10);

  const submit = () => {
    const ticket: Ticket = {
      id: `TKT-${2042 + tickets.length}`,
      subject: subject.trim(),
      category,
      priority,
      raisedAt: nowStamp(),
      status: "Pending",
    };
    setTickets([ticket, ...tickets]);
    setSubject("");
    setDetails("");
    toast.success("Ticket raised", { description: `${ticket.id} · our team will call you back.` });
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
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
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
              <Label>Priority</Label>
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
            <Label>What happened?</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Steps you took, what you expected and what happened instead"
            />
          </div>
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            Attached automatically: {store.currentUser.name} · {store.currentUser.role} · Counter
            POS · connection {store.connection}
          </p>
          <div className="flex justify-end">
            <Button disabled={!subject.trim()} onClick={submit}>
              <Send className="size-4" /> Submit ticket
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Your tickets" bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={paged.pageRows}
          keyFn={(t) => t.id}
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
