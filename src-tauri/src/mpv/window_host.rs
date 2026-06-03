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

    pub fn handle(&self) -> i64 {
        self.wid()
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

    pub fn destroy(&self) -> AppResult<()> {
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

    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    };
    use std::thread::{self, JoinHandle};
    use std::time::Duration;

    use parking_lot::Mutex;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetStockObject, UpdateWindow, BLACK_BRUSH, HBRUSH};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW,
        RegisterClassW, SetWindowPos, ShowWindow, TranslateMessage, CW_USEDEFAULT, HMENU,
        HWND_BOTTOM, HWND_TOP, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, WINDOW_EX_STYLE, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN,
        WS_CLIPSIBLINGS,
    };

    pub struct WinHost {
        hwnd: isize,
        tx: Mutex<Option<mpsc::Sender<HostRequest>>>,
        thread: Mutex<Option<JoinHandle<()>>>,
        destroyed: AtomicBool,
    }

    // Class registration is once-per-process.
    static CLASS_REGISTERED: std::sync::Once = std::sync::Once::new();
    const CLASS_NAME: &str = "EmbyPlayerMpvHost\0";
    const HOST_READY_TIMEOUT: Duration = Duration::from_secs(4);
    const HOST_COMMAND_TIMEOUT: Duration = Duration::from_millis(1200);
    const HOST_DESTROY_TIMEOUT: Duration = Duration::from_millis(1200);
    const WM_NCHITTEST: u32 = 0x0084;
    const HTTRANSPARENT: isize = -1;

    enum HostRequest {
        Rect(PlayerRect, mpsc::Sender<Result<(), String>>),
        Show(bool, mpsc::Sender<Result<(), String>>),
        Destroy(mpsc::Sender<Result<(), String>>),
    }

    fn class_name_wide() -> Vec<u16> {
        CLASS_NAME.encode_utf16().collect()
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_NCHITTEST {
            return LRESULT(HTTRANSPARENT);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn ensure_class_registered() {
        CLASS_REGISTERED.call_once(|| unsafe {
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
        });
    }

    impl WinHost {
        pub fn create(parent: ParentHandle) -> AppResult<Self> {
            let parent_hwnd = match parent {
                ParentHandle::Win32(h) => h,
                _ => return Err(AppError::Mpv("expected Win32 parent handle".into())),
            };

            let (tx, rx) = mpsc::channel::<HostRequest>();
            let (ready_tx, ready_rx) = mpsc::channel::<Result<isize, String>>();
            let thread = thread::Builder::new()
                .name("hills-mpv-host-window".into())
                .spawn(move || host_thread(parent_hwnd, rx, ready_tx))
                .map_err(|e| AppError::Mpv(format!("spawn host window thread: {e}")))?;
            let hwnd = ready_rx
                .recv_timeout(HOST_READY_TIMEOUT)
                .map_err(|_| AppError::Mpv("host window thread did not become ready".into()))?
                .map_err(|e| AppError::Mpv(format!("host window create: {e}")))?;

            Ok(Self {
                hwnd,
                tx: Mutex::new(Some(tx)),
                thread: Mutex::new(Some(thread)),
                destroyed: AtomicBool::new(false),
            })
        }

        pub fn wid(&self) -> i64 {
            self.hwnd as i64
        }

        pub fn set_rect(&self, rect: PlayerRect) -> AppResult<()> {
            self.send_host_request(HOST_COMMAND_TIMEOUT, move |ack| {
                HostRequest::Rect(rect, ack)
            })
        }

        pub fn show(&self, visible: bool) -> AppResult<()> {
            self.send_host_request(HOST_COMMAND_TIMEOUT, move |ack| {
                HostRequest::Show(visible, ack)
            })
        }

        pub fn destroy(&self) -> AppResult<()> {
            if self.destroyed.swap(true, Ordering::SeqCst) {
                return Ok(());
            }

            let tx = self.tx.lock().take();
            if let Some(tx) = tx {
                let (ack_tx, ack_rx) = mpsc::channel();
                tx.send(HostRequest::Destroy(ack_tx))
                    .map_err(|e| AppError::Mpv(format!("host window destroy send: {e}")))?;
                ack_rx
                    .recv_timeout(HOST_DESTROY_TIMEOUT)
                    .map_err(|_| AppError::Mpv("host window destroy timed out".into()))?
                    .map_err(AppError::Mpv)?;
            }

            if let Some(thread) = self.thread.lock().take() {
                let _ = thread.join();
            }
            Ok(())
        }

        fn send_host_request<F>(&self, timeout: Duration, build: F) -> AppResult<()>
        where
            F: FnOnce(mpsc::Sender<Result<(), String>>) -> HostRequest,
        {
            if self.destroyed.load(Ordering::SeqCst) {
                return Ok(());
            }
            let tx = self
                .tx
                .lock()
                .as_ref()
                .cloned()
                .ok_or_else(|| AppError::Mpv("host window is not available".into()))?;
            let (ack_tx, ack_rx) = mpsc::channel();
            tx.send(build(ack_tx))
                .map_err(|e| AppError::Mpv(format!("host window command send: {e}")))?;
            ack_rx
                .recv_timeout(timeout)
                .map_err(|_| AppError::Mpv("host window command timed out".into()))?
                .map_err(AppError::Mpv)
        }
    }

    impl Drop for WinHost {
        fn drop(&mut self) {
            let _ = self.destroy();
        }
    }

    fn host_thread(
        parent_hwnd: isize,
        rx: mpsc::Receiver<HostRequest>,
        ready_tx: mpsc::Sender<Result<isize, String>>,
    ) {
        let hwnd = match create_host_window(parent_hwnd) {
            Ok(hwnd) => hwnd,
            Err(e) => {
                let _ = ready_tx.send(Err(e));
                return;
            }
        };

        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
            let _ = SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
            );
        }

        let _ = ready_tx.send(Ok(hwnd.0 as isize));
        run_message_loop(hwnd, rx);
        unsafe {
            let _ = DestroyWindow(hwnd);
        }
    }

    fn create_host_window(parent_hwnd: isize) -> Result<HWND, String> {
        ensure_class_registered();
        let parent_hwnd = HWND(parent_hwnd as *mut _);
        let class_name = class_name_wide();
        unsafe {
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
        .map_err(|e| format!("CreateWindowExW: {e}"))
    }

    fn run_message_loop(hwnd: HWND, rx: mpsc::Receiver<HostRequest>) {
        let mut running = true;
        let mut visible = false;
        while running {
            pump_messages();
            while let Ok(command) = rx.try_recv() {
                match command {
                    HostRequest::Rect(rect, ack) => {
                        let _ = ack.send(apply_rect(hwnd, rect, visible));
                    }
                    HostRequest::Show(next_visible, ack) => {
                        visible = next_visible;
                        let _ = ack.send(apply_visible(hwnd, visible));
                    }
                    HostRequest::Destroy(ack) => {
                        running = false;
                        let _ = ack.send(Ok(()));
                    }
                }
            }
            thread::sleep(Duration::from_millis(8));
        }
    }

    fn pump_messages() {
        unsafe {
            let mut message = MSG::default();
            while PeekMessageW(&mut message, HWND::default(), 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }

    fn scaled_rect(rect: PlayerRect) -> (i32, i32, i32, i32) {
        let scale = if rect.scale.is_finite() && rect.scale > 0.0 {
            rect.scale
        } else {
            1.0
        };
        let x = (rect.x as f64 * scale).round() as i32;
        let y = (rect.y as f64 * scale).round() as i32;
        let w = (rect.width as f64 * scale).round().max(1.0) as i32;
        let h = (rect.height as f64 * scale).round().max(1.0) as i32;
        (x, y, w, h)
    }

    fn apply_rect(hwnd: HWND, rect: PlayerRect, visible: bool) -> Result<(), String> {
        let (x, y, w, h) = scaled_rect(rect);
        let flags = if visible {
            SWP_NOACTIVATE | SWP_SHOWWINDOW
        } else {
            SWP_NOACTIVATE
        };
        unsafe {
            SetWindowPos(hwnd, HWND_TOP, x, y, w, h, flags)
                .map_err(|e| format!("SetWindowPos: {e}"))?;
            if visible {
                let _ = UpdateWindow(hwnd);
            }
        }
        Ok(())
    }

    fn apply_visible(hwnd: HWND, visible: bool) -> Result<(), String> {
        unsafe {
            let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
            if visible {
                SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                )
                .map_err(|e| format!("SetWindowPos: {e}"))?;
                let _ = UpdateWindow(hwnd);
            }
        }
        Ok(())
    }

    unsafe impl Send for WinHost {}
    unsafe impl Sync for WinHost {}
}
