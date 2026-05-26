use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DanmakuMode {
    Scroll,
    Top,
    Bottom,
    Reverse,
}

impl Default for DanmakuMode {
    fn default() -> Self {
        Self::Scroll
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuComment {
    /// Time in seconds from the start of the media.
    pub time: f64,
    pub mode: DanmakuMode,
    /// CSS-style hex color (e.g. `#ffffff`).
    pub color: String,
    pub text: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuResult {
    pub provider: String,
    pub episode_id: String,
    pub comments: Vec<DanmakuComment>,
}
