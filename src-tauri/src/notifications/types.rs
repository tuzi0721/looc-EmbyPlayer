use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Info,
    Success,
    Warning,
    Error,
}

impl Default for NotificationKind {
    fn default() -> Self {
        Self::Info
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationCategory {
    Download,
    Server,
    Auth,
    System,
}

impl Default for NotificationCategory {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    /// e.g. "navigate" | "open-task" | "retry"
    pub kind: String,
    pub label: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub kind: NotificationKind,
    pub category: NotificationCategory,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub action: Option<NotificationAction>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub read: bool,
    #[serde(default)]
    pub sticky: bool,
    #[serde(default)]
    pub source_id: Option<String>,
}

/// Builder helper used by emitters that want to push a notification without
/// caring about ids / timestamps.
#[derive(Debug, Clone, Default)]
pub struct NotificationSpec {
    pub kind: NotificationKind,
    pub category: NotificationCategory,
    pub title: String,
    pub body: Option<String>,
    pub action: Option<NotificationAction>,
    pub sticky: bool,
    pub source_id: Option<String>,
}

impl NotificationSpec {
    pub fn new(
        kind: NotificationKind,
        category: NotificationCategory,
        title: impl Into<String>,
    ) -> Self {
        Self {
            kind,
            category,
            title: title.into(),
            ..Self::default()
        }
    }

    pub fn body(mut self, body: impl Into<String>) -> Self {
        self.body = Some(body.into());
        self
    }

    pub fn action(mut self, action: NotificationAction) -> Self {
        self.action = Some(action);
        self
    }

    pub fn sticky(mut self) -> Self {
        self.sticky = true;
        self
    }

    pub fn source(mut self, id: impl Into<String>) -> Self {
        self.source_id = Some(id.into());
        self
    }

    pub fn build(self) -> Notification {
        Notification {
            id: Uuid::new_v4().to_string(),
            kind: self.kind,
            category: self.category,
            title: self.title,
            body: self.body,
            action: self.action,
            created_at: Utc::now(),
            read: false,
            sticky: self.sticky,
            source_id: self.source_id,
        }
    }
}
