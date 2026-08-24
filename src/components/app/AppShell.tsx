import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
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
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RESTAURANT, connectionStateLabels } from "@/mock/data";
import { useStore } from "@/mock/store";
import type { ConnectionState } from "@/mock/types";

interface NavItem {
  code: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  children?: { label: string; to: string }[];
}

export const NAV: NavItem[] = [
  { code: "DSH", label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { code: "BIL", label: "Biller", icon: UtensilsCrossed, to: "/table-grid" },
  { code: "KBD", label: "Keyboard Billing", icon: Keyboard, to: "/keyboard-billing" },
  { code: "KDS", label: "Kitchen Display", icon: ChefHat, to: "/kds" },
  { code: "ORD", label: "Orders", icon: Receipt, to: "/orders" },
  {
    code: "MEN",
    label: "Menu",
    icon: Store,
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
    children: [
      { label: "Table Category", to: "/tables/categories" },
      { label: "Manage Table", to: "/tables/manage" },
      { label: "Reservations", to: "/reservations" },
    ],
  },
  { code: "USR", label: "Manage Users", icon: Users, to: "/users" },
  { code: "RPT", label: "Reports", icon: BarChart3, to: "/reports" },
  {
    code: "EXP",
    label: "Expense",
    icon: Wallet,
    children: [
      { label: "Expense Head", to: "/expense/heads" },
      { label: "Expense Entry", to: "/expense/entries" },
    ],
  },
  { code: "STK", label: "Stock", icon: Boxes, to: "/stock" },
  { code: "CSH", label: "Opening & Closing", icon: Wallet, to: "/cash-session" },
  { code: "OPS", label: "Operations", icon: Settings2, to: "/operations" },
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

  // Replaces the seeded mock tables/categories with real backend data once
  // there's a session to fetch them with - covers both a fresh login and a
  // page reload while already authed (the auth check above only handles
  // the unauthenticated case).
  useEffect(() => {
    if (store.authed) void store.loadTablesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadMenuFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadUsersFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadInvoiceFormatFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadDueBillsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadCustomersFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadKitchensFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadPrintersFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadTaxRulesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadServiceChargeFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadUnitsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadRawMaterialsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadSuppliersFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadPurchaseOrdersFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadWastageFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadSemiFinishedFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadRecipesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadExpenseHeadsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadExpensesFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  useEffect(() => {
    if (store.authed) void store.loadOrderHistoryFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.authed]);

  const unread = store.notifications.filter((n) => !n.read).length;
  const conn = connectionMeta[store.connection];
  const ConnIcon = conn.icon;

  const navItems = store.keyboardOnly ? NAV.filter((i) => i.code !== "BIL") : NAV;

  const isActive = (item: NavItem) =>
    item.to
      ? pathname === item.to || pathname.startsWith(`${item.to}/`)
      : (item.children ?? []).some((c) => pathname.startsWith(c.to));

  return (
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
          to="/dashboard"
          className={cn(
            "mb-2 flex h-11 items-center overflow-hidden rounded-xl bg-primary px-2 text-primary-foreground transition-all",
            railExpanded ? "w-[196px] justify-start gap-2" : "w-[60px] justify-center gap-0",
          )}
        >
          <span className="grid shrink-0 size-7 place-items-center text-sm font-bold tracking-tight">
            BP
          </span>
          {railExpanded ? (
            <span className="truncate text-sm font-bold tracking-tight">BillerPe</span>
          ) : null}
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
                      {item.children.map((c) => (
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
                    <SheetTitle>BillerPe</SheetTitle>
                  </SheetHeader>
                  <nav className="max-h-[calc(100vh-64px)] overflow-y-auto p-2">
                    {navItems.map((item) =>
                      item.children ? (
                        <div key={item.code} className="mb-1">
                          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {item.label}
                          </p>
                          {item.children.map((c) => (
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
                <p className="truncate text-sm font-semibold tracking-tight">{RESTAURANT.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {RESTAURANT.outlet} · Business date {RESTAURANT.businessDate}
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
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Demo state switcher
                      </p>
                      {(Object.keys(connectionStateLabels) as ConnectionState[]).map((state) => (
                        <button
                          key={state}
                          type="button"
                          onClick={() => {
                            store.setConnection(state);
                            setOpen("none");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted",
                            store.connection === state && "bg-surface-muted font-medium",
                          )}
                        >
                          {connectionStateLabels[state]}
                        </button>
                      ))}
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
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface lg:hidden">
          {[
            { to: "/dashboard", label: "Home", icon: LayoutDashboard },
            { to: "/table-grid", label: "Biller", icon: UtensilsCrossed },
            { to: "/kds", label: "KDS", icon: ChefHat },
            { to: "/orders", label: "Orders", icon: Receipt },
            { to: "/operations", label: "More", icon: Settings2 },
          ].map((i) => (
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
        </nav>
      </div>

      {/* local server unavailable blocking modal */}
      <AnimatePresence>
        {store.connection === "local-server-down" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-foreground/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-overlay"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <ServerCrash className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Local Server Unavailable</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    BillerPe cannot reach the local server on this network. Billing, KOT printing
                    and settlement are paused until the connection is restored.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => navigate({ to: "/system" })}>
                  Open Local Server
                </Button>
                <Button onClick={() => store.setConnection("online")}>
                  <RefreshCw className="size-4" /> Retry connection
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
  );
}
