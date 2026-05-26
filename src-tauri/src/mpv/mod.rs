pub mod backend;
pub mod ipc;
pub mod manager;
pub mod paths;
pub mod window_host;
#[cfg(feature = "mpv-embedded")]
pub mod embedded;

pub use backend::{MpvCommand, MpvSnapshot};
pub use manager::MpvManager;
pub use window_host::{ParentHandle, PlayerRect};
