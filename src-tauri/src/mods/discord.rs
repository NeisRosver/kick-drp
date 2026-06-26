use crate::mods::settings::load_settings;
use chrono::{DateTime, Utc};
use discord_presence::{models::DisplayType, Client};
use serde::Serialize;
use std::{
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread::sleep,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

const DISCORD_CONNECT_WAIT: Duration = Duration::from_secs(5);
const DISCORD_READY_POLL: Duration = Duration::from_millis(100);
const THUMBNAIL_REFRESH_INTERVAL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Default)]
struct ThumbnailState {
    original_url: Option<String>,
    cached_url: Option<String>,
    last_refresh: Option<Instant>,
}

#[derive(Debug, Clone, Default)]
struct PresenceState {
    active: bool,
    mode: String,
    channel_name: Option<String>,
    title: Option<String>,
    category: Option<String>,
    thumbnail: Option<String>,
    updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscordPresenceStatus {
    pub enabled: bool,
    pub connected: bool,
    pub ready: bool,
    pub active: bool,
    pub mode: String,
    pub channel_name: Option<String>,
    pub title: Option<String>,
    pub category: Option<String>,
    pub updated_at: Option<u64>,
}

pub struct DiscordPresence {
    enabled: Arc<AtomicBool>,
    client: Arc<Mutex<Option<Client>>>,
    client_id: Arc<Mutex<Option<u64>>>,
    started_at: u64,
    thumbnail_state: Arc<Mutex<ThumbnailState>>,
    presence_state: Arc<Mutex<PresenceState>>,
}

impl DiscordPresence {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(true)),
            client: Arc::new(Mutex::new(None)),
            client_id: Arc::new(Mutex::new(None)),
            started_at: now_unix(),
            thumbnail_state: Arc::new(Mutex::new(ThumbnailState::default())),
            presence_state: Arc::new(Mutex::new(PresenceState {
                active: false,
                mode: "idle".to_string(),
                channel_name: None,
                title: None,
                category: None,
                thumbnail: None,
                updated_at: None,
            })),
        }
    }

    pub fn enable(&self) -> Result<(), String> {
        self.enabled.store(true, Ordering::Relaxed);

        let mut state = self.presence_state.lock().map_err(|e| e.to_string())?;

        if state.mode == "disabled" {
            state.active = false;
            state.mode = "enabled".to_string();
            state.updated_at = Some(now_unix());
        }

        log::info!(target: "discord", "Discord Rich Presence enabled");

        Ok(())
    }

    pub fn disable(&self) -> Result<(), String> {
        self.enabled.store(false, Ordering::Relaxed);

        if let Err(error) = self.clear() {
            log::warn!(
                target: "discord",
                "Failed to clear Discord activity while disabling Rich Presence: {error}"
            );
        }

        self.set_presence_idle_state("disabled")?;

        log::info!(target: "discord", "Discord Rich Presence disabled");

        Ok(())
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn connect(&self, app: &AppHandle) -> Result<(), String> {
        let client_id = load_discord_client_id(app)?;
        self.connect_with_client_id(client_id)
    }

    fn connect_with_client_id(&self, client_id: u64) -> Result<(), String> {
        let mut current_client_id = self.client_id.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock Discord client ID state: {e}");
            e.to_string()
        })?;

        let mut client_guard = self.client.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock Discord client state: {e}");
            e.to_string()
        })?;

        if client_guard.is_some() && current_client_id.as_ref() == Some(&client_id) {
            if wait_until_ready(DISCORD_CONNECT_WAIT) {
                log::debug!(target: "discord", "Discord RPC is already connected and ready");
                return Ok(());
            }

            log::warn!(
                target: "discord",
                "Discord RPC client exists but is not ready yet"
            );

            return Err(
                "Discord RPC is not ready yet. Make sure Discord is running and try again."
                    .to_string(),
            );
        }

        if let Some(old_client) = client_guard.take() {
            log::warn!(
                target: "discord",
                "Discord Client ID changed, shutting down old Discord RPC client"
            );

            if let Err(error) = old_client.shutdown() {
                log::warn!(
                    target: "discord",
                    "Failed to shutdown old Discord RPC client: {error}"
                );
            }

            *current_client_id = None;
            self.set_presence_idle_state("disconnected")?;
            self.reset_thumbnail_state()?;
        }

        log::info!(target: "discord", "Starting Discord RPC client");

        let mut client = Client::with_error_config(client_id, Duration::from_millis(500), Some(10));

        client
            .on_ready(|_| {
                log::info!(target: "discord", "Discord RPC ready");
            })
            .persist();

        client
            .on_connected(|_| {
                log::info!(target: "discord", "Discord RPC connected");
            })
            .persist();

        client
            .on_disconnected(|_| {
                log::warn!(target: "discord", "Discord RPC disconnected");
            })
            .persist();

        client
            .on_error(|_| {
                log::error!(target: "discord", "Discord RPC error event received");
            })
            .persist();

        client.start();

        *client_guard = Some(client);
        *current_client_id = Some(client_id);

        if !wait_until_ready(DISCORD_CONNECT_WAIT) {
            log::error!(
                target: "discord",
                "Discord RPC client was started, but it did not become ready"
            );

            return Err(
                "Discord RPC is not ready. Make sure the Discord desktop app is running."
                    .to_string(),
            );
        }

        log::info!(target: "discord", "Discord RPC client started");

        Ok(())
    }

    pub fn set_streaming(
        &self,
        app: &AppHandle,
        channel_name: &str,
        stream_title: Option<&str>,
        stream_category: Option<&str>,
        stream_url: Option<&str>,
        stream_thumbnail: Option<&str>,
        stream_started_at: Option<&str>,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            log::debug!(target: "discord", "Skipping streaming presence update because Rich Presence is disabled");
            self.set_presence_idle_state("disabled")?;
            return Ok(());
        }

        self.connect(app)?;

        let details = stream_title
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Watching on Kick")
            .to_string();

        let state = stream_category
            .filter(|c| !c.trim().is_empty())
            .unwrap_or("Live")
            .to_string();

        let started_at = parse_stream_started_at(stream_started_at).unwrap_or_else(|| {
            log::warn!(
                target: "discord",
                "Stream started_at is missing or invalid. Falling back to app start timestamp"
            );
            self.started_at
        });

        let stream_url = stream_url
            .filter(|u| !u.trim().is_empty())
            .map(|u| u.to_string());

        let watch_url = stream_url
            .clone()
            .unwrap_or_else(|| format!("https://kick.com/{}", channel_name.trim()));

        let raw_thumbnail = stream_thumbnail
            .filter(|thumbnail| !thumbnail.trim().is_empty())
            .map(|thumbnail| thumbnail.to_string());

        let large_image = self.get_presence_thumbnail(raw_thumbnail.as_deref())?;
        let large_text = if channel_name.trim().is_empty() {
            "Kick DRP".to_string()
        } else {
            format!("Watching {channel_name}")
        };

        let category_text = stream_category
            .filter(|category| !category.trim().is_empty())
            .unwrap_or("Kick")
            .to_string();

        let mut guard = self.client.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock Discord client state: {e}");
            e.to_string()
        })?;

        let client = guard.as_mut().ok_or_else(|| {
            log::error!(target: "discord", "Discord client not connected");
            "Discord client not connected".to_string()
        })?;

        if !Client::is_ready() {
            log::error!(
                target: "discord",
                "Tried to set streaming presence before Discord RPC was ready"
            );
            return Err("Discord RPC is not ready.".to_string());
        }

        client
            .set_activity(|activity| {
                activity
                    .details(details.clone())
                    .state(state.clone())
                    .status_display(DisplayType::Details)
                    .timestamps(|timestamps| timestamps.start(started_at))
                    .assets(|assets| {
                        assets
                            .small_image("kick")
                            .small_text("Live on Kick")
                            .large_image(large_image.clone())
                            .large_text(category_text.clone())
                    })
                    .append_buttons(|button| {
                        button
                            .label("Watch Stream")
                            .url(watch_url.clone())
                    })
            })
            .map_err(|e| {
                log::error!(target: "discord", "Failed to set Discord activity: {e}");
                format!("Discord set activity error: {e}")
            })?;

        self.set_presence_streaming_state(
            channel_name,
            stream_title,
            stream_category,
            raw_thumbnail.as_deref(),
        )?;

        log::info!(
            target: "discord",
            "Discord presence updated for Kick channel: {}",
            channel_name
        );

        let _ = large_text;

        Ok(())
    }

    pub fn set_idle(&self, app: &AppHandle) -> Result<(), String> {
        if !self.is_enabled() {
            log::debug!(target: "discord", "Skipping idle presence update because Rich Presence is disabled");
            self.set_presence_idle_state("disabled")?;
            return Ok(());
        }

        self.connect(app)?;

        let started_at = self.started_at;

        let mut guard = self.client.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock Discord client state: {e}");
            e.to_string()
        })?;

        let client = guard.as_mut().ok_or_else(|| {
            log::error!(target: "discord", "Discord client not connected");
            "Discord client not connected".to_string()
        })?;

        if !Client::is_ready() {
            log::error!(
                target: "discord",
                "Tried to set idle presence before Discord RPC was ready"
            );
            return Err("Discord RPC is not ready.".to_string());
        }

        client
            .set_activity(|activity| {
                activity
                    .details("Waiting for stream")
                    .state("Kick DRP is running")
                    .status_display(DisplayType::Details)
                    .timestamps(|timestamps| timestamps.start(started_at))
                    .assets(|assets| assets.large_image("kick").large_text("Kick DRP"))
            })
            .map_err(|e| {
                log::error!(target: "discord", "Failed to set idle Discord activity: {e}");
                format!("Discord set idle error: {e}")
            })?;

        self.set_presence_idle_state("idle")?;
        self.reset_thumbnail_state()?;

        log::info!(target: "discord", "Discord presence set to idle");

        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut guard = self.client.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock Discord client state: {e}");
            e.to_string()
        })?;

        if let Some(client) = guard.as_mut() {
            if !Client::is_ready() {
                log::warn!(
                    target: "discord",
                    "Tried to clear Discord presence, but Discord RPC is not ready"
                );
                self.set_presence_idle_state("disconnected")?;
                return Ok(());
            }

            client.clear_activity().map_err(|e| {
                log::error!(target: "discord", "Failed to clear Discord activity: {e}");
                format!("Discord clear activity error: {e}")
            })?;

            log::info!(target: "discord", "Discord presence cleared");
        } else {
            log::warn!(
                target: "discord",
                "Tried to clear Discord presence, but client is not connected"
            );
        }

        self.set_presence_idle_state("cleared")?;
        self.reset_thumbnail_state()?;

        Ok(())
    }

    pub fn status(&self) -> Result<DiscordPresenceStatus, String> {
        let enabled = self.is_enabled();

        let connected = self
            .client
            .lock()
            .map_err(|e| e.to_string())?
            .is_some();

        let ready = Client::is_ready();

        let state = self.presence_state.lock().map_err(|e| e.to_string())?;

        Ok(DiscordPresenceStatus {
            enabled,
            connected,
            ready,
            active: enabled && connected && ready && state.active,
            mode: if enabled { state.mode.clone() } else { "disabled".to_string() },
            channel_name: state.channel_name.clone(),
            title: state.title.clone(),
            category: state.category.clone(),
            updated_at: state.updated_at,
        })
    }

    fn get_presence_thumbnail(&self, thumbnail: Option<&str>) -> Result<String, String> {
        let Some(thumbnail) = thumbnail.filter(|url| !url.trim().is_empty()) else {
            return Ok("kick".to_string());
        };

        let mut state = self.thumbnail_state.lock().map_err(|e| {
            log::error!(target: "discord", "Failed to lock thumbnail state: {e}");
            e.to_string()
        })?;

        let now = Instant::now();
        let thumbnail_changed = state.original_url.as_deref() != Some(thumbnail);
        let thumbnail_expired = state
            .last_refresh
            .map(|last_refresh| last_refresh.elapsed() >= THUMBNAIL_REFRESH_INTERVAL)
            .unwrap_or(true);

        if thumbnail_changed || thumbnail_expired {
            let busted = cache_bust_url(thumbnail);

            state.original_url = Some(thumbnail.to_string());
            state.cached_url = Some(busted.clone());
            state.last_refresh = Some(now);

            log::info!(
                target: "discord",
                "Discord thumbnail refreshed for Rich Presence"
            );

            return Ok(busted);
        }

        Ok(state
            .cached_url
            .clone()
            .unwrap_or_else(|| "kick".to_string()))
    }

    fn reset_thumbnail_state(&self) -> Result<(), String> {
        let mut state = self.thumbnail_state.lock().map_err(|e| e.to_string())?;

        *state = ThumbnailState::default();

        Ok(())
    }

    fn set_presence_streaming_state(
        &self,
        channel_name: &str,
        stream_title: Option<&str>,
        stream_category: Option<&str>,
        stream_thumbnail: Option<&str>,
    ) -> Result<(), String> {
        let mut state = self.presence_state.lock().map_err(|e| e.to_string())?;

        state.active = true;
        state.mode = "streaming".to_string();
        state.channel_name = Some(channel_name.to_string());
        state.title = stream_title.map(|title| title.to_string());
        state.category = stream_category.map(|category| category.to_string());
        state.thumbnail = stream_thumbnail.map(|thumbnail| thumbnail.to_string());
        state.updated_at = Some(now_unix());

        Ok(())
    }

    fn set_presence_idle_state(&self, mode: &str) -> Result<(), String> {
        let mut state = self.presence_state.lock().map_err(|e| e.to_string())?;

        state.active = false;
        state.mode = mode.to_string();
        state.channel_name = None;
        state.title = None;
        state.category = None;
        state.thumbnail = None;
        state.updated_at = Some(now_unix());

        Ok(())
    }
}

impl Default for DiscordPresence {
    fn default() -> Self {
        Self::new()
    }
}

fn wait_until_ready(timeout: Duration) -> bool {
    let started = Instant::now();

    while started.elapsed() < timeout {
        if Client::is_ready() {
            return true;
        }

        sleep(DISCORD_READY_POLL);
    }

    Client::is_ready()
}

fn load_discord_client_id(app: &AppHandle) -> Result<u64, String> {
    let settings = load_settings(app)?;

    let discord_client_id = settings.discord_client_id.ok_or_else(|| {
        log::error!(target: "discord", "Discord Client ID is missing in settings");
        "Discord Client ID is missing in settings.".to_string()
    })?;

    let discord_client_id = discord_client_id.trim();

    if discord_client_id.is_empty() {
        log::error!(target: "discord", "Discord Client ID is empty in settings");
        return Err("Discord Client ID is empty in settings.".to_string());
    }

    discord_client_id.parse::<u64>().map_err(|e| {
        log::error!(
            target: "discord",
            "Invalid Discord Client ID in settings: {}",
            e
        );

        "Discord Client ID must be a valid number.".to_string()
    })
}

fn parse_stream_started_at(started_at: Option<&str>) -> Option<u64> {
    let started_at = started_at?.trim();

    if started_at.is_empty() {
        return None;
    }

    match DateTime::parse_from_rfc3339(started_at) {
        Ok(datetime) => {
            let timestamp = datetime.with_timezone(&Utc).timestamp();

            if timestamp > 0 {
                Some(timestamp as u64)
            } else {
                None
            }
        }
        Err(error) => {
            log::warn!(
                target: "discord",
                "Failed to parse stream started_at '{}': {}",
                started_at,
                error
            );

            None
        }
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn cache_bust_url(url: &str) -> String {
    let timestamp = Utc::now().timestamp();

    if url.contains('?') {
        format!("{url}&v={timestamp}")
    } else {
        format!("{url}?v={timestamp}")
    }
}
