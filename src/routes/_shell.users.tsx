import { FieldError, isEmailOrEmpty, isMobile10, useFormCheck } from "@/lib/formCheck";
import { READ_ONLY_NOTE, useAccess } from "@/lib/access";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, KeySquare, Plus, RotateCcw, Users } from "lucide-react";
import { useState, useEffect } from "react";

import { useHasPendingRequests } from "@/components/app/GlobalLoadingBar";
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
import { PasswordInput } from "@/components/ui/password-input";
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
import { MODULE_ACTIONS, PERMISSION_MODULE_LABELS, SPECIAL_PERMISSION_LABELS } from "@/mock/data";
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
    modules: ["ops-billing", "ops-hardware", "ops-experience", "ops-ledger"],
  },
  { title: "Finance & Reports", modules: ["reports", "expense", "cash-session"] },
  { title: "Admin & System", modules: ["users", "permissions", "system", "audit-log"] },
];

const SPECIAL_PERMS: SpecialPermission[] = [
  "orders.editAfterKot",
  "orders.reopenSettled",
  "orders.deleteOrder",
  "tables.mergeTransfer",
  "system.remakeOrderSequence",
  "users.editPermissions",
];

/** One switch flipped, with the rules that keep a grant meaningful: any
 * action needs view (a screen you can't open can't be used), switching view
 * off switches the rest off, and actions a module doesn't have stay off. */
function toggledGrant(
  m: PermissionModule,
  current: ModuleGrant,
  action: StandardAction,
  value: boolean,
): ModuleGrant {
  const allowed = MODULE_ACTIONS[m];
  const next: ModuleGrant = { ...current, [action]: value };
  if (action !== "view" && value) next.view = true;
  if (action === "view" && !value) for (const a of allowed) next[a] = false;
  for (const a of ACTIONS) if (!allowed.includes(a)) next[a] = false;
  return next;
}

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
  /** The module's whole new grant (see toggledGrant). */
  onToggle: (m: PermissionModule, grant: ModuleGrant) => void;
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
                      if (!MODULE_ACTIONS[m].includes(a)) {
                        return (
                          <td
                            key={a}
                            className="px-3 py-2 text-center text-muted-foreground"
                            title={`${PERMISSION_MODULE_LABELS[m]} has no ${a} action`}
                          >
                            —
                          </td>
                        );
                      }
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
                              onCheckedChange={(v) => onToggle(m, toggledGrant(m, grants[m], a, v))}
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
  const access = useAccess("users");
  const store = useStore();
  const [draft, setDraft] = useState<User | null>(null);
  // THE owner's own login (the account registered as the outlet's owner) is
  // locked: never turned off, never moved to another role, permissions never
  // changed - by anyone (owner rule, 2026-09-22). Only the owner themselves
  // can change their own name, mobile and password, so the form is read-only
  // for everybody else. The exe refuses all of it too.
  const draftIsOwner = Boolean(draft?.isOwner);
  const editingSelf = draft?.id === store.currentUserId;
  const ownerLockedForMe = draftIsOwner && !editingSelf;
  const form = useFormCheck();
  const formOpen = !!draft;
  const formReset = form.reset;
  useEffect(() => {
    if (!formOpen) formReset();
  }, [formOpen, formReset]);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);
  const [viewRole, setViewRole] = useState<Role>("Manager");
  const hasPending = useHasPendingRequests();
  const usersLoading = store.users.length === 0 && hasPending;

  const canEditPermissions = store.can("permissions", "edit");
  const canEditUsers = store.can("users", "edit");
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

  const setOverrideModule = (m: PermissionModule, grant: ModuleGrant) => {
    if (!draft) return;
    // Only what differs from the role default is an override - the rest
    // keeps following the role when the role is changed later.
    const roleGrant = store.rolePermissions[draft.role][m];
    const diff: Partial<ModuleGrant> = {};
    for (const a of ACTIONS) if (grant[a] !== roleGrant[a]) diff[a] = grant[a];
    const modules = { ...draft.permissionOverrides?.modules };
    if (Object.keys(diff).length) modules[m] = diff;
    else delete modules[m];
    setDraft({
      ...draft,
      permissionOverrides: { ...draft.permissionOverrides, modules },
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
          <Button
            hidden={!access.create}
            onClick={() => {
              setDraft(newUser());
              setResetPassword("");
              setConfirmPassword("");
            }}
          >
            <Plus className="size-4" /> Add user
          </Button>
        }
      />

      <SectionCard title={`${store.users.length} staff accounts`} bodyClassName="p-3 sm:p-4">
        <DataTable
          rows={store.users}
          loading={usersLoading}
          keyFn={(u) => u.id}
          onRowClick={(u) => {
            setDraft({ ...u });
            setResetPassword("");
            setConfirmPassword("");
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
            {
              key: "role",
              header: "Role",
              cell: (u) => (
                <span className="flex items-center gap-1.5">
                  {u.role}
                  {u.isOwner ? (
                    <span className="rounded-lg bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                      Owner account
                    </span>
                  ) : null}
                </span>
              ),
            },
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
            onToggle={(m, grant) =>
              store.updateRoleDefaults(viewRole, { ...roleGrants, [m]: grant })
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
                <Label required>Full name</Label>
                <Input
                  {...form.fieldProps("name")}
                  value={draft.name}
                  disabled={ownerLockedForMe}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <FieldError message={form.error("name")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label required>Mobile</Label>
                  <Input
                    {...form.fieldProps("mobile")}
                    inputMode="numeric"
                    placeholder="10-digit mobile - used to log in"
                    value={draft.mobile}
                    disabled={ownerLockedForMe}
                    onChange={(e) =>
                      setDraft({ ...draft, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
                    }
                  />
                  <FieldError message={form.error("mobile")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{draft.id ? "Reset PIN" : "Login PIN"}</Label>
                  <PasswordInput
                    {...form.fieldProps("pin")}
                    value={draft.pin}
                    maxLength={6}
                    disabled={!canEditUsers || ownerLockedForMe}
                    placeholder={draft.id ? "Leave blank to keep current" : undefined}
                    onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "") })}
                  />
                  <FieldError message={form.error("pin")} />
                </div>
              </div>
              {draft.id ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Reset password</Label>
                    <PasswordInput
                      {...form.fieldProps("password")}
                      value={resetPassword}
                      disabled={!canEditUsers}
                      placeholder="Leave blank to keep current"
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                  </div>
                  {resetPassword ? (
                    <div className="space-y-1.5">
                      <Label>Re-enter new password</Label>
                      <PasswordInput
                        {...form.fieldProps("confirm")}
                        value={confirmPassword}
                        disabled={!canEditUsers}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <FieldError message={form.error("password") ?? form.error("confirm")} />
                    {!canEditUsers ? (
                      <p className="text-xs text-muted-foreground">
                        You don't have permission to reset staff credentials.
                      </p>
                    ) : resetPassword && confirmPassword && resetPassword !== confirmPassword ? (
                      <p className="text-xs text-primary">Passwords don't match.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Existing passwords and PINs are stored securely and can't be viewed - only
                        reset to a new value.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label required>Password</Label>
                    <PasswordInput
                      {...form.fieldProps("password")}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label required>Re-enter password</Label>
                    <PasswordInput
                      {...form.fieldProps("confirm")}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldError message={form.error("password") ?? form.error("confirm")} />
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {resetPassword && confirmPassword && resetPassword !== confirmPassword
                      ? "Passwords don't match."
                      : "At least 6 characters."}
                  </p>
                </div>
              )}
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
                <Label>Role</Label>
                <Select
                  value={draft.role}
                  disabled={!canEditPermissions || draftIsOwner}
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
                  checked={draft.status === "Active" || draftIsOwner}
                  disabled={draftIsOwner}
                  onCheckedChange={(v) => setDraft({ ...draft, status: v ? "Active" : "Inactive" })}
                />
              </div>

              {draftIsOwner ? (
                <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning">
                  This is the owner's account. It can't be turned off, moved to another role or have
                  its permissions changed.
                  {ownerLockedForMe ? " Only the owner can change their own details." : ""}
                </p>
              ) : null}
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
              title={
                ownerLockedForMe
                  ? "Only the owner can change their own details"
                  : !(draft?.id ? access.edit : access.create)
                    ? READ_ONLY_NOTE
                    : undefined
              }
              disabled={!(draft?.id ? access.edit : access.create) || ownerLockedForMe}
              onClick={async () => {
                if (!draft) return;
                const pw = resetPassword.trim();
                const ok = form.check([
                  { key: "name", label: "Full name", value: draft.name },
                  {
                    key: "mobile",
                    label: "Mobile",
                    value: draft.mobile,
                    valid: isMobile10,
                    message: "Enter a 10-digit mobile number",
                  },
                  {
                    key: "pin",
                    label: "PIN",
                    value: draft.pin,
                    valid: (v) => !v || /^\d{4,6}$/.test(String(v)),
                    message: "PIN must be 4 to 6 digits",
                  },
                  {
                    key: "password",
                    label: "Password",
                    value: pw,
                    valid: (v) => (draft.id ? !v || String(v).length >= 6 : String(v).length >= 6),
                    message: draft.id
                      ? "New password must be at least 6 characters"
                      : "Password must be at least 6 characters",
                  },
                  {
                    key: "confirm",
                    label: "Re-enter password",
                    value: confirmPassword,
                    valid: (v) => !pw || v === resetPassword,
                    message: "The two passwords don't match",
                  },
                  {
                    key: "email",
                    label: "Email",
                    value: draft.email,
                    valid: isEmailOrEmpty,
                    message: "Enter a valid email or leave it blank",
                  },
                ]);
                if (!ok) return;
                if (await store.upsertUser(draft, pw || undefined)) setDraft(null);
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
