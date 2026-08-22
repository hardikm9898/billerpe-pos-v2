import { createFileRoute } from "@tanstack/react-router";
import { BadgePercent } from "lucide-react";

import { Page, PageHeader, PendingDecision, SectionCard } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useStore } from "@/mock/store";
import type { Role } from "@/mock/types";

export const Route = createFileRoute("/_shell/operations/approval-matrix")({
  head: () => ({
    meta: [
      { title: "Approval Matrix · BillerPe" },
      { name: "description", content: "Discount approval thresholds and the role authorised to approve them." },
      { property: "og:title", content: "Approval Matrix · BillerPe" },
      { property: "og:description", content: "Discount approval thresholds and approvers." },
    ],
  }),
  component: ApprovalMatrixPage,
});

const approvers: Role[] = ["Owner", "Manager", "Cashier"];

function ApprovalMatrixPage() {
  const store = useStore();

  return (
    <Page>
      <PageHeader
        icon={BadgePercent}
        title="Approval Matrix"
        description="In the MVP, approvals cover the discount domain only. Other domains are locked."
      />

      <SectionCard title="Rules" bodyClassName="p-3 sm:p-4">
        <div className="space-y-3">
          {store.approvalRules.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border border-border bg-surface p-4",
                r.locked && "border-dashed opacity-80",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{r.domain}</p>
                  {r.note ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
                </div>
                <Switch
                  checked={r.enabled}
                  disabled={r.locked}
                  onCheckedChange={() => store.toggleApprovalRule(r.id)}
                />
              </div>

              {!r.locked ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Threshold</Label>
                    <Input
                      value={r.threshold}
                      onChange={(e) => store.updateApprovalThreshold(r.id, e.target.value, r.approver)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Approver</Label>
                    <Select
                      value={r.approver}
                      onValueChange={(v) =>
                        store.updateApprovalThreshold(r.id, r.threshold, v as Role)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {approvers.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <PendingDecision
        title="Editing a settled bill"
        note="Whether re-opening a settled bill requires an approval step — and from which role — has not been confirmed for the MVP, so no workflow is implemented here."
      />
    </Page>
  );
}
