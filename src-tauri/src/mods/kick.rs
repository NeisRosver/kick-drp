use crate::mods::settings::load_settings;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const KICK_AUTH_URL: &str = "https://id.kick.com/oauth/token";
const KICK_API_BASE_URL: &str = "https://api.kick.com/public/v1";

#[derive(Debug, Clone, Deserialize)]
struct KickTokenResponse {
    access_token: String,
    expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickStreamInfo {
    pub channel: String,
    pub channel_id: Option<u64>,
    pub broadcaster_user_id: Option<u64>,
    pub title: Option<String>,
    pub category: Option<String>,
    pub thumbnail: Option<String>,
    pub started_at: Option<String>,
    pub viewer_count: Option<u64>,
    pub is_live: bool,
}

#[derive(Debug, Deserialize)]
struct KickChannelResponse {
    data: Vec<KickChannel>,
}

#[derive(Debug, Deserialize)]
struct KickChannel {
    broadcaster_user_id: Option<u64>,
    channel_id: Option<u64>,
    slug: Option<String>,
    stream_title: Option<String>,
    category: Option<KickCategory>,
    stream: Option<KickChannelStream>,
}

#[derive(Debug, Deserialize)]
struct KickCategory {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KickChannelStream {
    is_live: Option<bool>,
    thumbnail: Option<String>,
    #[serde(alias = "start_time", alias = "created_at")]
    started_at: Option<String>,
    viewer_count: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct KickLivestreamsResponse {
    data: Vec<KickLivestream>,
}

#[derive(Debug, Deserialize)]
struct KickLivestream {
    broadcaster_user_id: Option<u64>,
    channel_id: Option<u64>,
    slug: Option<String>,
    stream_title: Option<String>,
    thumbnail: Option<String>,
    #[serde(alias = "start_time", alias = "created_at")]
    started_at: Option<String>,
    viewer_count: Option<u64>,
    category: Option<KickCategory>,
}

async fn get_app_access_token(app: &AppHandle) -> Result<String, String> {
    let settings = load_settings(app)?;

    let client_id = settings
        .kick_client_id
        .ok_or_else(|| "Kick Client ID is missing.".to_string())?;

    let client_secret = settings
        .kick_client_secret
        .ok_or_else(|| "Kick Client Secret is missing.".to_string())?;

    log::info!(target: "kick", "Requesting Kick app access token");

    let client = Client::new();

    let response = client
        .post(KICK_AUTH_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
        ])
        .send()
        .await
        .map_err(|e| {
            log::error!(target: "kick", "Failed to request Kick token: {e}");
            format!("Failed to request Kick token: {e}")
        })?;

    let status = response.status();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();

        log::error!(
            target: "kick",
            "Kick token request failed. Status: {} Body: {}",
            status,
            body
        );

        return Err(format!("Kick token request failed: {status}"));
    }

    let token: KickTokenResponse = response.json().await.map_err(|e| {
        log::error!(target: "kick", "Failed to parse Kick token response: {e}");
        format!("Failed to parse Kick token response: {e}")
    })?;

    log::info!(
        target: "kick",
        "Kick app access token received. Expires in: {:?}",
        token.expires_in
    );

    Ok(token.access_token)
}

async fn get_channel_by_slug(token: &str, channel: &str) -> Result<Option<KickChannel>, String> {
    let client = Client::new();

    let url = format!(
        "{}/channels?slug={}",
        KICK_API_BASE_URL,
        urlencoding::encode(channel)
    );

    log::info!(target: "kick", "Fetching Kick channel: {}", channel);

    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| {
            log::error!(target: "kick", "Failed to fetch Kick channel: {e}");
            format!("Failed to fetch Kick channel: {e}")
        })?;

    let status = response.status();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();

        log::error!(
            target: "kick",
            "Kick channel request failed. Status: {} Body: {}",
            status,
            body
        );

        return Err(format!("Kick channel request failed: {status}"));
    }

    let data: KickChannelResponse = response.json().await.map_err(|e| {
        log::error!(target: "kick", "Failed to parse Kick channel response: {e}");
        format!("Failed to parse Kick channel response: {e}")
    })?;

    Ok(data.data.into_iter().next())
}

async fn get_livestream_by_broadcaster_user_id(
    token: &str,
    broadcaster_user_id: u64,
) -> Result<Option<KickLivestream>, String> {
    let client = Client::new();

    let url = format!(
        "{}/livestreams?broadcaster_user_id={}&limit=1",
        KICK_API_BASE_URL,
        broadcaster_user_id
    );

    log::info!(
        target: "kick",
        "Fetching Kick livestream for broadcaster_user_id: {}",
        broadcaster_user_id
    );

    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| {
            log::error!(target: "kick", "Failed to fetch Kick livestream: {e}");
            format!("Failed to fetch Kick livestream: {e}")
        })?;

    let status = response.status();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();

        log::error!(
            target: "kick",
            "Kick livestream request failed. Status: {} Body: {}",
            status,
            body
        );

        return Err(format!("Kick livestream request failed: {status}"));
    }

    let data: KickLivestreamsResponse = response.json().await.map_err(|e| {
        log::error!(target: "kick", "Failed to parse Kick livestream response: {e}");
        format!("Failed to parse Kick livestream response: {e}")
    })?;

    Ok(data.data.into_iter().next())
}

#[tauri::command]
pub async fn get_kick_stream(app: AppHandle) -> Result<KickStreamInfo, String> {
    let settings = load_settings(&app)?;

    let channel = settings.kick_channel.trim().to_string();

    if channel.is_empty() {
        log::warn!(target: "kick", "Kick channel is missing");
        return Err("Kick channel is missing.".to_string());
    }

    let token = get_app_access_token(&app).await?;
    let channel_data = get_channel_by_slug(&token, &channel).await?;

    let Some(channel_data) = channel_data else {
        log::warn!(target: "kick", "Kick channel not found: {}", channel);

        return Ok(KickStreamInfo {
            channel,
            channel_id: None,
            broadcaster_user_id: None,
            title: None,
            category: None,
            thumbnail: None,
            started_at: None,
            viewer_count: None,
            is_live: false,
        });
    };

    let broadcaster_user_id = channel_data.broadcaster_user_id;
    let channel_id = channel_data.channel_id;

    let livestream = match broadcaster_user_id {
        Some(id) => get_livestream_by_broadcaster_user_id(&token, id).await?,
        None => None,
    };

    if let Some(stream) = livestream {
        log::info!(target: "kick", "Kick stream is live: {}", channel);

        return Ok(KickStreamInfo {
            channel: stream.slug.unwrap_or(channel),
            channel_id: stream.channel_id.or(channel_id),
            broadcaster_user_id: stream.broadcaster_user_id.or(broadcaster_user_id),
            title: stream.stream_title,
            category: stream.category.and_then(|category| category.name),
            thumbnail: stream.thumbnail,
            started_at: stream.started_at,
            viewer_count: stream.viewer_count,
            is_live: true,
        });
    }

    let is_live = channel_data
        .stream
        .as_ref()
        .and_then(|stream| stream.is_live)
        .unwrap_or(false);

    log::info!(
        target: "kick",
        "Kick stream status for {}: {}",
        channel,
        if is_live { "live" } else { "offline" }
    );

    Ok(KickStreamInfo {
        channel: channel_data.slug.unwrap_or(channel),
        channel_id,
        broadcaster_user_id,
        title: channel_data.stream_title,
        category: channel_data.category.and_then(|category| category.name),
        thumbnail: channel_data
            .stream
            .as_ref()
            .and_then(|stream| stream.thumbnail.clone()),
        started_at: channel_data
            .stream
            .as_ref()
            .and_then(|stream| stream.started_at.clone()),
        viewer_count: channel_data
            .stream
            .as_ref()
            .and_then(|stream| stream.viewer_count),
        is_live,
    })
}