//! Windows SMTC (System Media Transport Controls) backend.
//!
//! Bound to the main HWND via `ISystemMediaTransportControlsInterop`. We
//! translate `ButtonPressed` events into the same `shortcut:trigger` Tauri
//! event consumed by the global-shortcut frontend listener, so media-key
//! handling stays centralized.

use tauri::{AppHandle, Emitter, Manager};
use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsDisplayUpdater, SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::Foundation::HWND as WinHWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

use crate::error::{AppError, AppResult};
use crate::system_media::{NowPlayingInfo, PlaybackStatus};

pub struct WindowsSmtc {
    controls: SystemMediaTransportControls,
}

// SystemMediaTransportControls is COM-agile; manual marker for clarity.
unsafe impl Send for WindowsSmtc {}
unsafe impl Sync for WindowsSmtc {}

impl WindowsSmtc {
    pub fn new(handle: AppHandle) -> AppResult<Self> {
        let window = handle
            .get_webview_window("main")
            .ok_or_else(|| AppError::Other("smtc: main window not found".into()))?;
        let hwnd = window
            .hwnd()
            .map_err(|e| AppError::Other(format!("smtc hwnd: {e}")))?;

        let interop: ISystemMediaTransportControlsInterop = windows::core::factory::<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop,
        >()
        .map_err(|e| AppError::Other(format!("smtc factory: {e}")))?;
        // Tauri bundles a different `windows` crate version; convert via raw pointer.
        let win_hwnd = WinHWND(hwnd.0);
        let controls: SystemMediaTransportControls = unsafe {
            interop
                .GetForWindow(win_hwnd)
                .map_err(|e| AppError::Other(format!("smtc GetForWindow: {e}")))?
        };

        controls
            .SetIsEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc IsEnabled: {e}")))?;
        controls
            .SetIsPlayEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc PlayEnabled: {e}")))?;
        controls
            .SetIsPauseEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc PauseEnabled: {e}")))?;
        controls
            .SetIsStopEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc StopEnabled: {e}")))?;
        controls
            .SetIsNextEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc NextEnabled: {e}")))?;
        controls
            .SetIsPreviousEnabled(true)
            .map_err(|e| AppError::Other(format!("smtc PrevEnabled: {e}")))?;
        controls
            .SetPlaybackStatus(MediaPlaybackStatus::Closed)
            .map_err(|e| AppError::Other(format!("smtc PlaybackStatus: {e}")))?;

        // Wire ButtonPressed → shortcut:trigger so the same listener handles
        // both keyboard accelerators and SMTC button presses.
        let handler_handle = handle.clone();
        let token = controls
            .ButtonPressed(&TypedEventHandler::new(
                move |_sender: &Option<SystemMediaTransportControls>,
                      args: &Option<SystemMediaTransportControlsButtonPressedEventArgs>| {
                    if let Some(args) = args.as_ref() {
                        if let Ok(btn) = args.Button() {
                            let action = match btn {
                                SystemMediaTransportControlsButton::Play => "play_pause",
                                SystemMediaTransportControlsButton::Pause => "play_pause",
                                SystemMediaTransportControlsButton::Stop => "stop",
                                SystemMediaTransportControlsButton::Next => "next_track",
                                SystemMediaTransportControlsButton::Previous => "prev_track",
                                _ => return Ok(()),
                            };
                            let _ = handler_handle.emit("shortcut:trigger", action);
                        }
                    }
                    Ok(())
                },
            ))
            .map_err(|e| AppError::Other(format!("smtc ButtonPressed: {e}")))?;
        let _ = token; // Lives for the duration of `controls`.

        Ok(Self { controls })
    }

    pub fn update_metadata(&self, info: &NowPlayingInfo) -> AppResult<()> {
        let updater: SystemMediaTransportControlsDisplayUpdater = self
            .controls
            .DisplayUpdater()
            .map_err(|e| AppError::Other(format!("smtc DisplayUpdater: {e}")))?;
        updater
            .SetType(MediaPlaybackType::Video)
            .map_err(|e| AppError::Other(format!("smtc Type: {e}")))?;
        let video = updater
            .VideoProperties()
            .map_err(|e| AppError::Other(format!("smtc VideoProperties: {e}")))?;
        video
            .SetTitle(&HSTRING::from(info.title.as_str()))
            .map_err(|e| AppError::Other(format!("smtc SetTitle: {e}")))?;
        if let Some(subtitle) = info.subtitle.as_deref() {
            video
                .SetSubtitle(&HSTRING::from(subtitle))
                .map_err(|e| AppError::Other(format!("smtc SetSubtitle: {e}")))?;
        }
        if let Some(thumb) = info.thumbnail_url.as_deref() {
            if let Ok(uri) = Uri::CreateUri(&HSTRING::from(thumb)) {
                if let Ok(stream) = RandomAccessStreamReference::CreateFromUri(&uri) {
                    let _ = updater.SetThumbnail(&stream);
                }
            }
        }
        updater
            .Update()
            .map_err(|e| AppError::Other(format!("smtc Update: {e}")))?;
        Ok(())
    }

    pub fn update_playback(&self, status: PlaybackStatus) -> AppResult<()> {
        let mapped = match status {
            PlaybackStatus::Playing => MediaPlaybackStatus::Playing,
            PlaybackStatus::Paused => MediaPlaybackStatus::Paused,
            PlaybackStatus::Stopped => MediaPlaybackStatus::Stopped,
        };
        self.controls
            .SetPlaybackStatus(mapped)
            .map_err(|e| AppError::Other(format!("smtc SetPlaybackStatus: {e}")))?;
        Ok(())
    }

    pub fn update_position(&self, position_ms: i64, duration_ms: i64) -> AppResult<()> {
        let props = SystemMediaTransportControlsTimelineProperties::new()
            .map_err(|e| AppError::Other(format!("smtc TimelineProps: {e}")))?;
        let zero = ms_to_timespan(0);
        let pos = ms_to_timespan(position_ms);
        let dur = ms_to_timespan(duration_ms);
        props
            .SetStartTime(zero)
            .map_err(|e| AppError::Other(format!("smtc StartTime: {e}")))?;
        props
            .SetMinSeekTime(zero)
            .map_err(|e| AppError::Other(format!("smtc MinSeek: {e}")))?;
        props
            .SetEndTime(dur)
            .map_err(|e| AppError::Other(format!("smtc EndTime: {e}")))?;
        props
            .SetMaxSeekTime(dur)
            .map_err(|e| AppError::Other(format!("smtc MaxSeek: {e}")))?;
        props
            .SetPosition(pos)
            .map_err(|e| AppError::Other(format!("smtc Position: {e}")))?;
        self.controls
            .UpdateTimelineProperties(&props)
            .map_err(|e| AppError::Other(format!("smtc UpdateTimeline: {e}")))?;
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        let updater = self
            .controls
            .DisplayUpdater()
            .map_err(|e| AppError::Other(format!("smtc DisplayUpdater: {e}")))?;
        updater
            .ClearAll()
            .map_err(|e| AppError::Other(format!("smtc ClearAll: {e}")))?;
        updater
            .Update()
            .map_err(|e| AppError::Other(format!("smtc Update: {e}")))?;
        self.controls
            .SetPlaybackStatus(MediaPlaybackStatus::Closed)
            .map_err(|e| AppError::Other(format!("smtc Closed: {e}")))?;
        Ok(())
    }
}

fn ms_to_timespan(ms: i64) -> TimeSpan {
    // TimeSpan in WinRT is in 100ns units (same as .NET Ticks). 1 ms = 10_000.
    TimeSpan {
        Duration: ms.saturating_mul(10_000),
    }
}
