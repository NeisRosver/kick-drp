// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod mods;

use mods::discord::DiscordPresence;
use mods::settings::{get_settings, save_settings};
use serde::Deserialize;
use mods::kick::get_kick_stream;
use mods::logger::frontend_log;

#[derive(Debug, Deserialize)]
struct StreamPresencePayload {
    channel_name: String,
    stream_title: Option<String>,
    stream_category: Option<String>,
    stream_url: Option<String>,
    stream_thumbnail: Option<String>,
    stream_started_at: Option<String>,
}

#[tauri::command]
fn discord_connect(
    app: tauri::AppHandle,
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.connect(&app)
}

#[tauri::command]
fn discord_set_idle(
    app: tauri::AppHandle,
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.set_idle(&app)
}

#[tauri::command]
fn discord_set_streaming(
    app: tauri::AppHandle,
    presence: tauri::State<'_, DiscordPresence>,
    payload: StreamPresencePayload,
) -> Result<(), String> {
    presence.set_streaming(
        &app,
        &payload.channel_name,
        payload.stream_title.as_deref(),
        payload.stream_category.as_deref(),
        payload.stream_url.as_deref(),
        payload.stream_thumbnail.as_deref(),
        payload.stream_started_at.as_deref(),
    )
}

#[tauri::command]
fn discord_clear(
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.clear()
}


#[tauri::command]
fn discord_enable(
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.enable()
}

#[tauri::command]
fn discord_disable(
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.disable()
}

#[tauri::command]
fn discord_status(
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<bool, String> {
    Ok(presence.is_enabled())
}

#[tauri::command]
fn discord_presence_status(
    presence: tauri::State<'_, DiscordPresence>,
) -> Result<mods::discord::DiscordPresenceStatus, String> {
    presence.status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            mods::logger::init_logger(app.handle())?;
            log::info!("Application started");
            Ok(())
        })
        .manage(DiscordPresence::new())
        .invoke_handler(tauri::generate_handler![
            discord_connect,
            discord_set_idle,
            discord_set_streaming,
            discord_clear,
            discord_enable,
            discord_disable,
            discord_status,
            discord_presence_status,
            get_settings,
            save_settings,
            get_kick_stream,
            frontend_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}