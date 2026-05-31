pub mod backend;
#[cfg(feature = "mpv-embedded")]
pub mod embedded;
pub mod ipc;
pub mod manager;
pub mod paths;
pub mod window_host;

pub use backend::{MpvCommand, MpvSnapshot, PictureMode, SubtitleStyle};
pub use manager::MpvManager;
pub use window_host::{ParentHandle, PlayerRect};
