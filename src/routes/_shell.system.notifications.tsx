import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { Page, PageHeader, SectionCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/system/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Settings · BillerPe" },
      { name: "description", content: "Choose which triggers notify staff over WhatsApp, SMS and in-app." },
      { property: "og:title", content: "Notification Settings · BillerPe" },
      { property: "og:description", content: "WhatsApp, SMS and in-app notification triggers." },
    ],
  }),
  component: NotificationSettingsPage,
});

const channels = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "inApp", label: "In-app" },
] as const;

function NotificationSettingsPage() {
  const store = useStore();

  return (
    <Page>
      <PageHeader
        icon={Bell}
        title="Notification Settings"
        description="Channels are per trigger. In-app notifications always appear in the header bell."
      />

      <SectionCard title="Triggers" bodyClassName="p-0 sm:p-0">
        <div className="divide-y divide-border">
          <div className="hidden grid-cols-[1fr_repeat(3,7rem)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Trigger</span>
            {channels.map((c) => (
              <span key={c.key} className="text-center">
                {c.label}
              </span>
            ))}
          </div>
          {store.notificationSettings.map((s) => (
            <div
              key={s.trigger}
              className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_repeat(3,7rem)] md:items-center"
            >
              <p className="text-sm font-medium">{s.trigger}</p>
              <div className="grid grid-cols-3 gap-3 md:contents">
                {channels.map((c) => (
                  <div key={c.key} className="flex flex-col items-center gap-1 md:block md:text-center">
                    <span className="text-[11px] text-muted-foreground md:hidden">{c.label}</span>
                    <Switch
                      checked={s[c.key]}
                      onCheckedChange={() => store.toggleNotificationSetting(s.trigger, c.key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Offline behaviour"
        description="How long the outlet can keep billing without reaching the cloud."
        bodyClassName="p-3 sm:p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Maximum offline duration (days)</Label>
            <Input
              type="number"
              defaultValue={store.maxOfflineDays}
              onBlur={(e) => store.setMaxOfflineDays(Number(e.target.value))}
            />
          </div>
          <Button variant="outline" onClick={() => store.markAllNotificationsRead()}>
            Mark all notifications read
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          After this limit, new transactions are blocked while staff stay logged in and can still view
          existing data.
        </p>
      </SectionCard>
    </Page>
  );
}
