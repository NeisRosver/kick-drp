import { invoke } from "@tauri-apps/api/core";

export async function setKickPresence(channelName: string, title?: string, category?: string) {
  await invoke("discord_set_streaming", {
    payload: {
      channel_name: channelName,
      stream_title: title ?? "Watching Kick stream",
      stream_category: category ?? "",
      stream_url: `https://kick.com/${channelName}`,
    },
  });
}

export async function setIdlePresence() {
  await invoke("discord_set_idle");
}

export async function clearPresence() {
  await invoke("discord_clear");
}