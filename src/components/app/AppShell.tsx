import { connectChangeFeed } from "@/lib/changeFeedSocket";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
// image.png is white-on-transparent (for the dark sidebar); the mobile nav
// sheet has a light surface, so it needs the dark-on-white SVG instead.
import billerpeLogoOnDark from "@/assets/image.png";
import billerpeLogoOnLight from "@/assets/billerpe-logo.svg";
import billerpeMark from "@/assets/billerpe-mark.jpeg";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Keyboard,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu as MenuIcon,
  Receipt,
  RefreshCw,
  ServerCrash,
  Settings2,
  ShieldCheck,
  Store,
  Ticket,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startQrInbox } from "@/lib/qrInbox";
import { cn } from "@/lib/utils";
import { connectionStateLabels } from "@/mock/data";
import { realToday } from "@/mock/format";
import { useStore } from "@/mock/store";
import type { ConnectionState, PermissionModule } from "@/mock/types";

interface NavChild {
  label: string;
  to: string;
  /** Which permission module gates this specific link - undefined means
   * "same as the parent item's own module(s)". */
  module?: PermissionModule;
}

interface NavItem {
  code: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  /** view-gated by store.can(module, "view") - an array means "visible if
   * the user can view ANY of these" (e.g. Stock's several sub-modules).
   * Undefined (Profile/Help) means always visible - nothing to gate. */
  module?: PermissionModule | PermissionModule[];
  children?: NavChild[];
}

export const NAV: NavItem[] = [
  { code: "DSH", label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", module: "dashboard" },
  { code: "BIL", label: "Biller", icon: UtensilsCrossed, to: "/table-grid", module: "biller" },
  {
    code: "KBD",
    label: "Keyboard Billing",
    icon: Keyboard,
    to: "/keyboard-billing",
    module: "keyboard-billing",
  },
  // KDS deliberately isn't a top-level sidebar destination (task 38, P0) -
  // it's a dedicated kitchen-side screen, not a normal POS nav item
  // billers/cashiers page through. Reached instead from Operations ›
  // Hardware's Kitchens section (KitchenSection, hardware.tsx), which
  // already owns the "which kitchen/station" concept this screen filters
  // by. The route itself (/kds) is untouched - only this sidebar entry is
  // gone.
  { code: "ORD", label: "Orders", icon: Receipt, to: "/orders", module: "orders" },
  {
    code: "MEN",
    label: "Menu",
    icon: Store,
    module: "menu",
    children: [
      { label: "Categories", to: "/menu/categories" },
      { label: "Items", to: "/menu/items" },
      { label: "Variants", to: "/menu/variants" },
      { label: "Addons", to: "/menu/addons" },
      { label: "Menus", to: "/menu/menus" },
    ],
  },
  {
    code: "TBL",
    label: "Table",
    icon: CalendarDays,
    module: ["tables", "reservations", "queue"],
    children: [
      { label: "Table Category", to: "/tables/categories", module: "tables" },
      { label: "Manage Table", to: "/tables/manage", module: "tables" },
      { label: "Reservations", to: "/reservations", module: "reservations" },
      { label: "Waitlist Queue", to: "/queue", module: "queue" },
    ],
  },
  { code: "USR", label: "Manage Users", icon: Users, to: "/users", module: "users" },
  { code: "RPT", label: "Reports", icon: BarChart3, to: "/reports", module: "reports" },
  {
    code: "EXP",
    label: "Expense",
    icon: Wallet,
    module: "expense",
    children: [
      { label: "Expense Head", to: "/expense/heads" },
      { label: "Expense Entry", to: "/expense/entries" },
    ],
  },
  {
    code: "STK",
    label: "Stock",
    icon: Boxes,
    to: "/stock",
    module: ["stock-masters", "stock-transactions", "stock-recipes", "stock-reports"],
  },
  {
    code: "CSH",
    label: "Opening & Closing",
    icon: Wallet,
    to: "/cash-session",
    module: "cash-session",
  },
  {
    code: "OPS",
    label: "Operations",
    icon: Settings2,
    to: "/operations",
    module: ["ops-billing", "ops-hardware", "ops-experience", "ops-ledger"],
  },
  { code: "PRF", label: "Profile", icon: UserCog, to: "/profile" },
  { code: "HLP", label: "Help", icon: CircleHelp, to: "/support/help" },
];

const connectionMeta: Record<
  ConnectionState,
  { icon: LucideIcon; className: string; spin?: boolean }
> = {
  online: { icon: Wifi, className: "bg-success-soft text-success" },
  offline: { icon: WifiOff, className: "bg-muted text-muted-foreground" },
  syncing: { icon: RefreshCw, className: "bg-info-soft text-info", spin: true },
  "sync-error": { icon: AlertTriangle, className: "bg-warning-soft text-warning" },
  conflict: { icon: AlertOctagon, className: "bg-warning-soft text-warning" },
  "local-server-down": { icon: ServerCrash, className: "bg-primary-soft text-primary" },
  "offline-limit-exceeded": { icon: WifiOff, className: "bg-primary-soft text-primary" },
};

type Popover = "none" | "bell" | "conn" | "account" | string;

/** True if `can` grants view on at least one module - undefined/no module
 * means "nothing to gate" (Profile/Help), always true. */
function hasViewAccess(
  can: (m: PermissionModule, a: "view" | "create" | "edit" | "delete") => boolean,
  module: PermissionModule | PermissionModule[] | undefined,
): boolean {
  if (!module) return true;
  const modules = Array.isArray(module) ? module : [module];
  return modules.some((m) => can(m, "view"));
}

// Reachable only from the account dropdown, not the main NAV rail, but
// still real PermissionModule entries worth guarding against a typed URL.
const ACCOUNT_MENU_ROUTES: { to: string; module: PermissionModule }[] = [
  { to: "/system/audit-log", module: "audit-log" },
  { to: "/system", module: "system" },
  { to: "/kds", module: "kds" },
];

// Where each user lands after signing in (and where a page they can't open
// sends them): the first of these they can view. Billing staff get the
// floor, kitchen staff the KDS, an accountant the dashboard, and so on.
const LANDING: { to: string; module: PermissionModule | PermissionModule[] }[] = [
  { to: "/table-grid", module: "biller" },
  { to: "/kds", module: "kds" },
  { to: "/dashboard", module: "dashboard" },
  { to: "/orders", module: "orders" },
  { to: "/keyboard-billing", module: "keyboard-billing" },
  {
    to: "/stock",
    module: ["stock-masters", "stock-transactions", "stock-recipes", "stock-reports"],
  },
  { to: "/reports", module: "reports" },
  { to: "/expense/entries", module: "expense" },
  { to: "/cash-session", module: "cash-session" },
  { to: "/menu/items", module: "menu" },
  { to: "/tables/manage", module: "tables" },
  { to: "/reservations", module: "reservations" },
  { to: "/queue", module: "queue" },
  { to: "/users", module: "users" },
  { to: "/operations", module: ["ops-billing", "ops-hardware", "ops-experience", "ops-ledger"] },
];

// What the connection chip opens: the real state of this outlet's local
// server and its cloud sync (GET /localServerStatus), no controls.
function ConnectionDetails() {
  const store = useStore();
  const status = store.localServerStatus;
  const ago = (iso: string | null | undefined) => {
    if (!iso) return "never";
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  };
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3 px-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
  return (
    <div data-connection-details>
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {connectionStateLabels[store.connection]}
      </p>
      {row("Local server", "Connected")}
      {status && status.registered ? (
        <>
          {row(
            "Last cloud sync",
            ago(status.sync.lastHeartbeatAt ?? status.sync.lastSuccessfulSyncAt),
          )}
          {row("Waiting to upload", `${status.sync.pendingOrderCount} order(s)`)}
          {status.sync.stuckOrders?.length
            ? row("Refused by cloud", `${status.sync.stuckOrders.length} order(s)`)
            : null}
          {store.connection === "offline" ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Billing continues on this local server; everything uploads when the internet is back.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function landingRoute(
  can: (m: PermissionModule, a: "view" | "create" | "edit" | "delete") => boolean,
): string {
  return LANDING.find((l) => hasViewAccess(can, l.module))?.to ?? "/profile";
}

/** Finds the most specific NAV entry (a child link, else its parent) that
 * matches `pathname`, so a route guard can check the right module even for
 * a link that isn't in the rail at its parent's top level. */
function findNavModule(pathname: string): PermissionModule | PermissionModule[] | undefined {
  for (const item of NAV) {
    const child = item.children?.find((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
    if (child) return child.module ?? item.module;
    if (item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))) return item.module;
  }
  for (const route of ACCOUNT_MENU_ROUTES) {
    if (pathname === route.to || pathname.startsWith(`${route.to}/`)) return route.module;
  }
  return undefined;
}

export function AppShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<Popover>("none");
  const [mobileNav, setMobileNav] = useState(false);
  const [railHover, setRailHover] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const railExpanded = railHover || openGroup !== null;

  useEffect(() => {
    setOpen("none");
    setMobileNav(false);
    const activeParent = NAV.find((i) => i.children?.some((c) => pathname.startsWith(c.to)));
    setOpenGroup(activeParent?.code ?? null);
  }, [pathname]);

  useEffect(() => {
    if (!store.authed) navigate({ to: "/login" });
  }, [store.authed, navigate]);

  // The signed-in user's own record and permissions load before anything
  // permission-dependent renders. Before this, a refresh briefly treated
  // the user as whoever was first in the (demo) staff list, and the access
  // guard below bounced a real Owner to Profile with "no access".
  useEffect(() => {
    if (!store.authed || store.sessionReady) return;
    let cancelled = false;
    void store.loadSession().then((ok) => {
      if (!cancelled && !ok) store.logout();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed, store.sessionReady]);

  // Hiding a nav link isn't real access control - someone can still type
  // the URL directly. A page this user can't open goes quietly to the first
  // one they can (kitchen staff -> KDS), no toast: they never asked for it.
  useEffect(() => {
    if (!store.authed || !store.sessionReady) return;
    const module = findNavModule(pathname);
    if (pathname !== "/profile" && !hasViewAccess(store.can, module)) {
      navigate({ to: landingRoute(store.can), replace: true });
    }
    // store.can changes when this user's permissions do (see the listener
    // below), so a page that was just taken away is left at once.
  }, [store.authed, store.sessionReady, pathname, navigate, store.can]);

  // Loaded once the session is ready, and only what this user may see. The
  // exe refuses the rest (billerpe-local-exe/constant/routePermissions.js),
  // so loading it anyway only produced "no permission" errors for staff who
  // never opened those screens.
  useEffect(() => {
    if (!store.sessionReady) return;
    // Reference data every working screen reads; open to any staff member.
    void store.loadTablesFromServer();
    void store.loadMenuFromServer();
    void store.loadUsersFromServer();
    void store.loadInvoiceFormatFromServer();
    void store.loadKotFormatFromServer();
    void store.loadCustomersFromServer();
    void store.loadKitchensFromServer();
    void store.loadPrintersFromServer();
    void store.loadTaxRulesFromServer();
    void store.loadServiceChargeFromServer();
    void store.loadPaymentModesFromServer();
    void store.loadPaymentModeDefaultsFromServer();
    void store.loadBillChargeRulesFromServer();
    void store.loadNotificationSettingsFromServer();
    void store.loadUnitsFromServer();
    void store.loadRawMaterialsFromServer();
    void store.loadOrderHistoryFromServer();
    if (store.can("ops-ledger", "view")) {
      void store.loadDueBillsFromServer();
      void store.loadRefundDueOrdersFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sessionReady]);

  // QR orders ring and toast on every screen, not just the table grid, for
  // anyone who takes orders (lib/qrInbox.ts).
  useEffect(() => {
    if (!store.sessionReady || !store.can("biller", "view")) return;
    return startQrInbox({ onOpen: () => navigate({ to: "/table-grid" }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sessionReady]);

  // Permissions changed on another device (the owner edited a role or this
  // user): take the new access at once, not at the next login. The access
  // guard above then moves this user off a page they can no longer open.
  useEffect(() => {
    if (!store.sessionReady) return;
    return connectChangeFeed({
      onChange: () => {},
      onConfigChange: (entities) => {
        if (!entities.includes("permissions")) return;
        void Promise.all([
          store.syncCurrentUser(),
          store.loadRolePermissionsFromServer(),
          store.loadUsersFromServer(),
        ]);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sessionReady]);

  // The connection chip's real state (store.loadServerStatusFromServer).
  useEffect(() => {
    if (!store.sessionReady) return;
    void store.loadServerStatusFromServer();
    const id = setInterval(() => void store.loadServerStatusFromServer(), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sessionReady]);

  // Expense Heads/Entries, Cash Sessions, Promo Codes, and E-Bill Credit -
  // same reasoning as above, moved to their own screens' mount effects
  // (_shell.expense.heads.tsx, _shell.expense.entries.tsx, _shell.cash-
  // session.tsx, _shell.table-grid.order.$orderId.tsx, _shell.dashboard.tsx).

  const unread = store.notifications.filter((n) => !n.read).length;
  const conn = connectionMeta[store.connection];
  const ConnIcon = conn.icon;

  const home = landingRoute(store.can);
  const mobileTabs = [
    { to: home, label: "Home", icon: LayoutDashboard, module: undefined },
    { to: "/table-grid", label: "Biller", icon: UtensilsCrossed, module: "biller" as const },
    { to: "/kds", label: "KDS", icon: ChefHat, module: "kds" as const },
    { to: "/orders", label: "Orders", icon: Receipt, module: "orders" as const },
  ].filter(
    (t, i, all) =>
      (!t.module || store.can(t.module, "view")) && all.findIndex((x) => x.to === t.to) === i,
  );

  const navItems = (store.keyboardOnly ? NAV.filter((i) => i.code !== "BIL") : NAV).filter((i) =>
    hasViewAccess(store.can, i.module),
  );

  const isActive = (item: NavItem) =>
    item.to
      ? pathname === item.to || pathname.startsWith(`${item.to}/`)
      : (item.children ?? []).some((c) => pathname.startsWith(c.to));

  if (!store.sessionReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your outlet…</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        {/* rail */}
        <aside
          onMouseEnter={() => setRailHover(true)}
          onMouseLeave={() => setRailHover(false)}
          className={cn(
            "sticky top-0 z-50 hidden h-screen shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:flex",
            railExpanded ? "w-[220px]" : "w-[76px]",
          )}
        >
          <Link
            to={landingRoute(store.can)}
            className={cn(
              "mb-2 flex h-11 items-center overflow-hidden rounded-xl px-2 transition-all",
              railExpanded ? "w-[196px] justify-start" : "w-[60px] justify-center",
            )}
          >
            {railExpanded ? (
              // image.png is the full lockup (wordmark + "Powered by ITLION"
              // tagline, ~4.12:1). Cropped to just the wordmark band via a
              // ~8.5:1 container + object-top, rather than shrinking the
              // whole lockup down to fit - keeps the actual logotype large
              // and legible instead of the tagline eating into its size.
              <div className="h-6 w-[170px] shrink-0 overflow-hidden">
                <img
                  src={billerpeLogoOnDark}
                  alt="BillerPe"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            ) : (
              <img
                src={billerpeMark}
                alt="BillerPe"
                className="size-8 shrink-0 rounded-md object-cover"
              />
            )}
          </Link>
          <nav
            className={cn(
              "flex w-full flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 scrollbar-slim",
              railExpanded ? "items-start" : "items-center",
            )}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const isOpenGroup = openGroup === item.code;
              const content = (
                <>
                  <Icon className="size-[18px] shrink-0" />
                  {railExpanded ? (
                    <span className="truncate text-sm font-medium">{item.label}</span>
                  ) : null}
                </>
              );
              const cls = cn(
                "relative flex rounded-xl px-1 py-2 text-sidebar-foreground transition-all",
                railExpanded
                  ? "w-full flex-row items-center justify-start gap-3 px-3"
                  : "w-[60px] flex-col items-center gap-1",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              );
              if (item.children) {
                return (
                  <div key={item.code} className={cn(railExpanded ? "w-full" : "w-[60px]")}>
                    <button
                      type="button"
                      aria-label={item.label}
                      className={cn(cls, "w-full")}
                      onClick={() => setOpenGroup(isOpenGroup ? null : item.code)}
                    >
                      {content}
                      {railExpanded ? (
                        <ChevronDown
                          className={cn(
                            "ml-auto size-4 shrink-0 transition-transform",
                            isOpenGroup && "rotate-180",
                          )}
                        />
                      ) : null}
                    </button>
                    {railExpanded && isOpenGroup ? (
                      <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border/60 pl-3">
                        {item.children
                          .filter((c) => hasViewAccess(store.can, c.module ?? item.module))
                          .map((c) => (
                            <Link
                              key={c.to}
                              to={c.to}
                              className={cn(
                                "truncate rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                pathname.startsWith(c.to) &&
                                  "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                              )}
                            >
                              {c.label}
                            </Link>
                          ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <Link key={item.code} to={item.to!} className={cls} aria-label={item.label}>
                  {content}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* header */}
          <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet open={mobileNav} onOpenChange={setMobileNav}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      aria-label="Open navigation"
                    >
                      <MenuIcon className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[280px] p-0">
                    <SheetHeader className="border-b border-border px-4 py-3">
                      <SheetTitle>
                        <img src={billerpeLogoOnLight} alt="BillerPe" className="h-6 w-auto" />
                      </SheetTitle>
                    </SheetHeader>
                    <nav className="max-h-[calc(100vh-64px)] overflow-y-auto p-2">
                      {navItems.map((item) =>
                        item.children ? (
                          <div key={item.code} className="mb-1">
                            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {item.label}
                            </p>
                            {item.children
                              .filter((c) => hasViewAccess(store.can, c.module ?? item.module))
                              .map((c) => (
                                <Link
                                  key={c.to}
                                  to={c.to}
                                  className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                                >
                                  {c.label}
                                </Link>
                              ))}
                          </div>
                        ) : (
                          <Link
                            key={item.code}
                            to={item.to!}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                          >
                            <item.icon className="size-4 text-muted-foreground" />
                            {item.label}
                          </Link>
                        ),
                      )}
                    </nav>
                  </SheetContent>
                </Sheet>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {store.restaurant?.name ?? store.serverHotelName ?? ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {/* Plain calendar date - the non-midnight business-day
                    rollover only exists server-side (getBusinessDate). */}
                    {store.restaurant?.address ? `${store.restaurant.address} · ` : ""}Business date{" "}
                    {realToday()}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {/* connection chip */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpen(open === "conn" ? "none" : "conn")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium",
                      conn.className,
                    )}
                  >
                    <ConnIcon className={cn("size-3.5", conn.spin && "animate-spin")} />
                    <span className="hidden sm:inline">
                      {connectionStateLabels[store.connection]}
                    </span>
                  </button>
                  <AnimatePresence>
                    {open === "conn" ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-border bg-popover p-2 shadow-overlay"
                      >
                        <ConnectionDetails />
                        <div className="mt-1 border-t border-border pt-1">
                          <Link
                            to="/system"
                            className="block rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-surface-muted"
                          >
                            Open Local Server / Sync Center
                          </Link>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                {/* bell */}
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Notifications"
                    onClick={() => setOpen(open === "bell" ? "none" : "bell")}
                    className="relative grid size-9 place-items-center rounded-full hover:bg-surface-muted"
                  >
                    {unread ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                    {unread ? (
                      <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {unread}
                      </span>
                    ) : null}
                  </button>
                  <AnimatePresence>
                    {open === "bell" ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-11 z-50 w-[340px] max-w-[90vw] rounded-xl border border-border bg-popover shadow-overlay"
                      >
                        <div className="flex items-center justify-between border-b border-border px-3 py-2">
                          <p className="text-sm font-semibold">Notifications</p>
                          <button
                            type="button"
                            className="text-xs text-primary"
                            onClick={store.markAllNotificationsRead}
                          >
                            Mark all read
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto scrollbar-slim">
                          {store.notifications.slice(0, 8).map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => store.markNotificationRead(n.id)}
                              className={cn(
                                "block w-full border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-surface-muted",
                                !n.read && "bg-primary-soft/40",
                              )}
                            >
                              <p className="text-sm font-medium">{n.title}</p>
                              <p className="text-xs text-muted-foreground">{n.body}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{n.at}</p>
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-border p-2">
                          <Link
                            to="/system/notifications"
                            className="block rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-surface-muted"
                          >
                            Notification Settings
                          </Link>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                {/* account */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpen(open === "account" ? "none" : "account")}
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-surface-muted"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {store.currentUser.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block text-xs font-semibold leading-tight">
                        {store.currentUser.name}
                      </span>
                      <span className="block text-[11px] leading-tight text-muted-foreground">
                        {store.currentUser.role}
                      </span>
                    </span>
                  </button>
                  <AnimatePresence>
                    {open === "account" ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-overlay"
                      >
                        <Link
                          to="/profile"
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                        >
                          <UserCog className="size-4 text-muted-foreground" /> Profile
                        </Link>
                        <Link
                          to="/support/raise-ticket"
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                        >
                          <Ticket className="size-4 text-muted-foreground" /> Raise Ticket
                        </Link>
                        <Link
                          to="/support/help"
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                        >
                          <CircleHelp className="size-4 text-muted-foreground" /> Help & Support
                        </Link>
                        <Link
                          to="/system/audit-log"
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                        >
                          <ShieldCheck className="size-4 text-muted-foreground" /> Audit Log
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            store.logout();
                            navigate({ to: "/login" });
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-primary-soft"
                        >
                          <LogOut className="size-4" /> Logout
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {store.transactionsBlocked ? (
              <div className="flex items-center gap-2 bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground">
                <AlertTriangle className="size-3.5 shrink-0" />
                Offline longer than the {store.maxOfflineDays}-day limit — new transactions are
                blocked until this device syncs. You remain logged in.
              </div>
            ) : null}
          </header>

          <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>

          {/* mobile bottom nav */}
          {/* mobile bottom nav - only what this user may open; Home is their
              own landing screen and More opens the full (filtered) menu. */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-surface lg:hidden"
            style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}
          >
            {mobileTabs.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <i.icon className="size-4" />
                {i.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            >
              <Settings2 className="size-4" />
              More
            </button>
          </nav>
        </div>

        {open !== "none" ? (
          <button
            type="button"
            aria-label="Close menus"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen("none")}
          >
            <X className="hidden" />
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
