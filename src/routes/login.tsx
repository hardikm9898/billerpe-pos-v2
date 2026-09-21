import { FieldError, isMobile10, useFormCheck } from "@/lib/formCheck";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Fingerprint, KeyRound, LogIn, ServerCrash, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// image.png is white-on-transparent (for the dark left panel); the mobile
// header sits on the light sign-in card, so it needs the dark-on-white SVG.
import billerpeLogoOnDark from "@/assets/image.png";
import billerpeLogoOnLight from "@/assets/billerpe-logo.svg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/mock/store";
import { cn } from "@/lib/utils";
import {
  authApi,
  ApiError,
  getBrowserDeviceId,
  refreshServerState,
  registerThisPc,
  setStoredAuthToken,
} from "@/lib/api";

// Phase C: a raw fetch failure (connection refused - the EXE isn't
// running, or died between the page's initial health check and this
// click) throws a plain TypeError, not an ApiError - previously
// indistinguishable from a real wrong-password/validation error in the
// generic fallback message below it.
function describeAuthError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Could not reach the BillerPe Local Server - check that it's running on this network.";
}

// A real wrong password and "this device's local data was wiped" (fresh
// install/reinstall - see getLocalServerIdentity's own comment) return the
// exact same message text from the exe otherwise - ApiError.needsRegistration
// (set from controller/auth.js's requireRegisteredDevice) is the only real
// signal that tells them apart. Shared by both the password and PIN submit
// handlers below rather than duplicated inline.
function handleLoginError(err: unknown, resetDeviceRegistration: () => void) {
  if (err instanceof ApiError && err.needsRegistration) {
    resetDeviceRegistration();
    void refreshServerState();
    toast.error("This PC is not registered to a restaurant", {
      description: "Register it below with the owner's BillerPe login.",
    });
    return;
  }
  toast.error(describeAuthError(err));
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · BillerPe POS" },
      {
        name: "description",
        content:
          "Sign in to BillerPe with password or PIN. Offline-capable login for restaurant staff.",
      },
      { property: "og:title", content: "Sign in · BillerPe POS" },
      {
        property: "og:description",
        content: "Offline-capable restaurant POS login with password and PIN.",
      },
    ],
  }),
  component: LoginPage,
});

type Tab = "password" | "pin";

function LoginPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("password");
  const [forgot, setForgot] = useState(false);
  const [pin, setPin] = useState("");
  const [pinMobile, setPinMobile] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pwMobile, setPwMobile] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [regMobile, setRegMobile] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const form = useFormCheck();
  const formReset = form.reset;
  useEffect(() => {
    formReset();
  }, [tab, formReset]);

  const registered = store.deviceRegistered;

  const doLogin = (realUserId: string | null) => {
    if (!realUserId) {
      toast.error("Could not identify the logged-in account");
      return;
    }
    store.login(realUserId);
    toast.success("Welcome back", { description: store.serverHotelName ?? undefined });
    // "/" loads the session and sends each role to its own landing screen.
    navigate({ to: "/" });
  };

  const tabs: { id: Tab; label: string; icon: typeof LogIn }[] = [
    { id: "password", label: "Password", icon: LogIn },
    { id: "pin", label: "PIN", icon: KeyRound },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          {/* image.png is the full lockup (wordmark + "Powered by ITLION"
              tagline, ~4.12:1) - cropped to just the wordmark band via a
              wide container + object-top, rather than shrinking the whole
              lockup down to fit. */}
          <div className="h-8 w-[220px] shrink-0 overflow-hidden">
            <img
              src={billerpeLogoOnDark}
              alt="BillerPe"
              className="h-full w-full object-cover object-top"
            />
          </div>
          <p className="text-xs text-sidebar-accent-foreground opacity-70">
            Restaurant Point of Sale
          </p>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-sidebar-accent-foreground">
            Cloud power, offline reliability.
          </h1>
          <p className="mt-3 text-sm opacity-80">
            Keep taking orders, printing KOTs, billing and settling even when the internet drops.
            Everything queues locally and syncs the moment you are back online.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { k: "29", v: "Screens" },
              { k: "7", v: "Roles" },
              { k: "3-day", v: "Offline limit" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl bg-sidebar-accent p-3">
                <p className="num text-lg font-semibold text-sidebar-accent-foreground">{s.k}</p>
                <p className="text-[11px] opacity-70">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs opacity-60">{store.serverHotelName ?? "BillerPe"}</p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-raised sm:p-8"
        >
          <div className="mb-6 flex items-center lg:hidden">
            <img src={billerpeLogoOnLight} alt="BillerPe" className="h-7 w-auto" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {registered
              ? "Choose how you want to sign in to this terminal."
              : "This terminal must be registered before staff can sign in."}
          </p>

          {!registered ? (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-muted p-4">
              <div className="flex items-start gap-3">
                <Fingerprint className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Device registration required</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    One-time step. Enter the outlet owner/admin's BillerPe cloud login - this device
                    pulls the outlet's real data down and registers itself against it.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="regMobile" required>
                    Owner/admin mobile number
                  </Label>
                  <Input
                    {...form.fieldProps("regMobile")}
                    inputMode="numeric"
                    id="regMobile"
                    className="mt-1.5"
                    value={regMobile}
                    maxLength={10}
                    onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                  <FieldError message={form.error("regMobile")} />
                </div>
                <div>
                  <Label htmlFor="regPassword" required>
                    Owner/admin password
                  </Label>
                  <PasswordInput
                    {...form.fieldProps("regPassword")}
                    id="regPassword"
                    className="mt-1.5"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                  <FieldError message={form.error("regPassword")} />
                </div>
                <Button
                  className="w-full"
                  disabled={regLoading}
                  onClick={async () => {
                    const valid = form.check([
                      {
                        key: "regMobile",
                        label: "Mobile number",
                        value: regMobile,
                        valid: isMobile10,
                        message: "Enter the owner's 10-digit mobile number",
                      },
                      { key: "regPassword", label: "Password", value: regPassword },
                    ]);
                    if (!valid) return;
                    setRegLoading(true);
                    try {
                      const { pulled } = await registerThisPc(regMobile, regPassword);
                      store.registerDevice();
                      void refreshServerState();
                      const menuCount = Number(pulled?.["menuItems"] ?? 0);
                      const tableCount = Number(pulled?.["tables"] ?? 0);
                      toast.success("Device registered", {
                        description: `Pulled ${menuCount} menu item(s), ${tableCount} table(s) - sign in below.`,
                      });
                    } catch (err) {
                      toast.error(describeAuthError(err));
                    } finally {
                      setRegLoading(false);
                    }
                  }}
                >
                  <ShieldCheck className="size-4" />{" "}
                  {regLoading ? "Registering…" : "Register Device"}
                </Button>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1",
              !registered && "pointer-events-none opacity-50",
            )}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-surface shadow-card" : "text-muted-foreground",
                )}
              >
                <t.icon className="size-4" /> {t.label}
              </button>
            ))}
          </div>

          <fieldset disabled={!registered} className="mt-5 space-y-4">
            {tab === "password" ? (
              <>
                <div>
                  <Label htmlFor="pwMobile" required>
                    Mobile number
                  </Label>
                  <Input
                    {...form.fieldProps("pwMobile")}
                    inputMode="numeric"
                    id="pwMobile"
                    className="mt-1.5"
                    value={pwMobile}
                    maxLength={10}
                    onChange={(e) => setPwMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                  <FieldError message={form.error("pwMobile")} />
                </div>
                <div>
                  <Label htmlFor="pw" required>
                    Password
                  </Label>
                  <PasswordInput
                    {...form.fieldProps("pw")}
                    id="pw"
                    className="mt-1.5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <FieldError message={form.error("pw")} />
                </div>
                <Button
                  className="w-full"
                  disabled={pwLoading}
                  onClick={async () => {
                    const valid = form.check([
                      {
                        key: "pwMobile",
                        label: "Mobile number",
                        value: pwMobile,
                        valid: isMobile10,
                        message: "Enter your 10-digit mobile number",
                      },
                      { key: "pw", label: "Password", value: password },
                    ]);
                    if (!valid) return;
                    setPwLoading(true);
                    try {
                      const { token } = await authApi.restaurantLogin(
                        pwMobile,
                        password,
                        getBrowserDeviceId(),
                      );
                      if (token) setStoredAuthToken(token);
                      doLogin(await store.syncCurrentUser());
                    } catch (err) {
                      handleLoginError(err, store.resetDeviceRegistration);
                    } finally {
                      setPwLoading(false);
                    }
                  }}
                >
                  <LogIn className="size-4" /> {pwLoading ? "Signing in…" : "Login"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-primary"
                  onClick={() => setForgot(true)}
                >
                  Forgot Password?
                </button>
              </>
            ) : null}

            {tab === "pin" ? (
              <>
                <div>
                  <Label htmlFor="pinMobile" required>
                    Mobile number
                  </Label>
                  <Input
                    {...form.fieldProps("pinMobile")}
                    inputMode="numeric"
                    id="pinMobile"
                    className="mt-1.5"
                    value={pinMobile}
                    maxLength={10}
                    onChange={(e) => setPinMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                  <FieldError message={form.error("pinMobile")} />
                </div>
                <div>
                  <Label htmlFor="pin" required>
                    Quick login PIN
                  </Label>
                  <PasswordInput
                    {...form.fieldProps("pin")}
                    inputMode="numeric"
                    id="pin"
                    className="mt-1.5 num text-center text-lg tracking-[0.6em]"
                    value={pin}
                    maxLength={6}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                  />
                  <FieldError message={form.error("pin")} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Verified against the live BillerPe backend (uat-backend) - not demo data.
                  </p>
                </div>
                <Button
                  className="w-full"
                  disabled={pinLoading}
                  onClick={async () => {
                    const valid = form.check([
                      {
                        key: "pinMobile",
                        label: "Mobile number",
                        value: pinMobile,
                        valid: isMobile10,
                        message: "Enter your 10-digit mobile number",
                      },
                      {
                        key: "pin",
                        label: "PIN",
                        value: pin,
                        valid: (v) => /^\d{4,6}$/.test(String(v ?? "")),
                        message: "Enter your 4-6 digit PIN",
                      },
                    ]);
                    if (!valid) return;
                    setPinLoading(true);
                    try {
                      const { token } = await authApi.pinLogin(
                        pinMobile,
                        pin,
                        getBrowserDeviceId(),
                      );
                      if (token) setStoredAuthToken(token);
                      doLogin(await store.syncCurrentUser());
                    } catch (err) {
                      handleLoginError(err, store.resetDeviceRegistration);
                    } finally {
                      setPinLoading(false);
                    }
                  }}
                >
                  <KeyRound className="size-4" /> {pinLoading ? "Checking…" : "Unlock"}
                </Button>
              </>
            ) : null}
          </fieldset>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Offline login is supported for up to {store.maxOfflineDays} days on a registered device.
          </p>
        </motion.div>
      </div>

      <Dialog open={forgot} onOpenChange={setForgot}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot your password?</DialogTitle>
            <DialogDescription>
              Passwords are reset by your outlet's owner or admin.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Staff:</span> ask the owner/admin to open{" "}
              <span className="font-medium text-foreground">Users</span>, edit your account and set
              a new password (or PIN).
            </li>
            <li>
              <span className="text-foreground">Owner:</span> sign in with your quick login PIN, or
              contact BillerPe support to reset the cloud login.
            </li>
          </ul>
          <DialogFooter>
            <Button onClick={() => setForgot(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
