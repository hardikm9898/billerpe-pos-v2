import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, KeySquare, Plus, RotateCcw, Users } from "lucide-react";
import { useState } from "react";

import { DataTable, Page, PageHeader, SectionCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PERMISSION_MODULE_LABELS, SPECIAL_PERMISSION_LABELS } from "@/mock/data";
import { useStore } from "@/mock/store";
import type {
  ModuleGrant,
  PermissionModule,
  PermissionOverrides,
  Role,
  RolePermissions,
  SpecialPermission,
  StandardAction,
  User,
} from "@/mock/types";

export const Route = createFileRoute("/_shell/users")({
  head: () => ({
    meta: [
      { title: "Manage Users · BillerPe" },
      {
        name: "description",
        content: "Staff accounts, roles and the permissions each role carries.",
      },
      { property: "og:title", content: "Manage Users · BillerPe" },
      { property: "og:description", content: "Staff accounts and role permissions in BillerPe." },
    ],
  }),
  component: UsersPage,
});

const roles: Role[] = [
  "Owner",
  "Manager",
  "Cashier",
  "Captain",
  "Kitchen Staff",
  "Inventory Manager",
  "Accountant",
];

const ACTIONS: StandardAction[] = ["view", "create", "edit", "delete"];

const MODULE_GROUPS: { title: string; modules: PermissionModule[] }[] = [
  {
    title: "Core & Billing",
    modules: ["dashboard", "biller", "keyboard-billing", "kds", "orders"],
  },
  { title: "Menu & Tables", modules: ["menu", "tables", "reservations"] },
  {
    title: "Stock",
    modules: ["stock-masters", "stock-transactions", "stock-recipes", "stock-reports"],
  },
  {
    title: "Operations",
    modules: ["ops-billing", "ops-hardware", "ops-experience", "ops-ledger", "approval-matrix"],
  },
  { title: "Finance & Reports", modules: ["reports", "expense", "cash-session"] },
  { title: "Admin & System", modules: ["users", "permissions", "system", "audit-log"] },
];

const SPECIAL_PERMS: SpecialPermission[] = [
  "orders.editAfterKot",
  "orders.reopenSettled",
  "orders.deleteOrder",
  "orders.applyDiscountOverThreshold",
  "tables.mergeTransfer",
  "system.remakeOrderSequence",
  "users.editPermissions",
];

/** Grouped Module × Action matrix — reused for both the role-defaults editor and the per-user override editor. */
function ModuleGroupsTable({
  grants,
  overriddenModules,
  disabled,
  onToggle,
}: {
  grants: RolePermissions;
  /** When set, cells present here render with an "overridden" ring — used only in the per-user editor. */
  overriddenModules?: Partial<Record<PermissionModule, Partial<ModuleGrant>>>;
  disabled: boolean;
  onToggle: (m: PermissionModule, a: StandardAction, value: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      {MODULE_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.title}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="px-3 py-2 text-center font-semibold capitalize">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.modules.map((m) => (
                  <tr key={m}>
                    <td className="px-3 py-2 font-medium">{PERMISSION_MODULE_LABELS[m]}</td>
                    {ACTIONS.map((a) => {
                      const isOverridden = overriddenModules?.[m]?.[a] !== undefined;
                      return (
                        <td key={a} className="px-3 py-2 text-center">
                          <span
                            className={cn(
                              "inline-flex rounded-md p-0.5",
                              isOverridden && "ring-2 ring-primary/50",
                            )}
                          >
                            <Switch
                              checked={grants[m][a]}
                              disabled={disabled}
                              onCheckedChange={(v) => onToggle(m, a, v)}
                            />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SpecialPermissionsList({
  values,
  overridden,
  disabled,
  onToggle,
}: {
  values: Partial<Record<SpecialPermission, boolean>>;
  overridden?: Partial<Record<SpecialPermission, boolean>>;
  disabled: boolean;
  onToggle: (perm: SpecialPermission, value: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      {SPECIAL_PERMS.map((perm) => (
        <div
          key={perm}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2",
            overridden?.[perm] !== undefined && "ring-2 ring-primary/50",
          )}
        >
          <p className="text-sm">{SPECIAL_PERMISSION_LABELS[perm]}</p>
          <Switch
            checked={!!values[perm]}
            disabled={disabled}
            onCheckedChange={(v) => onToggle(perm, v)}
          />
        </div>
      ))}
    </div>
  );
}

function UsersPage() {
  const store = useStore();
  const [draft, setDraft] = useState<User | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const [viewRole, setViewRole] = useState<Role>("Manager");

  const canEditPermissions = store.can("permissions", "edit");
  const isOwnerRow = viewRole === "Owner";
  const roleGrants = store.rolePermissions[viewRole];
  const roleSpecial = store.roleSpecialPermissions[viewRole];

  const newUser = (): User => ({
    id: "",
    name: "",
    role: "Captain",
    mobile: "",
    email: "",
    status: "Active",
    pin: "1234",
  });

  const effectiveGrants = (
    role: Role,
    overrides: PermissionOverrides | undefined,
  ): RolePermissions =>
    Object.fromEntries(
      MODULE_GROUPS.flatMap((g) => g.modules).map((m) => [
        m,
        { ...store.rolePermissions[role][m], ...(overrides?.modules?.[m] ?? {}) },
      ]),
    ) as RolePermissions;

  const effectiveSpecial = (
    role: Role,
    overrides: PermissionOverrides | undefined,
  ): Partial<Record<SpecialPermission, boolean>> => ({
    ...store.roleSpecialPermissions[role],
    ...(overrides?.special ?? {}),
  });

  const setOverrideModule = (m: PermissionModule, a: StandardAction, value: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      permissionOverrides: {
        ...draft.permissionOverrides,
        modules: {
          ...draft.permissionOverrides?.modules,
          [m]: { ...draft.permissionOverrides?.modules?.[m], [a]: value },
        },
      },
    });
  };

  const setOverrideSpecial = (perm: SpecialPermission, value: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      permissionOverrides: {
        ...draft.permissionOverrides,
        special: { ...draft.permissionOverrides?.special, [perm]: value },
      },
    });
  };

  return (
    <Page>
      <PageHeader
        icon={Users}
        title="Manage Users"
        description="Every staff account maps to exactly one role. Permissions follow the role, with optional per-user overrides."
        actions={
          <Button onClick={() => setDraft(newUser())}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />

      <SectionCard title={`${store.users.length} staff accounts`} bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={store.users}
          keyFn={(u) => u.id}
          onRowClick={(u) => {
            setDraft({ ...u });
            setShowOverrides(!!u.permissionOverrides);
          }}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (u) => (
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              ),
            },
            { key: "role", header: "Role", cell: (u) => u.role },
            {
              key: "mobile",
              header: "Mobile",
              cell: (u) => <span className="num">{u.mobile}</span>,
            },
            {
              key: "permissions",
              header: "Permissions",
              cell: (u) =>
                u.permissionOverrides ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <KeySquare className="size-3.5" /> Custom
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Role default</span>
                ),
            },
            { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
          ]}
          mobileCard={(u) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.role} · <span className="num">{u.mobile}</span>
                </p>
              </div>
              <StatusBadge status={u.status} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard
        title="Role permissions"
        description="Default access for every role. Owner always has full access and can't be restricted."
        bodyClassName="p-3 sm:p-4"
      >
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Viewing role
          </Label>
          <Select value={viewRole} onValueChange={(v) => setViewRole(v as Role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                  {r === "Owner" ? " (always full access)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!canEditPermissions ? (
            <p className="text-xs text-muted-foreground">
              You don't have permission to edit roles & permissions — read-only.
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <ModuleGroupsTable
            grants={isOwnerRow ? effectiveGrants("Owner", undefined) : roleGrants}
            disabled={isOwnerRow || !canEditPermissions}
            onToggle={(m, a, v) =>
              store.updateRoleDefaults(viewRole, {
                ...roleGrants,
                [m]: { ...roleGrants[m], [a]: v },
              })
            }
          />
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Special permissions
          </p>
          <SpecialPermissionsList
            values={isOwnerRow ? effectiveSpecial("Owner", undefined) : roleSpecial}
            disabled={isOwnerRow || !canEditPermissions}
            onToggle={(perm, v) => store.updateRoleSpecialDefaults(viewRole, { [perm]: v })}
          />
        </div>
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit user" : "Add user"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input
                    value={draft.mobile}
                    onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Login PIN</Label>
                  <Input
                    value={draft.pin}
                    maxLength={4}
                    onChange={(e) => setDraft({ ...draft, pin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={draft.role}
                  disabled={!canEditPermissions}
                  onValueChange={(v) => setDraft({ ...draft, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="pt-1 text-xs text-muted-foreground">
                  See the Role permissions section above for exactly what {draft.role} can do.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Inactive staff cannot log in.</p>
                </div>
                <Switch
                  checked={draft.status === "Active"}
                  onCheckedChange={(v) => setDraft({ ...draft, status: v ? "Active" : "Inactive" })}
                />
              </div>

              {draft.role === "Owner" ? (
                <p className="rounded-xl border border-border bg-surface-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                  Owner always has full access to every module and action — permission overrides
                  don't apply.
                </p>
              ) : (
                <div className="rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setShowOverrides((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                  >
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <KeySquare className="size-3.5 text-muted-foreground" /> Permission
                        overrides
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {draft.permissionOverrides
                          ? "This user has custom overrides on top of the role default."
                          : `Currently uses the ${draft.role} role default as-is.`}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        showOverrides && "rotate-180",
                      )}
                    />
                  </button>
                  {showOverrides ? (
                    <div className="space-y-4 border-t border-border p-3">
                      {!canEditPermissions ? (
                        <p className="text-xs text-muted-foreground">
                          You don't have permission to edit user permissions — read-only.
                        </p>
                      ) : null}
                      <ModuleGroupsTable
                        grants={effectiveGrants(draft.role, draft.permissionOverrides)}
                        overriddenModules={draft.permissionOverrides?.modules}
                        disabled={!canEditPermissions}
                        onToggle={setOverrideModule}
                      />
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Special permissions
                        </p>
                        <SpecialPermissionsList
                          values={effectiveSpecial(draft.role, draft.permissionOverrides)}
                          overridden={draft.permissionOverrides?.special}
                          disabled={!canEditPermissions}
                          onToggle={setOverrideSpecial}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canEditPermissions || !draft.permissionOverrides}
                        onClick={() => setDraft({ ...draft, permissionOverrides: undefined })}
                      >
                        <RotateCcw className="size-3.5" /> Reset to role default
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!draft?.name.trim()}
              onClick={() => {
                if (!draft) return;
                store.upsertUser(draft);
                setDraft(null);
              }}
            >
              Save user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
