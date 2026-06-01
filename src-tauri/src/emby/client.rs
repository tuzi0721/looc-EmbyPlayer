use std::time::Duration;

use reqwest::header::{
    HeaderMap, HeaderName, HeaderValue, ACCEPT_ENCODING, AUTHORIZATION, USER_AGENT,
};
use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::Value;
use url::Url;

use crate::config::models::{Account, Line, LineStatus, Server, ServerKind};
use crate::config::ConfigStore;
use crate::emby::endpoints;
use crate::emby::models::*;
use crate::error::{AppError, AppResult};
use crate::network::health::HealthChecker;
use crate::network::racer::race_first_success;

const DEVICE_ID: &str = "emby-player-desktop-001";
const CLIENT_NAME: &str = "EmbyPlayer";
const CLIENT_VERSION: &str = "0.1.0";
const PERSONAL_ITEM_FIELDS: &str =
    "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks";

#[derive(Clone)]
pub struct EmbyClient {
    http: Client,
    config: ConfigStore,
}

impl EmbyClient {
    pub fn new(http: Client, config: ConfigStore) -> Self {
        Self { http, config }
    }

    pub fn http(&self) -> &Client {
        &self.http
    }

    pub fn health_checker(&self) -> HealthChecker {
        HealthChecker::new(self.http.clone())
    }

    /// Login via username/password against the server. Tries lines in parallel
    /// using `race_first_success` to win the first responsive line.
    pub async fn authenticate(
        &self,
        server: &Server,
        username: &str,
        password: &str,
    ) -> AppResult<(AuthenticationResult, Line)> {
        let settings = self.config.settings();
        let default_ua = server
            .default_user_agent
            .clone()
            .unwrap_or_else(|| settings.default_user_agent.clone());

        let req_body = AuthenticateRequest {
            username: username.into(),
            pw: password.into(),
        };

        let kind = server.kind;
        let enabled_lines: Vec<Line> = server.lines.iter().filter(|l| l.enabled).cloned().collect();
        if enabled_lines.is_empty() {
            return Err(AppError::NoLine(server.id.clone()));
        }

        let contestants = enabled_lines
            .iter()
            .map(|line| {
                let line_cloned = line.clone();
                let body = req_body.clone();
                let http = self.http.clone();
                let default_ua = default_ua.clone();
                let id = line.id.clone();
                (id, move || async move {
                    let url =
                        endpoints::join(&line_cloned.base_url, endpoints::authenticate_by_name())?;
                    let headers = build_headers(
                        kind,
                        &default_ua,
                        line_cloned.user_agent.as_deref(),
                        &line_cloned.headers,
                        None,
                    )?;
                    let resp = http
                        .request(Method::POST, url)
                        .headers(headers)
                        .json(&body)
                        .send()
                        .await?;
                    let resp = ensure_ok(resp).await?;
                    let r: AuthenticationResult = decode_json(resp, "authenticate").await?;
                    Ok::<_, AppError>((r, line_cloned))
                })
            })
            .collect::<Vec<_>>();

        let outcome = race_first_success(contestants, settings.race_timeout_ms).await?;
        Ok(outcome.value)
    }

    /// Lightweight keep-alive ping. Returns true if any line answered with success.
    pub async fn ping_keepalive(&self, server: &Server, account: &Account) -> AppResult<bool> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, endpoints::sessions_self())?;
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        Ok(resp.status().is_success())
    }

    pub async fn system_info_public(
        &self,
        line: &Line,
        default_ua: &str,
    ) -> AppResult<SystemInfoPublic> {
        let url = endpoints::join(&line.base_url, endpoints::system_info_public())?;
        let mut headers = HeaderMap::new();
        let ua = line
            .user_agent
            .clone()
            .unwrap_or_else(|| default_ua.to_string());
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&ua).map_err(|e| AppError::Other(e.to_string()))?,
        );
        headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("identity"));
        let resp = self.http.get(url).headers(headers).send().await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "system_info_public").await
    }

    pub async fn list_views(&self, server: &Server, account: &Account) -> AppResult<ViewsResponse> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, &endpoints::user_views(&account.user_id))?;
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "list_views").await
    }

    pub async fn list_items(
        &self,
        server: &Server,
        account: &Account,
        parent_id: Option<&str>,
        params: &[(String, String)],
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let mut url = endpoints::join(&line.base_url, &endpoints::user_items(&account.user_id))?;
        {
            let mut q = url.query_pairs_mut();
            if let Some(p) = parent_id {
                q.append_pair("ParentId", p);
            }
            for (k, v) in params {
                q.append_pair(k, v);
            }
        }
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "list_items").await
    }

    pub async fn get_item(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
    ) -> AppResult<MediaItem> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(
            &line.base_url,
            &endpoints::user_item(&account.user_id, item_id),
        )?;
        let mut url = url;
        url.query_pairs_mut().append_pair(
            "Fields",
            "Overview,Genres,GenreItems,Studios,People,CommunityRating,OfficialRating,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,ProductionYear,MediaSources",
        );
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "get_item").await
    }

    pub async fn set_favorite(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        favorite: bool,
    ) -> AppResult<UserData> {
        let method = if favorite {
            Method::POST
        } else {
            Method::DELETE
        };
        self.update_user_item_data(
            server,
            account,
            item_id,
            method,
            &endpoints::user_favorite_item(&account.user_id, item_id),
            "set_favorite",
        )
        .await
    }

    pub async fn set_played(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        played: bool,
    ) -> AppResult<UserData> {
        let method = if played { Method::POST } else { Method::DELETE };
        self.update_user_item_data(
            server,
            account,
            item_id,
            method,
            &endpoints::user_played_item(&account.user_id, item_id),
            "set_played",
        )
        .await
    }

    pub async fn search(
        &self,
        server: &Server,
        account: &Account,
        term: &str,
    ) -> AppResult<ItemsResponse> {
        self.list_items(
            server,
            account,
            None,
            &[
                ("SearchTerm".into(), term.into()),
                ("Recursive".into(), "true".into()),
                (
                    "Fields".into(),
                    "PrimaryImageAspectRatio,Overview,ProductionYear,UserData".into(),
                ),
                ("Limit".into(), "50".into()),
            ],
        )
        .await
    }

    pub async fn list_seasons(
        &self,
        server: &Server,
        account: &Account,
        series_id: &str,
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let mut url = endpoints::join(&line.base_url, &endpoints::show_seasons(series_id))?;
        url.query_pairs_mut()
            .append_pair("UserId", &account.user_id);
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "list_seasons").await
    }

    pub async fn list_episodes(
        &self,
        server: &Server,
        account: &Account,
        series_id: &str,
        season_id: Option<&str>,
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let mut url = endpoints::join(&line.base_url, &endpoints::show_episodes(series_id))?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("UserId", &account.user_id);
            if let Some(s) = season_id {
                q.append_pair("SeasonId", s);
            }
            q.append_pair(
                "Fields",
                "Overview,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo",
            );
        }
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "list_episodes").await
    }

    pub async fn similar_items(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        limit: Option<i32>,
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let mut url = endpoints::join(&line.base_url, &endpoints::similar_items(item_id))?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("UserId", &account.user_id);
            q.append_pair("Limit", &limit.unwrap_or(18).max(1).to_string());
            q.append_pair(
                "Fields",
                "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo",
            );
        }
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "similar_items").await
    }

    pub async fn special_features(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        limit: Option<i32>,
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let max = limit.unwrap_or(18).max(1) as usize;
        let mut url = endpoints::join(
            &line.base_url,
            &endpoints::special_features(&account.user_id, item_id),
        )?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("Limit", &max.to_string());
            q.append_pair(
                "Fields",
                "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks",
            );
        }
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        let value = decode_json::<Value>(resp, "special_features").await?;
        items_response_from_value(value, "special_features", Some(max))
    }

    pub async fn resume_items(
        &self,
        server: &Server,
        account: &Account,
    ) -> AppResult<ItemsResponse> {
        let line = self.pick_active_line(server)?;
        let mut url = endpoints::join(&line.base_url, &endpoints::resume_items(&account.user_id))?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("Recursive", "true");
            q.append_pair("MediaTypes", "Video");
            q.append_pair("Fields", PERSONAL_ITEM_FIELDS);
            q.append_pair("EnableUserData", "true");
            q.append_pair("EnableImages", "true");
            q.append_pair("ImageTypeLimit", "1");
            q.append_pair("EnableImageTypes", "Primary,Backdrop");
            q.append_pair("Limit", "120");
        }
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "resume_items").await
    }

    pub async fn playback_info(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        start_ticks: Option<i64>,
    ) -> AppResult<PlaybackInfo> {
        self.playback_info_for_line(server, account, item_id, start_ticks, None)
            .await
    }

    pub async fn playback_info_for_line(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        start_ticks: Option<i64>,
        line_id: Option<&str>,
    ) -> AppResult<PlaybackInfo> {
        let line = self.pick_line(server, line_id)?;
        let url = endpoints::join(&line.base_url, &endpoints::playback_info(item_id))?;
        let body = PlaybackInfoRequest {
            user_id: account.user_id.clone(),
            max_streaming_bitrate: Some(140_000_000),
            start_time_ticks: start_ticks,
            enable_direct_play: true,
            enable_direct_stream: true,
            enable_transcoding: false,
            enable_video_stream_copy: true,
            enable_audio_stream_copy: true,
            device_profile: Some(PlaybackDeviceProfile::direct_only(
                "Hills Lite Tauri Local Decode",
            )),
        };
        let resp = self
            .authed_request(Method::POST, url, server, account, &line)?
            .json(&body)
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        decode_json(resp, "playback_info").await
    }

    pub async fn report_progress(
        &self,
        server: &Server,
        account: &Account,
        progress: &PlaybackProgress,
    ) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, endpoints::playing_progress())?;
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .json(progress)
            .send()
            .await?;
        Ok(())
    }

    /// Tell the server what this client can do. Called once the WebSocket
    /// session is established so other clients can list us as a controllable
    /// target.
    pub async fn report_capabilities(&self, server: &Server, account: &Account) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, "Sessions/Capabilities/Full")?;
        let body = serde_json::json!({
            "PlayableMediaTypes": ["Video", "Audio"],
            "SupportedCommands": [
                "Play",
                "Pause",
                "Unpause",
                "Stop",
                "Seek",
                "ToggleMute",
                "SetVolume",
                "VolumeUp",
                "VolumeDown",
                "SetAudioStreamIndex",
                "SetSubtitleStreamIndex",
                "DisplayMessage",
            ],
            "SupportsMediaControl": true,
            "SupportsPersistentIdentifier": true,
            "AppStoreUrl": null,
            "IconUrl": null,
        });
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .json(&body)
            .send()
            .await?;
        Ok(())
    }

    /// List all active sessions on the server, excluding our own device id.
    pub async fn list_sessions(
        &self,
        server: &Server,
        account: &Account,
    ) -> AppResult<Vec<crate::emby::models::RemoteSession>> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, "Sessions")?;
        let resp = self
            .authed_request(Method::GET, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        let all: Vec<crate::emby::models::RemoteSession> =
            decode_json(resp, "list_sessions").await?;
        Ok(all
            .into_iter()
            .filter(|s| s.device_id.as_deref() != Some(DEVICE_ID))
            .collect())
    }

    /// Send a Playstate command (`PlayPause`, `Pause`, `Unpause`, `Stop`,
    /// `Seek`, `NextTrack`, `PreviousTrack`, etc.) to the targeted session.
    pub async fn send_playstate(
        &self,
        server: &Server,
        account: &Account,
        session_id: &str,
        command: &str,
        seek_position_ticks: Option<i64>,
    ) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let path = format!("Sessions/{session_id}/Playing/{command}");
        let mut url = endpoints::join(&line.base_url, &path)?;
        if let Some(p) = seek_position_ticks {
            url.query_pairs_mut()
                .append_pair("SeekPositionTicks", &p.to_string());
        }
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .send()
            .await?;
        Ok(())
    }

    /// Tell another session to start playing a given item.
    pub async fn send_play(
        &self,
        server: &Server,
        account: &Account,
        session_id: &str,
        item_ids: &[String],
        start_position_ticks: Option<i64>,
    ) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let path = format!("Sessions/{session_id}/Playing");
        let mut url = endpoints::join(&line.base_url, &path)?;
        url.query_pairs_mut()
            .append_pair("PlayCommand", "PlayNow")
            .append_pair("ItemIds", &item_ids.join(","));
        if let Some(p) = start_position_ticks {
            url.query_pairs_mut()
                .append_pair("StartPositionTicks", &p.to_string());
        }
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .send()
            .await?;
        Ok(())
    }

    /// Send a GeneralCommand (volume / mute / display-message etc.).
    pub async fn send_general_command(
        &self,
        server: &Server,
        account: &Account,
        session_id: &str,
        command: &str,
        arguments: serde_json::Value,
    ) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let path = format!("Sessions/{session_id}/Command");
        let url = endpoints::join(&line.base_url, &path)?;
        let body = serde_json::json!({
            "Name": command,
            "Arguments": arguments,
        });
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .json(&body)
            .send()
            .await?;
        Ok(())
    }

    pub async fn report_stopped(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        play_session_id: &str,
        position_ticks: i64,
    ) -> AppResult<()> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, endpoints::playing_stopped())?;
        let body = serde_json::json!({
            "ItemId": item_id,
            "PlaySessionId": play_session_id,
            "PositionTicks": position_ticks,
        });
        let _ = self
            .authed_request(Method::POST, url, server, account, &line)?
            .json(&body)
            .send()
            .await?;
        Ok(())
    }

    /// Build the streaming URL for the chosen media source. The frontend hands
    /// this URL to mpv directly and authentication is normally sent by headers.
    pub fn build_stream_url(
        &self,
        server: &Server,
        account: &Account,
        item: &MediaItem,
        source: &MediaSource,
        play_session_id: &str,
        prefer_direct: bool,
    ) -> AppResult<Url> {
        self.build_stream_url_for_line(
            server,
            account,
            item,
            source,
            play_session_id,
            prefer_direct,
            None,
        )
    }

    pub fn build_stream_url_for_line(
        &self,
        server: &Server,
        account: &Account,
        item: &MediaItem,
        source: &MediaSource,
        play_session_id: &str,
        _prefer_direct: bool,
        line_id: Option<&str>,
    ) -> AppResult<Url> {
        let line = self.pick_line(server, line_id)?;
        let settings = self.config.settings();
        let path = format!("Videos/{}/stream", item.id);
        let mut url = endpoints::join(&line.base_url, &path)?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("MediaSourceId", &source.id);
            q.append_pair("PlaySessionId", play_session_id);
            if settings.append_auth_query {
                q.append_pair("api_key", &account.access_token);
            }
            q.append_pair("Static", "true");
        }
        Ok(url)
    }

    fn pick_active_line(&self, server: &Server) -> AppResult<Line> {
        self.pick_line(server, None)
    }

    pub fn pick_line(&self, server: &Server, line_id: Option<&str>) -> AppResult<Line> {
        if let Some(id) = line_id.filter(|id| !id.trim().is_empty()) {
            let line = server
                .lines
                .iter()
                .find(|line| line.id == id)
                .ok_or_else(|| AppError::NotFound(format!("line {id}")))?;
            if !line.enabled {
                return Err(AppError::NoLine(server.id.clone()));
            }
            return Ok(line.clone());
        }

        if let Some(id) = &server.active_line_id {
            if let Some(line) = server.lines.iter().find(|l| &l.id == id && l.enabled) {
                return Ok(line.clone());
            }
        }
        let mut alive: Vec<&Line> = server
            .lines
            .iter()
            .filter(|l| l.enabled && l.last_status != Some(LineStatus::Down))
            .collect();
        alive.sort_by_key(|l| (l.priority, l.last_latency_ms.unwrap_or(u32::MAX)));
        alive
            .first()
            .cloned()
            .cloned()
            .ok_or_else(|| AppError::NoLine(server.id.clone()))
    }

    fn authed_request(
        &self,
        method: Method,
        url: Url,
        server: &Server,
        account: &Account,
        line: &Line,
    ) -> AppResult<RequestBuilder> {
        let settings = self.config.settings();
        let default_ua = server
            .default_user_agent
            .clone()
            .unwrap_or_else(|| settings.default_user_agent.clone());
        let headers = build_headers(
            server.kind,
            &default_ua,
            line.user_agent.as_deref(),
            &line.headers,
            Some(&account.access_token),
        )?;
        Ok(self
            .http
            .request(method, url)
            .headers(headers)
            .timeout(Duration::from_millis(settings.request_timeout_ms)))
    }

    async fn update_user_item_data(
        &self,
        server: &Server,
        account: &Account,
        item_id: &str,
        method: Method,
        path: &str,
        context: &str,
    ) -> AppResult<UserData> {
        let line = self.pick_active_line(server)?;
        let url = endpoints::join(&line.base_url, path)?;
        let resp = self
            .authed_request(method, url, server, account, &line)?
            .send()
            .await?;
        let resp = ensure_ok(resp).await?;
        let status = resp.status();
        let url = resp.url().clone();
        let body = resp.text().await.map_err(|e| {
            AppError::Other(format!(
                "{context}: failed to read response body from {url} (status {status}): {e}"
            ))
        })?;

        if body.trim().is_empty() {
            return Ok(self
                .get_item(server, account, item_id)
                .await?
                .user_data
                .unwrap_or_default());
        }

        serde_json::from_str(&body).map_err(|e| {
            AppError::Other(format!(
                "{context}: failed to parse JSON from {url} (status {status}): {e}; body preview: {}",
                body_preview(&body)
            ))
        })
    }
}

fn build_headers(
    kind: ServerKind,
    default_ua: &str,
    line_ua: Option<&str>,
    extra: &[(String, String)],
    token: Option<&str>,
) -> AppResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    let ua = line_ua.unwrap_or(default_ua);
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(ua).map_err(|e| AppError::Other(e.to_string()))?,
    );
    headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("identity"));

    let auth = format!(
        "MediaBrowser Client=\"{client}\", Device=\"{device}\", DeviceId=\"{device_id}\", Version=\"{ver}\"",
        client = CLIENT_NAME,
        device = "Desktop",
        device_id = DEVICE_ID,
        ver = CLIENT_VERSION
    );
    let auth_header_name: HeaderName = match kind {
        ServerKind::Emby => HeaderName::from_static("x-emby-authorization"),
        ServerKind::Jellyfin => HeaderName::from_static("x-emby-authorization"),
    };
    headers.insert(
        auth_header_name,
        HeaderValue::from_str(&auth).map_err(|e| AppError::Other(e.to_string()))?,
    );
    if let Some(t) = token {
        let token_header: HeaderName = match kind {
            ServerKind::Emby => HeaderName::from_static("x-emby-token"),
            ServerKind::Jellyfin => HeaderName::from_static("x-emby-token"),
        };
        headers.insert(
            token_header,
            HeaderValue::from_str(t).map_err(|e| AppError::Other(e.to_string()))?,
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("MediaBrowser Token=\"{t}\""))
                .map_err(|e| AppError::Other(e.to_string()))?,
        );
    }

    for (k, v) in extra {
        let name = HeaderName::from_bytes(k.as_bytes())
            .map_err(|e| AppError::Other(format!("bad header name '{k}': {e}")))?;
        let val = HeaderValue::from_str(v)
            .map_err(|e| AppError::Other(format!("bad header value for '{k}': {e}")))?;
        headers.insert(name, val);
    }
    Ok(headers)
}

async fn ensure_ok(resp: Response) -> AppResult<Response> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(AppError::Auth(body)),
        StatusCode::NOT_FOUND => Err(AppError::NotFound(body)),
        _ => Err(AppError::Other(format!("HTTP {status}: {body}"))),
    }
}

async fn decode_json<T>(resp: Response, context: &str) -> AppResult<T>
where
    T: DeserializeOwned,
{
    let status = resp.status();
    let url = resp.url().clone();
    let body = resp.text().await.map_err(|e| {
        AppError::Other(format!(
            "{context}: failed to read response body from {url} (status {status}): {e}"
        ))
    })?;

    serde_json::from_str(&body).map_err(|e| {
        AppError::Other(format!(
            "{context}: failed to parse JSON from {url} (status {status}): {e}; body preview: {}",
            body_preview(&body)
        ))
    })
}

fn items_response_from_value(
    value: Value,
    context: &str,
    limit: Option<usize>,
) -> AppResult<ItemsResponse> {
    let mut response = if value.is_array() {
        let items: Vec<MediaItem> = serde_json::from_value(value)
            .map_err(|e| AppError::Other(format!("{context}: failed to parse item array: {e}")))?;
        let total_record_count = items.len() as i64;
        ItemsResponse {
            items,
            total_record_count,
        }
    } else {
        serde_json::from_value::<ItemsResponse>(value).map_err(|e| {
            AppError::Other(format!("{context}: failed to parse items response: {e}"))
        })?
    };

    if let Some(max) = limit {
        response.items.retain(|item| !item.id.is_empty());
        response.items.truncate(max);
    }
    if response.total_record_count <= 0 {
        response.total_record_count = response.items.len() as i64;
    }
    Ok(response)
}

fn body_preview(body: &str) -> String {
    const MAX_CHARS: usize = 1200;
    let mut preview: String = body.chars().take(MAX_CHARS).collect();
    if body.chars().nth(MAX_CHARS).is_some() {
        preview.push_str("...");
    }
    preview.replace('\r', "\\r").replace('\n', "\\n")
}
