import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LuActivity,
  LuCircle,
  LuImageOff,
  LuLoader,
  LuPower,
  LuRadio,
  LuRefreshCw,
  LuTag,
  LuTv,
} from "react-icons/lu";

type PresenceStatus = "active" | "inactive" | "error" | "idle" | "disabled";

interface DiscordPresenceStatus {
  enabled: boolean;
  connected: boolean;
  ready: boolean;
  active: boolean;
  mode: string;
  channel_name?: string | null;
  title?: string | null;
  category?: string | null;
  updated_at?: number | null;
}

interface KickStreamInfo {
  channel: string;
  channel_id: number | null;
  broadcaster_user_id: number | null;
  title: string | null;
  category: string | null;
  thumbnail: string | null;
  viewer_count: number | null;
  started_at: string | null;
  is_live: boolean;
}

const STREAM_REFRESH_MS = 20_000;
const THUMBNAIL_REFRESH_MS = 300_000;

type ThumbnailCache = {
  originalUrl: string | null;
  cachedUrl: string | null;
  lastRefresh: number;
};

function cacheBustUrl(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

function getCachedThumbnailUrl(
  rawUrl: string | null,
  cache: MutableRefObject<ThumbnailCache>,
) {
  if (!rawUrl || !rawUrl.trim()) {
    cache.current = {
      originalUrl: null,
      cachedUrl: null,
      lastRefresh: 0,
    };

    return null;
  }

  const now = Date.now();
  const thumbnailChanged = cache.current.originalUrl !== rawUrl;
  const thumbnailExpired = now - cache.current.lastRefresh >= THUMBNAIL_REFRESH_MS;

  if (thumbnailChanged || thumbnailExpired || !cache.current.cachedUrl) {
    cache.current = {
      originalUrl: rawUrl,
      cachedUrl: cacheBustUrl(rawUrl),
      lastRefresh: now,
    };
  }

  return cache.current.cachedUrl;
}

const DEFAULT_STREAM: KickStreamInfo = {
  channel: "No channel selected",
  channel_id: null,
  broadcaster_user_id: null,
  title: "No stream detected",
  category: "Unknown category",
  thumbnail: null,
  viewer_count: null,
  started_at: null,
  is_live: false,
};

const PRESENCE_STATUS: Record<
  PresenceStatus,
  {
    label: string;
    className: string;
    dotClassName: string;
  }
> = {
  active: {
    label: "Active",
    className: "text-[#53fc18]",
    dotClassName: "bg-[#53fc18]",
  },
  inactive: {
    label: "Inactive",
    className: "text-amber-500",
    dotClassName: "bg-amber-500",
  },
  error: {
    label: "Error",
    className: "text-red-500",
    dotClassName: "bg-red-500",
  },
  idle: {
    label: "Idle",
    className: "text-gray-400",
    dotClassName: "bg-gray-400",
  },
  disabled: {
    label: "Disabled",
    className: "text-red-400",
    dotClassName: "bg-red-400",
  },
};

async function frontendLog(
  level: "info" | "warn" | "error",
  message: string,
) {
  try {
    await invoke("frontend_log", {
      level,
      target: "react",
      message,
    });
  } catch {
    // Avoid throwing from the logger itself.
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default function HomePage() {
  const [stream, setStream] = useState<KickStreamInfo>(DEFAULT_STREAM);
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("idle");
  const [presenceEnabled, setPresenceEnabled] = useState(true);
  const [isTogglingPresence, setIsTogglingPresence] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const thumbnailCache = useRef<ThumbnailCache>({
    originalUrl: null,
    cachedUrl: null,
    lastRefresh: 0,
  });
  const loadingRef = useRef(false);

  const status = PRESENCE_STATUS[presenceStatus];

  async function refreshPresenceStatus() {
    try {
      const discordStatus = await invoke<DiscordPresenceStatus>(
        "discord_presence_status",
      );

      setPresenceEnabled(discordStatus.enabled);

      if (!discordStatus.enabled) {
        setPresenceStatus("disabled");
      } else if (discordStatus.active) {
        setPresenceStatus("active");
      } else if (discordStatus.connected && discordStatus.ready) {
        setPresenceStatus("idle");
      }
    } catch (error) {
      const message = getErrorMessage(error);
      await frontendLog("error", `Failed to load Discord Presence status: ${message}`);
    }
  }

  async function togglePresence() {
    if (isTogglingPresence) {
      return;
    }

    setIsTogglingPresence(true);

    try {
      if (presenceEnabled) {
        await invoke("discord_disable");
        setPresenceEnabled(false);
        setPresenceStatus("disabled");
        await frontendLog("info", "Discord Rich Presence disabled from Home");
      } else {
        await invoke("discord_enable");
        setPresenceEnabled(true);
        await frontendLog("info", "Discord Rich Presence enabled from Home");
        await loadStream();
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setPresenceStatus("error");
      await frontendLog("error", `Failed to toggle Discord Rich Presence: ${message}`);
    } finally {
      setIsTogglingPresence(false);
    }
  }

  async function loadStream() {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const loadedStream = await invoke<KickStreamInfo>("get_kick_stream");
      const uiThumbnail = getCachedThumbnailUrl(loadedStream.thumbnail, thumbnailCache);
      const nextStream = {
        ...loadedStream,
        thumbnail: uiThumbnail,
      };

      setStream(nextStream);

      try {
        const discordStatus = await invoke<DiscordPresenceStatus>(
          "discord_presence_status",
        );

        setPresenceEnabled(discordStatus.enabled);

        if (!discordStatus.enabled) {
          setPresenceStatus("disabled");
          return;
        }

        if (loadedStream.is_live) {
          await invoke("discord_set_streaming", {
            payload: {
              channel_name: loadedStream.channel,
              stream_title: loadedStream.title,
              stream_category: loadedStream.category,
              stream_url: `https://kick.com/${loadedStream.channel}`,
              stream_thumbnail: loadedStream.thumbnail,
              stream_started_at: loadedStream.started_at,
            },
          });

          setPresenceStatus("active");
        } else {
          await invoke("discord_set_idle");
          setPresenceStatus("idle");
        }
      } catch (presenceError) {
        const message = getErrorMessage(presenceError);

        setPresenceStatus("error");
        await frontendLog("error", `Failed to update Discord Presence: ${message}`);
      }
    } catch (streamError) {
      const message = getErrorMessage(streamError);

      setErrorMessage(message);
      setPresenceStatus("error");
      await frontendLog("error", `Failed to load Kick stream: ${message}`);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshPresenceStatus();
    void loadStream();

    const interval = window.setInterval(() => {
      void loadStream();
    }, STREAM_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(83,252,24,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,180,255,0.08),transparent_35%),#0d1015] text-white">
      <div className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full bg-[#53fc18]/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-[#00b4ff]/10 blur-[110px]" />

      <div className="relative z-10 flex h-full flex-col p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Stream <span className="text-[#53fc18]">Overview</span>
            </h1>
            <p className="mt-2 max-w-[420px] text-sm leading-6 text-white/60">
              Current Kick stream information used to update Discord Rich
              Presence.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadStream()}
              disabled={isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh stream data"
            >
              {isLoading ? (
                <LuLoader size={16} className="animate-spin" />
              ) : (
                <LuRefreshCw size={16} />
              )}
            </button>

            <button
              type="button"
              onClick={() => void togglePresence()}
              disabled={isTogglingPresence}
              className={[
                "flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                presenceEnabled
                  ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                  : "border-[#53fc18]/20 bg-[#53fc18]/10 text-[#53fc18] hover:bg-[#53fc18]/15",
              ].join(" ")}
              title={
                presenceEnabled
                  ? "Stop Rich Presence"
                  : "Start Rich Presence"
              }
            >
              {isTogglingPresence ? (
                <LuLoader size={15} className="animate-spin" />
              ) : (
                <LuPower size={15} />
              )}
              {presenceEnabled ? "Stop" : "Start"}
            </button>

            <div
              className={[
                "flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold",
                status.className,
              ].join(" ")}
            >
              <span
                className={["h-2 w-2 rounded-full", status.dotClassName].join(
                  " ",
                )}
              />
              {status.label}
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#111820]/80 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="relative h-[210px] w-full overflow-hidden bg-white/[0.025]">
            {stream.thumbnail ? (
              <img
                src={stream.thumbnail}
                alt={stream.title ?? "Kick stream thumbnail"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/35">
                <LuImageOff size={42} />
                <span className="text-sm">No thumbnail available</span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0d1015] via-[#0d1015]/75 to-transparent p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#53fc18]">
                <LuTv size={16} />
                {stream.channel}
              </div>

              <h2 className="mt-2 line-clamp-2 text-2xl font-bold leading-tight">
                {stream.title || "No stream detected"}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 p-5">
            <InfoCard
              icon={<LuTv size={18} />}
              label="Channel"
              value={stream.channel}
            />

            <InfoCard
              icon={<LuTag size={18} />}
              label="Category"
              value={stream.category || "Unknown category"}
            />

            <InfoCard
              icon={<LuActivity size={18} />}
              label="Presence"
              value={status.label}
              valueClassName={status.className}
            />
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#53fc18]/10 text-[#53fc18]">
              <LuRadio size={20} />
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Discord Presence Status
              </h3>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Kick DRP will update Discord when a valid stream is detected.
              </p>
            </div>

            <div
              className={[
                "ml-auto flex items-center gap-2 text-sm font-medium",
                status.className,
              ].join(" ")}
            >
              <LuCircle size={10} fill="currentColor" />
              {status.label}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  valueClassName = "text-white",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/40">
        <span className="text-[#53fc18]">{icon}</span>
        {label}
      </div>

      <div
        className={["mt-3 truncate text-sm font-semibold", valueClassName].join(
          " ",
        )}
      >
        {value}
      </div>
    </div>
  );
}
