use std::collections::{HashSet, VecDeque};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::config::ConfigStore;
use crate::error::AppResult;
use crate::notifications::os_bridge;
use crate::notifications::types::{Notification, NotificationSpec};

pub const EVENT_NEW: &str = "notification:new";
pub const EVENT_DISMISS: &str = "notification:dismiss";
pub const EVENT_CLEARED: &str = "notification:cleared";
pub const EVENT_UNREAD: &str = "notification:unread";
pub const EVENT_UPDATED: &str = "notification:updated";

const MAX_KEPT: usize = 100;

/// Application-wide notification fan-out. Thread-safe & cheaply cloneable.
#[derive(Clone)]
pub struct NotificationCenter {
    inner: Arc<RwLock<VecDeque<Notification>>>,
    config: ConfigStore,
    handle: AppHandle,
}

impl NotificationCenter {
    pub fn new(config: ConfigStore, handle: AppHandle) -> Self {
        let cleared_keys: HashSet<String> =
            config.cleared_notification_keys().into_iter().collect();
        let cleared_at = config.notifications_cleared_at();
        let initial = config.notifications();
        let mut deque = VecDeque::with_capacity(MAX_KEPT.max(initial.len()));
        let mut changed = false;
        for n in initial.iter().cloned() {
            if notification_is_cleared(&n, &cleared_keys, cleared_at) {
                changed = true;
                continue;
            }
            if deque.len() == MAX_KEPT {
                deque.pop_front();
                changed = true;
            }
            deque.push_back(n);
        }
        if changed {
            let _ = config.replace_notifications(deque.iter().cloned().collect());
        }
        Self {
            inner: Arc::new(RwLock::new(deque)),
            config,
            handle,
        }
    }

    pub fn list(&self) -> Vec<Notification> {
        let g = self.inner.read();
        let mut out: Vec<Notification> = g.iter().cloned().collect();
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        out
    }

    pub fn unread(&self) -> usize {
        self.inner.read().iter().filter(|n| !n.read).count()
    }

    /// Push a new notification. Emits `notification:new` and updates unread
    /// count. Returns the materialized notification (with id / timestamp).
    pub fn push(&self, spec: NotificationSpec) -> AppResult<Notification> {
        let mut n = spec.build();
        let key = notification_key(&n);
        if key
            .as_ref()
            .is_some_and(|key| self.cleared_keys().contains(key))
        {
            return Ok(n);
        }
        {
            let mut g = self.inner.write();
            if let Some(key) = key.as_deref() {
                if let Some(existing) = g
                    .iter()
                    .find(|existing| notification_key(existing).as_deref() == Some(key))
                {
                    n.id = existing.id.clone();
                    n.read = existing.read;
                }
                g.retain(|existing| notification_key(existing).as_deref() != Some(key));
            }
            if g.len() == MAX_KEPT {
                g.pop_front();
            }
            g.push_back(n.clone());
        }
        self.persist();
        let _ = self.handle.emit(EVENT_NEW, &n);
        self.emit_unread();
        self.maybe_os_notify(&n);
        Ok(n)
    }

    pub fn dismiss(&self, id: &str) -> AppResult<()> {
        let (removed, removed_key) = {
            let mut g = self.inner.write();
            let before = g.len();
            let key = g.iter().find(|n| n.id == id).and_then(notification_key);
            g.retain(|n| n.id != id);
            (before != g.len(), key)
        };
        if removed {
            if let Some(key) = removed_key {
                self.remember_cleared_keys(vec![key])?;
            }
            self.persist();
            let _ = self.handle.emit(EVENT_DISMISS, &json!({ "id": id }));
            self.emit_unread();
        }
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        let keys = {
            let mut g = self.inner.write();
            let keys = g.iter().filter_map(notification_key).collect();
            g.clear();
            keys
        };
        self.remember_cleared_keys(keys)?;
        let _ = self.config.record_notifications_cleared();
        self.persist();
        let _ = self.handle.emit(EVENT_CLEARED, &json!({}));
        self.emit_unread();
        Ok(())
    }

    pub fn mark_all_read(&self) -> AppResult<()> {
        let any_changed = {
            let mut g = self.inner.write();
            let mut any = false;
            for n in g.iter_mut() {
                if !n.read {
                    n.read = true;
                    any = true;
                }
            }
            any
        };
        if any_changed {
            self.persist();
            let _ = self.handle.emit(EVENT_UPDATED, &json!({ "all": true }));
            self.emit_unread();
        }
        Ok(())
    }

    pub fn mark_read(&self, id: &str) -> AppResult<()> {
        let changed = {
            let mut g = self.inner.write();
            match g.iter_mut().find(|n| n.id == id) {
                Some(n) if !n.read => {
                    n.read = true;
                    true
                }
                _ => false,
            }
        };
        if changed {
            self.persist();
            let _ = self.handle.emit(EVENT_UPDATED, &json!({ "id": id }));
            self.emit_unread();
        }
        Ok(())
    }

    fn persist(&self) {
        let items: Vec<Notification> = self.inner.read().iter().cloned().collect();
        let _ = self.config.replace_notifications(items);
    }

    fn cleared_keys(&self) -> HashSet<String> {
        self.config
            .cleared_notification_keys()
            .into_iter()
            .collect()
    }

    fn remember_cleared_keys(&self, keys: Vec<String>) -> AppResult<()> {
        if keys.is_empty() {
            return Ok(());
        }
        let mut merged = self.config.cleared_notification_keys();
        merged.extend(keys);
        self.config.replace_cleared_notification_keys(merged)
    }

    fn emit_unread(&self) {
        let count = self.unread();
        let _ = self.handle.emit(EVENT_UNREAD, &json!({ "unread": count }));
    }

    fn maybe_os_notify(&self, n: &Notification) {
        os_bridge::maybe_notify(&self.handle, n);
    }
}

fn notification_key(n: &Notification) -> Option<String> {
    let source_id = n.source_id.as_deref()?.trim();
    let title = n.title.trim();
    if source_id.is_empty() || title.is_empty() {
        return None;
    }
    let action_kind = n
        .action
        .as_ref()
        .map(|action| action.kind.trim())
        .unwrap_or("");
    Some(format!(
        "{}\0{}\0{}\0{}\0{}",
        category_key(n.category),
        source_id,
        kind_key(n.kind),
        title,
        action_kind
    ))
}

fn notification_is_cleared(
    n: &Notification,
    cleared_keys: &HashSet<String>,
    cleared_at: Option<DateTime<Utc>>,
) -> bool {
    if notification_key(n).is_some_and(|key| cleared_keys.contains(&key)) {
        return true;
    }
    cleared_at.is_some_and(|cleared_at| n.created_at <= cleared_at)
}

fn category_key(category: crate::notifications::types::NotificationCategory) -> &'static str {
    match category {
        crate::notifications::types::NotificationCategory::Download => "download",
        crate::notifications::types::NotificationCategory::Server => "server",
        crate::notifications::types::NotificationCategory::Auth => "auth",
        crate::notifications::types::NotificationCategory::System => "system",
    }
}

fn kind_key(kind: crate::notifications::types::NotificationKind) -> &'static str {
    match kind {
        crate::notifications::types::NotificationKind::Info => "info",
        crate::notifications::types::NotificationKind::Success => "success",
        crate::notifications::types::NotificationKind::Warning => "warning",
        crate::notifications::types::NotificationKind::Error => "error",
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};

    use super::*;
    use crate::notifications::types::{NotificationCategory, NotificationKind, NotificationSpec};

    #[test]
    fn cleared_timestamp_filters_sourceless_notifications() {
        let cleared_at = Utc::now();
        let mut notification = NotificationSpec::new(
            NotificationKind::Info,
            NotificationCategory::System,
            "Remote message",
        )
        .build();
        notification.created_at = cleared_at - Duration::seconds(1);

        assert!(notification_is_cleared(
            &notification,
            &HashSet::new(),
            Some(cleared_at),
        ));
    }

    #[test]
    fn cleared_key_filters_newer_repeat_notifications() {
        let notification = NotificationSpec::new(
            NotificationKind::Error,
            NotificationCategory::Server,
            "Line down",
        )
        .source("server-a")
        .build();
        let key = notification_key(&notification).expect("source notification has key");
        let cleared_keys = HashSet::from([key]);

        assert!(notification_is_cleared(&notification, &cleared_keys, None));
    }
}
