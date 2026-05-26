use serde::{Serialize, Serializer};
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("url parse error: {0}")]
    Url(#[from] url::ParseError),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("store error: {0}")]
    Store(String),

    #[error("authentication failed: {0}")]
    Auth(String),

    #[error("no available line for server {0}")]
    NoLine(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid state: {0}")]
    InvalidState(String),

    #[error("mpv error: {0}")]
    Mpv(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(value: anyhow::Error) -> Self {
        AppError::Other(value.to_string())
    }
}

impl From<tauri_plugin_store::Error> for AppError {
    fn from(value: tauri_plugin_store::Error) -> Self {
        AppError::Store(value.to_string())
    }
}
