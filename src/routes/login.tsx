import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Fingerprint, KeyRound, LogIn, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { RESTAURANT } from "@/mock/data";
import { useStore } from "@/mock/store";
import { cn } from "@/lib/utils";
import { authApi, ApiError } from "@/lib/api";

function getDeviceId() {
  if (typeof window === "undefined") return "server";
  const key = "billerpe.deviceId";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
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

  const registered = store.deviceRegistered;

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

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-sidebar-accent-foreground">BillerPe</p>
            <p className="text-xs opacity-70">Restaurant Point of Sale</p>
          </div>
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
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-5" />
            </span>
            <p className="font-semibold">BillerPe</p>
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
                    One-time step. Registers Counter POS · 192.168.1.14 to this outlet.
                  </p>
                </div>
              </div>
              <Button className="mt-3 w-full" onClick={store.registerDevice}>
                <ShieldCheck className="size-4" /> Register Device
              </Button>
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
                  <Input
                    id="pw"
                    type="password"
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
                      await authApi.restaurantLogin(pwMobile, password, getDeviceId());
                      doLogin(await store.syncCurrentUser());
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : "Login failed");
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
                  <Input
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
                      await authApi.pinLogin(pinMobile, pin, getDeviceId());
                      doLogin(await store.syncCurrentUser());
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : "Login failed");
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
