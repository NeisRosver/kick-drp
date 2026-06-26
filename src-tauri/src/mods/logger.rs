use chrono::Local;
use fern::Dispatch;
use log::LevelFilter;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

fn logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config directory: {e}"))?;

    let logs_dir = app_dir.join("logs");

    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Failed to create logs directory: {e}"))?;

    Ok(logs_dir)
}

pub fn init_logger(app: &AppHandle) -> Result<(), String> {
    let logs_dir = logs_dir(app)?;
    let latest_log = logs_dir.join("latest.log");

    let file_dispatch = fern::log_file(&latest_log)
        .map_err(|e| format!("Failed to create log file: {e}"))?;

    Dispatch::new()
        .level(LevelFilter::Info)
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}] [{}] [{}] {}",
                Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                record.target(),
                message
            ))
        })
        .chain(std::io::stdout())
        .chain(file_dispatch)
        .apply()
        .map_err(|e| format!("Failed to initialize logger: {e}"))?;

    log::info!("Kick DRP logger initialized");
    log::info!("Log file: {}", latest_log.display());

    Ok(())
}

#[tauri::command]
pub fn get_log_path(app: AppHandle) -> Result<String, String> {
    let path = logs_dir(&app)?.join("latest.log");
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn frontend_log(level: String, target: String, message: String) -> Result<(), String> {
    let target = if target.trim().is_empty() {
        "react".to_string()
    } else {
        target.trim().to_string()
    };

    match level.trim().to_lowercase().as_str() {
        "debug" => log::debug!(target: &target, "{}", message),
        "info" => log::info!(target: &target, "{}", message),
        "warn" => log::warn!(target: &target, "{}", message),
        "error" => log::error!(target: &target, "{}", message),
        _ => log::info!(target: &target, "{}", message),
    }

    Ok(())
}
