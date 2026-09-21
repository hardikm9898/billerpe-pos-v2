import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, UserCog } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectionStateLabels } from "@/mock/data";
import { useStore } from "@/mock/store";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { FieldError, isEmailOrEmpty, isMobile10, useFormCheck } from "@/lib/formCheck";

export const Route = createFileRoute("/_shell/profile")({
  head: () => ({
    meta: [
      { title: "Profile · BillerPe" },
      {
        name: "description",
        content: "Your account, role, login PIN and current terminal session.",
      },
      { property: "og:title", content: "Profile · BillerPe" },
      { property: "og:description", content: "Your BillerPe account and terminal session." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const store = useStore();
  const navigate = useNavigate();
  const u = store.currentUser;
  // Saving your own details goes through the same user-update endpoint as
  // the Users screen, so it needs the same permission.
  const canEdit = useAccess("users").edit;
  const form = useFormCheck();
  const [draft, setDraft] = useState({
    name: u.name,
    mobile: u.mobile,
    email: u.email,
    pin: u.pin,
  });
  const [saving, setSaving] = useState(false);
  const changed =
    draft.name !== u.name ||
    draft.mobile !== u.mobile ||
    draft.email !== u.email ||
    draft.pin !== u.pin;

  const save = async () => {
    const valid = form.check([
      { key: "name", label: "Name", value: draft.name },
      {
        key: "mobile",
        label: "Mobile",
        value: draft.mobile,
        valid: isMobile10,
        message: "Enter a 10-digit mobile number",
      },
      {
        key: "email",
        label: "Email",
        value: draft.email,
        valid: isEmailOrEmpty,
        message: "Enter a valid email or leave it blank",
      },
      {
        key: "pin",
        label: "Login PIN",
        value: draft.pin,
        valid: (v) => !v || /^\d{4,6}$/.test(String(v)),
        message: "PIN must be 4 to 6 digits",
      },
    ]);
    if (!valid) return;
    setSaving(true);
    try {
      await store.upsertUser({
        ...u,
        ...draft,
        name: draft.name.trim(),
        email: draft.email.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        icon={UserCog}
        title="Profile"
        description={`${u.role} at ${store.restaurant?.name ?? store.serverHotelName ?? ""}`}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              store.logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-4" /> Log out
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Role" value={u.role} tone="primary" />
        <StatCard label="Account status" value={<StatusBadge status={u.status} />} />
        <StatCard
          label="Connection"
          value={String(connectionStateLabels[store.connection])}
          tone="info"
        />
      </div>

      <SectionCard title="Account details" bodyClassName="p-3 sm:p-4">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>Name</Label>
            <Input
              {...form.fieldProps("name")}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <FieldError message={form.error("name")} />
          </div>
          <div className="space-y-1.5">
            <Label required>Mobile</Label>
            <Input
              {...form.fieldProps("mobile")}
              inputMode="numeric"
              value={draft.mobile}
              onChange={(e) =>
                setDraft({ ...draft, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
              }
            />
            <FieldError message={form.error("mobile")} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              {...form.fieldProps("email")}
              type="email"
              placeholder="Optional"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <FieldError message={form.error("email")} />
          </div>
          <div className="space-y-1.5">
            <Label>Login PIN</Label>
            <Input
              {...form.fieldProps("pin")}
              inputMode="numeric"
              maxLength={6}
              placeholder="4-6 digits"
              value={draft.pin}
              onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "") })}
            />
            <FieldError message={form.error("pin")} />
          </div>
        </fieldset>
        {!canEdit ? <p className="mt-3 text-xs text-muted-foreground">{READ_ONLY_NOTE}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button hidden={!canEdit} disabled={!changed || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Outlet" bodyClassName="p-3 sm:p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">Outlet</dt>
            <dd className="font-medium">{store.restaurant?.name ?? store.serverHotelName ?? ""}</dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">GSTIN</dt>
            <dd className="num font-medium">{store.restaurant?.gstin || "Not set"}</dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="num font-medium">
              {store.taxRules
                .filter((t) => t.active)
                .map((t) => `${t.name} ${t.value}${t.type === "percent" ? "%" : ""}`)
                .join(" + ") || "None"}
            </dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">Device registered</dt>
            <dd className="font-medium">{store.deviceRegistered ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </SectionCard>
    </Page>
  );
}
