use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub kick_channel: String,
    pub kick_client_id: Option<String>,
    pub kick_client_secret: Option<String>,
    pub discord_client_id: Option<String>,
    pub update_interval_seconds: u64,
    pub auto_start: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            kick_channel: String::new(),
            kick_client_id: None,
            kick_client_secret: None,
            discord_client_id: None,
            update_interval_seconds: 20,
            auto_start: false,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let settings_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app settings directory: {e}"))?;

    fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings directory: {e}"))?;

    Ok(settings_dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    log::info!(target: "settings", "Loading settings");

    let path = settings_path(app)?;

    if !path.exists() {
        log::warn!(target: "settings", "Settings file not found, creating default settings");

        let settings = AppSettings::default();
        save_settings_file(app, &settings)?;

        return Ok(settings);
    }

    let content = fs::read_to_string(&path).map_err(|e| {
        log::error!(target: "settings", "Failed to read settings.json: {e}");
        format!("Failed to read settings.json: {e}")
    })?;

    let settings: AppSettings = serde_json::from_str(&content).map_err(|e| {
        log::error!(target: "settings", "Invalid settings file: {e}");
        format!("Invalid settings file: {e}")
    })?;

    let normalized_settings = normalize_settings(settings);

    log::info!(target: "settings", "Settings loaded successfully");

    Ok(normalized_settings)
}

pub fn save_settings_file(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    log::info!(target: "settings", "Saving settings");

    let normalized_settings = normalize_settings(settings.clone());
    validate_settings(&normalized_settings)?;

    let path = settings_path(app)?;

    let content = serde_json::to_string_pretty(&normalized_settings).map_err(|e| {
        log::error!(target: "settings", "Failed to serialize settings: {e}");
        format!("Failed to serialize settings: {e}")
    })?;

    fs::write(&path, content).map_err(|e| {
        log::error!(target: "settings", "Failed to write settings.json: {e}");
        format!("Failed to write settings.json: {e}")
    })?;

    log::info!(target: "settings", "Settings saved successfully");

    Ok(())
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.kick_channel = settings.kick_channel.trim().to_string();
    settings.kick_client_id = normalize_optional_string(settings.kick_client_id);
    settings.kick_client_secret = normalize_optional_string(settings.kick_client_secret);
    settings.discord_client_id = normalize_optional_string(settings.discord_client_id);
    settings
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let item = item.trim().to_string();

        if item.is_empty() {
            None
        } else {
            Some(item)
        }
    })
}

fn validate_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.update_interval_seconds < 10 {
        log::warn!(target: "settings", "Invalid update interval: below minimum");
        return Err("The minimum recommended update interval is 10 seconds.".to_string());
    }

    if settings.update_interval_seconds > 300 {
        log::warn!(target: "settings", "Invalid update interval: above maximum");
        return Err("The maximum allowed update interval is 300 seconds.".to_string());
    }

    if let Some(discord_client_id) = &settings.discord_client_id {
        if !discord_client_id
            .chars()
            .all(|character| character.is_ascii_digit())
        {
            log::warn!(target: "settings", "Invalid Discord Client ID: non-numeric value");
            return Err("Discord Client ID must contain only numbers.".to_string());
        }

        if discord_client_id == "0" {
            log::warn!(target: "settings", "Invalid Discord Client ID: zero value");
            return Err("Discord Client ID cannot be 0.".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let normalized_settings = normalize_settings(settings);
    save_settings_file(&app, &normalized_settings)?;
    Ok(normalized_settings)
}

#[tauri::command]
pub fn get_settings_path(app: AppHandle) -> Result<String, String> {
    let path = settings_path(&app)?;
    Ok(path.display().to_string())
}
