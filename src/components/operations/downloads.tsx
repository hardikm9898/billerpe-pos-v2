import QRCode from "qrcode";
import { Download, MonitorDown, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/kit";
import { Notice } from "@/components/operations/shared";
import { Button } from "@/components/ui/button";
import { ApiError, EXE_BASE_URL, appDownloadsApi, type RawAppDownload } from "@/lib/api";
import { cn } from "@/lib/utils";

/* =============== Apps & Downloads (owner decision 2026-10-01) ===============
 * The newest local server installer and Captain App, published on the
 * BillerPe server and handed out by this outlet's local server
 * (billerpe-local-exe controller/appDownloads.js). A phone on the outlet
 * Wi-Fi scans the QR code and downloads the app straight from this PC. */

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

type Info = {
  exeVersion: string;
  downloads: RawAppDownload[];
  lanUrls: string[];
  problem?: string;
};

export function DownloadsSection() {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setInfo(await appDownloadsApi.list());
    } catch (err) {
      setInfo({
        exeVersion: "",
        downloads: [],
        lanUrls: [],
        problem: err instanceof ApiError ? err.message : "Could not load downloads",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const installer = info?.downloads.find((d) => d.app === "exe-installer");
  const captain = info?.downloads.find((d) => d.app === "captain-app");

  return (
    <div className="space-y-4">
      {info?.problem ? (
        <Notice
          tone="warning"
          title="Downloads are not available right now"
          action={
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Try again
            </Button>
          }
        >
          {info.problem}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="BillerPe Local Server"
          description="The installer for this outlet's server PC"
          bodyClassName="p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <MonitorDown className="size-5" />
            </span>
            <div className="min-w-0 text-sm">
              <p>
                This PC runs <span className="num font-semibold">{info?.exeVersion || "—"}</span>
                {installer ? (
                  <>
                    {" "}
                    · newest <span className="num font-semibold">{installer.version}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                For a new PC, a reinstall, or a PC on a version older than 1.1.0. Version 1.1.0 and
                later update themselves at night - no download needed. Installing keeps all data.
              </p>
            </div>
          </div>
          <DownloadButton app="exe-installer" item={installer} label="Download installer" />
        </SectionCard>

        <SectionCard
          title="BillerPe Captain App"
          description="Android app for captains and waiters"
          bodyClassName="p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0 text-sm">
              <p>
                Newest <span className="num font-semibold">{captain ? captain.version : "—"}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Scan the QR code with the phone's camera while the phone is on this outlet's Wi-Fi.
                Download, then allow "Install unknown apps" if Android asks. Installing over the old
                app keeps the phone signed in to this outlet.
              </p>
            </div>
          </div>
          {captain ? <CaptainQr lanUrls={info?.lanUrls ?? []} /> : null}
          <DownloadButton
            app="captain-app"
            item={captain}
            label="Download APK on this PC"
            variant="outline"
          />
        </SectionCard>
      </div>
    </div>
  );
}

function DownloadButton({
  app,
  item,
  label,
  variant = "default",
}: {
  app: RawAppDownload["app"];
  item: RawAppDownload | undefined;
  label: string;
  variant?: "default" | "outline";
}) {
  const [busy, setBusy] = useState(false);
  if (!item) {
    return <p className="text-xs text-muted-foreground">Not published yet.</p>;
  }
  return (
    <Button
      variant={variant}
      disabled={busy}
      data-download={app}
      onClick={async () => {
        setBusy(true);
        try {
          const link = await appDownloadsApi.link(app);
          // A plain link: the browser saves the file itself (the link's
          // token is the permission - billerpe-local-exe appDownloads.js).
          const a = document.createElement("a");
          a.href = `${EXE_BASE_URL}${link.path}`;
          a.download = item.fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast.success(`Downloading ${item.fileName}`, {
            description: "The first download on this PC can take a minute.",
          });
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Could not start the download");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-4" /> {label} · {mb(item.size)}
    </Button>
  );
}

function CaptainQr({ lanUrls }: { lanUrls: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [expires, setExpires] = useState(30);

  const refresh = async () => {
    setProblem(null);
    try {
      const link = await appDownloadsApi.link("captain-app");
      setUrls(link.lanUrls);
      setExpires(link.expiresInMinutes);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not make the QR code");
    }
  };
  useEffect(() => {
    void refresh();
    // A fresh link before the old one expires, while the page stays open.
    const t = setInterval(() => void refresh(), 20 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const url = urls[pick] ?? urls[0];
  useEffect(() => {
    if (!url) return setImg(null);
    void QRCode.toDataURL(url, { width: 360, margin: 2 }).then(setImg);
  }, [url]);

  if (problem) return <p className="text-xs text-destructive">{problem}</p>;
  if (!lanUrls.length) {
    return (
      <p className="text-xs text-muted-foreground">
        This PC has no network address a phone can reach - connect it to the outlet Wi-Fi / router.
      </p>
    );
  }
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-border p-3"
      data-captain-qr
    >
      {img ? (
        <img src={img} alt="QR code to download the Captain App" className="size-44 rounded-lg" />
      ) : (
        <div className="size-44 animate-pulse rounded-lg bg-surface-muted" />
      )}
      <p
        className="num break-all text-center text-[11px] text-muted-foreground"
        data-captain-qr-url
      >
        {url}
      </p>
      {urls.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setPick(i)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                i === pick ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {new URL(u).hostname}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-center text-[11px] text-muted-foreground">
        Works for {expires} minutes (renews while this page is open). If the phone can't open it,
        try another address above.
      </p>
    </div>
  );
}
