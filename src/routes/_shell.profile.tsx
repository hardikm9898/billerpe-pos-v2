import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, UserCog } from "lucide-react";

import { Page, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { connectionStateLabels } from "@/mock/data";
import { useStore } from "@/mock/store";
import { useAccess } from "@/lib/access";

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
  // Read-only for everyone, the owner too (owner decision, 2026-09-28): a
  // person's details, PIN and password are changed in Manage Users - by the
  // owner, or by staff allowed to manage users. PINs and passwords are
  // stored hashed, so only whether one is set can be shown.
  const canManageUsers = useAccess("users").edit;
  const details: [string, string][] = [
    ["Name", u.name || "—"],
    ["Mobile", u.mobile || "—"],
    ["Email", u.email || "—"],
    ["Login PIN", u.hasPin ? "Set" : "Not set"],
    ["Password", u.hasPassword ? "Set" : "Not set"],
  ];

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
        <dl data-profile-details className="grid gap-3 text-sm sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="num font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {canManageUsers
              ? "To change these details, your PIN or your password, open Manage Users."
              : "To change these details, your PIN or your password, ask the owner."}
          </p>
          {canManageUsers ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/users">Manage Users</Link>
            </Button>
          ) : null}
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
