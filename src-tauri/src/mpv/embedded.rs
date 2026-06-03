//! Embedded libmpv backend (feature `mpv-embedded`).
//!
//! Renders mpv into a native child window owned by `HostWindow`, which sits
//! beneath Tauri's webview. The frontend reports the player area rectangle
//! (CSS pixels) and the backend repositions the child window to match.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use async_trait::async_trait;
use libmpv2::{
    events::{Event, PropertyData},
    Format, Mpv,
};
use parking_lot::{Mutex, RwLock};
use serde_json::{json, Map, Value};

use crate::error::{AppError, AppResult};
use crate::mpv::backend::{
    MpvBackend, MpvChapterInfo, MpvCommand, MpvSnapshot, MpvTrackInfo, PictureMode, TrackKind,
};
use crate::mpv::window_host::{HostWindow, ParentHandle, PlayerRect};

pub struct MpvEmbeddedBackend {
    mpv: Arc<Mutex<Mpv>>,
    host: Arc<RwLock<Option<HostWindow>>>,
    diagnostics: Arc<RwLock<MpvEventDiagnostics>>,
    event_stop: Arc<AtomicBool>,
    event_thread: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Debug, Clone, Default)]
struct MpvEventDiagnostics {
    load_generation: u64,
    event_count: u64,
    file_loaded_count: u64,
    video_reconfig_count: u64,
    audio_reconfig_count: u64,
    playback_restart_count: u64,
    last_event: Option<String>,
    last_error: Option<String>,
    last_property: Option<String>,
    last_log: Option<String>,
    file_loaded_after_last_load: bool,
}

fn drop_buffers_if_requested(mpv: &Mpv, preserve_cache: bool) -> AppResult<()> {
    if preserve_cache {
        return Ok(());
    }
    if let Err(e) = mpv.command("drop-buffers", &[]) {
        tracing::warn!(target = "mpv", error = %e, "drop-buffers failed after track switch");
    }
    Ok(())
}

impl MpvEmbeddedBackend {
    pub fn new() -> AppResult<Self> {
        log_visual_mpv_event("new:start");
        let mpv = Mpv::new().map_err(|e| AppError::Mpv(format!("libmpv init: {e}")))?;
        log_visual_mpv_event("new:mpv-created");
        mpv.set_property("hwdec", "auto-safe").ok();
        mpv.set_property("keep-open", "yes").ok();
        mpv.set_property("idle", "yes").ok();
        mpv.set_property("force-window", "no").ok();
        mpv.set_property("tls-verify", false).ok();
        mpv.set_property("network-timeout", 10_i64).ok();
        mpv.disable_deprecated_events().ok();
        mpv.enable_all_events().ok();
        log_visual_mpv_event("new:properties-set");
        let diagnostics = Arc::new(RwLock::new(MpvEventDiagnostics::default()));
        let event_stop = Arc::new(AtomicBool::new(false));
        // Some Windows/libmpv builds block while creating a secondary event
        // client before a render target is bound. Keep attach synchronous and
        // lightweight; state is still read directly from the main mpv handle.
        log_visual_mpv_event("new:event-thread-deferred");
        log_visual_mpv_event("new:complete");
        Ok(Self {
            mpv: Arc::new(Mutex::new(mpv)),
            host: Arc::new(RwLock::new(None)),
            diagnostics,
            event_stop,
            event_thread: Mutex::new(None),
        })
    }

    /// Bind a native child window to the mpv core. Subsequent `Load` calls will
    /// render into this window.
    pub fn bind_window(&self, parent: ParentHandle) -> AppResult<()> {
        log_visual_mpv_event("bind:create-host-start");
        let host = HostWindow::create_child(parent)?;
        log_visual_mpv_event("bind:create-host-complete");
        log_visual_mpv_event("bind:hide-host-start");
        host.show(false)?;
        log_visual_mpv_event("bind:hide-host-complete");
        let wid = host.wid();
        {
            log_visual_mpv_event("bind:set-wid-start");
            let m = self.mpv.lock();
            m.set_property("wid", wid)
                .map_err(|e| AppError::Mpv(format!("set wid: {e}")))?;
            log_visual_mpv_event("bind:set-wid-complete");
        }
        if let Some(old_host) = self.host.write().take() {
            log_visual_mpv_event("bind:destroy-old-host-start");
            let _ = old_host.show(false);
            let _ = old_host.destroy();
            log_visual_mpv_event("bind:destroy-old-host-complete");
        }
        *self.host.write() = Some(host);
        log_visual_mpv_event("bind:complete");
        Ok(())
    }

    pub fn detach_window(&self) -> AppResult<()> {
        if let Some(host) = self.host.write().take() {
            let _ = host.show(false);
            host.destroy()?;
        }
        Ok(())
    }

    pub fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
        match self.host.read().as_ref() {
            Some(h) => h.set_rect(rect),
            None => Ok(()),
        }
    }

    pub fn set_visible(&self, visible: bool) -> AppResult<()> {
        match self.host.read().as_ref() {
            Some(h) => h.show(visible),
            None => Ok(()),
        }
    }

    pub fn embed_window_handle(&self) -> Option<i64> {
        self.host.read().as_ref().map(|h| h.handle())
    }

    fn mark_load_start(&self) -> u64 {
        let mut state = self.diagnostics.write();
        state.load_generation = state.load_generation.saturating_add(1);
        state.file_loaded_after_last_load = false;
        state.last_event = Some("load-command-start".into());
        state.last_error = None;
        state.last_property = None;
        let generation = state.load_generation;
        drop(state);
        log_visual_mpv_event(&format!("command:load-start generation={generation}"));
        generation
    }

    fn mark_load_result(&self, generation: u64, result: Result<(), String>) {
        let mut state = self.diagnostics.write();
        if state.load_generation != generation {
            return;
        }
        match result {
            Ok(()) => {
                state.last_event = Some("load-command-complete".into());
                log_visual_mpv_event(&format!("command:load-complete generation={generation}"));
            }
            Err(error) => {
                let error = sanitize_mpv_diagnostic(&error);
                state.last_error = Some(error.clone());
                state.last_event = Some("load-command-error".into());
                log_visual_mpv_event(&format!(
                    "command:load-error generation={generation} error={error}"
                ));
            }
        }
    }

    fn backend_diagnostics(&self) -> Value {
        let state = self.diagnostics.read().clone();
        json!({
            "loadGeneration": state.load_generation,
            "eventCount": state.event_count,
            "fileLoadedCount": state.file_loaded_count,
            "videoReconfigCount": state.video_reconfig_count,
            "audioReconfigCount": state.audio_reconfig_count,
            "playbackRestartCount": state.playback_restart_count,
            "lastEvent": state.last_event,
            "lastError": state.last_error,
            "lastProperty": state.last_property,
            "lastLog": state.last_log,
            "fileLoadedAfterLastLoad": state.file_loaded_after_last_load,
        })
    }

    fn stop_event_thread(&self) {
        self.event_stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.event_thread.lock().take() {
            let _ = handle.join();
        }
    }
}

impl Drop for MpvEmbeddedBackend {
    fn drop(&mut self) {
        self.event_stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.event_thread.get_mut().take() {
            let _ = handle.join();
        }
    }
}

#[allow(dead_code)]
fn spawn_mpv_event_thread(
    mpv: &Mpv,
    diagnostics: Arc<RwLock<MpvEventDiagnostics>>,
    stop: Arc<AtomicBool>,
) -> AppResult<JoinHandle<()>> {
    let mut event_client = mpv
        .create_client(Some("hills-lite-events"))
        .map_err(|e| AppError::Mpv(format!("mpv create event client: {e}")))?;
    let _ = event_client.disable_deprecated_events();
    let _ = event_client.enable_all_events();
    for (id, name, format) in [
        (1, "duration", Format::Double),
        (2, "track-list/count", Format::Int64),
        (3, "video-codec", Format::String),
        (4, "audio-codec", Format::String),
        (5, "video-params/w", Format::Int64),
        (6, "video-params/h", Format::Int64),
        (7, "time-pos", Format::Double),
        (8, "eof-reached", Format::Flag),
    ] {
        if let Err(error) = event_client.observe_property(name, format, id) {
            tracing::warn!(
                target = "mpv",
                property = name,
                error = %error,
                "failed to observe embedded mpv property"
            );
        }
    }

    thread::Builder::new()
        .name("hills-lite-mpv-events".into())
        .spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match event_client.wait_event(0.25) {
                    Some(Ok(event)) => handle_mpv_event(&diagnostics, event),
                    Some(Err(error)) => {
                        let error = sanitize_mpv_diagnostic(&error.to_string());
                        update_mpv_diagnostics(&diagnostics, "event-error", Some(error), None);
                    }
                    None => {}
                }
            }
        })
        .map_err(|e| AppError::Mpv(format!("mpv event thread: {e}")))
}

#[allow(dead_code)]
fn handle_mpv_event(diagnostics: &Arc<RwLock<MpvEventDiagnostics>>, event: Event<'_>) {
    match event {
        Event::StartFile => update_mpv_diagnostics(diagnostics, "start-file", None, None),
        Event::FileLoaded => {
            {
                let mut state = diagnostics.write();
                state.file_loaded_count = state.file_loaded_count.saturating_add(1);
                state.file_loaded_after_last_load = true;
            }
            update_mpv_diagnostics(diagnostics, "file-loaded", None, None);
        }
        Event::EndFile(reason) => update_mpv_diagnostics(
            diagnostics,
            &format!("end-file reason={}", end_file_reason_name(reason)),
            None,
            None,
        ),
        Event::VideoReconfig => {
            {
                let mut state = diagnostics.write();
                state.video_reconfig_count = state.video_reconfig_count.saturating_add(1);
            }
            update_mpv_diagnostics(diagnostics, "video-reconfig", None, None);
        }
        Event::AudioReconfig => {
            {
                let mut state = diagnostics.write();
                state.audio_reconfig_count = state.audio_reconfig_count.saturating_add(1);
            }
            update_mpv_diagnostics(diagnostics, "audio-reconfig", None, None);
        }
        Event::PlaybackRestart => {
            {
                let mut state = diagnostics.write();
                state.playback_restart_count = state.playback_restart_count.saturating_add(1);
            }
            update_mpv_diagnostics(diagnostics, "playback-restart", None, None);
        }
        Event::Seek => update_mpv_diagnostics(diagnostics, "seek", None, None),
        Event::PropertyChange { name, change, .. } => {
            let property = format!("{name}={}", property_data_summary(change));
            update_mpv_diagnostics(diagnostics, "property-change", None, Some(property));
        }
        Event::LogMessage {
            prefix,
            level,
            text,
            ..
        } => {
            if matches!(level, "warn" | "error" | "fatal") {
                let log = format!(
                    "{}:{}:{}",
                    sanitize_mpv_diagnostic(prefix),
                    sanitize_mpv_diagnostic(level),
                    sanitize_mpv_diagnostic(text)
                );
                update_mpv_diagnostics(diagnostics, "log-message", None, Some(log));
            }
        }
        Event::QueueOverflow => update_mpv_diagnostics(
            diagnostics,
            "queue-overflow",
            Some("event queue overflow".into()),
            None,
        ),
        Event::Shutdown => update_mpv_diagnostics(diagnostics, "shutdown", None, None),
        Event::CommandReply(_)
        | Event::GetPropertyReply { .. }
        | Event::SetPropertyReply(_)
        | Event::ClientMessage(_)
        | Event::Deprecated(_) => {}
    }
}

#[allow(dead_code)]
fn update_mpv_diagnostics(
    diagnostics: &Arc<RwLock<MpvEventDiagnostics>>,
    event: &str,
    error: Option<String>,
    detail: Option<String>,
) {
    let event = sanitize_mpv_diagnostic(event);
    let detail = detail.map(|value| sanitize_mpv_diagnostic(&value));
    let mut state = diagnostics.write();
    state.event_count = state.event_count.saturating_add(1);
    state.last_event = Some(event.clone());
    if let Some(error) = error {
        state.last_error = Some(error.clone());
        log_visual_mpv_event(&format!("event:{event} error={error}"));
    } else if let Some(detail) = detail {
        if event == "log-message" {
            state.last_log = Some(detail.clone());
        } else {
            state.last_property = Some(detail.clone());
        }
        log_visual_mpv_event(&format!("event:{event} detail={detail}"));
    } else {
        log_visual_mpv_event(&format!("event:{event}"));
    }
}

#[allow(dead_code)]
fn property_data_summary(change: PropertyData<'_>) -> String {
    match change {
        PropertyData::Str(value) | PropertyData::OsdStr(value) => sanitize_mpv_diagnostic(value),
        PropertyData::Flag(value) => value.to_string(),
        PropertyData::Int64(value) => value.to_string(),
        PropertyData::Double(value) => {
            if value.is_finite() {
                format!("{value:.3}")
            } else {
                "nan".into()
            }
        }
    }
}

#[allow(dead_code)]
fn end_file_reason_name(reason: libmpv2::EndFileReason) -> &'static str {
    match reason {
        0 => "eof",
        2 => "stop",
        3 => "quit",
        4 => "error",
        5 => "redirect",
        _ => "unknown",
    }
}

fn sanitize_mpv_diagnostic(input: &str) -> String {
    let mut text = input.replace(['\r', '\n', '\t'], " ");
    if text.contains("://") {
        text = "[url]".into();
    }
    if text.len() > 180 {
        text.truncate(180);
        text.push_str("...");
    }
    text
}

pub(crate) fn log_visual_mpv_event(msg: &str) {
    if std::env::var_os("HILLS_TAURI_CDP_PORT").is_none() {
        return;
    }
    let path = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .map(std::path::PathBuf::from)
                .map(|p| p.join("AppData").join("Local"))
        })
        .unwrap_or_else(std::env::temp_dir);
    let dir = path.join("EmbyPlayer");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("visual-smoke.log");
    let when = chrono::Utc::now().to_rfc3339();
    let line = format!("{when} player mpv:{msg}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

fn mpv_f64(mpv: &Mpv, name: &str) -> Option<f64> {
    mpv.get_property::<f64>(name)
        .ok()
        .or_else(|| mpv.get_property::<i64>(name).ok().map(|v| v as f64))
        .filter(|v| v.is_finite())
}

fn mpv_i64(mpv: &Mpv, name: &str) -> Option<i64> {
    mpv.get_property::<i64>(name).ok()
}

fn mpv_bool(mpv: &Mpv, name: &str) -> Option<bool> {
    mpv.get_property::<bool>(name).ok()
}

fn mpv_string(mpv: &Mpv, name: &str) -> Option<String> {
    mpv.get_property::<String>(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn read_tracks(mpv: &Mpv) -> Vec<MpvTrackInfo> {
    let count = mpv_i64(mpv, "track-list/count").unwrap_or(0).max(0);
    (0..count)
        .filter_map(|index| {
            let prefix = format!("track-list/{index}");
            let id = mpv_i64(mpv, &format!("{prefix}/id"))?;
            let kind = match mpv_string(mpv, &format!("{prefix}/type"))?.as_str() {
                "video" => TrackKind::Video,
                "audio" => TrackKind::Audio,
                "sub" => TrackKind::Subtitle,
                _ => return None,
            };
            Some(MpvTrackInfo {
                id,
                kind,
                title: mpv_string(mpv, &format!("{prefix}/title")),
                lang: mpv_string(mpv, &format!("{prefix}/lang")),
                codec: mpv_string(mpv, &format!("{prefix}/codec")),
                external: mpv_bool(mpv, &format!("{prefix}/external")),
                default_track: mpv_bool(mpv, &format!("{prefix}/default")),
                forced: mpv_bool(mpv, &format!("{prefix}/forced")),
                selected: mpv_bool(mpv, &format!("{prefix}/selected")).unwrap_or(false),
            })
        })
        .collect()
}

fn read_chapters(mpv: &Mpv) -> Vec<MpvChapterInfo> {
    let count = mpv_i64(mpv, "chapter-list/count").unwrap_or(0).max(0);
    (0..count)
        .filter_map(|index| {
            let prefix = format!("chapter-list/{index}");
            let time = mpv_f64(mpv, &format!("{prefix}/time"))?;
            if time < 0.0 {
                return None;
            }
            Some(MpvChapterInfo {
                index,
                title: mpv_string(mpv, &format!("{prefix}/title")),
                time_ms: (time * 1000.0) as i64,
            })
        })
        .collect()
}

fn read_number_object(mpv: &Mpv, prefix: &str, keys: &[&str]) -> Option<Value> {
    let mut map = Map::new();
    for key in keys {
        if let Some(value) = mpv_f64(mpv, &format!("{prefix}/{key}")) {
            map.insert((*key).to_string(), json!(value));
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(Value::Object(map))
    }
}

fn read_audio_params(mpv: &Mpv) -> Option<Value> {
    let mut map = Map::new();
    for key in ["samplerate", "channel-count"] {
        if let Some(value) = mpv_f64(mpv, &format!("audio-params/{key}")) {
            map.insert(key.to_string(), json!(value));
        }
    }
    for key in ["channels", "hr-channels", "format"] {
        if let Some(value) = mpv_string(mpv, &format!("audio-params/{key}")) {
            map.insert(key.to_string(), json!(value));
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(Value::Object(map))
    }
}

#[async_trait]
impl MpvBackend for MpvEmbeddedBackend {
    async fn execute(&self, cmd: MpvCommand) -> AppResult<()> {
        let m = self.mpv.lock();
        match cmd {
            MpvCommand::Load {
                url,
                headers,
                user_agent,
                start_ms,
                http_seekable,
                stream_record_path,
                autoload_subtitles,
            } => {
                let load_generation = self.mark_load_start();
                m.set_property("sub-auto", if autoload_subtitles { "fuzzy" } else { "no" })
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                if let Some(ua) = user_agent {
                    m.set_property("user-agent", ua.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if !headers.is_empty() {
                    let hdr = headers
                        .iter()
                        .filter(|(key, value)| !key.trim().is_empty() && !value.trim().is_empty())
                        .map(|(k, v)| format!("{k}: {}", v.replace(['\r', '\n'], " ")))
                        .collect::<Vec<_>>()
                        .join(",");
                    m.set_property("http-header-fields", hdr.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if let Some(ms) = start_ms {
                    let s = format!("{:.3}", ms as f64 / 1000.0);
                    m.set_property("start", s.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                } else {
                    m.set_property("start", "0")
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                if let Some(rec) = stream_record_path {
                    m.set_property("stream-record", rec.as_str())
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                } else {
                    m.set_property("stream-record", "").ok();
                }
                let load_result = if http_seekable == Some(false) {
                    m.command(
                        "loadfile",
                        &[&url, "replace", "-1", "demuxer-lavf-o=seekable=0"],
                    )
                } else {
                    m.command("loadfile", &[&url, "replace"])
                };
                match load_result {
                    Ok(()) => {
                        self.mark_load_result(load_generation, Ok(()));
                        drop(m);
                        spawn_load_readiness_probe(
                            self.mpv.clone(),
                            self.diagnostics.clone(),
                            load_generation,
                        );
                        return Ok(());
                    }
                    Err(e) => {
                        self.mark_load_result(load_generation, Err(e.to_string()));
                        return Err(AppError::Mpv(e.to_string()));
                    }
                }
            }
            MpvCommand::Pause => m
                .set_property("pause", true)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Resume => m
                .set_property("pause", false)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Stop => m
                .command("stop", &[])
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::Seek { position_ms } => {
                let s = format!("{:.3}", position_ms as f64 / 1000.0);
                m.command("seek", &[s.as_str(), "absolute"])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SeekRelative { delta_ms } => {
                let s = format!("{:.3}", delta_ms as f64 / 1000.0);
                m.command("seek", &[s.as_str(), "relative+keyframes"])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetSpeed(v) => m
                .set_property("speed", v)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetVolume(v) => m
                .set_property("volume", v as i64)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetMuted(b) => m
                .set_property("mute", b)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetPictureMode(mode) => {
                let (keepaspect, panscan, zoom) = match mode {
                    PictureMode::Fit => (true, 0.0, 0.0),
                    PictureMode::Fill => (true, 1.0, 0.0),
                    PictureMode::Stretch => (false, 0.0, 0.0),
                    PictureMode::Autocrop => (true, 1.0, 0.16),
                };
                m.set_property("keepaspect", keepaspect)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("panscan", panscan)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-zoom", zoom)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-scale-x", 1.0)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-scale-y", 1.0)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("video-aspect-override", -2)
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetAudioTrack { id, preserve_cache } => {
                m.set_property("aid", id)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                drop_buffers_if_requested(&m, preserve_cache)
            }
            MpvCommand::SetSubtitleTrack { id, preserve_cache } => {
                if let Some(id) = id {
                    m.set_property("sid", id)
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                } else {
                    m.set_property("sid", "no")
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                drop_buffers_if_requested(&m, preserve_cache)
            }
            MpvCommand::SetSecondarySubtitleTrack { id } => {
                if let Some(id) = id {
                    m.set_property("secondary-sid", id)
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                    m.set_property("secondary-sub-visibility", true)
                        .map_err(|e| AppError::Mpv(e.to_string()))
                } else {
                    m.set_property("secondary-sid", "no")
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                    m.set_property("secondary-sub-visibility", false)
                        .map_err(|e| AppError::Mpv(e.to_string()))
                }
            }
            MpvCommand::AddSubtitle {
                source,
                title,
                lang,
                select,
            } => {
                let flag = if select { "select" } else { "auto" };
                let title = title.unwrap_or_default();
                let lang = lang.unwrap_or_default();
                m.command(
                    "sub-add",
                    &[source.as_str(), flag, title.as_str(), lang.as_str()],
                )
                .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::RemoveSubtitle(id) => {
                let s = id.to_string();
                m.command("sub-remove", &[s.as_str()])
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::SetSubtitleDelay(ms) => m
                .set_property("sub-delay", ms as f64 / 1000.0)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleScale(s) => m
                .set_property("sub-scale", s)
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::SetSubtitleStyle(style) => {
                m.set_property("sub-scale", style.scale)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-color", style.text_color.as_str())
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-outline-color", style.outline_color.as_str())
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-outline-size", style.outline_size)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-shadow-offset", style.shadow_offset)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                m.set_property("sub-pos", style.position_pct as i64)
                    .map_err(|e| AppError::Mpv(e.to_string()))?;
                let ass_override = if style.force_style { "force" } else { "scale" };
                m.set_property("sub-ass-override", ass_override)
                    .map_err(|e| AppError::Mpv(e.to_string()))
            }
            MpvCommand::CycleSubtitle => m
                .command("cycle", &["sub"])
                .map_err(|e| AppError::Mpv(e.to_string())),
            MpvCommand::ScreenshotToFile {
                path,
                include_subtitles,
            } => {
                let modes: &[&str] = if include_subtitles {
                    &["subtitles", "video", "window"]
                } else {
                    &["video", "window"]
                };
                let mut last_error = None;
                for mode in modes {
                    match m.command("screenshot-to-file", &[path.as_str(), mode]) {
                        Ok(_) => return Ok(()),
                        Err(error) => {
                            last_error = Some(error.to_string());
                        }
                    }
                }
                Err(AppError::Mpv(
                    last_error.unwrap_or_else(|| "screenshot failed".into()),
                ))
            }
            MpvCommand::ShowStatsOsd { page } => {
                let page = page.clamp(1, 5);
                let binding = format!("stats/display-page-{page}");
                if m.command("script-binding", &[binding.as_str()]).is_err() {
                    m.command("script-binding", &["stats/display-stats"])
                        .map_err(|e| AppError::Mpv(e.to_string()))?;
                }
                Ok(())
            }
        }
    }

    async fn snapshot(&self) -> AppResult<MpvSnapshot> {
        let m = self.mpv.lock();
        let m = &*m;
        let url = mpv_string(m, "path");
        let paused = mpv_bool(m, "pause").unwrap_or(true);
        let position = mpv_f64(m, "time-pos").unwrap_or(0.0);
        let duration = mpv_f64(m, "duration").unwrap_or(0.0);
        let speed = mpv_f64(m, "speed").unwrap_or(1.0);
        let volume = mpv_i64(m, "volume").unwrap_or(100);
        let muted = mpv_bool(m, "mute").unwrap_or(false);
        let eof = mpv_bool(m, "eof-reached").unwrap_or(false);
        let secondary_sub_id = mpv_i64(m, "secondary-sid").filter(|v| *v >= 0);
        let sub_delay = mpv_f64(m, "sub-delay").unwrap_or(0.0);
        let sub_scale = mpv_f64(m, "sub-scale").unwrap_or(1.0);
        let network_bps = mpv_f64(m, "cache-speed").filter(|v| *v >= 0.0);
        let video_codec = mpv_string(m, "video-codec");
        let audio_codec = mpv_string(m, "audio-codec");
        let hwdec_current = mpv_string(m, "hwdec-current");
        let idle_active = mpv_bool(m, "idle-active");
        let demuxer = mpv_string(m, "demuxer");
        let file_format = mpv_string(m, "file-format");
        let media_title = mpv_string(m, "media-title");
        let stream_open_filename = mpv_string(m, "stream-open-filename");
        let stream_path = mpv_string(m, "stream-path");
        let demuxer_cache_state = None;
        let playlist_count = mpv_i64(m, "playlist-count");
        let playlist_pos = mpv_i64(m, "playlist-pos");
        let container_fps = mpv_f64(m, "container-fps");
        let estimated_vf_fps = mpv_f64(m, "estimated-vf-fps");
        let video_bitrate = mpv_f64(m, "video-bitrate");
        let audio_bitrate = mpv_f64(m, "audio-bitrate");
        let frame_drop_count = mpv_f64(m, "frame-drop-count");
        let decoder_frame_drop_count = mpv_f64(m, "decoder-frame-drop-count");
        let vo_frame_drop_count = mpv_f64(m, "vo-drop-frame-count");

        Ok(MpvSnapshot {
            url,
            paused,
            position_ms: (position * 1000.0) as i64,
            duration_ms: (duration * 1000.0) as i64,
            speed,
            volume: volume as i32,
            muted,
            eof,
            tracks: read_tracks(m),
            chapters: read_chapters(m),
            chapter: mpv_i64(m, "chapter").filter(|v| *v >= 0),
            secondary_sub_id,
            sub_delay_ms: (sub_delay * 1000.0) as i64,
            sub_scale,
            network_bps,
            video_codec,
            audio_codec,
            video_params: read_number_object(
                m,
                "video-params",
                &["w", "h", "dw", "dh", "aspect", "par", "rotate"],
            ),
            video_out_params: read_number_object(
                m,
                "video-out-params",
                &["w", "h", "dw", "dh", "aspect", "par", "rotate"],
            ),
            osd_dimensions: read_number_object(
                m,
                "osd-dimensions",
                &["w", "h", "aspect", "par", "mt", "mb", "ml", "mr"],
            ),
            audio_params: read_audio_params(m),
            hwdec_current,
            idle_active,
            demuxer,
            file_format,
            media_title,
            stream_open_filename,
            stream_path,
            demuxer_cache_state,
            playlist_count,
            playlist_pos,
            keepaspect: mpv_bool(m, "keepaspect"),
            panscan: mpv_f64(m, "panscan"),
            video_zoom: mpv_f64(m, "video-zoom"),
            video_scale_x: mpv_f64(m, "video-scale-x"),
            video_scale_y: mpv_f64(m, "video-scale-y"),
            video_aspect_override: mpv_f64(m, "video-aspect-override"),
            container_fps,
            estimated_vf_fps,
            video_bitrate,
            audio_bitrate,
            frame_drop_count,
            decoder_frame_drop_count,
            vo_frame_drop_count,
            backend_diagnostics: Some(self.backend_diagnostics()),
        })
    }

    async fn shutdown(&self) -> AppResult<()> {
        self.stop_event_thread();
        {
            let m = self.mpv.lock();
            let _ = m.command("stop", &[]);
        }
        if let Some(host) = self.host.write().take() {
            let _ = host.show(false);
            host.destroy()?;
        }
        Ok(())
    }
}

fn spawn_load_readiness_probe(
    mpv: Arc<Mutex<Mpv>>,
    diagnostics: Arc<RwLock<MpvEventDiagnostics>>,
    generation: u64,
) {
    if let Err(error) = thread::Builder::new()
        .name("hills-lite-mpv-load-probe".into())
        .spawn(move || wait_for_load_readiness(mpv, diagnostics, generation))
    {
        log_visual_mpv_event(&format!(
            "load-probe-spawn-error generation={generation} error={}",
            sanitize_mpv_diagnostic(&error.to_string())
        ));
    }
}

fn wait_for_load_readiness(
    mpv: Arc<Mutex<Mpv>>,
    diagnostics: Arc<RwLock<MpvEventDiagnostics>>,
    generation: u64,
) {
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut saw_file_loaded = false;
    let mut saw_reconfig = false;
    let mut saw_container = false;
    while Instant::now() < deadline {
        {
            let mut mpv = mpv.lock();
            match mpv.wait_event(0.02) {
                Some(Ok(event)) => {
                    if matches!(event, Event::FileLoaded) {
                        saw_file_loaded = true;
                    }
                    if matches!(event, Event::VideoReconfig | Event::AudioReconfig) {
                        saw_reconfig = true;
                    }
                    handle_mpv_event(&diagnostics, event);
                }
                Some(Err(error)) => {
                    let error = sanitize_mpv_diagnostic(&error.to_string());
                    update_mpv_diagnostics(&diagnostics, "load-wait-error", Some(error), None);
                    break;
                }
                None => {}
            }

            let duration = mpv_f64(&mpv, "duration").unwrap_or(0.0);
            let tracks = mpv_i64(&mpv, "track-list/count").unwrap_or(0);
            if duration > 0.0 && tracks > 0 {
                saw_container = true;
            }
            let has_video = mpv_string(&mpv, "video-codec").is_some()
                || read_number_object(&mpv, "video-params", &["w", "h"]).is_some()
                || read_number_object(&mpv, "video-out-params", &["w", "h"]).is_some();
            if has_video {
                log_visual_mpv_event(&format!(
                    "load-ready generation={generation} duration={duration:.3} tracks={tracks} video=true file_loaded={saw_file_loaded} reconfig={saw_reconfig}"
                ));
                return;
            }
        }
        thread::sleep(Duration::from_millis(80));
    }

    let mpv = mpv.lock();
    let path_present = mpv_string(&mpv, "path").is_some();
    let demuxer = mpv_string(&mpv, "demuxer");
    let file_format = mpv_string(&mpv, "file-format");
    let eof = mpv_bool(&mpv, "eof-reached").unwrap_or(false);
    let idle = mpv_bool(&mpv, "idle-active").unwrap_or(false);
    let stream_path_present = mpv_string(&mpv, "stream-path").is_some();
    if saw_container {
        let duration = mpv_f64(&mpv, "duration").unwrap_or(0.0);
        let tracks = mpv_i64(&mpv, "track-list/count").unwrap_or(0);
        log_visual_mpv_event(&format!(
            "load-partial generation={generation} duration={duration:.3} tracks={tracks} video=false path={path_present} stream_path={stream_path_present} eof={eof} idle={idle} demuxer={} format={}",
            demuxer.unwrap_or_else(|| "none".into()),
            file_format.unwrap_or_else(|| "none".into())
        ));
    } else {
        log_visual_mpv_event(&format!(
            "load-not-ready generation={generation} path={path_present} stream_path={stream_path_present} eof={eof} idle={idle} demuxer={} format={}",
            demuxer.unwrap_or_else(|| "none".into()),
            file_format.unwrap_or_else(|| "none".into())
        ));
    }
}

// Allow the manager to bind the embedded backend without exposing constructor
// details everywhere.
pub trait EmbeddedHandle: MpvBackend {
    fn bind(&self, parent: ParentHandle) -> AppResult<()>;
    fn detach(&self) -> AppResult<()>;
}

impl EmbeddedHandle for MpvEmbeddedBackend {
    fn bind(&self, parent: ParentHandle) -> AppResult<()> {
        self.bind_window(parent)
    }

    fn detach(&self) -> AppResult<()> {
        self.detach_window()
    }
}

#[allow(dead_code)]
fn touch(_: TrackKind, _: MpvTrackInfo, _: MpvChapterInfo) {}
