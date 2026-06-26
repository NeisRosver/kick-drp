import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LuBug,
  LuExternalLink,
  LuGithub,
  LuActivity,
  LuFileText,
  LuRefreshCw,
} from "react-icons/lu";
import { SiRust, SiReact, SiTauri, SiDiscord, SiKick } from "react-icons/si";
import { openUrl } from "@tauri-apps/plugin-opener";

type AppSettings = {
  kick_channel: string;
  discord_client_id: string | null;
  kick_client_id: string | null;
  kick_client_secret: string | null;
  update_interval_seconds: number;
  auto_start: boolean;
};

type DiscordPresenceStatus = {
  enabled: boolean;
  connected: boolean;
  ready: boolean;
  active: boolean;
  mode: string;
  channel_name?: string | null;
  title?: string | null;
  category?: string | null;
  updated_at?: number | null;
};

const STATUS_REFRESH_MS = 20_000;

type KickStreamInfo = {
  channel: string;
  channel_id?: number | null;
  broadcaster_user_id?: number | null;
  title?: string | null;
  category?: string | null;
  thumbnail?: string | null;
  viewer_count?: number | null;
  started_at?: string | null;
  is_live: boolean;
};

enum Status {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  ERROR = "error",
  IDLE = "idle",
  CHECKING = "checking",
  DISABLED = "disabled",
}

type AboutStatus = {
  discord: Status;
  kick: Status;
  watcher: Status;
};

const DEFAULT_STATUS: AboutStatus = {
  discord: Status.IDLE,
  kick: Status.IDLE,
  watcher: Status.IDLE,
};

export default function AboutPage() {
  const [status, setStatus] = useState<AboutStatus>(DEFAULT_STATUS);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stream, setStream] = useState<KickStreamInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("Never");
  const [error, setError] = useState<string | null>(null);

  async function frontendLog(
    level: "info" | "warn" | "error" | "debug",
    message: string,
  ) {
    try {
      await invoke("frontend_log", {
        level,
        target: "react",
        message,
      });
    } catch {
      // Ignore logger errors in the UI.
    }
  }

  async function loadAboutStatus() {
    setLoading(true);
    setError(null);

    const nextStatus: AboutStatus = {
      discord: Status.CHECKING,
      kick: Status.CHECKING,
      watcher: Status.CHECKING,
    };

    setStatus(nextStatus);

    try {
      const loadedSettings = await invoke<AppSettings>("get_settings");
      setSettings(loadedSettings);

      try {
        const discordStatus = await invoke<DiscordPresenceStatus>("discord_presence_status");

        if (!loadedSettings.discord_client_id?.trim()) {
          nextStatus.discord = Status.DISCONNECTED;
        } else if (!discordStatus.enabled) {
          nextStatus.discord = Status.DISABLED;
        } else if (discordStatus.active) {
          nextStatus.discord = Status.CONNECTED;
        } else if (discordStatus.connected && discordStatus.ready) {
          nextStatus.discord = Status.IDLE;
        } else if (discordStatus.connected && !discordStatus.ready) {
          nextStatus.discord = Status.CHECKING;
        } else {
          nextStatus.discord = Status.DISCONNECTED;
        }
      } catch (discordError) {
        const message = getErrorMessage(discordError);

        nextStatus.discord = loadedSettings.discord_client_id
          ? Status.ERROR
          : Status.DISCONNECTED;

        await frontendLog("error", `Failed to load Discord Presence status: ${message}`);
      }

      const hasKickCredentials =
        Boolean(loadedSettings.kick_channel?.trim()) &&
        Boolean(loadedSettings.kick_client_id?.trim()) &&
        Boolean(loadedSettings.kick_client_secret?.trim());

      if (!hasKickCredentials) {
        nextStatus.kick = Status.DISCONNECTED;
        nextStatus.watcher = Status.IDLE;
        setStream(null);
        setStatus({ ...nextStatus });
        setLastUpdated(new Date().toLocaleTimeString());
        await frontendLog("warn", "About status loaded with missing Kick settings");
        return;
      }

      try {
        const loadedStream = await invoke<KickStreamInfo>("get_kick_stream");
        setStream(loadedStream);

        nextStatus.kick = Status.CONNECTED;
        nextStatus.watcher = loadedStream.is_live ? Status.CONNECTED : Status.IDLE;

        await frontendLog("info", "About status loaded successfully");
      } catch (kickError) {
        const message = getErrorMessage(kickError);

        nextStatus.kick = Status.ERROR;
        nextStatus.watcher = Status.ERROR;
        setStream(null);
        setError(message);

        await frontendLog("error", `Failed to load About Kick status: ${message}`);
      }

      setStatus({ ...nextStatus });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (settingsError) {
      const message = getErrorMessage(settingsError);

      setSettings(null);
      setStream(null);
      setError(message);
      setStatus({
        discord: Status.ERROR,
        kick: Status.ERROR,
        watcher: Status.ERROR,
      });

      await frontendLog("error", `Failed to load About settings: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAboutStatus();

    const interval = window.setInterval(() => {
      void loadAboutStatus();
    }, STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(83,252,24,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,180,255,0.08),transparent_35%),#0d1015] text-white">
      <div className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full bg-[#53fc18]/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-[#00b4ff]/10 blur-[110px]" />

      <div className="relative z-10 flex h-full flex-col p-7">
        <section className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">
              Kick <span className="text-[#53fc18]">DRP</span>
            </h1>

            <span className="mt-2 inline-flex rounded-full bg-[#53fc18]/15 px-3 py-1 text-xs font-semibold text-[#53fc18]">
              v0.2.0-tauri
            </span>

            <p className="mt-3 max-w-[330px] text-sm leading-6 text-white/65">
              Desktop application that updates your Discord Rich Presence based
              on Kick streams.
            </p>
          </div>

          <button
            type="button"
            onClick={loadAboutStatus}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/65 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LuRefreshCw className={loading ? "animate-spin" : ""} size={14} />
            Refresh
          </button>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-300">
            {error}
          </div>
        )}

        <section className="mt-8 grid grid-cols-2 gap-4">
          <Card title="Status">
            <StatusRow
              label="Discord"
              icon={<SiDiscord />}
              value={status.discord}
              hint={settings?.discord_client_id ? "Client ID configured" : "Client ID missing"}
            />

            <StatusRow
              label="Kick API"
              icon={<SiKick />}
              value={status.kick}
              hint={
                stream?.is_live
                  ? `Live: ${stream.channel}`
                  : settings?.kick_channel
                    ? `Channel: ${settings.kick_channel}`
                    : "Channel missing"
              }
            />

            <StatusRow
              label="Watcher"
              icon={<LuActivity />}
              value={status.watcher}
              hint={stream?.is_live ? "Stream detected" : "Waiting for stream"}
            />
          </Card>

          <Card title="Stream">
            <InfoRow label="Channel" value={stream?.channel || settings?.kick_channel || "Not configured"} />
            <InfoRow label="Category" value={stream?.category || "Unknown"} />
            <InfoRow label="Status" value={stream?.is_live ? "Live" : "Offline"} />
          </Card>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <Card title="Built with">
            <TechRow label="Rust" icon={<SiRust />} />
            <TechRow label="Tauri" icon={<SiTauri />} />
            <TechRow label="React" icon={<SiReact />} />
          </Card>

          <Card title="Details">
            <InfoRow label="Last updated" value={lastUpdated} />
            <InfoRow
              label="Update interval"
              value={
                settings
                  ? `${settings.update_interval_seconds} seconds`
                  : "Unknown"
              }
            />
            <InfoRow label="Auto start" value={settings?.auto_start ? "Enabled" : "Disabled"} />
          </Card>
        </section>

        <section className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <LinkItem
            icon={<LuGithub size={18} />}
            label="GitHub"
            url="https://github.com/NeisRosver/kick-drp"
          />
          <LinkItem
            icon={<LuBug size={18} />}
            label="Report Bug"
            url="https://github.com/NeisRosver/kick-drp/issues"
          />
          <LinkItem
            icon={<LuFileText size={18} />}
            label="License"
            url="https://raw.githubusercontent.com/NeisRosver/kick-drp/refs/heads/master/LICENSE"
          />
        </section>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111820]/80 p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: Status;
  icon: React.ReactNode;
  hint?: string;
}) {
  const current = STATUS_MAP[value];

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className={current.iconClassName}>{icon}</span>
        <div className="min-w-0">
          <span className="block truncate font-medium">{label}</span>
          {hint && <span className="block truncate text-xs text-white/35">{hint}</span>}
        </div>
      </div>

      <span className={["shrink-0", current.className].join(" ")}>
        {current.label}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/45">{label}</span>
      <span className="truncate text-right font-medium text-white/80">{value}</span>
    </div>
  );
}

function TechRow({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/75">
      <span className="text-[#53fc18]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function LinkItem({
  icon,
  label,
  url,
}: {
  icon: React.ReactNode;
  label: string;
  url: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openUrl(url)}
      className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-white/75 transition hover:bg-white/[0.06] hover:text-white"
    >
      {icon}
      <span>{label}</span>
      <LuExternalLink size={14} className="text-white/40" />
    </button>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

const STATUS_MAP: Record<
  Status,
  {
    label: string;
    className: string;
    iconClassName: string;
  }
> = {
  [Status.CONNECTED]: {
    label: "Connected",
    className: "text-[#53fc18]",
    iconClassName: "text-[#53fc18]",
  },
  [Status.DISCONNECTED]: {
    label: "Disconnected",
    className: "text-amber-500",
    iconClassName: "text-amber-500",
  },
  [Status.ERROR]: {
    label: "Error",
    className: "text-red-500",
    iconClassName: "text-red-500",
  },
  [Status.IDLE]: {
    label: "Idle",
    className: "text-gray-400",
    iconClassName: "text-gray-400",
  },
  [Status.CHECKING]: {
    label: "Checking",
    className: "text-sky-400",
    iconClassName: "text-sky-400",
  },
  [Status.DISABLED]: {
    label: "Disabled",
    className: "text-red-400",
    iconClassName: "text-red-400",
  },
};
