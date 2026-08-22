import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Page, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESTAURANT, connectionStateLabels } from "@/mock/data";
import { useStore } from "@/mock/store";

export const Route = createFileRoute("/_shell/profile")({
  head: () => ({
    meta: [
      { title: "Profile · BillerPe" },
      { name: "description", content: "Your account, role, login PIN and current terminal session." },
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

  return (
    <Page>
      <PageHeader
        icon={UserCog}
        title="Profile"
        description={`${u.role} at ${RESTAURANT.name}`}
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
        <StatCard label="Connection" value={String(connectionStateLabels[store.connection])} tone="info" />
      </div>

      <SectionCard title="Account details" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input defaultValue={u.name} onBlur={(e) => store.upsertUser({ ...u, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Mobile</Label>
            <Input defaultValue={u.mobile} onBlur={(e) => store.upsertUser({ ...u, mobile: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input defaultValue={u.email} onBlur={(e) => store.upsertUser({ ...u, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Login PIN</Label>
            <Input
              defaultValue={u.pin}
              maxLength={4}
              onBlur={(e) => store.upsertUser({ ...u, pin: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => toast.success("Profile saved")}>Save changes</Button>
        </div>
      </SectionCard>

      <SectionCard title="Outlet" bodyClassName="p-3 sm:p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">Outlet</dt>
            <dd className="font-medium">{RESTAURANT.name}</dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">GSTIN</dt>
            <dd className="num font-medium">{RESTAURANT.gstin}</dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-muted px-3 py-2">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="num font-medium">
              CGST {RESTAURANT.cgst}% + SGST {RESTAURANT.sgst}%
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
