import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
