import type { ReactNode } from "react";

import { useStore } from "@/mock/store";
import type { PermissionModule, StandardAction } from "@/mock/types";

// What the signed-in user may do in one module - for hiding the controls
// they can't use. The exe (and lib/api.ts#assertPermitted) enforce the same
// rules; this only keeps screens from offering buttons that would be refused.
export function useAccess(module: PermissionModule) {
  const store = useStore();
  return {
    view: store.can(module, "view"),
    create: store.can(module, "create"),
    edit: store.can(module, "edit"),
    delete: store.can(module, "delete"),
  };
}

/** Renders its children only when the user has `action` in `module`. */
export function Allowed({
  module,
  action,
  children,
  fallback = null,
}: {
  module: PermissionModule;
  action: StandardAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const store = useStore();
  return <>{store.can(module, action) ? children : fallback}</>;
}

/** The note shown on a form the user may read but not change. */
export const READ_ONLY_NOTE =
  "You can view this but not change it. Ask the owner for edit permission.";
