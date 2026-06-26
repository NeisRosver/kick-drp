import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
  kick_channel: string;
  kick_client_id: string | null;
  discord_client_id: number | null;
  update_interval_seconds: number;
  auto_start: boolean;
};

export async function getConfig() {
  return await invoke<AppConfig>("get_config");
}

export async function saveConfig(config: AppConfig) {
  return await invoke<AppConfig>("save_config", { config });
}