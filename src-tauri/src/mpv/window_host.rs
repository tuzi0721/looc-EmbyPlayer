//! Native child-window host for the embedded mpv backend.
//!
//! Tauri's main window holds a webview. To render mpv in-window we create a
//! *native child window* (`WS_CHILD` on Windows; equivalent NSView / X11 child
//! on other platforms) and position it under the webview where the player UI
//! reserves a transparent region. mpv is then told to render into that child
//! via the `wid` property.
//!
//! The frontend tells the backend the player area rect in CSS pixels; we
//! convert that to native pixels and reposition the child accordingly.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale: f64,
}

/// Cross-platform handle to a native window we render mpv into.
pub struct HostWindow {
    #[cfg(target_os = "windows")]
    inner: windows_impl::WinHost,
    #[cfg(not(target_os = "windows"))]
    _unsupported: (),
}

impl HostWindow {
    /// Create a new native child window inside the Tauri main window.
    pub fn create_child(parent: ParentHandle) -> AppResult<Self> {
        #[cfg(target_os = "windows")]
        {
            let inner = windows_impl::WinHost::create(parent)?;
            return Ok(Self { inner });
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = parent;
            Err(crate::error::AppError::Mpv(
                "embedded MPV window currently only supported on Windows".into(),
            ))
        }
    }

    /// Native handle as a 64-bit integer suitable for mpv's `wid` property.
    pub fn wid(&self) -> i64 {
        #[cfg(target_os = "windows")]
        {
            self.inner.wid()
        }
        #[cfg(not(target_os = "windows"))]
        {
            0
        }
    }

    pub fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
        #[cfg(target_os = "windows")]
        {
            self.inner.set_rect(rect)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = rect;
            Ok(())
        }
    }

    pub fn show(&self, visible: bool) -> AppResult<()> {
        #[cfg(target_os = "windows")]
        {
            self.inner.show(visible)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = visible;
            Ok(())
        }
    }

    pub fn destroy(self) -> AppResult<()> {
        #[cfg(target_os = "windows")]
        {
            self.inner.destroy()
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ParentHandle {
    #[cfg(target_os = "windows")]
    Win32(isize),
    #[allow(dead_code)]
    Unsupported,
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{ParentHandle, PlayerRect};
    use crate::error::{AppError, AppResult};

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, BLACK_BRUSH, HBRUSH};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, SetWindowPos, ShowWindow,
        CW_USEDEFAULT, HMENU, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE,
        SW_SHOW, WINDOW_EX_STYLE, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
    };

    pub struct WinHost {
        hwnd: HWND,
    }

    // Class registration is once-per-process.
    static CLASS_REGISTERED: std::sync::Once = std::sync::Once::new();
    const CLASS_NAME: &str = "EmbyPlayerMpvHost\0";

    fn class_name_wide() -> Vec<u16> {
        CLASS_NAME.encode_utf16().collect()
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn ensure_class_registered() {
        CLASS_REGISTERED.call_once(|| {
            unsafe {
                let class_name = class_name_wide();
                let brush: HBRUSH = HBRUSH(GetStockObject(BLACK_BRUSH).0);
                let wc = WNDCLASSW {
                    style: Default::default(),
                    lpfnWndProc: Some(wnd_proc),
                    cbClsExtra: 0,
                    cbWndExtra: 0,
                    hInstance: Default::default(),
                    hIcon: Default::default(),
                    hCursor: Default::default(),
                    hbrBackground: brush,
                    lpszMenuName: PCWSTR::null(),
                    lpszClassName: PCWSTR(class_name.as_ptr()),
                };
                let _ = RegisterClassW(&wc);
            }
        });
    }

    impl WinHost {
        pub fn create(parent: ParentHandle) -> AppResult<Self> {
            ensure_class_registered();
            let parent_hwnd = match parent {
                ParentHandle::Win32(h) => HWND(h as *mut _),
                _ => return Err(AppError::Mpv("expected Win32 parent handle".into())),
            };

            let class_name = class_name_wide();
            let hwnd = unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    PCWSTR(class_name.as_ptr()),
                    PCWSTR::null(),
                    WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
                    CW_USEDEFAULT,
                    CW_USEDEFAULT,
                    640,
                    360,
                    parent_hwnd,
                    HMENU::default(),
                    HINSTANCE::default(),
                    None,
                )
            }
            .map_err(|e| AppError::Mpv(format!("CreateWindowExW: {e}")))?;

            // Keep the mpv host *behind* the WebView2 sibling so HTML controls stay
            // clickable and visible on top of the video hole.
            unsafe {
                let _ = SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE);
            }

            Ok(Self { hwnd })
        }

        pub fn wid(&self) -> i64 {
            self.hwnd.0 as i64
        }

        pub fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
            let x = (rect.x as f64 * rect.scale) as i32;
            let y = (rect.y as f64 * rect.scale) as i32;
            let w = (rect.width as f64 * rect.scale) as i32;
            let h = (rect.height as f64 * rect.scale) as i32;
            unsafe {
                SetWindowPos(
                    self.hwnd,
                    HWND_BOTTOM,
                    x,
                    y,
                    w,
                    h,
                    SWP_NOACTIVATE,
                )
            }
            .map_err(|e| AppError::Mpv(format!("SetWindowPos: {e}")))?;
            Ok(())
        }

        pub fn show(&self, visible: bool) -> AppResult<()> {
            unsafe {
                let _ = ShowWindow(self.hwnd, if visible { SW_SHOW } else { SW_HIDE });
                if visible {
                    let _ = SetWindowPos(
                        self.hwnd,
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
                    );
                }
            }
            Ok(())
        }

        pub fn destroy(self) -> AppResult<()> {
            unsafe {
                let _ = DestroyWindow(self.hwnd);
            }
            Ok(())
        }
    }

    unsafe impl Send for WinHost {}
    unsafe impl Sync for WinHost {}
}
