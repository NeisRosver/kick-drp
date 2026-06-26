import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  LuEye,
  LuEyeOff,
  LuExternalLink,
  LuGamepad2,
  LuKeyRound,
  LuLoader,
  LuSave,
  LuShield,
  LuTv,
} from "react-icons/lu";

type AppConfig = {
  kick_channel: string;
  kick_client_id: string | null;
  kick_client_secret: string | null;
  discord_client_id: string | null;
  update_interval_seconds: number;
  auto_start: boolean;
};

const DEFAULT_CONFIG: AppConfig = {
  kick_channel: "",
  kick_client_id: null,
  kick_client_secret: null,
  discord_client_id: null,
  update_interval_seconds: 20,
  auto_start: false,
};

export default function SettingsPage() {
  const [channel, setChannel] = useState("");
  const [discordClientId, setDiscordClientId] = useState("");
  const [kickClientId, setKickClientId] = useState("");
  const [kickClientSecret, setKickClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        setIsLoading(true);
        setError(null);

        const config = await invoke<AppConfig>("get_settings");

        if (!isMounted) return;

        setChannel(config.kick_channel ?? "");
        setDiscordClientId(config.discord_client_id ?? "");
        setKickClientId(config.kick_client_id ?? "");
        setKickClientSecret(config.kick_client_secret ?? "");
      } catch (error) {
        if (!isMounted) return;
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        await frontendLog("error", `Failed to load settings: ${errorMessage}`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave() {
    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);

      const config: AppConfig = {
        ...DEFAULT_CONFIG,
        kick_channel: channel.trim(),
        discord_client_id: toNullableString(discordClientId),
        kick_client_id: toNullableString(kickClientId),
        kick_client_secret: toNullableString(kickClientSecret),
      };

      const savedConfig = await invoke<AppConfig>("save_settings", { settings: config });

      setChannel(savedConfig.kick_channel ?? "");
      setDiscordClientId(savedConfig.discord_client_id ?? "");
      setKickClientId(savedConfig.kick_client_id ?? "");
      setKickClientSecret(savedConfig.kick_client_secret ?? "");
      setMessage("Settings saved successfully.");
      await frontendLog("info", "Settings saved successfully");
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setError(errorMessage);
      await frontendLog("error", `Failed to save settings: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(83,252,24,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,180,255,0.08),transparent_35%),#0d1015] text-white">
      <div className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full bg-[#53fc18]/10 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-[#00b4ff]/10 blur-[110px]" />

      <div className="relative z-10 flex h-full flex-col p-7">
        <header>
          <h1 className="text-3xl font-bold">
            Settings <span className="text-[#53fc18]">Config</span>
          </h1>
          <p className="mt-2 max-w-[430px] text-sm leading-6 text-white/60">
            Configure your Kick channel and API credentials used by Kick DRP to
            update Discord Rich Presence.
          </p>
        </header>

        {(message || error) && (
          <div
            className={[
              "mt-4 rounded-xl border px-4 py-3 text-sm",
              error
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-[#53fc18]/30 bg-[#53fc18]/10 text-[#53fc18]",
            ].join(" ")}
          >
            {error ?? message}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#111820]/80 p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="grid grid-cols-2 gap-4">
            <InputField
              icon={<LuTv size={17} />}
              label="Kick Channel"
              placeholder="xqc"
              value={channel}
              onChange={setChannel}
              disabled={isLoading || isSaving}
            />

            <InputField
              icon={<LuGamepad2 size={17} />}
              label="Discord Client ID"
              placeholder="123456789012345678"
              value={discordClientId}
              onChange={setDiscordClientId}
              disabled={isLoading || isSaving}
            />

            <InputField
              icon={<LuKeyRound size={17} />}
              label="Kick Client ID"
              placeholder="Kick OAuth Client ID"
              value={kickClientId}
              onChange={setKickClientId}
              disabled={isLoading || isSaving}
            />

            <InputField
              icon={<LuShield size={17} />}
              label="Kick Client Secret"
              placeholder="Kick OAuth Client Secret"
              value={kickClientSecret}
              onChange={setKickClientSecret}
              type={showSecret ? "text" : "password"}
              disabled={isLoading || isSaving}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowSecret((value) => !value)}
                  className="text-white/40 hover:text-white"
                  disabled={isLoading || isSaving}
                >
                  {showSecret ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              }
            />
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <HelpCard
            title="Discord Application"
            description="Create a Discord app and copy its Application ID."
            buttonLabel="Open Discord Portal"
            url="https://discord.com/developers/applications"
          />

          <HelpCard
            title="Kick API"
            description="Create or manage your Kick API credentials."
            buttonLabel="Open Kick Developers"
            url="https://kick.com/settings/developer"
          />
        </section>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="flex items-center gap-2 rounded-xl bg-[#53fc18] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#6eff4f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <LuLoader size={17} className="animate-spin" /> : <LuSave size={17} />}
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

type FrontendLogLevel = "debug" | "info" | "warn" | "error";

async function frontendLog(level: FrontendLogLevel, message: string) {
  try {
    await invoke("frontend_log", {
      level,
      target: "react",
      message,
    });
  } catch (error) {
    console.error("Failed to write frontend log:", error);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toNullableString(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function InputField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rightElement,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  rightElement?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/45">
        <span className="text-[#53fc18]">{icon}</span>
        {label}
      </span>

      <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-[#53fc18]/50">
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {rightElement}
      </div>
    </label>
  );
}

function HelpCard({
  title,
  description,
  buttonLabel,
  url,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  url: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 min-h-[40px] text-xs leading-5 text-white/55">
        {description}
      </p>

      <button
        type="button"
        onClick={() => openUrl(url)}
        className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.07] hover:text-white"
      >
        {buttonLabel}
        <LuExternalLink size={13} className="text-white/40" />
      </button>
    </div>
  );
}
