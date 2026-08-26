import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader, SectionCard, StatCard } from "@/components/kit";
import { ChipSelect, OpsNav } from "@/components/operations/shared";
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
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/mock/store";
import type { BillChargeRule, OpsOrderType } from "@/mock/types";

export const Route = createFileRoute("/_shell/operations/delivery-charge")({
  head: () => ({
    meta: [
      { title: "Delivery & Packaging · BillerPe" },
      {
        name: "description",
        content:
          "Dynamic delivery and packaging charge rules — type, auto-apply and tax treatment.",
      },
      { property: "og:title", content: "Delivery & Packaging · BillerPe" },
      { property: "og:description", content: "Delivery and packaging charge rule configuration." },
    ],
  }),
  component: DeliveryChargePage,
});

const ORDER_TYPES: OpsOrderType[] = ["Dine-in", "Pickup"];

function summarize(rule: BillChargeRule) {
  if (!rule.active) return "Off";
  return rule.type === "percent" ? `${rule.value}%` : `₹${rule.value}`;
}

function DeliveryChargePage() {
  const store = useStore();

  return (
    <Page>
      <PageHeader
        icon={Truck}
        title="Delivery & Packaging Charge"
        description="Same rule engine as Service Charge — active toggle, type, auto-apply order types and tax treatment. Billers can still override the computed amount per order."
      />
      <OpsNav active="delivery-charge" />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Delivery charge"
          value={summarize(store.deliveryChargeRule)}
          tone={store.deliveryChargeRule.active ? "primary" : "default"}
          hint={store.deliveryChargeRule.autoApply.join(", ") || "Manual only"}
        />
        <StatCard
          label="Packaging charge"
          value={summarize(store.packagingChargeRule)}
          tone={store.packagingChargeRule.active ? "primary" : "default"}
          hint={store.packagingChargeRule.autoApply.join(", ") || "Manual only"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RuleEditor
          title="Delivery charge rule"
          rule={store.deliveryChargeRule}
          onSave={store.setDeliveryChargeRule}
        />
        <RuleEditor
          title="Packaging charge rule"
          rule={store.packagingChargeRule}
          onSave={store.setPackagingChargeRule}
        />
      </div>
    </Page>
  );
}

function RuleEditor({
  title,
  rule: initial,
  onSave,
}: {
  title: string;
  rule: BillChargeRule;
  onSave: (rule: BillChargeRule) => void;
}) {
  const [rule, setRule] = useState(initial);

  return (
    <SectionCard title={title} bodyClassName="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted p-3">
        <div>
          <p className="text-sm font-medium">Apply this charge</p>
          <p className="text-xs text-muted-foreground">Turn off to remove it from every bill.</p>
        </div>
        <Switch
          checked={rule.active}
          onCheckedChange={(v) => setRule((r) => ({ ...r, active: v }))}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Charge type</Label>
          <Select
            value={rule.type}
            onValueChange={(v) => setRule((r) => ({ ...r, type: v as "percent" | "fixed" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percentage of the bill</SelectItem>
              <SelectItem value="fixed">Flat amount per bill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{rule.type === "percent" ? "Percentage (%)" : "Amount (₹)"}</Label>
          <Input
            type="number"
            value={rule.value}
            onChange={(e) => setRule((r) => ({ ...r, value: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Calculate on</Label>
          <Select
            value={rule.calculationOn}
            onValueChange={(v) => setRule((r) => ({ ...r, calculationOn: v as "core" | "total" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="core">Item subtotal (before discount)</SelectItem>
              <SelectItem value="total">Bill total (after discount)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Apply when</Label>
          <Select
            value={rule.condition}
            onValueChange={(v) => setRule((r) => ({ ...r, condition: v as typeof r.condition }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always</SelectItem>
              <SelectItem value="greater">Bill is above a threshold</SelectItem>
              <SelectItem value="less">Bill is below a threshold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rule.condition !== "always" ? (
          <div className="space-y-1.5">
            <Label>Threshold (₹)</Label>
            <Input
              type="number"
              value={rule.threshold}
              onChange={(e) => setRule((r) => ({ ...r, threshold: Number(e.target.value) }))}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <ChipSelect
          label="Auto-apply to order types"
          options={ORDER_TYPES.map((o) => ({ id: o, name: o }))}
          selected={rule.autoApply}
          onToggle={(id) =>
            setRule((r) => ({
              ...r,
              autoApply: r.autoApply.includes(id as OpsOrderType)
                ? r.autoApply.filter((x) => x !== id)
                : [...r.autoApply, id as OpsOrderType],
            }))
          }
          allLabel="None — biller adds it manually"
        />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Charge GST on this charge</p>
            <p className="text-xs text-muted-foreground">
              Adds the charge into the taxable value instead of after tax.
            </p>
          </div>
          <Switch
            checked={rule.taxOnCharge}
            onCheckedChange={(v) => setRule((r) => ({ ...r, taxOnCharge: v }))}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={() => onSave(rule)}>
          Save rule
        </Button>
      </div>
    </SectionCard>
  );
}
