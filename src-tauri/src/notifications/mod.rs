//! Notification center.
//!
//! See `docs/NOTIFICATION_CENTER_PLAN.md` for the full design.
//!
//! Components:
//! - [`types`] — `Notification`, `NotificationSpec`, `NotificationKind`,
//!   `NotificationCategory`, `NotificationAction`.
//! - [`center::NotificationCenter`] — thread-safe ring buffer (100 entries)
//!   that also persists to `tauri-plugin-store` and emits Tauri events.
//!
//! Hook points (wired progressively, see plan):
//! - DownloadEngine (Completed / Failed / Cancelled / persistent retries)
//! - HealthScheduler (auto failover / all lines down)
//! - Auth (token expired)

pub mod center;
pub mod os_bridge;
pub mod types;

pub use center::NotificationCenter;
pub use types::{
    Notification, NotificationAction, NotificationCategory, NotificationKind, NotificationSpec,
};
