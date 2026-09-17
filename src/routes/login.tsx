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
import { RESTAURANT } from "@/mock/data";
import { useStore } from "@/mock/store";
import { cn } from "@/lib/utils";
import {
  authApi,
  ApiError,
  checkLocalServerHealth,
  getBrowserDeviceId,
  getLocalServerIdentity,
  RegistrationCancelled,
  registerWithReplaceConfirm,
  setManualServerAddress,
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
    toast.error("This device needs to be registered again", {
      description: "The local server's data was reset - register this terminal below.",
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
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMobile, setPinMobile] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pwMobile, setPwMobile] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [regMobile, setRegMobile] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const registered = store.deviceRegistered;

  // Architecture memo §04/Phase C: the local-server-required gate only
  // matters BEFORE this device is registered - once registered, a briefly
  // unreachable EXE is handled by the ordinary error toasts below on
  // whichever button was actually clicked, not a blocking full-page state
  // on every visit (spec §4: detection is for initial setup only, it must
  // not "unnecessarily block normal operation" afterward).
  const [serverCheck, setServerCheck] = useState<"checking" | "ok" | "unreachable">(
    registered ? "ok" : "checking",
  );

  const runServerCheck = () => {
    setServerCheck("checking");
    void checkLocalServerHealth().then((ok) => setServerCheck(ok ? "ok" : "unreachable"));
  };

  const [manualOpen, setManualOpen] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    // The exe is the single source of truth for "is this PC registered".
    // This browser's cached `billerpe.session.device` flag is only a hint
    // for the very first render: a fresh browser (or cleared storage) on an
    // already-registered exe must NOT be asked to register again, and a
    // cached "registered" flag on an exe whose data was wiped must be
    // reset. getLocalServerIdentity() returns null when the exe is
    // unreachable - deliberately a no-op, so a briefly-down exe never
    // blocks a registered device (spec §4).
    void getLocalServerIdentity().then((identity) => {
      if (!identity) {
        if (!registered) setServerCheck("unreachable");
        return;
      }
      setServerCheck("ok");
      if (identity.registered && !registered) store.registerDevice();
      if (!identity.registered && registered) store.resetDeviceRegistration();
    });
    // Only ever needs to run once, on first mount - `registered` flipping
    // true/false mid-session (right after registering, or after the reset
    // above fires) should not re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = (realUserId: string | null) => {
    if (!realUserId) {
      toast.error("Could not identify the logged-in account");
      return;
    }
    store.login(realUserId);
    toast.success("Welcome back", { description: RESTAURANT.name });
    navigate({ to: "/table-grid" });
  };

  const tabs: { id: Tab; label: string; icon: typeof LogIn }[] = [
    { id: "password", label: "Password", icon: LogIn },
    { id: "pin", label: "PIN", icon: KeyRound },
  ];

  if (serverCheck === "unreachable") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-raised">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <ServerCrash className="size-7 text-destructive" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            BillerPe Local Server required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This terminal can't reach the BillerPe Local Server on this network. It must be
            installed and running on this outlet's server PC before setup can continue - Web POS
            never talks to the cloud directly for restaurant operations.
          </p>
          <Button className="mt-6 w-full" onClick={runServerCheck}>
            Try again
          </Button>

          {!manualOpen ? (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-primary"
              onClick={() => setManualOpen(true)}
            >
              Enter the server's address manually
            </button>
          ) : (
            <div className="mt-4 space-y-2 text-left">
              <Label htmlFor="manualAddress">Server PC's local address</Label>
              <p className="text-xs text-muted-foreground">
                Found on the server PC's own dashboard, under "Network" (e.g. 192.168.1.12:4100).
              </p>
              <Input
                id="manualAddress"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="192.168.1.12:4100"
              />
              <Button
                className="w-full"
                disabled={manualLoading || !manualAddress}
                onClick={async () => {
                  setManualLoading(true);
                  const ok = await setManualServerAddress(manualAddress);
                  setManualLoading(false);
                  if (ok) {
                    toast.success("Connected to the local server");
                    setServerCheck("ok");
                  } else {
                    toast.error("Could not reach that address");
                  }
                }}
              >
                {manualLoading ? "Connecting…" : "Connect"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (serverCheck === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Looking for the BillerPe Local Server…</p>
      </div>
    );
  }

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
        <p className="text-xs opacity-60">
          {RESTAURANT.name} · {RESTAURANT.outlet}
        </p>
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
                  <Label htmlFor="regMobile">Owner/admin mobile number</Label>
                  <Input
                    id="regMobile"
                    className="mt-1.5"
                    value={regMobile}
                    maxLength={10}
                    onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                </div>
                <div>
                  <Label htmlFor="regPassword">Owner/admin password</Label>
                  <PasswordInput
                    id="regPassword"
                    className="mt-1.5"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={regLoading || !regMobile || !regPassword}
                  onClick={async () => {
                    setRegLoading(true);
                    try {
                      const { pulled } = await registerWithReplaceConfirm(regMobile, regPassword);
                      store.registerDevice();
                      const menuCount = pulled?.["menu"] ?? 0;
                      const tableCount = pulled?.["table"] ?? 0;
                      toast.success("Device registered", {
                        description: `Pulled ${menuCount} menu item(s), ${tableCount} table(s) - sign in below.`,
                      });
                    } catch (err) {
                      if (err instanceof RegistrationCancelled) return;
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
                  <Label htmlFor="pwMobile">Mobile number</Label>
                  <Input
                    id="pwMobile"
                    className="mt-1.5"
                    value={pwMobile}
                    maxLength={10}
                    onChange={(e) => setPwMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                </div>
                <div>
                  <Label htmlFor="pw">Password</Label>
                  <PasswordInput
                    id="pw"
                    className="mt-1.5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={pwLoading || !pwMobile || !password}
                  onClick={async () => {
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
                  onClick={() => {
                    setForgot(true);
                    setStep(1);
                  }}
                >
                  Forgot Password?
                </button>
              </>
            ) : null}

            {tab === "pin" ? (
              <>
                <div>
                  <Label htmlFor="pinMobile">Mobile number</Label>
                  <Input
                    id="pinMobile"
                    className="mt-1.5"
                    value={pinMobile}
                    maxLength={10}
                    onChange={(e) => setPinMobile(e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                  />
                </div>
                <div>
                  <Label htmlFor="pin">Quick login PIN</Label>
                  <PasswordInput
                    id="pin"
                    className="mt-1.5 num text-center text-lg tracking-[0.6em]"
                    value={pin}
                    maxLength={6}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Verified against the live BillerPe backend (uat-backend) - not demo data.
                  </p>
                </div>
                <Button
                  className="w-full"
                  disabled={pinLoading || !pinMobile || !pin}
                  onClick={async () => {
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
            <DialogTitle>Reset password — step {step} of 3</DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Enter your registered mobile number."
                : step === 2
                  ? "Enter the 6-digit verification code."
                  : "Choose a new password."}
            </DialogDescription>
          </DialogHeader>
          {step === 1 ? <Input defaultValue="9099001122" /> : null}
          {step === 2 ? <Input defaultValue="123456" className="num tracking-[0.4em]" /> : null}
          {step === 3 ? <Input type="password" placeholder="New password" /> : null}
          <DialogFooter>
            <Button
              onClick={() => {
                if (step < 3) {
                  setStep(step + 1);
                  return;
                }
                setForgot(false);
                setStep(1);
                toast.success("Password updated", { description: "You can sign in now." });
              }}
            >
              {step < 3 ? "Continue" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
