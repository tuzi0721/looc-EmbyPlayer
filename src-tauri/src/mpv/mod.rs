pub mod backend;
#[cfg(feature = "mpv-embedded")]
pub mod embedded;
pub mod ipc;
pub mod manager;
pub mod paths;
pub mod standalone;
pub mod window_host;

pub use backend::{
    parse_reporter_event, MpvCommand, MpvReporterEvent, MpvSnapshot, PictureMode, SubtitleStyle,
};
pub use manager::MpvManager;
pub use standalone::{StandalonePlayer, StandaloneStartRequest};
pub use window_host::{ParentHandle, PlayerRect};
